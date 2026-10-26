// cloudfunctions/stats/index.js
// 经营数据概览。仅管理员可调用，令牌校验逻辑与 admin 云函数保持一致。
//
// 说明：需求中的「访客数」需要页面级埋点支撑，首版以「累计用户数」替代，
// 后续如需真实访客统计，可增加 visits 集合并由前端上报。

const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

const SECRET = process.env.ADMIN_SECRET || 'fd-admin-secret-change-me'

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

function getAdminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/** 令牌校验，与 admin 云函数同算法 */
function verifyToken(token, openid) {
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

/** 今日零点的 Date 对象（以云函数所在服务器时区为准，部署时建议选择广州地域） */
function todayStart() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
}

/** 缓存：数据概览 30 秒，避免反复刷新的查询压力（实例级，重启即失效） */
let cache = { at: 0, data: null }
const CACHE_TTL = 30 * 1000

async function overview() {
  if (cache.data && Date.now() - cache.at < CACHE_TTL) {
    return ok(Object.assign({ cached: true }, cache.data))
  }

  const start = todayStart()
  const paidStatus = [1, 2, 3, 4]

  const [
    todayOrderCount,
    todaySalesRes,
    userCount,
    productCount,
    pendingDeliver,
    pendingCustom,
    unpaidCount
  ] = await Promise.all([
    db
      .collection('orders')
      .where({ createTime: _.gte(start) })
      .count(),
    db
      .collection('orders')
      .aggregate()
      .match({ status: _.in(paidStatus), payTime: _.gte(start) })
      .group({ _id: null, total: $.sum('$payAmount') })
      .end(),
    db.collection('users').count(),
    db.collection('products').where({ status: 1 }).count(),
    db.collection('orders').where({ status: 1 }).count(),
    db.collection('customOrders').where({ status: _.in([0, 1, 2, 3]) }).count(),
    db.collection('orders').where({ status: 0 }).count()
  ])

  const todaySales =
    (todaySalesRes.list && todaySalesRes.list[0] && todaySalesRes.list[0].total) || 0

  const data = {
    todayOrderCount: todayOrderCount.total || 0,
    todaySales,
    userCount: userCount.total || 0,
    productCount: productCount.total || 0,
    pendingDeliver: pendingDeliver.total || 0,
    pendingCustom: pendingCustom.total || 0,
    unpaidCount: unpaidCount.total || 0,
    updatedAt: Date.now()
  }

  cache = { at: Date.now(), data }
  return ok(Object.assign({ cached: false }, data))
}

/**
 * 近 7 日销售趋势 + 热销榜。
 *
 * 趋势：按天聚合已支付订单（status ∈ 1~4）的成交额与单量，补齐无成交的日期为 0，
 * 保证前端折线连续。热销榜：按商品销量聚合取前 5，给运营选品参考。
 *
 * 返回：{ trend: [{ date, sales, count }], hotList: [{ productId, name, image, count, sales }] }
 */
async function salesTrend() {
  const now = new Date()
  // 近 7 天（含今天）的起点
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
  const paidStatus = [1, 2, 3, 4]

  // 趋势：逐日聚合。云开发 aggregate 不便按本地时区分日，
  // 改用「取出近 7 天已支付订单，内存按日归并」的稳妥做法（单量级小，性能可接受）。
  const orderRes = await db
    .collection('orders')
    .where({ status: _.in(paidStatus), payTime: _.gte(start) })
    .field({ payTime: true, payAmount: true })
    .limit(1000)
    .get()

  const byDay = {}
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + i)
    byDay[dayKey(d)] = { date: dayKey(d), sales: 0, count: 0 }
  }
  for (const o of orderRes.data || []) {
    if (!o.payTime) continue
    const k = dayKey(new Date(o.payTime))
    if (!byDay[k]) continue
    byDay[k].sales += Number(o.payAmount) || 0
    byDay[k].count += 1
  }
  const trend = Object.keys(byDay)
    .sort()
    .map((k) => byDay[k])

  // 热销榜：按商品聚合近 7 天销量与销售额，取前 5
  const salesOrders = await db
    .collection('orders')
    .where({ status: _.in(paidStatus), payTime: _.gte(start) })
    .field({ goodsList: true })
    .limit(1000)
    .get()

  const agg = {}
  for (const o of salesOrders.data || []) {
    for (const g of o.goodsList || []) {
      const pid = g.productId
      if (!pid) continue
      if (!agg[pid]) {
        agg[pid] = {
          productId: pid,
          name: g.name || '',
          image: g.image || '',
          count: 0,
          sales: 0
        }
      }
      agg[pid].count += Number(g.count) || 0
      agg[pid].sales += (Number(g.price) || 0) * (Number(g.count) || 0)
    }
  }
  const hotList = Object.keys(agg)
    .map((k) => agg[k])
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  return ok({ trend, hotList, updatedAt: Date.now() })
}

/** 生成 YYYY-MM 日期键（本地时区） */
function dayKey(d) {
  const p = (n) => (n < 10 ? `0${n}` : String(n))
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  if (getAdminOpenids().indexOf(OPENID) < 0) {
    return fail(403, '当前账号没有管理权限')
  }

  const auth = verifyToken(event.token, OPENID)
  if (!auth.ok) return fail(401, auth.msg)

  const action = event.action || 'overview'
  try {
    switch (action) {
      case 'overview':
        return await overview()
      case 'salesTrend':
        return await salesTrend()
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[stats] 执行异常', action, err)
    return fail(500, '统计服务异常，请稍后重试')
  }
}
