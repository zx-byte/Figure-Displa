// utils/share.js
// 分享配置统一生成，避免每个页面各写一份标题和路径。
//
// 小程序的转发默认是关闭的，页面不实现 onShareAppMessage 时，
// 右上角菜单里的「转发」是灰色不可点的。手作展示靠传播，这是必须补的。

const { SHOW_TRADE } = require('../config/constants')

/**
 * 商品分享卡片
 * @param {object} product 商品对象
 * @param {string} from 来源页面标识，用于区分统计
 */
function productShare(product, from = 'detail') {
  if (!product) return defaultShare()
  return {
    title: product.name + (product.subtitle ? ' · ' + product.subtitle : ''),
    path: `/pages/detail/detail?id=${product._id}&from=${from}`,
    imageUrl: product.cover || ''
  }
}

/**
 * 360° 环视分享
 * @param {object} product 商品对象
 */
function panoramaShare(product) {
  if (!product) return defaultShare()
  return {
    title: `${product.name} · 360° 环视`,
    path: `/pages/panorama/panorama?id=${product._id}`,
    imageUrl: product.cover || ''
  }
}

/**
 * 默认分享（首页、分类、我的等）
 */
function defaultShare() {
  return {
    title: SHOW_TRADE ? '拾光手办 · 手作模型与专属定制' : '拾光手办 · 手作模型作品集',
    path: '/pages/index/index',
    imageUrl: '/images/demo/demo-1.jpg'
  }
}

/**
 * 朋友圈分享（onShareTimeline）
 * 朋友圈只能带 query，不能带完整 path，且只对当前页面生效
 * @param {object} product 商品对象，传了就用商品信息
 */
function timelineShare(product) {
  if (!product) {
    return { title: '拾光手办 · 手作模型作品集' }
  }
  return {
    title: product.name,
    query: `id=${product._id}`,
    imageUrl: product.cover || ''
  }
}

module.exports = {
  productShare,
  panoramaShare,
  defaultShare,
  timelineShare
}
