// utils/track.js
// 浏览行为上报，对接微信官方「We分析 / 自定义分析」。
//
// 为什么需要它：微信官方统计只按「页面路径」聚合，而所有商品详情页的路径都是
// pages/detail/detail，官方后台只能看到「有多少人看了详情页」，看不到「看的是哪件」。
// 要区分具体商品，必须手动上报商品 ID。
//
// 使用前提（缺一不可）：
//   1. 小程序已在微信公众平台发布（开发版、体验版的数据不计入正式统计）
//   2. 在「We分析」或「数据分析 → 自定义分析」里创建了同名事件并定义了字段
//   3. 上报的事件名、字段名与后台配置完全一致（区分大小写）
//
// 上报失败不影响业务：所有异常都在内部吞掉，页面不会因埋点问题报错。

/** 是否输出调试日志（开发阶段打开便于确认埋点是否触发） */
const DEBUG = true

/**
 * 上报自定义事件
 * @param {string} eventName 事件名，需与后台配置一致，建议「模块_动作」格式
 * @param {object} params 事件字段，键名需与后台配置的字段名一致
 */
function track(eventName, params = {}) {
  if (DEBUG) {
    console.info('[track]', eventName, params)
  }

  try {
    if (typeof wx.reportAnalytics !== 'function') return
    // 字段值统一转成字符串，微信自定义分析的字段类型以字符串为主
    const data = {}
    Object.keys(params).forEach((key) => {
      const value = params[key]
      data[key] = value === null || value === undefined ? '' : String(value)
    })
    wx.reportAnalytics(eventName, data)
  } catch (err) {
    // 未在后台配置事件、或处于开发环境时会上报失败，属正常情况，不打扰用户
    if (DEBUG) console.warn('[track] 上报失败（通常是后台未配置该事件）', err)
  }
}

/**
 * 商品详情浏览
 * @param {object} product 商品对象
 */
function trackViewProduct(product) {
  if (!product || !product._id) return
  const category = product.category || {}
  track('view_product', {
    product_id: product._id,
    product_name: product.name,
    category: category.series || '',
    price: product.price
  })
}

/**
 * 点击咨询 / 定制入口
 * @param {string} productId 商品 ID
 * @param {string} from 来源页面
 */
function trackConsult(productId, from = '') {
  track('click_consult', {
    product_id: productId || '',
    from_page: from
  })
}

/**
 * 提交定制需求
 * @param {object} requirement 需求对象
 */
function trackCustomSubmit(requirement = {}) {
  track('submit_custom', {
    scale: requirement.scale || '',
    style: requirement.style || '',
    budget: requirement.budget || ''
  })
}

module.exports = {
  track,
  trackViewProduct,
  trackConsult,
  trackCustomSubmit
}
