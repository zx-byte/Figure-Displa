// pages/category/category.js
// 分类页：多维筛选（维度清单见 config/constants.js）+ 关键词搜索 + 分页加载。
// 筛选状态集中放在 filterValues 里，任一维度变化都从第一页重新查询。

const app = getApp()
const { query } = require('../../utils/cloud')
const {
  FILTER_DIMENSIONS,
  PAGE_SIZE,
  STORAGE_KEYS,
  PRODUCT_TYPE_TEXT,
  SHOW_TRADE
} = require('../../config/constants')
const share = require('../../utils/share')

/** 排序选项：价格排序只对有定价的商品有意义，纯展示形态下不出现 */
const SORT_OPTIONS = [
  { key: 'new', label: '最新' },
  { key: 'hot', label: '热销' }
].concat(
  SHOW_TRADE
    ? [
        { key: 'priceAsc', label: '价格升序' },
        { key: 'priceDesc', label: '价格降序' }
      ]
    : []
)

/**
 * 筛选默认值：维度清单由 FILTER_DIMENSIONS 决定，
 * 全部为「全部」即不限。维度增减时这里不用跟着改。
 */
const DEFAULT_FILTER_VALUES = {}
FILTER_DIMENSIONS.forEach((dim) => {
  DEFAULT_FILTER_VALUES[dim.key] = '全部'
})

Page({
  data: {
    keyword: '',
    /** 搜索框是否聚焦，用于控制历史面板显隐 */
    searchFocused: false,
    /** 最近搜索词 */
    searchHistory: [],
    /** 当前展开的筛选维度，空串表示全部收起 */
    activeDim: '',
    dimensions: FILTER_DIMENSIONS,
    /** 各维度当前取值，'全部' 表示不限 */
    filterValues: Object.assign({}, DEFAULT_FILTER_VALUES),
    sortOptions: SORT_OPTIONS,
    sort: 'new',
    /**
     * 商品类型筛选：0 现货 / 1 限量 / 2 定制，null 表示不限。
     * 首页「查看全部限量」通过全局变量传进来，必须落到查询参数里才生效。
     */
    type: null,

    list: [],
    /** 符合条件的总条数，直接展示给用户 */
    total: 0,
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false,
    /** 已生效的筛选条件摘要，用于顶部提示 */
    filterSummary: '',
    /** 空结果时的客服来源标记，带上用户搜的词或筛选条件 */
    contactFrom: ''
  },

  onLoad() {
    this.setData({ searchHistory: this.readSearchHistory() })
    this.loadList(true)
  },

  onShow() {
    // 接收首页传来的筛选条件、类型或搜索意图（tabBar 页面无法通过 url 传参）
    const pendingReset = app.globalData.pendingReset
    const pending = app.globalData.pendingFilter
    const pendingType = app.globalData.pendingType
    const wantSearch = app.globalData.pendingSearch

    // 首页「全部作品」「全部限量」：清空维度筛选，类型按需保留
    if (pendingReset) {
      app.globalData.pendingReset = false
      const nextType = pendingType === undefined ? null : pendingType
      if (pendingType !== undefined) app.globalData.pendingType = undefined
      this.setData(
        {
          type: nextType,
          activeDim: '',
          filterValues: Object.assign({}, DEFAULT_FILTER_VALUES),
          page: 1
        },
        () => this.loadList(true)
      )
      return
    }

    if (pending) {
      app.globalData.pendingFilter = null
      const values = Object.assign({}, this.data.filterValues)
      values[pending.key] = pending.value
      this.setData(
        {
          filterValues: values,
          activeDim: pending.key,
          page: 1
        },
        () => this.loadList(true)
      )
      return
    }

    // pendingType === null 表示「不限类型」，数字表示限定某一种
    if (pendingType !== undefined) {
      app.globalData.pendingType = undefined
      this.setData({ type: pendingType, page: 1 }, () => this.loadList(true))
      return
    }

    if (wantSearch) {
      app.globalData.pendingSearch = false
      // 仅聚焦提示，不改变已有查询结果
      wx.showToast({ title: '在搜索框输入关键词', icon: 'none' })
    }
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
   * 查询商品列表
   * @param {boolean} reset 是否重置列表（首次加载或条件变化）
   * @param {function} done 完成回调
   */
  loadList(reset = false, done) {
    if (reset) {
      this.setData({ loading: true, loadError: false })
    } else {
      this.setData({ loadingMore: true })
    }

    const values = this.data.filterValues
    const params = {
      page: this.data.page,
      pageSize: PAGE_SIZE,
      sort: this.data.sort
    }

    // 类型：0 现货 / 1 限量 / 2 定制，null 表示不限
    if (this.data.type !== null && this.data.type !== undefined) {
      params.type = this.data.type
    }

    // 各维度全部叠加，只有取到「全部」的维度不带条件
    const filters = {}
    Object.keys(values).forEach((key) => {
      const value = values[key]
      if (value && value !== '全部') filters[key] = value
    })
    if (Object.keys(filters).length > 0) {
      params.filters = filters
    }

    if (this.data.keyword) {
      params.keyword = this.data.keyword
    }

    query('product', 'list', params, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadingMore: false, loadError: reset })
          if (reset) wx.showToast({ title: res.msg || '加载失败', icon: 'none' })
          return
        }

        const data = res.data || {}
        const incoming = data.list || []
        const list = reset ? incoming : this.data.list.concat(incoming)

        this.setData({
          list,
          total: Number(data.total) || 0,
          hasMore: !!data.hasMore,
          loading: false,
          loadingMore: false,
          loadError: false,
          filterSummary: this.buildSummary(),
          contactFrom: this.buildContactFrom()
        })
      })
      .finally(() => {
        if (typeof done === 'function') done()
      })
  },

  /**
   * 生成筛选摘要
   * 各维度会同时生效，摘要需要把所有已选条件都列出来，
   * 否则用户看到列表变短却不知道是哪几个条件叠加的结果。
   */
  buildSummary() {
    const values = this.data.filterValues
    const parts = []

    if (this.data.type !== null && this.data.type !== undefined) {
      const typeText = PRODUCT_TYPE_TEXT[this.data.type]
      if (typeText) parts.push(typeText)
    }

    this.data.dimensions.forEach((dim) => {
      const value = values[dim.key]
      if (value && value !== '全部') parts.push(`${dim.label}：${value}`)
    })

    return parts.join(' · ')
  },

  /**
   * 生成客服来源标记
   * 空结果时用户点「直接问手作人」，商家需要立刻知道他在找什么——
   * 带了搜索词的优先用词，否则列出当前筛选值，都没有就退化成「列表为空」。
   */
  buildContactFrom() {
    const kw = String(this.data.keyword || '').trim()
    if (kw) return `搜索无结果·${kw}`

    const values = this.data.filterValues || {}
    const picked = []
    const dimensions = this.data.dimensions || []
    dimensions.forEach((dim) => {
      const value = values[dim.key]
      if (value && value !== '全部') picked.push(value)
    })
    return picked.length > 0 ? `筛选无结果·${picked.join('/')}` : '列表为空'
  },

  /** 展开 / 收起某个维度 */
  toggleDim(e) {
    const key = e.currentTarget.dataset.key
    this.setData({ activeDim: this.data.activeDim === key ? '' : key })
  },

  /** 选择某个维度的取值 */
  selectValue(e) {
    const { key, value } = e.currentTarget.dataset
    const values = Object.assign({}, this.data.filterValues, { [key]: value })
    this.setData(
      {
        filterValues: values,
        activeDim: key,
        page: 1
      },
      () => this.loadList(true)
    )
  },

  /** 清除全部筛选（含从首页带入的类型条件） */
  clearFilter() {
    this.setData(
      {
        activeDim: '',
        type: null,
        filterValues: Object.assign({}, DEFAULT_FILTER_VALUES),
        page: 1
      },
      () => this.loadList(true)
    )
  },

  /** 切换排序 */
  selectSort(e) {
    const sort = e.currentTarget.dataset.key
    if (sort === this.data.sort) return
    this.setData({ sort, page: 1 }, () => this.loadList(true))
  },

  /** 搜索框输入 */
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  /** 确认搜索 */
  onSearchConfirm() {
    this.saveSearchHistory(this.data.keyword)
    this.setData({ page: 1, searchFocused: false }, () => this.loadList(true))
  },

  // ---------- 搜索历史 ----------

  /** 读取本地历史词 */
  readSearchHistory() {
    try {
      const list = wx.getStorageSync(STORAGE_KEYS.SEARCH_HISTORY)
      return Array.isArray(list) ? list : []
    } catch (e) {
      return []
    }
  },

  /**
   * 写入历史词：去重、置顶、上限 8 条
   * @param {string} keyword 搜索词
   */
  saveSearchHistory(keyword) {
    const kw = String(keyword || '').trim()
    if (!kw) return

    const list = this.readSearchHistory().filter((k) => k !== kw)
    list.unshift(kw)
    const top = list.slice(0, 8)

    try {
      wx.setStorageSync(STORAGE_KEYS.SEARCH_HISTORY, top)
    } catch (e) {
      console.warn('[category] 搜索历史写入失败', e)
    }
    this.setData({ searchHistory: top })
  },

  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  onSearchBlur() {
    // 延迟收起：点击历史词时会先触发 blur，立即收起会导致点击落空
    setTimeout(() => this.setData({ searchFocused: false }), 180)
  },

  /** 点历史词直接搜索 */
  onHistoryTap(e) {
    const kw = e.currentTarget.dataset.kw
    if (!kw) return
    this.saveSearchHistory(kw)
    this.setData({ keyword: kw, page: 1, searchFocused: false }, () => this.loadList(true))
  },

  onClearHistory() {
    try {
      wx.removeStorageSync(STORAGE_KEYS.SEARCH_HISTORY)
    } catch (e) {
      console.warn('[category] 清空历史失败', e)
    }
    this.setData({ searchHistory: [] })
  },

  /** 清空搜索词并重新查询 */
  clearKeyword() {
    this.setData({ keyword: '', page: 1 }, () => this.loadList(true))
  },

  /** 重试 */
  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
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
