// pages/admin/login/login.js
// 管理后台入口：口令校验。通过后保存令牌并进入数据概览。
//
// 说明：口令只在前端输入并传给云函数比对，前端不保存口令本身；
// 云函数会同时校验 openid 是否在管理员白名单内。

const app = getApp()
const { call } = require('../../../utils/cloud')
const admin = require('../../../utils/admin')
const toast = require('../../../utils/toast')

Page({
  data: {
    password: '',
    submitting: false,
    /** openid 是否已就绪 */
    ready: false
  },

  onLoad() {
    app.ready().then(() => {
      this.setData({ ready: true })
      // 已持有有效令牌时直接进入后台
      if (admin.isLoggedIn()) {
        wx.redirectTo({ url: '/pages/admin/dashboard/dashboard' })
      }
    })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  /** 提交口令 */
  onSubmit() {
    if (this.data.submitting) return

    const password = String(this.data.password || '').trim()
    if (!password) {
      toast.info('请输入管理口令')
      return
    }

    this.setData({ submitting: true })

    call('admin', 'checkAuth', { password }, { loading: true, loadingText: '验证中', showError: false })
      .then((res) => {
        this.setData({ submitting: false })
        if (res.code !== 0) {
          toast.error(res.msg || '验证失败')
          return
        }
        admin.saveToken(res.data.token, res.data.expireAt)
        toast.success('验证通过')
        setTimeout(() => {
          wx.redirectTo({ url: '/pages/admin/dashboard/dashboard' })
        }, 600)
      })
      .catch(() => {
        this.setData({ submitting: false })
        toast.error('验证异常，请稍后重试')
      })
  },

  /** 返回个人中心 */
  onBack() {
    wx.navigateBack()
  }
})
