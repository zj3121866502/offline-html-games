// ============================================================
//  state.js — 游戏可变状态 + 存档读写
// ============================================================

// ---------- 全局游戏状态 ----------
const gameState = {
  screen: 'title',       // title | scene | shop | collection
  fishing: 'idle',       // idle | casting | waiting | bite | reeling | caught | escaped

  // 玩家资产 & 装备
  gold: 50,
  rodLevel: 1,
  lineLevel: 1,
  baitLevel: 1,
  collection: {},        // { fishId: { count, biggest } }
  totalCaught: 0,

  // 地图
  currentMap: 'default',     // 当前地图 id
  unlockedMaps: ['default'], // 已解锁地图 id 列表
  showMapSelect: false,      // 是否显示地图选择面板

  // —— 钓鱼过程临时变量 ——
  castTimer: 0,
  waitTimer: 0,
  biteTimer: 0,
  reelFishHP: 0,
  reelTension: 0,
  reelMaxTension: 100,
  reelFish: null,
  reelTimeElapsed: 0,
  reelTimeLimit: 10000,
  isHolding: false,
  caughtFish: null,
  escapeTimer: 0,
  caughtTimer: 0,

  // 浮标位置（每次抛竿随机）
  bobberX: CONFIG.BOBBER_REST_X,
  bobberY: CONFIG.BOBBER_REST_Y,

  // 动画 & 粒子
  time: 0,
  splashParticles: [],
  struggleTimer: 0,
  strugglePhase: 'calm', // calm | struggle | rest

  // UI
  hoveredBtn: null,
  selectedFish: -1,
  hintText: '',
  hintTimer: 0,
  showCheatPanel: false,
};

// ---------- 存档 ----------
function saveGame() {
  const s = gameState;
  const data = {
    gold: s.gold,
    rodLevel: s.rodLevel,
    lineLevel: s.lineLevel,
    baitLevel: s.baitLevel,
    collection: s.collection,
    totalCaught: s.totalCaught,
    currentMap: s.currentMap,
    unlockedMaps: s.unlockedMaps,
  };
  try { localStorage.setItem('fishing_game_save', JSON.stringify(data)); }
  catch (_) { /* 不可用时忽略 */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem('fishing_game_save');
    if (!raw) return;
    const d = JSON.parse(raw);
    const s = gameState;
    s.gold       = d.gold       || 50;
    s.rodLevel   = d.rodLevel   || 1;
    s.lineLevel  = d.lineLevel  || 1;
    s.baitLevel  = d.baitLevel  || 1;
    s.collection = d.collection || {};
    s.totalCaught = d.totalCaught || 0;
    s.currentMap   = d.currentMap   || 'default';
    s.unlockedMaps = d.unlockedMaps || ['default'];
  } catch (_) { /* 读取失败用默认值 */ }
}

// ---------- 地图布局切换 ----------
function applyMapLayout(mapId) {
  const map = MAPS.find(m => m.id === mapId);
  if (!map) return;
  CONFIG.WATERLINE    = map.waterline;
  CONFIG.DOCK_Y       = map.dockY;
  CONFIG.DOCK_LEFT    = map.dockLeft;
  CONFIG.DOCK_RIGHT   = map.dockRight;
  CONFIG.CHAR_X       = map.charX;
  CONFIG.CHAR_Y       = map.charY;
  CONFIG.BOBBER_REST_X = map.bobberX;
  CONFIG.BOBBER_REST_Y = map.bobberY;
}

function switchMap(mapId) {
  if (!gameState.unlockedMaps.includes(mapId)) return;
  gameState.currentMap = mapId;
  applyMapLayout(mapId);
  saveGame();
}
