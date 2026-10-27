// pages/verify/verify.js
const share = require('../../utils/share')
const { query } = require('../../utils/cloud')
const track = require('../../utils/track')
// 作品编号查询。
//
// 编号规则：SG-年份-四位序号，最后一位是校验位。
// 校验位 = (年份后两位 + 序号前三位) % 10
// 例如 SG-2026-0128：年份后两位 26，序号前三位 012，(26 + 12) % 10 = 8，末位正好是 8。
//
// 验证分两级：
// 1. 格式校验（本地）——校验位 + 年份范围，挡住随手编的编号，秒回；
// 2. 库内比对（云端 verifyCode）——到 verifyCodes 登记集合核对是否真实登记，
//    命中则返回作品登记信息。格式对但库里无，会明确提示「未登记」。
// 两级结合才是「可追溯」，而非仅「格式对」。

const PATTERN = /^SG(\d{4})(\d{4})$/

/**
 * 本地格式校验
 * @param {string} raw 去掉分隔符并转大写后的编号
 * @returns {object} { ok, msg, year, seq, normalized }
 */
function verifyFormat(raw) {
  const m = PATTERN.exec(raw)

  if (!m) {
    return { ok: false, msg: '编号格式不正确，应为 SG-年份-四位序号' }
  }

  const year = Number(m[1])
  const seqStr = m[2]
  const head = seqStr.slice(0, 3)
  const checkDigit = Number(seqStr.slice(3))

  if (year < 2024 || year > 2035) {
    return { ok: false, msg: '编号中的年份不在有效范围内' }
  }

  if (Number(head) < 1) {
    return { ok: false, msg: '序号不能为 000' }
  }

  const expect = ((year % 100) + Number(head)) % 10
  if (checkDigit !== expect) {
    return { ok: false, msg: '该编号不存在，请核对底座上的数字' }
  }

  return {
    ok: true,
    year,
    seq: Number(head),
    normalized: `SG-${year}-${seqStr}`,
    msg: `这是 ${year} 年出品的第 ${Number(head)} 件作品`
  }
}

Page({
  data: {
    code: '',
    checked: false,
    result: null,
    /** 是否正在库内比对 */
    verifying: false
  },

  onLoad() {
    wx.setNavigationBarTitle({ title: '编号查询' })
  },

  onInput(e) {
    this.setData({ code: e.detail.value, checked: false })
  },

  /** 执行查询：先本地格式校验，再云端库内比对 */
  onQuery() {
    if (this.data.verifying) return

    // 去掉空格和横线，兼容用户输入习惯
    const raw = String(this.data.code || '')
      .trim()
      .toUpperCase()
      .replace(/[\s\-_]/g, '')

    if (!raw) {
      wx.showToast({ title: '请输入编号', icon: 'none' })
      return
    }

    const formatRes = verifyFormat(raw)
    if (!formatRes.ok) {
      // 格式就不对，直接给结论，不必请求云端
      this.setData({ checked: true, result: formatRes })
      return
    }

    // 格式通过，进库内比对拿登记信息
    this.setData({ checked: true, verifying: true, result: formatRes })

    query('product', 'verifyCode', { code: raw }, { showError: false })
      .then((res) => {
        const data = (res && res.data) || {}
        if (data.matched && data.info) {
          this.setData({
            verifying: false,
            result: Object.assign({}, formatRes, {
              matched: true,
              info: data.info,
              msg: formatRes.msg + '，已登记在册'
            })
          })
        } else {
          this.setData({
            verifying: false,
            result: Object.assign({}, formatRes, {
              matched: false,
              info: null,
              // 格式对但库里无：明确区分「未登记」，不冒充真品
              msg: '编号格式正确，但未在登记库中查到，可能未登记或编号有误'
            })
          })
        }
      })
      .catch(() => {
        // 云端比对失败时不谎称已登记，只给格式结论
        this.setData({
          verifying: false,
          result: Object.assign({}, formatRes, {
            matched: null,
            info: null,
            msg: formatRes.msg + '（登记信息暂不可用，请稍后再试）'
          })
        })
      })
  },

  /** 清空重输 */
  onReset() {
    this.setData({ code: '', checked: false, result: null, verifying: false })
  },

  /** 点击客服（open-type="contact" 触发），用于统计「编号有疑问」的咨询量 */
  onContactTap() {
    track.trackConsult('', 'verify')
  },

  /** 转发给朋友 */
  onShareAppMessage() {
    return share.defaultShare()
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return share.timelineShare()
  }
})
