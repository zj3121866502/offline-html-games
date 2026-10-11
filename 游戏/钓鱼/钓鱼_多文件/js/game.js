// ============================================================
//  game.js — 游戏逻辑（钓鱼状态机、商店交易、提示）
// ============================================================

// ---------- 抛竿 ----------
function startCasting() {
  const gs = gameState;
  if (gs.fishing !== 'idle') return;
  gs.fishing = 'casting';
  gs.castTimer = 800;
  // 随机浮标落点（根据当前地图布局）
  const waterLeft = CONFIG.DOCK_RIGHT + 20;
  const waterRight = W - 30;
  gs.bobberX = waterLeft + Math.random() * (waterRight - waterLeft);
  gs.bobberY = CONFIG.WATERLINE + 5 + Math.random() * 20;
}

// ---------- 水花粒子 ----------
function createSplash(x, y, count) {
  for (let i = 0; i < count; i++) {
    gameState.splashParticles.push({
      x: x + (Math.random() - 0.5) * 10,
      y,
      vx: (Math.random() - 0.5) * 2,
      vy: -Math.random() * 3 - 1,
      life: 500 + Math.random() * 300,
      maxLife: 800,
    });
  }
}

// ---------- 进入等待 ----------
function startWaiting() {
  const gs = gameState;
  gs.fishing = 'waiting';
  const baitMul = 1 - (gs.baitLevel - 1) * 0.15;
  gs.waitTimer = (CONFIG.WAIT_MIN + Math.random() * (CONFIG.WAIT_MAX - CONFIG.WAIT_MIN)) * baitMul;
  createSplash(gs.bobberX, gs.bobberY, 8);
}

// ---------- 鱼咬钩 ----------
function startBite() {
  const gs = gameState;
  gs.fishing = 'bite';
  gs.biteTimer = CONFIG.BITE_WINDOW + (gs.baitLevel - 1) * 100;
}

// ---------- 按权重随机决定鱼种（根据当前地图过滤） ----------
function decideFish() {
  const gs = gameState;
  const curMap = MAPS.find(m => m.id === gs.currentMap) || MAPS[0];
  const availableIds = new Set(curMap.fishIds);

  const baitBonus = (gs.baitLevel - 1) * 0.05;
  // 全鱼种权重表（30 种）
  const allWeights = [
    30 - baitBonus * 5,   // 0 鲫鱼
    30 - baitBonus * 3,   // 1 鲤鱼
    25 - baitBonus * 2,   // 2 草鱼
    20 - baitBonus,        // 3 鲶鱼
    15,                    // 4 黑鱼
    12,                    // 5 鳜鱼
    8  + baitBonus * 3,   // 6 鲈鱼
    6  + baitBonus * 2,   // 7 金鱼
    3  + baitBonus * 2,   // 8 锦鲤
    1  + baitBonus,        // 9 龙鱼
    5,                     // 10 黄腹月亮宝石
    4,                     // 11 魔鬼刀
    10,                    // 12 枯叶
    2,                     // 13 笑猫
    1.5,                   // 14 哥伦比亚豹猫
    8,                     // 15 一间鼠
    0.5,                   // 16 红钻藩王（隐藏）
    6,                     // 17 七彩神仙
    2.5,                   // 18 皇冠直升机
    9,                     // 19 虎纹银板
    7,                     // 20 红尾猫
    5,                     // 21 虎皮鸭嘴
    3,                     // 22 海马
    0.3,                   // 23 美人鱼（隐藏）
    8,                     // 24 三文鱼
    5,                     // 25 虹鳟鱼
    2,                     // 26 北极红点鲑
    25,                    // 27 罗非鱼
    1.5,                   // 28 虎鱼
    4,                     // 29 象鼻鱼
  ];

  // 只保留当前地图可钓鱼种
  const weights = [];
  const indices = [];
  for (let i = 0; i < allWeights.length; i++) {
    if (availableIds.has(i)) {
      weights.push(allWeights[i]);
      indices.push(i);
    }
  }

  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let j = 0; j < weights.length; j++) {
    r -= weights[j];
    if (r <= 0) return FISH_DATA[indices[j]];
  }
  return FISH_DATA[indices[0]];
}

// ---------- 进入收杆 ----------
function startReeling() {
  const gs = gameState;
  const fish = decideFish();
  gs.fishing = 'reeling';
  gs.reelFish      = fish;
  gs.reelFishHP    = fish.hp;
  gs.reelTension   = 0;
  gs.reelMaxTension = 100 + (gs.lineLevel - 1) * 12;
  gs.reelTimeElapsed = 0;
  gs.reelTimeLimit   = fish.timeLimit;
  gs.isHolding     = false;
  gs.struggleTimer = 0;
  gs.strugglePhase = 'calm';
  showHint('按住鼠标收杆！');
}

// ---------- 收杆每帧更新 ----------
function updateReeling(dt) {
  const gs   = gameState;
  const fish = gs.reelFish;

  // 计时
  gs.reelTimeElapsed += dt;
  if (gs.reelTimeElapsed >= gs.reelTimeLimit) {
    escapeFish();
    showHint('鱼跑掉了！');
    return;
  }

  // 挣扎周期
  gs.struggleTimer += dt;
  const cycle = fish.rarity === 3 ? 3000 : fish.rarity === 2 ? 4000 : 5000;
  const phase = gs.struggleTimer % cycle;
  gs.strugglePhase = phase < cycle * 0.4 ? 'calm'
                   : phase < cycle * 0.7 ? 'struggle'
                   : 'rest';

  if (gs.isHolding) {
    // 收杆
    const speed = 8 * (1 + (gs.rodLevel - 1) * 0.25);
    gs.reelFishHP -= speed * dt / 1000;
    // 张力增加
    const tRate = gs.strugglePhase === 'struggle' ? 25 : 12;
    gs.reelTension += tRate * dt / 1000;
  } else {
    // 张力恢复
    const rec = 8 * (1 + (gs.lineLevel - 1) * 0.12);
    gs.reelTension -= rec * dt / 1000;
  }

  // 挣扎额外张力
  if (gs.strugglePhase === 'struggle') {
    gs.reelTension += fish.pull * 0.8 * dt / 1000;
  }

  gs.reelTension  = Math.max(0, Math.min(gs.reelMaxTension, gs.reelTension));
  gs.reelFishHP   = Math.max(0, gs.reelFishHP);

  if (gs.reelFishHP <= 0)       catchFish(fish);
  else if (gs.reelTension >= gs.reelMaxTension) escapeFish();
}

// ---------- 钓到 ----------
function catchFish(fish) {
  const gs = gameState;
  gs.fishing    = 'caught';
  gs.caughtFish = fish;
  gs.caughtTimer = 1500;

  if (!gs.collection[fish.id]) gs.collection[fish.id] = { count: 0, biggest: 0 };
  const size = fish.size[0] + Math.random() * (fish.size[1] - fish.size[0]);
  gs.collection[fish.id].count++;
  gs.collection[fish.id].biggest = Math.max(gs.collection[fish.id].biggest, Math.round(size * 10) / 10);
  gs.totalCaught++;
  gs.gold += fish.value;

  saveGame();
  if (fish.rarity >= 2) {
    showHint(`稀有鱼！+${fish.value}金币`);
    createSplash(gs.bobberX, gs.bobberY, 15);
  }
}

// ---------- 逃脱 ----------
function escapeFish() {
  const gs = gameState;
  gs.fishing     = 'escaped';
  gs.escapeTimer = 1500;
  showHint('断线了！');
  createSplash(gs.bobberX, gs.bobberY, 6);
}

// ---------- 回到待机 ----------
function resetToFishingIdle() {
  const gs = gameState;
  gs.fishing = 'idle';
  gs.reelFish    = null;
  gs.caughtFish  = null;
  gs.splashParticles = [];
}

// ---------- 提示 ----------
function showHint(text) {
  gameState.hintText  = text;
  gameState.hintTimer = 2000;
}

// ---------- 钓鱼状态机（每帧调用） ----------
function updateFishing(dt) {
  const gs = gameState;

  if (gs.fishing === 'casting') {
    gs.castTimer -= dt;
    if (gs.castTimer <= 0) startWaiting();
  }

  if (gs.fishing === 'waiting') {
    gs.waitTimer -= dt;
    if (gs.waitTimer <= 0) startBite();
  }

  if (gs.fishing === 'bite') {
    gs.biteTimer -= dt;
    if (gs.biteTimer <= 0) escapeFish();
  }

  if (gs.fishing === 'reeling') updateReeling(dt);

  if (gs.fishing === 'caught'  && gs.caughtTimer  > 0) gs.caughtTimer  -= dt;
  if (gs.fishing === 'escaped' && gs.escapeTimer  > 0) gs.escapeTimer  -= dt;
}

// ---------- 粒子更新 ----------
function updateParticles(dt) {
  const arr = gameState.splashParticles;
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i];
    p.x += p.vx * dt / 16;
    p.y += p.vy * dt / 16;
    p.vy += 0.1 * dt / 16;
    p.life -= dt;
    if (p.life <= 0) arr.splice(i, 1);
  }
}
