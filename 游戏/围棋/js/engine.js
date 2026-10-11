/*
 * 围棋规则引擎（中国规则）
 * ------------------------------------------------------------
 * 被 index.html 和 node 冒烟测试共用（UMD）。
 *
 * 实现的规则：
 *   - 气：直线紧邻的空点；同色连体共气
 *   - 提子：落子后先提对方无气之子（双方同时无气时提对方）
 *   - 禁着点：落子后自己无气且未提对方子 → 不许下（一人一判）
 *   - 禁止全局同形：不得重现任何曾出现过的整盘局面（含打劫）
 *   - 虚手：双方连续虚手即终局；一方认输即终局
 *   - 数子法计分：盘上活子 + 围住的空点；白棋贴 7.5 目（= 黑贴 3¾ 子）
 *   - 死子预判：终局后自动预标死子，仅供人工核对，判定可能有误
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.Weiqi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BLACK = 'b';
  var WHITE = 'w';
  var DEFAULT_SIZE = 19;
  var DEFAULT_KOMI = 7.5;

  function other(color) { return color === BLACK ? WHITE : BLACK; }

  function emptyBoard(size) {
    var b = [];
    for (var r = 0; r < size; r++) {
      var row = [];
      for (var c = 0; c < size; c++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function cloneBoard(board) {
    var b = [];
    for (var r = 0; r < board.length; r++) b.push(board[r].slice());
    return b;
  }

  // 整盘局面串，用于“禁止全局同形”比对
  function boardKey(board) {
    var s = '';
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board.length; c++) {
        var v = board[r][c];
        s += v === BLACK ? 'b' : v === WHITE ? 'w' : '.';
      }
    }
    return s;
  }

  // 由局面串还原棋盘（存档恢复用）
  function boardFromKey(key, size) {
    var b = emptyBoard(size);
    for (var i = 0; i < key.length && i < size * size; i++) {
      var ch = key.charAt(i);
      var r = Math.floor(i / size), c = i % size;
      b[r][c] = ch === 'b' ? BLACK : ch === 'w' ? WHITE : null;
    }
    return b;
  }

  var DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

  // (r,c) 所在的同色连通块及其气。斜对角不相邻。
  function collectGroup(board, r, c) {
    var size = board.length;
    var color = board[r][c];
    if (!color) return { stones: [], liberties: [] };
    var stones = [];
    var libSet = {};
    var seen = {};
    var stack = [[r, c]];
    seen[r + ',' + c] = true;
    while (stack.length) {
      var cur = stack.pop();
      var cr = cur[0], cc = cur[1];
      stones.push([cr, cc]);
      for (var i = 0; i < 4; i++) {
        var nr = cr + DIRS[i][0], nc = cc + DIRS[i][1];
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
        var v = board[nr][nc];
        var k = nr + ',' + nc;
        if (v === null) {
          libSet[k] = [nr, nc];
        } else if (v === color && !seen[k]) {
          seen[k] = true;
          stack.push([nr, nc]);
        }
      }
    }
    var liberties = [];
    for (var key in libSet) {
      if (Object.prototype.hasOwnProperty.call(libSet, key)) liberties.push(libSet[key]);
    }
    return { stones: stones, liberties: liberties };
  }

  function countLiberties(board, r, c) {
    return collectGroup(board, r, c).liberties.length;
  }

  // 在棋盘副本上试下一子。返回 { ok, board, captures, reason }，不改原盘。
  // posForbidden(key)：若试下后的整盘局面曾被出现过则返回 true（全局同形）。
  // 顺序即规则：先提对方无气子，再检查自己是否无气（自杀）。
  function tryPlay(board, r, c, color, posForbidden) {
    var size = board.length;
    if (r < 0 || r >= size || c < 0 || c >= size) return { ok: false, reason: 'off-board' };
    if (board[r][c] !== null) return { ok: false, reason: 'occupied' };

    var nb = cloneBoard(board);
    nb[r][c] = color;
    var opp = other(color);
    var captures = [];

    for (var i = 0; i < 4; i++) {
      var nr = r + DIRS[i][0], nc = c + DIRS[i][1];
      if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
      if (nb[nr][nc] !== opp) continue;
      var grp = collectGroup(nb, nr, nc);
      if (grp.liberties.length === 0) {
        for (var s = 0; s < grp.stones.length; s++) {
          var st = grp.stones[s];
          if (nb[st[0]][st[1]] !== null) {
            nb[st[0]][st[1]] = null;
            captures.push([st[0], st[1]]);
          }
        }
      }
    }

    // 提完对方后自己仍无气 → 禁着点
    if (countLiberties(nb, r, c) === 0) {
      return { ok: false, reason: 'suicide' };
    }

    if (posForbidden && posForbidden(boardKey(nb))) {
      return { ok: false, reason: 'ko' };
    }

    return { ok: true, board: nb, captures: captures };
  }

  // ---------------------------------------------------------- 数子法计分
  // deadMap："r,c" => true，视为终局死子，计数前先移除。
  // 得分 = 盘上活子 + 围住的空点；白棋加贴目（默认 7.5 目）。
  function scoreArea(board, komi, deadMap) {
    var size = board.length;
    deadMap = deadMap || {};
    var work = cloneBoard(board);
    var r, c, s;

    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (deadMap[r + ',' + c] && work[r][c]) work[r][c] = null;
      }
    }

    var stonesBlack = 0, stonesWhite = 0;
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (work[r][c] === BLACK) stonesBlack++;
        else if (work[r][c] === WHITE) stonesWhite++;
      }
    }

    // 空点连通区域：只被一色包围算那一色的地，两色都贴边算公气
    var seen = {};
    var terrBlack = 0, terrWhite = 0, terrNeutral = 0;
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (work[r][c] !== null || seen[r + ',' + c]) continue;
        var borders = {};
        var stack = [[r, c]];
        var count = 0;
        seen[r + ',' + c] = true;
        while (stack.length) {
          var cur = stack.pop();
          var cr = cur[0], cc = cur[1];
          count++;
          for (var i = 0; i < 4; i++) {
            var nr = cr + DIRS[i][0], nc = cc + DIRS[i][1];
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            var v = work[nr][nc];
            var k = nr + ',' + nc;
            if (v === null) {
              if (!seen[k]) { seen[k] = true; stack.push([nr, nc]); }
            } else {
              borders[v] = true;
            }
          }
        }
        if (borders[BLACK] && !borders[WHITE]) terrBlack += count;
        else if (borders[WHITE] && !borders[BLACK]) terrWhite += count;
        else terrNeutral += count;
      }
    }

    var black = stonesBlack + terrBlack;
    var white = stonesWhite + terrWhite + (komi || 0);
    var margin = black - white;
    return {
      black: black,
      white: white,
      komi: komi || 0,
      stones: { black: stonesBlack, white: stonesWhite },
      territory: { black: terrBlack, white: terrWhite, neutral: terrNeutral },
      winner: margin === 0 ? 'draw' : (margin > 0 ? BLACK : WHITE),
      margin: Math.abs(margin)
    };
  }

  // 每个交叉点的归属，用于数子时的盘面着色。
  // 返回 N×N 数组：'b' | 'w' | null（null = 无主/公气）。
  function territoryGrid(board, deadMap) {
    var size = board.length;
    deadMap = deadMap || {};
    var work = cloneBoard(board);
    var r, c;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) {
      if (deadMap[r + ',' + c] && work[r][c]) work[r][c] = null;
    }
    var grid = [];
    for (r = 0; r < size; r++) {
      grid.push([]);
      for (c = 0; c < size; c++) grid[r].push(null);
    }
    var seen = {};
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (work[r][c] !== null || seen[r + ',' + c]) continue;
        var region = [], borders = {}, stack = [[r, c]];
        seen[r + ',' + c] = true;
        while (stack.length) {
          var cur = stack.pop(), cr = cur[0], cc = cur[1];
          region.push([cr, cc]);
          for (var i = 0; i < 4; i++) {
            var nr = cr + DIRS[i][0], nc = cc + DIRS[i][1];
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            var v = work[nr][nc], k = nr + ',' + nc;
            if (v === null) { if (!seen[k]) { seen[k] = true; stack.push([nr, nc]); } }
            else borders[v] = true;
          }
        }
        var owner = (borders[BLACK] && !borders[WHITE]) ? BLACK
          : (borders[WHITE] && !borders[BLACK]) ? WHITE : null;
        if (owner) {
          for (var s = 0; s < region.length; s++) grid[region[s][0]][region[s][1]] = owner;
        }
      }
    }
    return grid;
  }

  // ---------------------------------------------------- Benson 算法（1976）
  // 判定哪些棋块“无条件活”：即使对方连续着手、己方一手不应也无法被提。
  // 这是定理不是启发式——它Certified的块绝不能被预标为死子。
  // 健全但不完备：多数活棋不是“无条件活”（需应劫/应叫吃），双活通常无眼，
  // 所以 Benson 沉默只说明不能排除，不能证明死活。
  function bensonAlive(board, color) {
    var size = board.length, r, c, i;
    var chainId = {}, chains = [];
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (board[r][c] !== color || chainId[r + ',' + c] !== undefined) continue;
        var id = chains.length, stones = [], libs = {};
        var st = [[r, c]];
        chainId[r + ',' + c] = id;
        while (st.length) {
          var p = st.pop();
          stones.push(p);
          for (i = 0; i < 4; i++) {
            var nr = p[0] + DIRS[i][0], nc = p[1] + DIRS[i][1];
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            var v = board[nr][nc];
            if (v === null) libs[nr + ',' + nc] = true;
            else if (v === color && chainId[nr + ',' + nc] === undefined) {
              chainId[nr + ',' + nc] = id;
              st.push([nr, nc]);
            }
          }
        }
        chains.push({ stones: stones, libs: libs });
      }
    }
    if (!chains.length) return {};

    // 非 color 点的连通区域（空点 + 敌子），记录其贴着的 color 棋块
    var seen = {}, regions = [];
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (board[r][c] === color || seen[r + ',' + c]) continue;
        var empties = [], borders = {}, touches = false;
        var s2 = [[r, c]];
        seen[r + ',' + c] = true;
        while (s2.length) {
          var q = s2.pop();
          if (board[q[0]][q[1]] === null) empties.push(q[0] + ',' + q[1]);
          for (i = 0; i < 4; i++) {
            var mr = q[0] + DIRS[i][0], mc = q[1] + DIRS[i][1];
            if (mr < 0 || mr >= size || mc < 0 || mc >= size) continue;
            if (board[mr][mc] === color) { borders[chainId[mr + ',' + mc]] = true; touches = true; }
            else if (!seen[mr + ',' + mc]) { seen[mr + ',' + mc] = true; s2.push([mr, mc]); }
          }
        }
        regions.push({ empties: empties, borders: borders, touches: touches });
      }
    }

    // 不动点迭代： vital 区域 < 2 的块出局；贴着出局块的区域也不再算数
    var alive = {};
    for (i = 0; i < chains.length; i++) alive[i] = true;
    for (;;) {
      var changed = false, vital = {}, cid, k;
      for (i = 0; i < chains.length; i++) vital[i] = 0;
      for (i = 0; i < regions.length; i++) {
        var rg = regions[i];
        if (!rg.touches) continue;
        for (cid in rg.borders) {
          if (!Object.prototype.hasOwnProperty.call(rg.borders, cid)) continue;
          cid = +cid;
          if (!alive[cid]) continue;
          var ch = chains[cid], allLibs = true;
          for (k = 0; k < rg.empties.length; k++) {
            if (!ch.libs[rg.empties[k]]) { allLibs = false; break; }
          }
          if (allLibs) vital[cid]++;
        }
      }
      for (i = 0; i < chains.length; i++) {
        if (alive[i] && vital[i] < 2) { delete alive[i]; changed = true; }
      }
      for (i = 0; i < regions.length; i++) {
        var rg2 = regions[i];
        if (!rg2.touches) continue;
        for (cid in rg2.borders) {
          if (Object.prototype.hasOwnProperty.call(rg2.borders, cid) && !alive[+cid]) {
            rg2.touches = false; changed = true; break;
          }
        }
      }
      if (!changed) break;
    }

    var out = {};
    for (i = 0; i < chains.length; i++) {
      if (!alive[i]) continue;
      for (var t = 0; t < chains[i].stones.length; t++) {
        out[chains[i].stones[t][0] + ',' + chains[i].stones[t][1]] = true;
      }
    }
    return out;
  }

  // ------------------------------------------------------ 死子自动预判
  // 只做终局数子界面上“先帮你圈一圈”的种子，玩家必须逐一核对。
  // 判定可能出错——宁漏勿错：证明不了的棋一律留给玩家自己标。
  function guessDeadStones(board) {
    var size = board.length, r, c, i;

    function scanRegions(bd) {
      var regionOf = {}, regions = [], seenEmpty = {};
      for (r = 0; r < size; r++) {
        for (c = 0; c < size; c++) {
          if (bd[r][c] !== null || seenEmpty[r + ',' + c]) continue;
          var idx = regions.length, borders = {}, bcount = {}, pts = 0, spots = [];
          bcount[BLACK] = 0; bcount[WHITE] = 0;
          var stack = [[r, c]];
          seenEmpty[r + ',' + c] = true;
          while (stack.length) {
            var p = stack.pop();
            regionOf[p[0] + ',' + p[1]] = idx;
            pts++;
            if (pts <= 2) spots.push(p);
            for (i = 0; i < 4; i++) {
              var nr = p[0] + DIRS[i][0], nc = p[1] + DIRS[i][1];
              if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
              var key = nr + ',' + nc, v = bd[nr][nc];
              if (v === null) {
                if (!seenEmpty[key]) { seenEmpty[key] = true; stack.push([nr, nc]); }
              } else {
                borders[v] = true;
                bcount[v]++;          // 按相邻次数计，用于边界占比
              }
            }
          }
          regions.push({ borders: borders, bcount: bcount, points: pts, spots: pts <= 2 ? spots : null });
        }
      }
      return { regionOf: regionOf, regions: regions };
    }

    // 单点眼是否假眼：边角处一个斜角被占即假，中腹要两个斜角才安全
    function isFalseEye(bd, rr, cc, opp) {
      var diag = [[rr - 1, cc - 1], [rr - 1, cc + 1], [rr + 1, cc - 1], [rr + 1, cc + 1]];
      var onBoard = 0, enemy = 0;
      for (var d = 0; d < 4; d++) {
        var dr = diag[d][0], dc = diag[d][1];
        if (dr < 0 || dc < 0 || dr >= size || dc >= size) continue;
        onBoard++;
        if (bd[dr][dc] === opp) enemy++;
      }
      return onBoard < 4 ? enemy >= 1 : enemy >= 2;
    }

    function readEyes(bd, libs, scan, opp) {
      var adjacent = {};
      for (i = 0; i < libs.length; i++) {
        var ri = scan.regionOf[libs[i][0] + ',' + libs[i][1]];
        if (ri !== undefined) adjacent[ri] = true;
      }
      var eyes = 0, sealed = true, touched = 0;
      for (var rk in adjacent) {
        if (!Object.prototype.hasOwnProperty.call(adjacent, rk)) continue;
        touched++;
        var reg = scan.regions[+rk];
        if (!reg.borders[opp]) {
          var real = true;
          if (reg.points === 1 && reg.spots && reg.spots.length) {
            var sp = reg.spots[0];
            if (isFalseEye(bd, sp[0], sp[1], opp)) real = false;
          }
          if (real) eyes++;
        }
        if (reg.points > 2) sealed = false;
      }
      return { eyes: eyes, sealed: sealed, touched: touched };
    }

    function chainsOf(bd, color) {
      var out = [], seenStone = {};
      for (r = 0; r < size; r++) {
        for (c = 0; c < size; c++) {
          if (bd[r][c] !== color || seenStone[r + ',' + c]) continue;
          var g = collectGroup(bd, r, c);
          for (i = 0; i < g.stones.length; i++) seenStone[g.stones[i].join(',')] = true;
          out.push({ colour: color, opp: other(color), grp: g });
        }
      }
      return out;
    }

    // 只被单一颜色包围的空区是该色棋块间的连接通道：共通道的同色块并成一组判
    function buildUnits(bd, groups, scan) {
      var parent = [];
      for (i = 0; i < groups.length; i++) parent[i] = i;
      function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
      function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[b] = a; }

      var touchers = {};
      for (i = 0; i < groups.length; i++) {
        var libs = groups[i].grp.liberties;
        for (var j = 0; j < libs.length; j++) {
          var ri = scan.regionOf[libs[j][0] + ',' + libs[j][1]];
          if (ri === undefined) continue;
          if (!touchers[ri]) touchers[ri] = [];
          if (touchers[ri].indexOf(i) === -1) touchers[ri].push(i);
        }
      }
      for (var rk in touchers) {
        if (!Object.prototype.hasOwnProperty.call(touchers, rk)) continue;
        var reg = scan.regions[+rk];
        var bcols = Object.keys(reg.borders);
        if (bcols.length !== 1) continue;      // 两色贴边的公共地带不算私有通道
        var list = touchers[rk];
        for (i = 1; i < list.length; i++) union(list[0], list[i]);
      }

      var units = {};
      for (i = 0; i < groups.length; i++) {
        var root = find(i);
        if (!units[root]) units[root] = { colour: groups[i].colour, opp: groups[i].opp, stones: [], liberties: [] };
        var u = units[root];
        u.stones = u.stones.concat(groups[i].grp.stones);
        u.liberties = u.liberties.concat(groups[i].grp.liberties);
      }
      return units;
    }

    // 0. Benson 先给两类棋上保险：它认证的块永不预标死
    var unconditional = {};
    try {
      var ba = bensonAlive(board, BLACK), wa = bensonAlive(board, WHITE), bk;
      for (bk in ba) if (Object.prototype.hasOwnProperty.call(ba, bk)) unconditional[bk] = true;
      for (bk in wa) if (Object.prototype.hasOwnProperty.call(wa, bk)) unconditional[bk] = true;
    } catch (e) { unconditional = {}; }

    var dead = {};

    // 1. 第一遍：被密封在 ≤2 点的小空间里、凑不出两只真眼的组合判死
    var scan0 = scanRegions(board);
    var units0 = buildUnits(board,
      chainsOf(board, BLACK).concat(chainsOf(board, WHITE)), scan0);
    var uk;
    for (uk in units0) {
      if (!Object.prototype.hasOwnProperty.call(units0, uk)) continue;
      var U = units0[uk];
      var certified = false;
      for (i = 0; i < U.stones.length; i++) {
        if (unconditional[U.stones[i].join(',')]) { certified = true; break; }
      }
      if (certified) continue;
      var e0 = readEyes(board, U.liberties, scan0, U.opp);
      if (e0.sealed && e0.eyes < 2 && e0.touched > 0) {
        for (i = 0; i < U.stones.length; i++) dead[U.stones[i].join(',')] = true;
      }
    }

    // 2. 复查：把对方判死的子从盘上拿掉后再看一遍——
    //    敌方死子让出的空点可能正好凑出第二只眼，此时复活。
    //    拿掉敌方死子只会让眼空间变大，所以这一遍只可能“翻案”，不会新增死子。
    for (var pass = 0; pass < 4; pass++) {
      var revived = false;
      var lifted = { b: null, w: null }, side;
      for (side in lifted) {
        if (!Object.prototype.hasOwnProperty.call(lifted, side)) continue;
        var bb = board.map(function (row) { return row.slice(); });
        for (r = 0; r < size; r++) {
          for (c = 0; c < size; c++) {
            if (bb[r][c] === side && dead[r + ',' + c]) bb[r][c] = null;
          }
        }
        lifted[side] = { board: bb, scan: scanRegions(bb) };
      }
      for (side in lifted) {
        if (!Object.prototype.hasOwnProperty.call(lifted, side)) continue;
        var oppSide = other(side);
        var view = lifted[oppSide];          // 敌方死子已被拿掉的盘面
        var mine = chainsOf(view.board, side);
        var units2 = buildUnits(view.board, mine, view.scan);
        for (uk in units2) {
          if (!Object.prototype.hasOwnProperty.call(units2, uk)) continue;
          var U2 = units2[uk];
          var anyDead = false;
          for (i = 0; i < U2.stones.length; i++) {
            if (dead[U2.stones[i].join(',')]) { anyDead = true; break; }
          }
          if (!anyDead) continue;
          var e2 = readEyes(view.board, U2.liberties, view.scan, U2.opp);
          if (e2.eyes >= 2) {
            for (i = 0; i < U2.stones.length; i++) {
              var kk = U2.stones[i].join(',');
              if (dead[kk]) { delete dead[kk]; revived = true; }
            }
          }
        }
      }
      if (!revived) break;
    }

    // 2b. 搁浅在对方地界里的孤子/小块：气不超过 2、没有任何私有眼位、
    //     摸到的每片空区都不大、且空区边界大头是对家 → 预标死。
    //     这是最常见的死形（忘了逃的子），第一遍的“密封小口袋”规则罩不到它。
    //     双活等特形不会触发：公有区域的边界两色都占大头，占比过不了 70%。
    var MAX_REGION = 60, MIN_ENEMY_SHARE = 0.7;
    var scanS = scanRegions(board);
    var unitsS = buildUnits(board,
      chainsOf(board, BLACK).concat(chainsOf(board, WHITE)), scanS);
    for (uk in unitsS) {
      if (!Object.prototype.hasOwnProperty.call(unitsS, uk)) continue;
      var US = unitsS[uk];
      if (US.liberties.length > 2) continue;
      var alreadyS = false, certS = false;
      for (i = 0; i < US.stones.length; i++) {
        var kS = US.stones[i].join(',');
        if (dead[kS]) alreadyS = true;
        if (unconditional[kS]) certS = true;
      }
      if (alreadyS || certS) continue;
      var hasPrivate = false, tooOpen = false, mineB = 0, theirsB = 0;
      var seenR = {};
      for (i = 0; i < US.liberties.length; i++) {
        var riS = scanS.regionOf[US.liberties[i][0] + ',' + US.liberties[i][1]];
        if (riS === undefined || seenR[riS]) continue;
        seenR[riS] = true;
        var regS = scanS.regions[riS];
        if (!regS.borders[US.opp]) hasPrivate = true;
        if (regS.points > MAX_REGION) tooOpen = true;
        mineB += regS.bcount[US.colour] || 0;
        theirsB += regS.bcount[US.opp] || 0;
      }
      if (hasPrivate || tooOpen) continue;
      if (theirsB / Math.max(1, mineB + theirsB) < MIN_ENEMY_SHARE) continue;
      for (i = 0; i < US.stones.length; i++) dead[US.stones[i].join(',')] = true;
    }

    // 3. 气 race 否决：判死的大块若气数反而多于贴身最弱的活敌块，
    //    对杀先紧气也能活——把误杀的大家伙捞回来（只捞 20 子以上的大块）。
    var seenV = {};
    var vetoed = {};
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        if (board[r][c] === null || seenV[r + ',' + c]) continue;
        var grpV = collectGroup(board, r, c);
        for (i = 0; i < grpV.stones.length; i++) seenV[grpV.stones[i].join(',')] = true;
        if (!dead[grpV.stones[0].join(',')] || !grpV.liberties.length) continue;
        if (grpV.stones.length < 20) continue;
        var oppV = other(board[r][c]);
        var minOpp = Infinity, oSeen = {};
        for (i = 0; i < grpV.stones.length; i++) {
          for (var dv = 0; dv < 4; dv++) {
            var nvr = grpV.stones[i][0] + DIRS[dv][0], nvc = grpV.stones[i][1] + DIRS[dv][1];
            if (nvr < 0 || nvr >= size || nvc < 0 || nvc >= size) continue;
            if (board[nvr][nvc] !== oppV || oSeen[nvr + ',' + nvc]) continue;
            var ogV = collectGroup(board, nvr, nvc);
            for (var oj = 0; oj < ogV.stones.length; oj++) oSeen[ogV.stones[oj].join(',')] = true;
            var kV = ogV.stones[0].join(',');
            if (unconditional[kV] || dead[kV]) continue;
            if (ogV.liberties.length < minOpp) minOpp = ogV.liberties.length;
          }
        }
        if (grpV.liberties.length > minOpp) {
          for (i = 0; i < grpV.stones.length; i++) vetoed[grpV.stones[i].join(',')] = true;
        }
      }
    }
    for (var vk in vetoed) {
      if (Object.prototype.hasOwnProperty.call(vetoed, vk)) delete dead[vk];
    }

    return dead;
  }

  // ------------------------------------------------------------ 对局类
  function GoGame(opts) {
    opts = opts || {};
    if (typeof opts === 'number') opts = { size: opts };
    this.size = opts.size || DEFAULT_SIZE;
    this.komi = (opts.komi != null) ? opts.komi : DEFAULT_KOMI;
    this.board = emptyBoard(this.size);
    this.turn = BLACK;                 // 黑先
    this.history = [];                 // { color, r, c, pass }
    this.captures = { b: 0, w: 0 };    // 黑/白各自提掉对方多少子
    this.passes = 0;                   // 连续虚手数
    this.koPoint = null;               // 简单劫禁着点，仅供 UI 提示
    this.ended = false;
    this.result = null;
    this._seen = {};                   // 历史整盘局面集合（全局同形）
    this._seen[boardKey(this.board)] = true;
    this._base = boardKey(this.board); // 开局局面（存档恢复时重建 _seen 用）
  }

  GoGame.BLACK = BLACK;
  GoGame.WHITE = WHITE;
  GoGame.DEFAULT_KOMI = DEFAULT_KOMI;

  GoGame.prototype.stoneAt = function (r, c) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return null;
    return this.board[r][c];
  };

  GoGame.prototype.isLegal = function (r, c, color) {
    color = color || this.turn;
    var self = this;
    return tryPlay(this.board, r, c, color, function (key) {
      return self._seen[key] === true;
    }).ok;
  };

  // 当前行棋方是否还有任何合法着点（没有就必须虚手）
  GoGame.prototype.hasLegalMove = function (color) {
    color = color || this.turn;
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        if (this.board[r][c] === null && this.isLegal(r, c, color)) return true;
      }
    }
    return false;
  };

  // 所有合法着点（AI 兜底选点 / 测试用）
  GoGame.prototype.legalMoves = function (color) {
    color = color || this.turn;
    var out = [];
    for (var r = 0; r < this.size; r++) {
      for (var c = 0; c < this.size; c++) {
        if (this.board[r][c] === null && this.isLegal(r, c, color)) out.push([r, c]);
      }
    }
    return out;
  };

  GoGame.prototype.play = function (r, c, color) {
    if (this.ended) return { ok: false, reason: 'game-over' };
    color = color || this.turn;
    if (color !== this.turn) return { ok: false, reason: 'not-your-turn' };
    var self = this;
    var res = tryPlay(this.board, r, c, color, function (key) {
      return self._seen[key] === true;
    });
    if (!res.ok) return { ok: false, reason: res.reason };

    this.board = res.board;
    var n = res.captures.length;
    if (color === BLACK) this.captures.b += n;
    else this.captures.w += n;

    // 简单劫提示：单子提单子且自己只剩一口气时，被提点即劫位
    this.koPoint = null;
    if (n === 1) {
      var grp = collectGroup(this.board, r, c);
      if (grp.stones.length === 1 && grp.liberties.length === 1) {
        this.koPoint = res.captures[0].slice();
      }
    }

    this._seen[boardKey(this.board)] = true;
    this.history.push({ color: color, r: r, c: c, pass: false });
    this.passes = 0;
    this.turn = other(color);
    return { ok: true, color: color, r: r, c: c, captures: res.captures, capturedCount: n };
  };

  // 虚手。双方连续虚手即终局，进入数子。
  GoGame.prototype.pass = function (color) {
    if (this.ended) return { ok: false, reason: 'game-over' };
    color = color || this.turn;
    if (color !== this.turn) return { ok: false, reason: 'not-your-turn' };
    this.koPoint = null;
    this.passes += 1;
    this.history.push({ color: color, pass: true });
    this.turn = other(color);
    var ended = this.passes >= 2;
    if (ended) {
      this.ended = true;
      this.result = { type: 'score' };
    }
    return { ok: true, color: color, pass: true, ended: ended };
  };

  GoGame.prototype.resign = function (color) {
    color = color || this.turn;
    this.ended = true;
    this.result = { type: 'resign', winner: other(color), loser: color };
    return this.result;
  };

  // 悔一手：弹出最后一手并从头重放（重放同时重建全局同形集合）。
  // 终局（连续虚手）后也可以悔——弹掉虚手回到对局。
  GoGame.prototype.undo = function () {
    if (!this.history.length) return false;
    this.history.pop();
    this._replay(this.history, this._base);
    return true;
  };

  // 重放：从开局局面（默认空盘）逐手重下，重建盘面、提子数与全局同形集合。
  // 重放信任历史里记录的行棋次序。
  GoGame.prototype._replay = function (moves, startKey) {
    var hist = moves ? moves.slice() : [];
    this.board = startKey ? boardFromKey(startKey, this.size) : emptyBoard(this.size);
    this.turn = BLACK;
    this.captures = { b: 0, w: 0 };
    this.passes = 0;
    this.ended = false;
    this.result = null;
    this.koPoint = null;
    this._base = boardKey(this.board);
    this._seen = {};
    this._seen[this._base] = true;
    this.history = [];
    for (var i = 0; i < hist.length; i++) {
      var m = hist[i];
      this.turn = m.color;
      if (m.pass) this.pass(m.color);
      else this.play(m.r, m.c, m.color);
    }
  };

  // 数子。deadMap："r,c" => true 视为死子（先移除再数）。
  GoGame.prototype.score = function (deadMap) {
    return scoreArea(this.board, this.komi, deadMap || {});
  };

  GoGame.prototype.territoryGrid = function (deadMap) {
    return territoryGrid(this.board, deadMap || {});
  };

  // (r,c) 所在棋块的所有子，"r,c" 键数组。数子界面点击切换死活用。
  GoGame.prototype.groupKeys = function (r, c) {
    if (this.board[r] == null || this.board[r][c] == null) return [];
    var grp = collectGroup(this.board, r, c);
    return grp.stones.map(function (s) { return s[0] + ',' + s[1]; });
  };

  GoGame.prototype.toData = function () {
    return {
      size: this.size,
      komi: this.komi,
      turn: this.turn,
      board: boardKey(this.board),
      base: this._base,
      captures: { b: this.captures.b, w: this.captures.w },
      passes: this.passes,
      ended: this.ended,
      result: this.result,
      history: this.history.map(function (m) {
        return m.pass ? { color: m.color, pass: true } : { color: m.color, r: m.r, c: m.c };
      })
    };
  };

  GoGame.fromData = function (data) {
    var g = new GoGame({ size: data.size, komi: data.komi });
    g._replay(data.history || [], data.base);
    return g;
  };

  return {
    BLACK: BLACK,
    WHITE: WHITE,
    DEFAULT_KOMI: DEFAULT_KOMI,
    GoGame: GoGame,
    other: other,
    emptyBoard: emptyBoard,
    cloneBoard: cloneBoard,
    boardKey: boardKey,
    collectGroup: collectGroup,
    countLiberties: countLiberties,
    tryPlay: tryPlay,
    scoreArea: scoreArea,
    territoryGrid: territoryGrid,
    bensonAlive: bensonAlive,
    guessDeadStones: guessDeadStones
  };
});
