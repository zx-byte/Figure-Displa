// cloudfunctions/address/index.js
// 收货地址管理。地址存在 users.addressList 数组中，读写均限定本人。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/** 取当前用户记录 */
async function getUser(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  return res.data[0] || null
}

/**
 * 校验地址字段
 * @returns {string} 错误文案，空串表示通过
 */
function validate(addr) {
  const name = String(addr.name || '').trim()
  if (!name) return '请填写收货人姓名'
  if (name.length > 20) return '收货人姓名不超过 20 个字'

  const phone = String(addr.phone || '').trim()
  if (!/^1[3-9]\d{9}$/.test(phone)) return '请填写正确的手机号'

  if (!Array.isArray(addr.region) || addr.region.length < 2) return '请选择所在地区'

  const detail = String(addr.detail || '').trim()
  if (detail.length < 4) return '详细地址请至少填写 4 个字'
  if (detail.length > 100) return '详细地址不超过 100 个字'

  return ''
}

/** 地址列表 */
async function list(openid) {
  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')
  return ok({ list: user.addressList || [] })
}

/**
 * 新增地址
 * 入参：{ name, phone, region: string[], detail, isDefault? }
 */
async function add(openid, event) {
  const err = validate(event)
  if (err) return fail(400, err)

  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  const list = user.addressList || []
  if (list.length >= 20) return fail(400, '最多保存 20 个收货地址')

  const isDefault = list.length === 0 ? true : !!event.isDefault
  const item = {
    id: `addr_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: String(event.name).trim(),
    phone: String(event.phone).trim(),
    region: event.region,
    regionText: event.region.join(' '),
    detail: String(event.detail).trim(),
    isDefault
  }

  // 设为默认时，其余地址取消默认
  const nextList = isDefault
    ? list.map((a) => Object.assign({}, a, { isDefault: false })).concat(item)
    : list.concat(item)

  await db.collection('users').doc(user._id).update({ data: { addressList: nextList } })
  return ok({ id: item.id, list: nextList })
}

/**
 * 更新地址
 * 入参：{ id, name, phone, region, detail, isDefault? }
 */
async function update(openid, event) {
  const id = event.id
  if (!id) return fail(400, '缺少地址 ID')

  const err = validate(event)
  if (err) return fail(400, err)

  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  const list = user.addressList || []
  const index = list.findIndex((a) => a.id === id)
  if (index < 0) return fail(404, '地址不存在')

  const updated = Object.assign({}, list[index], {
    name: String(event.name).trim(),
    phone: String(event.phone).trim(),
    region: event.region,
    regionText: event.region.join(' '),
    detail: String(event.detail).trim(),
    isDefault: !!event.isDefault
  })

  let nextList = list.slice()
  nextList[index] = updated
  if (updated.isDefault) {
    nextList = nextList.map((a) => (a.id === id ? a : Object.assign({}, a, { isDefault: false })))
  }

  await db.collection('users').doc(user._id).update({ data: { addressList: nextList } })
  return ok({ list: nextList })
}

/**
 * 删除地址
 * 入参：{ id }
 */
async function remove(openid, event) {
  const id = event.id
  if (!id) return fail(400, '缺少地址 ID')

  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  const list = user.addressList || []
  const removed = list.find((a) => a.id === id)
  let nextList = list.filter((a) => a.id !== id)

  // 删除的是默认地址时，把第一个地址提为默认
  if (removed && removed.isDefault && nextList.length > 0) {
    nextList = nextList.map((a, i) => Object.assign({}, a, { isDefault: i === 0 }))
  }

  await db.collection('users').doc(user._id).update({ data: { addressList: nextList } })
  return ok({ list: nextList })
}

/**
 * 设为默认地址
 * 入参：{ id }
 */
async function setDefault(openid, event) {
  const id = event.id
  if (!id) return fail(400, '缺少地址 ID')

  const user = await getUser(openid)
  if (!user) return fail(401, '用户不存在，请重新进入小程序')

  const list = user.addressList || []
  if (!list.some((a) => a.id === id)) return fail(404, '地址不存在')

  const nextList = list.map((a) => Object.assign({}, a, { isDefault: a.id === id }))
  await db.collection('users').doc(user._id).update({ data: { addressList: nextList } })
  return ok({ list: nextList })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'list'
  try {
    switch (action) {
      case 'list':
        return await list(OPENID)
      case 'add':
        return await add(OPENID, event)
      case 'update':
        return await update(OPENID, event)
      case 'remove':
        return await remove(OPENID, event)
      case 'setDefault':
        return await setDefault(OPENID, event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[address] 执行异常', action, err)
    return fail(500, '地址服务异常，请稍后重试')
  }
}
