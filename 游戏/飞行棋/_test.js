'use strict';
/* 回归冒烟：node _test.js
   1) 规则断言（回弹/跳/飞/不连锁/越入口不跳/起飞不跳/撞子/三连6/胜负/存档往返）
   2) 随机+AI 混合对局 fuzz，抓"跑不起来/中途炸/状态出界" */
var Engine = require('./engine.js');
var aiChoose = require('./ai.js');

var passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.log('FAIL: ' + name); }
}
function mk(mode) {
  return new Engine({ mode: mode || 'exact', players: ['ai', 'ai', 'ai', 'ai'] });
}

// --- 规则断言 ---
(function () {
  var e = mk('exact');
  ok(e.destOf(55, 6) === 51, 'exact 回弹 55+6→51');
  ok(e.destOf(55, 1) === 56, 'exact 55+1→56 刚好到达');
  ok(e.destOf(55, 2) === 55, 'exact 55+2 超出回弹→55');
  ok(e.destOf(54, 6) === 52, 'exact 回弹 54+6→52');
  var e2 = mk('loose');
  ok(e2.destOf(55, 6) === 56, 'loose 超出即到');
})();

(function () { // 跳一次不连锁
  var e = mk(), p = e.planesOf(0)[0];
  p.s = 3;
  var ev = e.applyMove({ p: p, type: 'move', from: 3, to: 4 });
  ok(p.s === 8, '同色跳 +4（3→4→8）');
  ok(ev.some(function (x) { return x.t === 'jump'; }), '事件含 jump');
  ok(!ev.some(function (x) { return x.t === 'fly'; }), '不连锁');
})();
(function () { // 落点 8 跳到 12（飞跃起点）不再飞
  var e = mk(), p = e.planesOf(0)[0];
  p.s = 7;
  var ev = e.applyMove({ p: p, type: 'move', from: 7, to: 8 });
  ok(p.s === 12 && !ev.some(function (x) { return x.t === 'fly'; }), '跳到虚线起点不连飞');
})();
(function () { // 飞跃 12→24，落点同色不再跳
  var e = mk(), p = e.planesOf(0)[0];
  p.s = 11;
  var ev = e.applyMove({ p: p, type: 'move', from: 11, to: 12 });
  ok(p.s === 24, '飞跃 12→24');
  ok(ev.some(function (x) { return x.t === 'fly'; }), '事件含 fly');
  ok(!ev.some(function (x) { return x.t === 'jump'; }), '飞跃后不连跳');
})();
(function () { // 越入口不跳：44 自色 +4 → 48 自色但 52>50
  var e = mk(), p = e.planesOf(0)[0];
  p.s = 44;
  var ev = e.applyMove({ p: p, type: 'move', from: 44, to: 48 });
  ok(p.s === 48 && !ev.some(function (x) { return x.t === 'jump'; }), '跳跃越入口不跳');
})();
(function () { // 起飞格不跳
  var e = mk(), p = e.planesOf(0)[0];
  var ev = e.applyMove({ p: p, type: 'launch', to: 0 });
  ok(p.s === 0 && !ev.some(function (x) { return x.t === 'jump'; }), '起飞格不跳');
})();
(function () { // 撞子：落点敌方全体回机场；己方叠不撞（环索引 6 上三家相遇）
  var e = mk(), r = e.planesOf(0)[0], b = e.planesOf(1)[0], g = e.planesOf(3)[0], own = e.planesOf(0)[1];
  b.s = 41; g.s = 15; own.s = 2;       // 新映射：蓝41→环6，绿15→环6，己方另一架已停环6（叠子）
  r.s = 1;
  var ev = e.applyMove({ p: r, type: 'move', from: 1, to: 2 }); // 红落到 s=2=环6
  ok(b.s === -1 && g.s === -1, '敌方两家被撞回机场');
  ok(own.s === 2, '己方叠子不撞');
  ok(ev.some(function (x) { return x.t === 'capture' && x.victims.length === 2; }), 'capture 事件含两架');
})();
(function () { // 颜色轮换：判据 s%4===0 对四色都成立、非自色格不误判
  var e = mk();
  ok(e.isOwnCell(0, 4) === true, '红 s=4 自色');
  ok(e.isOwnCell(1, 4) === true, '黄 s=4 自色');
  ok(e.isOwnCell(2, 4) === true, '蓝 s=4 自色');
  ok(e.isOwnCell(3, 4) === true, '绿 s=4 自色');
  ok(e.isOwnCell(0, 2) === false && e.isOwnCell(2, 2) === false, 's=2 非自色格');
  ok(e.isOwnCell(1, 8) === true && e.isOwnCell(3, 8) === true, 's=8 皆自色');
})();
(function () { // 蓝方跳格与飞跃（防"只用红方测"盲区）
  var e = mk(), p = e.planesOf(2)[0];
  p.s = 3;
  e.applyMove({ p: p, type: 'move', from: 3, to: 4 });
  ok(p.s === 8, '蓝方同色跳 +4');
  p.s = 11;
  var ev = e.applyMove({ p: p, type: 'move', from: 11, to: 12 });
  ok(p.s === 24 && ev.some(function (x) { return x.t === 'fly'; }), '蓝方飞跃 12→24');
})();
(function () { // 三连 6 惩罚选进度最大者
  var e = mk(), ps = e.planesOf(0);
  ps[0].s = 10; ps[1].s = 30; ps[2].s = 55; ps[3].s = 56;
  var v = e.penalize(0);
  ok(v === ps[2] && ps[2].s === -1, '惩罚打进度最大（55 那架）');
  var e2 = mk();
  ok(e2.penalize(0) === null, '全在机场无可罚');
})();
(function () { // legalMoves
  var e = mk();
  ok(e.legalMoves(0, 3).length === 0, '全在机场非6无路可走');
  ok(e.legalMoves(0, 6).length === 4, '全在机场掷6四架可起飞');
})();
(function () { // 胜负
  var e = mk(), ps = e.planesOf(0);
  ps[0].s = 56; ps[1].s = 56; ps[2].s = 56; ps[3].s = 55;
  var ev = e.applyMove({ p: ps[3], type: 'move', from: 55, to: 56 });
  ok(e.winner === 0 && ev.some(function (x) { return x.t === 'win'; }), '四架到达判胜');
})();
(function () { // 存档往返
  var e = mk(), r = e.planesOf(0)[0];
  r.s = 23; e.cur = 2; e.sixChain = 1;
  var e2 = Engine.load(e.save());
  ok(JSON.stringify(e2.planes) === JSON.stringify(e.planes) && e2.cur === 2 && e2.sixChain === 1 && e2.mode === 'exact', '存档往返一致');
})();

// --- 对局 fuzz ---
function fuzz(games, useAI) {
  var wins = [0, 0, 0, 0], maxTurns = 0;
  for (var g = 0; g < games; g++) {
    var e = mk();
    var turns = 0;
    while (e.winner < 0) {
      turns++;
      if (turns > 20000) { ok(false, '对局超时不结束'); return; }
      var c = e.cur;
      var die = e.roll();
      if (die === 6) {
        e.sixChain++;
        if (e.sixChain >= 3) { e.penalize(c); e.sixChain = 0; e.next(); continue; }
      } else { e.sixChain = 0; }
      var moves = e.legalMoves(c, die);
      var mv = null;
      if (moves.length) mv = useAI ? aiChoose(e, c, die) : moves[Math.floor(Math.random() * moves.length)];
      if (mv) {
        var evs = e.applyMove(mv);
        for (var i = 0; i < e.planes.length; i++) {
          var s = e.planes[i].s;
          if (s < -1 || s > 56) { ok(false, '飞机位置出界 s=' + s); return; }
        }
        if (evs.some(function (x) { return x.t === 'win'; })) { wins[e.winner]++; }
      }
      if (e.winner >= 0) break;
      if (die !== 6) e.next();
      // 掷 6（含无可动）同玩家再掷
    }
    if (turns > maxTurns) maxTurns = turns;
    var e2 = Engine.load(e.save());
    if (JSON.stringify(e2.planes) !== JSON.stringify(e.planes)) { ok(false, 'fuzz 存档往返不一致'); return; }
  }
  ok(true, useAI ? ('AI 对局 ' + games + ' 局全部正常结束，最长 ' + maxTurns + ' 回合，胜场 ' + JSON.stringify(wins)) : ('随机对局 ' + games + ' 局正常'));
}

fuzz(300, true);
fuzz(200, false);

console.log('通过 ' + passed + '，失败 ' + failed);
process.exit(failed ? 1 : 0);
