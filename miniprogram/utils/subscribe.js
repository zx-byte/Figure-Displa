// utils/subscribe.js
// 订阅消息一次性授权封装。
//
// 订阅消息是「一次性订阅」：用户在系统弹窗点「允许」后，服务端才能就一次事件下发一条。
// 本模块负责在合适的时机征订模板，并把模板 ID 未配置的情况优雅跳过，避免误弹空窗。
//
// 三类模板见 config/constants.js 的 SUBSCRIBE_TEMPLATES：
//   ORDER_PAID     —— 支付成功通知（服务端支付回调后下发）
//   SHIPPED        —— 发货通知（服务端发货后下发）
//   AFTERSALE_DONE —— 售后/退款结果通知（服务端售后处理后下发）
//
// 约定：模板 ID 留空时静默跳过（return { ok:true, skipped:true }），
// 页面无需关心是否已申请模板，调用即可。

const { SUBSCRIBE_TEMPLATES, SUBSCRIBE_KEYS_ON_PAY } = require('../config/constants')

/**
 * 解析出真实可用的模板 ID 列表（过滤空值）
 * @param {string[]} keys 模板键数组
 * @returns {string[]} 有效 templateId 数组
 */
function resolveIds(keys) {
  return (keys || [])
    .map((k) => SUBSCRIBE_TEMPLATES[k])
    .filter((id) => typeof id === 'string' && id)
}

/**
 * 一次性征订一个或多个模板。
 * 会唤起微信系统订阅弹窗（每个模板一行），用户可勾选允许/拒绝。
 *
 * @param {string|string[]} keys 模板键，如 'SHIPPED' 或 ['SHIPPED','AFTERSALE_DONE']
 * @param {object} options 可选
 *   - silent {boolean} 失败/拒绝时是否静默（默认 true），避免打断主流程
 * @returns {Promise<{ok:boolean, skipped?:boolean, accepted:string[], rejected:string[]}>}
 *   - skipped:true 表示模板未配置，未弹窗
 */
function requestSubscribe(keys, options = {}) {
  const { silent = true } = options
  const list = Array.isArray(keys) ? keys : [keys]
  const ids = resolveIds(list)

  if (ids.length === 0) {
    // 模板尚未申请，静默跳过，不打扰用户
    return Promise.resolve({ ok: true, skipped: true, accepted: [], rejected: [] })
  }

  // 基础库不支持订阅消息时跳过
  if (!wx.requestSubscribeMessage) {
    return Promise.resolve({ ok: true, skipped: true, accepted: [], rejected: [] })
  }

  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: (res) => {
        const accepted = []
        const rejected = []
        // res 结构：{ [templateId]: 'accept' | 'reject' | 'ban' | 'filter' }
        ids.forEach((id) => {
          const state = res[id]
          if (state === 'accept') accepted.push(id)
          else rejected.push(id)
        })
        resolve({ ok: true, accepted, rejected })
      },
      fail: (err) => {
        console.warn('[subscribe] 征订失败', err)
        if (!silent) {
          wx.showToast({ title: '订阅消息开启失败', icon: 'none' })
        }
        resolve({ ok: false, accepted: [], rejected: ids, error: err })
      }
    })
  })
}

/**
 * 支付前征订「发货通知 + 售后结果通知」。
 * 放在支付按钮回调里调用，与支付动作串联，符合「用户主动触发」的弹窗要求。
 * @returns {Promise<{ok:boolean, skipped?:boolean}>}
 */
function requestPayFollowUps() {
  return requestSubscribe(SUBSCRIBE_KEYS_ON_PAY, { silent: true })
}

module.exports = {
  requestSubscribe,
  requestPayFollowUps,
  resolveIds
}
