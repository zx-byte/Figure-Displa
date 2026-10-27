// scripts/build-works.js
// 作品构建：一条命令把原图变成「主包缩略图 + 分包大图 + 数据文件」。
//
// ── 为什么要分两套图 ──────────────────────────────────────
// 微信小程序主包只有 2MB。130 张作品图哪怕压到 460px 也要 3.4MB，
// 根本塞不下，只能靠挑图，详情页永远只有一张图。
//
// 分包单独有 2MB，且不占主包空间。所以把详情页和大图整体搬进分包：
//
//   主包  miniprogram/images/works-thumb/              480px WebP，列表封面
//   分包  miniprogram/subpackages/works/images/       1000px WebP，详情大图
//
// 主包从此只放代码和缩略图，作品加多少都不挤主包。
//
// ── 装箱策略 ──────────────────────────────────────────────
// 分包 2MB 减掉详情页四件套，剩约 1900KB 给图片。
// 每件作品先保一张封面图，剩下的预算按顺序轮流补给第二张、第三张……
// 放不下就停，所以作品多时自动退化为「每件一张」，不会爆包。
//
// ── 用法 ──────────────────────────────────────────────────
//   node scripts/build-works.js
//   node scripts/build-works.js --budget 1800        # 分包图片预算（KB）
//   node scripts/build-works.js --detail 1200 --detail-q 80
//   node scripts/build-works.js --no-thumb           # 不做缩略图，封面直接指向分包图
//
// 产物：
//   miniprogram/images/works-thumb/*.webp
//   miniprogram/subpackages/works/images/*.webp
//   miniprogram/config/works.js
//   output/_pool/            全量详情图暂存（可删，用于快速重跑）

const fs = require('fs')
const path = require('path')

const { detectPython, runPython } = require('./lib/py')

const ROOT = path.resolve(__dirname, '..')
const MP = path.join(ROOT, 'miniprogram')

const SRC_DIR = path.join(ROOT, '作品原图', '红糖', '_规范')
const GROUP_FILE = path.join(ROOT, '作品原图', '红糖', '_分组记录.json')
const META_FILE = path.join(ROOT, '作品原图', '红糖', '作品信息.json')

const OUT_DIR = path.join(ROOT, 'output')
const POOL_DIR = path.join(OUT_DIR, '_pool')
const THUMB_DIR = path.join(MP, 'images', 'works-thumb')
const DETAIL_DIR = path.join(MP, 'subpackages', 'works', 'images')

const COMPRESS_PY = path.join(__dirname, 'compress-images.py')
const PRUNE_PY = path.join(__dirname, 'prune-dir.py')
const IMPORT_JS = path.join(__dirname, 'import-works.js')

/** 主包：列表卡片宽度约 345rpx，480px 在 2 倍屏上仍是 1:1 */
const THUMB = { width: 480, quality: 74 }

/** 分包：详情页整屏 750rpx，1000px 在 3 倍屏上 0.85 倍率，肉眼无损 */
const DETAIL = { width: 1000, quality: 78 }

/** 分包 2048KB，减详情页四件套约 60KB，再留 88KB 安全垫 */
const DEFAULT_BUDGET_KB = 1900

const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

// ── 参数 ────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    budget: DEFAULT_BUDGET_KB,
    detailWidth: DETAIL.width,
    detailQuality: DETAIL.quality,
    thumbWidth: THUMB.width,
    thumbQuality: THUMB.quality,
    useThumb: true,
    skipImport: false
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--budget' && argv[i + 1]) {
      args.budget = Number(argv[++i])
    } else if (a === '--detail' && argv[i + 1]) {
      args.detailWidth = Number(argv[++i])
    } else if (a === '--detail-q' && argv[i + 1]) {
      args.detailQuality = Number(argv[++i])
    } else if (a === '--thumb' && argv[i + 1]) {
      args.thumbWidth = Number(argv[++i])
    } else if (a === '--thumb-q' && argv[i + 1]) {
      args.thumbQuality = Number(argv[++i])
    } else if (a === '--no-thumb') {
      args.useThumb = false
    } else if (a === '--no-import') {
      args.skipImport = true
    }
  }
  return args
}

// ── 小工具 ──────────────────────────────────────────────────

function human(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  return Math.round(bytes / 1024) + ' KB'
}

/** 递归统计目录字节数（含子目录，跳过 .spec 这类点开头的元文件） */
function dirBytes(dir) {
  if (!fs.existsSync(dir)) return 0
  let total = 0
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) total += dirBytes(p)
    else total += st.size
  }
  return total
}

function writeLines(file, lines) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, lines.join('\n'), 'utf8')
}

/** 用 prune-dir.py 把目录对齐到清单（Node 的 unlink 在本机偶发 EBUSY） */
function pruneDir(dir, keepNames) {
  fs.mkdirSync(dir, { recursive: true })
  const listFile = path.join(OUT_DIR, '_prune.txt')
  writeLines(listFile, keepNames)
  const r = runPython(PRUNE_PY, [dir, listFile])
  const m = /REMOVED (\d+)/.exec(r.stdout || '')
  return m ? Number(m[1]) : 0
}

// ── 读取作品列表 ────────────────────────────────────────────

/**
 * 从分组记录还原作品清单。
 *
 * 规范文件名按「作品名-序号.jpg」生成，序号与该作品在 files 里的位置一致。
 * candidates 是详情图的候选顺序：勾选过就按勾选顺序，没勾选就按文件顺序。
 * 封面固定用 files[0]（工作室里「设为封面」会调整 files 的顺序）。
 */
function readWorks() {
  if (!fs.existsSync(GROUP_FILE)) {
    console.error('✗ 找不到分组记录：' + path.relative(ROOT, GROUP_FILE))
    console.error('  先用工作室建一次分组：node scripts/studio.js')
    process.exit(1)
  }

  const rec = JSON.parse(fs.readFileSync(GROUP_FILE, 'utf8'))
  const meta = fs.existsSync(META_FILE) ? JSON.parse(fs.readFileSync(META_FILE, 'utf8')) : {}

  const list = Object.keys(rec.works || {}).map((key) => {
    const w = rec.works[key]
    const raw = w.files || []
    const files = raw.map((_, i) => `${key}-${String(i + 1).padStart(2, '0')}.jpg`)

    const pickedIdx = (w.picked || []).map((f) => raw.indexOf(f)).filter((i) => i >= 0)
    const order = pickedIdx.length ? pickedIdx : raw.map((_, i) => i)
    const candidates = order.map((i) => files[i])

    const m = (meta.works || {})[key]
    return { key, files, candidates, order: m ? Number(m.order) || 9999 : 9999 }
  })

  return list.filter((w) => w.files.length).sort((a, b) => a.order - b.order)
}

// ── 压缩 ────────────────────────────────────────────────────

/**
 * 调压缩脚本，返回压缩后的总字节数。
 *
 * 带缓存：.spec 记录上次用的规格，规格没变且产物比源图新就跳过。
 * 反复构建时（工作室每点一次生成）能省掉大部分时间。
 */
function compressTo(outDir, names, width, quality, label) {
  if (!names.length) return 0
  fs.mkdirSync(outDir, { recursive: true })

  const spec = `${width}x${quality}`
  const specFile = path.join(outDir, '.spec')
  const sameSpec = fs.existsSync(specFile) && fs.readFileSync(specFile, 'utf8').trim() === spec

  const todo = sameSpec
    ? names.filter((n) => {
        const out = path.join(outDir, n.replace(/\.[^.]+$/, '.webp'))
        if (!fs.existsSync(out)) return true
        const src = path.join(SRC_DIR, n)
        return !fs.existsSync(src) || fs.statSync(out).mtimeMs < fs.statSync(src).mtimeMs
      })
    : names

  if (!todo.length) {
    console.log('      全部命中缓存，跳过压缩')
    return dirBytes(outDir)
  }

  const listFile = path.join(OUT_DIR, '_only.txt')
  writeLines(listFile, todo)

  const r = runPython(COMPRESS_PY, [
    SRC_DIR,
    '--only', listFile,
    '--width', String(width),
    '--quality', String(quality),
    '--format', 'webp',
    '--out', outDir,
    '--budget', '99999'
  ])
  if (r.status !== 0) {
    throw new Error(`${label}压缩失败：\n${(r.stderr || r.stdout || '').slice(-1500)}`)
  }

  fs.writeFileSync(specFile, spec, 'utf8')
  return dirBytes(outDir)
}

// ── 装箱 ────────────────────────────────────────────────────

/**
 * 按体积预算决定每件作品放几张详情图。
 * 每件先保一张封面，剩余预算按勾选顺序轮流补给，超预算即停。
 */
function packWorks(works, budgetBytes) {
  const sizeOf = (name) => {
    const p = path.join(POOL_DIR, name.replace(/\.jpg$/, '.webp'))
    return fs.existsSync(p) ? fs.statSync(p).size : 0
  }

  // 封面必定进包：列表卡片和详情首页都要它
  const picked = works.map((w) => [w.files[0]])
  let used = picked.reduce((sum, arr) => sum + sizeOf(arr[0]), 0)
  const coversBytes = used

  if (used > budgetBytes) {
    throw new Error(
      `连每件作品一张封面都放不下：${human(used)} > 预算 ${human(budgetBytes)}。\n` +
        `  减作品数量，或降规格重试：node scripts/build-works.js --detail 800 --detail-q 74`
    )
  }

  // 按勾选顺序逐轮补图：第一轮先放各自的第二张，第二轮第三张……
  // 用「候选序列最长的那件」决定轮数，不能靠「本轮有没有加进去」判断——
  // 首轮全部因封面已存在而被跳过时，会被误判成没有进展而提前退出。
  const maxRounds = works.reduce((m, w) => Math.max(m, w.candidates.length), 0)
  for (let round = 0; round < maxRounds; round++) {
    for (let i = 0; i < works.length; i++) {
      const next = works[i].candidates[round]
      if (!next || picked[i].includes(next)) continue
      const sz = sizeOf(next)
      if (used + sz > budgetBytes) continue
      picked[i].push(next)
      used += sz
    }
  }

  return { picked, used, coversBytes }
}

// ── 主流程 ──────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2))
  const py = detectPython()
  if (!py) {
    console.error('✗ 没找到带 Pillow 的 Python，无法压缩图片。')
    console.error('  安装：pip install Pillow')
    console.error('  或指定：STUDIO_PYTHON=<python路径> node scripts/build-works.js')
    process.exit(1)
  }

  console.log('=== 作品构建 ===')
  console.log('Python   ：' + py.cmd + '（' + py.info + '）')

  const works = readWorks()
  const allFiles = works.reduce((s, w) => s.concat(w.files), [])
  console.log('作品     ：' + works.length + ' 件 / ' + allFiles.length + ' 张原图')
  console.log('')

  // 1. 全量压到暂存池：需要知道每张的真实体积才能装箱
  console.log('[1/5] 压缩全量详情图到暂存池（' + args.detailWidth + 'px / q' + args.detailQuality + '）…')
  const poolBytes = compressTo(POOL_DIR, allFiles, args.detailWidth, args.detailQuality, '详情图')
  console.log('      ' + allFiles.length + ' 张，合计 ' + human(poolBytes))

  // 2. 按预算装箱
  console.log('')
  console.log('[2/5] 按分包预算装箱（' + args.budget + ' KB）…')
  const { picked, used, coversBytes } = packWorks(works, args.budget * 1024)
  const totalPicked = picked.reduce((s, a) => s + a.length, 0)
  const extra = totalPicked - works.length
  console.log('      每件 1 张封面 ' + human(coversBytes) + '，另加 ' + extra + ' 张，合计 ' + human(used))
  console.log('      已用预算 ' + ((used / (args.budget * 1024)) * 100).toFixed(0) + '%，余 ' + human(args.budget * 1024 - used))

  // 3. 部署详情图到分包
  console.log('')
  console.log('[3/5] 部署详情图到分包…')
  const detailNames = []
  works.forEach((w, i) => {
    for (const f of picked[i]) {
      const name = f.replace(/\.jpg$/, '.webp')
      const from = path.join(POOL_DIR, name)
      const to = path.join(DETAIL_DIR, name)
      fs.mkdirSync(DETAIL_DIR, { recursive: true })
      fs.copyFileSync(from, to)
      detailNames.push(name)
    }
  })
  const removedDetail = pruneDir(DETAIL_DIR, detailNames)
  console.log('      写入 ' + detailNames.length + ' 张，清理旧图 ' + removedDetail + ' 张')

  // 4. 主包缩略图
  let thumbNote = '未启用（cover 直接指向分包图，主包页面会加载失败）'
  if (args.useThumb) {
    console.log('')
    console.log('[4/5] 生成列表缩略图到主包（' + args.thumbWidth + 'px / q' + args.thumbQuality + '）…')
    const covers = works.map((w) => w.files[0])
    const bytes = compressTo(THUMB_DIR, covers, args.thumbWidth, args.thumbQuality, '缩略图')
    const removedThumb = pruneDir(THUMB_DIR, covers.map((f) => f.replace(/\.jpg$/, '.webp')))
    console.log('      ' + covers.length + ' 张，合计 ' + human(bytes) + '，清理旧图 ' + removedThumb + ' 张')
    thumbNote = human(bytes)
  }

  // 5. 生成数据
  console.log('')
  console.log('[5/5] 生成作品数据…')
  if (args.skipImport) {
    console.log('      已跳过（--no-import）')
  } else {
    const { spawnSync } = require('child_process')
    const importArgs = [IMPORT_JS]
    if (!args.useThumb) importArgs.push('--thumb', '')
    const r = spawnSync(process.execPath, importArgs, { encoding: 'utf8', stdio: 'inherit' })
    if (r.status !== 0) throw new Error('数据生成失败')
  }

  // ── 体积报告 ──
  // 主包 = miniprogram 全体减去 subpackages（分包不计入主包上限）
  const subRoot = path.join(MP, 'subpackages')
  const mainBytes = dirBytes(MP) - dirBytes(subRoot)
  const subBytes = dirBytes(path.join(subRoot, 'works'))
  const MAIN_LIMIT = 2 * 1024 * 1024
  const SUB_LIMIT = 2 * 1024 * 1024

  const bar = (used, limit) => {
    const pct = (used / limit) * 100
    return pct.toFixed(0) + '%'
  }

  console.log('')
  console.log('=== 包体积 ===')
  console.log(
    '  主包      ' + human(mainBytes).padStart(9) + ' / 2 MB   ' + bar(mainBytes, MAIN_LIMIT).padStart(4) +
      '   余 ' + human(MAIN_LIMIT - mainBytes)
  )
  console.log(
    '  分包 works ' + human(subBytes).padStart(9) + ' / 2 MB   ' + bar(subBytes, SUB_LIMIT).padStart(4) +
      '   余 ' + human(SUB_LIMIT - subBytes)
  )
  console.log('  其中缩略图 ' + String(thumbNote).padStart(9) + '（主包）')
  console.log('      详情图 ' + human(dirBytes(DETAIL_DIR)).padStart(9) + '（分包）')

  const bad = []
  if (mainBytes > MAIN_LIMIT) bad.push('主包超出 2MB')
  if (subBytes > SUB_LIMIT) bad.push('分包超出 2MB')
  if (bad.length) {
    console.log('')
    console.log('✗ ' + bad.join('；'))
    console.log('  降规格重试：node scripts/build-works.js --detail 900 --detail-q 74')
    process.exit(1)
  }

  console.log('')
  console.log('✓ 构建完成。重新编译小程序即可看到（Ctrl+B）。')
}

try {
  main()
} catch (err) {
  console.error('')
  console.error('✗ ' + err.message)
  process.exit(1)
}
