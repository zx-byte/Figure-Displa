// app.js
// 全局入口：初始化云开发环境、建立用户会话、维护全局状态

const { CLOUD_ENV, STORAGE_KEYS, SHOW_TRADE, PRIVACY_VERSION } = require('./config/constants')
const { call } = require('./utils/cloud')

App({
  globalData: {
    /** 云开发环境 ID，留空表示使用当前默认环境 */
    env: CLOUD_ENV,
    /** 当前用户 openid，由 login 云函数下发，前端不可伪造 */
    openid: '',
    /** 用户资料 { nickname, avatar, phone } */
    userInfo: null,
    /** 是否管理员，仅用于前端入口显隐，真正鉴权在云函数 */
    isAdmin: false,
    /** 购物车角标数量 */
    cartCount: 0,
    /** 是否已同意协议（本地存储的版本号与当前版本一致即为 true） */
    privacyAgreed: false,
    /** 本次会话内用户是否已选择「暂不使用」。不持久化，下次冷启动会再次提示 */
    privacyDismissed: false
  },

  /** 登录就绪 Promise，页面通过 app.ready() 等待其完成 */
  readyPromise: null,

  onLaunch() {
    // 云开发不可用时不做拦截，后续调用会自动降级到演示数据，
    // 保证在开发者工具里能完整预览界面（详见 utils/cloud.js 的降级说明）
    if (wx.cloud) {
      try {
        wx.cloud.init({
          env: this.globalData.env || wx.cloud.DYNAMIC_CURRENT_ENV,
          traceUser: true
        })
      } catch (err) {
        console.warn('[app] 云开发初始化失败，将使用演示数据', err)
      }
    } else {
      console.warn('[app] 当前基础库不支持云开发，将使用演示数据')
    }

    // 隐私协议：本地记录的版本号与当前版本一致才算「已同意」。
    // 条款实质变更时递增 PRIVACY_VERSION 即可让老用户重新确认。
    const agreedVersion = Number(wx.getStorageSync(STORAGE_KEYS.PRIVACY_AGREED)) || 0
    this.globalData.privacyAgreed = agreedVersion === PRIVACY_VERSION
    // 「暂不使用」只是本次会话的临时状态，冷启动后重新提示
    this.globalData.privacyDismissed = false

    // 恢复本地缓存的用户状态，保证首屏不闪烁
    const cached = wx.getStorageSync(STORAGE_KEYS.USER)
    if (cached && cached.openid) {
      this.globalData.openid = cached.openid
      this.globalData.userInfo = cached.userInfo || null
      this.globalData.isAdmin = !!cached.isAdmin
    }

    this.readyPromise = this.login()
    this.refreshCartCount()
  },

  /**
   * 静默登录：调用 login 云函数换取 openid
   * 走 utils/cloud 的封装，云开发未就绪时会自动降级为演示身份
   * 入参：无
   * 返回：Promise<{ openid, userInfo, isAdmin }>
   */
  login() {
    return call('login', 'login', {}, { showError: false, timeout: 8000 })
      .then((result) => {
        if (result.code !== 0 || !result.data) {
          throw new Error(result.msg || '登录失败')
        }
        const { openid, userInfo, isAdmin } = result.data
        this.globalData.openid = openid
        this.globalData.userInfo = userInfo
        this.globalData.isAdmin = !!isAdmin
        wx.setStorageSync(STORAGE_KEYS.USER, { openid, userInfo, isAdmin: !!isAdmin })
        return result.data
      })
      .catch((err) => {
        // 登录失败不阻塞浏览，但下单等写操作会在云函数侧被拒
        console.error('[app] 登录失败', err)
        return null
      })
  },

  /**
   * 页面等待登录完成
   * 返回：Promise，登录结束（成功或失败）后 resolve
   */
  ready() {
    if (!this.readyPromise) {
      this.readyPromise = this.login()
    }
    return this.readyPromise
  },

  /**
   * 重新登录，用于 openid 失效或切换环境后恢复
   */
  relogin() {
    this.readyPromise = this.login()
    return this.readyPromise
  },

  /**
   * 是否需要弹出协议确认
   * 返回：boolean，true 表示尚未同意当前版本的协议
   * 说明：用户选了「暂不使用」后本次会话不再打扰，但下次冷启动仍会提示，
   * 因为同意状态没有落盘。这不违反审核要求——拒绝授权不等于不能使用，
   * 只是在未同意期间不主动触达隐私接口。
   */
  needPrivacy() {
    return !this.globalData.privacyAgreed && !this.globalData.privacyDismissed
  },

  /**
   * 记录用户选择「暂不使用」
   * 入参：无
   * 返回：无
   */
  dismissPrivacy() {
    this.globalData.privacyDismissed = true
  },

  /**
   * 记录用户已同意协议
   * 入参：无
   * 返回：无
   * 说明：只存版本号，不存时间戳与设备信息，避免收集非必要数据。
   */
  agreePrivacy() {
    this.globalData.privacyAgreed = true
    try {
      wx.setStorageSync(STORAGE_KEYS.PRIVACY_AGREED, PRIVACY_VERSION)
    } catch (err) {
      console.warn('[app] 协议同意状态写入失败', err)
    }
  },

  /** 刷新购物车角标 */
  refreshCartCount() {
    const cart = wx.getStorageSync(STORAGE_KEYS.CART) || []
    const count = cart.reduce((sum, item) => sum + (item.count || 0), 0)
    this.globalData.cartCount = count
    this.setCartBadge(count)
  },

  /**
   * 设置购物车 tabBar 角标
   * 入参：count 数量，0 表示清除
   * 说明：非 tabBar 页面或 tabBar 未就绪时该调用会失败，失败即忽略，
   * 由目标页面 onShow 时的 refreshCartCount 再次刷新。
   */
  setCartBadge(count) {
    // 纯展示模式没有购物车 tab，此时 index 2 指向「我的」，不能再设角标
    if (!SHOW_TRADE) return

    if (count > 0) {
      wx.setTabBarBadge({
        index: 2,
        text: String(count > 99 ? '99+' : count),
        fail: () => {}
      })
    } else {
      wx.removeTabBarBadge({
        index: 2,
        fail: () => {}
      })
    }
  }
})
