// cloudfunctions/pay/index.js
// 支付：统一下单、支付回调、主动查单。
//
// 三重保障：
// 1. 下单前服务端按订单记录核定金额，不接受前端传值；
// 2. 回调按「订单号 + 微信交易号」幂等，重复投递不会重复改状态；
// 3. 前端支付成功后主动查单，兜底回调延迟或丢失。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 支付商户号，部署时在云函数环境变量中配置 */
const SUB_MCH_ID = process.env.PAY_SUB_MCH_ID || ''
/** 当前云开发环境 ID，云支付参数需要显式传入真实环境 ID（不能用 DYNAMIC_CURRENT_ENV） */
const ENV_ID = process.env.TCB_ENV || process.env.SCF_NAMESPACE || ''
/** 支付结果回调指向本函数，functionName 必须与云函数名一致 */
const CALLBACK_FUNCTION = 'pay'

/**
 * 订阅消息模板 ID（支付成功通知），与前端 config/constants.js 的 SUBSCRIBE_TEMPLATES.ORDER_PAID 对应。
 * 留空表示尚未申请模板，发送时直接跳过，不报错不阻塞支付流程。
 */
const TPL_ORDER_PAID = process.env.SUBSCRIBE_TPL_ORDER_PAID || ''

/**
 * 发送订阅消息（一次性订阅）。模板未配置时静默跳过。
 * @param {string} touser 用户 openid
 * @param {object} data 模板数据
 * @param {string} page 跳转页面
 */
async function sendSubscribeMsg(touser, data, page) {
  if (!TPL_ORDER_PAID || !touser) return
  try {
    await cloud.openapi.subscribeMessage.send({
      touser,
      templateId: TPL_ORDER_PAID,
      page: page || 'pages/order-detail/order-detail',
      data,
      miniprogramState: 'formal'
    })
  } catch (err) {
    console.warn('[pay] 支付成功通知发送失败', err && err.errCode, err && err.errMsg)
  }
}

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/**
 * 解析支付单号，判断业务归属
 * 规则：含 '-D' 为定制定金，含 '-R' 为定制尾款，其余为普通商品订单
 * @param {string} outTradeNo
 * @returns {{type:string, orderNo:string}}
 */
function parseOutTradeNo(outTradeNo) {
  const text = String(outTradeNo || '')
  if (text.endsWith('-D')) return { type: 'customDeposit', orderNo: text.slice(0, -2) }
  if (text.endsWith('-R')) return { type: 'customRest', orderNo: text.slice(0, -2) }
  return { type: 'order', orderNo: text }
}

/**
 * 统一下单
 * 入参：{ type: 'order' | 'custom', id, stage?: 'deposit' | 'rest' }
 * 返回：{ payment, outTradeNo }
 */
async function unifiedOrder(openid, event) {
  if (!SUB_MCH_ID) {
    return fail(500, '支付商户号未配置，请在云函数环境变量中设置 PAY_SUB_MCH_ID')
  }
  if (!ENV_ID) {
    return fail(500, '未获取到云开发环境 ID，云支付无法下单')
  }

  const type = event.type || 'order'
  const id = event.id
  if (!id) return fail(400, '缺少订单标识')

  let outTradeNo = ''
  let totalFee = 0
  let body = ''

  if (type === 'order') {
    const res = await db.collection('orders').doc(id).get()
    const order = res.data
    if (!order) return fail(404, '订单不存在')
    if (order.userId !== openid) return fail(403, '无权支付该订单')
    if (order.status !== 0) return fail(409, '订单当前状态不可支付')

    outTradeNo = order.orderNo
    totalFee = Number(order.payAmount)
    body = `手办订单 ${order.orderNo.slice(-8)}`
  } else {
    const res = await db.collection('customOrders').doc(id).get()
    const custom = res.data
    if (!custom) return fail(404, '定制单不存在')
    if (custom.userId !== openid) return fail(403, '无权支付该定制单')

    const stage = event.stage === 'rest' ? 'rest' : 'deposit'
    if (stage === 'deposit') {
      if (custom.status !== 1) return fail(409, '定制单当前状态不可支付定金')
      outTradeNo = `${custom.orderNo}-D`
      totalFee = Number(custom.deposit)
      body = `定制定金 ${custom.orderNo.slice(-8)}`
    } else {
      if (custom.status !== 3) return fail(409, '定制单当前状态不可支付尾款')
      outTradeNo = `${custom.orderNo}-R`
      totalFee = Math.max(0, Number(custom.totalQuote) - Number(custom.deposit))
      body = `定制尾款 ${custom.orderNo.slice(-8)}`
    }
  }

  if (!totalFee || totalFee <= 0) return fail(400, '支付金额异常，请联系商家')

  const payRes = await cloud.cloudPay.unifiedOrder({
    body,
    outTradeNo,
    spbillCreateIp: '127.0.0.1',
    subMchId: SUB_MCH_ID,
    totalFee,
    envId: ENV_ID,
    functionName: CALLBACK_FUNCTION,
    nonceStr: Math.random().toString(36).slice(2, 18),
    tradeType: 'JSAPI',
    openid
  })

  if (!payRes || !payRes.payment) {
    console.error('[pay] 统一下单返回异常', payRes)
    return fail(500, '发起支付失败，请稍后重试')
  }

  return ok({ payment: payRes.payment, outTradeNo, totalFee })
}

/**
 * 支付回调：由微信支付调用，必须返回 { errcode: 0, errmsg: '' }
 * 幂等策略：订单已进入已支付状态时直接返回成功，不改状态、不加库存
 */
async function handleCallback(event) {
  const outTradeNo = event.outTradeNo
  const transactionId = event.transactionId || ''
  const resultCode = event.resultCode || event.returnCode

  if (!outTradeNo) {
    console.error('[pay] 回调缺少 outTradeNo', event)
    return { errcode: 0, errmsg: '' }
  }

  if (resultCode && resultCode !== 'SUCCESS') {
    console.warn('[pay] 回调结果为失败，忽略', outTradeNo, resultCode)
    return { errcode: 0, errmsg: '' }
  }

  const parsed = parseOutTradeNo(outTradeNo)
  const now = new Date()

  try {
    if (parsed.type === 'order') {
      const res = await db.collection('orders').where({ orderNo: parsed.orderNo }).limit(1).get()
      const order = res.data[0]
      if (!order) {
        console.error('[pay] 回调订单不存在', parsed.orderNo)
        return { errcode: 0, errmsg: '' }
      }
      // 幂等：已支付过的订单不再处理
      if (order.status !== 0) {
        return { errcode: 0, errmsg: '' }
      }
      await db.collection('orders').doc(order._id).update({
        data: {
          status: 1,
          payTime: now,
          transactionId,
          updateTime: now
        }
      })
      // 支付成功通知（一次性订阅），失败不影响支付结果
      await sendSubscribeMsg(
        order.userId,
        {
          character_string1: { value: order.orderNo },
          amount2: { value: ((Number(order.payAmount) || 0) / 100).toFixed(2) },
          thing3: { value: '支付成功，商家备货中' }
        },
        'pages/order-detail/order-detail?id=' + order._id
      )
    } else {
      const res = await db
        .collection('customOrders')
        .where({ orderNo: parsed.orderNo })
        .limit(1)
        .get()
      const custom = res.data[0]
      if (!custom) {
        console.error('[pay] 回调定制单不存在', parsed.orderNo)
        return { errcode: 0, errmsg: '' }
      }

      if (parsed.type === 'customDeposit') {
        if (custom.status !== 1) return { errcode: 0, errmsg: '' }
        await db.collection('customOrders').doc(custom._id).update({
          data: {
            status: 2,
            payTime: now,
            depositTransactionId: transactionId,
            updateTime: now,
            schedule: db.command.push({
              stage: '定金已支付',
              desc: '订单已进入排期，制作开始后将同步进度',
              images: [],
              time: now
            })
          }
        })
      } else {
        if (custom.status !== 3) return { errcode: 0, errmsg: '' }
        await db.collection('customOrders').doc(custom._id).update({
          data: {
            status: 4,
            restPayTime: now,
            restTransactionId: transactionId,
            updateTime: now,
            schedule: db.command.push({
              stage: '尾款已支付',
              desc: '订单完成，作品将安排发货',
              images: [],
              time: now
            })
          }
        })
      }
    }
  } catch (err) {
    console.error('[pay] 回调处理异常', outTradeNo, err)
    // 返回失败让微信稍后重试，避免状态丢失
    return { errcode: -1, errmsg: '处理异常' }
  }

  return { errcode: 0, errmsg: '' }
}

/**
 * 主动查单
 * 入参：{ orderId } 普通订单
 * 返回：{ paid, status }
 */
async function queryOrder(openid, event) {
  const orderId = event.orderId
  if (!orderId) return fail(400, '缺少订单 ID')

  const res = await db.collection('orders').doc(orderId).get()
  const order = res.data
  if (!order) return fail(404, '订单不存在')
  if (order.userId !== openid) return fail(403, '无权查看该订单')

  // 本地已确认支付，直接返回，省去一次外部请求
  if (order.status !== 0) {
    return ok({ paid: true, status: order.status })
  }

  if (!SUB_MCH_ID) {
    return ok({ paid: false, status: order.status })
  }

  try {
    const payRes = await cloud.cloudPay.queryOrder({
      subMchId: SUB_MCH_ID,
      outTradeNo: order.orderNo,
      envId: ENV_ID,
      functionName: CALLBACK_FUNCTION
    })

    const tradeState = payRes && (payRes.tradeState || payRes.trade_state)
    if (tradeState === 'SUCCESS') {
      const now = new Date()
      await db.collection('orders').doc(orderId).update({
        data: {
          status: 1,
          payTime: now,
          transactionId: (payRes && (payRes.transactionId || payRes.transaction_id)) || '',
          updateTime: now
        }
      })
      return ok({ paid: true, status: 1 })
    }
    return ok({ paid: false, status: order.status })
  } catch (err) {
    // 查单失败不阻断流程，前端以订单详情页的状态为准
    console.warn('[pay] 主动查单失败', order.orderNo, err)
    return ok({ paid: false, status: order.status })
  }
}

exports.main = async (event) => {
  // 支付回调没有 action 字段，且带 outTradeNo，优先识别
  if (event.outTradeNo && (event.resultCode || event.returnCode || event.transactionId)) {
    return await handleCallback(event)
  }

  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action
  try {
    switch (action) {
      case 'unifiedOrder':
        return await unifiedOrder(OPENID, event)
      case 'queryOrder':
        return await queryOrder(OPENID, event)
      case 'callback':
        return await handleCallback(event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[pay] 执行异常', action, err)
    return fail(500, '支付服务异常，请稍后重试')
  }
}
