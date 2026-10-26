// pages/admin/order/order.js
// 订单管理：状态筛选、发货录入、关闭订单、强制完成。
// 状态流转在云函数侧有白名单限制，前端只提供合法入口。

const { callAdmin } = require('../../../utils/admin')
const {
  ORDER_STATUS_MAP,
  AFTER_SALE_TYPES,
  AFTER_SALE_REASONS
} = require('../../../config/constants')
const toast = require('../../../utils/toast')
const { fenToYuan, formatTime } = require('../../../utils/format')

const TABS = [
  { label: '全部', status: null },
  { label: '待付款', status: 0 },
  { label: '待发货', status: 1 },
  { label: '待收货', status: 2 },
  { label: '已完成', status: 3 },
  { label: '售后中', status: 4 },
  { label: '已取消', status: -1 }
]

/** 常用快递公司，供发货弹层快速选择 */
const EXPRESS_COMPANIES = ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '京东物流', 'EMS', '极兔速递']

Page({
  data: {
    tabs: TABS,
    activeStatus: null,
    keyword: '',
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false,
    total: 0,

    /** 发货弹层 */
    deliverVisible: false,
    deliverOrderId: '',
    deliverOrderNo: '',
    expressCompanies: EXPRESS_COMPANIES,
    expressCompany: '',
    expressNo: '',
    delivering: false,

    /* 售后处理 */
    /** 售后处理弹层是否可见 */
    afterSaleVisible: false,
    /** 当前处理的订单 */
    afterSaleOrder: null,
    /** 处理备注 */
    afterSaleNote: '',
    /** 退款金额（元，展示用） */
    afterSaleRefundText: '',
    /** 处理中 */
    afterSaleSubmitting: false
  },

  onLoad(options) {
    const status = options.status
    this.setData({
      activeStatus: status === undefined || status === '' ? null : Number(status)
    })
    this.loadList(true)
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
   * 加载订单列表
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

    callAdmin('orderList', params, { showError: false })
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

  /** 补充展示字段 */
  decorate(list) {
    return list.map((order) => {
      const statusInfo = ORDER_STATUS_MAP[order.status] || { text: '未知', desc: '' }
      const goods = (order.goodsList || []).map((g) =>
        Object.assign({}, g, { priceText: fenToYuan(g.price) })
      )
      const addr = order.address || {}
      const as = order.afterSale || null
      return Object.assign({}, order, {
        statusText: statusInfo.text,
        payAmountText: fenToYuan(order.payAmount),
        createTimeText: formatTime(order.createTime, 'short'),
        payTimeText: order.payTime ? formatTime(order.payTime, 'short') : '',
        goods,
        totalCount: goods.reduce((sum, g) => sum + (g.count || 0), 0),
        addressText: `${addr.name || ''} ${addr.phone || ''} ${addr.regionText || ''} ${addr.detail || ''}`,
        // 售后弹层展示文案
        afterSale: as,
        afterSaleTypeText: as ? ((AFTER_SALE_TYPES[as.type] || {}).text || '') : '',
        afterSaleReasonText: as ? (AFTER_SALE_REASONS[as.reason] || '') : ''
      })
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

  /* ---------------- 发货 ---------------- */

  /**
   * 打开发货弹层
   * @param {object} e 事件，携带 orderId 与 orderNo
   */
  onOpenDeliver(e) {
    const { id, no } = e.currentTarget.dataset
    this.setData({
      deliverVisible: true,
      deliverOrderId: id,
      deliverOrderNo: no,
      expressCompany: '',
      expressNo: ''
    })
  },

  onCloseDeliver() {
    this.setData({ deliverVisible: false })
  },

  /** 阻止弹层内部点击穿透 */
  noop() {},

  onSelectCompany(e) {
    this.setData({ expressCompany: e.currentTarget.dataset.name })
  },

  onExpressNoInput(e) {
    this.setData({ expressNo: e.detail.value })
  },

  /** 提交发货 */
  onSubmitDeliver() {
    if (this.data.delivering) return

    const company = this.data.expressCompany
    const no = String(this.data.expressNo || '').trim()

    if (!company) {
      toast.info('请选择快递公司')
      return
    }
    if (no.length < 6) {
      toast.info('请填写正确的快递单号')
      return
    }

    this.setData({ delivering: true })

    callAdmin(
      'deliver',
      {
        orderId: this.data.deliverOrderId,
        expressCompany: company,
        expressNo: no
      },
      { loading: true, loadingText: '提交中', showError: false }
    ).then((res) => {
      this.setData({ delivering: false })
      if (res.code !== 0) {
        toast.error(res.msg || '发货失败')
        return
      }
      toast.success('已发货')
      this.setData({ deliverVisible: false })
      this.setData({ page: 1 }, () => this.loadList(true))
    })
  },

  /* ---------------- 状态操作 ---------------- */

  /** 关闭待付款订单 */
  onCloseOrder(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('关闭后库存将释放，确定关闭这笔订单吗？', { confirmText: '关闭订单' })
      .then((ok) => {
        if (!ok) return
        callAdmin(
          'updateOrderStatus',
          { orderId: id, status: -1 },
          { loading: true, loadingText: '处理中' }
        ).then((res) => {
          if (res.code === 0) {
            toast.success('订单已关闭')
            this.setData({ page: 1 }, () => this.loadList(true))
          }
        })
      })
  },

  /** 强制完成待收货订单 */
  onForceFinish(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('强制完成后买家将无法再确认收货，确定继续吗？', { confirmText: '强制完成' })
      .then((ok) => {
        if (!ok) return
        callAdmin(
          'updateOrderStatus',
          { orderId: id, status: 3 },
          { loading: true, loadingText: '处理中' }
        ).then((res) => {
          if (res.code === 0) {
            toast.success('已完成')
            this.setData({ page: 1 }, () => this.loadList(true))
          }
        })
      })
  },

  /** 复制订单号 */
  onCopyNo(e) {
    const no = e.currentTarget.dataset.no
    if (!no) return
    wx.setClipboardData({ data: no })
  },

  /* ---------------- 售后处理 ---------------- */

  /**
   * 打开售后处理弹层
   * @param {object} e 事件，携带订单 item
   */
  onOpenAfterSale(e) {
    const id = e.currentTarget.dataset.id
    const order = this.data.list.find((o) => o._id === id)
    if (!order) return
    // 退款金额默认取实付金额，转成「元」便于商家确认
    const refundYuan = ((order.payAmount || 0) / 100).toFixed(2)
    this.setData({
      afterSaleVisible: true,
      afterSaleOrder: order,
      afterSaleNote: '',
      afterSaleRefundText: refundYuan
    })
  },

  onCloseAfterSale() {
    if (this.data.afterSaleSubmitting) return
    this.setData({ afterSaleVisible: false, afterSaleOrder: null })
  },

  onAfterSaleNoteInput(e) {
    this.setData({ afterSaleNote: e.detail.value })
  },

  onAfterSaleRefundInput(e) {
    this.setData({ afterSaleRefundText: e.detail.value })
  },

  /**
   * 提交售后裁决
   * @param {string} action 'agreeRefund' 同意退款 | 'reject' 拒绝
   */
  onSubmitAfterSale(e) {
    if (this.data.afterSaleSubmitting) return
    const action = e.currentTarget.dataset.action
    const order = this.data.afterSaleOrder
    if (!order) return

    const note = String(this.data.afterSaleNote || '').trim()

    let refundAmount
    if (action === 'agreeRefund') {
      const yuan = Number(this.data.afterSaleRefundText)
      if (!yuan || yuan <= 0) {
        toast.info('请输入正确的退款金额')
        return
      }
      refundAmount = Math.round(yuan * 100)
      if (refundAmount > (order.payAmount || 0)) {
        toast.info('退款金额不能超过实付金额')
        return
      }
    }

    const prompt =
      action === 'agreeRefund'
        ? `确认同意售后并退款 ¥${(refundAmount / 100).toFixed(2)} 吗？退款将原路返回买家。`
        : '确认拒绝本次售后申请吗？订单将回到申请前状态。'

    toast
      .confirm(prompt, {
        confirmText: action === 'agreeRefund' ? '同意退款' : '拒绝',
        cancelText: '再想想'
      })
      .then((ok) => {
        if (!ok) return
        this.setData({ afterSaleSubmitting: true })
        callAdmin(
          'handleAfterSale',
          {
            orderId: order._id,
            action,
            refundAmount,
            note
          },
          { loading: true, loadingText: '处理中', showError: false }
        ).then((res) => {
          this.setData({ afterSaleSubmitting: false })
          if (res.code !== 0) {
            toast.error(res.msg || '处理失败')
            return
          }
          toast.success(action === 'agreeRefund' ? '已同意并退款' : '已拒绝售后')
          this.setData({ afterSaleVisible: false, afterSaleOrder: null })
          this.setData({ page: 1 }, () => this.loadList(true))
        })
      })
  },

  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
  }
})
