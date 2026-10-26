// pages/address/address.js
// 收货地址管理。带 mode=select 参数进入时，点击地址即选中并返回上一页。

const app = getApp()
const { query, call } = require('../../utils/cloud')
const toast = require('../../utils/toast')

Page({
  data: {
    list: [],
    loading: true,
    /** 是否为选择模式（从订单确认页进入） */
    selectMode: false
  },

  onLoad(options) {
    this.setData({ selectMode: options.mode === 'select' })
  },

  onShow() {
    this.loadList()
  },

  /** 加载地址列表 */
  loadList() {
    query('address', 'list', {}, { showError: false }).then((res) => {
      if (res.code !== 0) {
        this.setData({ loading: false })
        return
      }
      this.setData({
        loading: false,
        list: (res.data && res.data.list) || []
      })
    })
  },

  /** 点击地址项 */
  onItemTap(e) {
    const index = e.currentTarget.dataset.index
    const item = this.data.list[index]
    if (!item) return

    if (this.data.selectMode) {
      app.globalData.selectedAddress = item
      wx.navigateBack()
      return
    }

    this.goEdit(item.id)
  },

  /** 新增地址 */
  onAdd() {
    wx.navigateTo({ url: '/pages/address-edit/address-edit' })
  },

  /** 编辑地址 */
  goEdit(id) {
    wx.navigateTo({ url: `/pages/address-edit/address-edit?id=${id}` })
  },

  /** 编辑按钮 */
  onEdit(e) {
    const id = e.currentTarget.dataset.id
    this.goEdit(id)
  },

  /** 设为默认 */
  onSetDefault(e) {
    const id = e.currentTarget.dataset.id
    call('address', 'setDefault', { id }, { loading: true, loadingText: '设置中' }).then((res) => {
      if (res.code === 0) {
        toast.success('已设为默认地址')
        this.loadList()
      }
    })
  },

  /** 删除地址 */
  onDelete(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('确定删除这个收货地址吗？', { confirmText: '删除', cancelText: '取消' })
      .then((ok) => {
        if (!ok) return
        call('address', 'remove', { id }, { loading: true, loadingText: '删除中' }).then((res) => {
          if (res.code === 0) {
            toast.success('已删除')
            this.loadList()
          }
        })
      })
  }
})
