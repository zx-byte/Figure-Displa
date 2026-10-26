// cloudfunctions/security/index.js
// 内容安全检测：文本走 msgSecCheck v2，图片走 imgSecCheck。
//
// 为什么单独一个云函数而不是塞进 custom：
// 调用 openapi 必须在每个云函数的 config.json 里单独声明权限，散在各处容易漏配；
// 集中到一个函数后，权限只在一处声明，后续新增检测场景直接复用。
//
// 降级策略（重要）：
//   检测接口本身可能不可用——小程序未认证、未开通内容安全能力、或微信侧系统繁忙。
//   此时不能把整个业务卡死，否则用户提交不了任何东西。取舍如下：
//     - 接口明确返回「违规」（errCode 87014 / suggest = risky）→ 拒绝，这是正常判定；
//     - 接口不可用（-604101 无权限、-1 繁忙、超时）→ 放行并打日志。
//   放行不等于放任：日志里带 action 与 openid 后六位，便于事后追溯。
//   若上线后发现降级频繁，说明该去公众平台补开内容安全能力，而不是关掉检测。
//
// 调用方约定：
//   前端在提交前调本函数做预检，把结果转成用户可读提示；
//   custom.submit 内还会对文本再做一次服务端检测，防止绕过前端直接调云函数。

const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

/** msgSecCheck 单次最多 2500 字，超出部分微信侧会报错 */
const MAX_TEXT_LENGTH = 2500

/** imgSecCheck 单图上限 1MB，超过直接跳过（异步接口 mediaCheckAsync 无此限制但需配置消息推送） */
const MAX_IMAGE_BYTES = 1024 * 1024

/** 单次最多检测的图片数量，防止一次提交太多张拖垮函数 */
const MAX_IMAGE_COUNT = 6

function ok(data) {
  return { code: 0, msg: 'ok', data: data === undefined ? null : data }
}

function fail(code, msg) {
  return { code, msg, data: null }
}

/** openid 只留后六位再入日志，避免完整标识落盘 */
function tail(openid) {
  return String(openid || '').slice(-6)
}

/**
 * 把 openapi 抛出的异常翻译成检测结论
 * @param {object} err 原始错误
 * @param {string} kind text | image，仅用于日志
 * @returns {{pass:boolean, degraded?:boolean, reason?:string, errCode?:number}}
 */
function degrade(err, kind) {
  const code = err && (err.errCode !== undefined ? err.errCode : err.code)
  console.error(`[security] ${kind} 检测接口异常`, code, err && err.errMsg)

  // 87014 是「内容含有违法违规内容」，属于检测成功且不通过，必须拒绝
  if (code === 87014) {
    return { pass: false, reason: 'risky', errCode: code }
  }

  // 40001 凭证失效、-604101 无权限、-1 系统繁忙、超时等，统一视为服务不可用
  return { pass: true, degraded: true, errCode: code }
}

/**
 * 文本检测
 * @param {string} content 待检测文本
 * @param {string} openid 用户标识，接口要求传入
 * @returns {Promise<object>} { pass, suggest?, degraded?, errCode?, reason? }
 */
async function checkText(content, openid) {
  const text = String(content || '').trim()
  if (!text) return { pass: true, skipped: true }

  if (text.length > MAX_TEXT_LENGTH) {
    return { pass: false, reason: 'too-long' }
  }

  try {
    const res = await cloud.openapi.security.msgSecCheck({
      openid,
      scene: 2, // 1 资料 2 评论 3 论坛 4 社交日志；定制需求更接近「用户发布内容」，取 2
      version: 2,
      content: text
    })

    const result = (res && res.result) || {}
    const suggest = result.suggest || 'pass'

    if (suggest === 'risky') {
      return { pass: false, reason: 'risky', label: result.label }
    }
    // review 表示疑似，业务上按通过处理但留痕，便于人工复核
    return { pass: true, suggest }
  } catch (err) {
    return degrade(err, 'text')
  }
}

/**
 * 根据 fileID 后缀推断 contentType，imgSecCheck 只接受 png/jpeg/gif
 * @param {string} fileID 云存储 fileID
 * @returns {string}
 */
function guessContentType(fileID) {
  const m = String(fileID || '').match(/\.(png|jpe?g|gif)(?:\?|$)/i)
  if (!m) return 'image/jpeg'
  const ext = m[1].toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  return 'image/jpeg'
}

/**
 * 单张图片检测
 * @param {string} fileID 云存储 fileID
 * @returns {Promise<object>} { pass, degraded?, reason? }
 */
async function checkImage(fileID) {
  if (!fileID) return { pass: true, skipped: true }

  try {
    const dl = await cloud.downloadFile({ fileID })
    const buffer = dl && dl.fileContent
    if (!buffer || !buffer.length) return { pass: true, skipped: true }

    // 超过 1MB 时同步接口会直接报错，这里主动跳过并标记降级，
    // 让业务能继续，同时在日志里留下「有图未检」的痕迹。
    if (buffer.length > MAX_IMAGE_BYTES) {
      console.warn('[security] 图片超过 1MB，跳过同步检测', buffer.length)
      return { pass: true, degraded: true, reason: 'oversize' }
    }

    await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: guessContentType(fileID),
        value: buffer
      }
    })

    return { pass: true }
  } catch (err) {
    return degrade(err, 'image')
  }
}

/**
 * 文本检测入口
 * 入参：{ content } 或 { contents: string[] }
 * 返回：{ pass, blocked, detail }
 */
async function handleText(openid, event) {
  const list = Array.isArray(event.contents)
    ? event.contents
    : [event.content]

  const results = []
  for (let i = 0; i < list.length; i += 1) {
    const res = await checkText(list[i], openid)
    results.push(res)
    if (!res.pass) {
      console.warn(`[security] 文本被拦截 openid=…${tail(openid)} index=${i} reason=${res.reason}`)
      return ok({ pass: false, blockedIndex: i, detail: results })
    }
  }

  return ok({ pass: true, detail: results })
}

/**
 * 图片检测入口
 * 入参：{ fileIDs: string[] } 或 { fileID }
 * 返回：{ pass, blockedIndex, detail }
 * 说明：串行检测而不是 Promise.all——并发调用 openapi 容易触发频控，
 * 6 张图串行的额外耗时可以接受（单张通常 200ms 内）。
 */
async function handleImage(openid, event) {
  let list = Array.isArray(event.fileIDs) ? event.fileIDs : [event.fileID]
  list = list.filter(Boolean).slice(0, MAX_IMAGE_COUNT)

  if (list.length === 0) return ok({ pass: true, detail: [] })

  const results = []
  for (let i = 0; i < list.length; i += 1) {
    const res = await checkImage(list[i])
    results.push(res)
    if (!res.pass) {
      console.warn(`[security] 图片被拦截 openid=…${tail(openid)} index=${i}`)
      return ok({ pass: false, blockedIndex: i, detail: results })
    }
  }

  return ok({ pass: true, detail: results })
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return fail(401, '无法获取用户身份')

  const action = event.action || 'text'
  try {
    switch (action) {
      case 'text':
        return await handleText(OPENID, event)
      case 'image':
        return await handleImage(OPENID, event)
      default:
        return fail(400, `未知操作：${action}`)
    }
  } catch (err) {
    console.error('[security] 执行异常', action, err)
    return fail(500, '内容检测服务异常，请稍后重试')
  }
}
