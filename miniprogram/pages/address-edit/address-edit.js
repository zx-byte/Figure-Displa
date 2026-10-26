// pages/address-edit/address-edit.js
// 收货地址新增与编辑。前端校验只做交互提示，服务端会再次校验。

const { query, call } = require('../../utils/cloud')
const toast = require('../../utils/toast')
const validate = require('../../utils/validate')

Page({
  data: {
    /** 编辑模式下的地址 ID，空串表示新增 */
    id: '',
    name: '',
    phone: '',
    region: [],
    regionText: '',
    detail: '',
    isDefault: false,
    saving: false,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id, loading: true })
      this.loadDetail(options.id)
    }
  },

  /**
   * 编辑模式：从列表接口取回该地址的现有值
   * @param {string} id 地址 ID
   */
  loadDetail(id) {
    query('address', 'list', {}, { showError: false }).then((res) => {
      const list = (res.code === 0 && res.data && res.data.list) || []
      const item = list.find((a) => a.id === id)
      if (!item) {
        this.setData({ loading: false })
        toast.error('地址不存在')
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      this.setData({
        loading: false,
        name: item.name,
        phone: item.phone,
        region: item.region || [],
        regionText: item.regionText || (item.region || []).join(' '),
        detail: item.detail,
        isDefault: !!item.isDefault
      })
    })
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value })
  },

  onDetailInput(e) {
    this.setData({ detail: e.detail.value })
  },

  /** 地区选择器 */
  onRegionChange(e) {
    const region = e.detail.value || []
    this.setData({ region, regionText: region.join(' ') })
  },

  /** 默认地址开关 */
  onDefaultChange(e) {
    this.setData({ isDefault: !!e.detail.value })
  },

  /** 保存 */
  onSave() {
    if (this.data.saving) return

    const payload = {
      name: this.data.name,
      phone: this.data.phone,
      region: this.data.region,
      detail: this.data.detail,
      isDefault: this.data.isDefault
    }

    const check = validate.checkAddress(payload)
    if (!check.ok) {
      toast.info(check.msg)
      return
    }

    this.setData({ saving: true })
    const action = this.data.id ? 'update' : 'add'
    if (this.data.id) payload.id = this.data.id

    call('address', action, payload, { loading: true, loadingText: '保存中', showError: false }).then(
      (res) => {
        this.setData({ saving: false })
        if (res.code !== 0) {
          toast.error(res.msg || '保存失败')
          return
        }
        toast.success('已保存')
        setTimeout(() => wx.navigateBack(), 600)
      }
    )
  },

  /** 取消 */
  onCancel() {
    wx.navigateBack()
  }
})
