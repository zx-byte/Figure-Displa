// scripts/fix-share-patch.js
// 修复上一轮批量插入分享方法时漏掉的逗号。
//
// 问题：插入点在最后一个 }) 之前，前一个方法结尾是 `}` 而不是 `},`，
// 直接拼接会变成 `} /** 转发给朋友 */ onShareAppMessage() {}`，
// 解析时报 Unexpected identifier。

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const FILES = [
  'miniprogram/pages/detail/detail.js',
  'miniprogram/pages/index/index.js',
  'miniprogram/pages/category/category.js',
  'miniprogram/pages/user/user.js',
  'miniprogram/pages/favorite/favorite.js',
  'miniprogram/pages/about/about.js',
  'miniprogram/pages/verify/verify.js',
  'miniprogram/pages/history/history.js'
];

let fixed = 0;

FILES.forEach((rel) => {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) return;

  let code = fs.readFileSync(full, 'utf8');
  const before = code;

  // 在前一个方法结尾的 } 后补逗号和空行
  code = code.replace(
    /(\n\s*)\}(\s*\n\s*\/\*\* 转发给朋友 \*\/)/,
    '$1},\n$2'
  );

  // 顺带处理末尾 }) 前多出的逗号：  },\n}) →  }\n})
  code = code.replace(/,(\s*\n\}\)\s*)$/, '$1');

  if (code !== before) {
    fs.writeFileSync(full, code, 'utf8');
    fixed += 1;
    console.log('fixed  ' + rel);
  } else {
    console.log('skip   ' + rel);
  }
});

console.log('');
console.log(`共修复 ${fixed} 个文件`);
