// pages/order-detail/order-detail.js
// 订单详情：状态展示、物流信息、金额明细、订单操作。

const app = getApp()
const { query, call, upload } = require('../../utils/cloud')
const {
  ORDER_STATUS_MAP,
  ORDER_STATUS,
  PAY_EXPIRE_MINUTES,
  AFTER_SALE_STATUS,
  AFTER_SALE_STATUS_MAP,
  AFTER_SALE_TYPES,
  AFTER_SALE_REASONS
} = require('../../config/constants')
const toast = require('../../utils/toast')
const { fenToYuan, formatTime, payCountdown, orderStatusDesc } = require('../../utils/format')
const { requestPayFollowUps } = require('../../utils/subscribe')

Page({
  data: {
    orderId: '',
    loading: true,
    loadError: false,
    order: null,

    statusText: '',
    statusDesc: '',
    payAmountText: '0.00',
    totalText: '0.00',
    freightText: '0.00',
    createTimeText: '',
    payTimeText: '',
    deliverTimeText: '',
    countdown: '',
    goods: [],
    /** 是否显示物流卡片 */
    showExpress: false,
    /** 是否可取消 */
    canCancel: false,
    /** 是否可支付 */
    canPay: false,
    /** 是否可确认收货 */
    canConfirm: false,

    /* 售后 */
    /** 售后弹层是否可见 */
    afterSaleVisible: false,
    /** 售后类型：refund 仅退款 / returnRefund 退货退款 / exchange 换货补发 */
    asType: 'refund',
    /** 售后类型可选项 */
    asTypeOptions: [
      { value: 'refund', text: '仅退款', desc: '未收到货或无需退货' },
      { value: 'returnRefund', text: '退货退款', desc: '退回作品后退款' },
      { value: 'exchange', text: '换货补发', desc: '寄回问题作品补发' }
    ],
    /** 售后原因分类 */
    asReason: 'quality',
    /** 售后原因可选项 */
    asReasonOptions: [
      { value: 'quality', text: '质量问题' },
      { value: 'damaged', text: '运输损坏' },
      { value: 'wrong', text: '发错/少发货' },
      { value: 'notAsDescribed', text: '与描述不符' },
      { value: 'other', text: '其他原因' }
    ],
    /** 问题描述 */
    asDescription: '',
    /** 凭证图本地路径 */
    asImages: [],
    /** 提交中 */
    asSubmitting: false,
    /** 当前订单的售后记录（无则 null） */
    afterSale: null,
    /** 售后状态文案 */
    asStatusText: '',
    /** 售后状态说明 */
    asStatusDesc: '',
    /** 售后类型文案 */
    asTypeText: '',
    /** 售后原因文案 */
    asReasonText: '',
    /** 是否可申请售后 */
    canAfterSale: false,
    /** 是否可撤销售后 */
    canCancelAfterSale: false,

    /* 物流轨迹 */
    /** 轨迹服务是否可用 */
    traceAvailable: false,
    /** 轨迹节点列表 */
    traces: [],
    /** 轨迹是否加载中 */
    traceLoading: false,
    /** 是否已尝试加载轨迹 */
    traceLoaded: false
  },

  /** 倒计时定时器句柄 */
  timer: null,

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      this.setData({ loading: false, loadError: true })
      return
    }
    this.setData({ orderId: id })
    this.loadDetail()
  },

  onShow() {
    // 从支付流程返回时刷新状态
    if (this.data.loadedOnce && this.data.orderId) {
      this.loadDetail(true)
    }
    this.data.loadedOnce = true
  },

  onUnload() {
    this.clearTimer()
  },

  onHide() {
    this.clearTimer()
  },

  /** 加载订单详情 */
  loadDetail(silent = false) {
    if (!silent) this.setData({ loading: true, loadError: false })

    query('order', 'detail', { orderId: this.data.orderId }, { showError: false }).then((res) => {
      if (res.code !== 0 || !res.data) {
        if (!silent) this.setData({ loading: false, loadError: true })
        return
      }

      const order = res.data
      const statusInfo = ORDER_STATUS_MAP[order.status] || { text: '未知状态' }

      const goods = (order.goodsList || []).map((g) =>
        Object.assign({}, g, {
          priceText: fenToYuan(g.price),
          subtotalText: fenToYuan(g.price * g.count)
        })
      )

      // 售后展示字段：有售后记录时呈现进度，无则按订单状态判断可否申请
      const afterSale = order.afterSale || null
      const asInfo = afterSale ? AFTER_SALE_STATUS_MAP[afterSale.status] || {} : {}
      const asType = afterSale ? AFTER_SALE_TYPES[afterSale.type] || {} : {}
      const asReason = afterSale ? AFTER_SALE_REASONS[afterSale.reason] || '' : ''
      const canAfterSale =
        !afterSale && (order.status === ORDER_STATUS.UNRECEIVED || order.status === ORDER_STATUS.FINISHED)
      const canCancelAfterSale = !!afterSale && afterSale.status === AFTER_SALE_STATUS.PENDING

      this.setData({
        loading: false,
        loadError: false,
        order,
        statusText: statusInfo.text,
        statusDesc: orderStatusDesc(order.status),
        payAmountText: fenToYuan(order.payAmount),
        totalText: fenToYuan(order.totalPrice),
        freightText: order.freight === 0 ? '免运费' : fenToYuan(order.freight),
        createTimeText: formatTime(order.createTime),
        payTimeText: order.payTime ? formatTime(order.payTime) : '',
        deliverTimeText: order.deliverTime ? formatTime(order.deliverTime) : '',
        goods,
        showExpress: order.status >= ORDER_STATUS.UNRECEIVED && !!order.expressNo,
        canCancel: order.status === ORDER_STATUS.UNPAID,
        canPay: order.status === ORDER_STATUS.UNPAID,
        canConfirm: order.status === ORDER_STATUS.UNRECEIVED,
        afterSale,
        asStatusText: asInfo.text || '',
        asStatusDesc: asInfo.desc || '',
        asTypeText: asType.text || '',
        asReasonText: asReason,
        canAfterSale,
        canCancelAfterSale
      })

      // 待付款订单启动倒计时；已超时的不启动，否则会每 1.2 秒触发一次重新加载
      if (order.status === ORDER_STATUS.UNPAID) {
        const created = new Date(order.createTime).getTime()
        const expired = Date.now() - created > PAY_EXPIRE_MINUTES * 60 * 1000
        if (expired) {
          this.clearTimer()
          this.setData({ countdown: '' })
        } else {
          this.startCountdown(created)
        }
      } else {
        this.clearTimer()
        this.setData({ countdown: '' })
      }

      // 已发货则顺带加载物流轨迹（首次或刷新时）
      if (order.status >= ORDER_STATUS.UNRECEIVED && order.expressNo) {
        this.loadTrace()
      }
    })
  },

  /**
   * 启动支付倒计时
   * @param {number} createTimestamp 订单创建时间戳
   */
  startCountdown(createTimestamp) {
    this.clearTimer()
    const tick = () => {
      const text = payCountdown(createTimestamp)
      this.setData({ countdown: text })
      if (text === '00:00') {
        this.clearTimer()
        // 超时后刷新一次，拿服务端关单后的真实状态
        setTimeout(() => this.loadDetail(true), 1200)
      }
    }
    tick()
    this.timer = setInterval(tick, 1000)
  },

  clearTimer() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  },

  /** 复制订单号 */
  onCopyOrderNo() {
    const order = this.data.order
    if (!order) return
    wx.setClipboardData({ data: order.orderNo })
  },

  /** 取消订单 */
  onCancel() {
    toast
      .confirm('取消后库存将释放，确定取消这笔订单吗？', {
        confirmText: '取消订单',
        cancelText: '再想想'
      })
      .then((ok) => {
        if (!ok) return
        call(
          'order',
          'cancel',
          { orderId: this.data.orderId },
          { loading: true, loadingText: '处理中' }
        ).then((res) => {
          if (res.code === 0) {
            toast.success('订单已取消')
            this.loadDetail(true)
          }
        })
      })
  },

  /** 继续支付 */
  onPay() {
    // 订阅消息授权须由用户手势触发，支付前顺势征订发货/售后通知，拒绝不阻断支付
    requestPayFollowUps()
    toast.loading('正在发起支付')
    call('pay', 'unifiedOrder', { type: 'order', id: this.data.orderId }, { showError: false }).then(
      (res) => {
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
            call('pay', 'queryOrder', { orderId: this.data.orderId }, { showError: false }).then(
              () => {
                toast.success('支付成功')
                this.loadDetail(true)
              }
            )
          },
          fail: (err) => {
            const canceled = err && /cancel/i.test(err.errMsg || '')
            toast.info(canceled ? '支付已取消' : '支付未完成，可稍后重试')
            this.loadDetail(true)
          }
        })
      }
    )
  },

  /** 确认收货 */
  onConfirm() {
    toast.confirm('确认已收到作品？确认后订单将完成', { confirmText: '确认收货' }).then((ok) => {
      if (!ok) return
      call(
        'order',
        'confirm',
        { orderId: this.data.orderId },
        { loading: true, loadingText: '处理中' }
      ).then((res) => {
        if (res.code === 0) {
          toast.success('已确认收货')
          this.loadDetail(true)
        }
      })
    })
  },

  /** 复制快递单号 */
  onCopyExpress() {
    const order = this.data.order
    if (!order || !order.expressNo) return
    wx.setClipboardData({ data: order.expressNo })
  },

  /**
   * 加载物流轨迹。
   * 仅在订单已发货（showExpress）时调用；轨迹服务不可用时降级为「复制单号自行查询」。
   */
  loadTrace() {
    if (!this.data.orderId || this.data.traceLoading) return
    this.setData({ traceLoading: true })
    query('order', 'traceExpress', { orderId: this.data.orderId }, { showError: false })
      .then((res) => {
        const data = (res && res.data) || {}
        this.setData({
          traceLoading: false,
          traceLoaded: true,
          traceAvailable: !!data.available,
          traces: Array.isArray(data.traces) ? data.traces : []
        })
      })
      .catch(() => {
        this.setData({ traceLoading: false, traceLoaded: true, traceAvailable: false, traces: [] })
      })
  },

  /** 手动刷新轨迹 */
  onRefreshTrace() {
    this.loadTrace()
  },

  /** 跳商品详情 */
  goProduct(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpackages/works/pages/detail/detail?id=${id}` })
  },

  /** 申请售后 */
  onAfterSale() {
    this.setData({
      afterSaleVisible: true,
      asType: 'refund',
      asReason: 'quality',
      asDescription: '',
      asImages: [],
      asSubmitting: false
    })
  },

  /** 关闭售后弹层 */
  onCloseAfterSale() {
    if (this.data.asSubmitting) return
    this.setData({ afterSaleVisible: false })
  },

  noop() {},

  /** 选择售后类型 */
  onSelectAsType(e) {
    this.setData({ asType: e.currentTarget.dataset.value })
  },

  /** 选择售后原因 */
  onSelectAsReason(e) {
    this.setData({ asReason: e.currentTarget.dataset.value })
  },

  /** 售后问题描述 */
  onAsDescInput(e) {
    this.setData({ asDescription: e.detail.value })
  },

  /** 上传售后凭证图，最多 6 张 */
  onChooseAsImages() {
    const remain = 6 - this.data.asImages.length
    if (remain <= 0) {
      toast.info('最多上传 6 张凭证图')
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const files = res.tempFiles || []
        const paths = files.map((f) => f.tempFilePath)
        this.setData({ asImages: this.data.asImages.concat(paths) })
      }
    })
  },

  /** 删除已选凭证图 */
  onRemoveAsImage(e) {
    const idx = e.currentTarget.dataset.index
    const list = this.data.asImages.slice()
    list.splice(idx, 1)
    this.setData({ asImages: list })
  },

  /** 预览凭证图 */
  onPreviewAsImage(e) {
    const idx = e.currentTarget.dataset.index
    wx.previewImage({ current: this.data.asImages[idx], urls: this.data.asImages })
  },

  /**
   * 提交售后申请
   * 流程：本地校验 → 上传凭证图 → 调用 order.applyAfterSale → 刷新详情。
   */
  onSubmitAfterSale() {
    if (this.data.asSubmitting) return

    const description = String(this.data.asDescription || '').trim()
    if (description.length < 10) {
      toast.info('请至少用 10 个字描述遇到的问题')
      return
    }
    if (description.length > 300) {
      toast.info('问题描述不能超过 300 字')
      return
    }

    this.setData({ asSubmitting: true })
    toast.loading('正在提交')

    // 先上传凭证图，再整体提交；任一图失败则中止，避免提交不完整申请
    Promise.all(
      this.data.asImages.map((path) =>
        upload(path, 'after-sale').catch(() => null)
      )
    )
      .then((ids) => {
        const images = ids.filter(Boolean)
        return call(
          'order',
          'applyAfterSale',
          {
            orderId: this.data.orderId,
            type: this.data.asType,
            reason: this.data.asReason,
            description,
            images
          },
          { showError: false }
        )
      })
      .then((res) => {
        this.setData({ asSubmitting: false })
        toast.hide()
        if (res && res.code === 0) {
          toast.success('售后申请已提交')
          this.setData({ afterSaleVisible: false })
          this.loadDetail(true)
        } else {
          toast.alert((res && res.msg) || '提交失败，请稍后重试')
        }
      })
      .catch(() => {
        this.setData({ asSubmitting: false })
        toast.hide()
        toast.error('提交异常，请稍后重试')
      })
  },

  /** 撤销售后申请 */
  onCancelAfterSale() {
    toast
      .confirm('撤销售后申请后订单将回到原来的状态，确定撤销吗？', { confirmText: '撤销申请' })
      .then((ok) => {
        if (!ok) return
        call(
          'order',
          'cancelAfterSale',
          { orderId: this.data.orderId },
          { loading: true, loadingText: '处理中' }
        ).then((res) => {
          if (res.code === 0) {
            toast.success('已撤销售后申请')
            this.loadDetail(true)
          }
        })
      })
  },

  /** 重试 */
  onRetry() {
    this.loadDetail()
  }
})
