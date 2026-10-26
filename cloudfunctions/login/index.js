// cloudfunctions/login/index.js
// 登录与用户资料维护。身份一律取自 cloud.getWXContext()，不接受前端传入的任何用户标识。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

/** 成功响应 */
function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

/** 失败响应 */
function fail(code, msg) {
  return { code, msg, data: null }
}

/**
 * 解析管理员白名单
 * 环境变量 ADMIN_OPENIDS 以英文逗号分隔多个 openid
 */
function getAdminOpenids() {
  return String(process.env.ADMIN_OPENIDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * 登录：按 openid 查用户，不存在则创建
 * 入参：无（action = 'login'）
 * 返回：{ openid, isAdmin, userInfo }
 */
async function login(openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get()
  const now = new Date()
  let user = res.data[0]

  if (!user) {
    const addRes = await db.collection('users').add({
      data: {
        openid,
        nickname: '',
        avatar: '',
        phone: '',
        addressList: [],
        favorites: [],
        isAdmin: false,
        createTime: now,
        lastLoginTime: now
      }
    })
    user = {
      _id: addRes._id,
      openid,
      nickname: '',
      avatar: '',
      phone: '',
      addressList: [],
      favorites: [],
      isAdmin: false
    }
  } else {
    await db.collection('users').doc(user._id).update({ data: { lastLoginTime: now } })
  }

  // 管理员身份由环境变量白名单决定，并回写数据库以便运营查看
  const isAdmin = getAdminOpenids().indexOf(openid) > -1
  if (!!user.isAdmin !== isAdmin) {
    await db.collection('users').doc(user._id).update({ data: { isAdmin } })
  }

  return ok({
    openid,
    isAdmin,
    userInfo: {
      nickname: user.nickname || '',
      avatar: user.avatar || '',
      phone: user.phone || ''
    }
  })
}

/**
 * 更新个人资料
 * 入参：{ nickname?, avatar?, phone? }
 * 返回：{ userInfo }
 */
async function updateProfile(openid, event) {
  const patch = {}
  if (typeof event.nickname === 'string' && event.nickname.trim()) {
    if (event.nickname.trim().length > 20) return fail(400, '昵称不超过 20 个字')
    patch.nickname = event.nickname.trim()
  }
  if (typeof event.avatar === 'string' && event.avatar) {
    patch.avatar = event.avatar
  }
  if (typeof event.phone === 'string' && event.phone) {
    if (!/^1[3-9]\d{9}$/.test(event.phone)) return fail(400, '手机号格式不正确')
    patch.phone = event.phone
  }
  if (Object.keys(patch).length === 0) return fail(400, '没有可更新的内容')

  const res = await db.collection('users').where({ openid }).limit(1).get()
  if (!res.data[0]) return fail(401, '用户不存在，请重新进入小程序')

  await db.collection('users').doc(res.data[0]._id).update({ data: patch })
  return ok({ userInfo: Object.assign({}, res.data[0], patch) })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'login'

  try {
    switch (action) {
      case 'login':
        return await login(OPENID)
      case 'updateProfile':
        return await updateProfile(OPENID, event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[login] 执行异常', action, err)
    return fail(500, '登录服务异常，请稍后重试')
  }
}
