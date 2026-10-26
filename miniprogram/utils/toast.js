// utils/toast.js
// 统一交互反馈。避免各页面各自调用 wx.showToast 造成图标、时长不一致。

/**
 * 轻提示
 * @param {string} title 文案
 * @param {string} icon 'none' | 'success' | 'error'
 */
function tip(title, icon = 'none') {
  wx.showToast({ title, icon, duration: 2000 })
}

function success(title = '操作成功') {
  wx.showToast({ title, icon: 'success', duration: 1500 })
}

function error(title = '操作失败') {
  wx.showToast({ title, icon: 'none', duration: 2200 })
}

function info(title) {
  wx.showToast({ title, icon: 'none', duration: 2000 })
}

function loading(title = '加载中') {
  wx.showLoading({ title, mask: true })
}

function hide() {
  wx.hideLoading()
}

/**
 * 确认弹窗
 * @param {string} content 正文
 * @param {object} options { title, confirmText, cancelText, confirmColor }
 * @returns {Promise<boolean>} 用户是否点击确认
 */
function confirm(content, options = {}) {
  const {
    title = '提示',
    confirmText = '确定',
    cancelText = '取消',
    confirmColor = '#FF5C39'
  } = options
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText,
      confirmColor,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    })
  })
}

/**
 * 仅提示型弹窗，用于错误说明
 * @param {string} content
 * @param {string} title
 * @returns {Promise<void>} 用户点击「知道了」后 resolve
 */
function alert(content, title = '提示') {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#FF5C39',
      complete: () => resolve()
    })
  })
}

module.exports = {
  tip,
  success,
  error,
  info,
  loading,
  hide,
  confirm,
  alert
}
