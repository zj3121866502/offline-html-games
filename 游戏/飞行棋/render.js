'use strict';
/* 渲染层：SVG 棋盘 + 飞机 + 动画。只认 BD（几何）和引擎的飞机数组，不含规则。
   动画全部 rAF 插值 + Promise，API 都是 2020 年以前的老古董。 */
var R = (function () {
  var NS = 'http://www.w3.org/2000/svg';
  var svg, planeG = [], planeAngle = [];
  var DICE_CHARS = '\u2680\u2681\u2682\u2683\u2684\u2685'; // ⚀⚁⚂⚃⚄⚅
  var STACK_OFF = [[-1.1, -1.1], [1.1, -1.1], [1.1, 1.1], [-1.1, 1.1]]; // 叠子错位（像素）

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function $(id) { return document.getElementById(id); }
  function rad2deg(r) { return r * 180 / Math.PI; }

  // ---------- 棋盘 ----------
  function buildBoard(container) {
    svg = el('svg', { id: 'board', viewBox: '0 0 100 100' }, container);
    var U = BD.U, CELL = U * 0.84, HALF = CELL / 2, c, i, x, y;

    // 底板
    el('rect', { x: 1, y: 1, width: 98, height: 98, rx: 5, fill: '#fbf6ea', stroke: '#d8c9a6', 'stroke-width': 0.8 }, svg);

    // 四角机场块（6x6 淡色 + 边框 + 2x2 机库位）
    for (c = 0; c < 4; c++) {
      var o = BD.HOME_ORIGIN[c], col = BD.COLORS[c];
      el('rect', {
        x: px(o[0]) + 1, y: px(o[1]) + 1, width: px(6) - 2, height: px(6) - 2, rx: 3,
        fill: col, opacity: 0.18, stroke: col, 'stroke-width': 0.7
      }, svg);
      el('rect', {
        x: px(o[0] + 0.8), y: px(o[1] + 0.8), width: px(4.4), height: px(4.4), rx: 2,
        fill: '#ffffff', opacity: 0.55, stroke: col, 'stroke-width': 0.4
      }, svg);
      for (i = 0; i < 4; i++) {
        var np = BD.nestXY(c, i);
        el('circle', { cx: np[0], cy: np[1], r: px(0.62), fill: col, opacity: 0.25, stroke: col, 'stroke-width': 0.5 }, svg);
      }
    }

    // 飞跃虚线（垫在格子下面）
    for (c = 0; c < 4; c++) {
      var fl = BD.flyLine(c);
      el('line', {
        x1: fl[0][0], y1: fl[0][1], x2: fl[1][0], y2: fl[1][1],
        stroke: BD.COLORS[c], 'stroke-width': 0.5, 'stroke-dasharray': '1.2,1.2', opacity: 0.5
      }, svg);
    }

    // 跑道连线 + 6 格
    for (c = 0; c < 4; c++) {
      var col2 = BD.COLORS[c], rw = BD.RUNWAY[c];
      var p1 = BD.cellXY(rw[0][0], rw[0][1]), p2 = BD.cellXY(rw[5][0], rw[5][1]);
      el('line', { x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: col2, 'stroke-width': px(1.5), opacity: 0.15 }, svg);
      for (i = 0; i < 6; i++) {
        var gp = BD.cellXY(rw[i][0], rw[i][1]);
        el('rect', {
          x: gp[0] - HALF, y: gp[1] - HALF, width: CELL, height: CELL, rx: CELL * 0.3,
          fill: col2, stroke: '#ffffff', 'stroke-width': 0.4, opacity: i === 5 ? 1 : 0.88
        }, svg);
        if (i === 5) el('circle', { cx: gp[0], cy: gp[1], r: CELL * 0.28, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.5 }, svg);
      }
    }

    // 环道 52 格（圆角方块）
    for (i = 0; i < 52; i++) {
      var rp = BD.ringXY(i), rc = BD.ringColor(i);
      el('rect', {
        x: rp[0] - HALF, y: rp[1] - HALF, width: CELL, height: CELL, rx: CELL * 0.3,
        fill: BD.COLORS[rc], stroke: '#ffffff', 'stroke-width': 0.4
      }, svg);
      if (i % 13 === 4) { // 起飞格：白圈标记
        el('circle', { cx: rp[0], cy: rp[1], r: CELL * 0.3, fill: 'none', stroke: '#ffffff', 'stroke-width': 0.55 }, svg);
      }
    }

    // 中心
    el('circle', { cx: 50, cy: 50, r: px(1.05), fill: '#fdf8ec', stroke: '#cbb98e', 'stroke-width': 0.6 }, svg);
    for (c = 0; c < 4; c++) {
      var aa = (c * 90 - 45) * Math.PI / 180;
      el('circle', { cx: 50 + px(0.55) * Math.cos(aa), cy: 50 + px(0.55) * Math.sin(aa), r: px(0.28), fill: BD.COLORS[c] }, svg);
    }

    // 飞机层
    for (var p = 0; p < 16; p++) {
      var g = el('g', { 'class': 'plane' }, svg);
      el('circle', { r: px(0.55), fill: 'transparent', 'class': 'hit' }, g);
      el('circle', { r: px(0.48), fill: 'none', stroke: '#2ecc71', 'stroke-width': 0.55, 'class': 'halo' }, g);
      var body = el('path', {
        d: 'M0,-4.6 L1.1,-2.4 L1.1,-0.6 L4.3,1.5 L4.3,2.7 L1.2,1.4 L1.1,2.7 L2.5,4.1 L2.5,4.9 L0,4.2 L-2.5,4.9 L-2.5,4.1 L-1.1,2.7 L-1.2,1.4 L-4.3,2.7 L-4.3,1.5 L-1.1,-0.6 L-1.1,-2.4 Z',
        fill: BD.COLORS[Math.floor(p / 4)], stroke: '#ffffff', 'stroke-width': 1.05, 'stroke-linejoin': 'round', 'class': 'body',
        transform: 'scale(0.4)'
      }, g);
      planeG.push(g);
      planeAngle.push(0);
    }
    hideAll();
  }

  function px(u) { return u * BD.U; }
  function hideAll() {
    planeG.forEach(function (g) { g.style.display = 'none'; });
  }

  // ---------- 摆位 ----------
  // 停留时的朝向：看向下一格（终点/机库则看向棋盘中心）
  function headingAt(c, s) {
    if (s >= 56) return homeAngle(c);
    var a = BD.stepsXY(c, s), b = BD.stepsXY(c, s + 1);
    return rad2deg(Math.atan2(b[1] - a[1], b[0] - a[0])) + 90;
  }
  // 终点格朝向：看向棋盘中心
  function homeAngle(c) {
    var t = BD.stepsXY(c, 56);
    return rad2deg(Math.atan2(50 - t[1], 50 - t[0])) + 90;
  }
  // 机库内朝棋盘中心
  function nestHeading(c) {
    var n = BD.nestXY(c, 0);
    return rad2deg(Math.atan2(50 - n[1], 50 - n[0])) + 90;
  }
  // 计算 p（含叠子序号）应放的坐标与朝向
  function placeOf(p, gi, gn) {
    var off = [0, 0];
    if (gn > 1) off = STACK_OFF[gi % 4];
    if (p.s === -1) {
      var np = BD.nestXY(p.c, p.i);
      return { xy: [np[0], np[1]], ang: nestHeading(p.c) };
    }
    var base = BD.stepsXY(p.c, p.s);
    var xy = [base[0] + off[0], base[1] + off[1]];
    var ang = p.s === 56 ? homeAngle(p.c) : headingAt(p.c, p.s);
    return { xy: xy, ang: ang };
  }
  function setPlane(p, xy, ang) {
    var g = planeG[p.c * 4 + p.i];
    g.style.display = '';
    planeAngle[p.c * 4 + p.i] = ang;
    g.setAttribute('transform', 'translate(' + xy[0] + ',' + xy[1] + ') rotate(' + ang + ')');
  }

  // 按引擎现状摆放全部飞机（开局/恢复/收尾用，无动画）
  function refresh(eng) {
    var groups = {};
    eng.planes.forEach(function (p) {
      var key;
      if (p.s === -1) key = 'n' + p.c + '_' + p.i;             // 机库位天然错开，各自一组
      else if (p.s >= 0 && p.s <= 50) key = 'r' + BD.ringIndexOf(p.c, p.s); // 环上同格叠一起
      else key = 's' + p.c + '_' + p.s;                        // 跑道/终点同色叠一起
      (groups[key] = groups[key] || []).push(p);
    });
    Object.keys(groups).forEach(function (k) {
      var arr = groups[k];
      arr.forEach(function (p, idx) {
        var pl = placeOf(p, idx, arr.length);
        setPlane(p, pl.xy, pl.ang);
      });
    });
  }

  // ---------- 高亮与点击 ----------
  var pickHandler = null;
  function highlight(moves, onPick) {
    clearHighlight();
    pickHandler = onPick;
    moves.forEach(function (m) {
      var g = planeG[m.p.c * 4 + m.p.i];
      g.setAttribute('class', 'plane hl');
      g.onclick = function () { if (pickHandler) pickHandler(m); };
    });
  }
  function clearHighlight() {
    pickHandler = null;
    planeG.forEach(function (g) { g.setAttribute('class', 'plane'); g.onclick = null; });
  }

  // ---------- 动画 ----------
  function delay(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
  function parseT(t) {
    var mm = /translate\(([-\d.]+)[, ]([-\d.]+)\)/.exec(t);
    return mm ? [parseFloat(mm[1]), parseFloat(mm[2])] : [50, 50];
  }
  function face(p, ang) {
    planeAngle[p.c * 4 + p.i] = ang;
    var g = planeG[p.c * 4 + p.i];
    var cur = parseT(g.getAttribute('transform'));
    g.setAttribute('transform', 'translate(' + cur[0] + ',' + cur[1] + ') rotate(' + ang + ')');
  }
  function animateTo(p, to, ms, arc) {
    var g = planeG[p.c * 4 + p.i];
    var cur = parseT(g.getAttribute('transform'));
    var ang = planeAngle[p.c * 4 + p.i];
    return new Promise(function (res) {
      var t0 = Date.now();
      // 用 setTimeout 驱动而非 rAF：部分挂起/后台状态 rAF 永不回调会卡死流程
      (function step() {
        var k = Math.min(1, (Date.now() - t0) / ms);
        var x = cur[0] + (to[0] - cur[0]) * k;
        var y = cur[1] + (to[1] - cur[1]) * k - Math.sin(Math.PI * k) * (arc || 0);
        g.setAttribute('transform', 'translate(' + x + ',' + y + ') rotate(' + ang + ')');
        if (k < 1) setTimeout(step, 16); else res();
      })();
    });
  }
  // 朝目标看一眼再走
  function faceToward(p, to) {
    var g = planeG[p.c * 4 + p.i];
    var cur = parseT(g.getAttribute('transform'));
    face(p, rad2deg(Math.atan2(to[1] - cur[1], to[0] - cur[0])) + 90);
  }

  // 逐格走：stepsPath 为玩家步数序列（不含起点）
  async function animSteps(p, stepsPath) {
    for (var i = 0; i < stepsPath.length; i++) {
      var s = stepsPath[i];
      var target = BD.stepsXY(p.c, s);
      faceToward(p, target);
      await animateTo(p, target, s === 56 ? 230 : 165, 0.5);
    }
  }
  // 同色跳：弧线一跳
  async function animJump(p, toS) {
    var to = BD.stepsXY(p.c, toS);
    faceToward(p, to);
    await animateTo(p, to, 340, 2.2);
  }
  // 虚线飞跃：直线滑行
  async function animFly(p, toS) {
    var to = BD.stepsXY(p.c, toS);
    faceToward(p, to);
    await animateTo(p, to, 520, 0);
  }
  // 起飞：机库 → 起飞格
  async function animLaunch(p) {
    var to = BD.stepsXY(p.c, 0);
    faceToward(p, to);
    await animateTo(p, to, 380, 1.5);
  }
  // 被撞回机场：直线飞回
  async function animSendHome(p) {
    var to = BD.nestXY(p.c, p.i);
    faceToward(p, to);
    await animateTo(p, to, 480, 0);
  }

  // ---------- 骰子 ----------
  function showDice(n, rolling) {
    var d = $('die');
    if (rolling) { d.parentNode.classList.add('rolling'); }
    else { d.parentNode.classList.remove('rolling'); d.textContent = DICE_CHARS[n - 1]; }
  }
  function diceRollAnim(finalN) {
    // 大富翁同款：抖动 + 快速闪换随机数
    return new Promise(function (res) {
      var d = $('die');
      d.parentNode.classList.add('rolling');
      var i = 0;
      var iv = setInterval(function () {
        d.textContent = DICE_CHARS[Math.floor(Math.random() * 6)];
        if (++i >= 7) {
          clearInterval(iv);
          d.parentNode.classList.remove('rolling');
          d.textContent = DICE_CHARS[finalN - 1];
          res();
        }
      }, 75);
    });
  }

  return {
    buildBoard: buildBoard, refresh: refresh, highlight: highlight, clearHighlight: clearHighlight,
    animSteps: animSteps, animJump: animJump, animFly: animFly, animLaunch: animLaunch, animSendHome: animSendHome,
    showDice: showDice, diceRollAnim: diceRollAnim, delay: delay
  };
})();
