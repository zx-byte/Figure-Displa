// utils/validate.js
// 前端输入校验。前端校验只用于提升交互体验，真正的合法性判定在云函数内完成。

/** 中国大陆手机号 */
function isPhone(value) {
  return /^1[3-9]\d{9}$/.test(String(value || '').trim())
}

/** 非空字符串 */
function isNotEmpty(value) {
  return String(value === undefined || value === null ? '' : value).trim().length > 0
}

/** 长度区间校验 */
function isLengthBetween(value, min, max) {
  const len = String(value || '').trim().length
  return len >= min && len <= max
}

/** 金额合法性：最多两位小数，大于 0 */
function isPrice(value) {
  const text = String(value || '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return false
  return Number(text) > 0
}

/** 正整数 */
function isPositiveInt(value) {
  return /^[1-9]\d*$/.test(String(value || '').trim())
}

/** 非负整数，允许 0 */
function isNonNegativeInt(value) {
  return /^\d+$/.test(String(value || '').trim())
}

/**
 * 收货地址校验
 * @param {object} addr { name, phone, region, detail }
 * @returns {{ok:boolean, msg:string}}
 */
function checkAddress(addr) {
  if (!addr) return { ok: false, msg: '请填写收货地址' }
  if (!isNotEmpty(addr.name)) return { ok: false, msg: '请填写收货人姓名' }
  if (!isLengthBetween(addr.name, 1, 20)) return { ok: false, msg: '收货人姓名不超过 20 个字' }
  if (!isPhone(addr.phone)) return { ok: false, msg: '请填写正确的手机号' }
  if (!Array.isArray(addr.region) || addr.region.length < 2) {
    return { ok: false, msg: '请选择所在地区' }
  }
  if (!isNotEmpty(addr.detail)) return { ok: false, msg: '请填写详细地址' }
  if (!isLengthBetween(addr.detail, 4, 100)) return { ok: false, msg: '详细地址请填写 4 至 100 个字' }
  return { ok: true, msg: '' }
}

/**
 * 定制需求校验
 * @param {object} form { character, scale, style, extra, contact }
 * @returns {{ok:boolean, msg:string}}
 */
function checkCustomForm(form) {
  if (!form) return { ok: false, msg: '请填写定制需求' }
  if (!isNotEmpty(form.character)) return { ok: false, msg: '请填写想要的角色或题材' }
  if (!isLengthBetween(form.character, 1, 50)) return { ok: false, msg: '角色描述不超过 50 个字' }
  if (!isNotEmpty(form.scale)) return { ok: false, msg: '请选择比例' }
  if (!isNotEmpty(form.style)) return { ok: false, msg: '请选择风格' }
  if (form.extra && !isLengthBetween(form.extra, 0, 500)) {
    return { ok: false, msg: '特殊要求不超过 500 个字' }
  }
  if (!isPhone(form.contact)) return { ok: false, msg: '请填写正确的联系电话' }
  return { ok: true, msg: '' }
}

/**
 * 商品表单校验（商家端）
 * @param {object} form
 * @returns {{ok:boolean, msg:string}}
 */
function checkProductForm(form) {
  if (!form) return { ok: false, msg: '商品信息为空' }
  if (!isLengthBetween(form.name, 2, 40)) return { ok: false, msg: '商品名称请填写 2 至 40 个字' }
  if (!isPrice(form.priceYuan)) return { ok: false, msg: '请填写正确的售价' }
  if (!isNonNegativeInt(form.stock)) return { ok: false, msg: '库存需为非负整数' }
  if (!Array.isArray(form.images) || form.images.length === 0) {
    return { ok: false, msg: '请至少上传一张商品主图' }
  }
  if (Number(form.type) === 1 && !isPositiveInt(form.limitNum)) {
    return { ok: false, msg: '限量预售商品需填写限量数量' }
  }
  return { ok: true, msg: '' }
}

/** 备注长度限制校验 */
function checkRemark(remark) {
  if (!remark) return { ok: true, msg: '' }
  if (!isLengthBetween(remark, 0, 100)) return { ok: false, msg: '备注不超过 100 个字' }
  return { ok: true, msg: '' }
}

module.exports = {
  isPhone,
  isNotEmpty,
  isLengthBetween,
  isPrice,
  isPositiveInt,
  isNonNegativeInt,
  checkAddress,
  checkCustomForm,
  checkProductForm,
  checkRemark
}
