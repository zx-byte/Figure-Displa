// components/goods-card/goods-card.js
// 商品卡片。内部自带跳转，页面无需再绑定点击事件。

const image = require('../../utils/image')

Component({
  properties: {
    /** 商品对象，字段与 product 云函数返回一致 */
    item: {
      type: Object,
      value: {}
    },
    /** 展示形态：grid（两列瀑布流，默认） | list（横向单列） */
    layout: {
      type: String,
      value: 'grid'
    },
    /** 是否显示已售数量 */
    showSold: {
      type: Boolean,
      value: false
    }
  },

  data: {
    priceText: '0.00',
    /** 无标价作品显示「询价」，避免出现 ¥0.00 */
    inquire: false,
    originText: '',
    typeText: '',
    isPresale: false,
    soldOut: false,
    /** 实际渲染的封面地址（可能带缩略图参数） */
    coverSrc: '',
    /** 封面加载失败，改为占位块 */
    coverBroken: false
  },

  observers: {
    item(val) {
      if (!val || !val._id) return
      const price = Number(val.price) || 0
      const origin = Number(val.originPrice) || 0
      const type = Number(val.type)

      this.setData({
        priceText: price > 0 ? (price / 100).toFixed(2) : '',
        inquire: price <= 0,
        originText: origin > price ? (origin / 100).toFixed(2) : '',
        typeText: type === 1 ? '限量' : type === 2 ? '可定制' : '',
        isPresale: type === 1,
        soldOut: Number(val.stock) <= 0,
        coverSrc: image.thumb(val.cover, 600),
        coverBroken: false
      })
    }
  },

  methods: {
    /** 封面加载失败：降级为占位块，不留白块 */
    onCoverError() {
      this.setData({ coverBroken: true })
    },

    /**
     * 跳转商品详情
     * 售罄商品仍可进入详情查看，仅在下单时拦截
     */
    goDetail() {
      const id = this.data.item && this.data.item._id
      if (!id) return
      wx.navigateTo({
        url: `/subpackages/works/pages/detail/detail?id=${id}`
      })
    }
  }
})
