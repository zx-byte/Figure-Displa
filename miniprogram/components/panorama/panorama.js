// components/panorama/panorama.js
// 360° 环视组件：手指左右拖动切换帧序列，模拟旋转。
//
// 原理：预先加载一圈的帧图，按拖动距离换算成帧序号循环切换。
// 关键是「拖多少距离转一圈」这个系数——太小会过于灵敏（手指一动就转过半圈），
// 太大又显得迟滞。这里按屏幕宽度的 85% 走完一圈，接近真实转台的观感。

/** 拖过多少 rpx 走完一圈（750rpx 为屏宽基准） */
const RPX_PER_CIRCLE = 640
/** 松手后的惯性衰减系数（每 16ms） */
const FRICTION = 0.92
/** 惯性停止阈值 */
const STOP_THRESHOLD = 0.03

Component({
  properties: {
    /** 帧图路径数组，按旋转顺序排列 */
    frames: {
      type: Array,
      value: []
    }
  },

  data: {
    /** 当前帧索引 */
    current: 0,
    total: 0,
    /** 首次进入的操作提示 */
    showHint: true
  },

  observers: {
    frames(val) {
      if (!val || val.length === 0) return
      this.setData({ total: val.length, current: 0 })
      this.preload(val)
    }
  },

  lifetimes: {
    detached() {
      this.stopInertia()
    }
  },

  methods: {
    /**
     * 预加载全部帧，避免拖动时切换 src 出现白闪
     * @param {string[]} list 帧图路径
     */
    preload(list) {
      list.forEach((src) => {
        wx.getImageInfo({ src, fail: () => {} })
      })
    },

    onTouchStart(e) {
      this.stopInertia()
      const touch = e.touches[0]
      this.startX = touch.clientX
      this.startFrame = this.data.current
      this.frameFloat = this.data.current
      this.lastX = touch.clientX
      this.lastMoveTime = Date.now()
      this.velocity = 0

      if (this.data.showHint) {
        this.setData({ showHint: false })
      }
    },

    onTouchMove(e) {
      if (this.startX === undefined) return
      const touch = e.touches[0]
      const now = Date.now()

      // 记录速度用于松手后的惯性
      const dt = now - this.lastMoveTime
      if (dt > 0) {
        this.velocity = ((touch.clientX - this.lastX) / dt) * 16
      }
      this.lastX = touch.clientX
      this.lastMoveTime = now

      this.applyDelta(touch.clientX - this.startX)
    },

    onTouchEnd() {
      this.startX = undefined

      // 惯性滑动：按松手时的速度继续转一点再停
      if (Math.abs(this.velocity) > 0.6) {
        this.runInertia(this.velocity)
      }
    },

    /**
     * 根据累计位移计算并应用帧序号
     * @param {number} deltaPx 相对起点的横向像素位移
     */
    applyDelta(deltaPx) {
      const total = this.data.total
      if (!total) return

      // px → rpx → 圈数 → 帧数
      const pxToRpx = 750 / wx.getSystemInfoSync().windowWidth
      const deltaRpx = deltaPx * pxToRpx
      const frameOffset = (deltaRpx / RPX_PER_CIRCLE) * total

      this.frameFloat = this.startFrame + frameOffset
      this.setFrame(this.frameFloat)
    },

    /**
     * 设置帧序号，自动取模实现无缝循环
     * @param {number} value 浮点帧序号
     */
    setFrame(value) {
      const total = this.data.total
      if (!total) return
      const idx = ((Math.round(value) % total) + total) % total
      if (idx !== this.data.current) {
        this.setData({ current: idx })
      }
    },

    /**
     * 松手后的惯性滑动
     * @param {number} v0 初始速度（帧/16ms）
     */
    runInertia(v0) {
      this.stopInertia()
      this.inertiaV = v0
      this.inertiaTimer = setInterval(() => {
        this.inertiaV *= FRICTION
        if (Math.abs(this.inertiaV) < STOP_THRESHOLD) {
          this.stopInertia()
          return
        }
        this.frameFloat += this.inertiaV
        this.setFrame(this.frameFloat)
      }, 16)
    },

    stopInertia() {
      if (this.inertiaTimer) {
        clearInterval(this.inertiaTimer)
        this.inertiaTimer = null
      }
      this.inertiaV = 0
    }
  }
})
