// config/works.js
// 作品数据。本文件由 scripts/import-works.js 自动生成，请勿手工编辑。
//
// 数据来源与重新生成方式：
//   1. 作品原图放进  作品原图/红糖/
//   2. 压缩          python scripts/compress-images.py 作品原图/红糖
//   3. 生成商品数据  node scripts/import-works.js
//
// 作品的价格、题材、描述等元信息在 作品原图/红糖/作品信息.json 中维护，
// 键名与图片文件名前缀一致（如「白老板-01.jpg」对应键「白老板」）。

const WORKS = []

module.exports = { WORKS }
