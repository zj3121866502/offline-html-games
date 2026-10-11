// ============================================================
//  input.js — 鼠标 / 触摸输入 & 悬停检测
// ============================================================

// ---------- 坐标转换（屏幕 → 游戏内坐标） ----------
function getGameCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (W / rect.width),
    y: (e.clientY - rect.top)  * (H / rect.height),
  };
}

// ---------- 作弊面板按钮布局（draw.js 与 input.js 共用） ----------
function getCheatPanelLayout() {
  const panelW = 280, panelH = 210;
  const px = W / 2 - panelW / 2, py = H / 2 - panelH / 2;
  const bw = 78, bh = 28, gap = 6;
  const gx0 = px + (panelW - (bw * 3 + gap * 2)) / 2;
  const gy0 = py + 40;
  return { panelW, panelH, px, py, bw, bh, gap, gx0, gy0 };
}

const CHEAT_BTNS = [
  { id: 'cheat_gold1k',   col: 0, row: 0 },
  { id: 'cheat_gold5k',   col: 1, row: 0 },
  { id: 'cheat_gold10k',  col: 2, row: 0 },
  { id: 'cheat_maps',     col: 0, row: 1 },
  { id: 'cheat_maxlv',    col: 1, row: 1 },
  { id: 'cheat_allfish',  col: 2, row: 1 },
  { id: 'cheat_fish',     col: 1, row: 2 },
  { id: 'cheat_reset',    col: 0, row: 2 },
  { id: 'cheat_close',    col: 2, row: 2 },
];

function hitCheatBtn(x, y) {
  const L = getCheatPanelLayout();
  for (const btn of CHEAT_BTNS) {
    const bx = L.gx0 + btn.col * (L.bw + L.gap);
    const by = L.gy0 + btn.row * (L.bh + L.gap);
    if (x >= bx && x <= bx + L.bw && y >= by && y <= by + L.bh) return btn.id;
  }
  return null;
}

// ---------- 悬停状态刷新 ----------
function updateHoverState(x, y) {
  const gs = gameState;
  gs.hoveredBtn = null;

  // 作弊面板打开时，只检测面板内按钮
  if (gs.showCheatPanel) {
    gs.hoveredBtn = hitCheatBtn(x, y);
    return;
  }

  if (gs.screen === 'title') {
    const bw = 120, bh = 28, bx = W / 2 - bw / 2, by = 150;
    if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) gs.hoveredBtn = 'start';

  } else if (gs.screen === 'shop') {
    const panelW = 300, panelH = 250, px = W / 2 - panelW / 2, py = 10;
    // 关闭按钮
    if (x >= px + panelW - 25 && x <= px + panelW && y >= py + 3 && y <= py + 19) {
      gs.hoveredBtn = 'close_shop';
    }
    // 升级按钮
    const types = ['rod', 'line', 'bait'];
    const startY = py + 42;
    for (let i = 0; i < 3; i++) {
      const type = types[i];
      const lv   = gs[type + 'Level'];
      if (lv >= 10) continue;
      const iy = startY + i * 36;
      if (x >= px + 230 && x <= px + 280 && y >= iy + 3 && y <= iy + 19) {
        gs.hoveredBtn = `upgrade_${type}`;
      }
    }
    // 地图购买按钮
    const sepY = startY + 3 * 36 + 4;
    const mapStartY = sepY + 18;
    for (let i = 0; i < MAPS.length; i++) {
      const map = MAPS[i];
      if (gs.unlockedMaps.includes(map.id)) continue;
      const iy = mapStartY + i * 28;
      if (x >= px + 230 && x <= px + 280 && y >= iy + 3 && y <= iy + 19) {
        gs.hoveredBtn = `shop_map_${map.id}`;
      }
    }

  } else if (gs.screen === 'collection') {
    const panelW = 360, panelH = 250, px = W / 2 - panelW / 2, py = 8;
    if (x >= px + panelW - 25 && x <= px + panelW && y >= py + 3 && y <= py + 19) {
      gs.hoveredBtn = 'close_collection';
    }
    const gx0 = px + 12, gy0 = py + 36, cw = 56, ch = 30;
    for (let i = 0; i < FISH_DATA.length; i++) {
      const col = i % 6, row = Math.floor(i / 6);
      const cx = gx0 + col * cw, cy = gy0 + row * ch;
      if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) gs.hoveredBtn = `fish_${i}`;
    }

  } else if (gs.screen === 'scene') {
    // 地图选择面板打开时，检测面板内悬停
    if (gs.showMapSelect) {
      const panelW = 220;
      const py = 28;
      for (let i = 0; i < gs.unlockedMaps.length; i++) {
        const mapId = gs.unlockedMaps[i];
        const iy = py + 22 + i * 32;
        if (x >= 5 && x <= 5 + panelW && y >= iy && y <= iy + 28) {
          gs.hoveredBtn = `map_${mapId}`;
        }
      }
    }
    // 地图名按钮
    if (x >= 5 && x <= 85 && y >= 5 && y <= 23) {
      gs.hoveredBtn = 'map_select';
    }
    // 底部按钮
    if (y >= CONFIG.UI_BAR_Y) {
      if (x >= 350 && x <= 400) gs.hoveredBtn = 'shop';
      if (x >= 410 && x <= 460) gs.hoveredBtn = 'collection';
    }
  }
}

// ---------- 点击分发 ----------
function handleClick(x, y) {
  const gs = gameState;

  // 作弊面板打开时，只处理面板内点击
  if (gs.showCheatPanel) {
    const btnId = hitCheatBtn(x, y);
    if (btnId) handleCheatAction(btnId);
    return;
  }

  if (gs.screen === 'title') {
    gs.screen = 'scene';
    return;
  }

  if (gs.screen === 'shop')     { handleShopClick(x, y);     return; }
  if (gs.screen === 'collection') { handleCollectionClick(x, y); return; }

  // ---- 主场景 ----
  // 地图选择面板打开时，优先处理面板点击
  if (gs.showMapSelect) {
    const panelW = 220;
    const py = 28;
    for (let i = 0; i < gs.unlockedMaps.length; i++) {
      const mapId = gs.unlockedMaps[i];
      const iy = py + 22 + i * 32;
      if (x >= 5 && x <= 5 + panelW && y >= iy && y <= iy + 28) {
        if (gs.currentMap !== mapId) {
          switchMap(mapId);
          // 重置钓鱼状态
          if (gs.fishing !== 'idle') {
            gs.fishing = 'idle';
            gs.reelFish = null;
            gs.caughtFish = null;
          }
          showHint(`切换到 ${MAPS.find(m => m.id === mapId).name}`);
        }
        gs.showMapSelect = false;
        return;
      }
    }
    // 点击面板外关闭
    if (!(x >= 5 && x <= 225 && y >= 5 && y <= py + 22 + gs.unlockedMaps.length * 32 + 10)) {
      gs.showMapSelect = false;
      return;
    }
  }

  // 地图名按钮
  if (x >= 5 && x <= 85 && y >= 5 && y <= 23) {
    gs.showMapSelect = !gs.showMapSelect;
    return;
  }

  // 底部按钮优先
  if (y >= CONFIG.UI_BAR_Y) {
    if (x >= 350 && x <= 400) { gs.screen = 'shop';     return; }
    if (x >= 410 && x <= 460) { gs.screen = 'collection'; gs.selectedFish = -1; return; }
  }

  // 钓鱼交互
  if (gs.fishing === 'idle') {
    if (y < CONFIG.UI_BAR_Y) startCasting();
  } else if (gs.fishing === 'bite') {
    startReeling();
  } else if (gs.fishing === 'caught'  && gs.caughtTimer <= 0) {
    resetToFishingIdle();
  } else if (gs.fishing === 'escaped' && gs.escapeTimer <= 0) {
    resetToFishingIdle();
  }
}

// ---------- 商店点击 ----------
function handleShopClick(x, y) {
  const gs = gameState;
  const panelW = 300, panelH = 250, px = W / 2 - panelW / 2, py = 10;

  // 关闭
  if (x >= px + panelW - 25 && x <= px + panelW && y >= py + 3 && y <= py + 19) {
    gs.screen = 'scene'; return;
  }

  // 升级
  const types = ['rod', 'line', 'bait'];
  const startY = py + 42;
  for (let i = 0; i < 3; i++) {
    const type = types[i];
    const lv   = gs[type + 'Level'];
    const cost = lv < 10 ? UPGRADES[type].costs[lv] : null;
    if (cost !== null && gs.gold >= cost) {
      const iy = startY + i * 36;
      if (x >= px + 230 && x <= px + 280 && y >= iy + 3 && y <= iy + 19) {
        gs.gold -= cost;
        gs[type + 'Level']++;
        saveGame();
        showHint(`${UPGRADES[type].name}升级到 Lv.${gs[type + 'Level']}！`);
        return;
      }
    }
  }

  // 地图购买
  const sepY = startY + 3 * 36 + 4;
  const mapStartY = sepY + 18;
  for (let i = 0; i < MAPS.length; i++) {
    const map = MAPS[i];
    if (gs.unlockedMaps.includes(map.id)) continue;
    const iy = mapStartY + i * 28;
    if (x >= px + 230 && x <= px + 280 && y >= iy + 3 && y <= iy + 19) {
      if (gs.gold >= 5000) {
        gs.gold -= 5000;
        gs.unlockedMaps.push(map.id);
        saveGame();
        showHint(`解锁了新地图：${map.name}！`);
        return;
      }
    }
  }
}

// ---------- 图鉴点击 ----------
function handleCollectionClick(x, y) {
  const gs = gameState;
  const panelW = 360, panelH = 250, px = W / 2 - panelW / 2, py = 8;

  // 关闭
  if (x >= px + panelW - 25 && x <= px + panelW && y >= py + 3 && y <= py + 19) {
    gs.screen = 'scene'; gs.selectedFish = -1; return;
  }

  // 格子（6×5 网格）
  const gx0 = px + 12, gy0 = py + 36, cw = 56, ch = 30;
  for (let i = 0; i < FISH_DATA.length; i++) {
    const col = i % 6, row = Math.floor(i / 6);
    const cx = gx0 + col * cw, cy = gy0 + row * ch;
    if (x >= cx && x <= cx + cw && y >= cy && y <= cy + ch) {
      gs.selectedFish = gs.selectedFish === i ? -1 : i;
      return;
    }
  }
}

// ---------- 绑定事件 ----------
canvas.addEventListener('mousemove', (e) => {
  const { x, y } = getGameCoords(e);
  updateHoverState(x, y);
});

canvas.addEventListener('mousedown', (e) => {
  const { x, y } = getGameCoords(e);
  gameState.isHolding = true;
  handleClick(x, y);
});

canvas.addEventListener('mouseup', () => {
  gameState.isHolding = false;
});

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const { x, y } = getGameCoords(e.touches[0]);
  gameState.isHolding = true;
  handleClick(x, y);
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  gameState.isHolding = false;
}, { passive: false });

// ---------- F9 切换作弊面板 ----------
document.addEventListener('keydown', (e) => {
  if (e.key === 'F9') {
    e.preventDefault();
    gameState.showCheatPanel = !gameState.showCheatPanel;
  }
});

// ---------- 作弊面板按钮动作 ----------
function handleCheatAction(btnId) {
  const gs = gameState;
  switch (btnId) {
    case 'cheat_gold1k':
      gs.gold += 1000;
      showHint('作弊: +1000 金币');
      break;
    case 'cheat_gold5k':
      gs.gold += 5000;
      showHint('作弊: +5000 金币');
      break;
    case 'cheat_gold10k':
      gs.gold += 10000;
      showHint('作弊: +10000 金币');
      break;
    case 'cheat_maps':
      for (const map of MAPS) {
        if (!gs.unlockedMaps.includes(map.id)) gs.unlockedMaps.push(map.id);
      }
      showHint('作弊: 解锁全部地图！');
      break;
    case 'cheat_maxlv':
      gs.rodLevel = 10;
      gs.lineLevel = 10;
      gs.baitLevel = 10;
      showHint('作弊: 装备全部满级！');
      break;
    case 'cheat_allfish':
      for (const fish of FISH_DATA) {
        if (!gs.collection[fish.id]) {
          gs.collection[fish.id] = { count: 1, biggest: fish.maxSize || 50 };
        } else {
          gs.collection[fish.id].count++;
        }
      }
      gs.totalCaught += FISH_DATA.length;
      showHint('作弊: 全鱼入鉴！');
      break;
    case 'cheat_reset':
      if (confirm('确定要重置所有存档数据吗？')) {
        localStorage.removeItem('fishing_game_save');
        gs.gold = 50;
        gs.rodLevel = 1;
        gs.lineLevel = 1;
        gs.baitLevel = 1;
        gs.collection = {};
        gs.totalCaught = 0;
        gs.currentMap = 'default';
        gs.unlockedMaps = ['default'];
        applyMapLayout('default');
        showHint('存档已重置！');
      }
      break;
    case 'cheat_close':
      gs.showCheatPanel = false;
      break;
    case 'cheat_fish':
      showCheatFishSelect();
      break;
  }
  if (btnId !== 'cheat_fish') saveGame();
}

// ---------- 作弊：指定鱼搏斗 ----------
function showCheatFishSelect() {
  const sel = document.getElementById('cheatFishSelect');
  sel.innerHTML = '<option value="">-- 选择鱼种 --</option>';
  for (const fish of FISH_DATA) {
    const rarityTag = fish.rarity >= 2 ? ' ★' : '';
    sel.innerHTML += `<option value="${fish.id}">${fish.name}${rarityTag}</option>`;
  }
  // 定位在作弊面板"指定鱼搏斗"按钮下方
  const L = getCheatPanelLayout();
  const btnX = L.gx0 + 1 * (L.bw + L.gap);
  const btnY = L.gy0 + 2 * (L.bh + L.gap);
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / W;
  const scaleY = rect.height / H;
  sel.style.left = (rect.left + btnX * scaleX) + 'px';
  sel.style.top  = (rect.top + (btnY + L.bh + 4) * scaleY) + 'px';
  sel.style.display = 'block';
  sel.focus();
}

function cheatStartFishReel(fishId) {
  const fish = FISH_DATA[fishId];
  if (!fish) return;
  const gs = gameState;

  // 切换到场景并设置浮标
  gs.screen = 'scene';
  gs.showCheatPanel = false;
  const waterLeft = CONFIG.DOCK_RIGHT + 20;
  const waterRight = W - 30;
  gs.bobberX = waterLeft + Math.random() * (waterRight - waterLeft);
  gs.bobberY = CONFIG.WATERLINE + 5 + Math.random() * 20;

  // 直接进入收杆状态
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
  gs.splashParticles = [];
  showHint(`与 ${fish.name} 搏斗！`);
  createSplash(gs.bobberX, gs.bobberY, 8);
}

// select 选择事件
document.getElementById('cheatFishSelect').addEventListener('change', function() {
  if (this.value !== '') {
    cheatStartFishReel(parseInt(this.value));
  }
  this.style.display = 'none';
  this.value = '';
});
