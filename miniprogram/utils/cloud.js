// utils/cloud.js
// 云函数调用统一封装：集中处理 loading、超时、错误码映射与失败提示。
// 页面不直接调用 wx.cloud.callFunction，所有后端访问经由本模块。
//
// 演示降级：当云开发环境未创建或云函数未部署时，真实的调用会持续失败，
// 页面将整屏空白。此时自动降级到 config/mock.js 的演示数据，让 UI 可以完整预览。
// 降级只在「环境不存在 / 函数未找到」这类错误上触发，网络错误不会降级。
// 云环境就绪后不会走到该分支，无需改动任何代码。

const mock = require('../config/mock')
const { DEMO_MODE } = require('../config/constants')

const DEFAULT_TIMEOUT = 15000

/** 云开发是否已被判定为不可用（实例级标记，判定后不再尝试真实调用） */
let cloudBroken = false
/** 是否已提示过降级 */
let fallbackNotified = false

/** 业务错误码到用户可读文案的映射（云函数未给出 msg 时兜底） */
const CODE_TEXT = {
  401: '登录状态已失效，请重新进入小程序',
  403: '没有操作权限',
  404: '请求的内容不存在或已下架',
  429: '操作过于频繁，请稍后再试',
  500: '服务开小差了，请稍后重试'
}

/**
 * 判断错误是否属于「云开发未就绪」
 * 覆盖：环境不存在、云函数未部署、云开发未初始化
 * @param {object} err 原始错误
 */
function isEnvError(err) {
  const msg = String((err && (err.errMsg || err.message)) || '')
  const code = err && (err.errCode || err.code)

  // -501000 函数不存在；-501001 环境不存在；-404011 云资源未找到
  if (code === -501000 || code === -501001 || code === -404011) return true

  return /env|environment|FUNCTION_NOT_FOUND|FunctionName|function not found|云开发|环境不存在|未初始化/i.test(
    msg
  )
}

/** 首次降级时提示一次，避免用户误以为看到的是真实数据 */
function notifyFallback() {
  if (fallbackNotified) return
  fallbackNotified = true
  console.warn(
    '[cloud] 云开发环境未就绪，已切换到演示数据。配置环境并部署云函数后自动恢复真实数据，无需改代码。'
  )
  // 降级可能发生在 onLaunch 阶段，此时页面栈尚未就绪，延迟一点再提示
  setTimeout(() => {
    wx.showToast({
      title: '云开发未就绪，当前为演示数据',
      icon: 'none',
      duration: 3200
    })
  }, 700)
}

/** 演示模式提示，只在首次调用时出现 */
function notifyDemoMode() {
  if (fallbackNotified) return
  fallbackNotified = true
  console.info(
    '[cloud] 演示模式已开启（config/constants.js 的 DEMO_MODE = true），所有数据来自 config/mock.js。上线前请改为 false。'
  )
  setTimeout(() => {
    wx.showToast({
      title: '演示模式 · 本地数据',
      icon: 'none',
      duration: 2500
    })
  }, 700)
}

/**
 * 调用云函数
 * @param {string} name 云函数名，如 'product'
 * @param {string} action 业务动作，如 'list'，云函数内按 action 分发
 * @param {object} data 业务参数（不含 action，函数内部自动合并）
 * @param {object} options 可选项
 *   - loading {boolean} 是否显示全屏 loading，默认 false
 *   - loadingText {string} loading 文案，默认 '加载中'
 *   - showError {boolean} 失败时是否自动弹提示，默认 true
 *   - timeout {number} 超时毫秒，默认 15000
 *   - retry {number} 失败后重试次数，默认 0（仅只读接口建议开启）
 * @returns {Promise<{code:number,msg:string,data:any}>} 始终 resolve；失败时 resolve 出非 0 的 code
 */
function call(name, action, data = {}, options = {}) {
  const {
    loading = false,
    loadingText = '加载中',
    showError = true,
    timeout = DEFAULT_TIMEOUT,
    retry = 0
  } = options

  // 演示模式：强制使用本地数据，不发起任何云调用
  if (DEMO_MODE) {
    notifyDemoMode()
    return Promise.resolve(mock.handle(name, action, data))
  }

  // 已判定云开发不可用，或当前基础库不支持云开发，直接走演示数据
  if (cloudBroken || !wx.cloud) {
    cloudBroken = true
    notifyFallback()
    return Promise.resolve(mock.handle(name, action, data))
  }

  if (loading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  const invoke = () =>
    new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        resolve({ code: 504, msg: '网络超时，请检查网络后重试', data: null, timeout: true })
      }, timeout)

      wx.cloud
        .callFunction({
          name,
          data: Object.assign({ action }, data)
        })
        .then((res) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          const result = (res && res.result) || {}
          resolve({
            code: typeof result.code === 'number' ? result.code : 500,
            msg: result.msg || '',
            data: result.data === undefined ? null : result.data
          })
        })
        .catch((err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          console.error(`[cloud] ${name}.${action} 调用失败`, err)

          // 云开发未就绪 —— 降级到演示数据，而不是让页面空白
          if (isEnvError(err)) {
            cloudBroken = true
            notifyFallback()
            resolve(mock.handle(name, action, data))
            return
          }

          resolve({
            code: 500,
            msg: '网络异常，请稍后重试',
            data: null,
            error: err
          })
        })
    })

  return invoke()
    .then((result) => {
      if (result.code === 0 || retry <= 0) {
        return { result, retried: 0 }
      }
      // 仅对超时与网络类失败做重试，业务失败不重试
      if (result.code === 504 || result.code === 500) {
        return invoke().then((second) => ({ result: second, retried: 1 }))
      }
      return { result, retried: 0 }
    })
    .then(({ result }) => {
      if (loading) {
        wx.hideLoading()
      }
      if (result.code !== 0 && showError) {
        wx.showToast({
          title: result.msg || CODE_TEXT[result.code] || '操作失败',
          icon: 'none',
          duration: 2200
        })
      }
      return result
    })
}

/** 只读接口调用：默认自动重试一次，提升弱网下的成功率 */
function query(name, action, data = {}, options = {}) {
  return call(name, action, data, Object.assign({ retry: 1 }, options))
}

/**
 * 上传图片至云存储
 * @param {string} filePath 本地临时路径
 * @param {string} dir 云端目录前缀，如 'product'
 * @param {object} options { loading, loadingText }
 * @returns {Promise<string|null>} 成功返回 fileID，失败返回 null
 */
function upload(filePath, dir = 'common', options = {}) {
  const { loading = true, loadingText = '上传中' } = options
  const ext = (filePath.match(/\.(\w+)$/) || [, 'jpg'])[1]
  const cloudPath = `${dir}/${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`

  if (loading) {
    wx.showLoading({ title: loadingText, mask: true })
  }

  return wx.cloud
    .uploadFile({ cloudPath, filePath })
    .then((res) => {
      if (loading) wx.hideLoading()
      return res.fileID
    })
    .catch((err) => {
      if (loading) wx.hideLoading()
      console.error('[cloud] 上传失败', err)
      wx.showToast({ title: '图片上传失败', icon: 'none' })
      return null
    })
}

/**
 * 批量上传
 * @param {string[]} filePaths 本地临时路径数组
 * @param {string} dir 云端目录前缀
 * @returns {Promise<string[]>} 成功的 fileID 数组，顺序与入参一致
 */
function uploadBatch(filePaths, dir = 'common') {
  const tasks = filePaths.map((p) => upload(p, dir, { loading: false }))
  wx.showLoading({ title: `上传中 0/${filePaths.length}`, mask: true })
  let done = 0
  return Promise.all(
    tasks.map((task) =>
      task.then((id) => {
        done += 1
        wx.showLoading({ title: `上传中 ${done}/${filePaths.length}`, mask: true })
        return id
      })
    )
  ).then((ids) => {
    wx.hideLoading()
    return ids.filter(Boolean)
  })
}

module.exports = {
  call,
  query,
  upload,
  uploadBatch
}
