// scripts/check-wxml.js
// 轻量 WXML 结构检查：标签闭合、组件引用是否存在、app.json 页面文件是否齐全。
// 用法：node scripts/check-wxml.js

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')

/** 自闭合与空元素，不参与配对 */
const VOID_TAGS = new Set(['image', 'input', 'icon', 'progress', 'switch', 'slider', 'audio', 'canvas', 'import', 'include', 'wxs'])

const errors = []
const warnings = []

/** 递归收集文件 */
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

/**
 * 检查单个 WXML 的标签配对
 * @param {string} file
 */
function checkTagBalance(file) {
  let src = fs.readFileSync(file, 'utf8')
  // 去掉注释与模板表达式中的内容，避免误判
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  src = src.replace(/\{\{[\s\S]*?\}\}/g, 'EXPR')

  const tagRe = /<\/?([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  const stack = []
  let match

  while ((match = tagRe.exec(src)) !== null) {
    const raw = match[0]
    const tag = match[1]
    const selfClose = match[3] === '/'
    const isClose = raw.startsWith('</')

    if (isClose) {
      // canvas 等标签在小程序里必须成对书写，虽然开标签被当作空元素跳过，
      // 这里也要跳过对应的闭标签，否则会误报「多余的结束标签」
      if (VOID_TAGS.has(tag)) continue

      if (stack.length === 0) {
        errors.push(`${rel(file)}: 多余的结束标签 </${tag}>`)
        continue
      }
      const top = stack.pop()
      if (top !== tag) {
        errors.push(`${rel(file)}: 标签不匹配，期望 </${top}>，实际 </${tag}>`)
      }
      continue
    }

    if (selfClose || VOID_TAGS.has(tag)) continue
    stack.push(tag)
  }

  if (stack.length > 0) {
    errors.push(`${rel(file)}: 未闭合的标签 ${stack.map((t) => `<${t}>`).join(', ')}`)
  }
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

/** 检查 app.json 中注册的页面文件是否齐全，以及 tabBar 图标是否存在 */
function checkPages() {
  const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'))
  for (const page of appJson.pages) {
    for (const ext of ['.js', '.json', '.wxml', '.wxss']) {
      const file = path.join(MP, page + ext)
      if (!fs.existsSync(file)) {
        errors.push(`app.json 注册的页面缺少文件：${page}${ext}`)
      }
    }
  }

  // tabBar 图标：路径相对 miniprogram 根目录，缺失会导致编译报错
  const tabList = (appJson.tabBar && appJson.tabBar.list) || []
  for (const item of tabList) {
    for (const key of ['iconPath', 'selectedIconPath']) {
      const relPath = item[key]
      if (!relPath) {
        errors.push(`tabBar「${item.text}」缺少 ${key}`)
        continue
      }
      const file = path.join(MP, relPath)
      if (!fs.existsSync(file)) {
        errors.push(`tabBar「${item.text}」的 ${key} 文件不存在：${relPath}`)
      }
    }
  }

  return appJson
}

/** 检查页面 json 中引用的自定义组件是否存在 */
function checkComponents() {
  const jsonFiles = walk(MP, '.json')
  for (const file of jsonFiles) {
    let conf
    try {
      conf = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch (e) {
      errors.push(`${rel(file)}: JSON 解析失败`)
      continue
    }
    const using = conf.usingComponents || {}
    for (const [name, p] of Object.entries(using)) {
      // 只校验绝对路径引用，npm 包引用跳过
      if (!p.startsWith('/')) continue
      const target = path.join(MP, p)
      if (!fs.existsSync(target + '.js')) {
        errors.push(`${rel(file)}: 组件 ${name} 指向的文件不存在（${p}.js）`)
      }
    }
  }
}

/** 检查未定义的页面跳转路径 */
function checkNavigation(appJson) {
  const pages = new Set(appJson.pages.map((p) => '/' + p))
  const files = walk(MP, '.js').concat(walk(MP, '.wxml'))
  const navRe = /url:\s*[`'"](\/pages\/[\w\-\/]+)/g

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8')
    let m
    while ((m = navRe.exec(src)) !== null) {
      const target = m[1]
      if (!pages.has(target)) {
        warnings.push(`${rel(file)}: 跳转目标未在 app.json 注册 → ${target}`)
      }
    }
  }
}

// ---------- 执行 ----------

const wxmlFiles = walk(MP, '.wxml')
wxmlFiles.forEach(checkTagBalance)

const appJson = checkPages()
checkComponents()
checkNavigation(appJson)

console.log(`检查 WXML 文件 ${wxmlFiles.length} 个`)

if (warnings.length > 0) {
  console.log('\n警告：')
  warnings.forEach((w) => console.log('  ⚠ ' + w))
}

if (errors.length > 0) {
  console.log('\n错误：')
  errors.forEach((e) => console.log('  ✗ ' + e))
  process.exit(1)
}

console.log('\n✓ 结构检查全部通过')
