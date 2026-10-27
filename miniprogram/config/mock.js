// config/mock.js
// 演示数据。仅在云开发环境未就绪时被调用，用于在开发者工具里预览完整 UI。
//
// 触发条件见 utils/cloud.js：真实的云函数调用返回「环境不存在 / 函数未部署」类错误时，
// 自动降级到这里，并在控制台与界面首次降级时给出提示。
// 云环境连通后本文件不会被任何代码路径触达，无需删除。

const DEMO_IMG = '/images/demo/demo-'

// 真实作品数据。由 scripts/import-works.js 根据压缩后的作品图生成，
// 排在最前面，优先于下方的演示商品展示。
const { WORKS } = require('./works')

/** 360° 环视帧序列，24 帧一圈 */
const PANO_FRAMES = Array.from(
  { length: 24 },
  (_, i) => '/images/panorama/p-' + String(i).padStart(2, '0') + '.jpg'
)

/** 上色前后对比图（演示素材，真实使用时换成同角度拍摄的素体与完成品） */
const COMPARE = {
  before: '/images/compare/before.jpg',
  after: '/images/compare/after.jpg'
}

/**
 * 工序时间轴示例数据。
 * 真实使用时换成自己的制作记录，images/craft/ 下的图换成实拍过程照即可。
 */
function craftProcessOf(startDate) {
  const base = new Date(startDate).getTime()
  const day = 24 * 3600 * 1000
  return [
    { stage: '三维建模', desc: '确定比例与姿态，输出可打印网格', meta: '面数 12.8 万',
      image: '/images/craft/craft-1.jpg', date: new Date(base).toISOString().slice(0, 10) },
    { stage: '翻模注型', desc: '硅胶模具分片，树脂真空灌注去除气泡', meta: '共 4 片模具',
      image: '/images/craft/craft-2.jpg', date: new Date(base + 6 * day).toISOString().slice(0, 10) },
    { stage: '手工打磨', desc: '逐级砂纸去除合模线，处理表面瑕疵', meta: '240 至 2000 目',
      image: '/images/craft/craft-3.jpg', date: new Date(base + 12 * day).toISOString().slice(0, 10) },
    { stage: '逐层上色', desc: '底漆、面色、阴影、渍洗，逐层喷涂与手涂', meta: '共 7 层',
      image: '/images/craft/craft-4.jpg', date: new Date(base + 20 * day).toISOString().slice(0, 10) },
    { stage: '组装质检', desc: '装配底座与配件，逐项检查后编号封盒', meta: '检查 18 项',
      image: '/images/craft/craft-5.jpg', date: new Date(base + 26 * day).toISOString().slice(0, 10) }
  ]
}

/** 生成相对当前时间的时间戳 */
function ago(hours) {
  return new Date(Date.now() - hours * 3600 * 1000)
}

/* ---------------- 商品 ---------------- */

/**
 * 演示商品。只在没有任何真实作品时用来撑页面结构。
 * 一旦 import-works.js 生成了作品数据，就不再混入——虚构条目会和真实作品抢注意力。
 */
const DEMO_PRODUCTS = [
  {
    _id: 'p1',
    name: '原创 · 雾都游侠 1/7 手办',
    subtitle: '原创角色系列，树脂手工涂装',
    price: 26800,
    originPrice: 32800,
    stock: 12,
    soldCount: 36,
    type: 0,
    category: { series: '原创系列', ip: '原创角色', scale: '1/7', priceRange: '' },
    cover: DEMO_IMG + '1.jpg',
    images: [DEMO_IMG + '1.jpg', DEMO_IMG + '6.jpg', DEMO_IMG + '4.jpg'],
    detail: [
      { type: 'text', value: '原创角色「雾都游侠」，1/7 比例，高约 24cm，树脂材质手工涂装。' },
      { type: 'text', value: '附赠主题地台与亚克力展示牌，随作品附带编号卡。' }
    ],
    specs: [{ name: '配色', options: ['原色', '异色'] }],
    limitNum: 0,
    presaleDate: '',
    panorama: { count: 24, frames: PANO_FRAMES },
    compare: COMPARE,
    dimension: { height: 24, width: 12, depth: 10, weight: 0.8, material: '树脂' },
    craftProcess: craftProcessOf('2026-09-12'),
    sort: 100,
    createTime: ago(240)
  },
  {
    _id: 'p2',
    name: '机械螳螂 1/6 收藏级',
    subtitle: '全球限量 30 体，售罄即止',
    price: 59800,
    originPrice: 72800,
    stock: 28,
    soldCount: 2,
    type: 1,
    category: { series: '限定复刻', ip: '机械机甲', scale: '1/6', priceRange: '' },
    cover: DEMO_IMG + '2.jpg',
    images: [DEMO_IMG + '2.jpg', DEMO_IMG + '6.jpg'],
    detail: [
      { type: 'text', value: '机械螳螂 1/6 比例，多层装甲结构，关节可动，附带专用支架。' },
      { type: 'text', value: '全球限量 30 体，编号唯一，按下单顺序分配。' }
    ],
    specs: [],
    limitNum: 30,
    presaleDate: '2026-12-20',
    panorama: { count: 24, frames: PANO_FRAMES },
    compare: COMPARE,
    dimension: { height: 28, width: 15, depth: 12, weight: 1.2, material: '树脂 + 金属骨架' },
    craftProcess: craftProcessOf('2026-09-02'),
    sort: 90,
    createTime: ago(120)
  },
  {
    _id: 'p3',
    name: '深海档案馆 1/8',
    subtitle: '幻想生物系列，附水纹地台',
    price: 36800,
    originPrice: 0,
    stock: 6,
    soldCount: 18,
    type: 0,
    category: { series: '原创系列', ip: '幻想生物', scale: '1/8', priceRange: '' },
    cover: DEMO_IMG + '3.jpg',
    images: [DEMO_IMG + '3.jpg', DEMO_IMG + '4.jpg'],
    detail: [{ type: 'text', value: '深海档案馆系列第一弹，1/8 比例，高约 20cm。' }],
    specs: [],
    limitNum: 0,
    presaleDate: '',
    sort: 80,
    createTime: ago(72)
  },
  {
    _id: 'p4',
    name: '和风 · 樱守 1/7',
    subtitle: '联名系列，手工上色附赠地台',
    price: 39800,
    originPrice: 45800,
    stock: 9,
    soldCount: 24,
    type: 0,
    category: { series: '联名系列', ip: '和风物语', scale: '1/7', priceRange: '' },
    cover: DEMO_IMG + '4.jpg',
    images: [DEMO_IMG + '4.jpg', DEMO_IMG + '5.jpg'],
    detail: [{ type: 'text', value: '和风系列「樱守」，1/7 比例，和服褶皱与樱瓣为手工雕刻。' }],
    specs: [{ name: '底座', options: ['常规', '加高'] }],
    limitNum: 0,
    presaleDate: '',
    sort: 70,
    createTime: ago(48)
  },
  {
    _id: 'p5',
    name: '星海观测者 1/7',
    subtitle: '限量 20 体，星空渐变涂装',
    price: 42800,
    originPrice: 0,
    stock: 20,
    soldCount: 0,
    type: 1,
    category: { series: '联名系列', ip: '幻想生物', scale: '1/7', priceRange: '' },
    cover: DEMO_IMG + '5.jpg',
    images: [DEMO_IMG + '5.jpg', DEMO_IMG + '2.jpg'],
    detail: [{ type: 'text', value: '星海观测者，限量 20 体，星空渐变涂装，随作品附带编号卡。' }],
    specs: [],
    limitNum: 20,
    presaleDate: '2026-12-05',
    sort: 60,
    createTime: ago(24)
  },
  {
    _id: 'p6',
    name: '定制 · 专属角色手办',
    subtitle: '按需求单独制作，30% 定金锁定排期',
    price: 88000,
    originPrice: 0,
    stock: 999,
    soldCount: 7,
    type: 2,
    category: { series: '原创系列', ip: '原创角色', scale: '1/6', priceRange: '' },
    cover: DEMO_IMG + '6.jpg',
    images: [DEMO_IMG + '6.jpg'],
    detail: [
      { type: 'text', value: '按你的设定单独制作，可选比例、风格与配色。' },
      { type: 'text', value: '提交需求时填写预期预算，定金为预算的 30%，制作启动后不予退还。' }
    ],
    specs: [],
    limitNum: 0,
    presaleDate: '',
    sort: 50,
    createTime: ago(12)
  }
]

const PRODUCTS = WORKS.length ? WORKS : DEMO_PRODUCTS

/* ---------------- 地址 ---------------- */

const ADDRESS = {
  id: 'addr_demo_1',
  name: '李青',
  phone: '13800138000',
  region: ['安徽省', '合肥市', '蜀山区'],
  regionText: '安徽省 合肥市 蜀山区',
  detail: '长江西路 669 号 3 栋 1201',
  isDefault: true
}

/* ---------------- 订单 ---------------- */

const ORDERS = [
  {
    _id: 'o1',
    orderNo: 'D2026102609410001',
    userId: 'demo-openid',
    status: 0,
    goodsList: [
      {
        productId: 'p1',
        name: '原创 · 雾都游侠 1/7 手办',
        image: DEMO_IMG + '1.jpg',
        price: 26800,
        count: 1,
        spec: '原色',
        type: 0,
        limitNo: 0
      }
    ],
    totalPrice: 26800,
    freight: 0,
    payAmount: 26800,
    address: ADDRESS,
    remark: '麻烦包装结实一点',
    payTime: null,
    deliverTime: null,
    receiveTime: null,
    expressCompany: '',
    expressNo: '',
    // 5 分钟前下单，倒计时还剩约 10 分钟，避免一进详情页就显示 00:00
    createTime: ago(0.08)
  },
  {
    _id: 'o2',
    orderNo: 'D2026102409300002',
    userId: 'demo-openid',
    status: 2,
    goodsList: [
      {
        productId: 'p2',
        name: '机械螳螂 1/6 收藏级',
        image: DEMO_IMG + '2.jpg',
        price: 59800,
        count: 1,
        spec: '',
        type: 1,
        limitNo: 7
      }
    ],
    totalPrice: 59800,
    freight: 0,
    payAmount: 59800,
    address: ADDRESS,
    remark: '',
    payTime: ago(48),
    deliverTime: ago(24),
    receiveTime: null,
    expressCompany: '顺丰速运',
    expressNo: 'SF1234567890123',
    createTime: ago(50)
  },
  {
    _id: 'o3',
    orderNo: 'D2026102009150003',
    userId: 'demo-openid',
    status: 3,
    goodsList: [
      {
        productId: 'p4',
        name: '和风 · 樱守 1/7',
        image: DEMO_IMG + '4.jpg',
        price: 39800,
        count: 1,
        spec: '常规',
        type: 0,
        limitNo: 0
      }
    ],
    totalPrice: 39800,
    freight: 0,
    payAmount: 39800,
    address: ADDRESS,
    remark: '',
    payTime: ago(150),
    deliverTime: ago(140),
    receiveTime: ago(120),
    expressCompany: '中通快递',
    expressNo: 'ZT9876543210000',
    createTime: ago(152)
  }
]

/* ---------------- 定制单 ---------------- */

const CUSTOM_ORDERS = [
  {
    _id: 'c1',
    orderNo: 'C2026102509200001',
    userId: 'demo-openid',
    status: 2,
    requirement: {
      character: '原创机甲少女「零式」',
      scale: '1/6',
      style: '二次元',
      extra: '希望有可拆卸的肩甲，配色偏冷银与冰蓝，底座做成六边形。',
      contact: '13800138000',
      budget: 180000
    },
    refImages: [DEMO_IMG + '2.jpg', DEMO_IMG + '6.jpg'],
    deposit: 54000,
    totalQuote: 180000,
    schedule: [
      {
        stage: '需求已提交',
        desc: '商家将在 24 小时内确认需求与排期',
        images: [],
        time: ago(28)
      },
      {
        stage: '报价已确认',
        desc: '最终报价 1800.00 元，定金 540.00 元',
        images: [],
        time: ago(26)
      },
      {
        stage: '定金已支付',
        desc: '订单已进入排期，制作开始后将同步进度',
        images: [],
        time: ago(25)
      },
      {
        stage: '素体成型',
        desc: '主体素体已完成，正在进行表面打磨。肩甲按需求改为可拆卸结构。',
        images: [DEMO_IMG + '6.jpg'],
        time: ago(6)
      }
    ],
    payTime: ago(25),
    createTime: ago(28)
  },
  {
    _id: 'c2',
    orderNo: 'C2026102609400002',
    userId: 'demo-openid',
    status: 1,
    requirement: {
      character: '幻想系龙骑士',
      scale: '1/8',
      style: '写实',
      extra: '',
      contact: '13800138000',
      budget: 120000
    },
    refImages: [],
    deposit: 36000,
    totalQuote: 120000,
    schedule: [
      {
        stage: '需求已提交',
        desc: '商家将在 24 小时内确认需求与排期',
        images: [],
        time: ago(2)
      }
    ],
    payTime: null,
    createTime: ago(2)
  }
]

/* ---------------- 处理函数 ---------------- */

const ok = (data) => ({ code: 0, msg: 'ok（演示数据）', data })
const fail = (code, msg) => ({ code, msg, data: null })

/** 商品摘要裁剪，与 product 云函数的 slimProduct 保持一致 */
function slim(p) {
  return {
    _id: p._id,
    name: p.name,
    subtitle: p.subtitle,
    price: p.price,
    originPrice: p.originPrice,
    stock: p.stock,
    soldCount: p.soldCount,
    type: p.type,
    category: p.category,
    cover: p.cover,
    limitNum: p.limitNum,
    presaleDate: p.presaleDate,
    createTime: p.createTime
  }
}

/** 筛选商品，规则与 product.list 保持一致 */
function filterProducts(event) {
  let list = PRODUCTS.slice()

  if (event.type !== undefined && event.type !== null && event.type !== '') {
    list = list.filter((p) => p.type === Number(event.type))
  }

  // 单个维度筛选，'全部' 或空值表示不限
  const applyDimension = (key, value) => {
    if (!key || !value || value === '全部') return

    if (key === 'priceRange') {
      if (value === '1000以上') {
        list = list.filter((p) => p.price >= 100000)
        return
      }
      const [min, max] = String(value).split('-').map(Number)
      if (isFinite(min) && isFinite(max)) {
        list = list.filter((p) => p.price >= min * 100 && p.price <= max * 100)
      }
      return
    }

    if (key === 'series' || key === 'ip' || key === 'scale') {
      list = list.filter((p) => (p.category || {})[key] === value)
    }
  }

  // 与云函数一致：优先读 filters 多维对象，未传时兼容旧的单维入参
  if (event.filters && typeof event.filters === 'object') {
    Object.keys(event.filters).forEach((key) => applyDimension(key, event.filters[key]))
  } else {
    applyDimension(event.categoryKey, event.categoryValue)
  }

  // 关键词覆盖名称、副标题与三个分类维度，与云函数的匹配范围一致
  const kw = String(event.keyword || '').trim()
  if (kw) {
    list = list.filter((p) => {
      const category = p.category || {}
      return (
        (p.name || '').indexOf(kw) > -1 ||
        (p.subtitle || '').indexOf(kw) > -1 ||
        (category.series || '').indexOf(kw) > -1 ||
        (category.ip || '').indexOf(kw) > -1 ||
        (category.scale || '').indexOf(kw) > -1
      )
    })
  }

  switch (event.sort) {
    case 'priceAsc':
      list.sort((a, b) => a.price - b.price)
      break
    case 'priceDesc':
      list.sort((a, b) => b.price - a.price)
      break
    case 'hot':
      list.sort((a, b) => b.soldCount - a.soldCount)
      break
    default:
      list.sort((a, b) => new Date(b.createTime) - new Date(a.createTime))
  }

  return list
}

/**
 * 分发演示数据
 * @param {string} name 云函数名
 * @param {string} action 动作
 * @param {object} event 参数
 * @returns {{code:number,msg:string,data:any}}
 */
function handle(name, action, event = {}) {
  // ---- login ----
  if (name === 'login') {
    if (action === 'updateProfile') {
      return ok({ userInfo: { nickname: event.nickname || '演示用户', avatar: '', phone: '' } })
    }
    return ok({
      openid: 'demo-openid',
      isAdmin: true,
      userInfo: { nickname: '演示用户', avatar: '', phone: '13800138000' }
    })
  }

  // ---- product ----
  if (name === 'product') {
    if (action === 'home') {
      return ok({
        banners: PRODUCTS.slice(0, 3).map((p) => ({
          _id: p._id,
          image: p.cover,
          title: p.name,
          subtitle: p.subtitle
        })),
        presale: PRODUCTS.filter((p) => p.type === 1).map(slim),
        newArrivals: PRODUCTS.slice(0, 6).map(slim)
      })
    }
    if (action === 'list') {
      const filtered = filterProducts(event)
      const page = Math.max(1, Number(event.page) || 1)
      const size = Number(event.pageSize) || 20
      const start = (page - 1) * size
      return ok({
        list: filtered.slice(start, start + size).map(slim),
        total: filtered.length,
        page,
        hasMore: start + size < filtered.length
      })
    }
    if (action === 'detail') {
      const p = PRODUCTS.find((x) => x._id === event.productId)
      return p ? ok(p) : fail(404, '商品不存在或已下架')
    }
    if (action === 'batch') {
      const ids = Array.isArray(event.ids) ? event.ids : []
      return ok({ list: PRODUCTS.filter((p) => ids.indexOf(p._id) > -1).map(slim) })
    }
    if (action === 'getWxacode') {
      // 演示模式无法生成真实小程序码，返回空串让海报退回占位图案
      return ok({ qr: '' })
    }
    if (action === 'verifyCode') {
      // 演示数据：SG-2026-0128 视为已登记，其余格式合法的一律「未登记」
      const code = String(event.code || '').toUpperCase()
      if (code === 'SG20260128') {
        return ok({
          matched: true,
          code,
          info: {
            name: '苍焰机甲·原型',
            year: 2026,
            seq: 128,
            madeTime: '2026-08-12',
            ownerMasked: '138****6721',
            note: '作品底座刻有同号钢印'
          }
        })
      }
      return ok({ matched: false, code, info: null })
    }
    return fail(400, '演示模式未实现该动作')
  }

  // ---- order ----
  if (name === 'order') {
    if (action === 'list') {
      let list = ORDERS.slice()
      if (event.status !== undefined && event.status !== null && event.status !== '') {
        list = list.filter((o) => o.status === Number(event.status))
      }
      return ok({ list, total: list.length, hasMore: false })
    }
    if (action === 'detail') {
      const o = ORDERS.find((x) => x._id === event.orderId || x.orderNo === event.orderNo)
      return o ? ok(o) : fail(404, '订单不存在')
    }
    if (action === 'create') {
      return ok({
        orderNo: 'D' + Date.now(),
        orderId: 'o_new_demo',
        totalPrice: 26800,
        freight: 0,
        payAmount: 26800,
        demo: true
      })
    }
    if (action === 'cancel') return ok({ orderId: event.orderId, status: -1 })
    if (action === 'confirm') return ok({ orderId: event.orderId, status: 3 })
    if (action === 'applyAfterSale') {
      return ok({ orderId: event.orderId, status: 4, afterSaleStatus: 0, demo: true })
    }
    if (action === 'cancelAfterSale') {
      return ok({ orderId: event.orderId, status: 3, afterSaleStatus: 4, demo: true })
    }
    if (action === 'traceExpress') {
      // 演示模式下模拟一份轨迹（可走通 UI），但 available:false 亦会触发降级展示
      return ok({
        available: true,
        company: '顺丰速运',
        no: 'SF1234567890',
        traces: [
          { time: '2026-10-26 18:20', desc: '快件已签收，感谢使用顺丰' },
          { time: '2026-10-26 09:05', desc: '【合肥市】快件已到达 合肥蜀山集散点' },
          { time: '2026-10-25 22:40', desc: '快件已发出，下一站 合肥蜀山集散点' },
          { time: '2026-10-25 20:10', desc: '顺丰速运已收取快件' }
        ],
        demo: true
      })
    }
    return fail(400, '演示模式未实现该动作')
  }

  // ---- pay ----
  if (name === 'pay') {
    if (action === 'unifiedOrder') {
      // 演示模式无法真实调起支付，返回明确错误让页面向用户说明
      return fail(500, '演示模式不支持支付，请先部署云函数并配置商户号')
    }
    if (action === 'queryOrder') return ok({ paid: false, status: 0 })
    return fail(400, '演示模式未实现该动作')
  }

  // ---- security ----
  // 演示模式不调微信内容安全接口，默认放行。
  // 但保留一个可触发的拦截词：文本里出现「演示违规」时返回不通过，
  // 便于在本地验证「被拦截后提示什么、表单是否回退」这条链路，而不必真的写违规内容。
  if (name === 'security') {
    if (action === 'text') {
      const list = Array.isArray(event.contents) ? event.contents : [event.content]
      const blockedIndex = list.findIndex((t) => String(t || '').indexOf('演示违规') >= 0)
      if (blockedIndex >= 0) {
        return ok({ pass: false, blockedIndex, detail: [{ pass: false, reason: 'risky' }] })
      }
      return ok({ pass: true, detail: [] })
    }
    if (action === 'image') return ok({ pass: true, detail: [] })
    return fail(400, '演示模式未实现该动作')
  }

  // ---- custom ----
  if (name === 'custom') {
    if (action === 'list') {
      let list = CUSTOM_ORDERS.slice()
      if (event.status !== undefined && event.status !== null && event.status !== '') {
        list = list.filter((c) => c.status === Number(event.status))
      }
      return ok({ list, total: list.length, hasMore: false })
    }
    if (action === 'detail') {
      const c = CUSTOM_ORDERS.find((x) => x._id === event.customId || x.orderNo === event.orderNo)
      return c ? ok(c) : fail(404, '定制单不存在')
    }
    if (action === 'submit') {
      const budget = Number((event.requirement || {}).budget) || 0
      return ok({
        customId: 'c_new_demo',
        orderNo: 'C' + Date.now(),
        deposit: Math.round(budget * 100 * 0.3),
        totalQuote: Math.round(budget * 100),
        status: 1
      })
    }
    if (action === 'cancel') return ok({ customId: event.customId, status: -1 })
    return fail(400, '演示模式未实现该动作')
  }

  // ---- address ----
  if (name === 'address') {
    if (action === 'list') return ok({ list: [ADDRESS] })
    if (action === 'add') return ok({ id: 'addr_demo_new', list: [ADDRESS] })
    if (action === 'update') return ok({ list: [ADDRESS] })
    if (action === 'remove') return ok({ list: [] })
    if (action === 'setDefault') return ok({ list: [ADDRESS] })
    return fail(400, '演示模式未实现该动作')
  }

  // ---- favorite ----
  if (name === 'favorite') {
    if (action === 'list') {
      return ok({ list: PRODUCTS.slice(0, 2).map(slim) })
    }
    if (action === 'check') return ok({ favorited: false })
    if (action === 'toggle') return ok({ favorited: true, count: 3 })
    return fail(400, '演示模式未实现该动作')
  }

  // ---- admin ----
  if (name === 'admin') {
    if (action === 'checkAuth') {
      return ok({ token: 'demo-token', expireAt: Date.now() + 2 * 3600 * 1000 })
    }
    if (action === 'productList') {
      return ok({
        list: PRODUCTS.map((p) => ({
          _id: p._id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          soldCount: p.soldCount,
          type: p.type,
          status: 1,
          cover: p.cover,
          limitNum: p.limitNum,
          createTime: p.createTime
        })),
        total: PRODUCTS.length,
        hasMore: false
      })
    }
    if (action === 'productDetail') {
      const p = PRODUCTS.find((x) => x._id === event.productId) || PRODUCTS[0]
      return ok(p)
    }
    if (action === 'orderList') {
      let list = ORDERS.slice()
      if (event.status !== undefined && event.status !== null && event.status !== '') {
        list = list.filter((o) => o.status === Number(event.status))
      }
      return ok({ list, total: list.length, hasMore: false })
    }
    if (action === 'customList') {
      return ok({ list: CUSTOM_ORDERS, total: CUSTOM_ORDERS.length, hasMore: false })
    }
    if (action === 'orderDetail') {
      const o = ORDERS.find((x) => x._id === event.orderId)
      return o ? ok(o) : fail(404, '订单不存在')
    }
    if (action === 'customDetail') {
      const c = CUSTOM_ORDERS.find((x) => x._id === event.customId)
      return c ? ok(c) : fail(404, '定制单不存在')
    }
    // 写操作在演示模式下直接返回成功，便于走通交互流程
    if (['saveProduct', 'toggleProduct', 'updateStock', 'deliver', 'updateOrderStatus',
         'confirmQuote', 'addSchedule', 'finishCustom'].indexOf(action) > -1) {
      return ok({ demo: true })
    }
    // 批量操作：演示模式返回全部成功
    if (action === 'batchToggleProduct') {
      const ids = Array.isArray(event.productIds) ? event.productIds : []
      return ok({ okCount: ids.length, failed: [], status: Number(event.status) === 1 ? 1 : 0, demo: true })
    }
    if (action === 'batchUpdatePrice') {
      const ids = Array.isArray(event.productIds) ? event.productIds : []
      return ok({ okCount: ids.length, failed: [], mode: event.mode || 'set', value: event.value, demo: true })
    }
    // 售后裁决：演示模式直接返回成功，覆盖同意退款/拒绝两条路径
    if (action === 'handleAfterSale') {
      const agree = event.action === 'agreeRefund'
      return ok({
        orderId: event.orderId,
        status: 3,
        afterSaleStatus: agree ? 2 : 3,
        refundNo: agree ? 'R' + Date.now() : '',
        refundAmount: agree ? 26800 : 0,
        demo: true
      })
    }
    return fail(400, '演示模式未实现该动作')
  }

  // ---- stats ----
  if (name === 'stats') {
    if (action === 'overview') {
      return ok({
        todayOrderCount: 8,
        todaySales: 248600,
        userCount: 142,
        productCount: PRODUCTS.filter((p) => p.type !== 2).length,
        pendingDeliver: 3,
        pendingCustom: 2,
        unpaidCount: 1,
        updatedAt: Date.now()
      })
    }
    if (action === 'salesTrend') {
      // 演示：近 7 日趋势 + 热销榜，走通 dashboard 图表
      const day = (n) => {
        const d = new Date()
        d.setDate(d.getDate() - n)
        const p = (x) => (x < 10 ? `0${x}` : String(x))
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
      }
      return ok({
        trend: [
          { date: day(6), sales: 128000, count: 3 },
          { date: day(5), sales: 215000, count: 5 },
          { date: day(4), sales: 98000, count: 2 },
          { date: day(3), sales: 302000, count: 7 },
          { date: day(2), sales: 176000, count: 4 },
          { date: day(1), sales: 268000, count: 6 },
          { date: day(0), sales: 248600, count: 8 }
        ],
        hotList: PRODUCTS.slice(0, 5).map((p, i) => ({
          productId: p._id,
          name: p.name,
          image: p.cover,
          count: 12 - i * 2,
          sales: (12 - i * 2) * p.price
        })),
        updatedAt: Date.now()
      })
    }
  }

  return fail(404, `演示模式未覆盖接口：${name}.${action}`)
}

module.exports = { handle }
