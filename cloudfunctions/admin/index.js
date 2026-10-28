// cloudfunctions/admin/index.js
// 商家端管理接口。
//
// 鉴权采用双因子：openid 必须在 ADMIN_OPENIDS 白名单内，且管理口令校验通过。
// 通过后签发 HMAC 签名令牌（有效期 2 小时），后续请求携带令牌，避免口令反复传输。
// 所有管理操作都在本函数内二次校验令牌，前端隐藏入口不构成任何安全边界。

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

/**
 * 令牌签名密钥。
 * 不设置硬编码默认值：默认值一旦随代码公开，任何人都能据此伪造管理员令牌，
 * 而管理员账号本身没有任何其它防线。未配置或过短时一律拒绝签发与校验，
 * 宁可后台暂时登不进去（错误信息会指明缺哪个变量），也不留一个可预测的密钥。
 */
const SECRET = process.env.ADMIN_SECRET || ''
const SECRET_MIN_LEN = 16
const SECRET_HINT = `后台密钥未正确配置，请在云函数环境变量中设置 ADMIN_SECRET（至少 ${SECRET_MIN_LEN} 位随机字符串）`

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || ''
const TOKEN_TTL = 2 * 60 * 60 * 1000

/** 支付商户号，退款需要与 pay 云函数使用同一商户号 */
const SUB_MCH_ID = process.env.PAY_SUB_MCH_ID || ''
/** 当前云开发环境 ID，云支付参数需要显式传入真实环境 ID */
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || ''

/**
 * 订阅消息模板 ID，与前端 config/constants.js 的 SUBSCRIBE_TEMPLATES 一一对应。
 * 留空表示尚未申请模板，发送函数会直接跳过，不报错不阻塞业务。
 * 申请后同步填入此三处（或改由环境变量注入）即可生效。
 */
const SUBSCRIBE_TPL = {
  ORDER_PAID: process.env.SUBSCRIBE_TPL_ORDER_PAID || '',
  SHIPPED: process.env.SUBSCRIBE_TPL_SHIPPED || '',
  AFTERSALE_DONE: process.env.SUBSCRIBE_TPL_AFTERSALE_DONE || ''
}

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/** 密钥是否已正确配置 */
function secretReady() {
  return SECRET.length >= SECRET_MIN_LEN
}

/** 管理员 openid 白名单 */
function getAdminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 签发令牌 */
function signToken(openid) {
  const payload = JSON.stringify({ openid, exp: Date.now() + TOKEN_TTL })
  const b64 = Buffer.from(payload).toString('base64')
  const sig = crypto.createHmac('sha256', SECRET).update(b64).digest('hex')
  return `${b64}.${sig}`
}

/**
 * 校验令牌
 * @returns {{ok:boolean, msg:string}}
 */
function verifyToken(token, openid) {
  if (!secretReady()) return { ok: false, msg: SECRET_HINT }
  if (!token || typeof token !== 'string') return { ok: false, msg: '请先登录管理后台' }
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, msg: '登录凭证无效，请重新登录' }

  const [b64, sig] = parts
  const expect = crypto.createHmac('sha256', SECRET).update(b64).digest('hex')
  if (expect !== sig) return { ok: false, msg: '登录凭证无效，请重新登录' }

  let payload
  try {
    payload = JSON.parse(Buffer.from(b64, 'base64').toString())
  } catch (e) {
    return { ok: false, msg: '登录凭证无效，请重新登录' }
  }

  if (payload.openid !== openid) return { ok: false, msg: '登录凭证与当前用户不匹配' }
  if (Date.now() > payload.exp) return { ok: false, msg: '登录已过期，请重新登录' }
  return { ok: true, msg: '' }
}

/**
 * 管理口令校验
 * 入参：{ password }
 * 返回：{ token, expireAt }
 */
async function checkAuth(openid, event) {
  if (getAdminOpenids().indexOf(openid) < 0) {
    return fail(403, '当前账号没有管理权限')
  }
  if (!ADMIN_PASSWORD) {
    return fail(500, '管理口令未配置，请在云函数环境变量中设置 ADMIN_PASSWORD')
  }
  if (String(event.password || '') !== ADMIN_PASSWORD) {
    return fail(403, '管理口令不正确')
  }
  if (!secretReady()) {
    return fail(500, SECRET_HINT)
  }

  const token = signToken(openid)
  return ok({ token, expireAt: Date.now() + TOKEN_TTL })
}

/* ---------------- 商品管理 ---------------- */

/**
 * 商品列表（含下架）
 * 入参：{ keyword?, status?, page? }
 */
async function productList(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = 20
  const where = {}

  if (event.status !== undefined && event.status !== null && event.status !== '') {
    where.status = Number(event.status)
  }
  if (event.keyword && String(event.keyword).trim()) {
    where.name = db.RegExp({ regexp: String(event.keyword).trim(), options: 'i' })
  }

  // 无条件时不传空对象给 where，避免不同基础库版本对空查询条件的解析差异
  const hasFilter = Object.keys(where).length > 0
  const coll = db.collection('products')
  const source = hasFilter ? coll.where(where) : coll

  const [listRes, countRes] = await Promise.all([
    source
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    source.count()
  ])

  return ok({
    list: listRes.data.map((item) => ({
      _id: item._id,
      name: item.name,
      price: item.price,
      stock: item.stock || 0,
      soldCount: item.soldCount || 0,
      type: item.type,
      status: item.status,
      cover: (item.images && item.images[0]) || '',
      limitNum: item.limitNum || 0,
      createTime: item.createTime
    })),
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  })
}

/** 商品详情（管理端可看下架商品） */
async function productDetail(event) {
  if (!event.productId) return fail(400, '缺少商品 ID')
  const res = await db.collection('products').doc(event.productId).get().catch(() => null)
  if (!res || !res.data) return fail(404, '商品不存在')
  return ok(res.data)
}

/**
 * 新增或更新商品
 * 入参：{ productId?, data: { name, subtitle, price, originPrice, stock, type,
 *         category, images, detail, specs, limitNum, presaleDate, status, sort } }
 */
async function saveProduct(event) {
  const data = event.data || {}

  const name = String(data.name || '').trim()
  if (name.length < 2 || name.length > 40) return fail(400, '商品名称需 2 至 40 个字')

  const price = Math.round(Number(data.price) || 0)
  if (price <= 0) return fail(400, '售价必须大于 0')

  const stock = Math.floor(Number(data.stock) || 0)
  if (stock < 0) return fail(400, '库存不能为负数')

  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : []
  if (images.length === 0) return fail(400, '请至少上传一张商品主图')

  const type = Number(data.type) || 0
  if ([0, 1, 2].indexOf(type) < 0) return fail(400, '商品类型不合法')

  const limitNum = Math.floor(Number(data.limitNum) || 0)
  if (type === 1 && limitNum <= 0) return fail(400, '限量预售商品需填写限量数量')

  const now = new Date()
  const payload = {
    name,
    subtitle: String(data.subtitle || '').trim().slice(0, 40),
    price,
    originPrice: Math.round(Number(data.originPrice) || 0),
    stock,
    type,
    category: {
      series: (data.category && data.category.series) || '',
      ip: (data.category && data.category.ip) || '',
      scale: (data.category && data.category.scale) || '',
      priceRange: (data.category && data.category.priceRange) || ''
    },
    images,
    detail: Array.isArray(data.detail) ? data.detail : [],
    specs: Array.isArray(data.specs) ? data.specs : [],
    limitNum,
    presaleDate: String(data.presaleDate || ''),
    status: data.status === 0 ? 0 : 1,
    sort: Math.floor(Number(data.sort) || 0),
    updateTime: now
  }

  if (event.productId) {
    await db.collection('products').doc(event.productId).update({ data: payload })
    return ok({ productId: event.productId, updated: true })
  }

  payload.soldCount = 0
  payload.createTime = now
  const addRes = await db.collection('products').add({ data: payload })
  return ok({ productId: addRes._id, created: true })
}

/**
 * 上下架
 * 入参：{ productId, status: 0|1 }
 */
async function toggleProduct(event) {
  if (!event.productId) return fail(400, '缺少商品 ID')
  const status = Number(event.status) === 1 ? 1 : 0
  await db.collection('products').doc(event.productId).update({
    data: { status, updateTime: new Date() }
  })
  return ok({ productId: event.productId, status })
}

/**
 * 调整库存
 * 入参：{ productId, stock }
 */
async function updateStock(event) {
  if (!event.productId) return fail(400, '缺少商品 ID')
  const stock = Math.floor(Number(event.stock))
  if (!isFinite(stock) || stock < 0) return fail(400, '库存需为非负整数')

  await db.collection('products').doc(event.productId).update({
    data: { stock, updateTime: new Date() }
  })
  return ok({ productId: event.productId, stock })
}

/**
 * 批量上下架
 * 入参：{ productIds: string[], status: 0|1 }
 * 逐条更新并计数，部分失败不影响其余；返回成功/失败明细便于前端提示。
 */
async function batchToggleProduct(event) {
  const ids = Array.isArray(event.productIds) ? event.productIds.filter(Boolean).slice(0, 100) : []
  if (ids.length === 0) return fail(400, '请选择要操作的商品')
  const status = Number(event.status) === 1 ? 1 : 0

  const now = new Date()
  let okCount = 0
  const failed = []
  for (const id of ids) {
    try {
      await db.collection('products').doc(id).update({
        data: { status, updateTime: now }
      })
      okCount += 1
    } catch (err) {
      failed.push(id)
    }
  }
  return ok({ okCount, failed, status })
}

/**
 * 批量改价
 * 入参：{ productIds: string[], mode: 'set'|'percent', value: number }
 *  - mode='set'     ：统一设为 value（分）
 *  - mode='percent' ：按 value% 调整，如 value=90 表示打 9 折（新价=原价*90%）
 * 价格下限 1 分，防止误操作导致 0 元商品。
 */
async function batchUpdatePrice(event) {
  const ids = Array.isArray(event.productIds) ? event.productIds.filter(Boolean).slice(0, 100) : []
  if (ids.length === 0) return fail(400, '请选择要操作的商品')

  const mode = event.mode === 'percent' ? 'percent' : 'set'
  const value = Number(event.value)
  if (!isFinite(value)) return fail(400, '价格参数不正确')
  if (mode === 'set' && value <= 0) return fail(400, '价格必须大于 0')
  if (mode === 'percent' && (value <= 0 || value > 1000)) return fail(400, '折扣比例需在 0~1000% 之间')

  const now = new Date()
  let okCount = 0
  const failed = []

  for (const id of ids) {
    try {
      let newPrice
      if (mode === 'set') {
        newPrice = Math.round(value)
      } else {
        const res = await db.collection('products').doc(id).get().catch(() => null)
        const p = res && res.data
        if (!p) {
          failed.push(id)
          continue
        }
        newPrice = Math.round((Number(p.price) || 0) * value / 100)
      }
      // 价格下限 1 分，防止误设为 0
      newPrice = Math.max(1, newPrice)

      await db.collection('products').doc(id).update({
        data: { price: newPrice, updateTime: now }
      })
      okCount += 1
    } catch (err) {
      failed.push(id)
    }
  }
  return ok({ okCount, failed, mode, value })
}

/* ---------------- 订单管理 ---------------- */

/**
 * 订单列表
 * 入参：{ status?, keyword?, page? }
 */
async function orderList(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = 20
  const where = {}

  if (event.status !== undefined && event.status !== null && event.status !== '') {
    where.status = Number(event.status)
  }
  if (event.keyword && String(event.keyword).trim()) {
    where.orderNo = db.RegExp({ regexp: String(event.keyword).trim(), options: 'i' })
  }

  const hasFilter = Object.keys(where).length > 0
  const coll = db.collection('orders')
  const source = hasFilter ? coll.where(where) : coll

  const [listRes, countRes] = await Promise.all([
    source
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    source.count()
  ])

  return ok({
    list: listRes.data,
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  })
}

/** 订单详情 */
async function orderDetail(event) {
  if (!event.orderId) return fail(400, '缺少订单 ID')
  const res = await db.collection('orders').doc(event.orderId).get().catch(() => null)
  if (!res || !res.data) return fail(404, '订单不存在')
  return ok(res.data)
}

/**
 * 发货：待发货 -> 待收货
 * 入参：{ orderId, expressCompany, expressNo }
 */
async function deliver(event) {
  const { orderId } = event
  const expressCompany = String(event.expressCompany || '').trim()
  const expressNo = String(event.expressNo || '').trim()

  if (!orderId) return fail(400, '缺少订单 ID')
  if (!expressCompany) return fail(400, '请填写快递公司')
  if (expressNo.length < 6) return fail(400, '请填写正确的快递单号')

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')
  if (order.status !== 1) return fail(409, '仅待发货订单可录入物流')

  const now = new Date()
  await db.collection('orders').doc(orderId).update({
    data: {
      status: 2,
      expressCompany,
      expressNo,
      deliverTime: now,
      updateTime: now
    }
  })

  // 发货通知（一次性订阅），失败不影响发货结果
  await sendSubscribeMsg(order.userId, 'SHIPPED', {
    character_string1: { value: order.orderNo },
    thing2: { value: expressCompany },
    character_string3: { value: expressNo }
  }, 'pages/order-detail/order-detail?id=' + orderId)

  return ok({ orderId, status: 2 })
}

/**
 * 订单状态调整（受限流转）
 * 入参：{ orderId, status }
 * 允许：0 -> -1（关闭）、2 -> 3（强制完成）、3 -> 4（进入售后）、4 -> 3（售后结束）
 */
async function updateOrderStatus(event) {
  const { orderId } = event
  const target = Number(event.status)
  if (!orderId) return fail(400, '缺少订单 ID')

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')

  const allowed = {
    0: [-1],
    2: [3],
    3: [4],
    4: [3]
  }
  const list = allowed[order.status] || []
  if (list.indexOf(target) < 0) {
    return fail(409, `订单状态不允许从 ${order.status} 变更为 ${target}`)
  }

  const patch = { status: target, updateTime: new Date() }
  if (target === 3) patch.receiveTime = new Date()

  await db.collection('orders').doc(orderId).update({ data: patch })
  return ok({ orderId, status: target })
}

/* ---------------- 售后与退款 ---------------- */

/**
 * 发送订阅消息（一次性订阅）。
 *
 * 订阅消息是「一次性订阅」：用户在前端弹窗点允许后，服务端才能就一次事件下发一条。
 * 模板 ID 未配置（留空）时直接跳过，不报错、不阻塞业务——与前端 subscribe.js 同口径。
 *
 * @param {string} touser 目标用户 openid
 * @param {string} key 模板键：ORDER_PAID | SHIPPED | AFTERSALE_DONE
 * @param {object} data 模板数据，字段名须与模板一致
 * @param {string} page 点击消息跳转的页面路径
 */
async function sendSubscribeMsg(touser, key, data, page) {
  const templateId = SUBSCRIBE_TPL[key]
  if (!templateId) return // 模板未申请，静默跳过
  if (!touser) return
  try {
    await cloud.openapi.subscribeMessage.send({
      touser,
      templateId,
      page: page || 'pages/index/index',
      data,
      miniprogramState: 'formal'
    })
  } catch (err) {
    // 订阅消息失败不影响主流程（用户可能未订阅 / 模板字段不符），仅记日志
    console.warn('[admin] 订阅消息发送失败', key, err && err.errCode, err && err.errMsg)
  }
}

/**
 * 生成商户退款单号：R + 时间戳 + 随机，全局唯一，供微信侧幂等与对账
 */
function buildRefundNo() {
  const d = new Date()
  const p = (n) => (n < 10 ? `0${n}` : String(n))
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `R${stamp}${rand}`
}

/**
 * 执行微信退款（cloudPay.refund）。
 *
 * 关键点：
 * 1. 退款单号一次生成落库，重试沿用同一单号，避免重复退款；
 * 2. refund 返回双层结果（returnCode / resultCode）都要校验，任一非 SUCCESS 即失败；
 * 3. 退款是异步最终态，这里以「退款申请受理成功」为成功，到账以微信侧为准，
 *    后续可在订单上留存 refundNo 供查询与对账。
 *
 * @param {object} order 订单记录
 * @param {number} refundFee 退款金额（分）
 * @param {string} refundNo 商户退款单号
 * @param {string} reason 退款原因（微信侧展示）
 * @returns {Promise<{ok:boolean, msg:string, refundId:string}>}
 */
async function doRefund(order, refundFee, refundNo, reason) {
  if (!SUB_MCH_ID) {
    return { ok: false, msg: '支付商户号未配置，无法退款', refundId: '' }
  }
  if (!ENV_ID) {
    return { ok: false, msg: '未获取到云开发环境 ID，退款无法提交', refundId: '' }
  }
  if (!order.transactionId && !order.orderNo) {
    return { ok: false, msg: '订单缺少支付流水，无法退款', refundId: '' }
  }

  try {
    const refundRes = await cloud.cloudPay.refund({
      subMchId: SUB_MCH_ID,
      outTradeNo: order.orderNo,
      outRefundNo: refundNo,
      totalFee: Number(order.payAmount) || 0,
      refundFee,
      refundDesc: String(reason || '售后退款').slice(0, 100),
      envId: ENV_ID,
      functionName: 'pay'
    })

    const returnCode = refundRes && (refundRes.returnCode || refundRes.return_code)
    const resultCode = refundRes && (refundRes.resultCode || refundRes.result_code)
    if (returnCode !== 'SUCCESS' || resultCode !== 'SUCCESS') {
      const errDes = (refundRes && (refundRes.errCodeDes || refundRes.err_code_des)) || ''
      console.error('[admin] 退款提交失败', refundRes)
      return { ok: false, msg: `退款提交失败${errDes ? '：' + errDes : ''}`, refundId: '' }
    }

    const refundId = (refundRes && (refundRes.refundId || refundRes.refund_id)) || ''
    return { ok: true, msg: '', refundId }
  } catch (err) {
    console.error('[admin] 退款异常', order.orderNo, err)
    return { ok: false, msg: '退款服务异常，请稍后重试', refundId: '' }
  }
}

/**
 * 售后处理：商家对买家的售后申请做出裁决。
 * 入参：{ orderId, action: 'agreeRefund' | 'reject', refundAmount?, note? }
 *  - agreeRefund：同意并退款，售后转「退款处理中」→ 退款成功后「已退款」，订单转 3（完成态）并留存退款信息；
 *  - reject：拒绝，售后转「已拒绝」，订单回退到申请前状态。
 *
 * 幂等：售后已处于终态（REFUNDED / REJECTED / CLOSED）时拒绝重复处理。
 */
async function handleAfterSale(event) {
  const { orderId } = event
  const action = String(event.action || '')
  const note = String(event.note || '').slice(0, 200)

  if (!orderId) return fail(400, '缺少订单 ID')
  if (['agreeRefund', 'reject'].indexOf(action) < 0) return fail(400, '未知售后处理动作')

  const res = await db.collection('orders').doc(orderId).get().catch(() => null)
  const order = res && res.data
  if (!order) return fail(404, '订单不存在')
  if (order.status !== 4 || !order.afterSale) return fail(409, '该订单没有进行中的售后')

  const PENDING = 0
  const REFUNDING = 1
  const REFUNDED = 2
  const REJECTED = 3
  const CLOSED = 4
  const TERMINAL = [REFUNDED, REJECTED, CLOSED]

  if (TERMINAL.indexOf(order.afterSale.status) >= 0) {
    return fail(409, '该售后已处理完成，无需重复操作')
  }

  const now = new Date()

  if (action === 'reject') {
    const backTo = order.afterSale.applyPrevStatus || 3
    await db.collection('orders').doc(orderId).update({
      data: {
        status: backTo,
        afterSale: Object.assign({}, order.afterSale, {
          status: REJECTED,
          processTime: now,
          processNote: note || '商家已拒绝售后申请'
        }),
        updateTime: now
      }
    })

    // 售后结果通知（一次性订阅），失败不影响裁决
    await sendSubscribeMsg(order.userId, 'AFTERSALE_DONE', {
      character_string1: { value: order.orderNo },
      thing2: { value: '售后申请未通过' },
      thing3: { value: (note || '商家已拒绝售后申请').slice(0, 20) }
    }, 'pages/order-detail/order-detail?id=' + orderId)

    return ok({ orderId, status: backTo, afterSaleStatus: REJECTED })
  }

  // 同意退款
  const maxRefund = Number(order.payAmount) || 0
  let refundAmount = event.refundAmount === undefined ? maxRefund : Math.round(Number(event.refundAmount) || 0)
  if (refundAmount <= 0) return fail(400, '退款金额必须大于 0')
  if (refundAmount > maxRefund) return fail(400, '退款金额不能超过实付金额')

  const refundNo = buildRefundNo()
  const refundResult = await doRefund(order, refundAmount, refundNo, note || '售后退款')

  if (!refundResult.ok) {
    // 退款提交失败：售后保持待处理，商家可重试；不误改状态
    return fail(500, refundResult.msg || '退款失败，请稍后重试')
  }

  await db.collection('orders').doc(orderId).update({
    data: {
      // 退款成功订单置为已完成（钱已退、货已了结），并留退款快照
      status: 3,
      receiveTime: order.receiveTime || now,
      afterSale: Object.assign({}, order.afterSale, {
        status: REFUNDED,
        processTime: now,
        processNote: note || '商家同意售后并退款',
        refundNo,
        refundAmount,
        refundId: refundResult.refundId,
        refundTime: now
      }),
      refundNo,
      refundAmount,
      updateTime: now
    }
  })

  // 退款成功通知（一次性订阅），失败不影响退款结果
  await sendSubscribeMsg(order.userId, 'AFTERSALE_DONE', {
    character_string1: { value: order.orderNo },
    thing2: { value: '售后已同意，退款已发起' },
    thing3: { value: ('退款 ' + (refundAmount / 100).toFixed(2) + ' 元').slice(0, 20) }
  }, 'pages/order-detail/order-detail?id=' + orderId)

  return ok({ orderId, status: 3, afterSaleStatus: REFUNDED, refundNo, refundAmount })
}

/* ---------------- 定制管理 ---------------- */

/**
 * 定制单列表
 * 入参：{ status?, page? }
 */
async function customList(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = 20
  const where = {}

  if (event.status !== undefined && event.status !== null && event.status !== '') {
    where.status = Number(event.status)
  }

  const hasFilter = Object.keys(where).length > 0
  const coll = db.collection('customOrders')
  const source = hasFilter ? coll.where(where) : coll

  const [listRes, countRes] = await Promise.all([
    source
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    source.count()
  ])

  return ok({
    list: listRes.data,
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  })
}

/** 定制单详情 */
async function customDetail(event) {
  if (!event.customId) return fail(400, '缺少定制单 ID')
  const res = await db.collection('customOrders').doc(event.customId).get().catch(() => null)
  if (!res || !res.data) return fail(404, '定制单不存在')
  return ok(res.data)
}

/**
 * 确认报价：按最终报价重算定金（30%），并把订单推进到待付定金
 * 入参：{ customId, totalQuote }  totalQuote 单位为分
 */
async function confirmQuote(event) {
  const { customId } = event
  const totalQuote = Math.round(Number(event.totalQuote) || 0)
  if (!customId) return fail(400, '缺少定制单 ID')
  if (totalQuote <= 0) return fail(400, '报价必须大于 0')

  const res = await db.collection('customOrders').doc(customId).get().catch(() => null)
  const item = res && res.data
  if (!item) return fail(404, '定制单不存在')
  if (item.status !== 0 && item.status !== 1) {
    return fail(409, '当前状态不可修改报价')
  }

  const deposit = Math.round(totalQuote * 0.3)
  const now = new Date()

  await db.collection('customOrders').doc(customId).update({
    data: {
      totalQuote,
      deposit,
      status: 1,
      updateTime: now,
      schedule: _.push({
        stage: '报价已确认',
        desc: `最终报价 ${(totalQuote / 100).toFixed(2)} 元，定金 ${(deposit / 100).toFixed(
          2
        )} 元，请支付定金以锁定排期`,
        images: [],
        time: now
      })
    }
  })

  return ok({ customId, totalQuote, deposit, status: 1 })
}

/**
 * 追加制作进度
 * 入参：{ customId, stage, desc?, images? }
 */
async function addSchedule(event) {
  const { customId } = event
  const stage = String(event.stage || '').trim()
  if (!customId) return fail(400, '缺少定制单 ID')
  if (!stage) return fail(400, '请填写进度节点名称')

  const res = await db.collection('customOrders').doc(customId).get().catch(() => null)
  const item = res && res.data
  if (!item) return fail(404, '定制单不存在')
  if (item.status === -1 || item.status === 4) return fail(409, '该定制单已结束')

  const images = Array.isArray(event.images) ? event.images.filter(Boolean).slice(0, 9) : []
  const now = new Date()

  await db.collection('customOrders').doc(customId).update({
    data: {
      updateTime: now,
      schedule: _.push({
        stage: stage.slice(0, 20),
        desc: String(event.desc || '').slice(0, 200),
        images,
        time: now
      })
    }
  })

  return ok({ customId, appended: true })
}

/**
 * 完工：制作中 -> 待付尾款
 * 入参：{ customId }
 */
async function finishCustom(event) {
  const { customId } = event
  if (!customId) return fail(400, '缺少定制单 ID')

  const res = await db.collection('customOrders').doc(customId).get().catch(() => null)
  const item = res && res.data
  if (!item) return fail(404, '定制单不存在')
  if (item.status !== 2) return fail(409, '仅制作中的定制单可标记完工')

  const restAmount = Math.max(0, Number(item.totalQuote) - Number(item.deposit))
  const now = new Date()

  await db.collection('customOrders').doc(customId).update({
    data: {
      status: 3,
      finishTime: now,
      updateTime: now,
      schedule: _.push({
        stage: '作品已完工',
        desc: `请支付尾款 ${(restAmount / 100).toFixed(2)} 元，支付后安排发货`,
        images: [],
        time: now
      })
    }
  })

  return ok({ customId, status: 3, restAmount })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action

  try {
    // 口令校验是唯一不需要令牌的入口
    if (action === 'checkAuth') {
      return await checkAuth(OPENID, event)
    }

    if (getAdminOpenids().indexOf(OPENID) < 0) {
      return fail(403, '当前账号没有管理权限')
    }

    const auth = verifyToken(event.token, OPENID)
    if (!auth.ok) return fail(401, auth.msg)

    switch (action) {
      case 'productList':
        return await productList(event)
      case 'productDetail':
        return await productDetail(event)
      case 'saveProduct':
        return await saveProduct(event)
      case 'toggleProduct':
        return await toggleProduct(event)
      case 'updateStock':
        return await updateStock(event)
      case 'batchToggleProduct':
        return await batchToggleProduct(event)
      case 'batchUpdatePrice':
        return await batchUpdatePrice(event)
      case 'orderList':
        return await orderList(event)
      case 'orderDetail':
        return await orderDetail(event)
      case 'deliver':
        return await deliver(event)
      case 'updateOrderStatus':
        return await updateOrderStatus(event)
      case 'handleAfterSale':
        return await handleAfterSale(event)
      case 'customList':
        return await customList(event)
      case 'customDetail':
        return await customDetail(event)
      case 'confirmQuote':
        return await confirmQuote(event)
      case 'addSchedule':
        return await addSchedule(event)
      case 'finishCustom':
        return await finishCustom(event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[admin] 执行异常', action, err)
    return fail(500, '管理服务异常，请稍后重试')
  }
}
