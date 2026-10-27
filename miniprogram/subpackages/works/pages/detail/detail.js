// subpackages/works/pages/detail/detail.js
// 商品详情：多图轮播与大图预览、规格选择、收藏、加入购物车、立即购买。
// 定制类商品（type=2）不进入购物车，底部主按钮改为「去定制」。

const app = getApp()
const { query, call } = require('../../../../utils/cloud')
const { STORAGE_KEYS, PRODUCT_TYPE, SHOW_TRADE } = require('../../../../config/constants')
const toast = require('../../../../utils/toast')
const track = require('../../../../utils/track')
const { fenToYuan } = require('../../../../utils/format')
const history = require('../../../../utils/history')
const share = require('../../../../utils/share')

Page({
  data: {
    productId: '',
    loading: true,
    loadError: false,
    detail: null,
    priceText: '0.00',
    originPriceText: '0.00',
    /** 无标价作品：价格位显示「询价」 */
    inquire: false,

    /** 轮播当前索引 */
    currentIndex: 0,
    /** 主图加载失败的下标集合，失败的那一帧退化为占位块 */
    galleryBroken: {},
    /** 规格选项：[{ name, options }] */
    specs: [],
    /** 已选规格 { 规格名: 取值 } */
    selectedSpec: {},
    /** 拼接后的规格文本 */
    specText: '',
    /** 购买数量，限量商品固定为 1 */
    count: 1,

    favorited: false,
    /** 是否开启交易入口（false 时全部替换为微信咨询） */
    showTrade: SHOW_TRADE,
    /** 是否有 360° 环视视图 */
    hasPanorama: false,
    /** 尺寸数据 */
    dimension: null,
    /** 尺寸对照条（已换算成 rpx） */
    sizeItems: [],
    /** 工序时间轴 */
    craftProcess: [],
    /** 上色前后对比图 */
    compare: null,
    /** 同系列推荐 */
    related: [],
    /** 沉浸看图遮罩 */
    viewerVisible: false,
    viewerIndex: 0,
    /** 库存展示文案 */
    stockText: '',
    isSoldOut: false,
    isPresale: false,
    isCustom: false,
    /** 归一化后的详情内容块 [{ type: 'image'|'text', value }] */
    detailBlocks: [],
    /** 可直接预览的主图数组 */
    gallery: []
  },

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      this.setData({ loading: false, loadError: true })
      return
    }
    this.setData({ productId: id })
    this.loadDetail()
    this.checkFavorite()
  },

  /** 加载商品详情 */
  loadDetail() {
    this.setData({ loading: true, loadError: false })

    query('product', 'detail', { productId: this.data.productId }, { showError: false }).then(
      (res) => {
        if (res.code !== 0 || !res.data) {
          this.setData({ loading: false, loadError: true })
          if (res.code !== 404) {
            wx.showToast({ title: res.msg || '加载失败', icon: 'none' })
          }
          return
        }

        const item = res.data
        const stock = Number(item.stock) || 0
        const type = Number(item.type)

        // 规格默认不预选，强制用户主动选择，避免下单后产生规格争议
        const selectedSpec = {}

        this.setData({
          loading: false,
          loadError: false,
          detail: item,
          priceText: ((Number(item.price) || 0) / 100).toFixed(2),
          originPriceText: ((Number(item.originPrice) || 0) / 100).toFixed(2),
          inquire: (Number(item.price) || 0) <= 0,
          gallery: item.images || [],
          specs: item.specs || [],
          selectedSpec,
          specText: '',
          isSoldOut: stock <= 0,
          isPresale: type === PRODUCT_TYPE.PRESALE,
          isCustom: type === PRODUCT_TYPE.CUSTOM,
          stockText: this.buildStockText(type, stock, item.limitNum),
          detailBlocks: this.normalizeDetail(item.detail)
        })

        wx.setNavigationBarTitle({ title: item.name || '商品详情' })

        // 有环视帧才显示 360° 入口
        const pano = item.panorama || {}
        this.setData({ hasPanorama: !!(pano.frames && pano.frames.length > 0) })

        // 尺寸对照、工序时间轴、同系列推荐
        this.setupDimension(item.dimension)
        const cmp = item.compare
        this.setData({
          craftProcess: item.craftProcess || [],
          compare: cmp && cmp.before && cmp.after ? cmp : null
        })
        this.loadRelated(item)

        // 上报商品浏览：官方统计只能按页面路径聚合，区分具体商品必须手动带 ID
        track.trackViewProduct(item)

        // 记入本地浏览历史
        history.add(item)
      }
    )
  },

  /**
   * 库存文案
   * @param {number} type 商品类型
   * @param {number} stock 库存
   * @param {number} limitNum 限量总数
   */
  buildStockText(type, stock, limitNum) {
    if (type === PRODUCT_TYPE.PRESALE) {
      return stock > 0 ? `剩余 ${stock} 体 / 限量 ${limitNum} 体` : '已售罄'
    }
    if (stock <= 0) return '已售罄'
    if (stock <= 5) return `仅剩 ${stock} 件`
    return `库存 ${stock} 件`
  },

  /**
   * 把云端的 detail 归一化为 { type, value } 数组
   * 兼容历史数据：纯字符串按图片处理，对象按 { type, value } 处理
   */
  normalizeDetail(detail) {
    if (!Array.isArray(detail)) return []
    return detail
      .map((block) => {
        if (typeof block === 'string') {
          return block ? { type: 'image', value: block } : null
        }
        if (block && typeof block === 'object') {
          if (block.type === 'text') {
            return { type: 'text', value: block.value || block.text || '' }
          }
          if (block.type === 'image') {
            return { type: 'image', value: block.value || block.fileID || '' }
          }
          if (block.text) return { type: 'text', value: block.text }
          if (block.fileID) return { type: 'image', value: block.fileID }
        }
        return null
      })
      .filter((b) => b && b.value)
  },

  /** 查询收藏状态 */
  checkFavorite() {
    query('favorite', 'check', { productId: this.data.productId }, { showError: false }).then(
      (res) => {
        if (res.code === 0 && res.data) {
          this.setData({ favorited: !!res.data.favorited })
        }
      }
    )
  },

  /** 轮播切换 */
  onSwiperChange(e) {
    this.setData({ currentIndex: e.detail.current })
  },

  /**
   * 主图加载失败
   * 详情页的主图就是内容本身，失败了必须明确告知，不能只留一个白块。
   * 每页只提示一次，避免轮播时反复弹。
   */
  onGalleryError(e) {
    const index = e.currentTarget.dataset.index
    if (index !== undefined) {
      this.setData({ [`galleryBroken.${index}`]: true })
    }
    if (this.galleryErrorNotified) return
    this.galleryErrorNotified = true
    console.warn('[detail] 主图加载失败', this.data.productId)
    toast.info('主图加载失败，可返回后重试')
  },

  /** 预览详情图 */
  previewDetailImage(e) {
    const current = e.currentTarget.dataset.src
    const urls = this.data.detailBlocks.filter((b) => b.type === 'image').map((b) => b.value)
    if (!current || urls.length === 0) return
    wx.previewImage({ current, urls })
  },

  /** 选择规格 */
  onSelectSpec(e) {
    const { name, value } = e.currentTarget.dataset
    const selected = Object.assign({}, this.data.selectedSpec, { [name]: value })
    const specText = this.data.specs.map((s) => selected[s.name]).filter(Boolean).join(' / ')
    this.setData({ selectedSpec: selected, specText })
  },

  /** 数量调整 */
  onCountChange(e) {
    const delta = Number(e.currentTarget.dataset.delta)
    const max = this.data.isPresale ? 1 : Math.max(1, Number(this.data.detail.stock) || 1)
    const next = Math.min(max, Math.max(1, this.data.count + delta))
    this.setData({ count: next })
  },

  /**
   * 校验是否可以选择规格与购买
   * @returns {boolean}
   */
  validateSelection() {
    const { specs, selectedSpec, isSoldOut, isCustom } = this.data

    if (isCustom) {
      toast.info('定制商品请点击「去定制」提交需求')
      return false
    }
    if (isSoldOut) {
      toast.info('该作品已售罄')
      return false
    }
    // 规格组未全部选择时拦截
    const missing = specs.find((s) => !selectedSpec[s.name])
    if (missing) {
      toast.info(`请选择${missing.name}`)
      return false
    }
    return true
  },

  /** 切换收藏 */
  onToggleFavorite() {
    // 收藏会把 openid 与作品 ID 写进收藏表，属收集个人信息，先确认协议。
    // 取消收藏不拦——已经收藏过说明同意过，不该让用户撤不回来。
    if (!this.data.favorited && app.needPrivacy()) {
      toast.info('请先到「我的」页同意协议后再收藏')
      return
    }

    call('favorite', 'toggle', { productId: this.data.productId }, { showError: true }).then(
      (res) => {
        if (res.code === 0) {
          this.setData({ favorited: !!res.data.favorited })
          toast.success(res.data.favorited ? '已收藏' : '已取消收藏')
        }
      }
    )
  },

  /** 加入购物车（本地存储，结算时由服务端重新核价） */
  onAddCart() {
    if (!this.validateSelection()) return

    const item = this.data.detail
    const cart = wx.getStorageSync(STORAGE_KEYS.CART) || []
    const specKey = this.data.specText

    const existIndex = cart.findIndex(
      (c) => c.productId === item._id && (c.spec || '') === specKey
    )

    if (existIndex > -1) {
      const nextCount = cart[existIndex].count + this.data.count
      const stock = Number(item.stock) || 0
      if (nextCount > stock) {
        toast.info('超出库存数量')
        return
      }
      cart[existIndex].count = nextCount
    } else {
      cart.push({
        productId: item._id,
        name: item.name,
        cover: this.data.gallery[0] || '',
        price: item.price,
        count: this.data.count,
        spec: specKey,
        type: item.type,
        limitNum: item.limitNum || 0
      })
    }

    wx.setStorageSync(STORAGE_KEYS.CART, cart)
    app.refreshCartCount()
    toast.success('已加入购物车')
  },

  /** 立即购买：把商品塞进临时结算单，跳到订单确认页 */
  onBuyNow() {
    if (!this.validateSelection()) return

    const item = this.data.detail
    app.globalData.checkoutItems = [
      {
        productId: item._id,
        name: item.name,
        cover: this.data.gallery[0] || '',
        price: item.price,
        count: this.data.count,
        spec: this.data.specText,
        type: item.type,
        limitNum: item.limitNum || 0
      }
    ]

    wx.navigateTo({ url: '/pages/order-confirm/order-confirm?from=detail' })
  },

  /** 去定制：带着商品信息跳到定制提交页 */
  onGoCustom() {
    const item = this.data.detail
    track.trackConsult(item._id, 'detail-custom')
    wx.navigateTo({
      url: `/pages/custom-apply/custom-apply?productId=${item._id}&name=${encodeURIComponent(
        item.name
      )}`
    })
  },

  /**
   * 生成尺寸对照条
   * 按 1cm = 8rpx 换算，把作品和常见参照物按真实高度并排，直观传达"有多大"
   * @param {object} dim 尺寸数据
   */
  setupDimension(dim) {
    if (!dim || !dim.height) {
      this.setData({ dimension: null, sizeItems: [] })
      return
    }

    const UNIT = 8 // 1cm = 8rpx
    const refs = [
      { name: '可乐罐', cm: 12.3, ref: true },
      { name: '手机', cm: 15.5, ref: true },
      { name: '手掌', cm: 18, ref: true },
      { name: 'A4 纸', cm: 29.7, ref: true }
    ]

    const items = refs
      .concat([{ name: '本作品', cm: Number(dim.height), self: true }])
      .sort((a, b) => a.cm - b.cm)
      .map((it) => Object.assign({}, it, { px: Math.round(it.cm * UNIT) }))

    this.setData({ dimension: dim, sizeItems: items })
  },

  /**
   * 加载同系列作品
   * @param {object} product 当前商品
   */
  loadRelated(product) {
    const series = (product.category || {}).series
    if (!series) return

    query(
      'product',
      'list',
      { categoryKey: 'series', categoryValue: series, pageSize: 12 },
      { showError: false }
    ).then((res) => {
      if (res.code !== 0 || !res.data) return
      const list = (res.data.list || [])
        .filter((p) => p._id !== product._id)
        .slice(0, 6)
        .map((p) => Object.assign({}, p, { priceText: fenToYuan(p.price) }))
      this.setData({ related: list })
    })
  },

  /** 查看同系列全部：切到分类页并带上系列筛选（复用首页已有的 pendingFilter 机制） */
  onMoreSeries() {
    const series = (this.data.detail.category || {}).series || ''
    if (series) {
      getApp().globalData.pendingFilter = { key: 'series', value: series }
    }
    wx.switchTab({ url: '/pages/category/category' })
  },

  /** 点击同系列作品：用 redirectTo 避免详情页层层堆栈 */
  onRelatedTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id || (this.data.detail && id === this.data.detail._id)) return
    wx.redirectTo({ url: `/subpackages/works/pages/detail/detail?id=${id}` })
  },

  /** 打开沉浸看图 */
  previewImage(e) {
    const src = e.currentTarget.dataset.src
    const idx = this.data.gallery.indexOf(src)
    this.setData({ viewerVisible: true, viewerIndex: idx >= 0 ? idx : 0 })
  },

  /** 关闭沉浸看图 */
  onCloseViewer() {
    this.setData({ viewerVisible: false })
  },

  /** 看图切换到其他图 */
  onViewerSwiperChange(e) {
    this.setData({ viewerIndex: e.detail.current })
  },

  /** 点击缩略图切换 */
  onViewerThumbTap(e) {
    this.setData({ viewerIndex: Number(e.currentTarget.dataset.index) })
  },

  /** 阻止滚动穿透 */
  noop() {},

  /** 打开 360° 环视 */
  onOpenPanorama() {
    const item = this.data.detail
    if (!item || !item._id) return
    wx.navigateTo({ url: `/pages/panorama/panorama?id=${item._id}` })
  },

  /** 生成分享海报 */
  onOpenPoster() {
    const item = this.data.detail
    if (!item || !item._id) return
    wx.navigateTo({ url: `/pages/poster/poster?id=${item._id}` })
  },

  /**
   * 点击客服（open-type="contact" 触发），用于统计咨询转化。
   * 会话由微信接管，这里只做埋点；form 参数区分是底部图标还是主按钮。
   */
  onContactTap(e) {
    const item = this.data.detail
    const from = (e && e.currentTarget && e.currentTarget.dataset.from) || 'detail-service'
    if (item) track.trackConsult(item._id, from)
  },

  /** 重试 */
  onRetry() {
    this.loadDetail()
  },

  /** 转发给朋友 */
  onShareAppMessage() {
    return share.productShare(this.data.detail, 'detail')
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return share.timelineShare(this.data.detail)
  }
})
