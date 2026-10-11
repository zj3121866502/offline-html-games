/*
 * 围棋 · 双人对弈 —— 界面与对局流程
 * 依赖 js/engine.js（全局 Weiqi）。本地 file:// 直接打开即玩：
 * 无 AI、无网络请求；悔棋/存档/确认落子/棋盘风格均可用。
 */
(function () {
  'use strict';

  var W = Weiqi;
  var SAVE_KEY = 'weiqi.hotseat.v1';
  var LOGICAL = 760;                       // 画布逻辑尺寸
  var PAD = 40;                            // 棋盘边缘留白（含坐标）
  var LETTERS = 'ABCDEFGHJKLMNOPQRST';     // 坐标字母，惯例跳过 I

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = LOGICAL * dpr;
  canvas.height = LOGICAL * dpr;
  ctx.scale(dpr, dpr);

  function $(id) { return document.getElementById(id); }
  var els = {
    turnStone: $('turnStone'), turnText: $('turnText'),
    capB: $('capB'), capW: $('capW'), moveNo: $('moveNo'),
    notice: $('notice'),
    controlsRow: $('controlsRow'),
    scoringPanel: $('scoringPanel'), resultPanel: $('resultPanel'), setupPanel: $('setupPanel'),
    boardSize: $('boardSize'), btnStart: $('btnStart'),
    btnPass: $('btnPass'), btnUndo: $('btnUndo'), btnResign: $('btnResign'), btnNew: $('btnNew'),
    btnResetDead: $('btnResetDead'), btnBackPlay: $('btnBackPlay'), btnConfirmScore: $('btnConfirmScore'),
    resultTitle: $('resultTitle'), resultDetail: $('resultDetail'), btnAgain: $('btnAgain'),
    boardStyle: $('boardStyle'), confirmToggle: $('confirmToggle'),
    opponent: $('opponent'), playerColor: $('playerColor'), playerColorLabel: $('playerColorLabel'),
    toast: $('toast')
  };

  // ------------------------------------------------------------ 状态
  var game = null;            // GoGame 实例；setup 阶段为 null
  var state = 'setup';        // setup | playing | scoring | ended
  var resultType = null;      // 'score' | 'resign'
  var lastScore = null;
  var deadMap = {};           // 数子阶段人工标记的死子
  var autoDead = {};          // 自动预判的死子（“重设”回到这份）
  var ghost = null;           // 确认落子模式的预览点 {r,c}
  var settings = { style: 'wood', confirm: false, size: 19, opponent: 'human', playerColor: 'b' };

  // AI 相关：aiColor 为 null 即纯双人；thinking 时棋盘锁定
  var aiColor = null;
  var thinking = false;
  var aiSeq = 0;              // 取消搜索用代数
  var aiHandle = null;
  var aiTimer = null;

  // ---------------------------------------------------- 图片棋盘（樱花/江南）
  var STYLE_IMG = {
    sakura: { src: 'assets/sakura-board.png', ready: false, img: null, cropBottom: 0.12,
              grid: '#6b4634', coord: 'rgba(90,50,50,0.8)', label: '樱花' },
    jiangnan: { src: 'assets/jiangnan-board.png', ready: false, img: null, cropBottom: 0.12,
                grid: '#46505e', coord: 'rgba(40,50,65,0.85)', label: '江南烟雨' }
  };

  function loadImageStyle(key) {
    var cfg = STYLE_IMG[key];
    cfg.img = new Image();
    cfg.img.onload = function () { cfg.ready = true; if (settings.style === key) draw(); };
    cfg.img.onerror = function () {
      if (settings.style === key) {
        settings.style = 'wood';
        els.boardStyle.value = 'wood';
        toast(cfg.label + '棋盘图片加载失败，已退回木纹');
        draw();
      }
    };
    cfg.img.src = cfg.src;
  }
  loadImageStyle('sakura');
  loadImageStyle('jiangnan');

  // ------------------------------------------------------------ 几何
  function geo() {
    var size = game ? game.size : settings.size;
    return { size: size, pad: PAD, cell: (LOGICAL - PAD * 2) / (size - 1) };
  }

  function pointAt(x, y) {
    var g = geo();
    var c = Math.round((x - g.pad) / g.cell);
    var r = Math.round((y - g.pad) / g.cell);
    if (r < 0 || r >= g.size || c < 0 || c >= g.size) return null;
    var dx = x - (g.pad + c * g.cell), dy = y - (g.pad + r * g.cell);
    if (Math.abs(dx) > g.cell * 0.45 || Math.abs(dy) > g.cell * 0.45) return null;
    return { r: r, c: c };
  }

  function starPoints(size) {
    if (size === 19) {
      var pts = [];
      [3, 9, 15].forEach(function (a) { [3, 9, 15].forEach(function (b) { pts.push([a, b]); }); });
      return pts;
    }
    if (size === 13) return [[3, 3], [3, 9], [9, 3], [9, 9], [6, 6]];
    if (size === 9) return [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]];
    return [];
  }

  // ------------------------------------------------------------ 底盘绘制
  function drawWood() {
    var grad = ctx.createLinearGradient(0, 0, 0, LOGICAL);
    grad.addColorStop(0, '#eac97c');
    grad.addColorStop(0.5, '#e0b95f');
    grad.addColorStop(1, '#d6a94f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, LOGICAL, LOGICAL);

    var seed = 20261002;
    function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    ctx.save();
    for (var i = 0; i < 70; i++) {
      var y0 = rnd() * LOGICAL;
      var amp = 2 + rnd() * 6, per = 60 + rnd() * 180, phase = rnd() * 6.28;
      ctx.beginPath();
      ctx.moveTo(-10, y0);
      for (var x = 0; x <= LOGICAL + 12; x += 12) {
        ctx.lineTo(x, y0 + Math.sin(x / per + phase) * amp);
      }
      ctx.strokeStyle = 'rgba(122,79,22,' + (0.03 + rnd() * 0.06).toFixed(3) + ')';
      ctx.lineWidth = 0.6 + rnd() * 1.6;
      ctx.stroke();
    }
    for (i = 0; i < 3; i++) {
      var kx = rnd() * LOGICAL, ky = rnd() * LOGICAL, kr = 6 + rnd() * 14;
      ctx.beginPath();
      ctx.ellipse(kx, ky, kr, kr * 0.5, rnd() * 3.14, 0, 6.29);
      ctx.strokeStyle = 'rgba(110,70,20,0.08)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // 图片棋盘统一裁掉底部水印区
  function drawImageBoard(cfg) {
    ctx.drawImage(cfg.img,
      0, 0, cfg.img.width, cfg.img.height * (1 - cfg.cropBottom),
      0, 0, LOGICAL, LOGICAL);
  }

  function gridColor() {
    var cfg = STYLE_IMG[settings.style];
    return cfg ? cfg.grid : '#4a3813';
  }

  function drawGrid(size) {
    var g = geo();
    var col = gridColor();
    ctx.strokeStyle = col;
    var x0 = g.pad, y0 = g.pad, span = LOGICAL - PAD * 2;
    for (var i = 0; i < size; i++) {
      var p = g.pad + i * g.cell;
      ctx.lineWidth = (i === 0 || i === size - 1) ? 2 : 1;
      ctx.beginPath(); ctx.moveTo(x0, p); ctx.lineTo(x0 + span, p); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p, y0); ctx.lineTo(p, y0 + span); ctx.stroke();
    }
    ctx.fillStyle = col;
    starPoints(size).forEach(function (pt) {
      ctx.beginPath();
      ctx.arc(g.pad + pt[1] * g.cell, g.pad + pt[0] * g.cell, Math.max(2, g.cell * 0.09), 0, 6.29);
      ctx.fill();
    });
  }

  function drawCoords(size) {
    var g = geo();
    var cfg = STYLE_IMG[settings.style];
    ctx.fillStyle = cfg ? cfg.coord : 'rgba(70,50,20,0.75)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < size; i++) {
      var p = g.pad + i * g.cell;
      ctx.fillText(LETTERS.charAt(i), p, PAD - 22);
      ctx.fillText(String(size - i), PAD - 24, p);
    }
  }

  // ------------------------------------------------------------ 棋子与标记
  function drawStone(r, c, color, alpha) {
    var g = geo();
    var x = g.pad + c * g.cell, y = g.pad + r * g.cell, rad = g.cell * 0.47;
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    ctx.beginPath();
    ctx.arc(x, y + rad * 0.1, rad, 0, 6.29);
    ctx.fillStyle = 'rgba(30,20,5,0.28)';
    ctx.fill();

    var grad = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad);
    if (color === 'b') { grad.addColorStop(0, '#5c5c5c'); grad.addColorStop(1, '#040404'); }
    else { grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#cbcbcb'); }
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 6.29);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = color === 'b' ? 'rgba(0,0,0,0.65)' : 'rgba(110,110,110,0.55)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
  }

  function lastStone() {
    if (!game) return null;
    for (var i = game.history.length - 1; i >= 0; i--) {
      var m = game.history[i];
      if (!m.pass) return m;
    }
    return null;
  }

  function drawOverlays() {
    var g = geo();
    var showScoring = state === 'scoring' || (state === 'ended' && resultType === 'score');
    if (showScoring) {
      var grid = game.territoryGrid(deadMap);
      for (var r = 0; r < g.size; r++) {
        for (var c = 0; c < g.size; c++) {
          var owner = grid[r][c];
          if (!owner) continue;
          var x = g.pad + c * g.cell, y = g.pad + r * g.cell, s = g.cell * 0.3;
          ctx.beginPath();
          ctx.rect(x - s / 2, y - s / 2, s, s);
          ctx.fillStyle = owner === 'b' ? 'rgba(20,20,20,0.6)' : 'rgba(255,255,255,0.9)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.35)';
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
      for (var key in deadMap) {
        if (!Object.prototype.hasOwnProperty.call(deadMap, key)) continue;
        var rc = key.split(',');
        var rr = +rc[0], cc = +rc[1];
        var cx = g.pad + cc * g.cell, cy = g.pad + rr * g.cell, d = g.cell * 0.22;
        ctx.strokeStyle = '#e33b2d';
        ctx.lineWidth = Math.max(2, g.cell * 0.09);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
        ctx.moveTo(cx + d, cy - d); ctx.lineTo(cx - d, cy + d);
        ctx.stroke();
      }
    }
    var ko = game.koPoint;
    if (ko && state === 'playing') {
      var kx = g.pad + ko[1] * g.cell, ky = g.pad + ko[0] * g.cell;
      ctx.beginPath();
      ctx.arc(kx, ky, g.cell * 0.3, 0, 6.29);
      ctx.strokeStyle = 'rgba(227,59,45,0.85)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  function draw() {
    var size = game ? game.size : settings.size;
    var imgCfg = STYLE_IMG[settings.style];
    if (imgCfg && imgCfg.ready) drawImageBoard(imgCfg);
    else drawWood();
    drawGrid(size);
    drawCoords(size);

    if (game) {
      for (var r = 0; r < size; r++) {
        for (var c = 0; c < size; c++) {
          var v = game.board[r][c];
          if (v) drawStone(r, c, v);
        }
      }
      var last = lastStone();
      if (last) {
        var g = geo();
        var x = g.pad + last.c * g.cell, y = g.pad + last.r * g.cell;
        ctx.beginPath();
        ctx.arc(x, y, g.cell * 0.16, 0, 6.29);
        ctx.strokeStyle = last.color === 'b' ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,20,0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      if (ghost) drawStone(ghost.r, ghost.c, game.turn, 0.45);
      drawOverlays();
    }
  }

  // ------------------------------------------------------------ 提示 UI
  var toastTimer = null;
  var lastHintAt = 0;
  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.add('hidden'); }, 2400);
  }
  function toastOnce(msg) {
    var now = Date.now();
    if (now - lastHintAt < 6000) return;
    lastHintAt = now;
    toast(msg);
  }

  function setNotice(msg, action) {
    els.notice.textContent = '';
    var span = document.createElement('span');
    span.textContent = msg;
    els.notice.appendChild(span);
    if (action) {
      var wrap = document.createElement('span');
      wrap.className = 'notice-action';
      var b = document.createElement('button');
      b.className = 'btn primary';
      b.textContent = action.label;
      b.addEventListener('click', action.fn);
      wrap.appendChild(b);
      els.notice.appendChild(wrap);
    }
    els.notice.classList.remove('hidden');
  }
  function clearNotice() { els.notice.classList.add('hidden'); }

  function reasonMsg(reason) {
    switch (reason) {
      case 'occupied': return '这里已有棋子';
      case 'suicide': return '禁着点：落子后无气，又提不了对方的棋子';
      case 'ko': return '禁止全局同形（打劫）：先去别处落一手，下一轮再来提';
      case 'off-board': return '超出棋盘';
      case 'game-over': return '对局已结束';
      case 'not-your-turn': return '还没轮到这一方';
      default: return '不能下在这里';
    }
  }

  function colorName(color) { return color === W.BLACK ? '黑方' : '白方'; }

  // ------------------------------------------------------------ 状态刷新
  function updateStatus() {
    els.capB.textContent = game ? game.captures.b : 0;
    els.capW.textContent = game ? game.captures.w : 0;
    els.moveNo.textContent = game ? game.history.length : 0;

    var stoneCls = 'stone-icon ';
    var txt = '准备开局';
    if (state === 'playing') {
      if (thinking) {
        stoneCls += aiColor === W.BLACK ? 'black' : 'white';
        txt = '电脑思考中…';
      } else {
        stoneCls += game.turn === W.BLACK ? 'black' : 'white';
        txt = vsAi() ? (game.turn === W.BLACK ? '黑方行棋（你）' : '白方行棋（你）')
                     : colorName(game.turn) + '行棋';
      }
    } else if (state === 'scoring') {
      stoneCls += game && game.turn === W.BLACK ? 'black' : 'white';
      txt = '数子中 · 点击棋块标记死活';
    } else if (state === 'ended') {
      stoneCls += lastScore && lastScore.winner === W.WHITE ? 'white' : 'black';
      txt = resultType === 'resign' ? '对局结束 · 中盘胜' : '对局结束 · 数子完毕';
    } else {
      stoneCls += 'black';
    }
    els.turnStone.className = stoneCls;
    els.turnText.textContent = txt;
  }

  function refreshPanels() {
    els.setupPanel.classList.toggle('hidden', state !== 'setup');
    els.controlsRow.classList.toggle('hidden', state !== 'playing');
    els.scoringPanel.classList.toggle('hidden', state !== 'scoring');
    els.resultPanel.classList.toggle('hidden', state !== 'ended');
    var canAct = state === 'playing' && !thinking;
    els.btnUndo.disabled = !canAct || !game || !game.history.length ||
      (vsAi() && !playerHasMoves());
    els.btnPass.disabled = !canAct || (vsAi() && game.turn !== settings.playerColor);
    els.btnResign.disabled = !canAct || (vsAi() && game.turn !== settings.playerColor);
  }

  function updateAll() {
    updateStatus();
    refreshPanels();
  }

  // ------------------------------------------------------------ 对局流程
  function startNew() {
    cancelAiSearch();
    var n = parseInt(els.boardSize.value, 10);
    game = new W.GoGame({ size: n });
    settings.size = n;
    settings.opponent = els.opponent.value;
    if (settings.opponent !== 'human') settings.playerColor = els.playerColor.value;
    aiColor = settings.opponent === 'human' ? null
      : (settings.playerColor === 'b' ? W.WHITE : W.BLACK);
    state = 'playing';
    resultType = null;
    lastScore = null;
    deadMap = {};
    autoDead = {};
    ghost = null;
    clearNotice();
    updateAll();
    draw();
    save();
    // AI 执黑时开局面它先走
    if (aiColor && game.turn === aiColor) scheduleAi(false);
  }

  // ------------------------------------------------------------ AI 落子
  function vsAi() { return aiColor !== null; }

  function cancelAiSearch() {
    aiSeq++;
    if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }
    aiHandle = null;
    thinking = false;
  }

  // 玩家走完后叫 AI 想棋。原站同款 220ms 延迟，显得它在思考。
  function scheduleAi(opponentPassed) {
    cancelAiSearch();
    var seq = ++aiSeq;
    thinking = true;
    updateAll();
    draw();
    aiTimer = setTimeout(function () {
      if (seq !== aiSeq) return;
      var budget = MctsGo.budgetFor(settings.opponent, game.size);
      aiHandle = MctsGo.createSearch({
        board: game.board,
        size: game.size,
        turn: aiColor,
        komi: game.komi,
        koPoint: game.koPoint,
        opponentPassed: !!opponentPassed,
        seed: (Date.now() & 0x7fffffff)
      }, budget);
      (function step() {
        if (seq !== aiSeq) return;              // 被悔棋/新对局取消了
        if (!aiHandle.step(30)) { aiTimer = setTimeout(step, 0); return; }
        var res = aiHandle.result();
        aiHandle = null;
        applyAiResult(res);
      })();
    }, 220);
  }

  function applyAiResult(res) {
    thinking = false;
    if (state !== 'playing' || game.ended || game.turn !== aiColor) return;
    clearNotice();

    if (res.pass) {
      game.pass(aiColor);
    } else {
      var r = game.play(res.move[0], res.move[1], aiColor);
      if (!r.ok) {
        // 兜底链：树内只管简单劫，万一撞上全局同形被裁判拒——
        // 先选次优点，再不行随便一手合法棋，最后虚手
        var legal = game.legalMoves(aiColor);
        if (legal.length) {
          var mv = legal[Math.floor(Math.random() * legal.length)];
          game.play(mv[0], mv[1], aiColor);
        } else {
          game.pass(aiColor);
        }
      }
    }

    updateAll();
    save();
    draw();
    if (game.ended) { enterScoring(); return; }
    if (game.turn === aiColor) { scheduleAi(game.passes >= 1); return; }  // 理论到不了，保险
    if (!game.hasLegalMove(game.turn)) {
      setNotice('你没有合法着点，依规则应虚手。', { label: '虚手', fn: doPass });
    } else if (game.passes >= 1) {
      setNotice('电脑虚手。你也虚手即终局，进入数子。', { label: '虚手并数子', fn: doPass });
    }
  }

  function afterMove() {
    updateAll();
    save();
    draw();
    if (game.ended) { enterScoring(); return; }
    if (vsAi() && game.turn === aiColor) { scheduleAi(game.passes >= 1); return; }
    if (!game.hasLegalMove(game.turn)) {
      setNotice(colorName(game.turn) + '无合法着点，依规则应虚手。', {
        label: '虚手', fn: doPass
      });
    } else {
      clearNotice();
    }
  }

  function doPass() {
    if (state !== 'playing' || (vsAi() && (thinking || game.turn !== settings.playerColor))) return;
    var mover = game.turn;
    var res = game.pass();
    if (!res.ok) { toast(reasonMsg(res.reason)); return; }
    ghost = null;
    if (res.ended) {
      clearNotice();
      enterScoring();
    } else if (vsAi()) {
      setNotice('你虚手。电脑虚手即终局，进入数子。');
      updateAll();
      save();
      draw();
      scheduleAi(true);
    } else {
      setNotice(colorName(mover) + '虚手。' + colorName(game.turn) + '也虚手即终局，进入数子。', {
        label: colorName(game.turn) + '虚手', fn: doPass
      });
      updateAll();
      save();
      draw();
    }
  }

  function playerHasMoves() {
    if (!game) return false;
    for (var i = 0; i < game.history.length; i++) {
      if (game.history[i].color === settings.playerColor) return true;
    }
    return false;
  }

  function doUndo() {
    if (state !== 'playing' || thinking || !game.history.length) return;
    if (vsAi()) {
      if (!playerHasMoves()) return;          // 你还没走过，没有可悔的
      // 对 AI 悔棋 = 悔一整轮：先退一手，再退到重新轮到玩家为止
      game.undo();
      while (game.history.length && game.turn !== settings.playerColor) {
        game.undo();
      }
    } else {
      game.undo();
    }
    ghost = null;
    clearNotice();
    updateAll();
    save();
    draw();
    if (!game.hasLegalMove(game.turn)) {
      setNotice(colorName(game.turn) + '无合法着点，依规则应虚手。', { label: '虚手', fn: doPass });
    }
  }

  function doResign() {
    if (state !== 'playing' || thinking) return;
    if (vsAi() && game.turn !== settings.playerColor) return;
    var loser = game.turn;
    if (!window.confirm(colorName(loser) + '确定认输吗？')) return;
    var result = game.resign(loser);
    state = 'ended';
    resultType = 'resign';
    lastScore = null;
    clearNotice();
    els.resultTitle.textContent = colorName(result.winner) + '中盘胜';
    els.resultDetail.innerHTML = '';
    var p1 = document.createElement('div');
    p1.className = 'big';
    p1.textContent = colorName(result.loser) + '认输，' + colorName(result.winner) + '胜。';
    els.resultDetail.appendChild(p1);
    var p2 = document.createElement('div');
    p2.textContent = '共 ' + game.history.length + ' 手。';
    els.resultDetail.appendChild(p2);
    updateAll();
    save();
    draw();
  }

  function enterScoring() {
    state = 'scoring';
    autoDead = W.guessDeadStones(game.board);
    deadMap = {};
    for (var k in autoDead) {
      if (Object.prototype.hasOwnProperty.call(autoDead, k)) deadMap[k] = true;
    }
    updateAll();
    save();
    draw();
  }

  function backToPlay() {
    // 退掉末尾的连续虚手，回到实际对局
    while (game.history.length && game.history[game.history.length - 1].pass) {
      game.undo();
    }
    state = 'playing';
    deadMap = {};
    clearNotice();
    updateAll();
    save();
    draw();
    if (!game.hasLegalMove(game.turn)) {
      setNotice(colorName(game.turn) + '无合法着点，依规则应虚手。', { label: '虚手', fn: doPass });
    }
  }

  function confirmScore() {
    var s = game.score(deadMap);
    lastScore = s;
    state = 'ended';
    resultType = 'score';
    clearNotice();

    var title;
    if (s.winner === 'draw') title = '和棋';
    else title = (s.winner === W.BLACK ? '黑方' : '白方') + '胜 ' + fmtNum(s.margin) + ' 目';
    els.resultTitle.textContent = title;

    els.resultDetail.innerHTML = '';
    var big = document.createElement('div');
    big.className = 'big';
    big.textContent = '黑 ' + fmtNum(s.black) + '  ：  白 ' + fmtNum(s.white);
    els.resultDetail.appendChild(big);

    var line1 = document.createElement('div');
    line1.textContent = '黑 = 盘上 ' + s.stones.black + ' 子 + 地 ' + s.territory.black + ' 点';
    els.resultDetail.appendChild(line1);
    var line2 = document.createElement('div');
    line2.textContent = '白 = 盘上 ' + s.stones.white + ' 子 + 地 ' + s.territory.white +
      ' 点 + 贴目 ' + fmtNum(s.komi) + ' 目' +
      (s.territory.neutral ? '；公气 ' + s.territory.neutral + ' 点' : '');
    els.resultDetail.appendChild(line2);

    updateAll();
    save();
    draw();
  }

  function fmtNum(n) {
    return (Math.round(n * 100) / 100).toString();
  }

  function openSetup() {
    cancelAiSearch();
    state = 'setup';
    clearNotice();
    updateAll();
    els.playerColorLabel.classList.toggle('hidden', els.opponent.value === 'human');
    // 保留棋盘画面在背后作参考
  }

  // ------------------------------------------------------------ 落子交互
  function checkLegal(r, c) {
    return W.tryPlay(game.board, r, c, game.turn, function (key) {
      return game._seen[key] === true;
    });
  }

  canvas.addEventListener('click', function (e) {
    if (state !== 'playing' && state !== 'scoring') return;
    if (state === 'playing' && vsAi() && (thinking || game.turn !== settings.playerColor)) return;
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) * (LOGICAL / rect.width);
    var y = (e.clientY - rect.top) * (LOGICAL / rect.height);
    var pt = pointAt(x, y);
    if (!pt) return;

    if (state === 'scoring') {
      var keys = game.groupKeys(pt.r, pt.c);
      if (!keys.length) return;
      var mark = !deadMap[keys[0]];
      for (var i = 0; i < keys.length; i++) {
        if (mark) deadMap[keys[i]] = true;
        else delete deadMap[keys[i]];
      }
      draw();
      return;
    }

    // playing
    if (settings.confirm && !(ghost && ghost.r === pt.r && ghost.c === pt.c)) {
      var leg = checkLegal(pt.r, pt.c);
      if (!leg.ok) { toast(reasonMsg(leg.reason)); return; }
      ghost = pt;
      toastOnce('再点一次确认落子');
      draw();
      return;
    }
    ghost = null;
    var res = game.play(pt.r, pt.c);
    if (!res.ok) { toast(reasonMsg(res.reason)); return; }
    afterMove();
  });

  // ------------------------------------------------------------ 存档
  function save() {
    try {
      var data = {
        v: 1,
        phase: state,
        settings: settings,
        game: state === 'setup' ? null : game.toData()
      };
      if (state === 'scoring') data.deadMap = deadMap;
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) { /* 存不了就算了，不影响玩 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (!data || data.v !== 1) return false;
      if (data.settings) {
        settings = Object.assign(settings, data.settings);
      }
      var d = data.game;
      if (d && d.history && d.history.length > 0 && !d.ended) {
        game = W.GoGame.fromData(d);
        state = data.phase === 'scoring' ? 'scoring' : 'playing';
        if (state === 'scoring') {
          autoDead = W.guessDeadStones(game.board);
          deadMap = {};
          var dm = data.deadMap || {};
          for (var k in dm) {
            if (Object.prototype.hasOwnProperty.call(dm, k)) deadMap[k] = true;
          }
        }
        return true;
      }
      return false;
    } catch (e) { return false; }
  }

  // ------------------------------------------------------------ 事件绑定
  els.btnPass.addEventListener('click', doPass);
  els.btnUndo.addEventListener('click', doUndo);
  els.btnResign.addEventListener('click', doResign);
  els.btnConfirmScore.addEventListener('click', confirmScore);
  els.btnResetDead.addEventListener('click', function () {
    deadMap = {};
    for (var k in autoDead) {
      if (Object.prototype.hasOwnProperty.call(autoDead, k)) deadMap[k] = true;
    }
    draw();
  });
  els.btnBackPlay.addEventListener('click', backToPlay);
  els.btnStart.addEventListener('click', startNew);
  els.btnAgain.addEventListener('click', openSetup);
  els.btnNew.addEventListener('click', function () {
    if (state === 'playing' && game && game.history.length > 0) {
      if (!window.confirm('当前对局尚未结束，确定开新局？')) return;
    }
    openSetup();
  });
  els.boardStyle.addEventListener('change', function () {
    settings.style = els.boardStyle.value;
    draw();
    save();
    var icfg = STYLE_IMG[settings.style];
    if (icfg && !icfg.ready) toast(icfg.label + '棋盘图片还在加载，马上就好');
  });
  els.confirmToggle.addEventListener('change', function () {
    settings.confirm = els.confirmToggle.checked;
    if (!settings.confirm) ghost = null;
    draw();
    save();
  });
  els.opponent.addEventListener('change', function () {
    els.playerColorLabel.classList.toggle('hidden', els.opponent.value === 'human');
  });

  // ------------------------------------------------------------ 启动
  (function init() {
    var restored = load();
    els.boardStyle.value = settings.style;
    els.confirmToggle.checked = settings.confirm;
    els.boardSize.value = String(settings.size);
    els.opponent.value = settings.opponent;
    els.playerColor.value = settings.playerColor;
    els.playerColorLabel.classList.toggle('hidden', settings.opponent === 'human');
    if (restored) {
      aiColor = settings.opponent === 'human' ? null
        : (settings.playerColor === 'b' ? W.WHITE : W.BLACK);
      toast('已恢复上次的对局（第 ' + game.history.length + ' 手）');
      if (state === 'playing' && aiColor && game.turn === aiColor) {
        scheduleAi(game.passes >= 1);       // 恢复时正好轮到电脑，接着想
      }
    }
    updateAll();
    draw();
  })();

})();
