// components/before-after/before-after.js
// 上色前后对比：拖动分割线，左侧露出素体、右侧露出完成品。
//
// 实现要点：裁切容器的宽度随拖动变化，但内部图片必须保持与整体等宽，
// 否则会被压缩变形。所以内层 image 用查询到的固定像素宽度（stripWidth）。

Component({
  properties: {
    /** 素体图 */
    before: { type: String, value: '' },
    /** 完成品图 */
    after: { type: String, value: '' },
    /** 初始分割位置（百分比） */
    initial: { type: Number, value: 50 }
  },

  data: {
    pos: 50,
    /** 内层图片的固定宽度（px），用于避免裁切时压缩 */
    stripWidth: 0,
    dragging: false
  },

  observers: {
    initial(val) {
      if (typeof val === 'number') this.setData({ pos: val })
    }
  },

  lifetimes: {
    ready() {
      this.setData({ pos: this.data.initial })
      this.measure()
    }
  },

  methods: {
    /** 量取容器宽度，供内层图片使用 */
    measure() {
      wx.createSelectorQuery()
        .in(this)
        .select('.ba')
        .boundingClientRect((rect) => {
          if (!rect) return
          this.boxRect = rect
          this.setData({ stripWidth: rect.width })
        })
        .exec()
    },

    onStart(e) {
      this.setData({ dragging: true })
      this.updateFromTouch(e)
    },

    onMove(e) {
      this.updateFromTouch(e)
    },

    onEnd() {
      this.setData({ dragging: false })
    },

    /**
     * 根据触点位置更新分割百分比
     * @param {object} e 触摸事件
     */
    updateFromTouch(e) {
      const touch = e.touches[0]
      if (!touch) return

      if (!this.boxRect) {
        this.measure()
        return
      }

      const ratio = ((touch.clientX - this.boxRect.left) / this.boxRect.width) * 100
      // 留 3% 边距，避免分割线贴边后无法再拖回来
      const pos = Math.max(3, Math.min(97, ratio))
      this.setData({ pos })
    },

    /** 点击也能定位，比纯拖动更容易操作 */
    onTap(e) {
      this.updateFromTouch(e)
    }
  }
})
