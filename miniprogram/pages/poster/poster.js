// pages/poster/poster.js
// 生成分享海报：作品图 + 名称 + 参考价 + 二维码，保存到相册。
//
// 二维码说明：优先用云函数 getWxacode 生成真实小程序码（scene 携带商品 ID，
// 扫码直达详情页）。小程序未发布时生成会失败，此时自动退回占位图案，不影响出图。

const { query } = require('../../utils/cloud')
const toast = require('../../utils/toast')
const { fenToYuan } = require('../../utils/format')

/** 海报逻辑尺寸（绘制时按此坐标，导出时按设备像素比放大） */
const W = 750
const H = 1200

Page({
  data: {
    product: null,
    loading: true,
    saving: false,
    posterPath: '',
    /** 真实小程序码图片地址，为空则用占位图案 */
    qrPath: ''
  },

  onLoad(options) {
    const id = options.id
    if (!id) {
      toast.error('缺少作品参数')
      setTimeout(() => wx.navigateBack(), 900)
      return
    }

    query('product', 'detail', { productId: id }, { showError: false }).then((res) => {
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false })
        toast.error('作品加载失败')
        return
      }
      const p = res.data
      this.setData({
        product: Object.assign({}, p, { priceText: fenToYuan(p.price) }),
        loading: false
      })
      // 先取真实小程序码，拿到后再绘制（拿不到就用占位图）
      this.loadQr(id)
    })
  },

  /**
   * 拉取真实小程序码。
   * 成功则 qrPath 指向云端图片；失败（未发布/超限）保持为空，绘制时退回占位图案。
   */
  loadQr(productId) {
    query('product', 'getWxacode', { productId }, { showError: false })
      .then((res) => {
        const qr = (res && res.data && res.data.qr) || ''
        this.setData({ qrPath: qr })
      })
      .catch(() => {})
      .finally(() => {
        // 无论有无真实码，都延迟到 setData 渲染后再画
        setTimeout(() => this.draw(), 120)
      })
  },

  /** 绘制海报 */
  draw() {
    const p = this.data.product
    if (!p) return

    wx.createSelectorQuery()
      .in(this)
      .select('#poster')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res || !res[0] || !res[0].node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio || 2

        canvas.width = W * dpr
        canvas.height = H * dpr
        ctx.scale(dpr, dpr)

        this.paint(ctx, canvas, p)
      })
  },

  /**
   * 实际绘制
   * @param {object} ctx canvas 上下文
   * @param {object} canvas canvas 节点（用于 createImage）
   * @param {object} p 商品数据
   */
  paint(ctx, canvas, p) {
    // 背景
    const grad = ctx.createLinearGradient(0, 0, W, H)
    grad.addColorStop(0, '#16161E')
    grad.addColorStop(1, '#26263A')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, W, H)

    // 顶部品牌
    ctx.fillStyle = '#FF5C39'
    ctx.font = 'bold 26px sans-serif'
    ctx.fillText('拾光手办', 56, 84)

    ctx.fillStyle = 'rgba(255,255,255,0.32)'
    ctx.font = '20px sans-serif'
    ctx.fillText('SHIGUANG FIGURE', 56, 116)

    // 右上角装饰圆
    ctx.beginPath()
    ctx.arc(W - 90, 80, 52, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,92,57,0.12)'
    ctx.fill()

    // 作品图
    const pad = 56
    const imgSize = W - pad * 2

    const finish = () => {
      // 标题
      ctx.fillStyle = '#FFFFFF'
      ctx.font = 'bold 38px sans-serif'
      const title = p.name.length > 16 ? p.name.slice(0, 16) + '…' : p.name
      ctx.fillText(title, pad, 880)

      // 副标题
      if (p.subtitle) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'
        ctx.font = '24px sans-serif'
        const sub = p.subtitle.length > 24 ? p.subtitle.slice(0, 24) + '…' : p.subtitle
        ctx.fillText(sub, pad, 922)
      }

      // 价格
      ctx.fillStyle = '#FF5C39'
      ctx.font = 'bold 26px sans-serif'
      ctx.fillText('¥', pad, 992)
      ctx.font = 'bold 54px sans-serif'
      ctx.fillText(p.priceText, pad + 24, 1000)

      // 分割线
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(pad, 1050)
      ctx.lineTo(W - pad, 1050)
      ctx.stroke()

      // 底部提示
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.font = '22px sans-serif'
      ctx.fillText('微信扫码查看作品详情', pad, 1128)
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.font = '19px sans-serif'
      ctx.fillText('全部作品均为手作人独立完成', pad, 1160)

      // 二维码：优先画真实小程序码，未就绪时用占位图案
      const qrX = W - pad - 150
      const qrY = 1075
      const qrSize = 130
      if (this.data.qrPath) {
        const qrImg = canvas.createImage()
        qrImg.onload = () => {
          // 白底圆角垫底，保证码在深色海报上可扫
          ctx.fillStyle = '#FFFFFF'
          this.roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10)
          ctx.fill()
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize)
          setTimeout(() => this.exportImage(canvas), 80)
        }
        qrImg.onerror = () => {
          // 真实码加载失败退回占位，仍保证出图
          this.drawQRPlaceholder(ctx, qrX, qrY, qrSize)
          setTimeout(() => this.exportImage(canvas), 80)
        }
        qrImg.src = this.data.qrPath
      } else {
        this.drawQRPlaceholder(ctx, qrX, qrY, qrSize)
        // 导出
        setTimeout(() => this.exportImage(canvas), 80)
      }
    }

    // 加载作品图
    const img = canvas.createImage()
    img.onload = () => {
      ctx.save()
      this.roundRect(ctx, pad, 150, imgSize, imgSize, 28)
      ctx.clip()
      ctx.drawImage(img, pad, 150, imgSize, imgSize)
      ctx.restore()
      finish()
    }
    img.onerror = () => {
      // 图片加载失败也要出图，只是缺作品图
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      this.roundRect(ctx, pad, 150, imgSize, imgSize, 28)
      ctx.fill()
      finish()
    }
    img.src = p.cover
  },

  /** 圆角矩形路径 */
  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  },

  /**
   * 绘制二维码占位图案
   * 真实的 21x21 模块矩阵 + 三个定位角，视觉上像二维码但不承载信息
   */
  drawQRPlaceholder(ctx, x, y, size) {
    const cells = 21
    const unit = size / cells

    ctx.fillStyle = '#FFFFFF'
    this.roundRect(ctx, x - 8, y - 8, size + 16, size + 16, 10)
    ctx.fill()

    ctx.fillStyle = '#16161E'
    // 用固定种子生成伪随机模块，保证每次绘制一致
    let seed = 20261026
    const rand = () => {
      seed = (seed * 9301 + 49297) % 233280
      return seed / 233280
    }

    for (let r = 0; r < cells; r += 1) {
      for (let c = 0; c < cells; c += 1) {
        // 三个定位角留白，稍后单独画
        const inCorner =
          (r < 7 && c < 7) || (r < 7 && c >= cells - 7) || (r >= cells - 7 && c < 7)
        if (inCorner) continue
        if (rand() > 0.52) {
          ctx.fillRect(x + c * unit, y + r * unit, unit, unit)
        }
      }
    }

    // 三个定位角
    const corner = (cx, cy) => {
      ctx.fillStyle = '#16161E'
      ctx.fillRect(cx, cy, unit * 7, unit * 7)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(cx + unit, cy + unit, unit * 5, unit * 5)
      ctx.fillStyle = '#16161E'
      ctx.fillRect(cx + unit * 2, cy + unit * 2, unit * 3, unit * 3)
    }
    corner(x, y)
    corner(x + (cells - 7) * unit, y)
    corner(x, y + (cells - 7) * unit)
  },

  /** 导出为图片 */
  exportImage(canvas) {
    wx.canvasToTempFilePath({
      canvas,
      success: (res) => {
        this.setData({ posterPath: res.tempFilePath })
      },
      fail: (err) => {
        console.error('[poster] 导出失败', err)
        toast.error('海报生成失败')
      }
    })
  },

  /** 保存到相册 */
  onSave() {
    if (this.data.saving) return
    if (!this.data.posterPath) {
      toast.info('海报还在生成中')
      return
    }

    this.setData({ saving: true })
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterPath,
      success: () => {
        this.setData({ saving: false })
        toast.success('已保存到相册')
      },
      fail: (err) => {
        this.setData({ saving: false })
        if (String(err.errMsg || '').indexOf('auth deny') > -1) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中允许保存图片到相册',
            confirmText: '去设置',
            success: (r) => {
              if (r.confirm) wx.openSetting()
            }
          })
        } else {
          toast.error('保存失败')
        }
      }
    })
  },

  /** 预览海报 */
  onPreview() {
    if (!this.data.posterPath) return
    wx.previewImage({ urls: [this.data.posterPath] })
  },

  onClose() {
    wx.navigateBack()
  }
})
