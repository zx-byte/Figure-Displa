// pages/custom-apply/custom-apply.js
// 定制需求提交。定金按预期预算的 30% 计算，提交后可直接支付定金锁定排期。

const app = getApp()
const { call, uploadBatch } = require('../../utils/cloud')
const {
  CUSTOM_SCALES,
  CUSTOM_STYLES,
  DEPOSIT_RATE
} = require('../../config/constants')
const toast = require('../../utils/toast')
const validate = require('../../utils/validate')
const track = require('../../utils/track')
const { fenToYuan, yuanToFen } = require('../../utils/format')

/** 参考图上限 */
const MAX_IMAGES = 6

Page({
  data: {
    /** 从商品详情带过来的作品名，仅作预填与展示 */
    fromProductName: '',

    character: '',
    scaleIndex: -1,
    styleIndex: -1,
    extra: '',
    contact: '',
    budget: '',

    scales: CUSTOM_SCALES,
    styles: CUSTOM_STYLES,

    /** 本地临时图片路径 */
    images: [],
    maxImages: MAX_IMAGES,

    /** 定金预估展示 */
    depositText: '0.00',

    submitting: false,

    /** 协议确认弹窗是否显示 */
    privacyShow: false
  },

  onLoad(options) {
    if (options.name) {
      const name = decodeURIComponent(options.name)
      this.setData({
        fromProductName: name,
        character: name
      })
    }

    // 联系电话默认用资料里已保存的号码
    const userInfo = app.globalData.userInfo
    if (userInfo && userInfo.phone) {
      this.setData({ contact: userInfo.phone })
    }
  },

  onCharacterInput(e) {
    this.setData({ character: e.detail.value })
  },

  onScaleChange(e) {
    this.setData({ scaleIndex: Number(e.detail.value) })
  },

  onStyleChange(e) {
    this.setData({ styleIndex: Number(e.detail.value) })
  },

  onExtraInput(e) {
    this.setData({ extra: e.detail.value })
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value })
  },

  /** 预算输入，同步刷新定金预估 */
  onBudgetInput(e) {
    const budget = e.detail.value
    const value = Number(budget)
    const deposit = isFinite(value) && value > 0 ? yuanToFen(value * DEPOSIT_RATE) : 0
    this.setData({ budget, depositText: fenToYuan(deposit) })
  },

  /** 选择参考图 */
  onChooseImage() {
    const remain = MAX_IMAGES - this.data.images.length
    if (remain <= 0) {
      toast.info(`最多上传 ${MAX_IMAGES} 张参考图`)
      return
    }

    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({ images: this.data.images.concat(paths).slice(0, MAX_IMAGES) })
      }
    })
  },

  /** 预览参考图 */
  onPreviewImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.images })
  },

  /** 删除参考图 */
  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  /**
   * 提交需求
   * 流程：表单校验 → 协议确认 → 文本内容检测 → 上传参考图 → 图片内容检测
   *      → custom.submit → 直接拉起定金支付
   *
   * 检测放在提交前而不是提交后：用户填的内容要真正进入商家视野，
   * 先拦住再提示修改，比提交成功后被商家退回体验好得多。
   * 检测服务本身不可用时不阻塞提交——服务端 custom.submit 里还会再查一次文本。
   */
  async onSubmit() {
    if (this.data.submitting) return

    const form = {
      character: this.data.character,
      scale: this.data.scaleIndex >= 0 ? this.data.scales[this.data.scaleIndex] : '',
      style: this.data.styleIndex >= 0 ? this.data.styles[this.data.styleIndex] : '',
      extra: this.data.extra,
      contact: this.data.contact
    }

    const check = validate.checkCustomForm(form)
    if (!check.ok) {
      toast.info(check.msg)
      return
    }

    const budgetNum = Number(this.data.budget)
    if (!isFinite(budgetNum) || budgetNum < 100) {
      toast.info('请填写预期预算，最低 100 元')
      return
    }

    // 本页会收集联系电话，属个人信息处理，未同意协议不往下走。
    // 记一个标记，用户点「同意并继续」后自动接着提交，不用再点一次。
    if (app.needPrivacy()) {
      this.pendingSubmit = true
      this.setData({ privacyShow: true })
      return
    }

    this.setData({ submitting: true })

    try {
      // 一、文本内容检测：角色描述与特殊要求会展示给商家
      toast.loading('内容检查中')
      const textRes = await call(
        'security',
        'text',
        { contents: [form.character, form.extra] },
        { showError: false }
      )
      if (textRes.code === 0 && !textRes.data.pass) {
        toast.hide()
        this.setData({ submitting: false })
        toast.alert('需求描述包含不当内容，请修改后重新提交')
        return
      }

      // 二、上传参考图
      const refImages = this.data.images.length > 0 ? await this.uploadImages() : []

      // 三、图片内容检测
      if (refImages.length > 0) {
        toast.loading('图片检查中')
        const imgRes = await call('security', 'image', { fileIDs: refImages }, { showError: false })
        if (imgRes.code === 0 && !imgRes.data.pass) {
          toast.hide()
          this.setData({ submitting: false })
          const at = (imgRes.data.blockedIndex || 0) + 1
          toast.alert(`第 ${at} 张参考图未通过内容审核，请更换后重试`)
          return
        }
      }

      // 四、提交
      toast.loading('提交中')
      const res = await call(
        'custom',
        'submit',
        {
          requirement: {
            character: form.character,
            scale: form.scale,
            style: form.style,
            extra: form.extra,
            contact: form.contact,
            budget: budgetNum
          },
          refImages
        },
        { showError: false }
      )

      toast.hide()
      if (res.code !== 0) {
        this.setData({ submitting: false })
        toast.alert(res.msg || '提交失败，请稍后重试')
        return
      }

      const { customId, deposit } = res.data
      track.trackCustomSubmit({
        scale: form.scale,
        style: form.style,
        budget: budgetNum
      })
      wx.showModal({
        title: '需求已提交',
        content: `定金 ¥${fenToYuan(deposit)}，支付后进入排期。是否现在支付？`,
        confirmText: '立即支付',
        cancelText: '稍后支付',
        confirmColor: '#FF5C39',
        success: (modalRes) => {
          if (modalRes.confirm) {
            this.payDeposit(customId)
          } else {
            this.goDetail(customId)
          }
        }
      })
    } catch (err) {
      toast.hide()
      this.setData({ submitting: false })
      toast.error('提交异常，请稍后重试')
    }
  },

  /**
   * 上传参考图到云存储
   * @returns {Promise<string[]>} fileID 数组
   */
  uploadImages() {
    return uploadBatch(this.data.images, 'custom')
  },

  /**
   * 支付定金
   * @param {string} customId 定制单 ID
   */
  payDeposit(customId) {
    call(
      'pay',
      'unifiedOrder',
      { type: 'custom', id: customId, stage: 'deposit' },
      { showError: false }
    ).then((res) => {
      if (res.code !== 0) {
        toast.alert(res.msg || '发起支付失败，可在定制详情页重试')
        this.setData({ submitting: false })
        this.goDetail(customId)
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
          this.setData({ submitting: false })
          toast.success('定金支付成功')
          setTimeout(() => this.goDetail(customId), 800)
        },
        fail: () => {
          this.setData({ submitting: false })
          toast.info('定金未支付，可在定制详情页继续支付')
          this.goDetail(customId)
        }
      })
    })
  },

  /**
   * 跳定制详情
   * @param {string} customId
   */
  goDetail(customId) {
    wx.redirectTo({ url: `/pages/custom-detail/custom-detail?id=${customId}` })
  },

  /** 隐私政策 */
  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=privacy' })
  },

  /** 用户协议 */
  goTerms() {
    wx.navigateTo({ url: '/pages/privacy/privacy?tab=terms' })
  },

  /* ---------------- 协议确认 ---------------- */

  /** 同意协议后，接着完成刚才被中断的提交 */
  onPrivacyAgree() {
    app.agreePrivacy()
    this.setData({ privacyShow: false })

    if (this.pendingSubmit) {
      this.pendingSubmit = false
      this.onSubmit()
    }
  },

  /** 暂不使用：关闭弹窗并放弃本次提交 */
  onPrivacyDisagree() {
    this.pendingSubmit = false
    app.dismissPrivacy()
    this.setData({ privacyShow: false })
    toast.info('提交定制需要先同意隐私政策')
  }
})
