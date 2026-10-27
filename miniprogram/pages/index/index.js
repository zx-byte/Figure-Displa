// pages/index/index.js
// 首页：轮播、分类入口、限量发售专区、新品推荐。
// 一次性取回三类数据，减少云函数调用次数（成本与首屏时间的双重考虑）。

const app = getApp()
const { query } = require('../../utils/cloud')
const { PRODUCT_TYPE, SHOW_TRADE } = require('../../config/constants')
const share = require('../../utils/share')
const track = require('../../utils/track')

/**
 * 分类快捷入口，跳分类页时带上预设维度。
 * key 对应 category 里的字段，value 必须是该字段真实存在的取值，
 * 否则点进去是一张空列表。取值口径与 config/constants.js 的 FILTER_DIMENSIONS 保持一致。
 *
 * 前三项是分类（实色块，用品牌色板），第四项是「看全部」这个动作，
 * 用浅底描边区分层级，不跟分类抢视觉。
 */
const QUICK_ENTRIES = [
  { key: 'ip', value: '原创', label: '原创角色', symbol: '◆', color: '#FF5C39' },
  { key: 'ip', value: '任嘉伦', label: '任嘉伦', symbol: '▲', color: '#1A1A24' },
  { key: 'ip', value: '动漫游戏', label: '动漫游戏', symbol: '●', color: '#C9A227' },
  { key: 'all', value: '', label: '全部作品', symbol: '✦', color: '', ghost: true }
]

/**
 * 测量自定义导航栏高度
 * 首页用了 navigationStyle: custom，需要自己补状态栏和标题栏的高度。
 * 标题栏高度按微信原生算法：胶囊上边距 × 2 + 胶囊高度。
 */
function measureNavBar() {
  const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
  const statusBarHeight = win.statusBarHeight || 20
  let navBarHeight = 44

  try {
    const rect = wx.getMenuButtonBoundingClientRect()
    if (rect && rect.height > 0 && rect.top >= statusBarHeight) {
      const measured = (rect.top - statusBarHeight) * 2 + rect.height
      // 限定在合理区间，防止个别机型返回异常值把首屏撑变形
      navBarHeight = Math.min(60, Math.max(40, measured))
    }
  } catch (e) {
    // 部分环境（如 PC 端）不支持该接口，用默认值即可
  }

  return { statusBarHeight, navBarHeight }
}

Page({
  data: {
    loading: true,
    loadError: false,
    /** 自定义导航栏高度，单位 px */
    statusBarHeight: 20,
    navBarHeight: 44,
    banners: [],
    presale: [],
    newArrivals: [],
    quickEntries: QUICK_ENTRIES,
    /** 是否开启交易入口（false 时定制改为微信咨询） */
    showTrade: SHOW_TRADE,
    /** 新品是否还有更多（首页仅展示前 10 条） */
    hasMoreNew: false,
    /** 加载失败的轮播下标集合，{ 索引: true }，失败后退化为纯色块 */
    brokenBanners: {},
    /** 协议确认弹窗是否显示 */
    privacyShow: false
  },

  onLoad() {
    const nav = measureNavBar()
    this.setData({ statusBarHeight: nav.statusBarHeight, navBarHeight: nav.navBarHeight })
    app.ready().then(() => this.loadHome())
  },

  onShow() {
    // 从详情页返回时同步购物车角标
    app.refreshCartCount()

    // 未同意当前版本协议时提示
    if (app.needPrivacy()) {
      this.setData({ privacyShow: true })
    }
  },

  /* ---------------- 协议确认 ---------------- */

  /** 同意协议 */
  onPrivacyAgree() {
    app.agreePrivacy()
    this.setData({ privacyShow: false })
  },

  /**
   * 暂不使用
   * 关闭弹窗但不禁用浏览，只在需要收集信息的操作处拦截。
   * 微信不允许「拒绝授权即退出」，因此这里不做强制退出。
   */
  onPrivacyDisagree() {
    app.dismissPrivacy()
    this.setData({ privacyShow: false })
    wx.showToast({
      title: '可继续浏览与咨询，收藏和定制需先同意协议',
      icon: 'none',
      duration: 2600
    })
  },

  onPullDownRefresh() {
    this.loadHome(true)
  },

  /**
   * 加载首页数据
   * @param {boolean} refresh 是否为下拉刷新
   */
  loadHome(refresh = false) {
    if (!refresh) this.setData({ loading: true, loadError: false })

    query('product', 'home', {}, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadError: true })
          if (!refresh) wx.showToast({ title: res.msg || '加载失败', icon: 'none' })
          return
        }

        const data = res.data || {}
        // 列表页价格在展示层转元，避免在 wxml 里做运算
        const withPriceText = (list) =>
          (list || []).map((item) =>
            Object.assign({}, item, {
              priceText: ((Number(item.price) || 0) / 100).toFixed(2)
            })
          )

        this.setData({
          loading: false,
          loadError: false,
          banners: data.banners || [],
          presale: withPriceText(data.presale),
          newArrivals: data.newArrivals || [],
          hasMoreNew: (data.newArrivals || []).length >= 10,
          // 刷新时重置失败标记，给图片一次重新加载的机会
          brokenBanners: {}
        })
      })
      .finally(() => {
        if (refresh) wx.stopPullDownRefresh()
      })
  },

  /** 点击搜索栏，跳到分类页并聚焦搜索 */
  goSearch() {
    app.globalData.pendingSearch = true
    wx.switchTab({ url: '/pages/category/category' })
  },

  /** 轮播图加载失败：换成纯色块，标题文字仍可读 */
  onBannerError(e) {
    const index = e.currentTarget.dataset.index
    if (index === undefined) return
    this.setData({ [`brokenBanners.${index}`]: true })
  },

  /** 轮播图点击进入详情 */
  onBannerTap(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpackages/works/pages/detail/detail?id=${id}` })
  },

  /**
   * 分类快捷入口
   * 需求限定 tabBar 页面间用 switchTab，筛选条件通过全局变量传递
   */
  onEntryTap(e) {
    const { key, value } = e.currentTarget.dataset
    if (key === 'all') {
      // 全部作品：清空分类页已有的维度筛选
      app.globalData.pendingReset = true
      app.globalData.pendingType = null
    } else {
      app.globalData.pendingFilter = { key, value }
      app.globalData.pendingType = null
    }
    wx.switchTab({ url: '/pages/category/category' })
  },

  /** 查看全部新品 */
  goAllProducts() {
    app.globalData.pendingReset = true
    app.globalData.pendingType = null
    wx.switchTab({ url: '/pages/category/category' })
  },

  /** 查看全部限量：清空维度筛选，只保留「限量」这一条类型条件 */
  goPresaleList() {
    app.globalData.pendingReset = true
    app.globalData.pendingType = PRODUCT_TYPE.PRESALE
    wx.switchTab({ url: '/pages/category/category' })
  },

  /** 定制入口 */
  goCustom() {
    wx.navigateTo({ url: '/pages/custom-apply/custom-apply' })
  },

  /** 点击客服（open-type="contact" 触发），纯展示形态下这是主要转化路径 */
  onContactTap() {
    track.trackConsult('', 'index-card')
  },

  /** 失败重试 */
  onRetry() {
    this.loadHome()
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
