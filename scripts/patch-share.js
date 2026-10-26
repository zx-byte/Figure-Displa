// scripts/patch-share.js
// 批量给页面补上转发能力。
//
// 小程序的转发默认关闭，页面不实现 onShareAppMessage 时，
// 右上角菜单的「转发」是灰的。这里统一在页面末尾插入实现。
//
// 已是分享实现或已有同名方法的文件会被跳过。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/** 页面 → 分享类型 */
const TARGETS = [
  // 商品相关：用商品信息做卡片
  { file: 'miniprogram/pages/detail/detail.js', kind: 'product' },
  // 其余：用默认分享
  { file: 'miniprogram/pages/index/index.js', kind: 'default' },
  { file: 'miniprogram/pages/category/category.js', kind: 'default' },
  { file: 'miniprogram/pages/user/user.js', kind: 'default' },
  { file: 'miniprogram/pages/favorite/favorite.js', kind: 'default' },
  { file: 'miniprogram/pages/about/about.js', kind: 'default' },
  { file: 'miniprogram/pages/verify/verify.js', kind: 'default' },
  { file: 'miniprogram/pages/history/history.js', kind: 'default' }
];

const SNIPPETS = {
  product: `
  /** 转发给朋友 */
  onShareAppMessage() {
    return share.productShare(this.data.detail, 'detail')
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return share.timelineShare(this.data.detail)
  },
`,
  default: `
  /** 转发给朋友 */
  onShareAppMessage() {
    return share.defaultShare()
  },

  /** 分享到朋友圈 */
  onShareTimeline() {
    return share.timelineShare()
  },
`
};

function ensureRequire(code) {
  if (/require\(['"][^'"]*utils\/share['"]\)/.test(code)) return code;
  // 插到最后一个 require 之后
  const lines = code.split('\n');
  let lastRequire = -1;
  lines.forEach((l, i) => {
    if (/^\s*(const|let|var)\s.+\s*=\s*require\(/.test(l)) lastRequire = i;
  });
  if (lastRequire === -1) {
    // 没有 require 就插在文件头注释之后
    lines.splice(1, 0, "const share = require('../../utils/share')");
  } else {
    lines.splice(lastRequire + 1, 0, "const share = require('../../utils/share')");
  }
  return lines.join('\n');
}

function patch(target) {
  const full = path.join(ROOT, target.file);
  if (!fs.existsSync(full)) return { file: target.file, status: 'skip（文件不存在）' };

  let code = fs.readFileSync(full, 'utf8');

  if (/onShareAppMessage\s*\(/.test(code)) {
    return { file: target.file, status: 'skip（已有分享实现）' };
  }

  code = ensureRequire(code);

  // 在最后一个 }) 前插入方法
  const idx = code.lastIndexOf('})');
  if (idx === -1) return { file: target.file, status: 'fail（找不到 Page 结尾）' };

  code = code.slice(0, idx) + SNIPPETS[target.kind].replace(/^\n/, '') + code.slice(idx);

  fs.writeFileSync(full, code, 'utf8');
  return { file: target.file, status: 'patched' };
}

const results = TARGETS.map(patch);
results.forEach((r) => console.log(`${r.status.padEnd(20)} ${r.file}`));
console.log('');
console.log(`共处理 ${results.length} 个，成功 ${results.filter((r) => r.status === 'patched').length} 个`);
