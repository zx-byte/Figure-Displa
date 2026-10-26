// pages/user/user.js
// 个人中心：资料展示与编辑、订单快捷入口、常用功能、管理后台入口。

const app = getApp()
const { call } = require('../../utils/cloud')
const { STORAGE_KEYS, ORDER_TABS, SHOW_TRADE } = require('../../config/constants')
const toast = require('../../utils/toast')

Page({
  data: {
    openid: '',
    nickname: '',
    avatar: '',
    phone: '',
    isAdmin: false,
    /** 是否开启交易入口（false 时隐藏订单与地址） */
    showTrade: SHOW_TRADE,

    /** 订单快捷入口 */
    orderEntries: [
      { label: '待付款', status: 0, symbol: '¥' },
      { label: '待发货', status: 1, symbol: '□' },
      { label: '待收货', status: 2, symbol: '⇥' },
      { label: '已完成', status: 3, symbol: '✓' }
    ],

    /** 编辑弹层 */
    editVisible: false,
    editNickname: '',
    editAvatar: '',
    saving: false,

    /** 协议确认弹窗是否显示 */
    privacyShow: false
  },

  onShow() {
    this.syncUser()

    // 未同意当前版本协议时提示（首页已提示过则本次会话不再重复）
    if (app.needPrivacy()) {
      this.setData({ privacyShow: true })
    }
  },

  /** 从全局状态与本地缓存同步用户信息 */
  syncUser() {
    const cached = wx.getStorageSync(STORAGE_KEYS.USER) || {}
    const userInfo = app.globalData.userInfo || cached.userInfo || {}

    this.setData({
      openid: app.globalData.openid || cached.openid || '',
      nickname: userInfo.nickname || '',
      avatar: userInfo.avatar || '',
      phone: userInfo.phone || '',
      isAdmin: !!app.globalData.isAdmin
    })

    // 全局状态尚未就绪时，等登录完成后刷新一次
    if (!this.data.openid) {
      app.ready().then(() => this.syncUser())
    }
  },

  /** 订单列表跳转 */
  goOrderList(e) {
    const status = e.currentTarget.dataset.status
    const url =
      status === undefined || status === null || status === 'all'
        ? '/pages/order-list/order-list'
        : `/pages/order-list/order-list?status=${status}`
    wx.navigateTo({ url })
  },

  /** 收货地址 */
  goAddress() {
    wx.navigateTo({ url: '/pages/address/address' })
  },

  /** 收藏夹 */
  goFavorite() {
    wx.navigateTo({ url: '/pages/favorite/favorite' })
  },

  /** 定制订单 */
  goCustomList() {
    wx.navigateTo({ url: '/pages/custom-list/custom-list' })
  },

  /** 提交新的定制需求 */
  goCustomApply() {
    wx.navigateTo({ url: '/pages/custom-apply/custom-apply' })
  },

  /** 进入管理后台：已持有令牌直接进概览，否则先验证口令 */
  goAdmin() {
    const token = wx.getStorageSync(STORAGE_KEYS.ADMIN_TOKEN)
    if (token && token.expireAt && token.expireAt > Date.now()) {
      wx.navigateTo({ url: '/pages/admin/dashboard/dashboard' })
      return
    }
    wx.navigateTo({ url: '/pages/admin/login/login' })
  },

  /* ---------------- 资料编辑 ---------------- */

  openEdit() {
    this.setData({
      editVisible: true,
      editNickname: this.data.nickname,
      editAvatar: this.data.avatar
    })
  },

  closeEdit() {
    this.setData({ editVisible: false })
  },

  /** 阻止弹层内部点击穿透关闭 */
  noop() {},

  onNicknameInput(e) {
    this.setData({ editNickname: e.detail.value })
  },

  /** 选择头像（微信头像昵称填写能力） */
  onChooseAvatar(e) {
    const tempPath = e.detail.avatarUrl
    if (!tempPath) return
    const { upload } = require('../../utils/cloud')
const share = require('../../utils/share')
    upload(tempPath, 'avatar', { loadingText: '上传头像' }).then((fileID) => {
      if (fileID) this.setData({ editAvatar: fileID })
    })
  },

  /** 保存资料 */
  onSaveProfile() {
    if (this.data.saving) return
    const nickname = String(this.data.editNickname || '').trim()
    if (!nickname) {
      toast.info('请填写昵称')
      return
    }

    this.setData({ saving: true })

    // 昵称会出现在客服会话与商家后台，属对外展示内容，保存前过一遍内容安全。
    // 检测服务不可用时不阻塞保存（code !== 0），只拦明确判定的违规。
    call('security', 'text', { content: nickname }, { showError: false })
      .then((check) => {
        if (check.code === 0 && !check.data.pass) {
          this.setData({ saving: false })
          toast.alert('昵称包含不当内容，请更换')
          return null
        }
        return call(
          'login',
          'updateProfile',
          { nickname, avatar: this.data.editAvatar },
          { showError: false }
        )
      })
      .then((res) => {
        if (!res) return

        this.setData({ saving: false })
        if (res.code !== 0) {
          toast.error(res.msg || '保存失败')
          return
        }

        const userInfo = Object.assign({}, app.globalData.userInfo, { nickname })
        if (this.data.editAvatar) userInfo.avatar = this.data.editAvatar
        app.globalData.userInfo = userInfo

        const cached = wx.getStorageSync(STORAGE_KEYS.USER) || {}
        wx.setStorageSync(STORAGE_KEYS.USER, Object.assign({}, cached, { userInfo }))

        this.setData({
          nickname,
          avatar: this.data.editAvatar,
          editVisible: false
        })
        toast.success('已保存')
      })
      .catch(() => {
        this.setData({ saving: false })
        toast.error('保存异常，请稍后重试')
      })
  },

  /** 联系客服 */
  onContact() {
    toast.info('请点击下方客服按钮发起会话')
  },

  /** 浏览历史 */
  goHistory() {
    wx.navigateTo({ url: '/pages/history/history' })
  },

  /** 作品编号查询 */
  goVerify() {
    wx.navigateTo({ url: '/pages/verify/verify' })
  },

  /** 关于 */
  goAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  /** 隐私政策 */
  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=privacy' })
  },

  /** 用户协议 */
  goTerms() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=terms' })
  },

  /* ---------------- 协议确认 ---------------- */

  /** 同意协议 */
  onPrivacyAgree() {
    app.agreePrivacy()
    this.setData({ privacyShow: false })
  },

  /** 暂不使用：仅关闭弹窗，不禁用浏览 */
  onPrivacyDisagree() {
    app.dismissPrivacy()
    this.setData({ privacyShow: false })
    toast.info('可继续浏览作品，收藏与定制需先同意协议')
  },

  /** 转发给朋友 */
  onShareAppMessage() {
    return share.defaultShare()
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return share.timelineShare()
  }
})
