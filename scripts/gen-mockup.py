# -*- coding: utf-8 -*-
"""
基于现有 preview.html 生成一版包含新增功能的预览页 mockup.html。

新增内容：
  - 详情页：尺寸参考、上色前后对比（可拖动）、制作工序、同系列推荐
  - 三个新页面：关于、编号查询（可交互）、浏览历史

输出到 docs/mockup.html，避免覆盖原文件。
"""

import os
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'docs' / 'preview.html'
DST = ROOT / 'docs' / 'mockup.html'

CSS = """
/* ---------- 新增：尺寸参考 ---------- */
.cmp-sub { font-size: 10px; color: #9C9CAC; margin-top: 3px; line-height: 1.5; }
.size-chart { display: flex; align-items: flex-end; padding: 18px 0 6px; }
.size-col { flex: 1; display: flex; flex-direction: column; align-items: center; }
.size-bar-wrap { height: 126px; width: 100%; display: flex; align-items: flex-end; justify-content: center; }
.size-bar { width: 24px; border-radius: 4px 4px 0 0; background: #E4E4EC; }
.size-bar.self { width: 30px; background: linear-gradient(180deg,#FF8A5B,#FF5C39); }
.size-name { margin-top: 6px; font-size: 10px; color: #8A8A9E; }
.size-name.self { color: #FF5C39; font-weight: 600; }
.size-cm { font-size: 9px; color: #B0B0BE; margin-top: 1px; }
.size-meta { margin-top: 6px; padding-top: 8px; border-top: 1px solid #F5F5F7; font-size: 10px; color: #8A8A9E; }

/* ---------- 新增：上色前后对比 ---------- */
.cmp-wrap { background: #fff; margin-top: 6px; padding-top: 16px; }
.cmp-head { padding: 0 16px 12px; }
.cmp { position: relative; width: 100%; height: 300px; overflow: hidden; background: #1A1A24; cursor: ew-resize; user-select: none; }
.cmp-after, .cmp-before { position: absolute; left: 0; top: 0; width: 100%; height: 100%; }
.cmp-after { background: linear-gradient(150deg,#3A2A50 0%,#6B3A8F 55%,#2A1A3A 100%); }
.cmp-after::after {
  content: ''; position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%);
  width: 96px; height: 150px; border-radius: 48px 48px 14px 14px; background: rgba(255,255,255,0.2);
}
.cmp-before { width: 50%; overflow: hidden; }
.cmp-before::after {
  content: ''; position: absolute; left: 50%; top: 46%; transform: translate(-50%,-50%);
  width: 96px; height: 150px; border-radius: 48px 48px 14px 14px; background: rgba(210,210,222,0.55);
}
.cmp-before-fill { position: absolute; left: 0; top: 0; height: 100%; width: 100%; background: linear-gradient(150deg,#2A2A32 0%,#4A4A58 55%,#202028 100%); }
.cmp-line { position: absolute; top: 0; bottom: 0; width: 1px; margin-left: -0.5px; background: rgba(255,255,255,0.92); box-shadow: 0 0 10px rgba(0,0,0,0.4); }
.cmp-knob { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 38px; height: 38px; border-radius: 19px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 12px; color: #1A1A24; letter-spacing: 2px; }
.cmp-tag { position: absolute; bottom: 12px; padding: 3px 9px; border-radius: 10px; background: rgba(20,20,26,0.6); font-size: 9px; color: rgba(255,255,255,0.9); }
.cmp-tag.l { left: 12px; }
.cmp-tag.r { right: 12px; }

/* ---------- 新增：制作工序 ---------- */
.tl { margin-top: 14px; }
.tl-item { display: flex; }
.tl-axis { width: 22px; flex-shrink: 0; display: flex; flex-direction: column; align-items: center; }
.tl-dot { width: 8px; height: 8px; border-radius: 4px; background: #D9D9E0; margin-top: 5px; flex-shrink: 0; }
.tl-dot.on { background: #FF5C39; box-shadow: 0 0 0 3px rgba(255,92,57,0.14); }
.tl-line { flex: 1; width: 1px; min-height: 26px; margin-top: 4px; background: #EDEDF2; }
.tl-body { flex: 1; padding-left: 6px; padding-bottom: 16px; }
.tl-head { display: flex; justify-content: space-between; align-items: baseline; }
.tl-stage { font-size: 13px; font-weight: 600; color: #1A1A24; }
.tl-date { font-size: 9px; color: #B0B0BE; }
.tl-desc { margin-top: 3px; font-size: 11px; color: #6A6A7C; line-height: 1.55; }
.tl-meta { display: inline-block; margin-top: 4px; padding: 1px 7px; border-radius: 3px; background: #FFF0EC; font-size: 9px; color: #FF5C39; }
.tl-thumb { width: 100%; height: 66px; margin-top: 8px; border-radius: 6px; background: linear-gradient(135deg,#1A1A20,#2E2E3C); position: relative; }
.tl-thumb::after { content: ''; position: absolute; left: 12px; top: 12px; width: 3px; height: 42px; border-radius: 2px; background: #FF5C39; }

/* ---------- 新增：同系列推荐 ---------- */
.rel-block { background: #fff; margin-top: 6px; padding: 14px 0 14px 16px; }
.rel-head { display: flex; align-items: center; justify-content: space-between; padding-right: 16px; }
.rel-head-left { display: flex; align-items: center; }
.sec-bar { width: 2px; height: 14px; border-radius: 1px; background: #FF5C39; margin-right: 6px; }
.rel-title { font-size: 14px; font-weight: 600; color: #1A1A24; }
.rel-more { font-size: 10px; color: #8A8A9E; }
.rel-row { display: flex; margin-top: 10px; overflow-x: auto; }
.rel-row::-webkit-scrollbar { display: none; }
.rel-item { width: 100px; margin-right: 8px; flex-shrink: 0; }
.rel-img { width: 100px; height: 100px; border-radius: 6px; }
.rel-name { margin-top: 5px; font-size: 11px; color: #1A1A24; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rel-price { margin-top: 2px; font-size: 12px; font-weight: 600; color: #FF5C39; }

/* ---------- 新增：关于页 ---------- */
.about-hero { position: relative; height: 200px; background: linear-gradient(150deg,#1A1A24 0%,#33334A 60%,#1A1A24 100%); overflow: hidden; }
.about-hero::after { content: ''; position: absolute; right: -40px; top: -30px; width: 160px; height: 160px; border-radius: 80px; background: rgba(255,92,57,0.12); }
.about-hero-text { position: absolute; left: 20px; right: 20px; bottom: 26px; z-index: 2; }
.about-hero-title { font-size: 21px; font-weight: 600; color: #fff; letter-spacing: 1px; }
.about-hero-sub { margin-top: 7px; font-size: 11px; color: rgba(255,255,255,0.6); line-height: 1.6; }
.about-stats { display: flex; margin: -18px 12px 0; padding: 18px 0; border-radius: 10px; background: #fff; box-shadow: 0 4px 14px rgba(26,26,36,0.06); position: relative; z-index: 3; }
.about-stat { flex: 1; text-align: center; }
.about-stat + .about-stat { border-left: 1px solid #F0F0F4; }
.about-num { font-size: 22px; font-weight: 600; color: #1A1A24; }
.about-unit { font-size: 11px; color: #FF5C39; margin-left: 1px; }
.about-label { margin-top: 6px; font-size: 10px; color: #8A8A9E; }
.about-block { margin: 16px 12px 0; padding: 18px 16px; border-radius: 10px; background: #fff; }
.about-bt { font-size: 15px; font-weight: 600; color: #1A1A24; margin-bottom: 10px; padding-left: 9px; position: relative; }
.about-bt::before { content: ''; position: absolute; left: 0; top: 3px; width: 2px; height: 13px; border-radius: 1px; background: #FF5C39; }
.about-p { font-size: 12px; line-height: 1.85; color: #4A4A5C; text-align: justify; }
.about-p + .about-p { margin-top: 10px; }
.about-tip { margin: 8px 16px 0; font-size: 11px; color: #9C9CAC; line-height: 1.8; }
.about-btn { margin: 24px 12px 0; height: 46px; line-height: 46px; border-radius: 23px; background: #FF5C39; color: #fff; font-size: 14px; text-align: center; }
.about-footer { margin-top: 28px; text-align: center; }
.about-brand { font-size: 12px; color: #8A8A9E; letter-spacing: 2px; }
.about-brand-sub { margin-top: 4px; font-size: 9px; color: #C4C4CE; letter-spacing: 2px; }

/* ---------- 新增：编号查询 ---------- */
.v-head { padding: 24px; }
.v-title { font-size: 22px; font-weight: 600; color: #1A1A24; letter-spacing: 1px; }
.v-sub { margin-top: 8px; font-size: 11px; color: #8A8A9E; line-height: 1.6; }
.v-panel { margin: 0 12px; padding: 16px; border-radius: 10px; background: #fff; }
.v-row { display: flex; align-items: center; }
.v-input { flex: 1; height: 44px; padding: 0 12px; border-radius: 6px; background: #F5F5F8; border: none; outline: none; font-size: 15px; color: #1A1A24; letter-spacing: 1px; font-family: inherit; }
.v-input::placeholder { color: #C0C0CC; letter-spacing: 1px; }
.v-btn { width: 70px; height: 44px; margin-left: 8px; border-radius: 6px; background: #FF5C39; color: #fff; font-size: 13px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.v-hint { margin-top: 9px; font-size: 10px; color: #A8A8B8; text-align: center; }
.v-res { margin: 14px 12px 0; padding: 24px 18px 18px; border-radius: 10px; background: #fff; text-align: center; }
.v-badge { width: 48px; height: 48px; margin: 0 auto; border-radius: 24px; font-size: 23px; line-height: 48px; color: #fff; }
.v-badge.ok { background: #FF5C39; box-shadow: 0 4px 12px rgba(255,92,57,0.28); }
.v-badge.fail { background: #B0B0BE; }
.v-rt { margin-top: 12px; font-size: 16px; font-weight: 600; color: #1A1A24; }
.v-rs { margin-top: 6px; font-size: 11px; color: #8A8A9E; line-height: 1.6; }
.v-detail { margin-top: 18px; padding-top: 14px; border-top: 1px solid #F0F0F4; }
.v-drow { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; }
.v-dk { color: #8A8A9E; }
.v-dv { color: #1A1A24; font-weight: 500; }
.v-tips { margin: 18px 16px 0; }
.v-tips-t { font-size: 11px; color: #A8A8B8; margin-bottom: 7px; }
.v-tip { font-size: 11px; color: #9C9CAC; line-height: 2; }

/* ---------- 新增：浏览历史 ---------- */
.h-head { display: flex; justify-content: space-between; padding: 14px 16px 8px; font-size: 11px; color: #8A8A9E; }
.h-clear { color: #FF5C39; }
.h-list { margin: 0 12px; border-radius: 10px; background: #fff; overflow: hidden; }
.h-item { display: flex; align-items: center; padding: 12px; }
.h-item + .h-item { border-top: 1px solid #F5F5F8; }
.h-img { width: 66px; height: 66px; border-radius: 6px; flex-shrink: 0; }
.h-body { flex: 1; padding: 0 10px; min-width: 0; }
.h-name { font-size: 13px; color: #1A1A24; line-height: 1.4; }
.h-price { margin-top: 6px; font-size: 13px; font-weight: 600; color: #FF5C39; }
.h-time { font-size: 10px; color: #B0B0BE; flex-shrink: 0; }
"""

# 详情页要插入的区块（放在"作品详情"之前）
DETAIL_BLOCKS = """
    <div class="d-block">
      <div class="bt">尺寸参考</div>
      <div class="cmp-sub">按真实比例对照，方便判断实际大小</div>
      <div class="size-chart">
        <div class="size-col">
          <div class="size-bar-wrap"><div class="size-bar" style="height:49px"></div></div>
          <div class="size-name">可乐罐</div><div class="size-cm">12.3cm</div>
        </div>
        <div class="size-col">
          <div class="size-bar-wrap"><div class="size-bar" style="height:62px"></div></div>
          <div class="size-name">手机</div><div class="size-cm">15.5cm</div>
        </div>
        <div class="size-col">
          <div class="size-bar-wrap"><div class="size-bar" style="height:72px"></div></div>
          <div class="size-name">手掌</div><div class="size-cm">18cm</div>
        </div>
        <div class="size-col">
          <div class="size-bar-wrap"><div class="size-bar self" style="height:112px"></div></div>
          <div class="size-name self">本作品</div><div class="size-cm">28cm</div>
        </div>
        <div class="size-col">
          <div class="size-bar-wrap"><div class="size-bar" style="height:119px"></div></div>
          <div class="size-name">A4 纸</div><div class="size-cm">29.7cm</div>
        </div>
      </div>
      <div class="size-meta">材质 树脂 + 金属骨架 · 约 1.2kg · 宽 15cm · 深 12cm</div>
    </div>

    <div class="cmp-wrap">
      <div class="cmp-head">
        <div class="bt">上色前后</div>
        <div class="cmp-sub">拖动分割线，对比素体与完成品</div>
      </div>
      <div class="cmp" id="cmpBox">
        <div class="cmp-after"></div>
        <div class="cmp-before" id="cmpBefore">
          <div class="cmp-before-fill"></div>
        </div>
        <div class="cmp-line" id="cmpLine" style="left:50%">
          <div class="cmp-knob">‹ ›</div>
        </div>
        <div class="cmp-tag l">素体</div>
        <div class="cmp-tag r">完成品</div>
      </div>
    </div>

    <div class="d-block">
      <div class="bt">制作工序</div>
      <div class="cmp-sub">全部工序由手作人独立完成，共 5 个阶段</div>
      <div class="tl">
        <div class="tl-item">
          <div class="tl-axis"><div class="tl-dot on"></div><div class="tl-line"></div></div>
          <div class="tl-body">
            <div class="tl-head"><span class="tl-stage">三维建模</span><span class="tl-date">2026-09-02</span></div>
            <div class="tl-desc">确定比例与姿态，输出可打印网格</div>
            <div class="tl-meta">面数 12.8 万</div>
            <div class="tl-thumb"></div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-axis"><div class="tl-dot"></div><div class="tl-line"></div></div>
          <div class="tl-body">
            <div class="tl-head"><span class="tl-stage">翻模注型</span><span class="tl-date">2026-09-08</span></div>
            <div class="tl-desc">硅胶模具分片，树脂真空灌注去除气泡</div>
            <div class="tl-meta">共 4 片模具</div>
            <div class="tl-thumb"></div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-axis"><div class="tl-dot"></div><div class="tl-line"></div></div>
          <div class="tl-body">
            <div class="tl-head"><span class="tl-stage">手工打磨</span><span class="tl-date">2026-09-14</span></div>
            <div class="tl-desc">逐级砂纸去除合模线，处理表面瑕疵</div>
            <div class="tl-meta">240 至 2000 目</div>
            <div class="tl-thumb"></div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-axis"><div class="tl-dot"></div><div class="tl-line"></div></div>
          <div class="tl-body">
            <div class="tl-head"><span class="tl-stage">逐层上色</span><span class="tl-date">2026-09-22</span></div>
            <div class="tl-desc">底漆、面色、阴影、渍洗，逐层喷涂与手涂</div>
            <div class="tl-meta">共 7 层</div>
            <div class="tl-thumb"></div>
          </div>
        </div>
        <div class="tl-item">
          <div class="tl-axis"><div class="tl-dot"></div></div>
          <div class="tl-body">
            <div class="tl-head"><span class="tl-stage">组装质检</span><span class="tl-date">2026-09-28</span></div>
            <div class="tl-desc">装配底座与配件，逐项检查后编号封盒</div>
            <div class="tl-meta">检查 18 项</div>
            <div class="tl-thumb"></div>
          </div>
        </div>
      </div>
    </div>

"""

# 推荐区块（放在 scroll 末尾之前）
REL_BLOCK = """    <div class="rel-block">
      <div class="rel-head">
        <div class="rel-head-left"><div class="sec-bar"></div><span class="rel-title">同系列作品</span></div>
        <span class="rel-more">全部 ›</span>
      </div>
      <div class="rel-row">
        <div class="rel-item"><div class="art art-1 rel-img"></div><div class="rel-name">原创 · 雾都游侠</div><div class="rel-price">¥268.00</div></div>
        <div class="rel-item"><div class="art art-3 rel-img"></div><div class="rel-name">深海档案馆 1/8</div><div class="rel-price">¥368.00</div></div>
        <div class="rel-item"><div class="art art-5 rel-img"></div><div class="rel-name">星海观测者</div><div class="rel-price">¥428.00</div></div>
      </div>
    </div>
"""

ABOUT_PAGE = """
/* ---------- 关于 ---------- */
function pageAbout() {
  return `
  ${statusbar()}
  <div class="navbar"><span class="back">‹</span>关于</div>
  <div class="scroll">
    <div class="about-hero">
      <div class="about-hero-text">
        <div class="about-hero-title">一个人，一间工作室</div>
        <div class="about-hero-sub">从建模到涂装，每件作品都由同一个人完成</div>
      </div>
    </div>

    <div class="about-stats">
      <div class="about-stat"><div class="about-num">6<span class="about-unit">年</span></div><div class="about-label">一直在做</div></div>
      <div class="about-stat"><div class="about-num">120<span class="about-unit">+</span></div><div class="about-label">完成作品</div></div>
      <div class="about-stat"><div class="about-num">40<span class="about-unit">h</span></div><div class="about-label">平均单件工时</div></div>
    </div>

    <div class="about-block">
      <div class="about-bt">为什么做这个</div>
      <div class="about-p">最开始只是想要一个货架上买不到的模型，后来发现「做出来」这件事本身比「拥有」更有意思。现在做的每一件，都是我自己也想摆在桌上的东西。</div>
    </div>

    <div class="about-block">
      <div class="about-bt">怎么做</div>
      <div class="about-p">建模用 Blender，打印后翻模，再用树脂灌注。上色是纯手工的，一层一层叠加，有些作品要涂到第七层才出效果。所以每件的表面质感和官方量产款不一样，有手工的痕迹。</div>
      <div class="about-p">一件作品从建模到完工，平均要四十个小时。限量款的编号就是完工顺序，编号越小，做得越早，也越舍不得卖。</div>
    </div>

    <div class="about-block">
      <div class="about-bt">怎么买</div>
      <div class="about-p">目前不走线上下单，看完作品觉得喜欢，直接通过客服找我聊。可以问尺寸、问细节、问工期，也可以说说你想要什么，看看能不能做。</div>
      <div class="about-p">定制需要先确认需求和报价，双方都清楚之后再开始。定金是总价的三成，开始制作后不退——因为你的那件已经开工了，别人也不会要。</div>
    </div>

    <div class="about-tip">作品都是手工制作，有细微手工痕迹属正常工艺特征，不视为瑕疵。照片受光线影响可能与实物有轻微色差，介意的话可以先聊清楚再决定。</div>

    <div class="about-btn">联系手作人</div>

    <div class="about-footer">
      <div class="about-brand">拾光手办</div>
      <div class="about-brand-sub">SHIGUANG FIGURE</div>
    </div>
    <div style="height:24px"></div>
  </div>`
}

/* ---------- 编号查询 ---------- */
function pageVerify() {
  return `
  ${statusbar()}
  <div class="navbar"><span class="back">‹</span>编号查询</div>
  <div class="scroll">
    <div class="v-head">
      <div class="v-title">作品编号查询</div>
      <div class="v-sub">输入底座背面的编号，确认作品出处与序号</div>
    </div>

    <div class="v-panel">
      <div class="v-row">
        <input id="vInput" class="v-input" placeholder="SG-2026-0128" maxlength="16" />
        <div class="v-btn" id="vBtn">查询</div>
      </div>
      <div class="v-hint">格式为 SG 加年份加四位序号，例如 SG-2026-0128</div>
    </div>

    <div id="vResult"></div>

    <div class="v-tips">
      <div class="v-tips-t">关于编号</div>
      <div class="v-tip">· 编号刻在每件作品底座的背面</div>
      <div class="v-tip">· 序号即完工顺序，数字越小做得越早</div>
      <div class="v-tip">· 同一编号不会重复，可作为流通时的出处凭证</div>
      <div class="v-tip">· 查询在本地完成，不会上传你的输入</div>
    </div>
    <div style="height:24px"></div>
  </div>`
}

/* ---------- 浏览历史 ---------- */
function pageHistory() {
  const items = [
    ['art-2', '机械螳螂 1/6 收藏级手办', '¥598.00', '刚刚'],
    ['art-1', '原创 · 雾都游侠 1/7 手办', '¥268.00', '2 小时前'],
    ['art-4', '和风 · 樱守 1/7', '¥398.00', '1 天前'],
    ['art-3', '深海档案馆 1/8', '¥368.00', '3 天前']
  ]
  return `
  ${statusbar()}
  <div class="navbar"><span class="back">‹</span>浏览历史</div>
  <div class="scroll">
    <div class="h-head"><span>共 ${items.length} 件</span><span class="h-clear">清空</span></div>
    <div class="h-list">
      ${items.map(([art, name, price, time]) => `
        <div class="h-item">
          <div class="art ${art} h-img"></div>
          <div class="h-body"><div class="h-name">${name}</div><div class="h-price">${price}</div></div>
          <div class="h-time">${time}</div>
        </div>`).join('')}
    </div>
    <div style="height:24px"></div>
  </div>`
}

"""

INIT_JS = """
/* ---------- 交互初始化 ---------- */

/** 上色对比：拖动分割线 */
function initCompare() {
  const box = document.getElementById('cmpBox')
  const before = document.getElementById('cmpBefore')
  const line = document.getElementById('cmpLine')
  if (!box || !before || !line) return

  let dragging = false

  const move = (clientX) => {
    const rect = box.getBoundingClientRect()
    let pct = ((clientX - rect.left) / rect.width) * 100
    pct = Math.max(3, Math.min(97, pct))
    before.style.width = pct + '%'
    line.style.left = pct + '%'
  }

  box.addEventListener('mousedown', (e) => { dragging = true; move(e.clientX); e.preventDefault() })
  window.addEventListener('mousemove', (e) => { if (dragging) move(e.clientX) })
  window.addEventListener('mouseup', () => { dragging = false })

  box.addEventListener('touchstart', (e) => { move(e.touches[0].clientX) }, { passive: true })
  box.addEventListener('touchmove', (e) => { move(e.touches[0].clientX) }, { passive: true })
}

/** 编号查询：本地校验 */
function initVerify() {
  const input = document.getElementById('vInput')
  const btn = document.getElementById('vBtn')
  const out = document.getElementById('vResult')
  if (!input || !btn || !out) return

  const run = () => {
    const raw = String(input.value || '').trim().toUpperCase().replace(/[\\s\\-_]/g, '')
    if (!raw) return

    const m = /^SG(\\d{4})(\\d{4})$/.exec(raw)
    let html = ''

    if (!m) {
      html = `<div class="v-res"><div class="v-badge fail">!</div><div class="v-rt">未通过验证</div><div class="v-rs">编号格式不正确，应为 SG-年份-四位序号</div></div>`
    } else {
      const year = Number(m[1])
      const seqStr = m[2]
      const head = Number(seqStr.slice(0, 3))
      const check = Number(seqStr.slice(3))
      const expect = ((year % 100) + head) % 10

      if (year < 2024 || year > 2035) {
        html = `<div class="v-res"><div class="v-badge fail">!</div><div class="v-rt">未通过验证</div><div class="v-rs">编号中的年份不在有效范围内</div></div>`
      } else if (check !== expect) {
        html = `<div class="v-res"><div class="v-badge fail">!</div><div class="v-rt">未通过验证</div><div class="v-rs">该编号不存在，请核对底座上的数字</div></div>`
      } else {
        html = `<div class="v-res">
          <div class="v-badge ok">✓</div>
          <div class="v-rt">编号有效</div>
          <div class="v-rs">这是 ${year} 年出品的第 ${head} 件作品</div>
          <div class="v-detail">
            <div class="v-drow"><span class="v-dk">出品年份</span><span class="v-dv">${year} 年</span></div>
            <div class="v-drow"><span class="v-dk">作品序位</span><span class="v-dv">第 ${head} 件</span></div>
            <div class="v-drow"><span class="v-dk">完整编号</span><span class="v-dv">SG-${year}-${seqStr}</span></div>
          </div>
        </div>`
      }
    }
    out.innerHTML = html
  }

  btn.addEventListener('click', run)
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') run() })
}
"""


def main():
    code = SRC.read_text(encoding='utf-8')

    # 1. 追加 CSS
    code = code.replace('</style>', CSS + '\n</style>', 1)

    # 2. 详情页插入新区块
    anchor = '    <div class="d-block">\n      <div class="bt">作品详情</div>'
    assert anchor in code, '未找到详情区块锚点'
    code = code.replace(anchor, DETAIL_BLOCKS + anchor, 1)

    # 3. 详情页插入推荐（scroll 末尾）
    rel_anchor = '    <div style="height:12px"></div>\n  </div>\n\n  <div class="detail-bar">'
    assert rel_anchor in code, '未找到 scroll 结尾锚点'
    code = code.replace(rel_anchor, REL_BLOCK + rel_anchor, 1)

    # 4. 追加新页面函数
    page_anchor = '/* ---------- 购物车 ---------- */'
    assert page_anchor in code, '未找到购物车注释锚点'
    code = code.replace(page_anchor, ABOUT_PAGE + page_anchor, 1)

    # 5. 注册页面
    code = code.replace(
        "  user: pageUser,\n  admin: pageAdmin\n}",
        "  user: pageUser,\n  admin: pageAdmin,\n  about: pageAbout,\n  verify: pageVerify,\n  history: pageHistory\n}",
        1
    )

    # 6. 更新 tab 列表
    old_tabs = '<div class="tab" data-page="admin">经营概览</div>'
    new_tabs = (
        '<div class="tab" data-page="history">浏览历史</div>\n'
        '  <div class="tab" data-page="verify">编号查询</div>\n'
        '  <div class="tab" data-page="about">关于</div>\n'
        '  <div class="tab" data-page="admin">经营概览</div>'
    )
    assert old_tabs in code
    code = code.replace(old_tabs, new_tabs, 1)

    # 7. NOTES 缺失时兜底，避免新页面报错
    code = code.replace(
        'const note = NOTES[page]',
        "const note = NOTES[page] || { title: '', sub: '', items: [] }",
        1
    )

    # 8. 追加交互初始化，并在 render 后调用
    code = code.replace(
        "  const screen = document.getElementById('screen')\n  screen.innerHTML = PAGES[page]()\n  screen.scrollTop = 0",
        "  const screen = document.getElementById('screen')\n  screen.innerHTML = PAGES[page]()\n  screen.scrollTop = 0\n\n  if (page === 'detail') setTimeout(initCompare, 0)\n  if (page === 'verify') setTimeout(initVerify, 0)",
        1
    )
    code = code.replace(
        "document.getElementById('tabs').addEventListener",
        INIT_JS + "\ndocument.getElementById('tabs').addEventListener",
        1
    )

    DST.write_text(code, encoding='utf-8')
    print(f'已生成 {DST}')
    print(f'体积 {DST.stat().st_size / 1024:.1f} KB')


if __name__ == '__main__':
    main()
