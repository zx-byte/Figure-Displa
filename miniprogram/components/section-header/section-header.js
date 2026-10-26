// components/section-header/section-header.js
// 板块标题。控制首页各专区的视觉层级，右侧可挂「查看全部」。
Component({
  properties: {
    title: {
      type: String,
      value: ''
    },
    subtitle: {
      type: String,
      value: ''
    },
    /** 右侧操作文案，为空则不显示 */
    moreText: {
      type: String,
      value: ''
    }
  },

  methods: {
    onMore() {
      this.triggerEvent('more')
    }
  }
})
