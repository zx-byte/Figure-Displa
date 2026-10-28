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
- `ADMIN_SECRET` → admin、stats（两处必须一致）。**代码里无默认值且要求 ≥16 位**，
  漏配时 checkAuth 返回 500、verifyToken 返回 401 并提示变量名——早期写死的默认串等于公开密钥
- `PAY_SUB_MCH_ID` → pay
- `INIT_TOKEN` → initdb（初始化后删除该函数）

## 已定口径（后续代码生成须遵循）
- 数据库 4 集合：products / orders / users / customOrders
- 云函数 9 个：login / product / order / pay / custom / address / favorite / admin / stats
- 金额一律以「分」为整数存储，渲染时除 100
- 用户身份只从 `cloud.getWXContext()` 取，云端不信任前端传入的 userId
- 管理员 = openid 白名单 + 管理口令双因子，在云函数内判定
- 购物车走本地存储，不进云数据库，结算时服务端重算校验
- **收藏与浏览历史同样走本地存储**（`utils/favorite.js` / `utils/history.js`），纯展示形态不写库、不关联 openid；
  收藏字段对齐 `favorite` 云函数返回的商品摘要，切换云开发时渲染不用改。换设备即丢失是可接受的代价
- **`mock.js` 里任何「恒定返回值」都是隐患**：收藏曾因 check 恒 false / toggle 恒 true / list 恒前两件
  而整条链路假成功；新增 mock action 必须真实读写状态，不能图省事返回固定值
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
- 流水线：`node scripts/build-works.js` → 双规格压缩 + 按预算装箱 + 分包分发 + `miniprogram/config/works.js`
- 元信息在 `作品原图/红糖/作品信息.json`，`works` 键名须与文件名前缀一致，`order` 字段控制展示顺序
- 小红书下载文件名不可信：`_N_` 是笔记内第几张、括号是重名副本、无标题笔记 35 张全无名，
  同一作品的图会跨不同笔记标题 → 归组只能靠看图（拼 contact sheet 一次看 35 张）
- `mock.js`：`PRODUCTS = WORKS.length ? WORKS : DEMO_PRODUCTS`，有真实作品时不混入虚构演示商品
- **分类是固定枚举，不能随手写**：`series` = 粘土手办 / 制作记录；`ip` = 原创 / 任嘉伦 / 动漫游戏 / 制作过程。
  题材下的具体选题（剧名、游戏名）写 `ipDetail`，不进 `ip`——`ip` 一旦发散，首页入口与分类页筛选项全部失配。
  新增分类要同步三处：`constants.js` 的 `CATEGORY_DIMENSIONS`、`index.js` 的 `QUICK_ENTRIES`、作品信息.json
- 买家端筛选维度 `FILTER_DIMENSIONS` 按 `SHOW_TRADE` 裁剪（纯展示只留 series/ip），
  后台录入用不裁剪的 `CATEGORY_DIMENSIONS`，两者不要合并
- `import-works.js` 的 `createTime` 用固定基准 `BASE_TIME`（2026-01-01）而非 `Date.now()`，
  保证重复生成 works.js 字节一致，diff 里只剩真实改动

## 客服（纯展示形态的唯一转化路径，2026-10-27 定）
- 小程序客服必须是 `<button open-type="contact">`，**view + bindtap 无法拉起会话**；
  原生按钮行不通时（如空状态组件），由组件内部渲染 button，父页面只传文案
- **三件套缺一不可**：`session-from`（商家端看来源）+ `bindcontact`（埋点）+ `hover-class`（按压反馈）。
  新增客服入口照此检查，`scripts` 里没有自动校验，靠人工核对
- **无法指定客服**：`open-type="contact"` 共用同一会话池，谁先接入谁接待；`session-from` 只做来源标记，
  塞客服 ID 指定人是第三方 SaaS 做法，微信不认
- 分配只能靠 PC 客服工具 mpkf.weixin.qq.com → 设置：
  「接入与回复 → 自动接入」（多人必开，否则会话堆在待接入列表）+ 「会话分流」
  四规则优先级 重复来访 > 支付金额 > 客服权重 > 常见问题；展示形态无支付故支付金额分流无效；
  按内容分流只有「常见问题分流」（关键词命中 → 指定客服）
- 真正按按钮指定客服需微信客服 `openCustomerServiceChat`（非个人主体 + 企业微信已验证 + 同主体）
  或客服子商户 `business-id`（类目须为电商平台），当前形态均不可行，不要为此办执照
- 客服消息限制：用户每发一条最多回 5 条；48 小时内可回，超时不可主动发起
- **自动接入 ≠ 自动回复**：前者只把会话派给谁（mpkf → 设置 → 接入与回复），后者要在「自动回复」栏配欢迎语与常见问题关键词
- 三个坑：客服停留「离线」收不到提醒；手机端「客服小助手」不支持转接（只能 PC 端转）；
  用户点开客服没发消息不产生会话，商家端看不到这次来访
- `session-from` 必须带上下文：详情页 `作品·<作品名>`、列表空状态
  `搜索无结果·<关键词>` / `筛选无结果·<筛选值>`、编号查询带编号、订单带订单号
- 同页多入口用 `data-from` 区分统计口径（`detail-icon` / `detail-bar`、`user-card` / `user-menu`）
- 客服**不需要**隐私协议前置（微信接管会话，不落库）；收藏需要——detail 页收藏前查
  `app.needPrivacy()`，取消收藏不拦
- 代码查不出、必须人工在后台配的：小程序后台 → 功能 → 客服 → 添加客服人员微信号。
  没配时用户能发消息但无人收到，微信不报任何错

## 图片与代码分离（2026-10-27 定，主包 2MB 的正解）
用户明确要求「图片和代码分离 + 保证清晰度」，方案是**详情页整体移入分包**（不是复制一份）：

| 用途 | 位置 | 规格 | 占谁额度 |
| --- | --- | --- | --- |
| 列表封面 | `miniprogram/images/works-thumb/` | 480px WebP q74 ≈ 20KB | 主包 2MB |
| 详情大图 | `miniprogram/subpackages/works/images/` | 1000px WebP q78 ≈ 56KB | 分包 2MB（独立） |
| 详情页 | `miniprogram/subpackages/works/pages/detail/` | — | 分包 |

- **主包访问不到分包内的图**：列表只能用 `cover`（主包缩略图），详情页两者都能访问。
  新增主包页面时绝对不能用 `product.images`，只用 `cover`。
- 分包 `root = subpackages/works`，`name = works`；`preloadRule` 让首页/全部作品预下载分包。
- 分包预算 1900KB（2048 减详情页 41KB 再留 88KB 垫），`build-works.js` 按体积装箱：
  每件先保 1 张封面，剩余预算按勾选顺序轮流补图，放不下即停，不会爆包。
- 实测：主包 1.39MB（余 627KB）/ 分包 1.89MB（余 110KB）；34 张详情图。
  改造前主包 1.94MB 且详情图只有 460px JPEG。
- **WebP 是关键**：同画质比 JPEG 小 25~35%，所以分辨率翻倍体积还没翻天。
- 压缩有 `.spec` 缓存：规格没变且原图没动就跳过，重跑几秒完成。
- 想放更多图只有降规格（`--detail 900 --detail-q 74`）或上云存储，分包 2MB 是硬限制。

## 作品工作室（2026-10-27 定，上传作品的唯一入口）
`node scripts/studio.js` 或双击 `启动作品工作室.bat` → 浏览器操作 → 点「生成并上架」。
用户明确要求「简单的方式」，后续任何作品增删改都走这个界面，不要再让他手改文件名或 JSON。

- **分组真相源**：`作品原图/红糖/_分组记录.json`（`works[作品名] = {order, files[], picked[]}`）。
  `files` 按展示顺序，第一张是封面；`picked` 是**要展示的图**（按勾选顺序当装箱优先级）。
- **云存储模式**只在压缩时忽略 `picked`，绝不把它改写成全量——
  否则切回本地会误压全部图、主包直接 4.22MB 超限。
- 本地模式的 generate 直接调 `build-works.js`，工作室与命令行共用同一条链，避免两套逻辑漂移。
- **删除一律交给 `scripts/prune-dir.py`（Python）**：Node 的 `unlinkSync` 在本机偶发 EBUSY，
  刚写完的图片尤其明显，重试也救不回来；`fs.rmSync(recursive)` 会触发批量删除保护（>50 文件）。
- `compress-images.py --only <清单>` 支持只压清单里的图，挑图不再需要复制临时目录。
- 跳过 `.` 开头文件：曾把 `miniprogram/images/works/.gitkeep` 误删。
- 小红书文件名可提取笔记标题（`{标题}_{序号}_{博主}_来自小红书`）做预分组，无标题的落「未分组」。
- `.bat` 必须 GBK 编码 + CRLF（`.gitattributes` 已固化 `*.bat eol=crlf`）。
- 生成耗时：首次约 90s（压 130 张 1000px），缓存命中后约 10s。

## 文档风格偏好
- 正式、第三人称、结论先行
- 结构化表格承载对比与字段清单
- 成本类数据标注测算口径，写区间而非单点
