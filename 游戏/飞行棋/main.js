'use strict';
/* 流程控制：开局面板 → 游戏循环（人类点骰点飞机 / AI 自动）→ 事件动画 → 自动存档。
   掷 6 再掷、三连 6 惩罚、无可动跳过都在这里调度。 */
(function () {
  var SAVE_KEY = 'fxq_save_v1';
  var E = null;            // 引擎实例
  var awaiting = null;     // {type:'roll'|'pick', res}
  var busy = false;        // 动画/结算中，锁输入

  function $(id) { return document.getElementById(id); }
  function log(msg, c) {
    var box = $('log');
    var d = document.createElement('div');
    if (c !== undefined && c >= 0) d.className = 'c' + c;
    d.textContent = msg;
    box.insertBefore(d, box.firstChild);
    while (box.children.length > 40) box.removeChild(box.lastChild);
  }
  function pname(c) { return BD.COLOR_NAMES[c] + '方'; }
  function who(c) { return pname(c) + '（' + (E.players[c] === 'human' ? '玩家' : '电脑') + '）'; }

  // ---------- 开局面板 ----------
  var cfg = { roles: ['human', 'ai', 'ai', 'ai'], mode: 'exact' };
  function buildSetup() {
    var box = $('cfgColors');
    // forEach 保持 c/opt 每轮独立：var 循环变量会被四个行的 onclick 闭包共享（踩过坑）
    [0, 1, 2, 3].forEach(function (c) {
      var row = document.createElement('div');
      row.className = 'cfgrow';
      var dot = document.createElement('span'); dot.className = 'dot'; dot.style.background = BD.COLORS[c];
      var lab = document.createElement('span'); lab.className = 'lab'; lab.textContent = BD.COLOR_NAMES[c];
      var opt = document.createElement('div'); opt.className = 'opt';
      ['human', 'ai', 'off'].forEach(function (role) {
        var b = document.createElement('button');
        b.textContent = role === 'human' ? '玩家' : role === 'ai' ? '电脑' : '无';
        if (cfg.roles[c] === role) b.className = 'on';
        b.onclick = function () {
          cfg.roles[c] = role;
          Array.prototype.forEach.call(opt.children, function (x) { x.className = ''; });
          b.className = 'on';
        };
        opt.appendChild(b);
      });
      row.appendChild(dot); row.appendChild(lab); row.appendChild(opt);
      box.appendChild(row);
    });
    var mbox = $('cfgMode');
    mbox.className = 'seg';
    [['exact', '刚好到达', '超出往回弹'], ['loose', '超出也算', '直接到达']].forEach(function (pair) {
      var b = document.createElement('div');
      b.className = 'seg-opt' + (cfg.mode === pair[0] ? ' on' : '');
      b.innerHTML = '<span class="seg-main">' + pair[1] + '</span><span class="seg-sub">' + pair[2] + '</span>';
      b.onclick = function () {
        cfg.mode = pair[0];
        Array.prototype.forEach.call(mbox.children, function (x) { x.className = 'seg-opt'; });
        b.className = 'seg-opt on';
      };
      mbox.appendChild(b);
    });
  }

  function showSetup() { $('setup').style.display = 'flex'; $('resume').style.display = 'none'; }

  function startNew() {
    var any = cfg.roles.some(function (r) { return r !== 'off'; });
    if (!any) { alert('至少要有一方参战（玩家或电脑）'); return; }
    localStorage.removeItem(SAVE_KEY);
    E = new Engine({ mode: cfg.mode, players: cfg.roles.slice() });
    $('setup').style.display = 'none';
    $('resume').style.display = 'none';
    $('winBox').style.display = 'none';
    $('log').innerHTML = '';
    log('新对局开始：终点模式 = ' + (E.mode === 'exact' ? '刚好到达' : '超出即到'));
    R.refresh(E);
    gameLoop();
  }

  // ---------- 恢复上局 ----------
  function tryResume() {
    var str = localStorage.getItem(SAVE_KEY);
    if (!str) return false;
    try { E = Engine.load(str); } catch (e) { localStorage.removeItem(SAVE_KEY); return false; }
    if (E.winner >= 0) { localStorage.removeItem(SAVE_KEY); return false; }
    return true;
  }
  function resumeGame() {
    $('resume').style.display = 'none';
    log('已恢复上局进度');
    R.refresh(E);
    gameLoop();
  }

  // ---------- 存档 ----------
  function save() { try { localStorage.setItem(SAVE_KEY, E.save()); } catch (e) {} }

  // ---------- 等待交互 ----------
  function waitHumanRoll() {
    return new Promise(function (res) { awaiting = { type: 'roll', res: res }; $('btnRoll').disabled = false; });
  }
  // 掷骰（__fxq.forceDie = n 可钦定下一掷，调试用，与大富翁 __dbg.dice 同思路）
  function rollDie() {
    var d = E.roll();
    if (window.__fxq && window.__fxq.forceDie) { d = window.__fxq.forceDie; window.__fxq.forceDie = null; }
    return d;
  }
  function waitHumanPick(moves) {
    return new Promise(function (res) {
      R.highlight(moves, function (mv) { R.clearHighlight(); awaiting = null; res(mv); });
      log('点绿色圈圈选一架飞机');
    });
  }
  function pressRoll() {
    if (awaiting && awaiting.type === 'roll') {
      var r = awaiting.res; awaiting = null; $('btnRoll').disabled = true; r();
    }
  }

  // ---------- 事件动画 ----------
  function stepsPath(from, to, die) {
    var path = [], i;
    if (to >= from) { for (i = from + 1; i <= to; i++) path.push(i); return path; }
    // exact 回弹：先走到 56 再弹回
    for (i = from + 1; i <= 56; i++) path.push(i);
    for (i = 55; i >= to; i--) path.push(i);
    return path;
  }
  async function playEvents(evs) {
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.t === 'launch') { await R.animLaunch(e.p); log(pname(e.p.c) + ' 起飞！', e.p.c); }
      else if (e.t === 'move') { await R.animSteps(e.p, stepsPath(e.from, e.to)); }
      else if (e.t === 'jump') { await R.animJump(e.p, e.to); log(pname(e.p.c) + ' 踩同色连跳一步', e.p.c); }
      else if (e.t === 'fly') { await R.animFly(e.p, e.to); log(pname(e.p.c) + ' 沿虚线飞跃！', e.p.c); }
      else if (e.t === 'capture') {
        log(pname(e.p.c) + ' 撞掉 ' + e.victims.map(function (v) { return BD.COLOR_NAMES[v.c]; }).join('、') + '方 ' + e.victims.length + ' 架飞机！', e.p.c);
        await Promise.all(e.victims.map(function (v) { return R.animSendHome(v); }));
      }
      else if (e.t === 'arrive') { log(pname(e.p.c) + ' 一架飞机到达终点（' + E.arrived(e.p.c) + '/4）', e.p.c); }
      else if (e.t === 'win') { log(pname(e.c) + ' 四架全部到达，获胜！', e.c); }
    }
    R.refresh(E);
  }

  // ---------- 主循环 ----------
  async function gameLoop() {
    var guard = 0;
    while (E.winner < 0) {
      if (++guard > 100000) break;
      var c = E.cur;
      setTurnUI(c);

      // 掷骰
      var die;
      if (E.players[c] === 'ai') { await R.delay(650); die = rollDie(); }
      else { await waitHumanRoll(); die = rollDie(); }
      await R.diceRollAnim(die);
      log(who(c) + ' 掷出 ' + die + ' 点', c);

      // 三连 6
      if (die === 6) {
        E.sixChain++;
        if (E.sixChain >= 3) {
          var v = E.penalize(c);
          log('连掷三个 6！' + (v ? pname(c) + ' 进度最大的飞机被送回机场' : pname(c) + ' 无人可罚'), c);
          if (v) { await R.animSendHome(v); R.refresh(E); }
          E.sixChain = 0;
          save(); E.next();
          continue;
        }
      } else { E.sixChain = 0; }
      $('againTag').textContent = die === 6 ? '（6 点，再掷一次）' : '';

      // 走子
      var moves = E.legalMoves(c, die);
      if (!moves.length) {
        if (E.players[c] === 'human') log(pname(c) + ' 无棋可走');
        await R.delay(500);
        save();
        if (die !== 6) E.next();
        continue; // 掷 6 无可动 → 同玩家再掷
      }
      var mv;
      if (E.players[c] === 'ai') { await R.delay(500); mv = aiChoose(E, c, die); }
      else { mv = await waitHumanPick(moves); }
      busy = true;
      var evs = E.applyMove(mv);
      await playEvents(evs);
      busy = false;

      if (evs.some(function (e) { return e.t === 'win'; })) { onWin(c); return; }
      save();
      if (die !== 6) E.next();
    }
  }

  function setTurnUI(c) {
    $('turnName').textContent = who(c);
    $('turnName').style.color = BD.COLORS[c];
    $('againTag').textContent = E.sixChain > 0 ? '（连 6 中）' : '';
  }
  function onWin(c) {
    localStorage.removeItem(SAVE_KEY);
    $('winText').textContent = pname(c) + ' 获胜！';
    $('winText').style.color = BD.COLORS[c];
    $('winBox').style.display = 'flex';
  }

  // ---------- 启动 ----------
  window.__fxq = { saveKey: SAVE_KEY };   // 调试口（详见 rollDie）
  window.addEventListener('DOMContentLoaded', function () {
    R.buildBoard($('boardWrap'));
    buildSetup();
    $('btnRoll').onclick = pressRoll;
    $('die').onclick = pressRoll;
    $('btnStart').onclick = startNew;
    $('btnNew').onclick = function () { if (!busy) showSetup(); };
    $('btnResume').onclick = resumeGame;
    $('btnFresh').onclick = function () { $('resume').style.display = 'none'; showSetup(); };
    $('btnAgain').onclick = function () { $('winBox').style.display = 'none'; showSetup(); };
    if (tryResume()) {
      $('setup').style.display = 'none';
      $('resume').style.display = 'flex';
    } else {
      showSetup();
    }
  });
})();
