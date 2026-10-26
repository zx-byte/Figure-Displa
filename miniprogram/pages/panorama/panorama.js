// pages/panorama/panorama.js
// 360° 环视页。全屏沉浸式展示，左右拖动旋转作品。

const { query } = require('../../utils/cloud')
const toast = require('../../utils/toast')
const track = require('../../utils/track')

Page({
  data: {
    frames: [],
    name: '',
    loading: true,
    statusBarHeight: 20
  },

  onLoad(options) {
    const sys = wx.getSystemInfoSync()
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 })

    const id = options.id
    if (!id) {
      this.setData({ loading: false })
      toast.error('缺少作品参数')
      setTimeout(() => wx.navigateBack(), 900)
      return
    }

    query('product', 'detail', { productId: id }, { showError: false }).then((res) => {
      this.setData({ loading: false })

      if (res.code !== 0 || !res.data) {
        toast.error('作品加载失败')
        return
      }

      const product = res.data
      const pano = product.panorama || {}
      const frames = pano.frames || []

      if (frames.length === 0) {
        toast.info('该作品暂无 360° 视图')
        return
      }

      this.setData({ frames, name: product.name })

      // 统计：环视是强意向行为，值得单独埋点
      track.track('view_panorama', {
        product_id: product._id,
        product_name: product.name,
        frame_count: frames.length
      })
    })
  },

  /** 关闭并返回 */
  onClose() {
    wx.navigateBack()
  },

  /** 分享 */
  onShareAppMessage() {
    return {
      title: this.data.name ? `${this.data.name} · 360° 环视` : '作品 360° 环视',
      path: `/pages/panorama/panorama?id=${this.data.productId || ''}`
    }
  }
})
