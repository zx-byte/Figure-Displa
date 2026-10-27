// config/works.js
// 作品数据。本文件由 scripts/import-works.js 自动生成，请勿手工编辑。
//
// 数据来源与重新生成方式：
//   1. 作品图按「作品名-01.jpg」命名，放进  作品原图/红糖/_规范/
//   2. 压缩          python scripts/compress-images.py 作品原图/红糖/_规范 --width 640 --quality 68
//   3. 生成商品数据  node scripts/import-works.js
//
// 作品的价格、题材、描述等元信息在 作品原图/红糖/作品信息.json 中维护，
// 键名与图片文件名前缀一致（如「白老板-01.jpg」对应键「白老板」），
// 展示顺序由该文件里的 order 字段控制。

const WORKS = [
  {
    "_id": "w01",
    "name": "蓝发少年",
    "subtitle": "水手短打 · 全手工",
    "price": 0,
    "originPrice": 0,
    "stock": 1,
    "soldCount": 0,
    "type": 0,
    "category": {
      "series": "粘土手办",
      "ip": "原创",
      "scale": "",
      "priceRange": ""
    },
    "cover": "/images/works/蓝发少年-01.jpg",
    "images": [
      "/images/works/蓝发少年-01.jpg",
      "/images/works/蓝发少年-02.jpg",
      "/images/works/蓝发少年-03.jpg",
      "/images/works/蓝发少年-04.jpg",
      "/images/works/蓝发少年-05.jpg",
      "/images/works/蓝发少年-06.jpg",
      "/images/works/蓝发少年-07.jpg"
    ],
    "detail": [
      {
        "type": "text",
        "value": "原创角色蓝发少年，贝雷帽配白蓝水手短上衣，黑色网纱内衬与长手套逐片裁制。"
      },
      {
        "type": "text",
        "value": "黑短裤配蓝色腰带与金属扣，大腿绑带、系带长靴均为可拆卸分件。"
      },
      {
        "type": "text",
        "value": "面部多层薄涂上妆，眼部高光手绘；从光头塑形到服装完成全程记录。"
      }
    ],
    "specs": [],
    "limitNum": 0,
    "presaleDate": "",
    "dimension": null,
    "sort": 900,
    "createTime": new Date("2026-10-27T11:30:50.734Z")
  },
  {
    "_id": "w02",
    "name": "敖丙",
    "subtitle": "盘坐 · 龙角广袖",
    "price": 0,
    "originPrice": 0,
    "stock": 1,
    "soldCount": 0,
    "type": 0,
    "category": {
      "series": "粘土手办",
      "ip": "哪吒之魔童降世",
      "scale": "",
      "priceRange": ""
    },
    "cover": "/images/works/敖丙-01.jpg",
    "images": [
      "/images/works/敖丙-01.jpg",
      "/images/works/敖丙-02.jpg",
      "/images/works/敖丙-03.jpg"
    ],
    "detail": [
      {
        "type": "text",
        "value": "《哪吒之魔童降世》敖丙，盘坐姿态，尖耳与半透明龙角为独立分件。"
      },
      {
        "type": "text",
        "value": "红色交领长袍叠穿青灰广袖，衣缘走金色描边，衣袖垂坠感经多次调整。"
      },
      {
        "type": "text",
        "value": "龙角以金属环固定于头顶，运输时可拆卸。"
      }
    ],
    "specs": [],
    "limitNum": 0,
    "presaleDate": "",
    "dimension": null,
    "sort": 899,
    "createTime": new Date("2026-10-27T11:29:50.734Z")
  },
  {
    "_id": "w03",
    "name": "龙首",
    "subtitle": "原创龙首 · 原型雕塑",
    "price": 0,
    "originPrice": 0,
    "stock": 1,
    "soldCount": 0,
    "type": 0,
    "category": {
      "series": "粘土手办",
      "ip": "原创",
      "scale": "",
      "priceRange": ""
    },
    "cover": "/images/works/龙首-01.jpg",
    "images": [
      "/images/works/龙首-01.jpg"
    ],
    "detail": [
      {
        "type": "text",
        "value": "原创龙首灰塑原型，鬃须与棱角逐片堆叠塑形。"
      },
      {
        "type": "text",
        "value": "灰模保留塑形刀痕，翻模后可做不同配色。"
      }
    ],
    "specs": [],
    "limitNum": 0,
    "presaleDate": "",
    "dimension": null,
    "sort": 898,
    "createTime": new Date("2026-10-27T11:28:50.734Z")
  },
  {
    "_id": "w04",
    "name": "古风头像",
    "subtitle": "黑发男像 · 额间朱砂",
    "price": 0,
    "originPrice": 0,
    "stock": 1,
    "soldCount": 0,
    "type": 0,
    "category": {
      "series": "粘土手办",
      "ip": "原创",
      "scale": "",
      "priceRange": ""
    },
    "cover": "/images/works/古风头像-01.jpg",
    "images": [
      "/images/works/古风头像-01.jpg"
    ],
    "detail": [
      {
        "type": "text",
        "value": "古风男像头部，黑发逐缕塑形，发尾做自然弯弧。"
      },
      {
        "type": "text",
        "value": "额间朱砂点与眼尾晕染均为手绘。"
      }
    ],
    "specs": [],
    "limitNum": 0,
    "presaleDate": "",
    "dimension": null,
    "sort": 897,
    "createTime": new Date("2026-10-27T11:27:50.734Z")
  }
]

module.exports = { WORKS }
