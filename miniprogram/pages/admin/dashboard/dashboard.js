// pages/admin/dashboard/dashboard.js
// 数据概览与管理入口。数据来自 stats 云函数，仅管理员可读。

const { callStats } = require('../../../utils/admin')
const admin = require('../../../utils/admin')
const toast = require('../../../utils/toast')
const { fenToYuan, formatTime } = require('../../../utils/format')

Page({
  data: {
    loading: true,
    loadError: false,
    overview: {
      todayOrderCount: 0,
      todaySales: 0,
      userCount: 0,
      productCount: 0,
      pendingDeliver: 0,
      pendingCustom: 0,
      unpaidCount: 0
    },
    todaySalesText: '0.00',
    updatedAtText: '',

    /* 近 7 日趋势 + 热销榜 */
    trend: [],
    /** 趋势柱状图归一化高度（百分比字符串） */
    trendBars: [],
    trendMax: 0,
    hotList: [],
    hotListText: []
  },

  onShow() {
    if (!admin.isLoggedIn()) {
      wx.redirectTo({ url: '/pages/admin/login/login' })
      return
    }
    this.loadOverview()
    this.loadTrend()
  },

  onPullDownRefresh() {
    this.loadOverview(() => wx.stopPullDownRefresh())
    this.loadTrend()
  },

  /**
   * 加载概览数据
   * @param {function} done 完成回调
   */
  loadOverview(done) {
    this.setData({ loading: this.data.loading && !this.data.updatedAtText })

    callStats('overview', {}, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadError: true })
          return
        }
        const data = res.data || {}
        this.setData({
          loading: false,
          loadError: false,
          overview: data,
          todaySalesText: fenToYuan(data.todaySales),
          updatedAtText: data.updatedAt ? formatTime(data.updatedAt, 'time') : ''
        })
      })
      .finally(() => {
        if (typeof done === 'function') done()
      })
  },

  /**
   * 加载近 7 日趋势与热销榜。
   * 趋势转成柱状高度百分比便于 WXML 直接渲染，热销榜补金额/销量文案。
   */
  loadTrend() {
    callStats('salesTrend', {}, { showError: false }).then((res) => {
      if (res.code !== 0) return
      const data = res.data || {}
      const trend = Array.isArray(data.trend) ? data.trend : []
      const max = trend.reduce((m, t) => Math.max(m, Number(t.sales) || 0), 0) || 1

      const trendBars = trend.map((t) => {
        const sales = Number(t.sales) || 0
        return {
          date: (t.date || '').slice(5), // MM-DD，柱下只显示月日
          fullDate: t.date,
          sales,
          salesText: fenToYuan(sales),
          count: Number(t.count) || 0,
          // 至少 4% 高度，保证 0 值也看得见柱位
          height: Math.max(4, Math.round((sales / max) * 100))
        }
      })

      const hotListText = (Array.isArray(data.hotList) ? data.hotList : []).map((h, i) => ({
        rank: i + 1,
        productId: h.productId,
        name: h.name,
        image: h.image,
        count: Number(h.count) || 0,
        salesText: fenToYuan(Number(h.sales) || 0)
      }))

      this.setData({ trend, trendBars, trendMax: max, hotList: hotListText, hotListText })
    })
  },

  goProduct() {
    wx.navigateTo({ url: '/pages/admin/product/product' })
  },

  goOrder(e) {
    const status = e.currentTarget.dataset.status
    const url =
      status === undefined || status === null
        ? '/pages/admin/order/order'
        : `/pages/admin/order/order?status=${status}`
    wx.navigateTo({ url })
  },

  goCustom() {
    wx.navigateTo({ url: '/pages/admin/custom/custom' })
  },

  /** 退出登录 */
  onLogout() {
    toast.confirm('退出后需重新输入管理口令', { confirmText: '退出登录' }).then((ok) => {
      if (!ok) return
      admin.clearToken()
      toast.success('已退出')
      setTimeout(() => wx.navigateBack(), 600)
    })
  },

  onRetry() {
    this.loadOverview()
  }
})
