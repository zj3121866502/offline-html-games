/**
 * worker.js — 游戏协调 Worker
 * 管理游戏状态、规则校验、多 Worker 并行搜索调度。
 * 不含 Fairy Stockfish，纯 xqwlight + 内置 fallback。
 */

'use strict';

// 加载 xqwlight（开局库 + 训练数据，用于协调层的 book 查询）
try {
  importScripts('./engines/xqwlight/position.js', './engines/xqwlight/search.js', './engines/xqwlight/book.js');
} catch (e) {}
try {
  importScripts('./engines/xqwlight/pst-train.js', './engines/xqwlight/book-train.js', './engines/xqwlight/apply-train.js');
} catch (e) {}

// ===== 棋子常量 =====
const EMPTY = 0;
const R_KING   = 1, R_GUARD  = 2, R_BISHOP = 3, R_KNIGHT = 4;
const R_ROOK   = 5, R_CANNON = 6, R_PAWN   = 7;
const B_KING   = 11, B_GUARD  = 12, B_BISHOP = 13, B_KNIGHT = 14;
const B_ROOK   = 15, B_CANNON = 16, B_PAWN   = 17;

const RED   = 'red';
const BLACK = 'black';

function pieceColor(p) {
  if (p >= 1 && p <= 7)   return RED;
  if (p >= 11 && p <= 17) return BLACK;
  return null;
}
function isRed(p)   { return p >= 1  && p <= 7; }
function isBlack(p) { return p >= 11 && p <= 17; }
function isEmpty(p) { return p === EMPTY; }
function isEnemy(p, color) { return color === RED ? isBlack(p) : isRed(p); }

// ===== 棋子名称 =====
const PIECE_NAMES = {
  [R_KING]: '帅', [R_GUARD]: '仕', [R_BISHOP]: '相',
  [R_KNIGHT]: '马', [R_ROOK]: '俥', [R_CANNON]: '炮', [R_PAWN]: '兵',
  [B_KING]: '将', [B_GUARD]: '士', [B_BISHOP]: '象',
  [B_KNIGHT]: '马', [B_ROOK]: '车', [B_CANNON]: '炮', [B_PAWN]: '卒'
};
const COL_NAMES_RED   = ['九','八','七','六','五','四','三','二','一'];
const COL_NAMES_BLACK = ['1','2','3','4','5','6','7','8','9'];
const STEP_NAMES_RED  = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function isDiagonalPiece(p) {
  return p === R_GUARD || p === R_BISHOP || p === R_KNIGHT ||
         p === B_GUARD || p === B_BISHOP || p === B_KNIGHT;
}

// ===== 初始棋盘 =====
function createInitialBoard() {
  const b = Array.from({length:10}, () => new Array(9).fill(EMPTY));
  b[0][0]=B_ROOK; b[0][1]=B_KNIGHT; b[0][2]=B_BISHOP; b[0][3]=B_GUARD; b[0][4]=B_KING;
  b[0][5]=B_GUARD; b[0][6]=B_BISHOP; b[0][7]=B_KNIGHT; b[0][8]=B_ROOK;
  b[2][1]=B_CANNON; b[2][7]=B_CANNON;
  b[3][0]=B_PAWN; b[3][2]=B_PAWN; b[3][4]=B_PAWN; b[3][6]=B_PAWN; b[3][8]=B_PAWN;
  b[9][0]=R_ROOK; b[9][1]=R_KNIGHT; b[9][2]=R_BISHOP; b[9][3]=R_GUARD; b[9][4]=R_KING;
  b[9][5]=R_GUARD; b[9][6]=R_BISHOP; b[9][7]=R_KNIGHT; b[9][8]=R_ROOK;
  b[7][1]=R_CANNON; b[7][7]=R_CANNON;
  b[6][0]=R_PAWN; b[6][2]=R_PAWN; b[6][4]=R_PAWN; b[6][6]=R_PAWN; b[6][8]=R_PAWN;
  return b;
}

function cloneBoard(b) { return b.map(row => row.slice()); }

// ===== 走法生成 =====
function getMovesForPiece(board, r, c) {
  const piece = board[r][c];
  if (piece === EMPTY) return [];
  const color = pieceColor(piece);
  const moves = [];
  switch (piece) {
    case R_KING: case B_KING:       genKingMoves(board, r, c, color, moves); break;
    case R_GUARD: case B_GUARD:     genGuardMoves(board, r, c, color, moves); break;
    case R_BISHOP: case B_BISHOP:   genBishopMoves(board, r, c, color, moves); break;
    case R_KNIGHT: case B_KNIGHT:   genKnightMoves(board, r, c, color, moves); break;
    case R_ROOK: case B_ROOK:       genRookMoves(board, r, c, color, moves); break;
    case R_CANNON: case B_CANNON:   genCannonMoves(board, r, c, color, moves); break;
    case R_PAWN: case B_PAWN:       genPawnMoves(board, r, c, color, moves); break;
  }
  return moves;
}

function genKingMoves(board, r, c, color, moves) {
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  const [rMin, rMax, cMin, cMax] = color === RED ? [7,9,3,5] : [0,2,3,5];
  for (const [dr, dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    if (nr>=rMin && nr<=rMax && nc>=cMin && nc<=cMax)
      if (isEmpty(board[nr][nc]) || isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
  }
}

function genGuardMoves(board, r, c, color, moves) {
  const dirs = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const [rMin, rMax, cMin, cMax] = color === RED ? [7,9,3,5] : [0,2,3,5];
  for (const [dr, dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    if (nr>=rMin && nr<=rMax && nc>=cMin && nc<=cMax)
      if (isEmpty(board[nr][nc]) || isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
  }
}

function genBishopMoves(board, r, c, color, moves) {
  const dirs = [[2,2],[2,-2],[-2,2],[-2,-2]];
  const rMin = color === RED ? 5 : 0, rMax = color === RED ? 9 : 4;
  for (const [dr, dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    const er = r+dr/2, ec = c+dc/2;
    if (nr>=rMin && nr<=rMax && nc>=0 && nc<=8 && isEmpty(board[er][ec]))
      if (isEmpty(board[nr][nc]) || isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
  }
}

function genKnightMoves(board, r, c, color, moves) {
  const steps = [
    [[-1,0],[-2,1],[-2,-1]], [[1,0],[2,1],[2,-1]],
    [[0,-1],[1,-2],[-1,-2]], [[0,1],[1,2],[-1,2]]
  ];
  for (const [leg, ...dests] of steps) {
    const lr = r+leg[0], lc = c+leg[1];
    if (lr<0||lr>9||lc<0||lc>8||!isEmpty(board[lr][lc])) continue;
    for (const [dr, dc] of dests) {
      const nr = r+dr, nc = c+dc;
      if (nr>=0&&nr<=9&&nc>=0&&nc<=8)
        if (isEmpty(board[nr][nc]) || isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
    }
  }
}

function genRookMoves(board, r, c, color, moves) {
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  for (const [dr, dc] of dirs) {
    let nr = r+dr, nc = c+dc;
    while (nr>=0&&nr<=9&&nc>=0&&nc<=8) {
      if (isEmpty(board[nr][nc])) { moves.push([nr, nc]); }
      else { if (isEnemy(board[nr][nc], color)) moves.push([nr, nc]); break; }
      nr += dr; nc += dc;
    }
  }
}

function genCannonMoves(board, r, c, color, moves) {
  const dirs = [[0,1],[0,-1],[1,0],[-1,0]];
  for (const [dr, dc] of dirs) {
    let nr = r+dr, nc = c+dc, hasMount = false;
    while (nr>=0&&nr<=9&&nc>=0&&nc<=8) {
      if (!hasMount) {
        if (isEmpty(board[nr][nc])) moves.push([nr, nc]);
        else hasMount = true;
      } else {
        if (!isEmpty(board[nr][nc])) {
          if (isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
          break;
        }
      }
      nr += dr; nc += dc;
    }
  }
}

function genPawnMoves(board, r, c, color, moves) {
  const dirs = [];
  if (color === RED) {
    dirs.push([-1, 0]);
    if (r <= 4) { dirs.push([0, 1]); dirs.push([0, -1]); }
  } else {
    dirs.push([1, 0]);
    if (r >= 5) { dirs.push([0, 1]); dirs.push([0, -1]); }
  }
  for (const [dr, dc] of dirs) {
    const nr = r+dr, nc = c+dc;
    if (nr>=0&&nr<=9&&nc>=0&&nc<=8)
      if (isEmpty(board[nr][nc]) || isEnemy(board[nr][nc], color)) moves.push([nr, nc]);
  }
}

function getAllLegalMoves(board, color) {
  const moves = [];
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p === EMPTY || pieceColor(p) !== color) continue;
      for (const [nr, nc] of getMovesForPiece(board, r, c))
        if (!moveLeavesInCheck(board, r, c, nr, nc, color))
          moves.push([r, c, nr, nc]);
    }
  return moves;
}

// ===== 走棋 / 将军检测 =====
function applyMove(board, r, c, nr, nc) {
  const nb = cloneBoard(board);
  nb[nr][nc] = nb[r][c]; nb[r][c] = EMPTY;
  return nb;
}

function makeMove(board, r, c, nr, nc) {
  const captured = board[nr][nc];
  board[nr][nc] = board[r][c]; board[r][c] = EMPTY;
  return captured;
}

function unmakeMove(board, r, c, nr, nc, captured) {
  board[r][c] = board[nr][nc]; board[nr][nc] = captured;
}

function kingsExposed(board) {
  let rr = -1, rc = -1, br = -1, bc = -1;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === R_KING) { rr = r; rc = c; }
      if (board[r][c] === B_KING) { br = r; bc = c; }
    }
  if (rr < 0 || br < 0 || rc !== bc) return false;
  for (let r = br+1; r < rr; r++) if (!isEmpty(board[r][rc])) return false;
  return true;
}

function isInCheck(board, color) {
  const kingPiece = color === RED ? R_KING : B_KING;
  let kr = -1, kc = -1;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] === kingPiece) { kr = r; kc = c; }
  if (kr < 0) return true;
  if (kingsExposed(board)) return true;
  const enemy = color === RED ? BLACK : RED;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p === EMPTY || pieceColor(p) !== enemy) continue;
      for (const [nr, nc] of getMovesForPiece(board, r, c))
        if (nr === kr && nc === kc) return true;
    }
  return false;
}

function moveLeavesInCheck(board, r, c, nr, nc, color) {
  const captured = makeMove(board, r, c, nr, nc);
  const result = isInCheck(board, color);
  unmakeMove(board, r, c, nr, nc, captured);
  return result;
}

// ===== 局面评估 (fallback) =====
const FALLBACK_PIECE_VALUE = {
  [R_KING]:900,[R_GUARD]:120,[R_BISHOP]:120,[R_KNIGHT]:270,[R_ROOK]:600,[R_CANNON]:285,[R_PAWN]:30,
  [B_KING]:900,[B_GUARD]:120,[B_BISHOP]:120,[B_KNIGHT]:270,[B_ROOK]:600,[B_CANNON]:285,[B_PAWN]:30
};

function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p === EMPTY) continue;
      const v = FALLBACK_PIECE_VALUE[p] || 0;
      if (isRed(p)) score += v; else score -= v;
    }
  return score;
}

// ===== Zobrist 哈希 =====
const ZOBRIST = (() => {
  const arr = new Uint32Array(18 * 10 * 9 + 2);
  let s = 2463534242;
  for (let i = 0; i < arr.length; i++) {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    arr[i] = s >>> 0;
  }
  return arr;
})();
function pieceHash(p, r, c) { return ZOBRIST[p * 90 + r * 9 + c]; }
const HASH_TURN_RED = ZOBRIST[18 * 90];

function computeHash(board, color) {
  let h = 0;
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] !== EMPTY) h ^= pieceHash(board[r][c], r, c);
  if (color === RED) h ^= HASH_TURN_RED;
  return h >>> 0;
}

function hashAfterMove(h, board, r, c, nr, nc, color) {
  const piece = board[r][c];
  const captured = board[nr][nc];
  h ^= pieceHash(piece, r, c);
  if (captured !== EMPTY) h ^= pieceHash(captured, nr, nc);
  h ^= pieceHash(piece, nr, nc);
  h ^= HASH_TURN_RED;
  return h >>> 0;
}

// ===== FEN 转换 (xqwlight 格式) =====
const XQ_FEN_RED = ['', 'K', 'A', 'B', 'N', 'R', 'C', 'P'];

function boardToFen(board, color) {
  const rows = [];
  for (let r = 0; r < 10; r++) {
    let empty = 0, row = '';
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) { empty++; continue; }
      if (empty) { row += String(empty); empty = 0; }
      row += p <= 7 ? XQ_FEN_RED[p] : XQ_FEN_RED[p - 10].toLowerCase();
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return rows.join('/') + (color === RED ? ' w' : ' b');
}

// xqwlight 走法编码/解码
// xqwlight 用 16×16 棋盘，有效区域 row 3-12, col 3-11
// 编码: MOVE( ((r+3)<<4)+(c+3), ((nr+3)<<4)+(nc+3) )
function encodeXqMove(r, c, nr, nc) {
  return (((r + 3) << 4) + (c + 3)) + ((((nr + 3) << 4) + (nc + 3)) << 8);
}

function sqToCell(sq) {
  return [(sq >> 4) - 3, (sq & 15) - 3];
}

function decodeXqMv(mv) {
  if (!mv) return null;
  const src = mv & 255;
  const dst = mv >> 8;
  const [r, c] = sqToCell(src);
  const [nr, nc] = sqToCell(dst);
  return [r, c, nr, nc];
}

// ===== 走法记谱 =====
function moveToNotation(board, r, c, nr, nc) {
  const piece = board[r][c];
  const name = PIECE_NAMES[piece] || '?';
  const color = pieceColor(piece);
  const isRedSide = color === RED;
  const colNames = isRedSide ? COL_NAMES_RED : COL_NAMES_BLACK;

  const sameColRows = [];
  for (let rr = 0; rr < 10; rr++) if (board[rr][c] === piece) sameColRows.push(rr);
  sameColRows.sort((a, b) => isRedSide ? a - b : b - a);

  let originPart;
  if (sameColRows.length >= 2) {
    const idx = sameColRows.indexOf(r);
    let posLabel;
    if (sameColRows.length === 2) posLabel = idx === 0 ? '前' : '后';
    else if (idx === 0) posLabel = '前';
    else if (idx === sameColRows.length - 1) posLabel = '后';
    else posLabel = ['二', '三', '四'][idx - 1] || '中';
    originPart = posLabel + name;
  } else {
    originPart = name + colNames[c];
  }

  let action;
  if (nr === r) {
    action = '平' + colNames[nc];
  } else {
    const forward = isRedSide ? (nr < r) : (nr > r);
    const dir = forward ? '进' : '退';
    if (isDiagonalPiece(piece)) {
      action = dir + colNames[nc];
    } else {
      const steps = Math.abs(nr - r);
      action = dir + (isRedSide ? STEP_NAMES_RED[steps] : steps);
    }
  }
  return originPart + action;
}

// ===== 重复局面检测 =====
let positionCount = new Map();
let gameHash = 0;
let halfMoveClock = 0;
let searchPathHashes = [];

function recordPosition(captured) {
  if (captured !== EMPTY) halfMoveClock = 0; else halfMoveClock++;
  gameHash = computeHash(gameBoard, currentTurn);
  positionCount.set(gameHash, (positionCount.get(gameHash) || 0) + 1);
}

function checkDraw() {
  if (halfMoveClock >= 120) return 'move_limit';
  if ((positionCount.get(gameHash) || 0) >= 3) return 'repetition';
  return null;
}

function analyzeRepetitionCycle(minOcc) {
  const hashes = [];
  let board = createInitialBoard(), turn = RED;
  for (const mv of moveHistory) {
    board = applyMove(board, mv.r, mv.c, mv.nr, mv.nc);
    turn = turn === RED ? BLACK : RED;
    hashes.push(computeHash(board, turn));
  }
  const occ = [];
  for (let k = 0; k < hashes.length; k++) if (hashes[k] === gameHash) occ.push(k);
  if (occ.length < minOcc) return 'draw';
  const startIdx = occ[occ.length - minOcc];
  let redAny = false, redAllCheck = true, blackAny = false, blackAllCheck = true;
  for (let k = startIdx + 1; k < moveHistory.length; k++) {
    const moverIsRed = (k % 2 === 0);
    const gaveCheck = moveHistory[k].check === true;
    if (moverIsRed) { redAny = true; if (!gaveCheck) redAllCheck = false; }
    else { blackAny = true; if (!gaveCheck) blackAllCheck = false; }
  }
  if (redAny && redAllCheck && !(blackAny && blackAllCheck)) return 'red_loses';
  if (blackAny && blackAllCheck && !(redAny && redAllCheck)) return 'black_loses';
  return 'draw';
}

function rebuildPositionCount() {
  positionCount = new Map();
  halfMoveClock = 0;
  const initBoard = createInitialBoard();
  positionCount.set(computeHash(initBoard, RED), 1);
  let board = createInitialBoard(), turn = RED;
  for (const mv of moveHistory) {
    if (mv.captured !== EMPTY) halfMoveClock = 0; else halfMoveClock++;
    board = applyMove(board, mv.r, mv.c, mv.nr, mv.nc);
    turn = turn === RED ? BLACK : RED;
    const h = computeHash(board, turn);
    positionCount.set(h, (positionCount.get(h) || 0) + 1);
  }
  gameHash = computeHash(gameBoard, currentTurn);
}

// ===== 游戏状态 =====
let gameBoard = createInitialBoard();
let currentTurn = RED;
let moveHistory = [];
let gameOver = false;
let playerColor = RED;
let aiColor = BLACK;
let difficulty = 'medium';
let boardFlipped = false;
let searchGen = 0;
let lastEngineInfo = null;  // { source, depth, score, nodes, millis }

// ===== Pikafish 桥接搜索 =====
// UCI 坐标转换: 棋盘 row 0=黑底 row 9=红底; UCI file=a-i, rank=0-9
function uciSquare(r, c) {
  return String.fromCharCode(97 + c) + (9 - r);
}

function parseUciMove(uci) {
  if (!uci || uci.length < 4) return null;
  const sc = uci.charCodeAt(0) - 97, sr = 9 - parseInt(uci[1]);
  const dc = uci.charCodeAt(2) - 97, dr = 9 - parseInt(uci[3]);
  if (sc < 0 || sc > 8 || sr < 0 || sr > 9 || dc < 0 || dc > 8 || dr < 0 || dr > 9) return null;
  return [sr, sc, dr, dc];
}

async function tryBridgeSearch(fen, depth, millis, searchmoves) {
  const body = { fen, depth, movetime: millis };
  if (searchmoves && searchmoves.length > 0) body.searchmoves = searchmoves;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(millis + 5000, 10000));

  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ===== 难度配置 =====
const DIFFICULTY_CONFIG = {
  medium: { depth: 64, millis: 400,  workers: 2, randomChance: 0 },
  hard:   { depth: 64, millis: 700,  workers: 2, randomChance: 0 },
  expert: { depth: 64, millis: 1100, workers: 3, randomChance: 0 },
  master: { depth: 64, millis: 2500, workers: 4, randomChance: 0 },
  pro:    { depth: 64, millis: 6000, workers: 4, randomChance: 0 }
};

// 用户选择的线程数（0 = 自动）
let userThreadCount = 0;

function getWorkerCount() {
  // 如果用户手动选了线程数，优先使用
  if (userThreadCount > 0) {
    return Math.max(1, userThreadCount);
  }
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  let wanted = cfg.workers;
  try {
    const hw = Number(navigator.hardwareConcurrency) || 2;
    wanted = Math.min(wanted, Math.max(1, hw - 1));
  } catch (_) {}
  return Math.max(1, wanted);
}

// ===== 引擎 Worker 池 =====
let engineWorkers = [];
let engineReadyCount = 0;
let engineSearchPending = null; // { token, fen, moves, depth, millis, results, done }

function spawnEngineWorkers(count) {
  // 先清理旧的
  for (const w of engineWorkers) {
    try { w.terminate(); } catch (_) {}
  }
  engineWorkers = [];
  engineReadyCount = 0;

  for (let i = 0; i < count; i++) {
    const w = new Worker('./engine-worker.js');
    w.onmessage = handleEngineWorkerMessage;
    w.onerror = function(e) { console.error('Engine worker error:', e); };
    engineWorkers.push(w);
  }
}

function handleEngineWorkerMessage(e) {
  const msg = e.data;
  if (msg.type === 'ready') {
    engineReadyCount++;
    if (engineReadyCount >= engineWorkers.length) {
      self.postMessage({ type: 'engineStatus', phase: 'ready' });
    }
    return;
  }
  if (msg.type === 'result') {
    if (!engineSearchPending) return;
    const pending = engineSearchPending;
    pending.results.push(msg);
    pending.done++;
    if (pending.done >= pending.total) {
      resolveParallelSearch(pending);
    }
  }
}

// ===== 并行搜索调度 =====
function startParallelSearch(fen, legalMoves, token) {
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  const numWorkers = Math.min(engineWorkers.length, legalMoves.length);

  if (numWorkers <= 0) {
    // 没有可用 worker，用 fallback
    const fallback = findBestMoveFallback(gameBoard, aiColor);
    if (token !== searchGen || gameOver) return;
    applyAiMove(fallback, token);
    return;
  }

  // 将走法分配给各 worker
  const moveGroups = Array.from({length: numWorkers}, () => []);
  for (let i = 0; i < legalMoves.length; i++) {
    moveGroups[i % numWorkers].push(legalMoves[i]);
  }

  // 编码为 xqwlight MOVE 格式
  const encodedGroups = moveGroups.map(group =>
    group.map(([r, c, nr, nc]) => encodeXqMove(r, c, nr, nc))
  );

  engineSearchPending = {
    token,
    fen,
    legalMoves,
    depth: cfg.depth,
    millis: cfg.millis,
    results: [],
    done: 0,
    total: numWorkers
  };

  for (let i = 0; i < numWorkers; i++) {
    engineWorkers[i].postMessage({
      type: 'search',
      fen,
      rootMoves: encodedGroups[i],
      depth: cfg.depth,
      millis: cfg.millis
    });
  }
}

function resolveParallelSearch(pending) {
  if (pending.token !== searchGen || gameOver) {
    engineSearchPending = null;
    return;
  }

  // 从所有 worker 结果中选出最佳走法
  let bestMv = 0;
  let bestScore = -Infinity;

  for (const result of pending.results) {
    if (result.mv > 0 && result.score > bestScore) {
      bestScore = result.score;
      bestMv = result.mv;
    }
  }

  engineSearchPending = null;

  if (bestMv > 0) {
    const decoded = decodeXqMv(bestMv);
    if (decoded) {
      const [r, c, nr, nc] = decoded;
      // 验证走法合法性
      const legal = pending.legalMoves;
      const match = legal.find(m => m[0]===r && m[1]===c && m[2]===nr && m[3]===nc);
      if (match) {
        // 汇总 xqwlight 搜索信息
        let totalNodes = 0, maxDepth = 0, maxMillis = 0;
        for (const r of pending.results) {
          totalNodes += r.nodes || 0;
          if (r.depth > maxDepth) maxDepth = r.depth;
          if (r.millis > maxMillis) maxMillis = r.millis;
        }
        lastEngineInfo = {
          source: 'xqwlight (fallback)',
          depth: maxDepth || pending.depth,
          score: bestScore,
          nodes: totalNodes,
          millis: maxMillis
        };
        applyAiMove(match, pending.token);
        return;
      }
    }
  }

  // 并行搜索失败，用 fallback
  const fallback = findBestMoveFallback(gameBoard, aiColor);
  if (pending.token !== searchGen || gameOver) return;
  lastEngineInfo = { source: 'alpha-beta (builtin)', depth: fallbackDepth, score: 0, nodes: 0, millis: 0 };
  applyAiMove(fallback, pending.token);
}

// ===== Fallback AI (内置 alpha-beta) =====
let fallbackDepth = 3;
let fallbackAborted = false;
let fallbackStartTime = 0;
let MAX_SEARCH_MS = 400;

function alphaBetaFallback(board, depth, alpha, beta, maximizing) {
  if (fallbackAborted) return 0;
  if ((depth & 3) === 0 && Date.now() - fallbackStartTime > MAX_SEARCH_MS) {
    fallbackAborted = true; return 0;
  }
  if (depth === 0) return evaluateBoard(board);
  const color = maximizing ? RED : BLACK;
  const moves = getAllLegalMoves(board, color);
  if (moves.length === 0) return maximizing ? -9000 + (fallbackDepth - depth) : 9000 - (fallbackDepth - depth);
  moves.sort((a, b) => {
    const capB = board[b[2]][b[3]] !== EMPTY ? (FALLBACK_PIECE_VALUE[board[b[2]][b[3]]] || 0) : 0;
    const capA = board[a[2]][a[3]] !== EMPTY ? (FALLBACK_PIECE_VALUE[board[a[2]][a[3]]] || 0) : 0;
    return capB - capA;
  });
  let best = maximizing ? -Infinity : Infinity;
  for (const [r, c, nr, nc] of moves) {
    const captured = makeMove(board, r, c, nr, nc);
    const val = alphaBetaFallback(board, depth - 1, alpha, beta, !maximizing);
    unmakeMove(board, r, c, nr, nc, captured);
    if (maximizing) { if (val > best) best = val; if (val > alpha) alpha = val; }
    else { if (val < best) best = val; if (val < beta) beta = val; }
    if (beta <= alpha) break;
  }
  return best;
}

function findBestMoveFallback(board, color) {
  const legal = getAllLegalMoves(board, color);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  if (cfg.randomChance > 0 && Math.random() < cfg.randomChance) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  const maximizing = color === RED;
  fallbackDepth = difficulty === 'easy' ? 2 : 3;
  MAX_SEARCH_MS = cfg.millis;
  fallbackAborted = false;
  fallbackStartTime = Date.now();

  let bestMove = legal[0];
  let bestVal = maximizing ? -Infinity : Infinity;

  for (const [r, c, nr, nc] of legal) {
    const captured = makeMove(board, r, c, nr, nc);
    const val = alphaBetaFallback(board, fallbackDepth - 1, -Infinity, Infinity, !maximizing);
    unmakeMove(board, r, c, nr, nc, captured);
    if (fallbackAborted) break;
    if (maximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestMove = [r, c, nr, nc];
    }
  }
  return bestMove;
}

// ===== xqwlight 单线程搜索 (备用) =====
function tryXqwlightMove(board, color) {
  if (typeof Position !== 'function' || typeof Search !== 'function') return null;
  const legal = getAllLegalMoves(board, color);
  if (legal.length === 0) return null;
  if (legal.length === 1) return legal[0];

  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  if (cfg.randomChance > 0 && Math.random() < cfg.randomChance) {
    return legal[Math.floor(Math.random() * legal.length)];
  }

  try {
    const pos = new Position();
    const fen = boardToFen(board, color);
    pos.fromFen(fen);

    const hashLevel = 16;
    const search = new Search(pos, hashLevel);
    const mv = search.searchMain(cfg.depth, cfg.millis);
    if (mv > 0) {
      const decoded = decodeXqMv(mv);
      if (decoded) {
        const match = legal.find(m => m[0]===decoded[0] && m[1]===decoded[1] && m[2]===decoded[2] && m[3]===decoded[3]);
        if (match) return match;
      }
    }
  } catch (_) {}
  return null;
}

// ===== AI 走子主流程 =====
async function doAiMove() {
  if (gameOver) return;
  const token = ++searchGen;

  self.postMessage({ type: 'thinking' });

  const legal = getAllLegalMoves(gameBoard, aiColor);
  if (legal.length === 0) {
    // AI 无子可走 → 玩家胜
    gameOver = true;
    const comment = generateComment(moveHistory, gameBoard, playerColor === RED ? 'red_win' : 'black_win');
    self.postMessage({
      type: 'gameOver', result: playerColor === RED ? 'red_win' : 'black_win',
      resultType: 'stalemate', comment, board: gameBoard, turn: currentTurn,
      playerColor, moveHistory: getMoveHistoryText(), flipped: boardFlipped
    });
    return;
  }

  if (legal.length === 1) {
    applyAiMove(legal[0], token);
    return;
  }

  // 1) 尝试 Pikafish 桥接搜索（NNUE 神经网络评估）
  const fen = boardToFen(gameBoard, aiColor);
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  try {
    const result = await tryBridgeSearch(fen, cfg.depth, cfg.millis);
    if (token !== searchGen || gameOver) return;
    if (result && result.bestMove) {
      const parsed = parseUciMove(result.bestMove);
      if (parsed) {
        const [r, c, nr, nc] = parsed;
        const match = legal.find(m => m[0]===r && m[1]===c && m[2]===nr && m[3]===nc);
        if (match) {
          lastEngineInfo = {
            source: 'Pikafish NNUE',
            depth: result.depth || cfg.depth,
            score: result.score || 0,
            nodes: result.nodes || 0,
            millis: cfg.millis
          };
          applyAiMove(match, token);
          return;
        }
      }
    }
  } catch (e) {
    // 桥接不可用（服务器未启动等），静默降级
  }

  // 2) Fallback: xqwlight 并行搜索
  if (engineWorkers.length > 0) {
    startParallelSearch(fen, legal, token);
  } else {
    const move = findBestMoveFallback(gameBoard, aiColor);
    if (token !== searchGen || gameOver) return;
    applyAiMove(move, token);
  }
}

function applyAiMove(move, token) {
  if (!move || token !== searchGen || gameOver) return;

  const [r, c, nr, nc] = move;
  const piece = gameBoard[r][c];
  const captured = gameBoard[nr][nc];
  const notation = moveToNotation(gameBoard, r, c, nr, nc);
  gameBoard = applyMove(gameBoard, r, c, nr, nc);
  moveHistory.push({ r, c, nr, nc, notation, captured, board: cloneBoard(gameBoard) });
  currentTurn = playerColor;

  recordPosition(captured);
  moveHistory[moveHistory.length - 1].check = isInCheck(gameBoard, currentTurn);

  const status = checkGameStatus();
  sendState(status, { r, c, nr, nc, piece, captured });
}

// ===== 游戏状态检测 =====
function checkGameStatus() {
  const drawReason = checkDraw();
  if (drawReason === 'move_limit') {
    gameOver = true;
    return { over: true, result: 'draw', type: 'move_limit',
      comment: '超过60步无吃子，和棋！' };
  }
  if (drawReason === 'repetition') {
    gameOver = true;
    const verdict = analyzeRepetitionCycle(3);
    if (verdict === 'red_loses') return { over: true, result: 'black_win', type: 'perpetual_check', comment: '红方长将判负，黑方胜！' };
    if (verdict === 'black_loses') return { over: true, result: 'red_win', type: 'perpetual_check', comment: '黑方长将判负，红方胜！' };
    return { over: true, result: 'draw', type: 'repetition', comment: '三次重复局面，和棋！' };
  }

  const opponentMoves = getAllLegalMoves(gameBoard, currentTurn);
  if (opponentMoves.length === 0) {
    gameOver = true;
    const isCheckmate = isInCheck(gameBoard, currentTurn);
    const winColor = currentTurn === RED ? BLACK : RED;
    const comment = generateComment(moveHistory, gameBoard, winColor === RED ? 'red_win' : 'black_win');
    return { over: true, result: winColor === RED ? 'red_win' : 'black_win',
      type: isCheckmate ? 'checkmate' : 'stalemate', inCheck: isCheckmate, comment };
  }

  return { over: false, inCheck: isInCheck(gameBoard, currentTurn), turn: currentTurn };
}

function generateComment(moveHistory, board, result) {
  const total = moveHistory.length;
  if (result === 'red_win') {
    if (total < 20) return '势如破竹！红方凌厉攻势，一鼓作气！';
    if (total < 40) return '谋定后动，红方中盘发力获胜！';
    return '持久鏖战，红方残局技高一筹！';
  } else if (result === 'black_win') {
    if (total < 20) return 'AI 速战速决，再接再厉！';
    if (total < 40) return 'AI 中盘获胜，继续加油！';
    return 'AI 残局险胜，你的表现已很出色！';
  }
  return '精彩纷呈，棋逢对手！';
}

// ===== 通信 =====
function getMoveHistoryText() { return moveHistory.map(m => m.notation); }
function getMoveHistoryFull() {
  return moveHistory.map(m => ({
    r: m.r, c: m.c, nr: m.nr, nc: m.nc,
    notation: m.notation, captured: m.captured, check: !!m.check
  }));
}

function sendState(status, aiMove) {
  const msg = {
    type: 'state', board: gameBoard, turn: currentTurn,
    playerColor, aiColor, moveHistory: getMoveHistoryText(),
    moveHistoryFull: getMoveHistoryFull(), flipped: boardFlipped,
    lastAiMove: aiMove || null, engineInfo: lastEngineInfo
  };
  // 发送后清空，避免重复记录
  lastEngineInfo = null;
  if (status) {
    msg.inCheck = status.inCheck || false;
    if (status.over) {
      gameOver = true;
      msg.gameOver = true;
      msg.result = status.result;
      msg.resultType = status.type;
      msg.comment = status.comment;
    }
  }
  self.postMessage(msg);
}

// ===== 消息处理 =====
self.onmessage = function(e) {
  const { action } = e.data;
  switch (action) {
    case 'init':        handleInit(e.data); break;
    case 'reset':       handleReset(e.data); break;
    case 'move':        handleMove(e.data); break;
    case 'undo':        handleUndo(); break;
    case 'hint':        handleHint(); break;
    case 'flip':        boardFlipped = !boardFlipped; sendState(); break;
    case 'changeDifficulty': handleDifficulty(e.data.difficulty); break;
    case 'changeSide':  handleChangeSide(e.data.side); break;
    case 'setThreads':  handleSetThreads(e.data.threads); break;
    case 'resign':      handleResign(); break;
    case 'offerDraw':   handleOfferDraw(); break;
  }
};

function handleInit(data) {
  searchGen++;
  difficulty = data.difficulty || 'medium';
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  MAX_SEARCH_MS = cfg.millis;
  playerColor = data.playerColor || RED;
  aiColor = playerColor === RED ? BLACK : RED;
  gameBoard = createInitialBoard();
  currentTurn = RED;
  moveHistory = [];
  gameOver = false;
  boardFlipped = data.boardFlipped != null ? !!data.boardFlipped : (playerColor === BLACK);

  // 设置线程数
  if (data.threads > 0) userThreadCount = parseInt(data.threads, 10) || 0;

  positionCount = new Map();
  halfMoveClock = 0;
  gameHash = computeHash(gameBoard, RED);
  positionCount.set(gameHash, 1);

  // 启动引擎 worker 池
  const numWorkers = getWorkerCount();
  spawnEngineWorkers(numWorkers);
  self.postMessage({ type: 'engineStatus', phase: 'loading', total: numWorkers, loaded: 0 });

  sendState();
  if (currentTurn === aiColor) setTimeout(doAiMove, 300);
}

function handleReset(data) {
  searchGen++;
  if (data.difficulty) { difficulty = data.difficulty; }
  const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
  MAX_SEARCH_MS = cfg.millis;
  if (data.playerColor) {
    playerColor = data.playerColor;
    aiColor = playerColor === RED ? BLACK : RED;
    boardFlipped = playerColor === BLACK;
  }
  if (data.boardFlipped != null) boardFlipped = !!data.boardFlipped;
  if (data.threads > 0) userThreadCount = parseInt(data.threads, 10) || 0;
  gameBoard = createInitialBoard();
  currentTurn = RED;
  moveHistory = [];
  gameOver = false;
  positionCount = new Map();
  halfMoveClock = 0;
  gameHash = computeHash(gameBoard, RED);
  positionCount.set(gameHash, 1);

  sendState();
  if (currentTurn === aiColor) setTimeout(doAiMove, 300);
}

function handleMove(data) {
  searchGen++;
  if (gameOver || currentTurn !== playerColor) return;
  const [r, c] = data.from;
  const [nr, nc] = data.to;
  const piece = gameBoard[r][c];
  if (piece === EMPTY || pieceColor(piece) !== playerColor) {
    self.postMessage({ type: 'invalidMove' }); return;
  }
  const legalMoves = getMovesForPiece(gameBoard, r, c);
  if (!legalMoves.some(([lr, lc]) => lr===nr && lc===nc) ||
      moveLeavesInCheck(gameBoard, r, c, nr, nc, playerColor)) {
    self.postMessage({ type: 'invalidMove' }); return;
  }

  const notation = moveToNotation(gameBoard, r, c, nr, nc);
  const captured = gameBoard[nr][nc];
  gameBoard = applyMove(gameBoard, r, c, nr, nc);
  moveHistory.push({ r, c, nr, nc, notation, captured, board: cloneBoard(gameBoard) });
  currentTurn = currentTurn === RED ? BLACK : RED;
  recordPosition(captured);
  moveHistory[moveHistory.length - 1].check = isInCheck(gameBoard, currentTurn);

  const status = checkGameStatus();
  sendState(status);
  if (!gameOver) {
    self.postMessage({ type: 'thinking' });
    setTimeout(doAiMove, 100);
  }
}

function handleUndo() {
  searchGen++;
  if (moveHistory.length < 2) return;
  moveHistory.pop(); moveHistory.pop();
  gameBoard = moveHistory.length > 0 ? cloneBoard(moveHistory[moveHistory.length-1].board) : createInitialBoard();
  currentTurn = moveHistory.length % 2 === 0 ? RED : BLACK;
  gameOver = false;
  rebuildPositionCount();
  sendState();
  if (!gameOver && currentTurn === aiColor) setTimeout(doAiMove, 100);
}

async function handleHint() {
  if (gameOver || currentTurn !== playerColor) {
    self.postMessage({ type: 'hint', cancelled: true }); return;
  }

  // 1) 尝试 Pikafish 桥接获取更优提示
  try {
    const fen = boardToFen(gameBoard, playerColor);
    const cfg = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG.medium;
    const result = await tryBridgeSearch(fen, Math.min(cfg.depth, 12), Math.min(cfg.millis, 1500));
    if (result && result.bestMove) {
      const parsed = parseUciMove(result.bestMove);
      if (parsed) {
        const [r, c, nr, nc] = parsed;
        const legal = getAllLegalMoves(gameBoard, playerColor);
        const match = legal.find(m => m[0]===r && m[1]===c && m[2]===nr && m[3]===nc);
        if (match) {
          const notation = moveToNotation(gameBoard, r, c, nr, nc);
          self.postMessage({ type: 'hint', from: [r, c], to: [nr, nc], notation });
          return;
        }
      }
    }
  } catch (_) {}

  // 2) Fallback: xqwlight 或内置 AI
  const hint = tryXqwlightMove(gameBoard, playerColor) || findBestMoveFallback(gameBoard, playerColor);
  if (!hint) { self.postMessage({ type: 'hint', cancelled: true }); return; }
  const [r, c, nr, nc] = hint;
  const notation = moveToNotation(gameBoard, r, c, nr, nc);
  self.postMessage({ type: 'hint', from: [r, c], to: [nr, nc], notation });
}

function handleDifficulty(d) {
  if (!DIFFICULTY_CONFIG[d]) return;
  difficulty = d;
  const cfg = DIFFICULTY_CONFIG[d];
  MAX_SEARCH_MS = cfg.millis;
  // 重新调整 worker 数量
  const numWorkers = getWorkerCount();
  spawnEngineWorkers(numWorkers);
  self.postMessage({ type: 'engineStatus', phase: 'level', difficulty: d });
}

function handleSetThreads(threads) {
  threads = parseInt(threads, 10) || 0;
  if (threads < 0) threads = 0;
  const maxHw = (function() { try { return Math.max(1, Number(navigator.hardwareConcurrency) || 2); } catch(_) { return 2; } })();
  if (threads > maxHw) threads = maxHw;
  userThreadCount = threads;
  // 重新调整 xqwlight worker 池
  const numWorkers = getWorkerCount();
  spawnEngineWorkers(numWorkers);
  // 通知 Pikafish 桥接服务器更改线程数
  try {
    fetch('/api/set-threads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threads: numWorkers })
    }).catch(function() {});
  } catch (_) {}
  self.postMessage({ type: 'engineStatus', phase: 'threads', threads: numWorkers });
}

function handleChangeSide(side) {
  searchGen++;
  playerColor = side === 'red' ? RED : BLACK;
  aiColor = playerColor === RED ? BLACK : RED;
  boardFlipped = playerColor === BLACK;
  gameBoard = createInitialBoard();
  currentTurn = RED;
  moveHistory = [];
  gameOver = false;
  positionCount = new Map();
  halfMoveClock = 0;
  gameHash = computeHash(gameBoard, RED);
  positionCount.set(gameHash, 1);
  sendState();
  if (currentTurn === aiColor) setTimeout(doAiMove, 300);
}

function handleResign() {
  if (gameOver) return;
  gameOver = true;
  const result = playerColor === RED ? 'black_win' : 'red_win';
  self.postMessage({
    type: 'gameOver', gameOver: true, result, resultType: 'resign',
    comment: '你主动认输，胜败乃兵家常事，再来一局！',
    board: gameBoard, turn: currentTurn, playerColor,
    moveHistory: getMoveHistoryText(), flipped: boardFlipped
  });
}

function handleOfferDraw() {
  if (gameOver || currentTurn !== playerColor) return;
  const score = evaluateBoard(gameBoard);
  const aiAdvantage = aiColor === RED ? score : -score;
  if (aiAdvantage > 200) {
    self.postMessage({ type: 'drawRejected', comment: '棋友觉得尚有胜机，婉拒和棋——继续战斗！' });
  } else {
    gameOver = true;
    self.postMessage({
      type: 'gameOver', gameOver: true, result: 'draw', resultType: 'agreement',
      comment: '双方同意和棋，握手言和！',
      board: gameBoard, turn: currentTurn, playerColor,
      moveHistory: getMoveHistoryText(), flipped: boardFlipped
    });
  }
}
