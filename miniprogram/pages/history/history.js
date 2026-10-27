// pages/history/history.js
// 浏览历史：数据来自本地存储，不发网络请求。

const history = require('../../utils/history')
const { fenToYuan } = require('../../utils/format')
const share = require('../../utils/share')

/**
 * 相对时间文案
 * @param {number} ts 时间戳
 */
function relativeTime(ts) {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  return '更早'
}

Page({
  data: {
    list: []
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '浏览历史' })
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const list = history.list().map((item) =>
      Object.assign({}, item, {
        priceText: fenToYuan(item.price),
        timeText: relativeTime(item.time)
      })
    )
    this.setData({ list })
  },

  onTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpackages/works/pages/detail/detail?id=${id}` })
  },

  onClear() {
    if (this.data.list.length === 0) return
    wx.showModal({
      title: '清空浏览记录',
      content: '清空后无法恢复',
      confirmColor: '#FF5C39',
      success: (res) => {
        if (res.confirm) {
          history.clear()
          this.refresh()
        }
      }
    })
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' })
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
