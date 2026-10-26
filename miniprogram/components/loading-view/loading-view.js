// components/loading-view/loading-view.js
// 骨架屏。首次加载时占位，避免白屏与布局跳动。
Component({
  properties: {
    /** 骨架形态：home（首页）| list（列表卡片）| grid（两列网格）| detail（详情页） */
    type: {
      type: String,
      value: 'list'
    },
    /** 骨架条目数量 */
    count: {
      type: Number,
      value: 3
    }
  },

  data: {
    items: [],
    /** 首页快捷入口固定四个，用常量避免在模板里写数组字面量 */
    entryItems: [0, 1, 2, 3]
  },

  lifetimes: {
    attached() {
      this.buildItems()
    }
  },

  observers: {
    count() {
      this.buildItems()
    }
  },

  methods: {
    buildItems() {
      const n = Math.max(1, Math.min(10, Number(this.data.count) || 3))
      this.setData({ items: Array.from({ length: n }, (_, i) => i) })
    }
  }
})
