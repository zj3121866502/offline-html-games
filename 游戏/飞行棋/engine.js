'use strict';
/* 规则引擎：只算账不碰画面。位置统一用玩家步数 s：
   -1=机场（base），0=起飞格，1..50=外环（环上索引 (c*13+s)%52），51..55=终点跑道，56=到达。
   规则（2026-10-02 定稿）：掷6起飞+再掷；三连6→进度最大的己方飞机回机场且回合结束；
   踩同色跳一次、飞跃一次（均不连锁、越入口不跳、起飞格不跳）；落点撞对方该格全部回机场；
   己方可叠；终点模式 exact=超出回弹 / loose=超出即到；四架到达获胜。 */
function Engine(cfg) {
  this.mode = cfg.mode;              // 'exact' | 'loose'
  this.players = cfg.players;        // [4] 'human'|'ai'|'off'
  this.planes = [];                  // {c,i,s}
  for (var c = 0; c < 4; c++)
    for (var i = 0; i < 4; i++)
      this.planes.push({ c: c, i: i, s: -1 });
  this.cur = 0;                      // 当前回合玩家（含 off，由 next() 跳过）
  this.sixChain = 0;                 // 连续掷 6 计数
  this.winner = -1;
}

Engine.prototype.planesOf = function (c) {
  return this.planes.filter(function (p) { return p.c === c; });
};
Engine.prototype.arrived = function (c) {
  return this.planesOf(c).filter(function (p) { return p.s === 56; }).length;
};
Engine.prototype.allArrived = function (c) {
  return this.arrived(c) === 4;
};
// 环上步数 s 是否该玩家同色格（s∈[1,50] 才有颜色跳法）。
// 环格颜色 = (4+13c+s)%4 = (c+s)%4，等于 c 当且仅当 s%4===0（与具体颜色无关）。
Engine.prototype.isOwnCell = function (c, s) {
  return s >= 1 && s <= 50 && (s % 4) === 0;
};

// 掷骰（纯随机，人人平等）
Engine.prototype.roll = function () {
  return 1 + Math.floor(Math.random() * 6);
};

// 目的地：<=56 直走；超出按模式。跑道内最多弹回第 1 格，绝不弹回外环。
Engine.prototype.destOf = function (s, die) {
  var t = s + die;
  if (t <= 56) return t;
  if (this.mode === 'loose') return 56;
  return 112 - t; // exact 回弹：57→55 ... 61→51
};

// 当前骰子下玩家 c 的全部合法动作
Engine.prototype.legalMoves = function (c, die) {
  var ms = [], self = this;
  this.planesOf(c).forEach(function (p) {
    if (p.s === 56) return;
    if (p.s === -1) {
      if (die === 6) ms.push({ p: p, type: 'launch', to: 0 });
      return;
    }
    ms.push({ p: p, type: 'move', from: p.s, to: self.destOf(p.s, die) });
  });
  return ms;
};

// 三连 6 惩罚：进度最大的未到达飞机回机场；全在机场则无人可罚。返回受害者或 null。
Engine.prototype.penalize = function (c) {
  var cand = this.planesOf(c).filter(function (p) { return p.s >= 0 && p.s < 56; });
  if (!cand.length) return null;
  var v = cand.reduce(function (a, b) { return b.s > a.s ? b : a; });
  v.s = -1;
  return v;
};

// 落点结算：跳/飞（不连锁）+ 撞子。返回事件数组（引擎不动画面，只报账）。
Engine.prototype.settle = function (c, p) {
  var ev = [], self = this;
  // 飞跃：落到自己步数 12 的格子（必为同色+带虚线）直接飞到 24
  if (p.s === 12) {
    p.s = 24;
    ev.push({ t: 'fly', p: p, to: 24 });
  } else if (this.isOwnCell(c, p.s)) {
    // 同色跳 +4；越过入口（>50）则不跳
    if (p.s + 4 <= 50) {
      p.s += 4;
      ev.push({ t: 'jump', p: p, to: p.s });
    }
  }
  // 撞子：最终停稳格（外环 0..50）上的敌方飞机全体回机场
  var mine = (4 + 13 * c + p.s) % 52;
  var victims = [];
  this.planes.forEach(function (q) {
    if (q.c === c || q.s < 0 || q.s > 50) return;
    if ((4 + 13 * q.c + q.s) % 52 === mine) { q.s = -1; victims.push(q); }
  });
  if (victims.length) ev.push({ t: 'capture', p: p, victims: victims, at: mine });
  return ev;
};

// 执行动作，返回事件序列（可能含 win）
Engine.prototype.applyMove = function (mv) {
  var p = mv.p, c = p.c, ev = [];
  p.s = mv.to;
  ev.push({ t: mv.type, p: p, from: mv.type === 'launch' ? -1 : mv.from, to: mv.to });
  if (p.s <= 50) ev = ev.concat(this.settle(c, p));
  if (p.s === 56) ev.push({ t: 'arrive', p: p });
  if (this.allArrived(c)) { this.winner = c; ev.push({ t: 'win', c: c }); }
  return ev;
};

// 回合推进：跳过 off 位
Engine.prototype.next = function () {
  do { this.cur = (this.cur + 1) % 4; } while (this.players[this.cur] === 'off');
};

Engine.prototype.save = function () {
  return JSON.stringify({ v: 1, mode: this.mode, players: this.players, planes: this.planes, cur: this.cur, sixChain: this.sixChain, winner: this.winner });
};
Engine.load = function (str) {
  var d = JSON.parse(str);
  var e = new Engine({ mode: d.mode, players: d.players });
  e.planes = d.planes; e.cur = d.cur; e.sixChain = d.sixChain; e.winner = d.winner;
  return e;
};
if (typeof module !== 'undefined') module.exports = Engine;
