// cloudfunctions/custom/index.js
// 定制预约：需求提交、列表、进度查看、取消。
//
// 定价口径：提交时用户填写「预期预算」，定金按预算的 30% 计算并即时生成待付状态；
// 商家确认后可在管理端调整最终报价，尾款 = 最终报价 - 定金。这一设计既保证提交后即可锁单，
// 又避免"报价后置"导致的金额无法回改。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 定金比例，与需求文档一致 */
const DEPOSIT_RATE = 0.3

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

function buildCustomNo() {
  const d = new Date()
  const p = (n) => (n < 10 ? `0${n}` : String(n))
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(
    d.getMinutes()
  )}${p(d.getSeconds())}`
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  return `C${stamp}${rand}`
}

/**
 * 文本内容安全检测（服务端兜底）
 *
 * 为什么内联而不调 security 云函数：云函数调云函数要多一次冷启动与网络往返，
 * 而这里只有一个 msgSecCheck，逻辑几十行，内联的代价远小于跨函数调用。
 * 代价是要在本函数的 config.json 里单独声明 security.msgSecCheck 权限。
 *
 * 降级：接口不可用（未认证 / 无权限 / 繁忙）时放行，理由见 security/index.js。
 * 明确判定违规（suggest=risky 或 errCode 87014）时拒绝。
 *
 * @param {string} openid 用户标识，接口要求
 * @param {string[]} texts 待检测文本数组，空串自动跳过
 * @returns {Promise<{ok:boolean}>}
 */
async function checkTextsSafe(openid, texts) {
  for (let i = 0; i < texts.length; i += 1) {
    const content = String(texts[i] || '').trim()
    if (!content) continue

    try {
      const res = await cloud.openapi.security.msgSecCheck({
        openid,
        scene: 2,
        version: 2,
        content: content.slice(0, 2500)
      })
      const suggest = (res && res.result && res.result.suggest) || 'pass'
      if (suggest === 'risky') return { ok: false }
    } catch (err) {
      const code = err && (err.errCode !== undefined ? err.errCode : err.code)
      if (code === 87014) return { ok: false }
      console.warn('[custom] 内容检测接口不可用，本次放行', code)
    }
  }

  return { ok: true }
}

/**
 * 提交定制需求
 * 入参：{
 *   requirement: { character, scale, style, extra, contact, budget },
 *   refImages: string[]
 * }
 * 返回：{ customId, orderNo, deposit, status }
 */
async function submit(openid, event) {
  const req = event.requirement || {}

  const character = String(req.character || '').trim()
  if (!character) return fail(400, '请填写想要的角色或题材')
  if (character.length > 50) return fail(400, '角色描述不超过 50 个字')

  const scale = String(req.scale || '').trim()
  if (!scale) return fail(400, '请选择比例')

  const style = String(req.style || '').trim()
  if (!style) return fail(400, '请选择风格')

  const extra = String(req.extra || '').trim()
  if (extra.length > 500) return fail(400, '特殊要求不超过 500 个字')

  const contact = String(req.contact || '').trim()
  if (!/^1[3-9]\d{9}$/.test(contact)) return fail(400, '请填写正确的联系电话')

  // 预算用于计算定金，单位为元，前端已做输入限制，此处再校验一次
  const budgetYuan = Number(req.budget)
  if (!isFinite(budgetYuan) || budgetYuan < 100 || budgetYuan > 100000) {
    return fail(400, '预期预算需在 100 至 100000 元之间')
  }

  // 内容安全：角色描述与特殊要求都会出现在商家后台与定制进度页，属对外展示内容，必须过检。
  // 前端已预检一次，这里是服务端兜底——直接调云函数可以绕开前端，所以不能只靠前端。
  const safe = await checkTextsSafe(openid, [character, extra])
  if (!safe.ok) return fail(400, '需求描述包含不当内容，请修改后重新提交')

  // 同一个用户同时最多保留 3 个进行中的定制单，防止误提交堆积
  const activeRes = await db
    .collection('customOrders')
    .where({ userId: openid, status: db.command.in([0, 1, 2, 3]) })
    .count()
  if (activeRes.total >= 3) {
    return fail(429, '你有 3 个进行中的定制单，请完成或取消后再提交')
  }

  const totalQuote = Math.round(budgetYuan * 100)
  const deposit = Math.round(totalQuote * DEPOSIT_RATE)
  const orderNo = buildCustomNo()
  const now = new Date()

  const refImages = Array.isArray(event.refImages) ? event.refImages.filter(Boolean).slice(0, 6) : []

  const addRes = await db.collection('customOrders').add({
    data: {
      orderNo,
      userId: openid,
      requirement: {
        character,
        scale,
        style,
        extra,
        contact,
        budget: totalQuote
      },
      refImages,
      deposit,
      totalQuote,
      status: 1, // 已按预算生成定金，直接进入待支付
      schedule: [
        {
          stage: '需求已提交',
          desc: '商家将在 24 小时内确认需求与排期',
          images: [],
          time: now
        }
      ],
      payTime: null,
      restPayTime: null,
      depositTransactionId: '',
      restTransactionId: '',
      createTime: now,
      updateTime: now
    }
  })

  return ok({
    customId: addRes._id,
    orderNo,
    deposit,
    totalQuote,
    status: 1
  })
}

/**
 * 定制单列表
 * 入参：{ page? }
 */
async function list(openid, event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = 10

  const [listRes, countRes] = await Promise.all([
    db
      .collection('customOrders')
      .where({ userId: openid })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get(),
    db.collection('customOrders').where({ userId: openid }).count()
  ])

  return ok({
    list: listRes.data,
    total: countRes.total,
    hasMore: page * pageSize < countRes.total
  })
}

/**
 * 定制单详情（含进度时间轴）
 * 入参：{ customId } 或 { orderNo }
 */
async function detail(openid, event) {
  let item = null
  if (event.customId) {
    const res = await db.collection('customOrders').doc(event.customId).get()
    item = res.data
  } else if (event.orderNo) {
    const res = await db.collection('customOrders').where({ orderNo: event.orderNo }).limit(1).get()
    item = res.data[0]
  }

  if (!item) return fail(404, '定制单不存在')
  if (item.userId !== openid) return fail(403, '无权查看该定制单')

  return ok(item)
}

/**
 * 取消定制单：仅待确认、待付定金状态可取消
 * 入参：{ customId, reason? }
 */
async function cancel(openid, event) {
  const customId = event.customId
  if (!customId) return fail(400, '缺少定制单 ID')

  const res = await db.collection('customOrders').doc(customId).get()
  const item = res.data
  if (!item) return fail(404, '定制单不存在')
  if (item.userId !== openid) return fail(403, '无权操作该定制单')
  if (item.status !== 0 && item.status !== 1) {
    return fail(409, '已支付定金的定制单请联系商家处理')
  }

  const now = new Date()
  await db.collection('customOrders').doc(customId).update({
    data: {
      status: -1,
      cancelReason: String(event.reason || '').slice(0, 100),
      updateTime: now,
      schedule: db.command.push({
        stage: '订单已取消',
        desc: '如需重新定制，可再次提交需求',
        images: [],
        time: now
      })
    }
  })

  return ok({ customId, status: -1 })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'list'
  try {
    switch (action) {
      case 'submit':
        return await submit(OPENID, event)
      case 'list':
        return await list(OPENID, event)
      case 'detail':
        return await detail(OPENID, event)
      case 'cancel':
        return await cancel(OPENID, event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[custom] 执行异常', action, err)
    return fail(500, '定制服务异常，请稍后重试')
  }
}
