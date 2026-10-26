// utils/admin.js
// 管理端调用封装：自动携带令牌，令牌失效时统一清理并引导重新登录。

const { call } = require('./cloud')
const { STORAGE_KEYS } = require('../config/constants')
const toast = require('./toast')

/**
 * 读取本地令牌
 * @returns {string} token 字符串，无则返回空串
 */
function getToken() {
  const cached = wx.getStorageSync(STORAGE_KEYS.ADMIN_TOKEN)
  if (!cached || !cached.token) return ''
  // 本地先判断过期，减少一次无意义的网络请求
  if (cached.expireAt && cached.expireAt <= Date.now()) return ''
  return cached.token
}

/** 是否已登录管理后台 */
function isLoggedIn() {
  return !!getToken()
}

/** 保存令牌 */
function saveToken(token, expireAt) {
  wx.setStorageSync(STORAGE_KEYS.ADMIN_TOKEN, { token, expireAt })
}

/** 清除令牌 */
function clearToken() {
  wx.removeStorageSync(STORAGE_KEYS.ADMIN_TOKEN)
}

/** 令牌失效后统一跳转登录页 */
function redirectToLogin() {
  clearToken()
  wx.redirectTo({ url: '/pages/admin/login/login' })
}

/**
 * 调用管理接口
 * @param {string} action 业务动作
 * @param {object} data 参数
 * @param {object} options 透传给 cloud.call 的选项
 * @returns {Promise<{code:number,msg:string,data:any}>}
 */
function callAdmin(action, data = {}, options = {}) {
  const token = getToken()
  if (!token) {
    redirectToLogin()
    return Promise.resolve({ code: 401, msg: '请先登录管理后台', data: null })
  }

  return call('admin', action, Object.assign({ token }, data), options).then((res) => {
    if (res.code === 401) {
      toast.error(res.msg || '登录已过期')
      setTimeout(redirectToLogin, 900)
    }
    return res
  })
}

/**
 * 调用统计接口
 * @param {string} action
 * @param {object} data
 * @param {object} options
 */
function callStats(action, data = {}, options = {}) {
  const token = getToken()
  if (!token) {
    redirectToLogin()
    return Promise.resolve({ code: 401, msg: '请先登录管理后台', data: null })
  }

  return call('stats', action, Object.assign({ token }, data), options).then((res) => {
    if (res.code === 401) {
      toast.error(res.msg || '登录已过期')
      setTimeout(redirectToLogin, 900)
    }
    return res
  })
}

module.exports = {
  getToken,
  isLoggedIn,
  saveToken,
  clearToken,
  redirectToLogin,
  callAdmin,
  callStats
}
