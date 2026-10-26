// components/empty-state/empty-state.js
// 空状态占位。用于列表无数据、搜索无结果、加载失败等场景。
Component({
  properties: {
    /** 主文案 */
    text: {
      type: String,
      value: '这里还什么都没有'
    },
    /** 辅助说明 */
    subText: {
      type: String,
      value: ''
    },
    /** 图标形态：box（空列表）| search（无结果）| error（加载失败） */
    icon: {
      type: String,
      value: 'box'
    },
    /** 操作按钮文案，留空则不显示按钮 */
    actionText: {
      type: String,
      value: ''
    }
  },

  methods: {
    /** 点击操作按钮，由父页面处理 */
    onAction() {
      this.triggerEvent('action')
    }
  }
})
