'use strict';
/* 棋盘几何与常量（v2 经典十字布局）。
   坐标系：viewBox 100x100，棋盘 15x15 格，格单位像素 U=100/15。
   环道 = 十字外沿 52 格（顺时针 RING，格 i 颜色 = i%4，四臂各 13 格，
   臂间转角格对角相连：(8,5)→(9,6)→…→(5,6)→(6,5) 闭合）。
   玩家 s 轴：-1=机场，0=起飞格（=环格 4+13c，靠自家机场角），1..50=外环，
   51..56=终点跑道（沿臂中线伸向中心，第 6 格=终点，四终点格环绕中心）。
   环格颜色 (4+13c+s)%4 = (c+s)%4，故玩家 s%4===0 即自家色格。 */
var BD = (function () {
  var U = 100 / 15;
  var COLORS = ['#e04438', '#f2b21c', '#2f7fd1', '#3fa34d']; // 红黄蓝绿
  var COLOR_NAMES = ['红', '黄', '蓝', '绿'];
  // 机场 6x6 区块左上角（格单位）：红左上、黄右上、蓝右下、绿左下
  var HOME_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];

  // 环道 52 格（格单位坐标，顺时针）
  var RING = (function () {
    var seq = [], x, y;
    for (y = 5; y >= 1; y--) seq.push([6, y]);      // 上臂左列向上
    seq.push([6, 0], [7, 0], [8, 0]);               // 上臂端排
    for (y = 1; y <= 5; y++) seq.push([8, y]);      // 上臂右列向下
    for (x = 9; x <= 13; x++) seq.push([x, 6]);     // 右臂上排向右
    seq.push([14, 6], [14, 7], [14, 8]);            // 右臂端列
    for (x = 13; x >= 9; x--) seq.push([x, 8]);     // 右臂下排向左
    for (y = 9; y <= 13; y++) seq.push([8, y]);     // 下臂右列向下
    seq.push([8, 14], [7, 14], [6, 14]);            // 下臂端排
    for (y = 13; y >= 9; y--) seq.push([6, y]);     // 下臂左列向上
    for (x = 5; x >= 1; x--) seq.push([x, 8]);      // 左臂下排向左
    seq.push([0, 8], [0, 7], [0, 6]);               // 左臂端列
    for (x = 1; x <= 5; x++) seq.push([x, 6]);      // 左臂上排向右
    return seq;
  })();

  function px(u) { return u * U; }                        // 格单位 → 像素
  function cellXY(x, y) { return [(x + 0.5) * U, (y + 0.5) * U]; }
  function ringXY(i) { return cellXY(RING[i % 52][0], RING[i % 52][1]); }
  function ringColor(i) { return i % 4; }
  // 玩家 c 步数 s 对应的环道索引（s=0 即起飞格=环格 4+13c）
  function ringIndexOf(c, s) { return (4 + 13 * c + s) % 52; }

  // 终点跑道 6 格（格单位坐标，第 1 格靠臂端，第 6 格=终点贴中心）
  var RUNWAY = [
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]]
  ];

  function stepsXY(c, s) {
    if (s <= 50) return ringXY(ringIndexOf(c, s));
    var g = RUNWAY[c][s - 51];
    return cellXY(g[0], g[1]);
  }
  // 机库位（2x2 居中于 6x6 机场块）：格单位 1.6 / 3.4
  function nestXY(c, i) {
    var o = HOME_ORIGIN[c];
    var off = [[1.6, 1.6], [3.4, 1.6], [3.4, 3.4], [1.6, 3.4]][i];
    return [px(o[0] + off[0]), px(o[1] + off[1])];
  }
  // 飞跃虚线：自家 s=12 格（环 16+13c）→ s=24 格（环 28+13c）
  function flyLine(c) {
    return [ringXY(ringIndexOf(c, 12)), ringXY(ringIndexOf(c, 24))];
  }

  return {
    U: U, COLORS: COLORS, COLOR_NAMES: COLOR_NAMES,
    HOME_ORIGIN: HOME_ORIGIN, RING: RING, RUNWAY: RUNWAY,
    px: px, cellXY: cellXY, ringXY: ringXY, ringColor: ringColor,
    ringIndexOf: ringIndexOf, stepsXY: stepsXY, nestXY: nestXY, flyLine: flyLine
  };
})();
if (typeof module !== 'undefined') module.exports = BD;
