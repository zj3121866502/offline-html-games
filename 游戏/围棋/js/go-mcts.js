/*
 * 围棋 AI —— 蒙特卡洛树搜索（MCTS）
 * ------------------------------------------------------------
 * 自写实现，沿用业界通用的浏览器围棋 MCTS 设计：
 *   - 拍平 Int8Array 棋盘 + 每路棋盘预计算邻接/斜角表 + 代数标记洪水填充，
 *     数气用“数够 cap 口就提前收工”的截断版（热点在全盘数气上）
 *   - UCT 选择 + 先验渐进偏置（提吃/救叫吃/压两气/避自撞气/线位/贴子）
 *   - 快棋带战术直觉：90% 先看上一手旁边有没有提吃或逃生，随机落点时
 *     跳过真眼、跳过非法点、九成跳过自撞气；双虚手即终局
 *   - 中国规则数子计分；奖励 = 输赢 + 一成目差梯度（防落后摆烂/领先躺平）
 *   - 树内只管简单劫；全局同形由外部裁判（GoGame）把关
 *
 * 浏览器里不用 Web Worker（file:// 打开不可靠），搜索支持分片：
 *   var h = MctsGo.createSearch(req, budget);
 *   (function loop(){ if (!h.step(30)) setTimeout(loop, 0); else use(h.result()); })();
 * node 里直接用 genMoveSync 一步到位（arena 测试用）。
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.MctsGo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EMPTY = 0, BLACK = 1, WHITE = 2, PASS = -1;

  // ------------------------------------------------------------- 随机数
  var rngState = 123456789;
  function seed(s) { rngState = (s | 0) || 123456789; }
  function rnd() {
    rngState ^= rngState << 13; rngState |= 0;
    rngState ^= rngState >>> 17;
    rngState ^= rngState << 5; rngState |= 0;
    return (rngState >>> 0) / 4294967296;
  }
  function rndInt(n) { return (rnd() * n) | 0; }

  // ------------------------------------------- 邻接/斜角表（每路棋盘一份）
  var tblCache = {};
  function tables(size) {
    if (tblCache[size]) return tblCache[size];
    var n2 = size * size;
    var nbrs = new Int32Array(n2 * 4), cnt = new Int8Array(n2);
    var diags = new Int32Array(n2 * 4), dcnt = new Int8Array(n2);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var i = r * size + c, k = 0, d = 0;
        if (r > 0) nbrs[i * 4 + k++] = i - size;
        if (r < size - 1) nbrs[i * 4 + k++] = i + size;
        if (c > 0) nbrs[i * 4 + k++] = i - 1;
        if (c < size - 1) nbrs[i * 4 + k++] = i + 1;
        cnt[i] = k;
        if (r > 0 && c > 0) diags[i * 4 + d++] = i - size - 1;
        if (r > 0 && c < size - 1) diags[i * 4 + d++] = i - size + 1;
        if (r < size - 1 && c > 0) diags[i * 4 + d++] = i + size - 1;
        if (r < size - 1 && c < size - 1) diags[i * 4 + d++] = i + size + 1;
        dcnt[i] = d;
      }
    }
    return tblCache[size] = { nbrs: nbrs, cnt: cnt, diags: diags, dcnt: dcnt };
  }

  // ------------------------------------------------------------ 快速局面
  function Pos(size) {
    this.size = size;
    this.n2 = size * size;
    var t = tables(size);
    this.nbrs = t.nbrs; this.ncnt = t.cnt;
    this.diags = t.diags; this.dcnt = t.dcnt;
    this.board = new Int8Array(this.n2);
    this.ko = -1;          // 简单劫禁点
    this.turn = BLACK;
    this.passes = 0;       // 连续虚手数
    this.lastMove = -2;    // -2 尚无，-1 虚手
    this._mark = new Int32Array(this.n2);
    this._gen = 0;
    this._stack = new Int32Array(this.n2);
    this._grp = new Int32Array(this.n2);
    this._libs = 0; this._gcount = 0; this._lastLib = -1;
    this._libsMap = null; this._sizeMap = null; this._idMap = null;  // groupMaps 懒建
    this._trial = null;    // 试下用的副本局面
  }

  Pos.prototype.copyFrom = function (o) {
    this.board.set(o.board);
    this.ko = o.ko; this.turn = o.turn; this.passes = o.passes; this.lastMove = o.lastMove;
  };

  // 洪水填充 (idx) 所在棋块：气数、子数、成员、最后一口气
  Pos.prototype.groupInfo = function (idx) {
    var color = this.board[idx];
    var gen = ++this._gen, mark = this._mark, stack = this._stack, grp = this._grp;
    var board = this.board, nbrs = this.nbrs, ncnt = this.ncnt;
    var sp = 0, gp = 0, libs = 0, lastLib = -1;
    stack[sp++] = idx; mark[idx] = gen;
    while (sp) {
      var cur = stack[--sp];
      grp[gp++] = cur;
      var base = cur * 4, m = ncnt[cur];
      for (var i = 0; i < m; i++) {
        var nb = nbrs[base + i];
        if (mark[nb] === gen) continue;
        var v = board[nb];
        if (v === EMPTY) { mark[nb] = gen; libs++; lastLib = nb; }
        else if (v === color) { mark[nb] = gen; stack[sp++] = nb; }
      }
    }
    this._libs = libs; this._gcount = gp; this._lastLib = lastLib;
    return libs;
  };

  // 只数到 cap 口就返回（walk 完成时 count<cap，成员/最后一口气才可信）
  Pos.prototype.libsUpTo = function (idx, cap) {
    var color = this.board[idx];
    var gen = ++this._gen, mark = this._mark, stack = this._stack, grp = this._grp;
    var board = this.board, nbrs = this.nbrs, ncnt = this.ncnt;
    var sp = 0, gp = 0, libs = 0, lastLib = -1;
    stack[sp++] = idx; mark[idx] = gen;
    while (sp) {
      var cur = stack[--sp];
      grp[gp++] = cur;
      var base = cur * 4, m = ncnt[cur];
      for (var i = 0; i < m; i++) {
        var nb = nbrs[base + i];
        if (mark[nb] === gen) continue;
        var v = board[nb];
        if (v === EMPTY) {
          mark[nb] = gen; libs++; lastLib = nb;
          if (libs >= cap) { this._libs = libs; this._gcount = gp; this._lastLib = lastLib; return libs; }
        } else if (v === color) { mark[nb] = gen; stack[sp++] = nb; }
      }
    }
    this._libs = libs; this._gcount = gp; this._lastLib = lastLib;
    return libs;
  };

  // 落子（会改盘）。返回提子数，非法返回 -1。树内只管简单劫。
  Pos.prototype.play = function (idx, color) {
    if (idx === PASS) {
      this.passes++; this.ko = -1; this.turn = 3 - color; this.lastMove = PASS;
      return 0;
    }
    var board = this.board;
    if (board[idx] !== EMPTY || idx === this.ko) return -1;
    var opp = 3 - color;
    board[idx] = color;
    var captured = 0, koCand = -1;
    var base = idx * 4, m = this.ncnt[idx];
    for (var i = 0; i < m; i++) {
      var nb = this.nbrs[base + i];
      if (board[nb] !== opp) continue;
      if (this.libsUpTo(nb, 1) === 0) {          // 返回 0 必然是走完了整块
        var gc = this._gcount, grp = this._grp;
        for (var s = 0; s < gc; s++) board[grp[s]] = EMPTY;
        captured += gc;
        if (gc === 1) koCand = nb;
      }
    }
    if (captured === 0) {
      if (this.libsUpTo(idx, 1) === 0) { board[idx] = EMPTY; return -1; }  // 自杀
      this.ko = -1;
    } else if (captured === 1) {
      this.libsUpTo(idx, 2);
      this.ko = (this._gcount === 1 && this._libs === 1) ? koCand : -1;
    } else {
      this.ko = -1;
    }
    this.passes = 0; this.turn = opp; this.lastMove = idx;
    return captured;
  };

  // 不动盘的合法性检查（简单劫）
  Pos.prototype.isLegal = function (idx, color) {
    var board = this.board;
    if (board[idx] !== EMPTY || idx === this.ko) return false;
    var base = idx * 4, m = this.ncnt[idx], opp = 3 - color, i;
    for (i = 0; i < m; i++) if (board[this.nbrs[base + i]] === EMPTY) return true;
    for (i = 0; i < m; i++) {
      var nb = this.nbrs[base + i], v = board[nb];
      if (v === opp) { if (this.libsUpTo(nb, 2) === 1) return true; }        // 能提
      else if (v === color) { if (this.libsUpTo(nb, 2) >= 2) return true; }  // 连上还有气
    }
    return false;
  };

  // 真眼判定：四邻全己方；斜角边角全己方、中腹至多一个敌方
  Pos.prototype.isEyeLike = function (idx, color) {
    var board = this.board, base = idx * 4, m = this.ncnt[idx], i;
    for (i = 0; i < m; i++) if (board[this.nbrs[base + i]] !== color) return false;
    var opp = 3 - color, dm = this.dcnt[idx], bad = 0;
    for (i = 0; i < dm; i++) if (board[this.diags[base + i]] === opp) bad++;
    if (dm < 4) return bad === 0;   // 边/角
    return bad <= 1;                // 中腹
  };

  // 落下后自己（不提子时）只剩一口气？
  Pos.prototype.isSelfAtari = function (idx, color) {
    var base = idx * 4, m = this.ncnt[idx], board = this.board;
    var empties = 0;
    for (var i = 0; i < m; i++) if (board[this.nbrs[base + i]] === EMPTY) empties++;
    if (empties >= 2) return false;   // 两个以上直邻空点不可能自撞气
    var t = this._trial || (this._trial = new Pos(this.size));
    t.copyFrom(this);
    var cap = t.play(idx, color);
    if (cap < 0) return false;
    return cap === 0 && t.libsUpTo(idx, 2) === 1;
  };

  // 中国规则数子：返回 黑 - 白 - 贴目
  Pos.prototype.scoreArea = function (komi) {
    var board = this.board, n2 = this.n2;
    var black = 0, white = 0;
    var gen = ++this._gen, mark = this._mark, stack = this._stack;
    for (var i = 0; i < n2; i++) {
      var v = board[i];
      if (v === BLACK) { black++; continue; }
      if (v === WHITE) { white++; continue; }
      if (mark[i] === gen) continue;
      var sp = 0, cnt = 0, touchB = false, touchW = false;
      stack[sp++] = i; mark[i] = gen;
      while (sp) {
        var cur = stack[--sp];
        cnt++;
        var base = cur * 4, m = this.ncnt[cur];
        for (var k = 0; k < m; k++) {
          var nb = this.nbrs[base + k], bv = board[nb];
          if (bv === EMPTY) { if (mark[nb] !== gen) { mark[nb] = gen; stack[sp++] = nb; } }
          else if (bv === BLACK) touchB = true;
          else touchW = true;
        }
      }
      if (touchB && !touchW) black += cnt;
      else if (touchW && !touchB) white += cnt;
    }
    return black - white - komi;
  };

  // --------------------------------------------------------------- 快棋
  // 上一手旁边的战术：提掉只剩一口气的敌方棋块，或救出自己快死的棋块
  Pos.prototype.tacticalMove = function (color) {
    var last = this.lastMove;
    if (last < 0) return -1;
    var board = this.board, opp = 3 - color;
    if (board[last] === opp && this.libsUpTo(last, 2) === 1) {
      var lib = this._lastLib;
      if (this.isLegal(lib, color)) return lib;
    }
    var base = last * 4, m = this.ncnt[last];
    for (var i = 0; i < m; i++) {
      var nb = this.nbrs[base + i];
      if (board[nb] !== color) continue;
      if (this.libsUpTo(nb, 2) === 1) {
        var esc = this._lastLib;
        if (this.isLegal(esc, color) && !this.isSelfAtari(esc, color)) return esc;
      }
    }
    return -1;
  };

  Pos.prototype.genPlayoutMove = function () {
    var color = this.turn, board = this.board, n2 = this.n2;
    if (rnd() < 0.9) {
      var t = this.tacticalMove(color);
      if (t >= 0) return t;
    }
    var start = rndInt(n2);
    for (var k = 0; k < n2; k++) {
      var idx = start + k; if (idx >= n2) idx -= n2;
      if (board[idx] !== EMPTY) continue;
      if (this.isEyeLike(idx, color)) continue;
      if (!this.isLegal(idx, color)) continue;
      if (this.isSelfAtari(idx, color) && rnd() < 0.9) continue;
      return idx;
    }
    return PASS;
  };

  Pos.prototype.playout = function (komi, maxMoves) {
    var moves = 0;
    while (this.passes < 2 && moves < maxMoves) {
      this.play(this.genPlayoutMove(), this.turn);
      moves++;
    }
    return this.scoreArea(komi);
  };

  // ------------------------------------------------------------ 先验分
  // 一遍洪水填充把每颗子的气数/块大小/块 id 记进映射，下面的打分全是 O(1)
  Pos.prototype.groupMaps = function () {
    var n2 = this.n2, board = this.board;
    if (!this._libsMap) {
      this._libsMap = new Int16Array(n2);
      this._sizeMap = new Int16Array(n2);
      this._idMap = new Int32Array(n2);
    }
    var libsMap = this._libsMap, sizeMap = this._sizeMap, idMap = this._idMap;
    idMap.fill(-1);
    for (var i = 0; i < n2; i++) {
      if (board[i] === EMPTY || idMap[i] !== -1) continue;
      this.groupInfo(i);
      var cnt = this._gcount, grp = this._grp;
      for (var s = 0; s < cnt; s++) {
        var st = grp[s];
        libsMap[st] = this._libs; sizeMap[st] = cnt; idMap[st] = i;
      }
    }
    return { libs: libsMap, size: sizeMap, id: idMap };
  };

  function movePrior(pos, idx, color, maps) {
    var p = 0, board = pos.board, opp = 3 - color;
    var base = idx * 4, m = pos.ncnt[idx];
    var capStones = 0, ownAtariStones = 0, oppTwoLibs = 0, nearStone = false;
    var empties = 0, ownExtraLibs = 0, seenG1 = -1, seenG2 = -1;
    for (var i = 0; i < m; i++) {
      var nb = pos.nbrs[base + i], v = board[nb];
      if (v === EMPTY) { empties++; continue; }
      nearStone = true;
      if (v === opp) {
        var l = maps.libs[nb];
        if (l === 1) capStones += maps.size[nb];
        else if (l === 2) oppTwoLibs++;
      } else {
        var gid = maps.id[nb];
        if (gid === seenG1 || gid === seenG2) continue;
        if (seenG1 === -1) seenG1 = gid; else seenG2 = gid;
        var ol = maps.libs[nb];
        if (ol === 1) ownAtariStones += maps.size[nb];
        else ownExtraLibs += ol - 1;   // idx 是它一口气，落子后还剩 ol-1 口
      }
    }
    var estLibs = empties + ownExtraLibs;                    // 忽略共气重叠，排序够用
    var selfAtari = capStones === 0 && estLibs <= 1;
    if (capStones) p += 6 + Math.min(capStones, 10);         // 提子
    if (ownAtariStones && !selfAtari) p += 5 + Math.min(ownAtariStones, 10); // 救叫吃
    if (oppTwoLibs) p += 1.2;                                // 压两气
    if (selfAtari) p -= 6;                                   // 送吃
    var size = pos.size, r = (idx / size) | 0, c = idx % size;
    var edge = Math.min(r, size - 1 - r, c, size - 1 - c);
    if (edge === 0) p -= 1.5;                                // 一线
    else if (edge === 1) p += 0.2;
    else if (edge === 2 || edge === 3) p += 1.0;             // 三四线
    else p += 0.4;
    if (!nearStone) {
      var dm = pos.dcnt[idx];
      for (var d = 0; d < dm; d++) if (board[pos.diags[base + d]] !== EMPTY) { nearStone = true; break; }
    }
    if (nearStone) p += 0.6;                                 // 别乱飞
    return p;
  }

  // ---------------------------------------------------------------- MCTS
  function Node(move, prior) {
    this.move = move;
    this.prior = prior;
    this.visits = 0;
    this.wins = 0;          // 落下这手的一方视角的累计奖励
    this.children = null;
    this.terminal = false;
    this.termScore = 0;     // 终局节点存 黑-白-贴目
  }

  var UCT_C = 0.85, PRIOR_W = 2.2, MARGIN_W = 0.1;

  function selectChild(node) {
    var logN = Math.log(node.visits + 1);
    var best = null, bestVal = -Infinity;
    var kids = node.children;
    for (var i = 0; i < kids.length; i++) {
      var ch = kids[i];
      var q = ch.visits ? ch.wins / ch.visits : 0.45;   // 没试过的枝按微亏估，逼着去试
      var v = q + UCT_C * Math.sqrt(logN / (ch.visits + 1)) + PRIOR_W * ch.prior / (ch.visits + 1);
      if (v > bestVal) { bestVal = v; best = ch; }
    }
    return best;
  }

  function expand(node, pos) {
    var color = pos.turn, n2 = pos.n2, board = pos.board;
    var maps = pos.groupMaps();
    var children = [], mx = -1e9, mn = 1e9;
    for (var idx = 0; idx < n2; idx++) {
      if (board[idx] !== EMPTY) continue;
      if (pos.isEyeLike(idx, color)) continue;
      if (!pos.isLegal(idx, color)) continue;
      var p = movePrior(pos, idx, color, maps);
      if (p > mx) mx = p;
      if (p < mn) mn = p;
      children.push(new Node(idx, p));
    }
    // 大棋盘养不起 300+ 分支：只留先验最好的（砍掉的基本是一线废点）
    var cap = pos.size >= 19 ? 96 : pos.size >= 13 ? 140 : 999;
    if (children.length > cap) {
      children.sort(function (a, b) { return b.prior - a.prior; });
      children.length = cap;
    }
    var span = (mx - mn) || 1;
    for (var i = 0; i < children.length; i++) children[i].prior = (children[i].prior - mn) / span;
    // 对手虚手过（或快没棋下了）就让树考虑虚手收场
    if (pos.passes >= 1 || children.length <= 3) children.push(new Node(PASS, 0.1));
    node.children = children;
  }

  // ------------------------------------------------------------ 搜索执行
  function Search(rootPos, opts) {
    this.rootPos = rootPos;
    this.komi = opts.komi;
    this.timeMs = opts.timeMs || 0;
    this.maxPo = opts.maxPlayouts || 1e9;
    this.root = new Node(PASS, 0);
    this.sim = new Pos(rootPos.size);
    this.maxMoves = rootPos.n2 * 3;
    this.maxDepth = rootPos.n2 * 2;
    this.marginScale = rootPos.n2 / 8;   // 9路约10目、19路约45目的梯度尺度
    this.playouts = 0;
    this.t0 = Date.now();
    this.done = false;
  }

  // 跑一段时间片（毫秒）。返回 true 表示预算用尽、搜索结束。
  Search.prototype.step = function (sliceMs) {
    if (this.done) return true;
    var sliceEnd = Date.now() + sliceMs;
    while (this.playouts < this.maxPo) {
      if ((this.playouts & 7) === 0) {
        if (this.timeMs && Date.now() - this.t0 >= this.timeMs) break;
        if (Date.now() >= sliceEnd) return false;
      }
      this.runOne();
    }
    this.done = true;
    return true;
  };

  Search.prototype.runOne = function () {
    var sim = this.sim, komi = this.komi;
    sim.copyFrom(this.rootPos);
    var node = this.root;
    var path = [this.root];

    while (!node.terminal) {
      if (node.children === null) expand(node, sim);
      var next = selectChild(node);
      sim.play(next.move, sim.turn);
      path.push(next);
      node = next;
      if (sim.passes >= 2) {
        node.terminal = true;
        node.termScore = sim.scoreArea(komi);
        break;
      }
      if (node.visits === 0 || path.length > this.maxDepth) break;
    }

    var score = node.terminal ? node.termScore : sim.playout(komi, this.maxMoves);
    var rewardB = (score > 0 ? 1 : 0) + MARGIN_W * Math.tanh(score / this.marginScale);
    var mover = this.rootPos.turn;
    for (var i = 1; i < path.length; i++) {
      var nd = path[i];
      nd.visits++;
      nd.wins += (mover === BLACK) ? rewardB : 1 - rewardB;
      mover = 3 - mover;
    }
    this.root.visits++;
    this.playouts++;
  };

  Search.prototype.result = function () {
    var best = null, kids = this.root.children;
    if (kids) {
      for (var j = 0; j < kids.length; j++) {
        if (!best || kids[j].visits > best.visits) best = kids[j];
      }
    }
    if (!best || best.move === PASS) {
      return { pass: true, playouts: this.playouts,
               winrate: best && best.visits ? best.wins / best.visits : 0 };
    }
    var size = this.rootPos.size;
    return { move: [(best.move / size) | 0, best.move % size], playouts: this.playouts,
             winrate: best.visits ? best.wins / best.visits : 0 };
  };

  // ------------------------------------------------------------ 对外接口
  // 难度预算：简单=小盘数，中等=中预算，困难=只限时（棋盘越大给得越多）
  function budgetFor(diff, size) {
    if (diff === 'easy') return { timeMs: 600, maxPlayouts: 150 };
    if (diff === 'medium') return { timeMs: 1500, maxPlayouts: 1200 };
    return { timeMs: size >= 19 ? 2600 : size >= 13 ? 1800 : 1200, maxPlayouts: 1e9 };
  }

  // 组一个可分片的搜索句柄。req: {board(2D 'b'/'w'/null), size, turn, komi,
  // koPoint, opponentPassed, seed}
  function createSearch(req, budget) {
    var size = req.size || req.board.length;
    var pos = new Pos(size);
    for (var r = 0; r < size; r++) {
      for (var c = 0; c < size; c++) {
        var v = req.board[r][c];
        pos.board[r * size + c] = v === 'b' ? BLACK : v === 'w' ? WHITE : EMPTY;
      }
    }
    pos.turn = req.turn === 'w' ? WHITE : BLACK;
    pos.ko = req.koPoint ? req.koPoint[0] * size + req.koPoint[1] : -1;
    pos.passes = req.opponentPassed ? 1 : 0;
    if (req.seed) seed(req.seed);
    var s = new Search(pos, {
      komi: req.komi != null ? req.komi : 7.5,
      timeMs: budget.timeMs,
      maxPlayouts: budget.maxPlayouts
    });
    return s;
  }

  // 同步一把出招（node/arena 用）
  function genMoveSync(req) {
    var budget = { timeMs: req.timeMs || 0, maxPlayouts: req.maxPlayouts || 1e9 };
    var s = createSearch(req, budget);
    s.step(1e9);
    return s.result();
  }

  return {
    budgetFor: budgetFor,
    createSearch: createSearch,
    genMoveSync: genMoveSync,
    seed: seed,
    Pos: Pos,
    _internals: { movePrior: movePrior, Node: Node, EMPTY: EMPTY, BLACK: BLACK, WHITE: WHITE, PASS: PASS }
  };
});
