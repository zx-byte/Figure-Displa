// cloudfunctions/initdb/index.js
// 数据库初始化工具：创建四个集合、建立索引提示、写入示例商品。
//
// 使用方式：部署后在小程序内以管理员身份调用，或在云开发控制台「云函数 - 测试」中
// 传入 { "action": "init", "initToken": "<环境变量 INIT_TOKEN 的值>" }。
// 初始化完成后建议删除本云函数，避免长期暴露。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 集合清单 */
const COLLECTIONS = ['users', 'products', 'orders', 'customOrders']

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/** 示例商品，便于首次打开即有内容可看 */
function buildSeedProducts() {
  const now = new Date()
  return [
    {
      name: '原创 · 雾都游侠 1/7 手办',
      subtitle: '原创角色系列，树脂涂装',
      price: 26800,
      originPrice: 32800,
      stock: 12,
      soldCount: 0,
      type: 0,
      category: { series: '粘土手办', ip: '原创', scale: '1/7', priceRange: '' },
      images: [],
      detail: [
        { type: 'text', value: '原创角色「雾都游侠」，1/7 比例，高约 24cm，树脂材质手工涂装。' },
        { type: 'text', value: '附赠主题地台与亚克力展示牌，随作品附带编号卡。' }
      ],
      specs: [{ name: '配色', options: ['原色', '异色'] }],
      limitNum: 0,
      presaleDate: '',
      status: 1,
      sort: 100,
      createTime: now,
      updateTime: now
    },
    {
      name: '限量 · 机械螳螂 1/6',
      subtitle: '全球限量 30 体，售罄即止',
      price: 59800,
      originPrice: 0,
      stock: 30,
      soldCount: 0,
      type: 1,
      category: { series: '粘土手办', ip: '动漫游戏', scale: '1/6', priceRange: '' },
      images: [],
      detail: [
        { type: 'text', value: '机械螳螂 1/6 比例，多层装甲结构，关节可动。' },
        { type: 'text', value: '限量 30 体，编号唯一，编号按下单顺序分配。' }
      ],
      specs: [],
      limitNum: 30,
      presaleDate: '2026-12-20',
      status: 1,
      sort: 90,
      createTime: now,
      updateTime: now
    },
    {
      name: '定制 · 专属角色手办',
      subtitle: '按需求单独制作，30% 定金锁排期',
      price: 88000,
      originPrice: 0,
      stock: 999,
      soldCount: 0,
      type: 2,
      category: { series: '粘土手办', ip: '原创', scale: '1/6', priceRange: '' },
      images: [],
      detail: [
        { type: 'text', value: '按你的设定单独制作，可选比例、风格与配色。' },
        { type: 'text', value: '提交需求时填写预期预算，定金为预算的 30%。' }
      ],
      specs: [],
      limitNum: 0,
      presaleDate: '',
      status: 1,
      sort: 80,
      createTime: now,
      updateTime: now
    }
  ]
}

/**
 * 创建集合，已存在则跳过
 * @returns {Promise<object>} 各集合创建结果
 */
async function createCollections() {
  const result = {}
  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      result[name] = 'created'
    } catch (err) {
      // -501001 表示集合已存在，属正常情况
      const code = err && (err.errCode || err.code)
      if (code === -501001 || /already exist/i.test(String(err && err.message))) {
        result[name] = 'exists'
      } else {
        result[name] = `failed: ${err && err.message}`
      }
    }
  }
  return result
}

/**
 * 写入示例商品（仅当 products 为空时执行）
 * @returns {Promise<object>}
 */
async function seedProducts() {
  const countRes = await db.collection('products').count()
  if (countRes.total > 0) {
    return { seeded: false, total: countRes.total, msg: 'products 已有数据，跳过写入' }
  }

  const list = buildSeedProducts()
  let inserted = 0
  for (const item of list) {
    await db.collection('products').add({ data: item })
    inserted += 1
  }
  return { seeded: true, inserted, msg: '示例商品已写入，请到商家端补充商品图片' }
}

exports.main = async (event) => {
  const expected = process.env.INIT_TOKEN || ''
  if (!expected) {
    return fail(500, '未配置 INIT_TOKEN 环境变量，已拒绝执行')
  }
  if (String(event.initToken || '') !== expected) {
    return fail(403, '初始化口令不正确')
  }

  const action = event.action || 'init'

  try {
    if (action === 'collections') {
      return ok({ collections: await createCollections() })
    }

    if (action === 'seed') {
      return ok({ seed: await seedProducts() })
    }

    // 默认执行完整初始化
    const collections = await createCollections()
    const seed = await seedProducts()

    return ok({
      collections,
      seed,
      next: [
        '1. 到「数据库 - 索引管理」为 orders.orderNo、users.openid、customOrders.orderNo 建唯一索引',
        '2. 为 orders 建 userId + createTime 复合索引，products 建 status + sort 复合索引',
        '3. 所有集合权限设为「仅创建者可读写」，products 设为「所有用户可读，仅管理端可写」',
        '4. 初始化完成后删除 initdb 云函数'
      ]
    })
  } catch (err) {
    console.error('[initdb] 执行异常', err)
    return fail(500, `初始化失败：${err && err.message}`)
  }
}
