// cloudfunctions/product/index.js
// 商品查询：首页聚合、列表筛选、详情。
// 只返回上架商品；下架商品对买家不可见。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

const PAGE_SIZE_DEFAULT = 20
const PAGE_SIZE_MAX = 50

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/** 商品列表统一裁剪字段，避免把 detail 等大字段带进列表 */
function slimProduct(item) {
  return {
    _id: item._id,
    name: item.name,
    subtitle: item.subtitle || '',
    price: item.price,
    originPrice: item.originPrice || 0,
    stock: item.stock || 0,
    soldCount: item.soldCount || 0,
    type: item.type,
    category: item.category || {},
    cover: (item.images && item.images[0]) || '',
    limitNum: item.limitNum || 0,
    presaleDate: item.presaleDate || '',
    createTime: item.createTime
  }
}

/**
 * 首页聚合数据
 * 入参：无
 * 返回：{ banners, presale, newArrivals }
 */
async function home() {
  // 运营位优先：独立 banners 集合（后台可配置跳转、排序、上下线）。
  // 集合为空或未配置时，回退到「排序权重最高的三个上架商品」，保证首页始终有 banner。
  let banners = []
  try {
    const bannerRes = await db
      .collection('banners')
      .where({ status: 1 })
      .orderBy('sort', 'desc')
      .orderBy('createTime', 'desc')
      .limit(5)
      .get()
    banners = (bannerRes.data || []).map((b) => ({
      _id: b._id,
      image: b.image || '',
      title: b.title || '',
      subtitle: b.subtitle || '',
      linkType: b.linkType || 'product', // product | url | none
      linkValue: b.linkValue || ''
    }))
  } catch (e) {
    banners = []
  }

  if (banners.length === 0) {
    const fallbackRes = await db
      .collection('products')
      .where({ status: 1 })
      .orderBy('sort', 'desc')
      .orderBy('createTime', 'desc')
      .limit(3)
      .get()
    banners = fallbackRes.data.map((item) => ({
      _id: item._id,
      image: (item.images && item.images[0]) || '',
      title: item.name,
      subtitle: item.subtitle || '',
      linkType: 'product',
      linkValue: item._id
    }))
  }

  // 限量发售专区：限量预售且有库存
  const presaleRes = await db
    .collection('products')
    .where({ status: 1, type: 1, stock: _.gt(0) })
    .orderBy('createTime', 'desc')
    .limit(6)
    .get()

  // 新品推荐
  const newRes = await db
    .collection('products')
    .where({ status: 1 })
    .orderBy('createTime', 'desc')
    .limit(10)
    .get()

  return ok({
    banners,
    presale: presaleRes.data.map(slimProduct),
    newArrivals: newRes.data.map(slimProduct)
  })
}

/** 可等值匹配的三个分类维度，价位单独按价格区间处理 */
const DIMENSION_KEYS = ['series', 'ip', 'scale']

/**
 * 转义正则元字符
 * 用户输入「（」「[」「\」等字符直接拼进正则会导致编译失败、整条查询报错，
 * 这里统一转义后再交给数据库。
 * @param {string} str 原始输入
 * @returns {string}
 */
function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 把单个筛选维度写进查询条件（原地修改 where）
 * @param {object} where 查询条件
 * @param {string} key 维度名
 * @param {string} value 取值，'全部' 或空串表示不限
 */
function applyDimension(where, key, value) {
  if (!key || !value || value === '全部') return

  if (key === 'priceRange') {
    const text = String(value)
    if (text === '1000以上') {
      where.price = _.gte(100000)
      return
    }
    const range = text.split('-')
    const min = Number(range[0])
    const max = Number(range[1])
    if (isFinite(min) && isFinite(max)) {
      // 金额以「分」存储，区间值以「元」传入
      where.price = _.and(_.gte(min * 100), _.lte(max * 100))
    }
    return
  }

  if (DIMENSION_KEYS.indexOf(key) > -1) {
    where[`category.${key}`] = value
  }
}

/**
 * 商品列表
 * 入参：{
 *   type?, filters?, categoryKey?, categoryValue?,
 *   keyword?, page?, pageSize?, sort?
 * }
 *   filters 为 { series?, ip?, scale?, priceRange? }，多个维度同时生效；
 *   categoryKey/categoryValue 为旧版单维入参，保留兼容
 *   sort: 'new'（默认，按创建时间倒序）| 'priceAsc' | 'priceDesc' | 'hot'
 * 返回：{ list, total, hasMore }
 */
async function list(event) {
  const page = Math.max(1, Number(event.page) || 1)
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Number(event.pageSize) || PAGE_SIZE_DEFAULT))

  const where = { status: 1 }

  if (event.type !== undefined && event.type !== null && event.type !== '') {
    where.type = Number(event.type)
  }

  // 四维筛选：filters 支持多维叠加，未传时回退到旧的单维入参
  if (event.filters && typeof event.filters === 'object') {
    Object.keys(event.filters).forEach((key) => {
      applyDimension(where, key, event.filters[key])
    })
  } else {
    applyDimension(where, event.categoryKey, event.categoryValue)
  }

  // 关键词覆盖名称、副标题与分类维度（含题材下的具体选题），
  // 与首页「搜索作品名称、题材或系列」的提示保持同一口径
  let condition = where
  const keyword = String(event.keyword || '').trim()
  if (keyword) {
    const reg = db.RegExp({ regexp: escapeRegExp(keyword), options: 'i' })
    condition = _.and([
      where,
      _.or([
        { name: reg },
        { subtitle: reg },
        { 'category.series': reg },
        { 'category.ip': reg },
        { 'category.ipDetail': reg },
        { 'category.scale': reg }
      ])
    ])
  }

  let query = db.collection('products').where(condition)
  switch (event.sort) {
    case 'priceAsc':
      query = query.orderBy('price', 'asc')
      break
    case 'priceDesc':
      query = query.orderBy('price', 'desc')
      break
    case 'hot':
      query = query.orderBy('soldCount', 'desc')
      break
    default:
      query = query.orderBy('createTime', 'desc')
  }

  const [listRes, countRes] = await Promise.all([
    query.skip((page - 1) * pageSize).limit(pageSize).get(),
    db.collection('products').where(condition).count()
  ])

  const list = listRes.data.map(slimProduct)
  const total = countRes.total

  return ok({
    list,
    total,
    page,
    hasMore: page * pageSize < total
  })
}

/**
 * 商品详情
 * 入参：{ productId }
 * 返回：完整商品对象，含 detail 与规格
 */
async function detail(event) {
  const { productId } = event
  if (!productId) return fail(400, '缺少商品 ID')

  let res
  try {
    res = await db.collection('products').doc(productId).get()
  } catch (err) {
    return fail(404, '商品不存在或已下架')
  }

  const item = res.data
  if (!item || item.status !== 1) return fail(404, '商品不存在或已下架')

  return ok({
    _id: item._id,
    name: item.name,
    subtitle: item.subtitle || '',
    price: item.price,
    originPrice: item.originPrice || 0,
    stock: item.stock || 0,
    soldCount: item.soldCount || 0,
    type: item.type,
    category: item.category || {},
    images: item.images || [],
    detail: item.detail || [],
    specs: item.specs || [],
    limitNum: item.limitNum || 0,
    presaleDate: item.presaleDate || '',
    createTime: item.createTime
  })
}

/**
 * 批量取商品摘要，用于购物车、收藏夹等场景
 * 入参：{ ids: string[] }
 * 返回：{ list }（仅含仍在架的商品）
 */
async function batch(event) {
  const ids = Array.isArray(event.ids) ? event.ids.filter(Boolean).slice(0, 50) : []
  if (ids.length === 0) return ok({ list: [] })

  const res = await db
    .collection('products')
    .where({ _id: _.in(ids), status: 1 })
    .get()

  return ok({ list: res.data.map(slimProduct) })
}

/**
 * 生成小程序码（分享海报用）。
 *
 * 用 wxacode.getUnlimited 生成带 scene 的小程序码，scene 携带商品 ID。
 * 未发布的小程序无法生成真实码，此时返回 code:0 但 qr 为空，前端自动退回占位图案。
 * 生成后上传云存储返回 fileID，避免每次绘海报都重复调用。
 *
 * 入参：{ productId }
 * 返回：{ qr } 二维码图片 fileID，未就绪时为空字符串
 */
async function getWxacode(event) {
  const productId = String(event.productId || '')
  if (!productId) return fail(400, '缺少商品 ID')

  try {
    const wxacodeRes = await cloud.openapi.wxacode.getUnlimited({
      scene: `id=${productId}`,
      page: 'pages/detail/detail',
      width: 280,
      checkPath: false,
      envVersion: 'release'
    })

    // 返回的是图片 buffer，上传到云存储换取可访问 fileID
    const uploadRes = await cloud.uploadFile({
      cloudPath: `qrcode/${productId}-${Date.now()}.png`,
      fileContent: wxacodeRes.buffer
    })
    return ok({ qr: uploadRes.fileID })
  } catch (err) {
    // 未发布 / 无权限 / 超限都属「码生成不可用」，不阻塞海报绘制，前端退回占位图
    console.warn('[product] 小程序码生成不可用', err && err.errCode, err && err.errMsg)
    return ok({ qr: '' })
  }
}

/**
 * 作品编号库内比对。
 *
 * 编号规则 SG-年份-四位序号，但仅格式合法不等于真品——本动作到 verifyCodes
 * 登记集合里查这条编号是否真实登记过，返回登记信息，实现「可追溯」而非仅「格式对」。
 *
 * 入参：{ code } 归一化后的编号，如 'SG-2026-0128'
 * 返回：{ matched, code, info? }
 *  - matched:true 且 info 为登记详情（作品名、出品时间、持有人脱敏信息）
 *  - matched:false 表示库里无此编号（可能是伪造或未登记）
 */
async function verifyCode(event) {
  const code = String(event.code || '').trim().toUpperCase()
  if (!code) return fail(400, '缺少编号')
  if (!/^SG\d{8}$/.test(code)) return fail(400, '编号格式不正确')

  const res = await db
    .collection('verifyCodes')
    .where({ code })
    .limit(1)
    .get()
    .catch(() => ({ data: [] }))

  const hit = res.data && res.data[0]
  if (!hit) return ok({ matched: false, code, info: null })

  // 持有人信息脱敏后返回，不泄露完整手机号
  const phone = String(hit.ownerPhone || '')
  return ok({
    matched: true,
    code,
    info: {
      name: hit.name || '',
      year: hit.year || 0,
      seq: hit.seq || 0,
      madeTime: hit.madeTime || '',
      ownerMasked: phone ? phone.slice(0, 3) + '****' + phone.slice(-4) : '',
      note: hit.note || ''
    }
  })
}

exports.main = async (event) => {
  const action = event.action || 'home'
  try {
    switch (action) {
      case 'home':
        return await home()
      case 'list':
        return await list(event)
      case 'detail':
        return await detail(event)
      case 'batch':
        return await batch(event)
      case 'getWxacode':
        return await getWxacode(event)
      case 'verifyCode':
        return await verifyCode(event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[product] 执行异常', action, err)
    return fail(500, '商品服务异常，请稍后重试')
  }
}
