'use strict';
/* AI：一档，直接最强。枚举合法动作打分取最高：
   撞子 > 到达 > 飞跃/跳跃 > 起飞 > 推进；同时评估落点被撞风险与起飞时机。 */
function aiChoose(eng, c, die) {
  var moves = eng.legalMoves(c, die);
  if (!moves.length) return null;
  var best = null, bestScore = -1e9;
  moves.forEach(function (m) {
    var sc = scoreMove(eng, c, die, m) + Math.random() * 0.5; // 微扰动避免机械感
    if (sc > bestScore) { bestScore = sc; best = m; }
  });
  return best;
}

function scoreMove(eng, c, die, m) {
  var p = m.p, to = m.to, sc = 0;
  var active = eng.planesOf(c).filter(function (q) { return q.s >= 0 && q.s < 56; }).length;

  if (m.type === 'launch') {
    sc += 40;
    if (active < 2) sc += 50;                          // 家里囤飞机不值钱，尽早下场
    if (dangerAt(eng, c, (4 + 13 * c) % 52) > 0) sc -= 45; // 出门点有人蹲守，缓一缓
  } else {
    // 推进与位置价值
    sc += (to - (m.from || 0)) * 1.2;
    sc += to * 0.6;

    if (to === 56) sc += 95;                           // 到达兑现
    else if (to > 50) sc += 25;                        // 进跑道=上岸，没风险
    if (to === 24) sc += 65;                           // 飞跃白赚 12 格

    // 落点被撞风险（只在环上）
    if (to <= 50) {
      var d = dangerAt(eng, c, (4 + 13 * c + to) % 52);
      sc -= d * 12;                                    // d = 最近威胁距离，越小越危险
      if (eng.isOwnCell(c, to)) sc += 6;               // 停自家色格没加成，仅微弱心理安慰
    } else {
      sc += 20;                                        // 跑道安全
    }
  }

  // 撞子收益：按受害者进度加权（撞掉领先者最赚）
  if (to <= 50) {
    var mine = (4 + 13 * c + to) % 52;
    eng.planes.forEach(function (q) {
      if (q.c === c || q.s < 0 || q.s > 50) return;
      if ((4 + 13 * q.c + q.s) % 52 === mine) sc += 120 + q.s * 2;
    });
  }
  return sc;
}

// 落点 ringIndex 会被哪个距离的敌机撞到（敌机在其后方 1..6 步内）？返回最近距离，无威胁返回 0。
function dangerAt(eng, c, ringIndex) {
  var best = 0;
  eng.planes.forEach(function (q) {
    if (q.c === c || q.s < 0 || q.s > 50) return;
    var qRing = (4 + 13 * q.c + q.s) % 52;
    for (var d = 1; d <= 6; d++) {
      if ((qRing + d) % 52 === ringIndex) {
        if (!best || d < best) best = d;
        break;
      }
    }
  });
  return best;
}
if (typeof module !== 'undefined') module.exports = aiChoose;
