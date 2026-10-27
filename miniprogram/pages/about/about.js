// pages/about/about.js
const share = require('../../utils/share')
const track = require('../../utils/track')
// 手作人介绍。小众品类里，「你是谁」对成交的影响大于「你卖什么」。

Page({
  data: {
    stats: [
      { num: '6', unit: '年', label: '一直在做' },
      { num: '120', unit: '+', label: '完成作品' },
      { num: '40', unit: 'h', label: '平均单件工时' }
    ]
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '关于' })
  },

  /**
   * 点击客服（open-type="contact" 触发）
   * 会话由微信接管，这里只做来源埋点；后台没配事件时内部吞掉异常。
   */
  onContactTap() {
    track.trackConsult('', 'about')
  },

  /** 隐私政策 */
  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=privacy' })
  },

  /** 用户协议 */
  goTerms() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=terms' })
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
