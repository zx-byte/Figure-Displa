// pages/favorite/favorite.js
// 收藏夹：展示已收藏作品，支持取消收藏与进入详情。

const { query, call } = require('../../utils/cloud')
const toast = require('../../utils/toast')
const share = require('../../utils/share')

Page({
  data: {
    list: [],
    loading: true,
    loadError: false
  },

  onShow() {
    this.loadList()
  },

  onPullDownRefresh() {
    this.loadList(() => wx.stopPullDownRefresh())
  },

  /**
   * 加载收藏列表
   * @param {function} done 完成回调
   */
  loadList(done) {
    query('favorite', 'list', {}, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadError: true })
          return
        }
        this.setData({
          loading: false,
          loadError: false,
          list: (res.data && res.data.list) || []
        })
      })
      .finally(() => {
        if (typeof done === 'function') done()
      })
  },

  /** 取消收藏 */
  onRemove(e) {
    const id = e.currentTarget.dataset.id
    toast.confirm('确定取消收藏这件作品吗？', { confirmText: '取消收藏' }).then((ok) => {
      if (!ok) return
      call('favorite', 'toggle', { productId: id }, { loading: true, loadingText: '处理中' }).then(
        (res) => {
          if (res.code === 0) {
            toast.success('已取消收藏')
            this.loadList()
          }
        }
      )
    })
  },

  /** 去逛逛 */
  goShopping() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  /** 重试 */
  onRetry() {
    this.loadList()
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
