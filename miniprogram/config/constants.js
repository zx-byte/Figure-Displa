// config/constants.js
// 全局常量：环境、存储键、业务状态映射、筛选维度选项

const { MODULE_SWITCH, MODULE_MANIFEST, MODULES, isTradeEnabled } = require('./modules')

/** 云开发环境 ID。留空则使用开发者工具当前选中的默认环境 */
const CLOUD_ENV = ''

/**
 * 演示模式开关。
 *
 * true  —— 所有数据请求直接使用 config/mock.js 的本地演示数据，不发起任何云调用。
 *          用于云开发环境尚未开通时预览完整界面。
 * false —— 正常走云函数。
 *
 * 上线前必须改为 false，否则用户看到的永远是假数据。
 * 改回 false 后无需其他改动，云环境连通即恢复真实数据。
 */
const DEMO_MODE = true

/**
 * 交易模式开关。
 *
 * 付款模块总开关的对外别名，真实值由 config/modules.js 的 MODULE_SWITCH.trade 决定
 * （模块注册表是边界与开关的唯一真相源，此处只做派生，勿直接改布尔）。
 *
 * false —— 纯展示模式：隐藏购物车、下单、支付等交易入口，详情页只保留「微信咨询」。
 *          适合未办营业执照、未开通微信支付的阶段，可直接上线。
 * true  —— 完整电商模式：购物车、下单、支付全部开放，需要云开发 + 商户号就绪。
 *
 * 切换时需要同步调整 app.json 的 tabBar：
 *   false 时 tabBar 为 3 项（首页 / 全部作品 / 我的）
 *   true  时加回购物车，恢复 4 项
 */
const SHOW_TRADE = isTradeEnabled()

/** 本地缓存键名，统一收口避免散落在页面中 */
const STORAGE_KEYS = {
  USER: 'fd_user',
  CART: 'fd_cart',
  ADMIN_TOKEN: 'fd_admin_token',
  SEARCH_HISTORY: 'fd_search_history',
  /** 用户是否已阅读并同意《用户协议》《隐私政策》，存版本号，条款大改时递增可强制重看 */
  PRIVACY_AGREED: 'fd_privacy_agreed'
}

/**
 * 协议版本号。
 * 条款发生实质性变更（新增收集字段、改变用途等）时递增，
 * 用户本地存的旧版本号与之不一致会重新弹出确认。
 */
const PRIVACY_VERSION = 1

/** 商品类型 */
const PRODUCT_TYPE = {
  STOCK: 0, // 现货
  PRESALE: 1, // 限量预售
  CUSTOM: 2 // 定制
}

const PRODUCT_TYPE_TEXT = {
  0: '现货',
  1: '限量预售',
  2: '定制预约'
}

/** 订单状态码，与 orders.status 一一对应 */
const ORDER_STATUS = {
  CANCELED: -1,
  UNPAID: 0,
  UNDELIVERED: 1,
  UNRECEIVED: 2,
  FINISHED: 3,
  AFTERSALE: 4
}

/**
 * 订单状态展示配置
 * tabs 用于订单列表顶部筛选，status 为 null 表示全部
 */
const ORDER_STATUS_MAP = {
  '-1': { text: '已取消', desc: '订单已关闭' },
  0: { text: '待付款', desc: '请在 15 分钟内完成支付' },
  1: { text: '待发货', desc: '商家正在备货' },
  2: { text: '待收货', desc: '商品已发出' },
  3: { text: '已完成', desc: '交易完成' },
  4: { text: '售后中', desc: '商家正在处理售后' }
}

const ORDER_TABS = [
  { label: '全部', status: null },
  { label: '待付款', status: 0 },
  { label: '待发货', status: 1 },
  { label: '待收货', status: 2 },
  { label: '已完成', status: 3 }
]

/**
 * 售后子状态，与 orders.afterSale.status 一一对应。
 * 订单主状态 status=4（售后中）表达「进入售后流程」，售后推进到哪一步由本字段刻画。
 */
const AFTER_SALE_STATUS = {
  PENDING: 0, // 待商家处理
  REFUNDING: 1, // 商家已同意，退款处理中
  REFUNDED: 2, // 退款成功（终态）
  REJECTED: 3, // 商家已拒绝（终态）
  CLOSED: 4 // 用户撤销申请（终态）
}

const AFTER_SALE_STATUS_MAP = {
  0: { text: '待商家处理', desc: '商家将在 24 小时内响应' },
  1: { text: '退款处理中', desc: '退款已发起，到账以微信支付为准' },
  2: { text: '退款成功', desc: '退款已原路返回' },
  3: { text: '售后被拒', desc: '商家未通过本次售后申请' },
  4: { text: '已撤销', desc: '你主动撤销了售后申请' }
}

/** 售后诉求类型 */
const AFTER_SALE_TYPES = {
  refund: { text: '仅退款', desc: '未收到货或无需退货，直接退款' },
  returnRefund: { text: '退货退款', desc: '退回作品后全额退款' },
  exchange: { text: '换货补发', desc: '寄回问题作品，补发或换货' }
}

/** 售后原因分类 */
const AFTER_SALE_REASONS = {
  quality: '质量问题（开裂、缺件、涂装脱落等）',
  damaged: '运输损坏',
  wrong: '发错货 / 少发货',
  notAsDescribed: '与描述不符',
  other: '其他原因'
}

/** 定制单状态码，与 customOrders.status 一一对应 */
const CUSTOM_STATUS = {
  CANCELED: -1,
  PENDING: 0, // 待商家确认
  UNPAID: 1, // 待付定金
  MAKING: 2, // 制作中
  UNPAID_REST: 3, // 待付尾款
  FINISHED: 4 // 已完成
}

const CUSTOM_STATUS_MAP = {
  '-1': { text: '已取消', desc: '定制单已关闭' },
  0: { text: '待确认', desc: '商家将在 24 小时内联系你' },
  1: { text: '待付定金', desc: '支付定金后进入排期' },
  2: { text: '制作中', desc: '制作进度可随时查看' },
  3: { text: '待付尾款', desc: '作品已完工，请支付尾款' },
  4: { text: '已完成', desc: '感谢你的信任' }
}

/** 定金比例：需求文档固定为 30% */
const DEPOSIT_RATE = 0.3

/** 分类筛选维度。value 为提交给云函数的筛选值 */
const FILTER_DIMENSIONS = [
  {
    key: 'series',
    label: '系列',
    options: ['全部', '原创系列', '联名系列', '限定复刻']
  },
  {
    key: 'ip',
    label: '题材',
    options: ['全部', '原创角色', '机械机甲', '幻想生物', '和风物语', '都市怪谈']
  },
  {
    key: 'scale',
    label: '比例',
    options: ['全部', '1/4', '1/6', '1/7', '1/8', '1/12', 'Q版']
  },
  {
    key: 'priceRange',
    label: '价位',
    options: ['全部', '0-199', '200-499', '500-999', '1000以上']
  }
]

/** 定制可选比例，与商品比例保持同一套口径 */
const CUSTOM_SCALES = ['1/4', '1/6', '1/7', '1/8', '1/12', 'Q版']

/** 定制可选风格 */
const CUSTOM_STYLES = ['写实', '二次元', 'Q版萌系', '暗黑系', '国风', '赛博朋克']

/**
 * 订阅消息模板配置。
 *
 * 订阅消息是「一次性订阅」：用户在前端弹窗点允许后，服务端才能就「一次」事件下发一条。
 * 模板 ID 需在微信公众平台（mp.weixin.qq.com）→ 功能 → 订阅消息 里申请，属账号级配置。
 *
 * 下发口径（与云函数发送点一一对应）：
 *   ORDER_PAID     —— 支付成功通知        → pay 云函数支付回调后
 *   SHIPPED        —— 发货通知            → admin 发货后
 *   AFTERSALE_DONE —— 售后/退款结果通知    → admin 售后处理后
 *
 * 留空 '' 表示尚未申请模板：前端跳过订阅弹窗、服务端跳过下发，不报错不阻塞业务。
 * 申请到模板后把对应 templateId 填入即可自动生效，无需改其它代码。
 */
const SUBSCRIBE_TEMPLATES = {
  ORDER_PAID: '',
  SHIPPED: '',
  AFTERSALE_DONE: ''
}

/** 支付前希望一次性征订的模板键（发货 + 售后结果），用户点「允许」后服务端才可下发 */
const SUBSCRIBE_KEYS_ON_PAY = ['SHIPPED', 'AFTERSALE_DONE']

/** 分页每页条数 */
const PAGE_SIZE = 20

/**
 * 运费规则，需与 cloudfunctions/order/index.js 中的常量保持一致。
 * 前端仅用于展示预估，实际金额以服务端重算结果为准。
 */
const FREIGHT_FEE = 1200
const FREE_FREIGHT_THRESHOLD = 29900

/**
 * 待付款订单有效分钟数，需与 cloudfunctions/order/index.js 的 PAY_EXPIRE_MINUTES 一致。
 * 前端据此判断是否还要显示倒计时。
 */
const PAY_EXPIRE_MINUTES = 15

module.exports = {
  CLOUD_ENV,
  DEMO_MODE,
  SHOW_TRADE,
  MODULES,
  MODULE_SWITCH,
  MODULE_MANIFEST,
  isTradeEnabled,
  STORAGE_KEYS,
  PRIVACY_VERSION,
  PRODUCT_TYPE,
  PRODUCT_TYPE_TEXT,
  ORDER_STATUS,
  ORDER_STATUS_MAP,
  ORDER_TABS,
  AFTER_SALE_STATUS,
  AFTER_SALE_STATUS_MAP,
  AFTER_SALE_TYPES,
  AFTER_SALE_REASONS,
  CUSTOM_STATUS,
  CUSTOM_STATUS_MAP,
  DEPOSIT_RATE,
  FILTER_DIMENSIONS,
  CUSTOM_SCALES,
  CUSTOM_STYLES,
  PAGE_SIZE,
  FREIGHT_FEE,
  FREE_FREIGHT_THRESHOLD,
  PAY_EXPIRE_MINUTES,
  SUBSCRIBE_TEMPLATES,
  SUBSCRIBE_KEYS_ON_PAY
}
