// components/empty-state/empty-state.js
// 空状态占位。用于列表无数据、搜索无结果、加载失败等场景。

const track = require('../../utils/track')

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
    },
    /** 客服按钮文案，留空则不显示。用于「没有我要的」这类出口 */
    contactText: {
      type: String,
      value: ''
    },
    /**
     * 客服会话来源标记。
     * 会显示在商家的客服工具里，用来判断这条咨询从哪个页面发起，
     * 不传的话商家只能看到一条没有任何上下文的消息。
     */
    contactFrom: {
      type: String,
      value: ''
    }
  },

  methods: {
    /** 点击操作按钮，由父页面处理 */
    onAction() {
      this.triggerEvent('action')
    },

    /** 点击客服（open-type="contact" 触发），按来源标记区分是哪个页面的空状态 */
    onContactTap() {
      track.trackConsult('', this.data.contactFrom || 'empty-state')
    }
  }
})
