// scripts/check-modules.js
// 模块划分一致性检查：核对 config/modules.js 的清单与实际工程是否一一对应。
//
// 检查项：
//   1. app.json 注册的每个页面都在清单中登记了归属（无未分类页）；
//   2. 清单里的每个页面都在 app.json 注册（无幽灵条目）；
//   3. 清单里每个页面的 .js/.wxml/.wxss/.json 四件套真实存在；
//   4. 清单里每个云函数目录真实存在；
//   5. cloudfunctions/ 下的每个云函数都在清单中登记了归属。
//
// 用法：node scripts/check-modules.js
// 退出码：0 全部通过；1 存在问题。

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')
const CF = path.join(ROOT, 'cloudfunctions')

const { MODULE_MANIFEST, MODULE_SWITCH, pagesOf } = require(path.join(MP, 'config', 'modules.js'))

const problems = []
const warns = []

function fail(msg) {
  problems.push(msg)
}

// ---- 1. 读取 app.json 注册页 ----
const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))
const registered = appJson.pages || []

// ---- 2. 展开清单 ----
const moduleKeys = Object.keys(MODULE_MANIFEST)
const manifestPages = [] // { path, moduleKey }
const manifestCloud = [] // { name, moduleKey }
const seenPage = new Set()
const seenCloud = new Set()

for (const key of moduleKeys) {
  const m = MODULE_MANIFEST[key]

  for (const p of pagesOf(key)) {
    if (seenPage.has(p)) fail(`页面被重复登记到多个模块：${p}（模块 ${key}）`)
    seenPage.add(p)
    manifestPages.push({ path: p, moduleKey: key })
  }

  for (const cf of m.cloudFunctions || []) {
    if (seenCloud.has(cf)) fail(`云函数被重复登记到多个模块：${cf}（模块 ${key}）`)
    seenCloud.add(cf)
    manifestCloud.push({ name: cf, moduleKey: key })
  }
}

// ---- 3. app.json 页面 ↔ 清单双向对账 ----
for (const p of registered) {
  if (!seenPage.has(p)) {
    fail(`app.json 注册的页面未登记模块归属：${p}（请在 config/modules.js 补登记）`)
  }
}
for (const { path: p, moduleKey } of manifestPages) {
  if (registered.indexOf(p) === -1) {
    fail(`清单中的页面未在 app.json 注册：${p}（模块 ${moduleKey}）`)
  }
}

// ---- 4. 页面四件套存在性 ----
const PAGE_EXTS = ['.js', '.wxml', '.wxss', '.json']
for (const { path: p, moduleKey } of manifestPages) {
  for (const ext of PAGE_EXTS) {
    const f = path.join(MP, p + ext)
    if (!fs.existsSync(f)) {
      // .wxss / .json 允许缺失（微信会用默认），.js / .wxml 必须有
      if (ext === '.js' || ext === '.wxml') {
        fail(`页面文件缺失：miniprogram/${p}${ext}（模块 ${moduleKey}）`)
      } else {
        warns.push(`页面可选文件缺失：miniprogram/${p}${ext}（模块 ${moduleKey}）`)
      }
    }
  }
}

// ---- 5. 云函数目录存在性 + 全量对账 ----
const cfDirs = fs.existsSync(CF)
  ? fs.readdirSync(CF).filter((n) => fs.statSync(path.join(CF, n)).isDirectory())
  : []

for (const { name, moduleKey } of manifestCloud) {
  const dir = path.join(CF, name)
  if (!fs.existsSync(dir)) {
    fail(`清单中的云函数目录不存在：cloudfunctions/${name}（模块 ${moduleKey}）`)
  } else if (!fs.existsSync(path.join(dir, 'index.js'))) {
    fail(`云函数缺少 index.js：cloudfunctions/${name}（模块 ${moduleKey}）`)
  }
}
for (const dir of cfDirs) {
  if (!seenCloud.has(dir)) {
    fail(`cloudfunctions/ 下的云函数未登记模块归属：${dir}（请在 config/modules.js 补登记）`)
  }
}

// ---- 6. 工具文件存在性 ----
for (const key of moduleKeys) {
  for (const u of MODULE_MANIFEST[key].utils || []) {
    const f = path.join(ROOT, u)
    if (!fs.existsSync(f)) fail(`清单中的工具文件不存在：${u}（模块 ${key}）`)
  }
}

// ---- 输出 ----
const summary = moduleKeys.map((k) => {
  const m = MODULE_MANIFEST[k]
  const pCount = pagesOf(k).length
  const cCount = (m.cloudFunctions || []).length
  return `  ${m.label.padEnd(6, '　')} ${String(pCount).padStart(2)} 页 / ${cCount} 云函数   [${k}]`
})

console.log('=== 模块划分检查 ===')
console.log('清单概览：')
console.log(summary.join('\n'))
console.log('')
console.log(`app.json 注册页 ${registered.length} 个，清单登记页 ${manifestPages.length} 个`)
console.log(`云函数目录 ${cfDirs.length} 个，清单登记 ${manifestCloud.length} 个`)
console.log(`付款模块开关 MODULE_SWITCH.trade = ${MODULE_SWITCH.trade}`)
console.log('')

if (warns.length) {
  console.log(`提示 ${warns.length} 条：`)
  warns.forEach((w) => console.log('  · ' + w))
  console.log('')
}

if (problems.length) {
  console.log(`✗ 发现 ${problems.length} 个问题：`)
  problems.forEach((p) => console.log('  ✗ ' + p))
  process.exit(1)
}

console.log('✓ 模块划分一致：所有页面与云函数均已正确归属，无遗漏、无幽灵条目')
