// pages/cart/cart.js
// 购物车。数据存放在本地缓存，进入页面时向云端核对商品状态与最新价格。
// 结算金额仅作展示，最终以服务端重算结果为准。

const app = getApp()
const { query } = require('../../utils/cloud')
const { STORAGE_KEYS } = require('../../config/constants')
const toast = require('../../utils/toast')
const { fenToYuan } = require('../../utils/format')

Page({
  data: {
    list: [],
    /** 是否处于编辑（删除）模式 */
    editing: false,
    /** 勾选商品的合计金额文案 */
    totalText: '0.00',
    /** 勾选商品件数 */
    checkedCount: 0,
    /** 是否全选 */
    allChecked: false,
    loading: true
  },

  onShow() {
    this.loadCart()
  },

  /**
   * 读取本地购物车并与云端核对
   * 下架或售罄的商品标记为 invalid，不参与结算
   */
  loadCart() {
    const cart = wx.getStorageSync(STORAGE_KEYS.CART) || []
    if (cart.length === 0) {
      this.setData({ list: [], loading: false, totalText: '0.00', checkedCount: 0, allChecked: false })
      return
    }

    const ids = cart.map((item) => item.productId).filter(Boolean)

    query('product', 'batch', { ids }, { showError: false }).then((res) => {
      const liveMap = {}
      if (res.code === 0 && res.data && Array.isArray(res.data.list)) {
        res.data.list.forEach((p) => {
          liveMap[p._id] = p
        })
      }

      const list = cart.map((item) => {
        const live = liveMap[item.productId]
        // 云端已不存在的商品标记为失效
        if (!live) {
          return Object.assign({}, item, {
            invalid: true,
            invalidReason: '作品已下架',
            checked: false
          })
        }
        const stock = Number(live.stock) || 0
        const count = Math.min(item.count, Math.max(1, stock))
        return Object.assign({}, item, {
          name: live.name,
          cover: live.cover,
          price: live.price,
          priceText: fenToYuan(live.price),
          count,
          stock,
          invalid: stock <= 0,
          invalidReason: stock <= 0 ? '作品已售罄' : '',
          // 首次进入时默认勾选有效商品
          checked: item.checked === undefined ? stock > 0 : item.checked && stock > 0
        })
      })

      this.setData({ list, loading: false })
      this.persist(list)
      this.recalc(list)
    })
  },

  /** 把当前列表写回本地缓存 */
  persist(list) {
    const plain = list.map((item) => ({
      productId: item.productId,
      name: item.name,
      cover: item.cover,
      price: item.price,
      count: item.count,
      spec: item.spec,
      type: item.type,
      limitNum: item.limitNum,
      checked: item.checked
    }))
    wx.setStorageSync(STORAGE_KEYS.CART, plain)
    app.refreshCartCount()
  },

  /** 重算合计 */
  recalc(list) {
    const source = list || this.data.list
    let total = 0
    let count = 0
    source.forEach((item) => {
      if (item.checked && !item.invalid) {
        total += item.price * item.count
        count += item.count
      }
    })
    const validItems = source.filter((item) => !item.invalid)
    this.setData({
      totalText: fenToYuan(total),
      checkedCount: count,
      allChecked: validItems.length > 0 && validItems.every((item) => item.checked)
    })
  },

  /** 切换单项勾选 */
  onToggleCheck(e) {
    const index = e.currentTarget.dataset.index
    const list = this.data.list.slice()
    if (list[index].invalid) return
    list[index].checked = !list[index].checked
    this.setData({ list })
    this.persist(list)
    this.recalc(list)
  },

  /** 全选 / 取消全选 */
  onToggleAll() {
    const next = !this.data.allChecked
    const list = this.data.list.map((item) =>
      item.invalid ? item : Object.assign({}, item, { checked: next })
    )
    this.setData({ list })
    this.persist(list)
    this.recalc(list)
  },

  /** 数量增减 */
  onCountChange(e) {
    const { index, delta } = e.currentTarget.dataset
    const list = this.data.list.slice()
    const item = list[index]
    if (!item || item.invalid) return

    const max = item.type === 1 ? 1 : Math.max(1, item.stock || 1)
    const next = Math.min(max, Math.max(1, item.count + Number(delta)))
    if (next === item.count) {
      if (item.type === 1 && Number(delta) > 0) toast.info('限量作品每单限购 1 件')
      return
    }

    list[index].count = next
    this.setData({ list })
    this.persist(list)
    this.recalc(list)
  },

  /** 切换编辑模式 */
  onToggleEdit() {
    this.setData({ editing: !this.data.editing })
  },

  /** 删除单项 */
  onRemove(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.list[index]
    if (!item) return

    toast.confirm(`确定移出「${item.name}」吗？`, { confirmText: '移出' }).then((ok) => {
      if (!ok) return
      const list = this.data.list.slice()
      list.splice(index, 1)
      this.setData({ list })
      this.persist(list)
      this.recalc(list)
      if (list.length === 0) {
        this.setData({ editing: false })
      }
    })
  },

  /** 清空失效商品 */
  onClearInvalid() {
    const list = this.data.list.filter((item) => !item.invalid)
    this.setData({ list })
    this.persist(list)
    this.recalc(list)
    toast.success('已清理')
  },

  /** 去结算 */
  onCheckout() {
    if (this.data.checkedCount === 0) {
      toast.info('请先选择要结算的作品')
      return
    }

    const items = this.data.list
      .filter((item) => item.checked && !item.invalid)
      .map((item) => ({
        productId: item.productId,
        name: item.name,
        cover: item.cover,
        price: item.price,
        count: item.count,
        spec: item.spec,
        type: item.type,
        limitNum: item.limitNum
      }))

    app.globalData.checkoutItems = items
    wx.navigateTo({ url: '/pages/order-confirm/order-confirm?from=cart' })
  },

  /** 去逛逛 */
  goShopping() {
    wx.switchTab({ url: '/pages/index/index' })
  },

  /** 跳商品详情 */
  goDetail(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/subpackages/works/pages/detail/detail?id=${id}` })
  }
})
