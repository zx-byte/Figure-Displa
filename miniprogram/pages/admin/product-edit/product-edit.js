// pages/admin/product-edit/product-edit.js
// 商品新增与编辑。价格以元输入，提交前统一转成分；分类维度用完整清单，
// 不跟随买家端的模式裁剪——纯展示形态下后台仍要能录入比例、价位。

const { callAdmin } = require('../../../utils/admin')
const { uploadBatch } = require('../../../utils/cloud')
const { CATEGORY_DIMENSIONS, PRODUCT_TYPE } = require('../../../config/constants')
const toast = require('../../../utils/toast')
const { fenToYuan, yuanToFen } = require('../../../utils/format')

/** 主图上限 */
const MAX_IMAGES = 9
/** 详情图上限 */
const MAX_DETAIL_IMAGES = 15

/** 从分类维度生成商品选项，首位为「未分类」 */
function buildCategoryOptions() {
  const result = {}
  CATEGORY_DIMENSIONS.forEach((dim) => {
    if (dim.key === 'priceRange') return
    const options = dim.options.filter((o) => o !== '全部')
    result[dim.key] = ['未分类'].concat(options)
  })
  return result
}

Page({
  data: {
    /** 商品 ID，空串表示新增 */
    id: '',
    isEdit: false,
    loading: false,
    saving: false,

    name: '',
    subtitle: '',
    priceYuan: '',
    originPriceYuan: '',
    type: 0,
    stock: '',
    limitNum: '',
    presaleDate: '',
    sort: '',

    categoryOptions: buildCategoryOptions(),
    categoryIndex: { series: 0, ip: 0, scale: 0 },
    categoryLabel: { series: '未分类', ip: '未分类', scale: '未分类' },

    images: [],
    maxImages: MAX_IMAGES,

    detailImages: [],
    maxDetailImages: MAX_DETAIL_IMAGES,
    detailText: '',

    /** 规格：最多两组，名称 + 逗号分隔的选项 */
    specName1: '',
    specOptions1: '',
    specName2: '',
    specOptions2: '',

    typeOptions: [
      { value: 0, label: '现货' },
      { value: 1, label: '限量预售' },
      { value: 2, label: '定制' }
    ],

    /** 是否为限量预售，控制限量字段显隐 */
    showLimit: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id, isEdit: true, loading: true })
      this.loadDetail(options.id)
    }
  },

  /**
   * 编辑模式：拉取商品详情并回填表单
   * @param {string} id 商品 ID
   */
  loadDetail(id) {
    callAdmin('productDetail', { productId: id }, { showError: false }).then((res) => {
      if (res.code !== 0 || !res.data) {
        this.setData({ loading: false })
        toast.error('商品不存在')
        setTimeout(() => wx.navigateBack(), 800)
        return
      }

      const p = res.data
      const cat = p.category || {}
      const options = this.data.categoryOptions

      // 回填分类索引：找不到对应项时回落到「未分类」
      const indexOf = (key, value) => {
        const list = options[key] || []
        const idx = list.indexOf(value)
        return idx < 0 ? 0 : idx
      }

      // 规格回填：把 specs 数组拆成两组的名称与选项
      const specs = p.specs || []
      const spec1 = specs[0] || {}
      const spec2 = specs[1] || {}

      // 详情回填：文本块与图片块分开
      const blocks = p.detail || []
      const detailText = blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => b.value)
        .join('\n')
      const detailImages = blocks
        .filter((b) => b && b.type === 'image')
        .map((b) => b.value)

      this.setData({
        loading: false,
        name: p.name || '',
        subtitle: p.subtitle || '',
        priceYuan: fenToYuan(p.price),
        originPriceYuan: p.originPrice ? fenToYuan(p.originPrice) : '',
        type: Number(p.type) || 0,
        stock: String(p.stock === undefined ? 0 : p.stock),
        limitNum: p.limitNum ? String(p.limitNum) : '',
        presaleDate: p.presaleDate || '',
        sort: p.sort ? String(p.sort) : '',
        categoryIndex: {
          series: indexOf('series', cat.series),
          ip: indexOf('ip', cat.ip),
          scale: indexOf('scale', cat.scale)
        },
        categoryLabel: {
          series: cat.series || '未分类',
          ip: cat.ip || '未分类',
          scale: cat.scale || '未分类'
        },
        images: p.images || [],
        detailImages,
        detailText,
        specName1: spec1.name || '',
        specOptions1: (spec1.options || []).join(','),
        specName2: spec2.name || '',
        specOptions2: (spec2.options || []).join(','),
        showLimit: Number(p.type) === PRODUCT_TYPE.PRESALE
      })
    })
  },

  /* ---------------- 表单输入 ---------------- */

  onNameInput(e) {
    this.setData({ name: e.detail.value })
  },

  onSubtitleInput(e) {
    this.setData({ subtitle: e.detail.value })
  },

  onPriceInput(e) {
    this.setData({ priceYuan: e.detail.value })
  },

  onOriginPriceInput(e) {
    this.setData({ originPriceYuan: e.detail.value })
  },

  onStockInput(e) {
    this.setData({ stock: e.detail.value })
  },

  onLimitNumInput(e) {
    this.setData({ limitNum: e.detail.value })
  },

  onSortInput(e) {
    this.setData({ sort: e.detail.value })
  },

  onPresaleDateChange(e) {
    this.setData({ presaleDate: e.detail.value })
  },

  onDetailTextInput(e) {
    this.setData({ detailText: e.detail.value })
  },

  onSpecName1Input(e) {
    this.setData({ specName1: e.detail.value })
  },

  onSpecOptions1Input(e) {
    this.setData({ specOptions1: e.detail.value })
  },

  onSpecName2Input(e) {
    this.setData({ specName2: e.detail.value })
  },

  onSpecOptions2Input(e) {
    this.setData({ specOptions2: e.detail.value })
  },

  /** 切换商品类型 */
  onTypeChange(e) {
    const type = Number(e.currentTarget.dataset.value)
    this.setData({ type, showLimit: type === PRODUCT_TYPE.PRESALE })
  },

  /** 分类选择 */
  onCategoryChange(e) {
    const key = e.currentTarget.dataset.key
    const index = Number(e.detail.value)
    const options = this.data.categoryOptions[key] || []
    const value = options[index] || ''

    const categoryIndex = Object.assign({}, this.data.categoryIndex, { [key]: index })
    const categoryLabel = Object.assign({}, this.data.categoryLabel, {
      [key]: value || '未分类'
    })

    this.setData({ categoryIndex, categoryLabel })
  },

  /* ---------------- 图片 ---------------- */

  /** 选择主图 */
  onChooseImage() {
    const remain = MAX_IMAGES - this.data.images.length
    if (remain <= 0) {
      toast.info(`最多上传 ${MAX_IMAGES} 张主图`)
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({ images: this.data.images.concat(paths).slice(0, MAX_IMAGES) })
      }
    })
  },

  /** 选择详情图 */
  onChooseDetailImage() {
    const remain = MAX_DETAIL_IMAGES - this.data.detailImages.length
    if (remain <= 0) {
      toast.info(`最多上传 ${MAX_DETAIL_IMAGES} 张详情图`)
      return
    }
    wx.chooseMedia({
      count: remain,
      mediaType: ['image'],
      sizeType: ['compressed'],
      success: (res) => {
        const paths = res.tempFiles.map((f) => f.tempFilePath)
        this.setData({
          detailImages: this.data.detailImages.concat(paths).slice(0, MAX_DETAIL_IMAGES)
        })
      }
    })
  },

  onPreviewImage(e) {
    const { src, list } = e.currentTarget.dataset
    wx.previewImage({ current: src, urls: list && list.length ? list : [src] })
  },

  onRemoveImage(e) {
    const index = e.currentTarget.dataset.index
    const images = this.data.images.slice()
    images.splice(index, 1)
    this.setData({ images })
  },

  onRemoveDetailImage(e) {
    const index = e.currentTarget.dataset.index
    const detailImages = this.data.detailImages.slice()
    detailImages.splice(index, 1)
    this.setData({ detailImages })
  },

  /* ---------------- 保存 ---------------- */

  /**
   * 上传本地新图，返回 fileID 数组
   * 已在云端的图片（cloud:// 开头）直接沿用
   * @param {string[]} list 本地与云端混合的图片路径
   * @param {string} dir 云存储目录
   */
  resolveImages(list, dir) {
    const cloudIds = list.filter((p) => /^cloud:\/\//.test(p))
    const localPaths = list.filter((p) => !/^cloud:\/\//.test(p))

    if (localPaths.length === 0) return Promise.resolve(cloudIds)
    return uploadBatch(localPaths, dir).then((uploaded) => cloudIds.concat(uploaded))
  },

  /** 保存商品 */
  onSave() {
    if (this.data.saving) return

    const name = String(this.data.name || '').trim()
    if (name.length < 2) {
      toast.info('商品名称至少 2 个字')
      return
    }

    const price = yuanToFen(this.data.priceYuan)
    if (price <= 0) {
      toast.info('请填写正确的售价')
      return
    }

    const stockText = String(this.data.stock || '').trim()
    if (!/^\d+$/.test(stockText)) {
      toast.info('库存需为非负整数')
      return
    }

    if (this.data.images.length === 0) {
      toast.info('请至少上传一张主图')
      return
    }

    if (this.data.type === PRODUCT_TYPE.PRESALE) {
      const limit = String(this.data.limitNum || '').trim()
      if (!/^[1-9]\d*$/.test(limit)) {
        toast.info('限量预售需填写限量数量')
        return
      }
    }

    this.setData({ saving: true })
    toast.loading('保存中')

    // 先上传所有本地图片，再提交表单
    Promise.all([
      this.resolveImages(this.data.images, 'product'),
      this.resolveImages(this.data.detailImages, 'product-detail')
    ])
      .then(([images, detailImages]) => {
        // 组装详情块：文本在前，图片在后
        const detail = []
        if (String(this.data.detailText || '').trim()) {
          detail.push({ type: 'text', value: String(this.data.detailText).trim() })
        }
        detailImages.forEach((fileID) => detail.push({ type: 'image', value: fileID }))

        // 组装规格
        const specs = []
        const s1Name = String(this.data.specName1 || '').trim()
        const s1Options = String(this.data.specOptions1 || '')
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (s1Name && s1Options.length > 0) specs.push({ name: s1Name, options: s1Options })

        const s2Name = String(this.data.specName2 || '').trim()
        const s2Options = String(this.data.specOptions2 || '')
          .split(/[,，]/)
          .map((s) => s.trim())
          .filter(Boolean)
        if (s2Name && s2Options.length > 0) specs.push({ name: s2Name, options: s2Options })

        const payload = {
          name,
          subtitle: this.data.subtitle,
          price,
          originPrice: yuanToFen(this.data.originPriceYuan),
          stock: Number(stockText),
          type: this.data.type,
          category: {
            series: this.data.categoryLabel.series === '未分类' ? '' : this.data.categoryLabel.series,
            ip: this.data.categoryLabel.ip === '未分类' ? '' : this.data.categoryLabel.ip,
            scale: this.data.categoryLabel.scale === '未分类' ? '' : this.data.categoryLabel.scale,
            priceRange: ''
          },
          images,
          detail,
          specs,
          limitNum: this.data.type === PRODUCT_TYPE.PRESALE ? Number(this.data.limitNum) : 0,
          presaleDate: this.data.presaleDate || '',
          sort: Number(this.data.sort) || 0,
          status: 1
        }

        const request = this.data.isEdit
          ? callAdmin(
              'saveProduct',
              { productId: this.data.id, data: payload },
              { showError: false }
            )
          : callAdmin('saveProduct', { data: payload }, { showError: false })

        return request
      })
      .then((res) => {
        toast.hide()
        this.setData({ saving: false })
        if (!res || res.code !== 0) {
          toast.error((res && res.msg) || '保存失败')
          return
        }
        toast.success(this.data.isEdit ? '已保存' : '已创建')
        setTimeout(() => wx.navigateBack(), 700)
      })
      .catch(() => {
        toast.hide()
        this.setData({ saving: false })
        toast.error('保存异常，请稍后重试')
      })
  }
})
