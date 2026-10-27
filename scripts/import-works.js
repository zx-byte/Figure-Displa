// scripts/import-works.js
// 作品导入：把压缩后的作品图整理成小程序可用的商品数据。
//
// ── 图片分离 ──────────────────────────────────────────────
// 主包只有 2MB，作品图全塞进去会挤爆。因此图片分两套、放两个位置：
//
//   列表缩略图 → miniprogram/images/works-thumb/       （主包，480px WebP）
//   详情大图   → miniprogram/subpackages/works/images/ （分包，1000px WebP）
//
// 数据里 cover 指向缩略图（主包页面可访问），images 指向分包大图
// （只有分包内的详情页可访问）。分包容量独立 2MB，与主包互不挤占。
//
// ── 三步流程 ──────────────────────────────────────────────
//   1. 作品图按「作品名-01.jpg」命名，放进 作品原图/红糖/_规范/
//   2. 压缩（一条命令生成两套）
//        node scripts/build-works.js
//   3. 生成本数据文件
//        node scripts/import-works.js
//
// ── 分组规则 ──────────────────────────────────────────────
// 文件名最后一个连字符 / 下划线 / 空格之前的部分视为作品名：
//   白老板-01.webp  白老板-02.webp  →  同一件作品「白老板」，两张图
//   散兵.webp                       →  作品「散兵」，一张图
//
// ── 元信息 ────────────────────────────────────────────────
// 价格、题材、比例、描述等写在 作品原图/红糖/作品信息.json，键名与文件名前缀一致。
// 该文件不是必需的，缺失时按默认值生成。order 字段控制展示顺序，越小越靠前。
//
// ── 产物 ──────────────────────────────────────────────────
//   miniprogram/config/works.js   小程序演示数据（mock.js 自动合并）
//   output/works-seed.json        云数据库导入用种子（正式上线时用）
//
// 用法：
//   node scripts/import-works.js
//   node scripts/import-works.js --dir 其他图片目录
//   node scripts/import-works.js --thumb ""     # 不用缩略图，cover 直接指向 images[0]

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp']

/** 元信息文件：作品说明在这里维护 */
const META_FILE = path.join(ROOT, '作品原图', '红糖', '作品信息.json')

/** 输出：小程序演示数据 */
const OUT_MODULE = path.join(ROOT, 'miniprogram', 'config', 'works.js')

/** 输出：云数据库种子 */
const OUT_SEED = path.join(ROOT, 'output', 'works-seed.json')

/** 详情大图默认路径前缀（分包内，只有分包页面能访问） */
const DETAIL_PREFIX = '/subpackages/works/images/'

/** 列表缩略图默认路径前缀（主包内，任何页面都能访问） */
const THUMB_PREFIX = '/images/works-thumb/'

/** 未在元信息里指定的字段，用这些兜底 */
const DEFAULTS = {
  type: 0, // 0 现货 / 1 限量预售 / 2 定制预约
  series: '粘土手办',
  ip: '原创',
  scale: '',
  stock: 1,
  material: '粘土'
}

function parseArgs(argv) {
  const args = {
    dir: null,
    out: null,
    prefix: DETAIL_PREFIX,
    thumb: THUMB_PREFIX,
    cloud: false
  }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir' && argv[i + 1]) {
      args.dir = argv[i + 1]
      i++
    } else if (argv[i] === '--out' && argv[i + 1]) {
      args.out = argv[i + 1]
      i++
    } else if (argv[i] === '--prefix' && argv[i + 1]) {
      args.prefix = argv[i + 1]
      i++
    } else if (argv[i] === '--thumb' && argv[i + 1] !== undefined) {
      // 传空串表示不用缩略图
      args.thumb = argv[i + 1]
      i++
    } else if (argv[i] === '--cloud') {
      // 云存储模式：图片路径写成裸文件名，运行时由 IMG_BASE 拼接
      args.cloud = true
    }
  }
  return args
}

/**
 * 从文件名提取作品键。
 * '白老板-01.jpg' → '白老板'；'散兵.jpg' → '散兵'
 */
function keyOf(filename) {
  const base = filename.slice(0, filename.lastIndexOf('.'))
  const m = /^(.*?)[-_ ]?\d{1,3}$/.exec(base)
  return (m && m[1] ? m[1] : base).trim()
}

/** 按文件名末尾数字排序，保证 01 在 02 前面 */
function orderOf(filename) {
  const base = filename.slice(0, filename.lastIndexOf('.'))
  const m = /(\d{1,3})$/.exec(base)
  return m ? Number(m[1]) : 0
}

/** 读元信息，文件不存在时返回空对象 */
function readMeta() {
  if (!fs.existsSync(META_FILE)) return {}
  try {
    const raw = fs.readFileSync(META_FILE, 'utf8')
    return JSON.parse(raw)
  } catch (err) {
    console.error(`✗ 作品信息.json 解析失败：${err.message}`)
    console.error('  请检查 JSON 格式（多余逗号、中文引号都会导致解析失败）')
    process.exit(1)
  }
}

/** 扫描图片目录，按作品分组 */
function scanImages(dir) {
  if (!fs.existsSync(dir)) return null

  const files = fs
    .readdirSync(dir)
    .filter((n) => IMG_EXTS.includes(path.extname(n).toLowerCase()))
    .sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b, 'zh'))

  const groups = new Map()
  for (const name of files) {
    const key = keyOf(name)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(name)
  }
  return groups
}

/** 生单件作品对象 */
function buildWork(key, files, index, meta, prefix, thumbPrefix) {
  const cfg = Object.assign({}, DEFAULTS, meta.defaults || {}, (meta.works || {})[key] || {})
  const images = files.map((n) => (prefix || '') + n)

  // 封面单独指向主包缩略图：列表页在主包，访问不到分包里的图。
  // 缩略图缺失时退化为详情图（主包页面会加载失败，但比数据里出现死路径好排查）。
  let cover = images[0]
  if (thumbPrefix) {
    const candidate = thumbPrefix + files[0]
    const abs = path.join(ROOT, 'miniprogram', candidate.replace(/^\/+/, ''))
    if (fs.existsSync(abs)) cover = candidate
  }

  // 详情文案：元信息里给了就用，否则按题材与比例自动拼一句
  let detail = cfg.detail
  if (!Array.isArray(detail) || detail.length === 0) {
    const bits = [cfg.series, cfg.ip, cfg.scale].filter(Boolean).join(' · ')
    detail = bits ? [`${cfg.series || '手办'}，${bits}。`, '实物拍摄，手工制作。'] : ['手工作品，实物拍摄。']
  }
  detail = detail.map((t) => (typeof t === 'string' ? { type: 'text', value: t } : t))

  return {
    _id: 'w' + String(index + 1).padStart(2, '0'),
    name: cfg.name || key,
    subtitle: cfg.subtitle || '',
    price: Math.max(0, Math.floor(Number(cfg.price) || 0)),
    originPrice: Math.max(0, Math.floor(Number(cfg.originPrice) || 0)),
    stock: Math.max(0, Math.floor(Number(cfg.stock))),
    soldCount: 0,
    type: Number(cfg.type) || 0,
    category: {
      series: cfg.series || '',
      ip: cfg.ip || '',
      scale: cfg.scale || '',
      priceRange: ''
    },
    cover,
    images,
    detail,
    specs: Array.isArray(cfg.specs) ? cfg.specs : [],
    limitNum: Number(cfg.limitNum) || 0,
    presaleDate: cfg.presaleDate || '',
    dimension: cfg.dimension || null,
    // 排序权重高，保证真实作品排在演示商品前面
    sort: 900 - index,
    createTime: new Date(Date.now() - index * 60 * 1000)
  }
}

/** 生成 works.js 模块源码 */
function renderModule(works, opt) {
  opt = opt || {}
  const cloud = !!opt.cloud

  const localHeader = `// config/works.js
// 作品数据。本文件由 scripts/build-works.js 自动生成，请勿手工编辑。
//
// 图片分两套，物理隔离：
//   cover  → /images/works-thumb/            主包，480px WebP，列表卡片用
//   images → /subpackages/works/images/      分包，1000px WebP，详情页用
//
// 主包访问不到分包里的图，所以列表必须用 cover；反过来详情页两者都能用。
//
// 作品的分组、封面、进包图片由「作品工作室」维护：
//   node scripts/studio.js
//
// 作品的价格、题材、描述等元信息在 作品原图/红糖/作品信息.json 中维护，
// 展示顺序由该文件里的 order 字段控制。

const WORKS = `

  const cloudHeader = `// config/works.js（云存储模式）
// 本文件由「作品工作室」的云存储模式生成，请勿手工编辑。
//
// 图片已输出到 output/cloud-batch/，需上传到云开发存储的 works/ 目录。
// 上传完成后把下方 IMG_BASE 改成存储里的实际前缀，形如：
//   const IMG_BASE = 'cloud://<环境ID>.<存储桶>/works/'
// 完整 fileID 可在 微信开发者工具 → 云开发 → 存储 里复制其中一张图查看。

const IMG_BASE = ''

const RAW = `

  const body = works.length
    ? JSON.stringify(works, null, 2)
        // createTime 序列化后是 ISO 字符串，小程序里按时间戳处理更稳妥
        .replace(/"createTime": "([^"]+)"/g, (_, iso) => `"createTime": new Date("${iso}")`)
    : '[]'

  if (cloud) {
    return (
      cloudHeader +
      body +
      `

const WORKS = RAW.map((w) =>
  Object.assign({}, w, {
    cover: IMG_BASE + w.cover,
    images: w.images.map((n) => IMG_BASE + n)
  })
)

module.exports = { WORKS }
`
    )
  }

  return localHeader + body + '\n\nmodule.exports = { WORKS }\n'
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const imgDir = args.dir ? path.resolve(args.dir) : path.join(ROOT, 'miniprogram', 'subpackages', 'works', 'images')
  const outModule = args.out ? path.resolve(args.out) : OUT_MODULE
  const prefix = args.cloud ? '' : args.prefix
  const thumbPrefix = args.cloud ? '' : args.thumb

  console.log('=== 作品导入 ===')
  console.log('详情图目录：' + path.relative(ROOT, imgDir))
  if (args.cloud) console.log('模式：云存储（图片路径为裸文件名，运行时拼 IMG_BASE）')
  else if (thumbPrefix) console.log('列表缩略图：' + thumbPrefix)

  const groups = scanImages(imgDir)

  if (groups === null) {
    console.log('')
    console.log('✗ 图片目录不存在：' + path.relative(ROOT, imgDir))
    console.log('  先执行：python scripts/compress-images.py 作品原图/红糖/_规范')
    process.exit(1)
  }

  if (groups.size === 0) {
    console.log('')
    console.log('⚠ 目录里没有图片，已写入空作品列表。')
    console.log('  把原图放进 作品原图/红糖/ 后，执行：')
    console.log('    python scripts/compress-images.py 作品原图/红糖/_规范')
    console.log('    node scripts/import-works.js')
    fs.writeFileSync(outModule, renderModule([]), 'utf8')
    console.log('')
    console.log('已写入：' + path.relative(ROOT, outModule) + '（空列表）')
    return
  }

  const meta = readMeta()
  const keys = Array.from(groups.keys())

  // 元信息里可以用 order 指定展示顺序（升序，越小越靠前）。
  // 没配 order 的排在后面，彼此之间保持文件名顺序。
  const orderOfKey = (k) => {
    const w = (meta.works || {})[k]
    const o = w && w.order
    return typeof o === 'number' && isFinite(o) ? o : 9999
  }
  keys.sort((a, b) => orderOfKey(a) - orderOfKey(b))

  const works = keys.map((key, i) => buildWork(key, groups.get(key), i, meta, prefix, thumbPrefix))

  // 元信息里配了但没对应图片的作品，提示出来，避免以为配好了其实是错的
  const metaKeys = Object.keys(meta.works || {})
  const orphanMeta = metaKeys.filter((k) => !keys.includes(k))
  const noMeta = keys.filter((k) => !metaKeys.includes(k))

  console.log('')
  console.log('分组结果：')
  works.forEach((w, i) => {
    const tag = noMeta.includes(keys[i]) ? '  (用默认元信息)' : ''
    console.log(`  ${w._id}  ${w.name}  ${w.images.length} 张${tag}`)
    console.log('        封面  ' + w.cover)
    w.images.forEach((p) => console.log('        详情  ' + p))
  })

  if (orphanMeta.length) {
    console.log('')
    console.log('⚠ 作品信息.json 里这些键没有对应图片（可能文件名对不上）：')
    orphanMeta.forEach((k) => console.log('    ' + k))
  }

  fs.writeFileSync(outModule, renderModule(works, { cloud: args.cloud }), 'utf8')
  if (!args.cloud) {
    fs.mkdirSync(path.dirname(OUT_SEED), { recursive: true })
    fs.writeFileSync(OUT_SEED, JSON.stringify(works, null, 2), 'utf8')
  }

  const total = works.reduce((s, w) => s + w.images.length, 0)
  console.log('')
  console.log(`✓ 共 ${works.length} 件作品 / ${total} 张图`)
  console.log('  已写入 ' + path.relative(ROOT, outModule))
  if (!args.cloud) console.log('  已写入 ' + path.relative(ROOT, OUT_SEED))
  console.log('')
  console.log('下一步：重新编译小程序，首页与「全部作品」即可看到。')
}

main()
