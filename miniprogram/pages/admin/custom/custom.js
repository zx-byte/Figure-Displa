// pages/admin/custom/custom.js
// 定制管理：确认报价、更新制作进度、标记完工、查看需求详情。

const { callAdmin } = require('../../../utils/admin')
const { uploadBatch } = require('../../../utils/cloud')
const { CUSTOM_STATUS_MAP, CUSTOM_STATUS } = require('../../../config/constants')
const toast = require('../../../utils/toast')
const { fenToYuan, formatTime, yuanToFen } = require('../../../utils/format')

const TABS = [
  { label: '全部', status: null },
  { label: '待确认', status: 0 },
  { label: '待付定金', status: 1 },
  { label: '制作中', status: 2 },
  { label: '待付尾款', status: 3 },
  { label: '已完成', status: 4 }
]

/** 进度图片上限 */
const MAX_SCHEDULE_IMAGES = 9

Page({
  data: {
    tabs: TABS,
    activeStatus: null,
    list: [],
    page: 1,
    hasMore: true,
    loading: true,
    loadingMore: false,
    loadError: false,
    total: 0,

    /** 展开的需求详情 ID */
    expandedId: '',

    /** 报价弹层 */
    quoteVisible: false,
    quoteCustomId: '',
    quoteCustomNo: '',
    quoteYuan: '',
    quoting: false,

    /** 进度弹层 */
    scheduleVisible: false,
    scheduleCustomId: '',
    scheduleCustomNo: '',
    scheduleStage: '',
    scheduleDesc: '',
    scheduleImages: [],
    maxScheduleImages: MAX_SCHEDULE_IMAGES,
    scheduling: false
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
   * 加载定制单列表
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

    callAdmin('customList', params, { showError: false })
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
    return list.map((item) => {
      const statusInfo = CUSTOM_STATUS_MAP[item.status] || { text: '未知', desc: '' }
      const req = item.requirement || {}
      return Object.assign({}, item, {
        statusText: statusInfo.text,
        quoteText: fenToYuan(item.totalQuote),
        depositText: fenToYuan(item.deposit),
        restText: fenToYuan(Math.max(0, (Number(item.totalQuote) || 0) - (Number(item.deposit) || 0))),
        createTimeText: formatTime(item.createTime, 'short'),
        characterText: req.character || '未填写',
        scaleText: req.scale || '',
        styleText: req.style || '',
        extraText: req.extra || '',
        contactText: req.contact || '',
        refImages: item.refImages || [],
        scheduleCount: (item.schedule || []).length,
        latestStage: (item.schedule || []).length
          ? item.schedule[item.schedule.length - 1].stage
          : ''
      })
    })
  },

  onTabTap(e) {
    const status = e.currentTarget.dataset.status
    if (status === this.data.activeStatus) return
    this.setData({ activeStatus: status, page: 1, list: [] }, () => this.loadList(true))
  },

  /** 展开 / 收起需求详情 */
  onToggleExpand(e) {
    const id = e.currentTarget.dataset.id
    this.setData({ expandedId: this.data.expandedId === id ? '' : id })
  },

  /** 预览参考图 */
  onPreview(e) {
    const { src, list } = e.currentTarget.dataset
    wx.previewImage({ current: src, urls: list && list.length ? list : [src] })
  },

  /* ---------------- 报价 ---------------- */

  onOpenQuote(e) {
    const { id, no, quote } = e.currentTarget.dataset
    this.setData({
      quoteVisible: true,
      quoteCustomId: id,
      quoteCustomNo: no,
      quoteYuan: quote && Number(quote) > 0 ? fenToYuan(quote) : ''
    })
  },

  onCloseQuote() {
    this.setData({ quoteVisible: false })
  },

  onQuoteInput(e) {
    this.setData({ quoteYuan: e.detail.value })
  },

  /** 提交报价：服务端按 30% 重算定金 */
  onSubmitQuote() {
    if (this.data.quoting) return

    const yuan = Number(this.data.quoteYuan)
    if (!isFinite(yuan) || yuan <= 0) {
      toast.info('请填写正确的报价金额')
      return
    }

    this.setData({ quoting: true })

    callAdmin(
      'confirmQuote',
      { customId: this.data.quoteCustomId, totalQuote: yuanToFen(yuan) },
      { loading: true, loadingText: '提交中', showError: false }
    ).then((res) => {
      this.setData({ quoting: false })
      if (res.code !== 0) {
        toast.error(res.msg || '报价失败')
        return
      }
      toast.success('报价已确认，等待买家支付定金')
      this.setData({ quoteVisible: false, page: 1 }, () => this.loadList(true))
    })
  },

  /* ---------------- 进度 ---------------- */

  onOpenSchedule(e) {
    const { id, no } = e.currentTarget.dataset
    this.setData({
      scheduleVisible: true,
      scheduleCustomId: id,
      scheduleCustomNo: no,
      scheduleStage: '',
      scheduleDesc: '',
      scheduleImages: []
    })
  },

  onCloseSchedule() {
    this.setData({ scheduleVisible: false })
  },

  onStageInput(e) {
    this.setData({ scheduleStage: e.detail.value })
  },

  onScheduleDescInput(e) {
    this.setData({ scheduleDesc: e.detail.value })
  },

  /** 选择进度图 */
  onChooseScheduleImage() {
    const remain = MAX_SCHEDULE_IMAGES - this.data.scheduleImages.length
    if (remain <= 0) {
      toast.info(`最多上传 ${MAX_SCHEDULE_IMAGES} 张进度图`)
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({
          scheduleImages: this.data.scheduleImages.concat(paths).slice(0, MAX_SCHEDULE_IMAGES)
        })
      }
    })
  },

  onRemoveScheduleImage(e) {
    const index = e.currentTarget.dataset.index
    const scheduleImages = this.data.scheduleImages.slice()
    scheduleImages.splice(index, 1)
    this.setData({ scheduleImages })
  },

  /** 提交进度 */
  onSubmitSchedule() {
    if (this.data.scheduling) return

    const stage = String(this.data.scheduleStage || '').trim()
    if (!stage) {
      toast.info('请填写进度节点名称')
      return
    }

    this.setData({ scheduling: true })
    toast.loading('提交中')

    const uploadTask =
      this.data.scheduleImages.length > 0
        ? uploadBatch(this.data.scheduleImages, 'custom-progress')
        : Promise.resolve([])

    uploadTask
      .then((images) =>
        callAdmin(
          'addSchedule',
          {
            customId: this.data.scheduleCustomId,
            stage,
            desc: this.data.scheduleDesc,
            images
          },
          { showError: false }
        )
      )
      .then((res) => {
        toast.hide()
        this.setData({ scheduling: false })
        if (!res || res.code !== 0) {
          toast.error((res && res.msg) || '提交失败')
          return
        }
        toast.success('进度已更新')
        this.setData({ scheduleVisible: false, page: 1 }, () => this.loadList(true))
      })
      .catch(() => {
        toast.hide()
        this.setData({ scheduling: false })
        toast.error('提交异常，请稍后重试')
      })
  },

  /* ---------------- 完工 ---------------- */

  onFinish(e) {
    const id = e.currentTarget.dataset.id
    toast
      .confirm('确认作品已完工？买家将收到尾款支付入口。', { confirmText: '标记完工' })
      .then((ok) => {
        if (!ok) return
        callAdmin('finishCustom', { customId: id }, { loading: true, loadingText: '处理中' }).then(
          (res) => {
            if (res.code === 0) {
              toast.success('已标记完工')
              this.setData({ page: 1 }, () => this.loadList(true))
            }
          }
        )
      })
  },

  /** 阻止弹层内部点击穿透 */
  noop() {},

  onRetry() {
    this.setData({ page: 1 }, () => this.loadList(true))
  }
})
