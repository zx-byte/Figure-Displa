// utils/image.js
// 图片辅助：列表缩略图地址。
//
// 列表卡片只占几百像素宽，直出原图会白耗流量（首屏尤其明显）。
// 对象存储（COS、或云开发存储绑定的 CDN 域名）支持在 URL 后追加 imageMogr2
// 处理参数，能按需返回小尺寸图片：
//   https://xxx.tcb.qcloud.la/goods/a.jpg?imageMogr2/thumbnail/600x
//
// 但这条能力依赖图床，未开通图片处理时会直接 404，所以默认关闭。
// 确认你的存储桶支持后把 THUMBNAIL_ENABLED 置为 true 即可全局生效。
// 无法处理的地址一律原样返回，不会因为开关影响现有展示。

/** 缩略图参数开关：图床不支持 imageMogr2 时务必保持 false */
const THUMBNAIL_ENABLED = false

/** 默认缩略图宽度（px），约等于两列卡片在高分屏下的实际渲染宽度 */
const DEFAULT_THUMB_WIDTH = 600

/**
 * 是否为可追加处理参数的远程地址
 * cloud:// 的 fileID 与包内 /images/ 静态资源都不支持
 * @param {string} url
 * @returns {boolean}
 */
function isRemote(url) {
  return /^https?:\/\//i.test(String(url || ''))
}

/**
 * 生成缩略图地址
 * 无法处理时返回原地址，调用方无需额外判断
 * @param {string} url 原图地址
 * @param {number} [width] 目标宽度（px）
 * @returns {string}
 */
function thumb(url, width) {
  const src = String(url || '')
  if (!src || !THUMBNAIL_ENABLED || !isRemote(src)) return src

  // 已经带处理参数的不重复追加
  if (src.indexOf('imageMogr2') > -1) return src

  const size = Math.max(80, Number(width) || DEFAULT_THUMB_WIDTH)
  const sep = src.indexOf('?') > -1 ? '&' : '?'
  return `${src}${sep}imageMogr2/thumbnail/${size}x/quality/80`
}

module.exports = {
  thumb,
  THUMBNAIL_ENABLED
}
