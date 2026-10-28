// utils/favorite.js
// 收藏夹：本地存储，不上云。
//
// 纯展示形态没有用户体系，收藏只在这台设备有效，存本地即可；
// 不写 openid、不落库，也就谈不上「收集个人信息」，无需协议前置。
// 云开发连通后由 favorite 云函数接管（users.favorites），本模块不再被调用。
//
// 存储结构与 favorite 云函数返回的商品摘要保持一致，
// 这样列表页在做云 / 本地切换时不需要改渲染字段。

const KEY = 'FAVORITE_LIST'
/** 与云函数 MAX_FAVORITES 一致 */
const MAX = 200

/** 只保留列表渲染需要的字段，整条作品塞进 storage 会撑大占用 */
const FIELDS = ['_id', 'name', 'subtitle', 'price', 'originPrice', 'cover', 'type', 'stock', 'status']

/** Node 环境（自检脚本）下没有 wx，直接当作空收藏，不抛错 */
function available() {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function'
}

/**
 * 裁剪成列表项
 * @param {object} item 作品对象
 * @returns {object}
 */
function slim(item) {
  const out = {}
  FIELDS.forEach((f) => {
    if (item[f] !== undefined) out[f] = item[f]
  })
  out.favoritedAt = Date.now()
  return out
}

/**
 * 读取收藏列表，最近收藏在前
 * @returns {Array}
 */
function list() {
  if (!available()) return []
  try {
    const data = wx.getStorageSync(KEY)
    return Array.isArray(data) ? data : []
  } catch (e) {
    console.warn('[favorite] 读取失败', e)
    return []
  }
}

/**
 * 是否已收藏
 * @param {string} id 作品 ID
 * @returns {boolean}
 */
function has(id) {
  if (!id) return false
  return list().some((x) => x._id === id)
}

/**
 * 写入整份列表
 * @param {Array} items
 */
function save(items) {
  if (!available()) return
  try {
    wx.setStorageSync(KEY, items.slice(0, MAX))
  } catch (e) {
    console.warn('[favorite] 写入失败', e)
  }
}

/**
 * 切换收藏状态
 * @param {object} item 作品对象，至少含 _id
 * @returns {{favorited: boolean, count: number}}
 */
function toggle(item) {
  const current = list()
  if (!item || !item._id) return { favorited: false, count: current.length }

  const exists = current.some((x) => x._id === item._id)
  let next
  if (exists) {
    next = current.filter((x) => x._id !== item._id)
  } else {
    if (current.length >= MAX) return { favorited: false, count: current.length, full: true }
    next = [slim(item)].concat(current)
  }

  save(next)
  return { favorited: !exists, count: next.length }
}

/**
 * 取消收藏
 * @param {string} id 作品 ID
 * @returns {number} 剩余数量
 */
function remove(id) {
  const next = list().filter((x) => x._id !== id)
  save(next)
  return next.length
}

/** 清空收藏 */
function clear() {
  if (!available()) return
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.warn('[favorite] 清空失败', e)
  }
}

module.exports = { list, has, toggle, remove, clear }
