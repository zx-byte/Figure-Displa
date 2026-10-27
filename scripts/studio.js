#!/usr/bin/env node
/**
 * 作品工作室 —— 本地图形化上架工具
 *
 * 用法：
 *   node scripts/studio.js                启动并自动打开浏览器
 *   node scripts/studio.js --port 7788    指定端口
 *   node scripts/studio.js --no-open      不自动打开浏览器
 *
 * 做什么：
 *   1. 扫描 作品原图/红糖/ 下所有原图，按笔记标题预分组
 *   2. 浏览器里拖拽调整分组、设封面、勾选进主包的图
 *   3. 点「生成」后自动完成：规范命名 → 压缩 → 写 works.js → 三项自检
 *
 * 数据落在 作品原图/红糖/_分组记录.json，下次打开直接还原上次的分组。
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn, spawnSync } = require('child_process')

// ── 路径 ────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, '作品原图', '红糖')
const NORM_DIR = path.join(SRC_DIR, '_规范')
const RECORD_FILE = path.join(SRC_DIR, '_分组记录.json')
const META_FILE = path.join(SRC_DIR, '作品信息.json')
const WORK_IMG = path.join(ROOT, 'miniprogram', 'images', 'works')
const OUT_DIR = path.join(ROOT, 'output')
const THUMB_DIR = path.join(OUT_DIR, '_studio', 'thumbs')
const BUILD_DIR = path.join(OUT_DIR, '_build')
const CLOUD_DIR = path.join(OUT_DIR, 'cloud-batch')
const CLOUD_MODULE = path.join(OUT_DIR, 'cloud-works.js')

const UI_FILE = path.join(__dirname, 'studio.ui.html')
const COMPRESS_PY = path.join(__dirname, 'compress-images.py')
const THUMB_PY = path.join(__dirname, 'studio-thumbs.py')
const PRUNE_PY = path.join(__dirname, 'prune-dir.py')
const IMPORT_JS = path.join(__dirname, 'import-works.js')

// ── 常量 ────────────────────────────────────────────────────
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.bmp']
const PKG_LIMIT = 2 * 1024 * 1024
const DEFAULT_WIDTH = 460
const DEFAULT_QUALITY = 64
const ILLEGAL_NAME = /[\\/:*?"<>|\r\n]/g

// ── 小工具 ──────────────────────────────────────────────────
const exists = (p) => fs.existsSync(p)

function readJson(file, dft) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (e) {
    return dft
  }
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n', 'utf8')
}

function dirSize(dir) {
  let total = 0
  if (!exists(dir)) return 0
  const stack = [dir]
  while (stack.length) {
    const cur = stack.pop()
    for (const ent of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(p)
      else if (ent.isFile()) {
        try {
          total += fs.statSync(p).size
        } catch (e) {
          /* 统计用，忽略 */
        }
      }
    }
  }
  return total
}

/** Python 在 Windows 控制台默认用 GBK 输出，强制走 UTF-8 才能解析中文日志 */
function pyEnv() {
  return Object.assign({}, process.env, {
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  })
}

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

/**
 * 让目录内容与清单精确对齐：补建、覆盖同名、删掉多余的。
 * 刻意不用 rmSync 整目录递归删——那会触发批量删除保护，
 * 而且增量场景下本来就没几个文件需要删。
 */
/**
 * 让目录内容与清单精确对齐：清单里的保留，其余删掉。
 *
 * 删除交给 prune-dir.py —— Node 的 unlink 在当前环境下会偶发 EBUSY
 * （刚写完的图片文件尤其明显），Python 的 os.remove 稳定得多。
 * 也刻意不用 rmSync 整目录递归删，那会触发批量删除保护。
 */
function pruneDir(dir, wantedNames) {
  if (!exists(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return 0
  }
  const listFile = path.join(OUT_DIR, '_prune.txt')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(listFile, wantedNames.join('\n'), 'utf8')

  const r = spawnSync(PYTHON.cmd, [PRUNE_PY, dir, listFile], { encoding: 'utf8', env: pyEnv() })
  if (r.status !== 0) return 0
  const m = /REMOVED (\d+)/.exec(r.stdout || '')
  return m ? Number(m[1]) : 0
}

function human(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}

/** 与 studio-thumbs.py 保持一致：文件名 md5 前 10 位 */
function idOf(filename) {
  return crypto.createHash('md5').update(filename, 'utf8').digest('hex').slice(0, 10)
}

/**
 * 从小红书下载的文件名里提取笔记标题。
 * 格式为「{笔记标题}_{第几张}_{博主名}_来自小红书网页版 (副本号).jpg」，
 * 笔记无标题时第一段为空，返回空串。
 */
function noteTitleOf(filename) {
  const stem = filename
    .slice(0, filename.lastIndexOf('.'))
    .replace(/\s*\(\d+\)\s*$/, '')
    .trim()
  const m = /^(.*?)_\d+_[^_]+_来自小红书/.exec(stem)
  return m && m[1].trim() ? m[1].trim() : ''
}

// ── Python 探测（压缩与缩略图都依赖 Pillow） ────────────────
let PYTHON = null

function detectPython() {
  const home = process.env.USERPROFILE || process.env.HOME || ''
  const candidates = [
    process.env.STUDIO_PYTHON,
    'python',
    'python3',
    path.join(home, '.workbuddy', 'binaries', 'python', 'versions', '3.13.12', 'python.exe'),
    path.join(home, '.workbuddy', 'binaries', 'python', 'versions', '3.13.13', 'python.exe'),
    path.join(home, '.workbuddy', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe'),
    path.join(home, 'miniconda3', 'python.exe')
  ].filter(Boolean)

  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['-c', 'import PIL, sys; print(sys.version.split()[0], PIL.__version__)'], {
        encoding: 'utf8',
        timeout: 15000
      })
      if (r.status === 0 && r.stdout) return { cmd, info: r.stdout.trim() }
    } catch (e) {
      /* 换下一个 */
    }
  }
  return null
}

// ── 扫描源目录 ──────────────────────────────────────────────
function listImages() {
  if (!exists(SRC_DIR)) return []
  return fs
    .readdirSync(SRC_DIR)
    .filter((n) => {
      const p = path.join(SRC_DIR, n)
      return fs.statSync(p).isFile() && IMG_EXTS.includes(path.extname(n).toLowerCase())
    })
    .sort((a, b) => a.localeCompare(b, 'zh'))
    .map((n) => ({ id: idOf(n), file: n, bytes: fs.statSync(path.join(SRC_DIR, n)).size }))
}

// ── 状态 ────────────────────────────────────────────────────
function buildState() {
  const images = listImages()
  const byFile = new Set(images.map((i) => i.file))
  const record = readJson(RECORD_FILE, { works: {} })
  const meta = readJson(META_FILE, { defaults: {}, works: {} })

  const works = []
  const used = new Set()

  // 上次确认过的分组
  const rec = record.works || {}
  for (const name of Object.keys(rec)) {
    const files = (rec[name].files || []).filter((f) => byFile.has(f))
    if (!files.length) continue
    files.forEach((f) => used.add(f))
    works.push({
      name,
      files,
      picked: (rec[name].picked || []).filter((f) => files.includes(f)),
      confirmed: true,
      note: noteTitleOf(files[0])
    })
  }

  // 新增的图按笔记标题预分组，等用户确认
  const pending = images.filter((i) => !used.has(i.file))
  const buckets = new Map()
  for (const img of pending) {
    const title = noteTitleOf(img.file) || '__untitled__'
    if (!buckets.has(title)) buckets.set(title, [])
    buckets.get(title).push(img.file)
  }

  const untitled = buckets.get('__untitled__') || []
  if (untitled.length) {
    works.push({
      name: '未分组',
      files: untitled,
      picked: [],
      confirmed: false,
      untitled: true
    })
  }
  for (const [title, files] of buckets) {
    if (title === '__untitled__') continue
    works.push({ name: title, files, picked: [], confirmed: false })
  }

  // 体积口径
  const mainBytes = dirSize(path.join(ROOT, 'miniprogram'))
  const imgBytes = dirSize(WORK_IMG)
  const pickedCount = works.reduce((s, w) => s + w.picked.length, 0)

  return {
    ok: true,
    source: path.relative(ROOT, SRC_DIR),
    totalImages: images.length,
    python: PYTHON ? PYTHON.info : null,
    images: images.map((i) => ({ id: i.id, file: i.file, bytes: i.bytes, note: noteTitleOf(i.file) })),
    works,
    pkg: {
      limit: PKG_LIMIT,
      nonImage: mainBytes - imgBytes,
      imgBytes,
      avgPicked: pickedCount ? Math.round(imgBytes / pickedCount) : 26000
    },
    defaults: { width: DEFAULT_WIDTH, quality: DEFAULT_QUALITY },
    meta: Object.fromEntries(
      Object.keys(meta.works || {}).map((k) => [
        k,
        { subtitle: (meta.works[k] || {}).subtitle || '', ip: (meta.works[k] || {}).ip || '' }
      ])
    )
  }
}

// ── 生成 ────────────────────────────────────────────────────
function generate(payload) {
  const p = payload || {}
  const cloud = !!p.cloud
  const width = Math.max(200, Math.min(1200, Number(p.width) || DEFAULT_WIDTH))
  const quality = Math.max(30, Math.min(95, Number(p.quality) || DEFAULT_QUALITY))

  const log = []
  const say = (s) => {
    log.push(s)
    console.log('  ' + s)
  }

  if (!PYTHON) throw new Error('没找到带 Pillow 的 Python，无法压缩图片。请先安装：pip install Pillow')

  // 1. 校验作品清单
  const clean = []
  const seen = new Set()
  for (const w of p.works || []) {
    const name = String(w.name || '').trim().replace(ILLEGAL_NAME, '').trim()
    if (!name) throw new Error('有作品没有填写名称')
    if (name === '未分组') throw new Error('「未分组」需要先改名成真正的作品名')
    if (seen.has(name)) throw new Error(`作品名重复：${name}`)
    seen.add(name)

    const files = (w.files || []).filter((f) => exists(path.join(SRC_DIR, f)))
    if (!files.length) continue

    const picked = (w.picked || []).filter((f) => files.includes(f))
    if (!cloud && !picked.length) throw new Error(`作品「${name}」没有勾选进主包的图`)

    // picked 始终记录用户真实勾选，云模式只是在压缩时忽略它。
    // 若把"全量"写进记录，切回本地模式就会误压全部图。
    clean.push({ name, files, picked })
  }
  if (!clean.length) throw new Error('没有包含图片的作品')

  // 2. 落盘分组记录
  const record = {
    version: 1,
    updatedAt: new Date().toISOString(),
    source: '作品原图/红糖',
    note: '由 scripts/studio.js 维护。files 按展示顺序排列，第一张为封面；picked 为进主包的图。',
    works: {}
  }
  clean.forEach((w, i) => {
    record.works[w.name] = { order: i + 1, files: w.files, picked: w.picked }
  })
  writeJson(RECORD_FILE, record)
  say(`分组记录已保存（${clean.length} 件作品 / ${clean.reduce((s, w) => s + w.files.length, 0)} 张图）`)

  // 3. 重建规范命名副本
  fs.mkdirSync(NORM_DIR, { recursive: true })
  const normNames = []
  for (const w of clean) {
    w.files.forEach((f, i) => {
      const norm = `${w.name}-${String(i + 1).padStart(2, '0')}.jpg`
      copyFile(path.join(SRC_DIR, f), path.join(NORM_DIR, norm))
      normNames.push(norm)
    })
  }
  const staleNorm = pruneDir(NORM_DIR, normNames)
  say(`规范命名副本已重建（${normNames.length} 张，_规范/）` + (staleNorm ? `，清理 ${staleNorm} 张旧图` : ''))

  // 4. 同步作品信息.json 的展示顺序
  const meta = readJson(META_FILE, null) || { defaults: {}, works: {} }
  meta.works = meta.works || {}
  const added = []
  clean.forEach((w, i) => {
    if (!meta.works[w.name]) added.push(w.name)
    meta.works[w.name] = Object.assign({}, meta.works[w.name] || {}, { order: i + 1, name: w.name })
  })
  writeJson(META_FILE, meta)
  say(
    `作品信息.json 顺序已同步` + (added.length ? `，新增 ${added.length} 条待补文案：${added.join('、')}` : '')
  )

  // 5. 生成压缩清单
  //    只压挑中的图，靠 --only 清单筛选，不复制临时目录——
  //    临时目录里的副本在 Windows 上删不干净，白白占几十 MB。
  const compressNames = []
  for (const w of clean) {
    w.files.forEach((f, i) => {
      if (!cloud && !w.picked.includes(f)) return
      compressNames.push(`${w.name}-${String(i + 1).padStart(2, '0')}.jpg`)
    })
  }
  const listFile = path.join(OUT_DIR, '_picked.txt')
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(listFile, compressNames.join('\n'), 'utf8')

  // 6. 压缩到中间目录
  //    先清掉上次的产物：此刻这批文件的句柄早已释放，才删得动。
  fs.mkdirSync(BUILD_DIR, { recursive: true })
  const staleBuild = pruneDir(BUILD_DIR, compressNames)
  if (staleBuild) say(`清理上次压缩产物 ${staleBuild} 张`)
  const r1 = spawnSync(
    PYTHON.cmd,
    [
      COMPRESS_PY,
      NORM_DIR,
      '--width',
      String(width),
      '--quality',
      String(quality),
      '--out',
      BUILD_DIR,
      '--only',
      listFile
    ],
    { encoding: 'utf8', env: pyEnv() }
  )
  if (r1.status !== 0) throw new Error('图片压缩失败：\n' + (r1.stderr || r1.stdout || '').slice(-1200))
  let builtBytes = 0
  let builtCount = 0
  for (const n of compressNames) {
    const p = path.join(BUILD_DIR, n)
    if (exists(p)) {
      builtBytes += fs.statSync(p).size
      builtCount++
    }
  }
  if (!builtCount) throw new Error('压缩后没有任何图片，请检查 source 目录')
  say(`压缩完成：${builtCount} 张，合计 ${human(builtBytes)}（${width}px / q${quality}）`)

  // 6.5 分发到目标目录
  const outDir = cloud ? CLOUD_DIR : WORK_IMG
  fs.mkdirSync(outDir, { recursive: true })
  const staleOut = pruneDir(outDir, compressNames)
  for (const n of compressNames) copyFile(path.join(BUILD_DIR, n), path.join(outDir, n))
  if (staleOut) say(`清理旧图 ${staleOut} 张`)

  // 7. 生成数据文件
  const impArgs = cloud
    ? [IMPORT_JS, '--dir', outDir, '--cloud', '--out', CLOUD_MODULE]
    : [IMPORT_JS]
  const r2 = spawnSync(process.execPath, impArgs, { encoding: 'utf8' })
  if (r2.status !== 0) throw new Error('生成作品数据失败：\n' + (r2.stderr || r2.stdout || '').slice(-1200))
  say(cloud ? '已生成 output/cloud-works.js' : '已写入 miniprogram/config/works.js')

  // 8. 三项自检（云存储模式不改小程序代码，跳过）
  if (!cloud) {
    const checks = [
      ['模块归属', 'check-modules.js'],
      ['WXML 结构', 'check-wxml.js'],
      ['接口一致性', 'check-api.js']
    ]
    for (const [label, file] of checks) {
      const c = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8' })
      if (c.status === 0) {
        say(`✓ ${label}检查通过`)
      } else {
        say(`✗ ${label}检查未通过`)
        say((c.stdout || c.stderr || '').split('\n').slice(-10).join('\n'))
      }
    }
  }

  // 9. 体积报告
  const mainBytes = dirSize(path.join(ROOT, 'miniprogram'))
  const imgBytes = dirSize(cloud ? CLOUD_DIR : WORK_IMG)
  const nonImage = cloud ? 0 : mainBytes - imgBytes

  if (cloud) {
    say(`云存储图包 ${human(imgBytes)}，共 ${dirSize(CLOUD_DIR) ? countFiles(CLOUD_DIR) : 0} 张`)
    say('下一步：微信开发者工具 → 云开发 → 存储 → 新建 works 目录 → 上传 output/cloud-batch 里的全部图片')
    say('上传后把 output/cloud-works.js 里的 IMG_BASE 改成 cloud://<环境ID>.<存储桶>/works/，再覆盖 miniprogram/config/works.js')
  } else {
    const remain = PKG_LIMIT - mainBytes
    say(`主包 ${human(mainBytes)}，余量 ${human(remain)}` + (remain < 0 ? '（已超出 2MB 上限）' : ''))
    say('下一步：微信开发者工具里重新编译（Ctrl+B），首页与「全部作品」即可看到')
  }

  return {
    ok: true,
    log,
    cloud,
    pkg: { mainBytes, imgBytes, nonImage, limit: PKG_LIMIT, remain: PKG_LIMIT - mainBytes }
  }
}

function countFiles(dir) {
  let n = 0
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isFile()) n++
  }
  return n
}

// ── HTTP ────────────────────────────────────────────────────
function sendJson(res, obj, code) {
  const body = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code || 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  })
  res.end(body)
}

function sendFile(res, file, type, cache) {
  if (!exists(file)) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const body = fs.readFileSync(file)
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': cache || 'no-store'
  })
  res.end(body)
}

/** id → 原图路径，供 /full 大图预览 */
function fileOfId(id) {
  const hit = listImages().find((i) => i.id === id)
  return hit ? path.join(SRC_DIR, hit.file) : null
}

function runThumbs(force) {
  if (!PYTHON) return
  const args = [THUMB_PY]
  if (force) args.push('--force')
  const r = spawnSync(PYTHON.cmd, args, { encoding: 'utf8', env: pyEnv() })
  if (r.stdout) console.log('  ' + r.stdout.trim())
  if (r.status !== 0) console.log('  缩略图生成异常：' + (r.stderr || '').slice(-300))
}

let PORT = 7788

function serve(port) {
  PORT = port
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1')

    try {
      if (u.pathname === '/' || u.pathname === '/index.html') {
        return sendFile(res, UI_FILE, 'text/html; charset=utf-8')
      }

      if (u.pathname === '/api/state') {
        return sendJson(res, buildState())
      }

      if (u.pathname === '/api/refresh') {
        runThumbs(false)
        return sendJson(res, buildState())
      }

      if (u.pathname === '/api/generate' && req.method === 'POST') {
        let body = ''
        req.setEncoding('utf8')
        req.on('data', (c) => {
          body += c
          if (body.length > 8 * 1024 * 1024) req.destroy()
        })
        req.on('end', () => {
          console.log('\n[生成] ' + new Date().toLocaleTimeString())
          try {
            const out = generate(JSON.parse(body || '{}'))
            runThumbs(false)
            sendJson(res, out)
          } catch (err) {
            console.error('  ✗ ' + err.message)
            sendJson(res, { ok: false, error: err.message }, 500)
          }
        })
        return
      }

      if (u.pathname.startsWith('/thumb/')) {
        const id = u.pathname.slice(7).replace(/[^\w]/g, '')
        return sendFile(res, path.join(THUMB_DIR, id + '.jpg'), 'image/jpeg', 'max-age=3600')
      }

      if (u.pathname.startsWith('/full/')) {
        const id = u.pathname.slice(6).replace(/[^\w]/g, '')
        const file = fileOfId(id)
        if (!file) {
          res.writeHead(404)
          return res.end()
        }
        return sendFile(res, file, 'image/jpeg', 'max-age=3600')
      }

      res.writeHead(404)
      res.end('not found')
    } catch (err) {
      console.error(err)
      sendJson(res, { ok: false, error: err.message }, 500)
    }
  })

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < 7800) {
      console.log(`  端口 ${port} 被占用，换 ${port + 1}`)
      serve(port + 1)
    } else {
      console.error('启动失败：' + err.message)
      process.exit(1)
    }
  })

  server.listen(port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${port}/`
    console.log('')
    console.log('  ┌─────────────────────────────────────────────┐')
    console.log('  │  作品工作室已启动                           │')
    console.log('  └─────────────────────────────────────────────┘')
    console.log('')
    console.log('  地址：' + url)
    console.log('  源图：' + path.relative(ROOT, SRC_DIR))
    console.log('  Python：' + (PYTHON ? PYTHON.info : '未找到带 Pillow 的解释器'))
    console.log('')
    console.log('  在浏览器里调整分组，点「生成」即可上架。Ctrl+C 退出。')
    console.log('')

    if (!process.argv.includes('--no-open')) openBrowser(url)
  })
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
      ? ['open', [url]]
      : ['xdg-open', [url]]
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref()
  } catch (e) {
    /* 打不开就让用户手动点 */
  }
}

// ── 入口 ────────────────────────────────────────────────────
function main() {
  if (!exists(UI_FILE)) {
    console.error('缺少界面文件：' + UI_FILE)
    process.exit(1)
  }
  if (!exists(SRC_DIR)) {
    console.error('缺少源图目录：' + SRC_DIR)
    process.exit(1)
  }

  console.log('检查 Python（压缩需要 Pillow）…')
  PYTHON = detectPython()
  if (!PYTHON) {
    console.error('✗ 没找到带 Pillow 的 Python')
    console.error('  请先执行：pip install Pillow')
    console.error('  或用环境变量指定：STUDIO_PYTHON=<python路径> node scripts/studio.js')
    process.exit(1)
  }

  console.log('生成缩略图…')
  runThumbs(false)

  const portArg = process.argv.indexOf('--port')
  const port = portArg > -1 ? Number(process.argv[portArg + 1]) || 7788 : 7788
  serve(port)
}

main()
