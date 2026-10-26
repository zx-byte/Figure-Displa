// pages/order-list/order-list.js
// 订单列表：按状态筛选、分页加载、取消订单、继续支付、确认收货。

const app = getApp()
const { query, call } = require('../../utils/cloud')
const { ORDER_TABS, ORDER_STATUS_MAP } = require('../../config/constants')
const toast = require('../../utils/toast')
const { fenToYuan, formatTime, payCountdown } = require('../../utils/format')

Page({
  data: {
    tabs: ORDER_TABS,
    activeStatus: null,
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false
  },

  onLoad(options) {
    // 支持从个人中心带状态进入，如 ?status=0
    const status = options.status
    this.setData({
      activeStatus: status === undefined || status === '' ? null : Number(status)
    })
    this.loadList(true)
  },

  onShow() {
    // 从支付或详情返回时刷新列表
    if (this.data.loadedOnce) {
      this.refresh()
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
   * 加载订单列表
   * @param {boolean} reset 是否重置
   * @param {function} done 完成回调
   */
  loadList(reset = false, done) {
    if (reset) {
      this.setData({ loading: true, loadError: false })
    } else {
      this.setData({ loadingMore: true })
    }

    const params = { page: this.data.page }
    if (this.data.activeStatus !== null) {
      params.status = this.data.activeStatus
    }

    query('order', 'list', params, { showError: false })
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

  /**
   * 给订单补上展示字段
   * @param {object[]} list
   */
  decorate(list) {
    return list.map((order) => {
      const statusInfo = ORDER_STATUS_MAP[order.status] || { text: '未知', desc: '' }
      const goods = (order.goodsList || []).map((g) =>
        Object.assign({}, g, { priceText: fenToYuan(g.price) })
      )
      return Object.assign({}, order, {
        statusText: statusInfo.text,
        statusDesc: statusInfo.desc,
        payAmountText: fenToYuan(order.payAmount),
        createTimeText: formatTime(order.createTime, 'short'),
        countdown: order.status === 0 ? payCountdown(new Date(order.createTime).getTime()) : '',
        /** 列表只展示前两件商品，其余折叠 */
        displayGoods: goods.slice(0, 2),
        moreCount: Math.max(0, goods.length - 2),
        totalCount: goods.reduce((sum, g) => sum + (g.count || 0), 0)
      })
    })
  },

  /** 刷新当前列表 */
  refresh() {
    this.setData({ page: 1 }, () => this.loadList(true))
  },

  /** 切换状态 tab */
  onTabTap(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.activeStatus) return
    this.setData({ activeStatus: status, page: 1, list: [] }, () => this.loadList(true))
  },

  /** 进入订单详情 */
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/order-detail/order-detail?id=${id}` })
  },

  /** 取消订单 */
  onCancel(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('取消后库存将释放，确定取消这笔订单吗？', { confirmText: '取消订单', cancelText: '再想想' })
      .then((ok) => {
        if (!ok) return
        call('order', 'cancel', { orderId: id }, { loading: true, loadingText: '处理中' }).then(
          (res) => {
            if (res.code === 0) {
              toast.success('订单已取消')
              this.refresh()
            }
          }
        )
      })
  },

  /** 继续支付 */
  onPay(e) {
    const id = e.currentTarget.dataset.id
    toast.loading('正在发起支付')

    call('pay', 'unifiedOrder', { type: 'order', id }, { showError: false }).then((res) => {
      toast.hide()
      if (res.code !== 0) {
        toast.alert(res.msg || '发起支付失败，请稍后重试')
        return
      }
      const payment = res.data.payment
      wx.requestPayment({
        timeStamp: payment.timeStamp,
        nonceStr: payment.nonceStr,
        package: payment.package,
        signType: payment.signType || 'RSA',
        paySign: payment.paySign,
        success: () => {
          // 支付成功后主动查单确认，再刷新列表
          call('pay', 'queryOrder', { orderId: id }, { showError: false }).then(() => {
            toast.success('支付成功')
            this.refresh()
          })
        },
        fail: (err) => {
          const canceled = err && /cancel/i.test(err.errMsg || '')
          toast.info(canceled ? '支付已取消' : '支付未完成，可稍后重试')
          this.refresh()
        }
      })
    })
  },

  /** 确认收货 */
  onConfirm(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('确认已收到作品？确认后订单将完成', { confirmText: '确认收货' })
      .then((ok) => {
        if (!ok) return
        call('order', 'confirm', { orderId: id }, { loading: true, loadingText: '处理中' }).then(
          (res) => {
            if (res.code === 0) {
              toast.success('已确认收货')
              this.refresh()
            }
          }
        )
      })
  },

  /** 重试 */
  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
  },

  /** 去逛逛 */
  goShopping() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  /** 空方法，用于 catchtap 阻断冒泡到卡片跳转 */
  noop() {}
})
