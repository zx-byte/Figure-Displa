// utils/format.js
// 展示层格式化：金额、时间、状态文本。金额在数据层一律以「分」为整数存储，
// 仅在渲染时转元，避免浮点误差。

const { ORDER_STATUS_MAP, CUSTOM_STATUS_MAP } = require('../config/constants')

/**
 * 分转元字符串，保留两位小数
 * @param {number} fen 金额（分）
 * @param {boolean} withSymbol 是否带 ¥ 前缀
 * @returns {string} 如 '268.00' 或 '¥268.00'
 */
function fenToYuan(fen, withSymbol = false) {
  const value = Number(fen)
  if (!isFinite(value)) return withSymbol ? '¥0.00' : '0.00'
  const text = (value / 100).toFixed(2)
  return withSymbol ? `¥${text}` : text
}

/**
 * 元转分，用于把用户输入折算为整数分
 * @param {number|string} yuan
 * @returns {number} 整数分
 */
function yuanToFen(yuan) {
  const value = Number(yuan)
  if (!isFinite(value) || value < 0) return 0
  return Math.round(value * 100)
}

/** 补零 */
function pad(n) {
  return n < 10 ? `0${n}` : String(n)
}

/**
 * 把各种入参统一转为 Date
 * 云端返回的时间字段可能是 Date、时间戳或 ISO 字符串；
 * ISO 字符串（含 T 与 Z）可直接解析，普通「YYYY-MM-DD HH:mm」在 iOS 上需换成分隔符。
 * @param {number|string|Date} input
 * @returns {Date|null}
 */
function toDate(input) {
  if (!input) return null
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input

  if (typeof input === 'number') {
    const d = new Date(input)
    return isNaN(d.getTime()) ? null : d
  }

  const text = String(input)
  let d = new Date(text)
  if (!isNaN(d.getTime())) return d

  d = new Date(text.replace(/-/g, '/'))
  return isNaN(d.getTime()) ? null : d
}

/**
 * 时间格式化
 * @param {number|string|Date} input 时间戳、ISO 字符串或 Date
 * @param {string} pattern 'datetime' | 'date' | 'time' | 'short'
 * @returns {string}
 */
function formatTime(input, pattern = 'datetime') {
  const date = toDate(input)
  if (!date) return ''

  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const hh = pad(date.getHours())
  const mm = pad(date.getMinutes())

  switch (pattern) {
    case 'date':
      return `${y}-${m}-${d}`
    case 'time':
      return `${hh}:${mm}`
    case 'short':
      return `${m}-${d} ${hh}:${mm}`
    default:
      return `${y}-${m}-${d} ${hh}:${mm}`
  }
}

/**
 * 相对时间描述
 * @param {number|string|Date} input
 * @returns {string} 如 '刚刚'、'3 分钟前'、'2 天前'
 */
function fromNow(input) {
  const date = toDate(input)
  if (!date) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
  if (diff < 30 * 24 * 60 * 60 * 1000) return `${Math.floor(diff / 86400000)} 天前`
  return formatTime(input, 'date')
}

/**
 * 订单状态文案
 * @param {number} status
 * @returns {string}
 */
function orderStatusText(status) {
  const item = ORDER_STATUS_MAP[status]
  return item ? item.text : '未知状态'
}

/** 订单状态补充说明 */
function orderStatusDesc(status) {
  const item = ORDER_STATUS_MAP[status]
  return item ? item.desc : ''
}

/**
 * 定制单状态文案
 * @param {number} status
 * @returns {string}
 */
function customStatusText(status) {
  const item = CUSTOM_STATUS_MAP[status]
  return item ? item.text : '未知状态'
}

/** 定制单状态补充说明 */
function customStatusDesc(status) {
  const item = CUSTOM_STATUS_MAP[status]
  return item ? item.desc : ''
}

/**
 * 剩余支付时间文案
 * @param {number} createTimestamp 订单创建时间戳（毫秒）
 * @param {number} expireMinutes 有效分钟数，默认 15
 * @returns {string} 如 '14:32'，已超时返回 '00:00'
 */
function payCountdown(createTimestamp, expireMinutes = 15) {
  const deadline = createTimestamp + expireMinutes * 60 * 1000
  const left = deadline - Date.now()
  if (left <= 0) return '00:00'
  const totalSeconds = Math.floor(left / 1000)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${pad(m)}:${pad(s)}`
}

/**
 * 手机号脱敏
 * @param {string} phone
 * @returns {string} 如 '138****8000'
 */
function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || ''
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`
}

/**
 * 数量文案压缩，超过 9999 显示 9999+
 * @param {number} n
 */
function compactNumber(n) {
  const value = Number(n) || 0
  return value > 9999 ? '9999+' : String(value)
}

module.exports = {
  fenToYuan,
  yuanToFen,
  toDate,
  formatTime,
  fromNow,
  orderStatusText,
  orderStatusDesc,
  customStatusText,
  customStatusDesc,
  payCountdown,
  maskPhone,
  compactNumber
}
