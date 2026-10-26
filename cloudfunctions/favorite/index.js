// cloudfunctions/favorite/index.js
// 收藏夹。商品 ID 存在 users.favorites 数组中，单用户上限 200 条。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const MAX_FAVORITES = 200

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

async function getUser(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  return res.data[0] || null
}

/**
 * 收藏列表（返回商品摘要，已下架商品仍展示但标记不可购买）
 * 入参：无
 */
async function list(openid) {
  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  const ids = user.favorites || []
  if (ids.length === 0) return ok({ list: [] })

  const res = await db
    .collection('products')
    .where({ _id: _.in(ids.slice(-100)) })
    .get()

  // 按收藏顺序倒序返回，最近收藏在前
  const map = {}
  res.data.forEach((item) => {
    map[item._id] = item
  })

  const list = ids
    .slice()
    .reverse()
    .map((id) => map[id])
    .filter(Boolean)
    .map((item) => ({
      _id: item._id,
      name: item.name,
      subtitle: item.subtitle || '',
      price: item.price,
      originPrice: item.originPrice || 0,
      cover: (item.images && item.images[0]) || '',
      type: item.type,
      stock: item.stock || 0,
      status: item.status
    }))

  return ok({ list })
}

/**
 * 切换收藏状态
 * 入参：{ productId }
 * 返回：{ favorited, count }
 */
async function toggle(openid, event) {
  const productId = event.productId
  if (!productId) return fail(400, '缺少商品 ID')

  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  let favorites = user.favorites || []
  const exists = favorites.indexOf(productId) > -1

  if (exists) {
    favorites = favorites.filter((id) => id !== productId)
  } else {
    if (favorites.length >= MAX_FAVORITES) return fail(400, `收藏夹最多保存 ${MAX_FAVORITES} 件商品`)
    // 校验商品存在，避免收藏到已删除的 ID
    const check = await db.collection('products').doc(productId).get().catch(() => null)
    if (!check || !check.data) return fail(404, '商品不存在')
    favorites = favorites.concat(productId)
  }

  await db.collection('users').doc(user._id).update({ data: { favorites } })

  return ok({ favorited: !exists, count: favorites.length })
}

/**
 * 查询是否已收藏
 * 入参：{ productId }
 */
async function check(openid, event) {
  const user = await getUser(openid)
  if (!user) return ok({ favorited: false })
  const favorites = user.favorites || []
  return ok({ favorited: favorites.indexOf(event.productId) > -1 })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'list'
  try {
    switch (action) {
      case 'list':
        return await list(OPENID)
      case 'toggle':
        return await toggle(OPENID, event)
      case 'check':
        return await check(OPENID, event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[favorite] 执行异常', action, err)
    return fail(500, '收藏服务异常，请稍后重试')
  }
}
