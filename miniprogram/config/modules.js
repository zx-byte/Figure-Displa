// config/modules.js
// 模块注册表：把整个小程序划分为「展示」与「付款」两个交付单元。
//
// 这是模块边界的唯一真相源。新增页面/云函数时必须在此登记归属，
// 否则 scripts/check-modules.js 会报「未分类」或「幽灵条目」。
//
// 三层结构：
//   shared  共享层  —— 两边共用的骨架与基础设施，不属于任何付费范围
//   display 展示模块 —— 看作品、品牌、防伪、分享、收藏浏览，无资金流（免费开发）
//   trade   付款模块 —— 购物车、下单、支付、订单、售后、地址、定制交易，涉真实资金流（需要付费）
//
// 为何 detail/user 等页跨两侧仍归入某一模块：
//   模块按「页面承载的主业务」归属，页面内的对侧操作（如 detail 页的购买按钮）
//   统一由 MODULE_SWITCH.trade 控制显隐，trade 关闭即退化为纯展示。

/** 模块键 */
const MODULES = {
  SHARED: 'shared',
  DISPLAY: 'display',
  TRADE: 'trade'
}

/**
 * 模块开关。
 *
 * display 恒为 true（展示是小程序的基础能力，不单独关闭）。
 * trade 为付款模块总开关：
 *   true  —— 完整电商：购物车、下单、支付、订单、售后、定制全开放。
 *   false —— 纯展示小程序：隐藏全部交易入口，detail 页只留「微信咨询」，
 *             tabBar 收为 3 项（首页 / 全部作品 / 我的）。
 *
 * 切换 trade 时需同步调整 miniprogram/app.json 的 tabBar：
 *   true  → 4 项（首页 / 全部作品 / 购物车 / 我的）
 *   false → 3 项（去掉购物车）
 */
const MODULE_SWITCH = {
  display: true,
  trade: false
}

/**
 * 模块清单。
 *
 * pages       买家端页面（小程序注册路径，不含 .js 后缀）
 * adminPages  商家后台页面
 * cloudFunctions 该模块拥有的云函数目录名
 * utils       该模块专属的工具文件（共享工具见 shared.notes）
 */
const MODULE_MANIFEST = {
  shared: {
    key: 'shared',
    label: '共享层',
    tagline: '骨架与基础设施',
    desc: '两边共用的小程序骨架、登录鉴权与后台容器，不属于任何付费范围。',
    pages: ['pages/user/user', 'pages/privacy/privacy'],
    adminPages: ['pages/admin/login/login'],
    cloudFunctions: ['login', 'admin', 'initdb'],
    utils: [],
    notes:
      'app.js / app.json / app.wxss / sitemap.json、components/ 全部组件、' +
      'utils/（cloud / toast / format / share / image / admin）。' +
      'user 页是「我的」页骨架，承载两侧入口，交易入口随开关显隐。',
    deliverable: '随两侧交付，不单独计价'
  },

  display: {
    key: 'display',
    label: '展示模块',
    tagline: '手办展示（免费开发）',
    desc: '看作品、品牌介绍、编号防伪、海报分享、收藏与浏览历史——纯展示无资金流。',
    pages: [
      'pages/index/index', // 首页：轮播 / 限量专区 / 新品
      'pages/category/category', // 全部作品：多维筛选 / 搜索
      'pages/detail/detail', // 作品详情：画廊 / 规格 / 相关推荐
      'pages/panorama/panorama', // 多角度全景
      'pages/poster/poster', // 分享海报（真实小程序码）
      'pages/verify/verify', // 编号查询 / 防伪比对
      'pages/about/about', // 品牌介绍
      'pages/favorite/favorite', // 收藏
      'pages/history/history' // 浏览历史
    ],
    adminPages: [
      'pages/admin/product/product', // 商品管理（含批量上下架/改价）
      'pages/admin/product-edit/product-edit'
    ],
    cloudFunctions: ['product', 'security', 'favorite'],
    utils: [],
    notes:
      'detail 页内的「加入购物车 / 立即购买 / 去定制」按钮属交易动作，' +
      '由 MODULE_SWITCH.trade 控制显隐，页面本身属展示模块。' +
      'product 云函数含 home/list/detail/batch/getWxacode/verifyCode。',
    deliverable: '免费开发'
  },

  trade: {
    key: 'trade',
    label: '付款模块',
    tagline: '付款相关（需要付费）',
    desc:
      '购物车、下单、微信支付、订单、售后退款、收货地址、定制交易——涉及真实资金流与商户号资质。',
    pages: [
      'pages/cart/cart', // 购物车（本地存储，结算时服务端重算校验）
      'pages/order-confirm/order-confirm', // 下单确认：地址 / 运费 / 定金
      'pages/order-list/order-list', // 我的订单
      'pages/order-detail/order-detail', // 订单详情：支付 / 售后 / 物流轨迹
      'pages/address/address', // 收货地址
      'pages/address-edit/address-edit',
      'pages/custom-apply/custom-apply', // 定制申请（定制整体归交易侧）
      'pages/custom-list/custom-list', // 我的定制单
      'pages/custom-detail/custom-detail' // 定制单：报价 / 定金 30% / 尾款
    ],
    adminPages: [
      'pages/admin/order/order', // 订单管理：发货 / 售后裁决 / 退款
      'pages/admin/custom/custom', // 定制管理：报价 / 排期 / 完成
      'pages/admin/dashboard/dashboard' // 数据看板：销量 / 趋势 / 热销
    ],
    cloudFunctions: ['order', 'pay', 'address', 'custom', 'stats'],
    utils: ['miniprogram/utils/subscribe.js'],
    notes:
      '退款在 admin 云函数内执行（cloudPay.refund），因云函数互调不透传 openid。' +
      '支付需商户号 PAY_SUB_MCH_ID、云环境就绪、DEMO_MODE=false。' +
      '定制走「申请 → 报价 → 付定金 30% → 排期 → 付尾款」完整资金链。',
    deliverable: '需要付费'
  }
}

/** 该模块关闭后需一并隐藏的入口所属页面（便于逐项核对，非穷举） */
const TRADE_ENTRY_GATES = [
  { page: 'pages/index/index', entry: '定制入口卡', file: 'miniprogram/pages/index/index.wxml' },
  { page: 'pages/user/user', entry: '订单 / 定制 / 收货地址', file: 'miniprogram/pages/user/user.wxml' },
  {
    page: 'pages/detail/detail',
    entry: '规格数量 / 加入购物车 / 立即购买 / 去定制',
    file: 'miniprogram/pages/detail/detail.wxml'
  }
]

function isTradeEnabled() {
  return MODULE_SWITCH.trade === true
}

function isDisplayEnabled() {
  return MODULE_SWITCH.display !== false
}

/** 返回某模块登记的全部页面路径（pages + adminPages 合并） */
function pagesOf(moduleKey) {
  const m = MODULE_MANIFEST[moduleKey]
  if (!m) return []
  return (m.pages || []).concat(m.adminPages || [])
}

module.exports = {
  MODULES,
  MODULE_SWITCH,
  MODULE_MANIFEST,
  TRADE_ENTRY_GATES,
  isTradeEnabled,
  isDisplayEnabled,
  pagesOf
}
