// cloudfunctions/order/index.js
// 订单主流程：创建、列表、详情、取消、确认收货，以及未支付订单的超时关单。
//
// 安全与一致性要点：
// 1. 下单金额全部由服务端按数据库现值重算，前端提交的金额一律不采信；
// 2. 库存与限量编号在数据库事务内扣减与分配，避免并发超卖与编号重号；
// 3. 所有读写都限定在 openid 归属范围内，他人订单一律不可见。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const https = require('https')

/** 运费规则：单笔商品总额满 299 元免运费，否则收取 12 元 */
const FREIGHT_FEE = 1200
const FREE_FREIGHT_THRESHOLD = 29900

/** 未支付订单有效分钟数 */
const PAY_EXPIRE_MINUTES = 15

/**
 * 物流轨迹查询配置（第三方快递查询服务）。
 *
 * 快递轨迹需调用第三方接口（如快递 100 / 快递鸟），属账号级外部资源。
 * 采用「配置门控 + 优雅降级」：
 *   - 未配置 EXPRESS_CUSTOMER_CODE / EXPRESS_API_KEY 时，直接返回「轨迹暂不可用」，
 *     不报错、不阻塞订单流程；前端显示快递单号并引导用户复制后到快递官网查询。
 *   - 配置后自动对接，返回标准化轨迹节点。
 *
 * 字段说明：
 *   EXPRESS_CUSTOMER_CODE —— 第三方分配的客户编码
 *   EXPRESS_API_KEY       —— 第三方分配的密钥
 *   EXPRESS_API_URL       —— 查询接口地址，默认快递 100 单号识别自动匹配
 */
const EXPRESS_CUSTOMER_CODE = process.env.EXPRESS_CUSTOMER_CODE || ''
const EXPRESS_API_KEY = process.env.EXPRESS_API_KEY || ''
const EXPRESS_API_URL =
  process.env.EXPRESS_API_URL || 'https://poll.kuaidi100.com/poll/query.do'

/**
 * 售后子状态，挂在 orders.afterSale.status 上。
 * 订单主状态 status=4（售后中）只表达「进入售后流程」，
 * 售后推进到哪一步由本字段刻画，二者解耦避免主状态膨胀。
 */
const AFTER_SALE_STATUS = {
  PENDING: 0, // 待商家处理
  REFUNDING: 1, // 商家已同意，退款处理中
  REFUNDED: 2, // 退款成功（终态）
  REJECTED: 3, // 商家已拒绝（终态，订单回退）
  CLOSED: 4 // 用户撤销申请（终态，订单回退）
}

/** 售后诉求类型 */
const AFTER_SALE_TYPES = ['refund', 'returnRefund', 'exchange']

/** 售后原因分类，与前端 after-sale 弹层选项保持一致 */
const AFTER_SALE_REASONS = ['quality', 'damaged', 'wrong', 'notAsDescribed', 'other']

/**
 * 售后可申请的订单主状态。
 * 待收货（2）与已完成（3）均可发起；待发货（1）尚未收到货，引导用户直接取消或联系客服。
 */
const AFTER_SALE_APPLIABLE = [2, 3]

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/**
 * 生成订单号：D + 年月日时分秒 + 4 位随机
 * 加 D 前缀用于支付回调时区分订单类型
 */
function buildOrderNo() {
  const d = new Date()
  const p = (n) => (n < 10 ? `0${n}` : String(n))
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `D${stamp}${rand}`
}

/**
 * 从用户地址簿取地址快照
 * @returns {object|null}
 */
async function getAddressSnapshot(openid, addressId) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  const user = res.data[0]
  if (!user || !Array.isArray(user.addressList)) return null
  const addr = user.addressList.find((item) => item.id === addressId)
  if (!addr) return null
  return {
    name: addr.name,
    phone: addr.phone,
    region: addr.region,
    regionText: (addr.region || []).join(' '),
    detail: addr.detail
  }
}

/**
 * 创建订单
 * 入参：{ goodsList: [{ productId, count, spec }], addressId, remark }
 * 返回：{ orderNo, orderId, payAmount, totalPrice, freight }
 */
async function create(openid, event) {
  const goodsList = Array.isArray(event.goodsList) ? event.goodsList : []
  if (goodsList.length === 0) return fail(400, '订单中没有商品')
  if (goodsList.length > 20) return fail(400, '单笔订单商品种类不能超过 20 种')

  const address = await getAddressSnapshot(openid, event.addressId)
  if (!address) return fail(400, '收货地址不存在，请重新选择')

  const remark = String(event.remark || '').slice(0, 100)

  const transaction = await db.startTransaction()
  try {
    const orderGoods = []
    let totalPrice = 0

    for (const item of goodsList) {
      const productId = item.productId
      const count = Math.floor(Number(item.count) || 0)
      if (!productId || count <= 0) {
        await transaction.rollback()
        return fail(400, '商品信息不完整')
      }

      // 事务内读取，读到的是同一快照，避免并发下重复扣减
      let productRes
      try {
        productRes = await transaction.collection('products').doc(productId).get()
      } catch (e) {
        await transaction.rollback()
        return fail(404, '部分商品已下架，请返回刷新')
      }
      const product = productRes.data
      if (!product || product.status !== 1) {
        await transaction.rollback()
        return fail(404, '部分商品已下架，请返回刷新')
      }

      // 限量预售商品限购一件，保证编号一一对应
      if (product.type === 1 && count !== 1) {
        await transaction.rollback()
        return fail(400, `「${product.name}」为限量商品，每单限购 1 件`)
      }

      const stock = Number(product.stock) || 0
      if (stock < count) {
        await transaction.rollback()
        return fail(409, `「${product.name}」库存不足，仅剩 ${stock} 件`)
      }

      // 限量编号：以已售数为基准顺延，编号不超过限量总数
      let limitNo = 0
      if (product.type === 1 && Number(product.limitNum) > 0) {
        const next = (Number(product.soldCount) || 0) + 1
        if (next > Number(product.limitNum)) {
          await transaction.rollback()
          return fail(409, `「${product.name}」限量名额已售罄`)
        }
        limitNo = next
      }

      const price = Number(product.price) || 0
      totalPrice += price * count

      orderGoods.push({
        productId,
        name: product.name,
        image: (product.images && product.images[0]) || '',
        price,
        count,
        spec: item.spec || '',
        type: product.type,
        limitNo
      })

      await transaction.collection('products').doc(productId).update({
        data: {
          stock: _.inc(-count),
          soldCount: _.inc(count),
          updateTime: new Date()
        }
      })
    }

    const freight = totalPrice >= FREE_FREIGHT_THRESHOLD ? 0 : FREIGHT_FEE
    const payAmount = totalPrice + freight
    const now = new Date()
    const orderNo = buildOrderNo()

    const addRes = await transaction.collection('orders').add({
      data: {
        orderNo,
        userId: openid,
        goodsList: orderGoods,
        totalPrice,
        freight,
        payAmount,
        status: 0,
        address,
        remark,
        payTime: null,
        deliverTime: null,
        receiveTime: null,
        expressCompany: '',
        expressNo: '',
        transactionId: '',
        createTime: now,
        updateTime: now
      }
    })

    await transaction.commit()

    return ok({
      orderNo,
      orderId: addRes.id,
      totalPrice,
      freight,
      payAmount
    })
  } catch (err) {
    try {
      await transaction.rollback()
    } catch (e) {
      // 事务可能已因异常自动结束，忽略重复回滚
    }
    console.error('[order] 创建订单失败', err)
    return fail(500, '下单失败，请稍后重试')
  }
}

/**
 * 订单列表
 * 入参：{ status?, page? }
 * 返回：{ list, hasMore, total }
 */
async function list(openid, event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = 10
  const where = { userId: openid }

  if (event.status !== undefined && event.status !== null && event.status !== '') {
    where.status = Number(event.status)
  }

  const [listRes, countRes] = await Promise.all([
    db
      .collection('orders')
      .where(where)
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection('orders').where(where).count()
  ])

  return ok({
    list: listRes.data,
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  })
}

/**
 * 订单详情
 * 入参：{ orderId } 或 { orderNo }
 */
async function detail(openid, event) {
  let order = null

  if (event.orderId) {
    const res = await db.collection('orders').doc(event.orderId).get()
    order = res.data
  } else if (event.orderNo) {
    const res = await db.collection('orders').where({ orderNo: event.orderNo }).limit(1).get()
    order = res.data[0]
  }

  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权查看该订单')

  return ok(order)
}

/**
 * 取消订单：仅待付款状态可取消，取消后回收库存与限量名额
 * 入参：{ orderId }
 */
async function cancel(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const transaction = await db.startTransaction()
  try {
    const res = await transaction.collection('orders').doc(orderId).get()
    const order = res.data
    if (!order) {
      await transaction.rollback()
      return fail(404, '订单不存在')
    }
    if (order.userId !== openid) {
      await transaction.rollback()
      return fail(403, '无权操作该订单')
    }
    if (order.status !== 0) {
      await transaction.rollback()
      return fail(409, '当前状态不可取消')
    }

    for (const goods of order.goodsList || []) {
      await transaction.collection('products').doc(goods.productId).update({
        data: {
          stock: _.inc(goods.count),
          soldCount: _.inc(-goods.count),
          updateTime: new Date()
        }
      })
    }

    await transaction.collection('orders').doc(orderId).update({
      data: { status: -1, updateTime: new Date() }
    })

    await transaction.commit()
    return ok({ orderId, status: -1 })
  } catch (err) {
    try {
      await transaction.rollback()
    } catch (e) {}
    console.error('[order] 取消订单失败', err)
    return fail(500, '取消失败，请稍后重试')
  }
}

/**
 * 物流轨迹查询
 * 入参：{ orderId }
 * 返回：{ available, company, no, traces }
 *  - available:false 表示轨迹服务未配置或暂不可用，前端引导复制单号自行查询
 *  - available:true 时 traces 为时间倒序轨迹节点 [{ time, desc }]
 *
 * 降级策略：仅当订单已发货（有 expressNo）才查；未配置第三方密钥时直接返回不可用，
 * 不报错、不阻塞订单流程。
 */
async function traceExpress(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权查看该订单')

  const company = order.expressCompany || ''
  const no = order.expressNo || ''
  if (!no) return fail(409, '订单尚未发货，暂无物流信息')

  // 未配置第三方密钥：返回「轨迹暂不可用」，让前端降级展示
  if (!EXPRESS_CUSTOMER_CODE || !EXPRESS_API_KEY) {
    return ok({ available: false, company, no, traces: [] })
  }

  try {
    const payload = JSON.stringify({
      customer: EXPRESS_CUSTOMER_CODE,
      key: EXPRESS_API_KEY,
      com: mapExpressCompany(company),
      num: no,
      show: '0',
      order: 'desc'
    })

    const data = await httpPost(EXPRESS_API_URL, payload)
    let parsed = {}
    try {
      parsed = JSON.parse(data)
    } catch (e) {
      parsed = {}
    }

    const list = Array.isArray(parsed.data) ? parsed.data : []
    const traces = list.map((t) => ({
      time: t.time || '',
      desc: t.context || ''
    }))

    return ok({ available: true, company, no, traces })
  } catch (err) {
    // 接口超时/异常不阻断订单流程，降级为「暂不可用」
    console.warn('[order] 物流轨迹查询失败', order.orderNo, err)
    return ok({ available: false, company, no, traces: [] })
  }
}

/**
 * 把中文快递公司名映射为第三方接口需要的公司编码。
 * 未识别的默认走快递 100 的自动识别（com 留空或传 'auto'）。
 */
function mapExpressCompany(name) {
  const map = {
    顺丰速运: 'shunfeng',
    中通快递: 'zhongtong',
    圆通速递: 'yuantong',
    韵达快递: 'yunda',
    京东物流: 'jd',
    EMS: 'ems',
    极兔速递: 'jtexpress'
  }
  return map[name] || 'auto'
}

/**
 * 轻量 HTTPS POST（云函数 Node 环境，不引第三方依赖）
 * @returns {Promise<string>} 响应体字符串
 */
function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 8000
      },
      (resp) => {
        let buf = ''
        resp.on('data', (chunk) => (buf += chunk))
        resp.on('end', () => resolve(buf))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.write(body)
    req.end()
  })
}

/**
 * 确认收货：待收货 -> 已完成
 * 入参：{ orderId }
 */
async function confirm(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const res = await db.collection('orders').doc(orderId).get()
  const order = res.data
  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权操作该订单')
  if (order.status !== 2) return fail(409, '当前状态不可确认收货')

  await db.collection('orders').doc(orderId).update({
    data: { status: 3, receiveTime: new Date(), updateTime: new Date() }
  })

  return ok({ orderId, status: 3 })
}

/**
 * 申请售后
 * 入参：{ orderId, type, reason, description, images }
 *  - type: 'refund'(仅退款) | 'returnRefund'(退货退款) | 'exchange'(换货补发)
 *  - reason: 售后原因分类
 *  - description: 问题描述（必填，10~300 字）
 *  - images: 凭证图 fileID 数组，最多 6 张
 *
 * 设计要点：
 * - 仅待收货/已完成可发起，进入 status=4（售后中），并记录 applyPrevStatus 以便拒绝后回退；
 * - 售后对象整体写入 afterSale 字段，附带幂等标记，重复点击不会生成多条；
 * - 描述与图片做长度/数量裁剪，避免脏数据与超限。
 */
async function applyAfterSale(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const type = String(event.type || 'refund')
  if (AFTER_SALE_TYPES.indexOf(type) < 0) return fail(400, '售后类型不正确')

  const reason = String(event.reason || 'other')
  if (AFTER_SALE_REASONS.indexOf(reason) < 0) return fail(400, '售后原因不正确')

  const description = String(event.description || '').trim()
  if (description.length < 10) return fail(400, '请至少用 10 个字描述遇到的问题')
  if (description.length > 300) return fail(400, '问题描述不能超过 300 字')

  const images = Array.isArray(event.images)
    ? event.images.filter((x) => typeof x === 'string' && x).slice(0, 6)
    : []

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权操作该订单')
  if (AFTER_SALE_APPLIABLE.indexOf(order.status) < 0) return fail(409, '当前状态不可申请售后')

  // 幂等：已在售后流程中则不再重复受理
  if (order.status === 4 && order.afterSale && order.afterSale.status === AFTER_SALE_STATUS.PENDING) {
    return fail(409, '已有售后申请在处理中，请勿重复提交')
  }

  const now = new Date()
  await db.collection('orders').doc(orderId).update({
    data: {
      status: 4,
      afterSale: {
        status: AFTER_SALE_STATUS.PENDING,
        type,
        reason,
        description,
        images,
        applyPrevStatus: order.status,
        applyTime: now,
        processTime: null,
        processNote: '',
        refundNo: '',
        refundAmount: 0
      },
      updateTime: now
    }
  })

  return ok({ orderId, status: 4, afterSaleStatus: AFTER_SALE_STATUS.PENDING })
}

/**
 * 撤销售后申请（仅商家尚未处理时可撤）
 * 入参：{ orderId }
 * 撤销后订单回退到申请前状态，售后记录标记为 CLOSED。
 */
async function cancelAfterSale(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权操作该订单')
  if (order.status !== 4 || !order.afterSale) return fail(409, '当前没有进行中的售后')
  if (order.afterSale.status !== AFTER_SALE_STATUS.PENDING) return fail(409, '售后已处理，无法撤销')

  const now = new Date()
  const backTo = order.afterSale.applyPrevStatus || 3

  await db.collection('orders').doc(orderId).update({
    data: {
      status: backTo,
      afterSale: Object.assign({}, order.afterSale, {
        status: AFTER_SALE_STATUS.CLOSED,
        processTime: now,
        processNote: '用户主动撤销'
      }),
      updateTime: now
    }
  })

  return ok({ orderId, status: backTo, afterSaleStatus: AFTER_SALE_STATUS.CLOSED })
}

/**
 * 关闭超时未支付订单（供定时触发器调用）
 * 定时器配置见 cloudfunctions/order/config.json
 */
async function closeExpired() {
  const deadline = new Date(Date.now() - PAY_EXPIRE_MINUTES * 60 * 1000)
  const res = await db
    .collection('orders')
    .where({ status: 0, createTime: _.lt(deadline) })
    .limit(50)
    .get()

  let closed = 0
  for (const order of res.data) {
    const transaction = await db.startTransaction()
    try {
      const fresh = await transaction.collection('orders').doc(order._id).get()
      // 二次确认状态，避免与用户支付并发时误关单
      if (!fresh.data || fresh.data.status !== 0) {
        await transaction.rollback()
        continue
      }
      for (const goods of fresh.data.goodsList || []) {
        await transaction.collection('products').doc(goods.productId).update({
          data: {
            stock: _.inc(goods.count),
            soldCount: _.inc(-goods.count),
            updateTime: new Date()
          }
        })
      }
      await transaction.collection('orders').doc(order._id).update({
        data: { status: -1, updateTime: new Date(), closeReason: '超时未支付' }
      })
      await transaction.commit()
      closed += 1
    } catch (err) {
      try {
        await transaction.rollback()
      } catch (e) {}
      console.error('[order] 关闭超时订单失败', order.orderNo, err)
    }
  }

  return ok({ closed })
}

exports.main = async (event) => {
  // 定时触发器携带 Type: Timer，不需要 openid
  if (event.Type === 'Timer' || event.triggerName) {
    try {
      return await closeExpired()
    } catch (err) {
      console.error('[order] 定时任务异常', err)
      return fail(500, '定时任务异常')
    }
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'list'
  try {
    switch (action) {
      case 'create':
        return await create(OPENID, event)
      case 'list':
        return await list(OPENID, event)
      case 'detail':
        return await detail(OPENID, event)
      case 'cancel':
        return await cancel(OPENID, event)
      case 'confirm':
        return await confirm(OPENID, event)
      case 'applyAfterSale':
        return await applyAfterSale(OPENID, event)
      case 'cancelAfterSale':
        return await cancelAfterSale(OPENID, event)
      case 'traceExpress':
        return await traceExpress(OPENID, event)
      case 'closeExpired':
        return await closeExpired()
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[order] 执行异常', action, err)
    return fail(500, '订单服务异常，请稍后重试')
  }
}
