// pages/custom-list/custom-list.js
// 定制单列表：按状态筛选、查看进度入口。

const { query } = require('../../utils/cloud')
const { CUSTOM_STATUS_MAP } = require('../../config/constants')
const { fenToYuan, formatTime } = require('../../utils/format')

/** 顶部筛选 */
const TABS = [
  { label: '全部', status: null },
  { label: '待处理', status: 1 },
  { label: '制作中', status: 2 },
  { label: '待付尾款', status: 3 },
  { label: '已完成', status: 4 }
]

Page({
  data: {
    tabs: TABS,
    activeStatus: null,
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false
  },

  onLoad() {
    this.loadList(true)
  },

  onShow() {
    if (this.data.loadedOnce) {
      this.setData({ page: 1 }, () => this.loadList(true))
    }
    this.data.loadedOnce = true
  },

  onPullDownRefresh() {
    this.setData({ page: 1 }, () => {
      this.loadList(true, () => wx.stopPullDownRefresh())
    })
  },

  onReachBottom() {
    if (!this.data.hasMore || this.data.loading || this.data.loadingMore) return
    this.setData({ page: this.data.page + 1 })
    this.loadList(false)
  },

  /**
   * 加载定制单列表
   * @param {boolean} reset
   * @param {function} done
   */
  loadList(reset = false, done) {
    if (reset) {
      this.setData({ loading: true, loadError: false })
    } else {
      this.setData({ loadingMore: true })
    }

    const params = { page: this.data.page }
    if (this.data.activeStatus !== null) params.status = this.data.activeStatus

    query('custom', 'list', params, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadingMore: false, loadError: reset })
          return
        }
        const data = res.data || {}
        const incoming = this.decorate(data.list || [])
        const list = reset ? incoming : this.data.list.concat(incoming)

        this.setData({
          list,
          hasMore: !!data.hasMore,
          loading: false,
          loadingMore: false,
          loadError: false
        })
      })
      .finally(() => {
        if (typeof done === 'function') done()
      })
  },

  /** 补充展示字段 */
  decorate(list) {
    return list.map((item) => {
      const statusInfo = CUSTOM_STATUS_MAP[item.status] || { text: '未知', desc: '' }
      const req = item.requirement || {}
      return Object.assign({}, item, {
        statusText: statusInfo.text,
        statusDesc: statusInfo.desc,
        depositText: fenToYuan(item.deposit),
        quoteText: fenToYuan(item.totalQuote),
        createTimeText: formatTime(item.createTime, 'short'),
        characterText: req.character || '未填写',
        scaleText: req.scale || '',
        styleText: req.style || '',
        /** 进度节点数量，用于展示「已更新 N 次」 */
        scheduleCount: (item.schedule || []).length
      })
    })
  },

  onTabTap(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.activeStatus) return
    this.setData({ activeStatus: status, page: 1, list: [] }, () => this.loadList(true))
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/custom-detail/custom-detail?id=${id}` })
  },

  goApply() {
    wx.navigateTo({ url: '/pages/custom-apply/custom-apply' })
  },

  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
  }
})
