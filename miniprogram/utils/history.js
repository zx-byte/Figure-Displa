// utils/history.js
// 浏览历史：本地存储，不上云。
// 只存展示需要的几个字段，避免把整个商品对象塞进 storage（有容量上限）。

const KEY = 'VIEW_HISTORY'
const MAX = 30

/**
 * 记录一次浏览
 * @param {object} product 商品对象
 */
function add(product) {
  if (!product || !product._id) return

  const item = {
    _id: product._id,
    name: product.name,
    cover: product.cover || '',
    price: product.price || 0,
    time: Date.now()
  }

  // 已存在则提到最前，保证最近浏览在最上面
  const rest = list().filter((x) => x._id !== item._id)
  rest.unshift(item)

  try {
    wx.setStorageSync(KEY, rest.slice(0, MAX))
  } catch (e) {
    console.warn('[history] 写入失败', e)
  }
}

/**
 * 读取历史列表
 * @returns {Array}
 */
function list() {
  try {
    const data = wx.getStorageSync(KEY)
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

/** 清空历史 */
function clear() {
  try {
    wx.removeStorageSync(KEY)
  } catch (e) {
    console.warn('[history] 清空失败', e)
  }
}

/**
 * 删除单条
 * @param {string} id 商品 ID
 */
function remove(id) {
  const rest = list().filter((x) => x._id !== id)
  try {
    wx.setStorageSync(KEY, rest)
  } catch (e) {
    console.warn('[history] 删除失败', e)
  }
}

module.exports = { add, list, clear, remove }
