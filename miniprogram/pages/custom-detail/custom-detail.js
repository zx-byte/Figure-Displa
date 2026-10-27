// pages/custom-detail/custom-detail.js
// 定制单详情与进度时间轴。支持支付定金、支付尾款、取消未支付定金的定制单。

const { query, call } = require('../../utils/cloud')
const { CUSTOM_STATUS_MAP, CUSTOM_STATUS } = require('../../config/constants')
const toast = require('../../utils/toast')
const track = require('../../utils/track')
const { fenToYuan, formatTime, customStatusDesc } = require('../../utils/format')

Page({
  data: {
    customId: '',
    loading: true,
    loadError: false,
    item: null,

    statusText: '',
    statusDesc: '',
    quoteText: '0.00',
    depositText: '0.00',
    restText: '0.00',
    createTimeText: '',

    /** 进度节点，按时间倒序 */
    schedule: [],
    /** 需求信息 */
    requirement: {},
    refImages: [],

    canPayDeposit: false,
    canPayRest: false,
    canCancel: false
  },

  onLoad(options) {
    const id = options.id || ''
    if (!id) {
      this.setData({ loading: false, loadError: true })
      return
    }
    this.setData({ customId: id })
    this.loadDetail()
  },

  onShow() {
    if (this.data.loadedOnce && this.data.customId) {
      this.loadDetail(true)
    }
    this.data.loadedOnce = true
  },

  /** 加载定制单详情 */
  loadDetail(silent = false) {
    if (!silent) this.setData({ loading: true, loadError: false })

    query('custom', 'detail', { customId: this.data.customId }, { showError: false }).then((res) => {
      if (res.code !== 0 || !res.data) {
        if (!silent) this.setData({ loading: false, loadError: true })
        return
      }

      const item = res.data
      const statusInfo = CUSTOM_STATUS_MAP[item.status] || { text: '未知状态' }
      const total = Number(item.totalQuote) || 0
      const deposit = Number(item.deposit) || 0
      const rest = Math.max(0, total - deposit)

      // 时间轴按时间倒序，最新进度排在最前
      const schedule = (item.schedule || [])
        .slice()
        .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
        .map((node, index) => ({
          stage: node.stage,
          desc: node.desc,
          images: node.images || [],
          timeText: formatTime(node.time),
          /** 首项为当前最新节点，用高亮样式区分 */
          isLatest: index === 0
        }))

      this.setData({
        loading: false,
        loadError: false,
        item,
        statusText: statusInfo.text,
        statusDesc: customStatusDesc(item.status),
        quoteText: fenToYuan(total),
        depositText: fenToYuan(deposit),
        restText: fenToYuan(rest),
        createTimeText: formatTime(item.createTime),
        schedule,
        requirement: item.requirement || {},
        refImages: item.refImages || [],
        canPayDeposit: item.status === CUSTOM_STATUS.UNPAID,
        canPayRest: item.status === CUSTOM_STATUS.UNPAID_REST,
        canCancel: item.status === CUSTOM_STATUS.PENDING || item.status === CUSTOM_STATUS.UNPAID
      })
    })
  },

  /** 预览参考图或进度图 */
  onPreview(e) {
    const { src, list } = e.currentTarget.dataset
    const urls = list && list.length ? list : [src]
    wx.previewImage({ current: src, urls })
  },

  /** 支付定金 */
  onPayDeposit() {
    this.payWithStage('deposit')
  },

  /** 支付尾款 */
  onPayRest() {
    this.payWithStage('rest')
  },

  /**
   * 发起定金或尾款支付
   * @param {string} stage 'deposit' | 'rest'
   */
  payWithStage(stage) {
    toast.loading('正在发起支付')
    call(
      'pay',
      'unifiedOrder',
      { type: 'custom', id: this.data.customId, stage },
      { showError: false }
    ).then((res) => {
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
          toast.success(stage === 'deposit' ? '定金支付成功' : '尾款支付成功')
          // 回调可能有延迟，这里稍作等待再刷新，确保读到最新状态
          setTimeout(() => this.loadDetail(true), 1200)
        },
        fail: (err) => {
          const canceled = err && /cancel/i.test(err.errMsg || '')
          toast.info(canceled ? '支付已取消' : '支付未完成，可稍后重试')
          this.loadDetail(true)
        }
      })
    })
  },

  /** 取消定制单 */
  onCancel() {
    const tip =
      this.data.item.status === CUSTOM_STATUS.UNPAID
        ? '取消后定金名额将释放，确定取消这笔定制单吗？'
        : '确定取消这笔定制需求吗？'

    toast.confirm(tip, { confirmText: '取消定制', cancelText: '再想想' }).then((ok) => {
      if (!ok) return
      call(
        'custom',
        'cancel',
        { customId: this.data.customId },
        { loading: true, loadingText: '处理中' }
      ).then((res) => {
        if (res.code === 0) {
          toast.success('已取消')
          this.loadDetail(true)
        }
      })
    })
  },

  /** 点击客服（open-type="contact" 触发），用于统计定制单的咨询量 */
  onContactTap() {
    track.trackConsult('', 'custom-detail')
  },

  /** 重试 */
  onRetry() {
    this.loadDetail()
  }
})
