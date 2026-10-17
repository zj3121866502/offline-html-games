'use strict';

// ===== DOM 引用 =====
const canvas         = document.getElementById('chessCanvas');
const ctx            = canvas.getContext('2d');
const pieceLayer     = document.getElementById('pieceLayer');
const captureFlash   = document.getElementById('captureFlash');
const boardWrap      = canvas ? canvas.closest('.canvas-wrapper') : null;
const boardSection   = canvas ? canvas.closest('.board-section') : null;
const turnIndicator  = document.getElementById('turnIndicator');
const gameStatus     = document.getElementById('gameStatus');
const difficultySelect = document.getElementById('difficultySelect');
const threadSelect     = document.getElementById('threadSelect');
const sideSelect     = document.getElementById('sideSelect');
const newGameBtn     = document.getElementById('newGameBtn');
const undoBtn        = document.getElementById('undoBtn');
const hintBtn        = document.getElementById('hintBtn');
const drawBtn        = document.getElementById('drawBtn');
const resignBtn      = document.getElementById('resignBtn');
const flipBtn        = document.getElementById('flipBtn');
const moveList       = document.getElementById('moveList');
const moveListEmpty  = document.getElementById('moveListEmpty');
const moveHistoryScroll = document.getElementById('moveHistoryScroll');
const capRedTray     = document.getElementById('capRedTray');
const capBlackTray   = document.getElementById('capBlackTray');
const redTimer       = document.getElementById('redTimer');
const blackTimer     = document.getElementById('blackTimer');
const playerRedRow   = document.getElementById('playerRedRow');
const playerBlackRow = document.getElementById('playerBlackRow');

// 弹窗
const gameOverModal   = document.getElementById('gameOverModal');
const gameOverTitle   = document.getElementById('gameOverTitle');
const gameOverResult  = document.getElementById('gameOverResult');
const gameOverComment = document.getElementById('gameOverComment');
const modalNewGameBtn = document.getElementById('modalNewGameBtn');
const modalCloseBtn   = document.getElementById('modalCloseBtn');

// ===== 游戏状态 =====
let gameState = null;       // Worker 回传的最新状态
let selectedCell = null;    // [row, col] 已选中棋子
let legalMovesCache = [];   // 当前选中棋子的可走格
let hintMove = null;        // {from, to} 提示走法
let isThinking = false;     // AI 思考中
let isHintThinking = false; // 提示思考中
let hintThinkingTimer = null;
let flipped = false;        // 棋盘是否翻转
let soundEnabled = false;
let lastMove = null;        // {fromR, fromC, toR, toC, by} 最后一步走法高亮
let animating = false;      // AI 走子动画进行中
let previousBoard = null;   // AI 走子前的棋盘（用于动画）
let captureFlashCell = null;
let captureFlashTimer = null;

// 计时器
let timerInterval = null;
let redTime = 0;
let blackTime = 0;
let currentTurnColor = 'red';

// Canvas 尺寸参数（动态计算）
let CELL = 48;
let MARGIN = 33;
let CANVAS_W = 450;
let CANVAS_H = 498;

// ===== Worker =====
let worker = null;

// ===== 棋子常量 =====
const START_BY_TYPE = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 5 };
const CAP_ORDER = [5, 4, 6, 3, 2, 7];

const PIECE_FILE = {
  1: 'red_king', 2: 'red_advisor', 3: 'red_elephant', 4: 'red_horse',
  5: 'red_chariot', 6: 'red_cannon', 7: 'red_pawn',
  11: 'black_king', 12: 'black_advisor', 13: 'black_elephant', 14: 'black_horse',
  15: 'black_chariot', 16: 'black_cannon', 17: 'black_pawn'
};

const STARTING_BOARD = [
  [15, 14, 13, 12, 11, 12, 13, 14, 15],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 16, 0, 0, 0, 0, 0, 16, 0],
  [17, 0, 17, 0, 17, 0, 17, 0, 17],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [7, 0, 7, 0, 7, 0, 7, 0, 7],
  [0, 6, 0, 0, 0, 0, 0, 6, 0],
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [5, 4, 3, 2, 1, 2, 3, 4, 5]
];

const pieceImages = {};
const PIECE_SCALE = 1;

function pieceSrc(id) {
  return 'xiangqi-pieces/' + PIECE_FILE[id] + '.svg';
}

function pieceImageReady(img) {
  return !!(img && img.complete && img.naturalWidth);
}

function allPieceImagesReady() {
  const ids = Object.keys(PIECE_FILE);
  for (let i = 0; i < ids.length; i++) {
    if (!pieceImageReady(pieceImages[Number(ids[i])])) return false;
  }
  return true;
}

function loadPieceImages() {
  const ids = Object.keys(PIECE_FILE);
  for (let i = 0; i < ids.length; i++) {
    const id = Number(ids[i]);
    if (pieceImageReady(pieceImages[id])) continue;
    const img = new Image();
    img.decoding = 'async';
    if ('fetchPriority' in img) img.fetchPriority = 'high';
    img.onload = onPieceImagesUpdated;
    img.onerror = onPieceImagesUpdated;
    img.src = pieceSrc(id);
    pieceImages[id] = img;
  }
}

function boardForPaint() {
  if (gameState && gameState.board) return gameState.board;
  return STARTING_BOARD;
}

function onPieceImagesUpdated() {
  const board = boardForPaint();
  if (board) syncPieceLayer(board);
  drawBoard();
  if (gameState && gameState.board) {
    updateCaptures(gameState.board);
    updateMoveHistory(gameState.moveHistoryFull || gameState.moveHistory || []);
  }
}

// ===== Worker 初始化 =====
function initWorker() {
  if (worker) worker.terminate();
  worker = new Worker('worker.js');
  worker.onmessage = handleWorkerMessage;
  worker.onerror = e => console.error('Worker error:', e);
}

function handleWorkerMessage(e) {
  const msg = e.data;

  switch (msg.type) {
    case 'state':
      if (msg.lastAiMove && !animating) {
        isThinking = false;
        if (previousBoard) {
          animateAiMove(msg, previousBoard, msg.lastAiMove);
        } else {
          gameState = msg;
          flipped = msg.flipped || false;
          lastMove = { fromR: msg.lastAiMove.r, fromC: msg.lastAiMove.c, toR: msg.lastAiMove.nr, toC: msg.lastAiMove.nc, by: 'ai' };
          updateUI(msg);
          playAiMoveSound(msg.lastAiMove.captured !== 0);
          if (msg.lastAiMove.captured) showCaptureFlash(msg.lastAiMove.nr, msg.lastAiMove.nc);
          else hideCaptureFlash();
          if (msg.inCheck) setTimeout(() => playCheckSound(), 60);
        }
      } else if (!msg.lastAiMove) {
        gameState = msg;
        flipped = msg.flipped || false;
        isThinking = false;
        updateUI(msg);
      }
      // F9 监视器更新
      if (msg.engineInfo) {
        updateDebugPanel(msg.engineInfo, difficultySelect ? difficultySelect.value : '?');
      }
      break;
    case 'thinking':
      isThinking = true;
      previousBoard = gameState ? gameState.board.map(r => r.slice()) : null;
      updateStatusThinking();
      syncHintButton();
      break;
    case 'hint':
      clearTimeout(hintThinkingTimer);
      hintThinkingTimer = null;
      isHintThinking = false;
      if (msg.from && msg.to) {
        hintMove = { from: msg.from, to: msg.to, notation: msg.notation };
        drawBoard();
        if (!isThinking) {
          showComment(msg.notation ? '建议 ' + msg.notation : '看棋盘高亮');
        }
      } else if (!msg.cancelled && !isThinking) {
        showComment('这一步没有可提示的走法');
      }
      syncHintButton();
      break;
    case 'engineStatus':
      // 引擎状态提示（简化版）
      if (msg.phase === 'loading') {
        if (!isThinking) showComment('棋友正在就位…');
      } else if (msg.phase === 'ready') {
        if (!isThinking) showComment('棋友已就位');
        setTimeout(() => {
          if (!isThinking && gameStatus && gameStatus.textContent === '棋友已就位') {
            gameStatus.textContent = '';
          }
        }, 2000);
      } else if (msg.phase === 'level') {
        showComment('已切换棋力');
        setTimeout(() => {
          if (!isThinking && gameStatus) gameStatus.textContent = '';
        }, 2000);
      }
      break;
    case 'invalidMove':
      selectedCell = null;
      legalMovesCache = [];
      hideCaptureFlash();
      drawBoard();
      break;
    case 'drawRejected':
      showComment(msg.comment || '棋友婉拒了和棋。');
      break;
    case 'gameOver':
      gameState = msg;
      flipped = msg.flipped || false;
      isThinking = false;
      animating = false;
      updateUI(msg);
      showGameOver(msg);
      playGameOverSound(msg);
      break;
  }
}

// ===== Canvas 自适应 =====
function resizeCanvas() {
  const wrapper = boardWrap || canvas.parentElement;
  const mobile = window.matchMedia('(max-width: 767px)').matches;

  const maxH = wrapper.clientHeight || 0;
  let ratio;
  if (mobile) {
    ratio = (wrapper.clientWidth || 450) / 450;
  } else {
    ratio = maxH > 8 ? maxH / 498 : (wrapper.clientWidth || 450) / 450;
    const capW = Math.min(1100, document.documentElement.clientWidth) - 16 - 380 - 50;
    ratio = Math.min(ratio, Math.max(220, capW) / 450);
  }
  if (!mobile) {
    const minRatio = maxH > 8 ? Math.min(0.45, maxH / 498) : 0.45;
    ratio = Math.max(minRatio, ratio);
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const nextCssW = Math.round(450 * ratio);
  let nextCssH = Math.round(498 * ratio);
  let nextCell = Math.round(48 * ratio);
  let nextMargin = Math.round(33 * ratio);
  if (mobile) {
    nextMargin = Math.round(24 * ratio);
    nextCell = Math.round((nextCssW - 2 * nextMargin) / 8);
    nextCssH = 2 * nextMargin + 9 * nextCell;
  }
  const nextBufW = Math.round(nextCssW * dpr);
  const nextBufH = Math.round(nextCssH * dpr);

  if (boardSection) {
    const hug = !mobile;
    const nextW = hug ? nextCssW + 'px' : '';
    const changed = boardSection.style.width !== nextW;
    boardSection.style.width = nextW;
    if (hug && changed) requestAnimationFrame(resizeCanvas);
  }
  if (pieceLayer) {
    pieceLayer.style.width = nextCssW + 'px';
    pieceLayer.style.height = nextCssH + 'px';
  }

  CANVAS_W = nextCssW;
  CANVAS_H = nextCssH;
  CELL = nextCell;
  MARGIN = nextMargin;

  const sizeChanged = canvas.width !== nextBufW || canvas.height !== nextBufH ||
    canvas.style.width !== nextCssW + 'px' || canvas.style.height !== nextCssH + 'px';
  if (sizeChanged) {
    canvas.width = nextBufW;
    canvas.height = nextBufH;
    canvas.style.width = nextCssW + 'px';
    canvas.style.height = nextCssH + 'px';
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBoard();
  if (sizeChanged && gameState && gameState.board) updateCaptures(gameState.board);
}

// ===== Canvas 绘制 =====

function drawBoard() {
  if (!ctx || animating) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  drawBoardBackground();
  drawGridLines();
  drawRiverText();
  drawPalaces();
  drawCoordinates();
  drawHighlights();

  const boardToDraw = boardForPaint();
  if (boardToDraw) drawPieceShadows(boardToDraw);
  syncPieceLayer(boardToDraw);
  drawLastMovePath();
  drawCaptureRings();

  placeCaptureFlash();
}

function boardInk() {
  return {
    line: '#8b4513',
    river: '#8b4513',
    coord: '#a0673a',
    last: 'rgba(0,100,220,0.7)',
    hint: 'rgba(0,100,220,0.7)',
    hintFrom: 'rgba(0,120,255,0.55)',
    legalFill: 'rgba(0,200,100,0.5)',
    legalStroke: 'rgba(0,180,80,0.9)',
    cap: 'rgba(0,180,80,0.85)',
    sel: 'rgba(255,200,0,0.6)'
  };
}

function drawBoardBackground() {
  const w = CANVAS_W;
  const h = CANVAS_H;

  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0,   '#f8e8c0');
  grad.addColorStop(0.5, '#f4dea8');
  grad.addColorStop(1,   '#efd498');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.strokeStyle = 'rgba(180,120,60,0.08)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y + 3);
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = '#8b4513';
  ctx.lineWidth = 2;
  ctx.strokeRect(MARGIN - 4, MARGIN - 4, CELL * 8 + 8, CELL * 9 + 8);
}

function drawGridLines() {
  ctx.strokeStyle = boardInk().line;
  ctx.lineWidth = 1;

  for (let c = 0; c < 9; c++) {
    const x = MARGIN + c * CELL;
    ctx.beginPath();
    if (c === 0 || c === 8) {
      ctx.moveTo(x, MARGIN);
      ctx.lineTo(x, MARGIN + 9 * CELL);
    } else {
      ctx.moveTo(x, MARGIN);
      ctx.lineTo(x, MARGIN + 4 * CELL);
      ctx.moveTo(x, MARGIN + 5 * CELL);
      ctx.lineTo(x, MARGIN + 9 * CELL);
    }
    ctx.stroke();
  }

  for (let r = 0; r <= 9; r++) {
    const y = MARGIN + r * CELL;
    ctx.beginPath();
    ctx.moveTo(MARGIN, y);
    ctx.lineTo(MARGIN + 8 * CELL, y);
    ctx.stroke();
  }
}

function drawRiverText() {
  const riverY = MARGIN + 4.5 * CELL;
  ctx.save();
  ctx.font = `bold ${Math.round(CELL * 0.42)}px 'SimSun','STSong',serif`;
  ctx.fillStyle = boardInk().river;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (!flipped) {
    ctx.fillText('楚  河', MARGIN + 2 * CELL, riverY);
    ctx.fillText('汉  界', MARGIN + 6 * CELL, riverY);
  } else {
    ctx.fillText('汉  界', MARGIN + 2 * CELL, riverY);
    ctx.fillText('楚  河', MARGIN + 6 * CELL, riverY);
  }
  ctx.restore();
}

function drawPalaces() {
  ctx.save();
  ctx.strokeStyle = boardInk().line;
  ctx.lineWidth = 1;

  const palaces = [
    [MARGIN + 3*CELL, MARGIN, MARGIN + 5*CELL, MARGIN + 2*CELL],
    [MARGIN + 5*CELL, MARGIN, MARGIN + 3*CELL, MARGIN + 2*CELL],
    [MARGIN + 3*CELL, MARGIN + 7*CELL, MARGIN + 5*CELL, MARGIN + 9*CELL],
    [MARGIN + 5*CELL, MARGIN + 7*CELL, MARGIN + 3*CELL, MARGIN + 9*CELL],
  ];

  for (const [x1, y1, x2, y2] of palaces) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCoordinates() {
  const colLabels = flipped
    ? ['1','2','3','4','5','6','7','8','9']
    : ['九','八','七','六','五','四','三','二','一'];

  ctx.save();
  ctx.font = `${Math.round(CELL * 0.28)}px 'Microsoft YaHei',sans-serif`;
  ctx.fillStyle = boardInk().coord;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  for (let c = 0; c < 9; c++) {
    const x = MARGIN + c * CELL;
    ctx.fillText(colLabels[c], x, MARGIN + 9 * CELL + 4);
  }
  ctx.restore();
}

function drawHighlights() {
  // 已选中的格子
  if (selectedCell) {
    const [r, c] = selectedCell;
    const [px, py] = cellToCanvas(r, c);
    ctx.save();
    ctx.fillStyle = boardInk().sel;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const [mr, mc] of legalMovesCache) {
    const occupied = gameState && gameState.board && gameState.board[mr][mc];
    if (occupied) continue;
    const [px, py] = cellToCanvas(mr, mc);
    ctx.save();
    ctx.fillStyle = boardInk().legalFill;
    ctx.strokeStyle = boardInk().legalStroke;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // 将军高亮
  if (gameState && gameState.inCheck && gameState.board) {
    const inCheckColor = gameState.turn;
    const kingPiece = inCheckColor === 'red' ? 1 : 11;
    outer: for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 9; c++) {
        if (gameState.board[r][c] === kingPiece) {
          const [px, py] = cellToCanvas(r, c);
          ctx.save();
          ctx.shadowColor = 'rgba(231,76,60,0.7)';
          ctx.shadowBlur = 14;
          ctx.strokeStyle = 'rgba(231,76,60,0.95)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(px, py, CELL * 0.47, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          break outer;
        }
      }
    }
  }

  // 提示走法
  if (hintMove) {
    const ink = boardInk();
    const capture = !!(gameState && gameState.board && gameState.board[hintMove.to[0]][hintMove.to[1]]);
    const [fx, fy] = cellToCanvas(hintMove.from[0], hintMove.from[1]);
    const [tx, ty] = cellToCanvas(hintMove.to[0], hintMove.to[1]);
    ctx.save();
    ctx.strokeStyle = ink.hintFrom;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(fx, fy, CELL * 0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = ink.hint;
    ctx.lineWidth = capture ? 4 : 3;
    ctx.beginPath();
    ctx.arc(tx, ty, CELL * (capture ? 0.54 : 0.42), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawArrow(fx, fy, tx, ty, ink.hint);
  }
}

function drawLastMovePath() {
  if (!lastMove) return;
  if (lastMove.by !== 'ai') return;
  const fromR = lastMove.fromR;
  const fromC = lastMove.fromC;
  const toR = lastMove.toR;
  const toC = lastMove.toC;
  const [fx, fy] = cellToCanvas(fromR, fromC);
  const [tx, ty] = cellToCanvas(toR, toC);
  const color = boardInk().last;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.25, CELL * 0.028);
  strokeLastRing(fx, fy, CELL * 0.26);
  strokeLastRing(tx, ty, CELL * 0.52);
  ctx.restore();
}

function strokeLastRing(x, y, r) {
  const circ = Math.PI * 2 * r;
  const dash0 = CELL * 0.16;
  const gap0 = CELL * 0.1;
  const n = Math.max(6, Math.round(circ / (dash0 + gap0)));
  const period = circ / n;
  ctx.setLineDash([period * dash0 / (dash0 + gap0), period * gap0 / (dash0 + gap0)]);
  ctx.lineDashOffset = 0;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawCaptureRings() {
  if (!gameState || !gameState.board) return;
  for (const [mr, mc] of legalMovesCache) {
    if (!gameState.board[mr][mc]) continue;
    const [px, py] = cellToCanvas(mr, mc);
    ctx.save();
    ctx.strokeStyle = boardInk().cap;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(px, py, CELL * 0.54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawArrow(fx, fy, tx, ty, color, dashed) {
  ctx.save();
  ctx.strokeStyle = color || boardInk().last;
  ctx.fillStyle   = color || boardInk().last;
  ctx.lineWidth = 2;
  if (dashed) ctx.setLineDash([CELL * 0.16, CELL * 0.1]);

  const angle = Math.atan2(ty - fy, tx - fx);
  const dist = Math.hypot(tx - fx, ty - fy) || 1;
  const inset = Math.min(dist * 0.28, CELL * 0.42);

  const sx = fx + Math.cos(angle) * inset;
  const sy = fy + Math.sin(angle) * inset;
  const ex = tx - Math.cos(angle) * inset;
  const ey = ty - Math.sin(angle) * inset;

  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const headLen = CELL * 0.18;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - headLen * Math.cos(angle - 0.4), ey - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(ex - headLen * Math.cos(angle + 0.4), ey - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// board[row][col] -> canvas xy
function cellToCanvas(row, col) {
  const r = flipped ? 9 - row : row;
  const c = flipped ? 8 - col : col;
  return [MARGIN + c * CELL, MARGIN + r * CELL];
}

// canvas xy -> board [row, col]
function canvasToCell(x, y) {
  const c = Math.round((x - MARGIN) / CELL);
  const r = Math.round((y - MARGIN) / CELL);
  if (r < 0 || r > 9 || c < 0 || c > 8) return null;
  const boardRow = flipped ? 9 - r : r;
  const boardCol = flipped ? 8 - c : c;
  return [boardRow, boardCol];
}

// ===== 棋子图片管理 =====
function drawPieceShadow(px, py, cell) {
  if (!cell) cell = CELL;
  const size = cell * PIECE_SCALE;
  ctx.save();
  ctx.fillStyle = 'rgba(45, 25, 10, 0.18)';
  ctx.beginPath();
  ctx.ellipse(px, py + size * 0.08, size * 0.42, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPieceShadows(board, skipRow, skipCol) {
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (row === skipRow && col === skipCol) continue;
      const piece = board[row][col];
      if (!piece) continue;
      if (!pieceImageReady(pieceImages[piece])) continue;
      const [px, py] = cellToCanvas(row, col);
      drawPieceShadow(px, py);
    }
  }
}

function makeBoardPieceImg(id, px, py, alpha, size) {
  const img = document.createElement('img');
  const cached = pieceImages[id];
  img.src = pieceImageReady(cached) ? cached.src : pieceSrc(id);
  img.decoding = 'async';
  img.alt = '';
  img.draggable = false;
  img.width = size;
  img.height = size;
  img.style.left = (px - size / 2) + 'px';
  img.style.top = (py - size / 2) + 'px';
  img.style.width = size + 'px';
  img.style.height = size + 'px';
  if (alpha !== undefined && alpha < 1) img.style.opacity = String(alpha);
  return img;
}

function placeBoardPieceImg(img, px, py, alpha, size) {
  img.style.left = (px - size / 2) + 'px';
  img.style.top = (py - size / 2) + 'px';
  img.style.opacity = String(alpha);
}

function syncPieceLayer(board, skipRow, skipCol) {
  if (!pieceLayer) return;
  if (!board) return;
  const size = CELL * PIECE_SCALE;
  const nodes = [];
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 9; col++) {
      if (row === skipRow && col === skipCol) continue;
      const piece = board[row][col];
      if (!piece) continue;
      const [px, py] = cellToCanvas(row, col);
      nodes.push(makeBoardPieceImg(piece, px, py, 1, size));
    }
  }
  pieceLayer.replaceChildren.apply(pieceLayer, nodes);
}

// ===== 吃子闪光 =====
function hideCaptureFlash() {
  captureFlashCell = null;
  if (captureFlashTimer) {
    clearTimeout(captureFlashTimer);
    captureFlashTimer = null;
  }
  if (!captureFlash) return;
  captureFlash.classList.remove('is-on');
}

function placeCaptureFlash() {
  if (!captureFlash || !captureFlashCell) return;
  const [px, py] = cellToCanvas(captureFlashCell[0], captureFlashCell[1]);
  const size = CELL;
  captureFlash.style.width = size + 'px';
  captureFlash.style.height = size + 'px';
  captureFlash.style.fontSize = Math.round(size * 0.58) + 'px';
  captureFlash.style.left = (px - size / 2) + 'px';
  captureFlash.style.top = (py - size / 2) + 'px';
}

function showCaptureFlash(row, col) {
  if (!captureFlash) return;
  captureFlashCell = [row, col];
  placeCaptureFlash();
  captureFlash.classList.remove('is-on');
  void captureFlash.offsetWidth;
  captureFlash.classList.add('is-on');
  if (captureFlashTimer) clearTimeout(captureFlashTimer);
  captureFlashTimer = setTimeout(hideCaptureFlash, 800);
}

// ===== AI 走子动画 =====
function animateAiMove(pendingMsg, fromBoard, aiMove) {
  animating = true;
  hideCaptureFlash();
  const { r, c, nr, nc, piece, captured } = aiMove;

  const [fx, fy] = cellToCanvas(r, c);
  const [tx, ty] = cellToCanvas(nr, nc);
  const size = CELL * PIECE_SCALE;

  const DURATION = 320;
  const startTime = performance.now();
  syncPieceLayer(fromBoard, r, c);
  const flyer = makeBoardPieceImg(piece, fx, fy, 0.92, size);
  pieceLayer.appendChild(flyer);

  function drawStaticBase() {
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    drawBoardBackground();
    drawGridLines();
    drawRiverText();
    drawPalaces();
    drawCoordinates();
    const [tpx, tpy] = cellToCanvas(nr, nc);
    ctx.save();
    ctx.fillStyle = 'rgba(255,120,0,0.18)';
    ctx.beginPath();
    ctx.arc(tpx, tpy, CELL * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawPieceShadows(fromBoard, r, c);
  }

  function frame(now) {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / DURATION, 1);
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

    drawStaticBase();

    const cx = fx + (tx - fx) * ease;
    const cy = fy + (ty - fy) * ease;
    placeBoardPieceImg(flyer, cx, cy, 0.92, size);

    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      animating = false;
      lastMove = { fromR: r, fromC: c, toR: nr, toC: nc, by: 'ai' };
      gameState = pendingMsg;
      flipped = pendingMsg.flipped || false;

      updateUI(pendingMsg);
      playAiMoveSound(captured !== 0);
      if (captured) showCaptureFlash(nr, nc);
      if (pendingMsg.inCheck) {
        setTimeout(() => playCheckSound(), 60);
      }
      if (pendingMsg.gameOver) {
        if (pendingMsg.result === (pendingMsg.playerColor === 'red' ? 'black_win' : 'red_win')) {
          setTimeout(() => playLoseSound(), 100);
        } else {
          setTimeout(() => playWinSound(), 100);
        }
      }
    }
  }

  requestAnimationFrame(frame);
}

// ===== UI 更新 =====

function updatePlayerLabels(side) {
  const redLabel   = playerRedRow.querySelector('.player-label');
  const blackLabel = playerBlackRow.querySelector('.player-label');
  if (side === 'black') {
    redLabel.textContent   = '红方（AI棋友）';
    blackLabel.textContent = '黑方（你）';
  } else {
    redLabel.textContent   = '红方（你）';
    blackLabel.textContent = '黑方（AI棋友）';
  }
}

function syncHintButton() {
  if (!hintBtn) return;
  const gameActive = gameState && !gameState.gameOver;
  const playerTurn = gameState && gameState.turn === gameState.playerColor;
  hintBtn.disabled = !gameActive || !playerTurn || isHintThinking || isThinking || animating;
}

function updateUI(msg) {
  if (!msg.board) return;

  selectedCell = null;
  legalMovesCache = [];
  hintMove = null;
  drawBoard();

  if (msg.gameOver) {
    turnIndicator.textContent = '游戏结束';
    turnIndicator.className = 'turn-indicator';
    playerRedRow.classList.remove('active');
    playerBlackRow.classList.remove('active');
    stopTimer();
  } else if (msg.turn === 'red') {
    turnIndicator.textContent = '红方走子';
    turnIndicator.className = 'turn-indicator';
    playerRedRow.classList.add('active');
    playerBlackRow.classList.remove('active');
    startTimer('red');
  } else {
    turnIndicator.textContent = '黑方走子';
    turnIndicator.className = 'turn-indicator';
    playerBlackRow.classList.add('active');
    playerRedRow.classList.remove('active');
    startTimer('black');
  }

  if (msg.gameOver) {
    gameStatus.textContent = msg.resultType === 'checkmate' ? '将死！' : '';
    gameStatus.className = msg.resultType === 'checkmate' ? 'game-status check' : 'game-status';
    if (boardWrap) boardWrap.classList.toggle('in-check', !!msg.inCheck);
  } else if (msg.inCheck) {
    gameStatus.textContent = '将军！';
    gameStatus.className = 'game-status check';
    if (boardWrap) boardWrap.classList.add('in-check');
  } else {
    gameStatus.textContent = isThinking ? '棋友思考中…' : '';
    gameStatus.className = 'game-status';
    if (boardWrap) boardWrap.classList.remove('in-check');
  }

  updateMoveHistory(msg.moveHistoryFull || msg.moveHistory || []);
  updateCaptures(msg.board);

  const gameActive = !msg.gameOver;
  const playerTurn = msg.turn === msg.playerColor;
  resignBtn.disabled = !gameActive;
  drawBtn.disabled = !gameActive || !playerTurn;

  syncHintButton();
}

function updateStatusThinking() {
  gameStatus.textContent = '棋友思考中…';
  gameStatus.className = 'game-status';
}

function updateMoveHistory(history) {
  if (!history.length) {
    moveListEmpty.style.display = 'block';
    moveList.replaceChildren();
    return;
  }
  moveListEmpty.style.display = 'none';

  const frag = document.createDocumentFragment();
  history.forEach((entry, i) => {
    const notation = typeof entry === 'string' ? entry : entry.notation;
    const captured = typeof entry === 'string' ? 0 : (entry.captured || 0);
    const li = document.createElement('li');
    const row = document.createElement('div');
    row.className = 'move-row';
    const play = document.createElement('span');
    play.className = 'move-row__play';
    const dot = document.createElement('span');
    dot.className = i % 2 === 0 ? 'player-dot red-dot' : 'player-dot black-dot';
    dot.setAttribute('aria-hidden', 'true');
    const num = document.createElement('span');
    num.className = 'move-row__num';
    num.textContent = (i + 1) + '.';
    const san = document.createElement('span');
    san.className = i % 2 === 0 ? 'move-row__san move-red' : 'move-row__san move-black';
    san.textContent = notation;
    play.appendChild(dot);
    play.appendChild(num);
    play.appendChild(san);
    row.appendChild(play);
    if (captured) {
      const cap = document.createElement('span');
      cap.className = 'move-row__cap';
      cap.title = captured <= 7 ? '吃掉的红子' : '吃掉的黑子';
      const lab = document.createElement('span');
      lab.className = 'move-row__cap-label';
      lab.textContent = '吃';
      const chip = makeCaptureChip(captured);
      chip.className = 'move-row__cap-piece';
      cap.appendChild(lab);
      cap.appendChild(chip);
      row.appendChild(cap);
    }
    li.appendChild(row);
    frag.appendChild(li);
  });
  moveList.replaceChildren(frag);
  scrollMoveListToEnd();
}

function capturedOf(board, isRedVictim) {
  if (!board) return [];
  const remain = {};
  for (let r = 0; r < board.length; r++) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const p = row[c];
      if (!p) continue;
      const isRed = p >= 1 && p <= 7;
      if (isRedVictim !== isRed) continue;
      const t = isRed ? p : p - 10;
      remain[t] = (remain[t] || 0) + 1;
    }
  }
  const out = [];
  for (let i = 0; i < CAP_ORDER.length; i++) {
    const t = CAP_ORDER[i];
    const missing = (START_BY_TYPE[t] || 0) - (remain[t] || 0);
    const id = isRedVictim ? t : t + 10;
    for (let n = 0; n < missing; n++) out.push(id);
  }
  return out;
}

function makeCaptureChip(id, size) {
  if (!size) size = 40;
  const img = document.createElement('img');
  img.className = 'captured-piece';
  img.src = pieceSrc(id);
  img.alt = '';
  img.draggable = false;
  img.width = size;
  img.height = size;
  return img;
}

function currentCaptureTraySize() {
  return window.matchMedia('(max-width: 767px)').matches ? 34 : 40;
}

function groupCapturedPieces(pieces) {
  const groups = [];
  for (let i = 0; i < pieces.length; i++) {
    const id = pieces[i];
    const last = groups[groups.length - 1];
    if (last && last.id === id) {
      last.count += 1;
    } else {
      groups.push({ id, count: 1 });
    }
  }
  return groups;
}

function renderCaptureTray(el, pieces) {
  if (!el) return;
  const size = currentCaptureTraySize();
  const key = size + ':' + pieces.join(',');
  if (el.getAttribute('data-caps') === key) return;
  el.setAttribute('data-caps', key);
  if (!pieces.length) {
    const empty = document.createElement('span');
    empty.className = 'captured-empty';
    empty.textContent = '—';
    el.replaceChildren(empty);
    return;
  }
  const groups = groupCapturedPieces(pieces);
  const chips = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const stack = document.createElement('span');
    stack.className = 'captured-stack';
    stack.appendChild(makeCaptureChip(group.id, size));
    if (group.count > 1) {
      const badge = document.createElement('span');
      badge.className = 'captured-count';
      badge.textContent = String(group.count);
      stack.appendChild(badge);
    }
    chips.push(stack);
  }
  el.replaceChildren.apply(el, chips);
}

function updateCaptures(board) {
  renderCaptureTray(capRedTray, capturedOf(board, false));
  renderCaptureTray(capBlackTray, capturedOf(board, true));
}

function showComment(text) {
  if (!gameStatus) return;
  gameStatus.textContent = text || '';
  gameStatus.className = 'game-status';
}

function showGameOver(msg, suppressModal) {
  stopTimer();
  const resultText = {
    'red_win':   '红方胜利！',
    'black_win': '黑方胜利！',
    'draw':      '平局'
  };

  gameOverTitle.textContent = '游戏结束';
  gameOverResult.textContent = resultText[msg.result] || '游戏结束';
  gameOverComment.textContent = msg.comment || '';
  modalNewGameBtn.textContent = '再来一局';
  modalNewGameBtn.onclick = null;
  modalCloseBtn.textContent = '关闭';
  modalCloseBtn.onclick = null;

  // 设置结果样式
  gameOverResult.className = 'modal-result';
  if (msg.result === 'draw') {
    gameOverResult.classList.add('draw');
  } else {
    const playerWon = msg.result === (msg.playerColor === 'red' ? 'red_win' : 'black_win');
    gameOverResult.classList.add(playerWon ? 'win' : 'lose');
  }

  if (!suppressModal) showModal();
}

// ===== 计时器 =====
function startTimer(color) {
  stopTimer();
  currentTurnColor = color;
  timerInterval = setInterval(() => {
    if (color === 'red') {
      redTime++;
      redTimer.textContent = formatTime(redTime);
    } else {
      blackTime++;
      blackTimer.textContent = formatTime(blackTime);
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function resetTimers() {
  stopTimer();
  redTime = 0;
  blackTime = 0;
  redTimer.textContent = '00:00';
  blackTimer.textContent = '00:00';
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ===== 音效系统（Web Audio API）=====
let audioCtx = null;

function ensureAudioCtx() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return null; }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function playBeep({ freq = 440, duration = 0.2, type = 'sine', gain = 0.25, delay = 0 }) {
  if (!soundEnabled) return;
  const ac = ensureAudioCtx();
  if (!ac) return;
  try {
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gainNode = ac.createGain();
    osc.connect(gainNode);
    gainNode.connect(ac.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gainNode.gain.setValueAtTime(gain, t0);
    gainNode.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  } catch (e) {}
}

function playSelectSound() {
  playBeep({ freq: 1400, duration: 0.05, type: 'square', gain: 0.07 });
}

function playMoveSound(isCapture) {
  if (isCapture) {
    playBeep({ freq: 380, duration: 0.09, type: 'square', gain: 0.22 });
    playBeep({ freq: 220, duration: 0.14, type: 'square', gain: 0.18, delay: 0.06 });
  } else {
    playBeep({ freq: 720, duration: 0.07, type: 'square', gain: 0.13 });
    playBeep({ freq: 520, duration: 0.06, type: 'square', gain: 0.09, delay: 0.05 });
  }
}

function playAiMoveSound(isCapture) {
  if (isCapture) {
    playBeep({ freq: 320, duration: 0.1,  type: 'sawtooth', gain: 0.2 });
    playBeep({ freq: 190, duration: 0.16, type: 'square',   gain: 0.16, delay: 0.07 });
  } else {
    playBeep({ freq: 560, duration: 0.08, type: 'triangle', gain: 0.16 });
    playBeep({ freq: 390, duration: 0.07, type: 'triangle', gain: 0.11, delay: 0.06 });
  }
}

function playCheckSound() {
  playBeep({ freq: 1100, duration: 0.09, type: 'square', gain: 0.38 });
  playBeep({ freq: 1400, duration: 0.09, type: 'square', gain: 0.42, delay: 0.13 });
  playBeep({ freq: 1100, duration: 0.14, type: 'square', gain: 0.45, delay: 0.26 });
}

function playWinSound() {
  [[523, 0], [659, 0.14], [784, 0.28], [1047, 0.42]].forEach(([f, d]) => {
    playBeep({ freq: f, duration: 0.28, type: 'sine', gain: 0.24, delay: d });
  });
}

function playLoseSound() {
  [[370, 0], [311, 0.18], [277, 0.36], [220, 0.54]].forEach(([f, d]) => {
    playBeep({ freq: f, duration: 0.24, type: 'sine', gain: 0.2, delay: d });
  });
}

function playUndoSound() {
  playBeep({ freq: 600, duration: 0.08, type: 'triangle', gain: 0.12 });
  playBeep({ freq: 450, duration: 0.08, type: 'triangle', gain: 0.1, delay: 0.1 });
}

function playGameOverSound(msg) {
  if (!msg) return;
  if (msg.result === 'draw') {
    playBeep({ freq: 523, duration: 0.18, type: 'sine', gain: 0.18 });
    playBeep({ freq: 523, duration: 0.22, type: 'sine', gain: 0.14, delay: 0.2 });
    return;
  }
  const playerWon = msg.result === (msg.playerColor === 'red' ? 'red_win' : 'black_win');
  if (playerWon) playWinSound();
  else playLoseSound();
}

function playNewGameSound() {
  playBeep({ freq: 880, duration: 0.1, type: 'sine', gain: 0.18 });
  playBeep({ freq: 1100, duration: 0.12, type: 'sine', gain: 0.15, delay: 0.12 });
}

// ===== Canvas 点击处理 =====
function handleCanvasClick(e) {
  if (animating || isThinking) return;
  if (!gameState) {
    showComment('棋友加载中，请稍候…');
    return;
  }
  if (gameState.gameOver) return;
  if (gameState.turn !== gameState.playerColor) return;

  const rect = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top)  * scaleY;

  const cell = canvasToCell(x, y);
  if (!cell) return;
  const [row, col] = cell;

  const board = gameState.board;
  const piece = board[row][col];
  const pc = gameState.playerColor;

  if (selectedCell) {
    const [sr, sc] = selectedCell;
    const isLegal = legalMovesCache.some(([mr, mc]) => mr === row && mc === col);

    if (isLegal) {
      const capturedPiece = board[row][col];
      hintMove = null;
      lastMove = { fromR: sr, fromC: sc, toR: row, toC: col, by: 'player' };
      worker.postMessage({ action: 'move', from: [sr, sc], to: [row, col] });
      playMoveSound(capturedPiece !== 0);
      if (capturedPiece) showCaptureFlash(row, col);
      else hideCaptureFlash();
      selectedCell = null;
      legalMovesCache = [];
    } else if (piece !== 0 && isPieceColor(piece, pc)) {
      selectedCell = [row, col];
      legalMovesCache = getLegalMovesFromState(row, col);
      playSelectSound();
      drawBoard();
    } else {
      selectedCell = null;
      legalMovesCache = [];
      drawBoard();
    }
  } else {
    if (piece !== 0 && isPieceColor(piece, pc)) {
      selectedCell = [row, col];
      legalMovesCache = getLegalMovesFromState(row, col);
      playSelectSound();
      drawBoard();
    }
  }
}

function isPieceColor(piece, color) {
  if (color === 'red')   return piece >= 1 && piece <= 7;
  if (color === 'black') return piece >= 11 && piece <= 17;
  return false;
}

// 从当前棋盘状态计算合法走法（主线程简版，仅用于高亮显示）
function getLegalMovesFromState(row, col) {
  if (!gameState || !gameState.board) return [];
  const board = gameState.board;
  const piece = board[row][col];
  if (!piece) return [];

  const pseudo = [];
  const color = piece >= 1 && piece <= 7 ? 'red' : 'black';
  getClientMovesForPiece(board, row, col, color, pseudo);

  return pseudo.filter(([nr, nc]) =>
    !clientMoveLeavesInCheck(board, row, col, nr, nc, color)
  );
}

function clientFindKing(board, color) {
  const king = color === 'red' ? 1 : 11;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === king) return [r, c];
    }
  }
  return null;
}

function clientKingsExposed(board) {
  const red = clientFindKing(board, 'red');
  const black = clientFindKing(board, 'black');
  if (!red || !black) return false;
  if (red[1] !== black[1]) return false;
  const col = red[1];
  const top = Math.min(red[0], black[0]);
  const bottom = Math.max(red[0], black[0]);
  for (let r = top + 1; r < bottom; r++) {
    if (board[r][col] !== 0) return false;
  }
  return true;
}

function clientInCheck(board, color) {
  const king = clientFindKing(board, color);
  if (!king) return true;
  if (clientKingsExposed(board)) return true;

  const enemy = color === 'red' ? 'black' : 'red';
  const [kr, kc] = king;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p === 0) continue;
      const pColor = p >= 1 && p <= 7 ? 'red' : 'black';
      if (pColor !== enemy) continue;
      const eMoves = [];
      getClientMovesForPiece(board, r, c, enemy, eMoves);
      if (eMoves.some(([mr, mc]) => mr === kr && mc === kc)) return true;
    }
  }
  return false;
}

function clientMoveLeavesInCheck(board, r, c, nr, nc, color) {
  const captured = board[nr][nc];
  board[nr][nc] = board[r][c];
  board[r][c] = 0;
  const inCheck = clientInCheck(board, color);
  board[r][c] = board[nr][nc];
  board[nr][nc] = captured;
  return inCheck;
}

function getClientMovesForPiece(board, r, c, color, moves) {
  const piece = board[r][c];
  const enemy = (p) => color === 'red' ? (p >= 11 && p <= 17) : (p >= 1 && p <= 7);
  const ok    = (p) => p === 0 || enemy(p);
  const inBounds = (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 8;

  switch (piece) {
    case 1: case 11: {
      const [rMin, rMax, cMin, cMax] = color === 'red' ? [7,9,3,5] : [0,2,3,5];
      for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nr=r+dr,nc=c+dc;
        if(nr>=rMin&&nr<=rMax&&nc>=cMin&&nc<=cMax&&ok(board[nr][nc])) moves.push([nr,nc]);
      }
      break;
    }
    case 2: case 12: {
      const [rMin, rMax, cMin, cMax] = color === 'red' ? [7,9,3,5] : [0,2,3,5];
      for (const [dr,dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nr=r+dr,nc=c+dc;
        if(nr>=rMin&&nr<=rMax&&nc>=cMin&&nc<=cMax&&ok(board[nr][nc])) moves.push([nr,nc]);
      }
      break;
    }
    case 3: case 13: {
      const rMin = color === 'red' ? 5 : 0;
      const rMax = color === 'red' ? 9 : 4;
      for (const [dr,dc] of [[2,2],[2,-2],[-2,2],[-2,-2]]) {
        const nr=r+dr,nc=c+dc;
        const er=r+dr/2,ec=c+dc/2;
        if(nr>=rMin&&nr<=rMax&&inBounds(nr,nc)&&board[er][ec]===0&&ok(board[nr][nc])) moves.push([nr,nc]);
      }
      break;
    }
    case 4: case 14: {
      const steps = [
        [[-1,0],[-2,1],[-2,-1]],[[1,0],[2,1],[2,-1]],
        [[0,-1],[1,-2],[-1,-2]],[[0,1],[1,2],[-1,2]]
      ];
      for (const [leg,...dests] of steps) {
        const lr=r+leg[0],lc=c+leg[1];
        if(!inBounds(lr,lc)||board[lr][lc]!==0) continue;
        for (const [dr,dc] of dests) {
          const nr=r+dr,nc=c+dc;
          if(inBounds(nr,nc)&&ok(board[nr][nc])) moves.push([nr,nc]);
        }
      }
      break;
    }
    case 5: case 15: {
      for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nr=r+dr,nc=c+dc;
        while(inBounds(nr,nc)) {
          if(board[nr][nc]===0) { moves.push([nr,nc]); }
          else { if(enemy(board[nr][nc])) moves.push([nr,nc]); break; }
          nr+=dr; nc+=dc;
        }
      }
      break;
    }
    case 6: case 16: {
      for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        let nr=r+dr,nc=c+dc,mount=false;
        while(inBounds(nr,nc)) {
          if(!mount) {
            if(board[nr][nc]===0) moves.push([nr,nc]);
            else mount=true;
          } else {
            if(board[nr][nc]!==0) { if(enemy(board[nr][nc])) moves.push([nr,nc]); break; }
          }
          nr+=dr; nc+=dc;
        }
      }
      break;
    }
    case 7: {
      const dirs = [[-1,0]];
      if (r <= 4) { dirs.push([0,1],[0,-1]); }
      for (const [dr,dc] of dirs) {
        const nr=r+dr,nc=c+dc;
        if(inBounds(nr,nc)&&ok(board[nr][nc])) moves.push([nr,nc]);
      }
      break;
    }
    case 17: {
      const dirs = [[1,0]];
      if (r >= 5) { dirs.push([0,1],[0,-1]); }
      for (const [dr,dc] of dirs) {
        const nr=r+dr,nc=c+dc;
        if(inBounds(nr,nc)&&ok(board[nr][nc])) moves.push([nr,nc]);
      }
      break;
    }
  }
}

// ===== 触摸支持 =====
function handleTouchStart(e) {
  e.preventDefault();
  const touch = e.changedTouches[0];
  handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
}

// ===== 按钮事件 =====

function startNewGame() {
  resetTimers();
  hideModal();
  if (boardWrap) boardWrap.classList.remove('in-check');
  isThinking = false;
  isHintThinking = false;
  clearTimeout(hintThinkingTimer);
  hintThinkingTimer = null;
  animating = false;
  lastMove = null;
  previousBoard = null;
  hideCaptureFlash();

  const difficulty = difficultySelect.value;
  const side = sideSelect ? sideSelect.value : 'red';
  const threads = getSelectedThreads();

  updatePlayerLabels(side);
  playNewGameSound();
  worker.postMessage({ action: 'reset', difficulty, playerColor: side, boardFlipped: flipped, threads });
  syncHintButton();
}

function doUndo() {
  if (isThinking || animating) return;
  playUndoSound();
  lastMove = null;
  hideCaptureFlash();
  worker.postMessage({ action: 'undo' });
}

function doHint() {
  if (isThinking || isHintThinking || animating || !gameState || gameState.gameOver) return;
  if (gameState.turn !== gameState.playerColor) return;
  isHintThinking = true;
  syncHintButton();
  if (gameStatus && gameStatus.className.indexOf('check') === -1) {
    gameStatus.textContent = '在想走法…';
    gameStatus.className = 'game-status';
  }
  worker.postMessage({ action: 'hint' });
}

function showModal() {
  gameOverModal.removeAttribute('hidden');
}

function hideModal() {
  gameOverModal.setAttribute('hidden', '');
  modalNewGameBtn.onclick = null;
  modalCloseBtn.onclick = null;
}

function isGameInProgress() {
  if (!gameState || gameState.gameOver) return false;
  const hist = gameState.moveHistory;
  return !!(hist && hist.length > 0);
}

function showActionConfirm(opts) {
  gameOverTitle.textContent = opts.title;
  gameOverResult.textContent = opts.result || '';
  gameOverComment.textContent = opts.comment || '';
  modalNewGameBtn.textContent = opts.confirmLabel;
  modalCloseBtn.textContent = opts.cancelLabel || '再想想';
  modalNewGameBtn.onclick = () => {
    hideModal();
    opts.onConfirm();
  };
  modalCloseBtn.onclick = hideModal;
  showModal();
  modalCloseBtn.focus();
}

function requestNewGame() {
  if (!isGameInProgress()) {
    startNewGame();
    return;
  }
  showActionConfirm({
    title: '要开始新对局吗？',
    result: '当前进度将会重置',
    comment: '开始新对局后无法撤回。',
    confirmLabel: '开始新对局',
    cancelLabel: '再想想',
    onConfirm: startNewGame
  });
}

function applySideChange(side) {
  updatePlayerLabels(side);
  worker.postMessage({ action: 'changeSide', side: side });
  resetTimers();
  lastMove = null;
  hideCaptureFlash();
}

function currentSideValue() {
  if (gameState && gameState.playerColor === 'black') return 'black';
  return 'red';
}

function requestSideChange(next) {
  if (!isGameInProgress()) {
    applySideChange(next);
    return;
  }
  sideSelect.value = currentSideValue();
  showActionConfirm({
    title: '换边重新开始？',
    result: '当前对局将会重置',
    comment: '换边会开一局新棋，这步无法撤回。',
    confirmLabel: '确定换边',
    cancelLabel: '再想想',
    onConfirm: () => {
      sideSelect.value = next;
      applySideChange(next);
    }
  });
}

function doResign() {
  if (!gameState || gameState.gameOver || isThinking || animating) return;
  showActionConfirm({
    title: '确定认输吗？',
    result: '本局将判你负',
    comment: '若只是想换一步，也可以先悔棋再继续。',
    confirmLabel: '确定认输',
    cancelLabel: '再想想',
    onConfirm: () => {
      worker.postMessage({ action: 'resign' });
    }
  });
}

function doOfferDraw() {
  if (!gameState || gameState.gameOver || isThinking || animating) return;
  if (gameState.turn !== gameState.playerColor) {
    showComment('请在轮到你走子时再向棋友求和。');
    return;
  }
  showComment('已向棋友提出和棋，等待回应…');
  worker.postMessage({ action: 'offerDraw' });
}

function doFlip() {
  worker.postMessage({ action: 'flip' });
}

// ===== 同步难度选择 =====
function syncDifficulty(source) {
  const val = source.value;
  worker.postMessage({ action: 'changeDifficulty', difficulty: val });
}

// ===== 线程选择 =====
function getMaxThreads() {
  try {
    return Math.max(1, Number(navigator.hardwareConcurrency) || 2);
  } catch (_) {
    return 2;
  }
}

function getDefaultThreads() {
  return Math.max(1, getMaxThreads() - 1);
}

function getSelectedThreads() {
  if (!threadSelect) return getDefaultThreads();
  return parseInt(threadSelect.value, 10) || getDefaultThreads();
}

function initThreadSelect() {
  if (!threadSelect) return;
  const max = getMaxThreads();
  const def = getDefaultThreads();
  threadSelect.innerHTML = '';
  for (let i = 1; i <= max; i++) {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = i === 1 ? '1 线程（省资源）' :
                      i === max ? `${i} 线程（全开）` :
                      `${i} 线程`;
    if (i === def) opt.selected = true;
    threadSelect.appendChild(opt);
  }
}

// ===== 棋谱滚动 =====
function scrollMoveListToEnd() {
  if (!moveHistoryScroll) return;
  moveHistoryScroll.scrollTop = moveHistoryScroll.scrollHeight;
}

// ===== 绑定事件 =====
function bindEvents() {
  canvas.addEventListener('click', handleCanvasClick);
  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

  newGameBtn.addEventListener('click', requestNewGame);
  undoBtn.addEventListener('click', doUndo);
  hintBtn.addEventListener('click', doHint);
  drawBtn.addEventListener('click', doOfferDraw);
  resignBtn.addEventListener('click', doResign);
  flipBtn.addEventListener('click', doFlip);

  difficultySelect.addEventListener('change', () => {
    syncDifficulty(difficultySelect);
  });

  if (threadSelect) {
    threadSelect.addEventListener('change', () => {
      worker.postMessage({ action: 'setThreads', threads: getSelectedThreads() });
    });
  }

  if (sideSelect) {
    sideSelect.addEventListener('change', () => {
      requestSideChange(sideSelect.value);
    });
  }

  modalNewGameBtn.addEventListener('click', () => {
    if (modalNewGameBtn.onclick) {
      modalNewGameBtn.onclick();
      return;
    }
    startNewGame();
  });
  modalCloseBtn.addEventListener('click', () => {
    if (modalCloseBtn.onclick) {
      modalCloseBtn.onclick();
      return;
    }
    hideModal();
  });

  gameOverModal.addEventListener('click', e => {
    if (e.target === gameOverModal) hideModal();
  });

  window.addEventListener('resize', resizeCanvas);
  if (typeof ResizeObserver !== 'undefined' && boardWrap) {
    let canvasRoRaf = 0;
    new ResizeObserver(() => {
      if (canvasRoRaf) return;
      canvasRoRaf = requestAnimationFrame(() => {
        canvasRoRaf = 0;
        resizeCanvas();
      });
    }).observe(boardWrap);
  }

  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !gameOverModal.hasAttribute('hidden')) {
      hideModal();
    }
    if (e.key === 'F9') {
      e.preventDefault();
      toggleDebugPanel();
    }
  });
}

// ===== F9 引擎监视器 =====
let debugPanel = null;
let debugVisible = false;
let debugHistory = [];  // 最近 N 条引擎信息

function toggleDebugPanel() {
  if (!debugPanel) createDebugPanel();
  debugVisible = !debugVisible;
  debugPanel.style.display = debugVisible ? 'block' : 'none';
}

function createDebugPanel() {
  debugPanel = document.createElement('div');
  debugPanel.id = 'debugPanel';
  debugPanel.style.cssText = `
    position: fixed; top: 8px; right: 8px; z-index: 9999;
    width: 320px; max-height: 50vh; overflow-y: auto;
    background: rgba(20,20,30,0.92); color: #e0e0e0;
    font-family: 'Consolas','Courier New',monospace; font-size: 12px;
    border-radius: 8px; padding: 10px 12px; display: none;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #444;
    line-height: 1.6;
  `;
  debugPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
      <span style="color:#8be9fd;font-weight:bold;font-size:13px;">F9 引擎监视器</span>
      <span style="color:#666;font-size:11px;">按 F9 关闭</span>
    </div>
    <div id="debugContent" style="color:#aaa;">等待数据...</div>
  `;
  document.body.appendChild(debugPanel);
}

function updateDebugPanel(engineInfo, difficulty) {
  if (!debugPanel || !debugVisible) return;
  if (engineInfo) {
    debugHistory.unshift({ ...engineInfo, difficulty, time: new Date().toLocaleTimeString() });
    if (debugHistory.length > 20) debugHistory.pop();
  }

  const content = document.getElementById('debugContent');
  if (!content) return;

  if (debugHistory.length === 0) {
    content.innerHTML = '<span style="color:#666;">等待 AI 走子...</span>';
    return;
  }

  let html = '';
  for (let i = 0; i < debugHistory.length; i++) {
    const e = debugHistory[i];
    const isLatest = i === 0;
    const opacity = isLatest ? '1' : '0.55';
    const sourceColor = e.source.includes('Pikafish') ? '#50fa7b' :
                        e.source.includes('xqwlight') ? '#f1fa8c' : '#ff79c6';
    const borderLeft = isLatest ? 'border-left:3px solid ' + sourceColor + ';padding-left:8px;' : 'padding-left:11px;';

    html += `<div style="margin-bottom:6px;${borderLeft}opacity:${opacity};">`;
    html += `<div style="color:${sourceColor};font-weight:${isLatest?'bold':'normal'};">${e.source}</div>`;
    html += `<div>难度: ${e.difficulty || '?'} | 深度: ${e.depth || '?'} | 分数: ${e.score || 0}cp</div>`;
    html += `<div>节点: ${(e.nodes||0).toLocaleString()} | 时限: ${e.millis || 0}ms</div>`;
    html += `<div style="color:#666;font-size:11px;">${e.time}</div>`;
    html += `</div>`;
  }
  content.innerHTML = html;
}

// ===== 初始化 =====
function init() {
  loadPieceImages();
  bindEvents();
  initThreadSelect();
  initWorker();

  // 读取默认设置并启动
  const side = sideSelect ? sideSelect.value : 'red';
  const difficulty = difficultySelect.value;
  const threads = getSelectedThreads();
  updatePlayerLabels(side);
  worker.postMessage({ action: 'init', difficulty, playerColor: side, threads });

  resizeCanvas();
}

init();
