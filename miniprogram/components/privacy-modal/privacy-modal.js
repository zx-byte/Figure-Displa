// components/privacy-modal/privacy-modal.js
// 首次进入的协议确认弹窗。
//
// 定位说明：这个弹窗承担的是「知情告知」，不是微信官方的隐私授权流程。
// 微信官方的《小程序用户隐私保护指引》弹窗由平台在首次调用隐私接口时自行弹出，
// 前提是在公众平台后台配置了指引内容（见 README「隐私合规配置」一节）。
// 两者不冲突：官方弹窗管「是否授权接口调用」，本弹窗管「有没有看过我们的条款」。
//
// 选择「暂不使用」不做强制退出——微信审核明确禁止拒绝授权即退出小程序，
// 这里只提示功能受限，用户仍可浏览不涉及个人信息的内容。

Component({
  properties: {
    /** 是否显示 */
    show: {
      type: Boolean,
      value: false
    }
  },

  methods: {
    /** 阻止弹窗内滚动穿透到页面 */
    noop() {},

    /** 查看隐私政策 */
    onOpenPrivacy() {
      wx.navigateTo({ url: '/pages/privacy/privacy?tab=privacy' })
    },

    /** 查看用户协议 */
    onOpenTerms() {
      wx.navigateTo({ url: '/pages/privacy/privacy?tab=terms' })
    },

    /** 同意 */
    onAgree() {
      this.triggerEvent('agree')
    },

    /** 暂不使用 */
    onDisagree() {
      this.triggerEvent('disagree')
    }
  }
})
