// pages/admin/product/product.js
// 商品管理：列表、搜索、上下架、库存调整、进入编辑。

const { callAdmin } = require('../../../utils/admin')
const toast = require('../../../utils/toast')
const { fenToYuan } = require('../../../utils/format')

/** 状态筛选 */
const STATUS_TABS = [
  { label: '全部', status: null },
  { label: '在架', status: 1 },
  { label: '已下架', status: 0 }
]

Page({
  data: {
    tabs: STATUS_TABS,
    activeStatus: null,
    keyword: '',
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false,
    total: 0,

    /* 批量操作 */
    /** 是否处于多选模式 */
    multiMode: false,
    /** 已选中的商品 id */
    selectedIds: [],
    /** 批量操作是否提交中 */
    batchSubmitting: false
  },

  onLoad() {
    this.loadList(true)
  },

  onShow() {
    // 从编辑页返回时刷新列表
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
   * 加载商品列表
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
    if (this.data.keyword) params.keyword = this.data.keyword

    callAdmin('productList', params, { showError: false })
      .then((res) => {
        if (res.code !== 0) {
          this.setData({ loading: false, loadingMore: false, loadError: reset })
          return
        }
        const data = res.data || {}
        const incoming = (data.list || []).map((item) =>
          Object.assign({}, item, {
            priceText: fenToYuan(item.price),
            typeText: item.type === 1 ? '限量预售' : item.type === 2 ? '定制' : '现货',
            statusText: item.status === 1 ? '在架' : '已下架'
          })
        )
        const list = reset ? incoming : this.data.list.concat(incoming)

        this.setData({
          list,
          total: data.total || 0,
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

  onTabTap(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.activeStatus) return
    this.setData({ activeStatus: status, page: 1, list: [] }, () => this.loadList(true))
  },

  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    this.setData({ page: 1 }, () => this.loadList(true))
  },

  /** 新增商品 */
  onAdd() {
    wx.navigateTo({ url: '/pages/admin/product-edit/product-edit' })
  },

  /** 编辑商品 */
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/admin/product-edit/product-edit?id=${id}` })
  },

  /** 上架 / 下架 */
  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset
    const next = Number(status) === 1 ? 0 : 1
    const label = next === 1 ? '上架' : '下架'

    toast.confirm(`确定${label}该商品吗？`, { confirmText: label }).then((ok) => {
      if (!ok) return
      callAdmin(
        'toggleProduct',
        { productId: id, status: next },
        { loading: true, loadingText: '处理中' }
      ).then((res) => {
        if (res.code === 0) {
          toast.success(`已${label}`)
          this.setData({ page: 1 }, () => this.loadList(true))
        }
      })
    })
  },

  /** 调整库存，使用可编辑弹窗直接输入新值 */
  onEditStock(e) {
    const { id, stock, name } = e.currentTarget.dataset

    wx.showModal({
      title: '调整库存',
      editable: true,
      placeholderText: `当前 ${stock}，请输入新库存`,
      content: String(stock),
      confirmText: '保存',
      confirmColor: '#FF5C39',
      success: (res) => {
        if (!res.confirm) return
        const value = String(res.content || '').trim()
        if (!/^\d+$/.test(value)) {
          toast.info('库存需为非负整数')
          return
        }
        callAdmin(
          'updateStock',
          { productId: id, stock: Number(value) },
          { loading: true, loadingText: '保存中' }
        ).then((r) => {
          if (r.code === 0) {
            toast.success('库存已更新')
            this.setData({ page: 1 }, () => this.loadList(true))
          }
        })
      }
    })
  },

  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
  },

  /* ---------------- 批量操作 ---------------- */

  /** 进入 / 退出多选模式 */
  onToggleMulti() {
    this.setData({
      multiMode: !this.data.multiMode,
      selectedIds: []
    })
  },

  /** 单个商品选中/取消 */
  onSelectItem(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    const selected = this.data.selectedIds.slice()
    const idx = selected.indexOf(id)
    if (idx > -1) selected.splice(idx, 1)
    else selected.push(id)
    this.setData({ selectedIds: selected })
  },

  /** 全选 / 取消全选 */
  onSelectAll() {
    const allIds = this.data.list.map((p) => p._id)
    const isAll = allIds.length > 0 && this.data.selectedIds.length === allIds.length
    this.setData({ selectedIds: isAll ? [] : allIds })
  },

  /**
   * 批量上下架
   * @param {object} e 事件，data-status 目标状态 0|1
   */
  onBatchToggle(e) {
    const status = Number(e.currentTarget.dataset.status) === 1 ? 1 : 0
    const ids = this.data.selectedIds
    if (ids.length === 0) {
      toast.info('请先选择商品')
      return
    }
    const label = status === 1 ? '上架' : '下架'
    toast
      .confirm(`确定批量${label}选中的 ${ids.length} 个商品吗？`, { confirmText: label })
      .then((ok) => {
        if (!ok) return
        this.setData({ batchSubmitting: true })
        callAdmin(
          'batchToggleProduct',
          { productIds: ids, status },
          { loading: true, loadingText: '处理中', showError: false }
        ).then((res) => {
          this.setData({ batchSubmitting: false })
          if (res.code !== 0) {
            toast.error(res.msg || '批量操作失败')
            return
          }
          const d = res.data || {}
          const failCount = (d.failed || []).length
          toast.success(failCount ? `完成 ${d.okCount}，失败 ${failCount}` : `已${label} ${d.okCount} 个`)
          this.setData({ selectedIds: [] })
          this.setData({ page: 1 }, () => this.loadList(true))
        })
      })
  },

  /** 批量改价，弹窗选择折扣或统一价 */
  onBatchPrice() {
    const ids = this.data.selectedIds
    if (ids.length === 0) {
      toast.info('请先选择商品')
      return
    }

    wx.showActionSheet({
      itemList: ['统一设为同一价格', '按折扣比例调整'],
      success: (res) => {
        if (res.tapIndex === 0) this.batchSetPrice(ids)
        else this.batchPercentPrice(ids)
      }
    })
  },

  /** 统一设价 */
  batchSetPrice(ids) {
    wx.showModal({
      title: '批量设价',
      editable: true,
      placeholderText: '输入统一价格（元）',
      content: '',
      confirmText: '保存',
      confirmColor: '#FF5C39',
      success: (res) => {
        if (!res.confirm) return
        const yuan = Number(String(res.content || '').trim())
        if (!isFinite(yuan) || yuan <= 0) {
          toast.info('请输入大于 0 的价格')
          return
        }
        this.submitBatchPrice(ids, 'set', Math.round(yuan * 100))
      }
    })
  },

  /** 按折扣比例调价 */
  batchPercentPrice(ids) {
    wx.showModal({
      title: '批量折扣',
      editable: true,
      placeholderText: '输入折扣百分比，如 90 表示 9 折',
      content: '90',
      confirmText: '保存',
      confirmColor: '#FF5C39',
      success: (res) => {
        if (!res.confirm) return
        const pct = Number(String(res.content || '').trim())
        if (!isFinite(pct) || pct <= 0 || pct > 1000) {
          toast.info('折扣需在 0~1000 之间')
          return
        }
        this.submitBatchPrice(ids, 'percent', pct)
      }
    })
  },

  /**
   * 提交批量改价
   * @param {string[]} ids 商品 id
   * @param {string} mode set | percent
   * @param {number} value 目标值
   */
  submitBatchPrice(ids, mode, value) {
    this.setData({ batchSubmitting: true })
    callAdmin(
      'batchUpdatePrice',
      { productIds: ids, mode, value },
      { loading: true, loadingText: '处理中', showError: false }
    ).then((res) => {
      this.setData({ batchSubmitting: false })
      if (res.code !== 0) {
        toast.error(res.msg || '批量改价失败')
        return
      }
      const d = res.data || {}
      const failCount = (d.failed || []).length
      toast.success(failCount ? `完成 ${d.okCount}，失败 ${failCount}` : `已改价 ${d.okCount} 个`)
      this.setData({ selectedIds: [] })
      this.setData({ page: 1 }, () => this.loadList(true))
    })
  }
})
