# 项目长期笔记 — Figure-Displa

## 项目定位
微信小程序「拾光手办」（正式名称，2026-10-26 定稿；立项文档中曾用暂名「自制手办商城」），面向个人手作工作室的原生商城（现货 / 限量预售 / 定制预约三业务线）。
技术栈强制：WXML + WXSS + JavaScript 原生，后端微信云开发（云函数 + 云数据库 + 云存储），不引入任何第三方框架。

## 品牌信息
- 名称：拾光手办（8/30 字符）
- 简称：拾光（4/10，备选「拾光手办」8/10）
- 主色：品牌橙 `#FF5C39`；辅助墨黑 `#1A1A24`；金色 `#C9A227` 仅用于限量标识
- 头像：`docs/brand/avatar-final-a.png`（墨黑底 + 白色「拾」字，144×144；旧版图形方案已归档至 `docs/brand/archive/`）

## 目录约定
- `docs/` — 交付文档（需求分析、计划书、成本分析）
- `miniprogram/` — 小程序前端（26 页面 / 7 组件 / utils / config）
- `cloudfunctions/` — 云函数 11 个（login/product/order/pay/custom/address/favorite/admin/stats/security + initdb）
- `scripts/` — 自检脚本：check-wxml.js（结构）、check-api.js（接口一致性），改动后应复跑
- `output/<request_id>/` — 文档产线中间产物；`logs/` — 流水线日志（两者可删）
- `.workbuddy/memory/` — 工作日志（append-only）

## 云函数环境变量（部署必配）
- `ADMIN_OPENIDS` → login、admin、stats（三处必须一致）
- `ADMIN_PASSWORD` → admin
- `ADMIN_SECRET` → admin、stats（两处必须一致，用于令牌签名）
- `PAY_SUB_MCH_ID` → pay
- `INIT_TOKEN` → initdb（初始化后删除该函数）

## 已定口径（后续代码生成须遵循）
- 数据库 4 集合：products / orders / users / customOrders
- 云函数 9 个：login / product / order / pay / custom / address / favorite / admin / stats
- 金额一律以「分」为整数存储，渲染时除 100
- 用户身份只从 `cloud.getWXContext()` 取，云端不信任前端传入的 userId
- 管理员 = openid 白名单 + 管理口令双因子，在云函数内判定
- 购物车走本地存储，不进云数据库，结算时服务端重算校验
- 支付三重保障：下单前服务端重算金额 / 回调幂等（orderNo + transactionId）/ 前端主动查单兜底
- 样式单位 rpx，基准宽度 750rpx；变量与函数小驼峰，页面目录小写英文加中划线
- 协议同意状态存版本号（`PRIVACY_VERSION`）而非布尔，条款实质变更时递增即强制重弹；拒绝只降级提示不强制退出
- 内容安全：明确违规（suggest=risky / 87014）必拒；接口不可用（-604101 / -1 / 超时）放行并记日志，不阻塞业务
- 售后子状态挂 `orders.afterSale.status`（PENDING/REFUNDING/REFUNDED/REJECTED/CLOSED），主状态 status=4 只表达「进入售后」，二者解耦
- **退款只在 admin 云函数内做**（`handleAfterSale` + `doRefund` 调 `cloud.cloudPay.refund`），因云函数互调不透传 openid、pay 无法二次校验操作者，admin 有双因子鉴权最稳妥
- 外部依赖（物流轨迹/订阅消息/真实小程序码/缩略图）一律「代码路径写全 + 配置门控 + 优雅降级」，配置好即自动生效，未配置不弹错不阻塞
- **形态基线：纯展示**（2026-10-26 用户定）——`MODULE_SWITCH.trade=false`、`SHOW_TRADE=false`、tabBar 3 项（首页/全部作品/我的）。未经用户明确授权不得切回 `trade:true`；恢复完整电商需同步 tabBar 加购物车（4 项）并跑 `node scripts/check-modules.js`

## 三个业务陷阱（已写入需求文档，编码时必须体现）
1. 定金性质须页面明示 + 支付前二次确认
2. 限量编号与库存强绑定，写入订单商品快照 limitNo
3. 定制单支持「报价未定」状态，尾款入口按状态显隐

## 作品数据（红糖作品集，2026-10-27 定）
- 来源：小红书博主「红糖」主页（已获授权），用户手动下载到 `作品原图/红糖/`
- 规模：130 张原图 → 归组为 **27 件作品**，规范命名副本在 `作品原图/红糖/_规范/`（`作品名-01.jpg`）
- 流水线：`python scripts/compress-images.py 作品原图/红糖/_规范 --width 460 --quality 64` → `node scripts/import-works.js` → `miniprogram/config/works.js`
- 元信息在 `作品原图/红糖/作品信息.json`，`works` 键名须与文件名前缀一致，`order` 字段控制展示顺序
- **主包图片硬上限约 42 张**：非图片部分 866KB，可用 1.13MB，460px/q64 约 26KB/张。
  当前 39 张（27 封面 + 12 重点各加 1 张）= 1.03MB，主包 1.94MB。全量 130 张必须走云存储
- 小红书下载文件名不可信：`_N_` 是笔记内第几张、括号是重名副本、无标题笔记 35 张全无名，
  同一作品的图会跨不同笔记标题 → 归组只能靠看图（拼 contact sheet 一次看 35 张）
- `mock.js`：`PRODUCTS = WORKS.length ? WORKS : DEMO_PRODUCTS`，有真实作品时不混入虚构演示商品

## 作品工作室（2026-10-27 定，上传作品的唯一入口）
`node scripts/studio.js` 或双击 `启动作品工作室.bat` → 浏览器操作 → 点「生成并上架」。
用户明确要求「简单的方式」，后续任何作品增删改都走这个界面，不要再让他手改文件名或 JSON。

- **分组真相源**：`作品原图/红糖/_分组记录.json`（`works[作品名] = {order, files[], picked[]}`）。
  `files` 按展示顺序，第一张是封面；`picked` 是进主包的图，**只记用户真实勾选**。
- **云存储模式**只在压缩时忽略 `picked`，绝不把它改写成全量——
  否则切回本地会误压全部图、主包直接 4.22MB 超限。
- **删除一律交给 `scripts/prune-dir.py`（Python）**：Node 的 `unlinkSync` 在本机偶发 EBUSY，
  刚写完的图片尤其明显，重试也救不回来；`fs.rmSync(recursive)` 会触发批量删除保护（>50 文件）。
- `compress-images.py --only <清单>` 支持只压清单里的图，挑图不再需要复制临时目录。
- 跳过 `.` 开头文件：曾把 `miniprogram/images/works/.gitkeep` 误删。
- 小红书文件名可提取笔记标题（`{标题}_{序号}_{博主}_来自小红书`）做预分组，无标题的落「未分组」。
- `.bat` 必须 GBK 编码 + CRLF（`.gitattributes` 已固化 `*.bat eol=crlf`）。
- 生成耗时约 29s（首次）/ 7s（幂等重跑），主包稳定 1.94MB。

## 文档风格偏好
- 正式、第三人称、结论先行
- 结构化表格承载对比与字段清单
- 成本类数据标注测算口径，写区间而非单点
