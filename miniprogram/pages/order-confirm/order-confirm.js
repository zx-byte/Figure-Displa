// pages/order-confirm/order-confirm.js
// 订单确认与支付。流程：确认地址与明细 → 服务端建单 → 统一下单 → 唤起支付 → 主动查单确认。
//
// 金额只作展示，服务端会按数据库现值重算；不一致时以服务端为准并返回错误。

const app = getApp()
const { query, call } = require('../../utils/cloud')
const {
  STORAGE_KEYS,
  FREIGHT_FEE,
  FREE_FREIGHT_THRESHOLD
} = require('../../config/constants')
const toast = require('../../utils/toast')
const { fenToYuan } = require('../../utils/format')
const { requestPayFollowUps } = require('../../utils/subscribe')

Page({
  data: {
    loading: true,
    /** 结算商品明细 */
    items: [],
    /** 选中的收货地址 */
    address: null,
    /** 备注 */
    remark: '',
    /** 金额明细 */
    totalPrice: 0,
    freight: 0,
    payAmount: 0,
    totalText: '0.00',
    freightText: '0.00',
    payAmountText: '0.00',
    /** 免运费差额提示 */
    freightTip: '',
    /** 提交中，防重复点击 */
    submitting: false,
    /** 来源：cart / detail，用于取消后回退 */
    from: 'cart'
  },

  onLoad(options) {
    const items = (app.globalData.checkoutItems || []).slice()

    if (items.length === 0) {
      toast.info('没有待结算的作品')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }

    this.setData({
      from: options.from || 'cart',
      items: items.map((item) =>
        Object.assign({}, item, {
          priceText: fenToYuan(item.price),
          subtotalText: fenToYuan(item.price * item.count)
        })
      )
    })

    this.calcAmount(items)
    this.loadDefaultAddress()
  },

  onShow() {
    // 从地址页选择回来后刷新选中地址
    const picked = app.globalData.selectedAddress
    if (picked) {
      app.globalData.selectedAddress = null
      this.setData({ address: picked })
    }
  },

  /**
   * 计算金额
   * 与服务端规则一致：商品总额满 299 元免运费，否则 12 元
   */
  calcAmount(items) {
    const list = items || this.data.items
    const totalPrice = list.reduce((sum, item) => sum + item.price * item.count, 0)
    const freight = totalPrice >= FREE_FREIGHT_THRESHOLD ? 0 : FREIGHT_FEE
    const payAmount = totalPrice + freight

    this.setData({
      totalPrice,
      freight,
      payAmount,
      totalText: fenToYuan(totalPrice),
      freightText: freight === 0 ? '免运费' : fenToYuan(freight),
      payAmountText: fenToYuan(payAmount),
      freightTip:
        freight > 0
          ? `再买 ${fenToYuan(FREE_FREIGHT_THRESHOLD - totalPrice)} 元可免运费`
          : '',
      loading: false
    })
  },

  /** 读取默认收货地址 */
  loadDefaultAddress() {
    query('address', 'list', {}, { showError: false }).then((res) => {
      if (res.code === 0 && res.data) {
        const list = res.data.list || []
        const def = list.find((a) => a.isDefault) || list[0] || null
        this.setData({ address: def })
      }
    })
  },

  /** 跳地址选择 */
  goSelectAddress() {
    wx.navigateTo({ url: '/pages/address/address?mode=select' })
  },

  /** 备注输入 */
  onRemarkInput(e) {
    this.setData({ remark: e.detail.value })
  },

  /**
   * 提交订单并发起支付
   */
  onSubmit() {
    if (this.data.submitting) return

    if (!this.data.address) {
      toast.info('请先选择收货地址')
      return
    }
    if (this.data.remark && this.data.remark.length > 100) {
      toast.info('备注不超过 100 个字')
      return
    }

    // 订阅消息授权必须由用户手势触发，这里顺势征订发货/售后通知。
    // 用户拒绝也不阻断下单，仅影响后续能否收到通知。
    requestPayFollowUps()

    this.setData({ submitting: true })
    toast.loading('正在提交订单')

    const goodsList = this.data.items.map((item) => ({
      productId: item.productId,
      count: item.count,
      spec: item.spec || ''
    }))

    call(
      'order',
      'create',
      {
        goodsList,
        addressId: this.data.address.id,
        remark: this.data.remark
      },
      { showError: false }
    )
      .then((res) => {
        if (res.code !== 0) {
          toast.hide()
          this.setData({ submitting: false })
          // 库存或价格变化时引导用户返回刷新
          toast.alert(res.msg || '下单失败，请稍后重试')
          return null
        }
        const { orderId } = res.data
        // 订单已创建，先清掉本地购物车中对应的商品
        this.clearPurchasedFromCart()
        return this.payOrder(orderId)
      })
      .catch(() => {
        toast.hide()
        this.setData({ submitting: false })
        toast.error('下单异常，请稍后重试')
      })
  },

  /**
   * 发起支付
   * @param {string} orderId 订单 ID
   */
  payOrder(orderId) {
    return call('pay', 'unifiedOrder', { type: 'order', id: orderId }, { showError: false }).then(
      (res) => {
        if (res.code !== 0) {
          toast.hide()
          this.setData({ submitting: false })
          // 订单已生成但支付未发起，引导去订单列表继续支付
          toast.alert(res.msg || '发起支付失败，可在订单列表重试', '支付未完成').then(() => {
            this.goOrderDetail(orderId)
          })
          return
        }

        const payment = res.data.payment
        toast.hide()

        wx.requestPayment({
          timeStamp: payment.timeStamp,
          nonceStr: payment.nonceStr,
          package: payment.package,
          signType: payment.signType || 'RSA',
          paySign: payment.paySign,
          success: () => {
            // 支付成功后主动查单，兜底回调延迟
            this.confirmPaid(orderId)
          },
          fail: (err) => {
            this.setData({ submitting: false })
            const canceled = err && /cancel/i.test(err.errMsg || '')
            if (canceled) {
              toast.confirm('支付已取消，订单已保留，是否现在去支付？', {
                confirmText: '去支付',
                cancelText: '稍后'
              }).then((ok) => {
                if (ok) {
                  this.payOrder(orderId)
                } else {
                  this.goOrderDetail(orderId)
                }
              })
            } else {
              toast.alert('支付未完成，可在订单列表重新发起支付', '支付失败').then(() => {
                this.goOrderDetail(orderId)
              })
            }
          }
        })
      }
    )
  },

  /**
   * 支付后主动查单确认状态
   * @param {string} orderId
   */
  confirmPaid(orderId) {
    return call('pay', 'queryOrder', { orderId }, { showError: false }).then((res) => {
      this.setData({ submitting: false })
      // 无论查单结果如何都进入订单详情，详情页会展示真实状态
      this.goOrderDetail(orderId, true)
    })
  },

  /** 从购物车移除已下单商品 */
  clearPurchasedFromCart() {
    if (this.data.from !== 'cart') return
    const purchasedIds = this.data.items.map((item) => item.productId)
    const cart = wx.getStorageSync(STORAGE_KEYS.CART) || []
    const next = cart.filter((item) => purchasedIds.indexOf(item.productId) < 0)
    wx.setStorageSync(STORAGE_KEYS.CART, next)
    app.refreshCartCount()
  },

  /**
   * 跳订单详情
   * @param {string} orderId
   * @param {boolean} replace 是否用 redirect 替换当前页，避免返回到确认页重复下单
   */
  goOrderDetail(orderId, replace = false) {
    app.globalData.checkoutItems = null
    const url = `/pages/order-detail/order-detail?id=${orderId}`
    if (replace) {
      wx.redirectTo({ url })
    } else {
      wx.redirectTo({ url })
    }
  }
})
