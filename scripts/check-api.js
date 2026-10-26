// scripts/check-api.js
// 前后端接口一致性检查：
// 1. 前端调用的云函数与 action 是否在后端实现；
// 2. 后端实现了但前端未调用的 action（仅提示，可能是给管理端或后续功能预留）。
// 用法：node scripts/check-api.js

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')
const CF = path.join(ROOT, 'cloudfunctions')

function walk(dir, ext, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, ext, out)
    else if (name.endsWith(ext)) out.push(full)
  }
  return out
}

const rel = (f) => path.relative(ROOT, f).replace(/\\/g, '/')

// ---- 收集后端实现的 action ----

/**
 * 提取 `switch (action)` / `switch (event.action)` 块内的 case 分支
 * 逐个字符做花括号配对，避免把 switch(event.sort) 里的 case 误判为 action
 * @param {string} src 源码
 * @returns {Set<string>}
 */
function extractActionCases(src) {
  const result = new Set()
  const headRe = /switch\s*\(\s*(?:event\.)?action\s*\)\s*\{/g
  let head

  while ((head = headRe.exec(src)) !== null) {
    const start = head.index + head[0].length - 1 // 指向 '{'
    let depth = 0
    let end = start

    for (let i = start; i < src.length; i += 1) {
      const ch = src[i]
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          end = i
          break
        }
      }
    }

    const block = src.slice(start, end + 1)
    const caseRe = /case\s+'([\w]+)'\s*:/g
    let m
    while ((m = caseRe.exec(block)) !== null) result.add(m[1])
  }

  // 少量入口用 if (action === 'xxx') 提前拦截（如 checkAuth 在令牌校验之前）
  const ifRe = /\baction\s*===\s*'([\w]+)'/g
  let im
  while ((im = ifRe.exec(src)) !== null) result.add(im[1])

  return result
}

/** @type {Record<string, Set<string>>} 云函数名 -> 支持的 action 集合 */
const backend = {}

for (const dir of fs.readdirSync(CF)) {
  const indexPath = path.join(CF, dir, 'index.js')
  if (!fs.existsSync(indexPath)) continue

  const src = fs.readFileSync(indexPath, 'utf8')
  backend[dir] = extractActionCases(src)
}

// ---- 收集前端调用 ----
/** @type {Array<{file:string, fn:string, action:string}>} */
const calls = []
const unresolved = []

for (const file of walk(MP, '.js')) {
  const src = fs.readFileSync(file, 'utf8')

  // call('name', 'action', ...) 与 query('name', 'action', ...)
  const reDouble = /(?:call|query)\(\s*'(\w+)'\s*,\s*'(\w+)'/g
  let m
  while ((m = reDouble.exec(src)) !== null) {
    calls.push({ file: rel(file), fn: m[1], action: m[2] })
  }

  // callAdmin('action', ...)
  const reAdmin = /\bcallAdmin\(\s*'(\w+)'/g
  while ((m = reAdmin.exec(src)) !== null) {
    calls.push({ file: rel(file), fn: 'admin', action: m[1] })
  }

  // callStats('action', ...)
  const reStats = /\bcallStats\(\s*'(\w+)'/g
  while ((m = reStats.exec(src)) !== null) {
    calls.push({ file: rel(file), fn: 'stats', action: m[1] })
  }

  // 变量形式的 action（如 action = this.data.id ? 'update' : 'add'）无法静态解析，单独记录
  const reDynamic = /(?:call|callAdmin)\(\s*'(\w+)'\s*,\s*action\b/g
  while ((m = reDynamic.exec(src)) !== null) {
    unresolved.push({ file: rel(file), fn: m[1] })
  }
}

// ---- 比对 ----
const errors = []
const seen = new Set()
const missingBackend = new Set()

for (const c of calls) {
  const key = `${c.fn}.${c.action}`
  if (seen.has(key)) continue
  seen.add(key)

  const set = backend[c.fn]
  if (!set) {
    errors.push(`${c.file}: 云函数 ${c.fn} 不存在`);
    continue
  }
  if (!set.has(c.action)) {
    errors.push(`${c.file}: ${c.fn} 缺少 action '${c.action}'`)
    missingBackend.add(key)
  }
}

// 后端有、前端未调用（提示级）
const unused = []
for (const [fn, actions] of Object.entries(backend)) {
  for (const a of actions) {
    if (!seen.has(`${fn}.${a}`)) unused.push(`${fn}.${a}`)
  }
}

console.log(`前端调用点 ${calls.length} 处，去重后 ${seen.size} 个接口`)
console.log(`后端云函数 ${Object.keys(backend).length} 个，共 ${Object.values(backend).reduce((s, x) => s + x.size, 0)} 个 action`)

if (unresolved.length > 0) {
  console.log('\n动态 action（需人工确认）：')
  unresolved.forEach((u) => console.log(`  ? ${u.file} → ${u.fn}.<动态>`))
}

if (unused.length > 0) {
  console.log('\n后端已实现、前端未直接调用：')
  unused.forEach((u) => console.log(`  - ${u}`))
}

if (errors.length > 0) {
  console.log('\n错误：')
  errors.forEach((e) => console.log('  ✗ ' + e))
  process.exit(1)
}

console.log('\n✓ 接口一致性检查通过')
