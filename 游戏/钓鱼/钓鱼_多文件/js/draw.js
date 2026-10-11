// ============================================================
//  draw.js — 所有绘制函数（UI 图片资源 + 像素画辅助 + 场景 + UI + 屏幕）
// ============================================================

// ==================== 图片资源加载 ====================

const FONT_UI = '"Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", sans-serif';

const uiImages = {};
const UI_IMAGE_LIST = [
  // 场景背景
  'bg_scene_main',
  'bg_scene_ice_lake',
  'bg_scene_africa_river',
  // 码头
  'bg_dock',
  // 角色
  'char_fisherman',
  // 鱼类（30 种）
  'fish_0', 'fish_1', 'fish_2', 'fish_3', 'fish_4',
  'fish_5', 'fish_6', 'fish_7', 'fish_8', 'fish_9',
  'fish_10', 'fish_11', 'fish_12', 'fish_13', 'fish_14',
  'fish_15', 'fish_16', 'fish_17', 'fish_18', 'fish_19',
  'fish_20', 'fish_21', 'fish_22', 'fish_23',
  'fish_24', 'fish_25', 'fish_26', 'fish_27', 'fish_28', 'fish_29',
];
let uiImagesLoaded = false;

// 鱼类文件名映射（短名 → 实际文件名）
const FISH_FILE_NAMES = {
  fish_0: 'fish_0_crucian',
  fish_1: 'fish_1_carp',
  fish_2: 'fish_2_grasscarp',
  fish_3: 'fish_3_catfish',
  fish_4: 'fish_4_snakehead',
  fish_5: 'fish_5_mandarin',
  fish_6: 'fish_6_bass',
  fish_7: 'fish_7_goldfish',
  fish_8: 'fish_8_koi',
  fish_9: 'fish_9_arowana',
  fish_10: 'fish_10_moonstone',
  fish_11: 'fish_11_devilknife',
  fish_12: 'fish_12_deadleaf',
  fish_13: 'fish_13_smilecat',
  fish_14: 'fish_14_leopardcat',
  fish_15: 'fish_15_loach',
  fish_16: 'fish_16_reddiamond',
  fish_17: 'fish_17_discus',
  fish_18: 'fish_18_helicopter',
  fish_19: 'fish_19_tigersilver',
  fish_20: 'fish_20_redtail',
  fish_21: 'fish_21_tigerduck',
  fish_22: 'fish_22_seahorse',
  fish_23: 'fish_23_mermaid',
  fish_24: 'fish_24_salmon',
  fish_25: 'fish_25_rainbowtrout',
  fish_26: 'fish_26_arcticchar',
  fish_27: 'fish_27_tilapia',
  fish_28: 'fish_28_tigerfish',
  fish_29: 'fish_29_elephantfish',
};

function loadUIImages() {
  let loaded = 0;
  const total = UI_IMAGE_LIST.length;
  for (const name of UI_IMAGE_LIST) {
    const img = new Image();
    // 按类型选择路径
    if (name.startsWith('bg_')) {
      img.src = `assets/bg/${name.replace('bg_', '')}.png`;
    } else if (name.startsWith('char_')) {
      img.src = `assets/character/${name.replace('char_', '')}_idle.png`;
    } else if (name.startsWith('fish_')) {
      const fileName = FISH_FILE_NAMES[name] || name;
      img.src = `assets/fish/${fileName}.png`;
    } else {
      img.src = `assets/ui/${name}.png`;
    }
    img.onload = () => {
      loaded++;
      if (loaded >= total) uiImagesLoaded = true;
    };
    uiImages[name] = img;
  }
}

/** 安全绘制图片（图片未加载时不绘制） */
function drawImg(name, x, y, w, h) {
  const img = uiImages[name];
  if (img && img.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x, y, w, h);
  }
}

/** 安全绘制 UI 图片（兼容旧调用） */
function drawUI(name, x, y, w, h) {
  drawImg(name, x, y, w, h);
}

// ==================== 像素画辅助 ====================

function pxRect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function pxCircle(cx, cy, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(Math.floor(cx), Math.floor(cy), r, 0, Math.PI * 2);
  ctx.fill();
}

/** 艺术字风格文字（平滑 + 阴影 + 描边） */
function pxText(text, x, y, color, size, align, noStroke) {
  const fontSize = size || 10;
  ctx.font = `bold ${fontSize}px ${FONT_UI}`;
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'top';

  // 启用高质量文本渲染
  ctx.textRendering = 'optimizeLegibility';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (!noStroke) {
    // 外层阴影
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // 描边
    ctx.strokeStyle = '#1A0A00';
    ctx.lineWidth = Math.max(2.5, fontSize * 0.18);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeText(text, x, y);

    // 清除阴影后填充
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // 填充主色
  ctx.fillStyle = color || '#FFF8E0';
  ctx.fillText(text, x, y);

  // 高光效果（仅对较大文字）
  if (fontSize >= 14 && !noStroke) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(text, x, y - 1);
    ctx.globalAlpha = 1;
  }
}

// ---------- 颜色工具 ----------
function darkenColor(hex, factor) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * factor)},${Math.floor(g * factor)},${Math.floor(b * factor)})`;
}

function lightenColor(hex, factor) {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) * factor);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) * factor);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) * factor);
  return `rgb(${Math.floor(r)},${Math.floor(g)},${Math.floor(b)})`;
}

// ==================== Canvas UI 绘制 ====================

/** 羊皮纸面板（替代 panel_bg 图片） */
function drawPanel(x, y, w, h) {
  // 羊皮纸底色
  ctx.fillStyle = 'rgba(245, 235, 210, 0.96)';
  ctx.fillRect(x, y, w, h);
  // 内边框
  ctx.strokeStyle = '#B8960F';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  // 外木框
  ctx.strokeStyle = '#6A4A10';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  // 四角装饰
  const cs = 6;
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(x, y, cs, cs);
  ctx.fillRect(x + w - cs, y, cs, cs);
  ctx.fillRect(x, y + h - cs, cs, cs);
  ctx.fillRect(x + w - cs, y + h - cs, cs, cs);
}

/** 木头按钮（替代 btn_wood 图片） */
function drawWoodButton(x, y, w, h, hovered, disabled) {
  // 底色
  ctx.fillStyle = disabled ? '#A09080' : (hovered ? '#8B6914' : '#6A4A10');
  ctx.fillRect(x, y, w, h);
  // 高光（上边）
  ctx.fillStyle = disabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,200,0.15)';
  ctx.fillRect(x, y, w, 2);
  // 阴影（下边）
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(x, y + h - 2, w, 2);
  // 边框
  if (!disabled && hovered) {
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  } else {
    ctx.strokeStyle = disabled ? '#8A7A6A' : '#4A3A0A';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}

/** 金币图标（替代 coin_gold 图片） */
function drawCoinIcon(cx, cy, size) {
  const r = size / 2;
  // 外圈
  ctx.fillStyle = '#D4A030';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  // 内圈
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.75, 0, Math.PI * 2);
  ctx.fill();
  // 高光
  ctx.fillStyle = 'rgba(255,255,200,0.4)';
  ctx.beginPath();
  ctx.arc(cx - r * 0.2, cy - r * 0.2, r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  // G 字母
  ctx.font = `bold ${Math.floor(r * 1.2)}px ${FONT_UI}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8B6914';
  ctx.fillText('G', cx, cy + 1);
}

/** 木头底栏（替代 bar_bottom 图片） */
function drawWoodBar(x, y, w, h) {
  // 底色
  ctx.fillStyle = 'rgba(70, 45, 20, 0.92)';
  ctx.fillRect(x, y, w, h);
  // 木纹线条
  ctx.strokeStyle = 'rgba(100, 70, 30, 0.4)';
  ctx.lineWidth = 1;
  for (let ly = y + 4; ly < y + h; ly += 6) {
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + w, ly);
    ctx.stroke();
  }
  // 上边缘高光
  ctx.fillStyle = 'rgba(180, 140, 80, 0.3)';
  ctx.fillRect(x, y, w, 2);
  // 下边缘阴影
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(x, y + h - 2, w, 2);
}

// ==================== 鱼 ====================

/** 画一条鱼（使用 AI 生成的精灵图） */
function drawPixelFish(x, y, fish, flip, scale) {
  const s = scale || 1;
  // 游戏内鱼的显示尺寸
  const baseW = 30, baseH = 20;
  const w = baseW * s, h = baseH * s;

  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));
  if (flip) ctx.scale(-1, 1);
  drawImg(`fish_${fish.id}`, -w / 2, -h / 2, w, h);
  ctx.restore();
}

/** 画剪影鱼（图鉴未解锁） */
function drawFishSilhouette(x, y, scale) {
  const s = scale || 1;
  ctx.save();
  ctx.translate(Math.floor(x), Math.floor(y));
  ctx.scale(s, s);
  const c = '#B8A890';
  pxRect(-8, -3, 16, 6, c);
  pxRect(-6, -4, 12, 8, c);
  pxRect(6, -2, 4, 4, c);
  pxRect(-10, -5, 3, 4, c);
  pxRect(-10,  1, 3, 4, c);
  pxRect(-12, -6, 2, 3, c);
  pxRect(-12,  3, 2, 3, c);
  pxRect(-2, -5, 4, 2, c);
  ctx.restore();
}

// ==================== 场景元素 ====================

// ==================== 场景背景（水彩风格图片） ====================

function drawSceneBackground() {
  // 根据当前地图绘制背景
  const map = MAPS.find(m => m.id === gameState.currentMap) || MAPS[0];
  drawImg(map.bgImage, 0, 0, W, H);
}

/** 动态水面波纹叠加层（在背景图上添加动画效果） */
function drawWaterOverlay(time) {
  // 半透明波纹层
  for (let layer = 0; layer < 3; layer++) {
    const alpha = 0.04 + layer * 0.015;
    const yOff  = CONFIG.WATERLINE + layer * 10;
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(0, yOff);
    for (let x = 0; x <= W; x += 2) {
      const y = Math.sin(x * 0.025 + time * 0.0015 + layer * 1.5) * 2
              + Math.sin(x * 0.06  + time * 0.002  + layer * 3)   * 0.8;
      ctx.lineTo(x, yOff + y);
    }
    ctx.lineTo(W, H); ctx.lineTo(0, H);
    ctx.closePath(); ctx.fill();
  }

  // 水面高光线
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const y = CONFIG.WATERLINE + Math.sin(x * 0.03 + time * 0.002) * 1.5;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

function drawDock() {
  const dy = CONFIG.DOCK_Y;
  const dl = CONFIG.DOCK_LEFT;
  const dr = CONFIG.DOCK_RIGHT;
  const dockW = dr - dl;
  // 码头图片：宽度匹配码头区域，高度按比例缩放
  const dockH = 55;
  drawImg('bg_dock', dl, dy - 10, dockW, dockH);
}

// ==================== 角色 & 鱼竿 ====================

function drawCharacter(time, fishingState) {
  const cx = CONFIG.CHAR_X;
  const cy = CONFIG.CHAR_Y;
  const bobY = Math.sin(time * 0.002) * 0.5;

  // 角色尺寸（游戏内显示约 36x54）
  const charW = 36, charH = 54;

  // 轻微呼吸动画
  ctx.save();
  ctx.translate(cx, cy + bobY);

  // 绘制角色图片（居中偏移）
  drawImg('char_fisherman', -charW / 2, -charH + 10, charW, charH);

  // 不同状态的鱼竿角度（代码绘制鱼竿，因为需要动态角度）
  if (fishingState === 'casting') {
    drawRod(charW / 2 + 2, -charH / 2, -0.8);
  } else if (fishingState === 'reeling') {
    drawRod(charW / 2 + 1, -charH / 2 + 4, -0.4 + Math.sin(time * 0.01) * 0.1);
  } else if (fishingState === 'bite') {
    drawRod(charW / 2 + 2, -charH / 2 + 2, -0.5);
  } else {
    drawRod(charW / 2 + 1, -charH / 2 + 6, -0.3);
  }

  ctx.restore();
}

function drawRod(baseX, baseY, angle) {
  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(angle);

  const segments = 8, segLen = 6;
  let px = 0, py = 0;
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let i = 0; i < segments; i++) {
    const bend = (i / segments) * 0.05;
    px += Math.cos(bend) * segLen;
    py -= Math.sin(bend + 0.3) * segLen;
    ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.strokeStyle = '#D4B060'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px, py);
  px += 3; py -= 2;
  ctx.lineTo(px, py);
  ctx.stroke();

  ctx.restore();
}

function drawFishingLine(time) {
  const gs = gameState;
  if (gs.fishing === 'idle') return;

  const rodTipX = CONFIG.CHAR_X + 55;
  const rodTipY = CONFIG.CHAR_Y - 35;
  const bx = gs.bobberX;
  const by = gs.bobberY + Math.sin(time * 0.003) * 1.5;

  // 鱼线
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(rodTipX, rodTipY);
  ctx.quadraticCurveTo((rodTipX + bx) / 2, Math.max(rodTipY, by) + 15, bx, by);
  ctx.stroke();

  // 水下鱼线 + 钩
  if (gs.fishing === 'waiting' || gs.fishing === 'bite') {
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(bx, by + 4); ctx.lineTo(bx, by + 25); ctx.stroke();
    pxRect(bx - 1, by + 24, 2, 3, '#AAAAAA');
  }
}

// ==================== 浮标 ====================

function drawBobber(time) {
  const gs = gameState;
  if (gs.fishing === 'idle' || gs.fishing === 'casting') return;

  const bx = gs.bobberX;
  let by = gs.bobberY + Math.sin(time * 0.003) * 1.5;

  if (gs.fishing === 'bite') {
    const p = 1 - gs.biteTimer / CONFIG.BITE_WINDOW;
    by += Math.sin(p * Math.PI * 4) * 4 + 3;
  }
  if (gs.fishing === 'reeling') {
    by += Math.sin(time * 0.015) * 3;
  }

  // 浮标杆 + 球
  pxRect(bx - 0.5, by - 8, 1, 12, '#4A3A2A');
  pxCircle(bx, by - 8, 3, '#E84040');
  pxCircle(bx, by - 8, 2, '#FF6060');
  pxRect(bx - 1, by - 4, 2, 3, '#ffffff');

  // 咬钩感叹号
  if (gs.fishing === 'bite') {
    if (Math.sin(time * 0.02) > 0) {
      pxText('!', bx, by - 22, '#FF4444', 14, 'center');
    }
    for (let i = 0; i < 3; i++) {
      pxRect(bx + Math.sin(time * 0.01 + i * 2) * 8,
             by + Math.cos(time * 0.012 + i * 3) * 3 - 2, 2, 2, 'rgba(255,255,255,0.6)');
    }
  }

  // 水波纹
  ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
  const rr = 5 + Math.sin(time * 0.004) * 2;
  ctx.beginPath(); ctx.ellipse(bx, by + 2, rr, rr * 0.3, 0, 0, Math.PI * 2); ctx.stroke();
}

// ==================== 粒子 ====================

function drawSplashParticles() {
  for (const p of gameState.splashParticles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = `rgba(200,230,255,${alpha})`;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), 2, 2);
  }
}

// ==================== 收杆小游戏 UI ====================

function drawReelingUI(time) {
  const gs = gameState;
  if (gs.fishing !== 'reeling') return;

  const fish  = gs.reelFish;
  const barW  = 160, barH = 8;
  const barX  = W / 2 - barW / 2;
  const barY  = 15;

  // 羊皮纸风格背景框
  const pad = 12;
  ctx.fillStyle = 'rgba(245, 235, 210, 0.92)';
  ctx.fillRect(barX - pad, barY - pad, barW + pad * 2, 65);
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
  ctx.strokeRect(barX - pad, barY - pad, barW + pad * 2, 65);

  // 鱼名
  pxText(fish.name, barX + barW / 2, barY - 10, RARITY_COLORS[fish.rarity], 9, 'center');

  // HP 条
  pxText('鱼', barX - 2, barY + 1, '#4A2A0A', 8);
  pxRect(barX + 10, barY, barW, barH, '#D4C4A0');
  const hpR = gs.reelFishHP / fish.hp;
  pxRect(barX + 10, barY, barW * hpR, barH, hpR > 0.5 ? '#44AA44' : hpR > 0.2 ? '#CCAA44' : '#CC4444');
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 1;
  ctx.strokeRect(barX + 10, barY, barW, barH);

  // 张力条
  pxText('线', barX - 2, barY + 14, '#4A2A0A', 8);
  pxRect(barX + 10, barY + 13, barW, barH, '#D4C4A0');
  const tR = gs.reelTension / gs.reelMaxTension;
  pxRect(barX + 10, barY + 13, barW * tR, barH, tR < 0.5 ? '#4488CC' : tR < 0.8 ? '#CC8844' : '#CC4444');
  ctx.strokeStyle = '#8B6914';
  ctx.strokeRect(barX + 10, barY + 13, barW, barH);

  // 时间条
  const timeR = 1 - gs.reelTimeElapsed / gs.reelTimeLimit;
  const timeColor = timeR > 0.5 ? '#44CC88' : timeR > 0.2 ? '#CCAA44' : '#CC4444';
  pxText('时', barX - 2, barY + 27, '#4A2A0A', 8);
  pxRect(barX + 10, barY + 26, barW, barH, '#D4C4A0');
  pxRect(barX + 10, barY + 26, barW * timeR, barH, timeColor);
  ctx.strokeStyle = '#8B6914';
  ctx.strokeRect(barX + 10, barY + 26, barW, barH);

  pxText('按住鼠标收杆，松开休息', barX + barW / 2, barY + 39, '#6A4A2A', 8, 'center', true);
}

// ==================== UI 底栏 ====================

function drawUIBar() {
  const gs = gameState;

  // 底栏
  drawWoodBar(0, CONFIG.UI_BAR_Y, W, H - CONFIG.UI_BAR_Y);

  // 金币图标
  const coinSize = 18;
  const coinY = CONFIG.UI_BAR_Y + 6;
  drawCoinIcon(15, coinY + coinSize / 2, coinSize);
  pxText(`${gs.gold}`, 28, CONFIG.UI_BAR_Y + 8, '#FFF8E0', 11);

  pxText(`已钓: ${gs.totalCaught}`, 100, CONFIG.UI_BAR_Y + 8, '#E8D8C0', 9);
  pxText(`竿Lv${gs.rodLevel}`,  190, CONFIG.UI_BAR_Y + 8, '#88BBFF', 8);
  pxText(`线Lv${gs.lineLevel}`, 240, CONFIG.UI_BAR_Y + 8, '#88FF88', 8);
  pxText(`饵Lv${gs.baitLevel}`, 290, CONFIG.UI_BAR_Y + 8, '#FFBB88', 8);
}

function drawSceneButtons(time) {
  const gs = gameState;
  const btnY = CONFIG.UI_BAR_Y + 5;
  const btnW = 50, btnH = 20;

  // 商店按钮
  const shopHov = gs.hoveredBtn === 'shop';
  drawWoodButton(350, btnY, btnW, btnH, shopHov, false);
  pxText('商店', 375, btnY + 4, '#FFF8E0', 10, 'center');

  // 图鉴按钮
  const collHov = gs.hoveredBtn === 'collection';
  drawWoodButton(410, btnY, btnW, btnH, collHov, false);
  pxText('图鉴', 435, btnY + 4, '#FFF8E0', 10, 'center');

  // 地图名按钮（左上角）
  const curMap = MAPS.find(m => m.id === gs.currentMap) || MAPS[0];
  const mapBtnHov = gs.hoveredBtn === 'map_select';
  const mapBtnW = 80, mapBtnH = 18;
  drawWoodButton(5, 5, mapBtnW, mapBtnH, mapBtnHov, false);
  pxText(curMap.name, 5 + mapBtnW / 2, 8, '#FFF8E0', 9, 'center');

  // 地图选择面板
  if (gs.showMapSelect) {
    drawMapSelectPanel(time);
  }

  // 状态提示
  if (gs.fishing === 'idle') {
    pxText('点击水面抛竿', W / 2, CONFIG.UI_BAR_Y - 15, 'rgba(255,248,224,0.6)', 9, 'center');
  }
  if (gs.fishing === 'waiting') {
    const dots = '.'.repeat(Math.floor(time / 500) % 4);
    pxText(`等待咬钩${dots}`, W / 2, 50, 'rgba(255,248,224,0.5)', 9, 'center');
  }
}

// ==================== 地图选择面板 ====================

function drawMapSelectPanel(time) {
  const gs = gameState;
  const panelW = 220, panelH = 30 + gs.unlockedMaps.length * 32 + 10;
  const px = 5, py = 28;

  // 羊皮纸底
  ctx.fillStyle = 'rgba(245, 235, 210, 0.96)';
  ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
  ctx.strokeRect(px, py, panelW, panelH);

  pxText('选择地图', px + panelW / 2, py + 4, '#4A2810', 10, 'center');

  for (let i = 0; i < gs.unlockedMaps.length; i++) {
    const mapId = gs.unlockedMaps[i];
    const map = MAPS.find(m => m.id === mapId);
    if (!map) continue;
    const iy = py + 22 + i * 32;
    const isCurrent = gs.currentMap === mapId;
    const hov = gs.hoveredBtn === `map_${mapId}`;

    // 行背景
    ctx.fillStyle = isCurrent ? 'rgba(180,150,100,0.5)' : hov ? 'rgba(160,130,80,0.3)' : 'rgba(140,110,60,0.1)';
    ctx.fillRect(px + 6, iy, panelW - 12, 28);
    if (isCurrent) {
      ctx.strokeStyle = '#D4A030'; ctx.lineWidth = 1;
      ctx.strokeRect(px + 6, iy, panelW - 12, 28);
    }

    pxText(map.name, px + 14, iy + 4, isCurrent ? '#4A2810' : '#6A5A4A', 10, 'left', true);
    // 鱼种数量
    pxText(`${map.fishIds.length}种鱼`, px + panelW - 50, iy + 4, '#8A7A6A', 8, 'left', true);

    if (isCurrent) {
      pxText('当前', px + panelW - 14, iy + 8, '#D4A030', 8, 'right', true);
    }
  }
}

// ==================== 完整场景 ====================

function drawScene(time) {
  const gs = gameState;

  // 水彩背景
  drawSceneBackground();
  // 动态水面波纹
  drawWaterOverlay(time);
  // 码头
  drawDock();
  drawFishingLine(time);
  drawCharacter(time, gs.fishing);
  drawBobber(time);
  drawSplashParticles();

  // 收杆时水下鱼影
  if (gs.fishing === 'reeling') {
    const wiggle = Math.sin(time * 0.01) * 10;
    ctx.globalAlpha = 0.3;
    drawPixelFish(gs.bobberX + wiggle, gs.bobberY + 20, gs.reelFish, wiggle < 0, 1.2);
    ctx.globalAlpha = 1;
  }

  // 钓到鱼 — 鱼跃动画
  if (gs.fishing === 'caught' && gs.caughtTimer > 0) {
    const p = 1 - gs.caughtTimer / 1500;
    drawPixelFish(
      gs.bobberX - 20 + p * 40,
      gs.bobberY - Math.sin(p * Math.PI) * 50,
      gs.caughtFish, false, 1.5
    );
  }

  drawReelingUI(time);

  // 提示文字
  if (gs.hintTimer > 0) {
    ctx.globalAlpha = Math.min(1, gs.hintTimer / 500);
    pxText(gs.hintText, W / 2, 80, '#FFDD44', 12, 'center');
    ctx.globalAlpha = 1;
  }

  // 逃脱
  if (gs.fishing === 'escaped' && gs.escapeTimer > 0) {
    ctx.globalAlpha = Math.min(1, gs.escapeTimer / 500);
    pxText('跑掉了...', W / 2, 80, '#FF6666', 14, 'center');
    ctx.globalAlpha = 1;
  }

  // 钓到鱼信息面板（羊皮纸风格）
  if (gs.fishing === 'caught' && gs.caughtTimer <= 0) {
    const fish = gs.caughtFish;
    const pw = 170, ph = 65;
    const ppx = W / 2 - pw / 2, ppy = 58;
    // 羊皮纸底
    ctx.fillStyle = 'rgba(245, 235, 210, 0.94)';
    ctx.fillRect(ppx, ppy, pw, ph);
    ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2;
    ctx.strokeRect(ppx, ppy, pw, ph);
    // 文字
    pxText(`钓到了 ${fish.name}！`,  W / 2, ppy + 5,  RARITY_COLORS[fish.rarity], 11, 'center');
    pxText(`价值 ${fish.value} 金币`, W / 2, ppy + 22, '#B8860B', 9, 'center');
    pxText(`[${RARITY_NAMES[fish.rarity]}]`,       W / 2, ppy + 36, RARITY_COLORS[fish.rarity], 8, 'center');
    pxText('点击继续',              W / 2, ppy + 50, '#8B6914', 8, 'center', true);
  }

  drawUIBar();
}

// ==================== 标题画面 ====================

function drawTitle(time) {
  drawSceneBackground();
  drawWaterOverlay(time);
  drawDock();
  drawCharacter(time, 'idle');

  // 暖色半透明遮罩
  ctx.fillStyle = 'rgba(25, 18, 8, 0.35)';
  ctx.fillRect(0, 0, W, H);

  const ty = 60 + Math.sin(time * 0.002) * 3;
  // 标题文字
  pxText('钓 鱼 达 人', W / 2, ty, '#FFD700', 28, 'center');
  pxText('休闲钓鱼小游戏', W / 2, ty + 35, '#E8D8C0', 11, 'center');

  // 开始按钮（木板风格）
  const bw = 120, bh = 28, bx = W / 2 - bw / 2, by = 150;
  const hov = gameState.hoveredBtn === 'start';
  drawWoodButton(bx, by, bw, bh, hov, false);
  pxText('点击开始', W / 2, by + 8, '#FFF8E0', 13, 'center');

  pxText('v1.1', W / 2, H - 20, '#8B7950', 8, 'center', true);
}

// ==================== 商店画面 ====================

function drawShop(time) {
  drawScene(time);
  // 暖色遮罩
  ctx.fillStyle = 'rgba(25, 18, 8, 0.5)';
  ctx.fillRect(0, 0, W, H);

  const panelW = 300, panelH = 250;
  const px = W / 2 - panelW / 2, py = 10;

  // 羊皮纸面板
  drawPanel(px, py, panelW, panelH);

  // 标题
  pxText('商 店', W / 2, py + 6, '#4A2810', 16, 'center');

  // 金币显示
  const coinS = 14;
  drawCoinIcon(W / 2 - 33, py + 30, coinS);
  pxText(`金币: ${gameState.gold}`, W / 2 + 2, py + 24, '#B8860B', 10, 'center');

  const types = ['rod', 'line', 'bait'];
  const startY = py + 42;

  for (let i = 0; i < 3; i++) {
    const type = types[i];
    const upg  = UPGRADES[type];
    const lv   = gameState[type + 'Level'];
    const cost = lv < 10 ? upg.costs[lv] : null;
    const maxed = cost === null;

    const iy = startY + i * 36;
    const ihov = gameState.hoveredBtn === `upgrade_${type}`;

    // 行背景
    ctx.fillStyle = ihov && !maxed ? 'rgba(180,150,100,0.35)' : 'rgba(160,130,80,0.15)';
    ctx.fillRect(px + 10, iy, panelW - 20, 32);
    ctx.strokeStyle = 'rgba(139,105,20,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 10, iy, panelW - 20, 32);

    pxText(`${upg.name}  Lv.${lv}`, px + 18, iy + 3, '#3A2A1A', 9, 'left', true);
    pxText(upg.desc, px + 18, iy + 16, '#7A6A5A', 7, 'left', true);

    // 等级点（暖色圆点，10级）
    for (let j = 0; j < 10; j++) {
      const dx = px + 150 + j * 7;
      pxCircle(dx + 3, iy + 8, 2.5, j < lv ? '#D4A030' : '#C4B49A');
      if (j < lv) {
        pxCircle(dx + 3, iy + 8, 1.2, '#FFD700');
      }
    }

    if (maxed) {
      pxText('已满级', px + 255, iy + 8, '#8A7A6A', 9, 'center', true);
    } else {
      const can = gameState.gold >= cost;
      // 购买按钮
      const btnX = px + 230, btnY2 = iy + 3, btnW2 = 50, btnH2 = 16;
      drawWoodButton(btnX, btnY2, btnW2, btnH2, ihov && can, !can);
      pxText(`${cost}G`, btnX + btnW2 / 2, btnY2 + 2, can ? '#FFF8E0' : '#8A7A6A', 9, 'center');
    }
  }

  // 分隔线
  const sepY = startY + 3 * 36 + 4;
  ctx.strokeStyle = 'rgba(139,105,20,0.4)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(px + 15, sepY); ctx.lineTo(px + panelW - 15, sepY); ctx.stroke();
  pxText('地图', px + 20, sepY + 4, '#4A2810', 10, 'left', true);

  // 地图列表
  const mapStartY = sepY + 18;
  for (let i = 0; i < MAPS.length; i++) {
    const map = MAPS[i];
    const isUnlocked = gameState.unlockedMaps.includes(map.id);
    const iy = mapStartY + i * 28;
    const ihov = gameState.hoveredBtn === `shop_map_${map.id}`;

    ctx.fillStyle = ihov && !isUnlocked ? 'rgba(180,150,100,0.3)' : 'rgba(160,130,80,0.1)';
    ctx.fillRect(px + 10, iy, panelW - 20, 24);
    ctx.strokeStyle = 'rgba(139,105,20,0.2)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 10, iy, panelW - 20, 24);

    pxText(map.name, px + 18, iy + 3, '#3A2A1A', 9, 'left', true);
    pxText(`${map.fishIds.length}种鱼`, px + 100, iy + 3, '#8A7A6A', 8, 'left', true);

    if (isUnlocked) {
      pxText('已解锁', px + panelW - 20, iy + 5, '#55AA55', 8, 'right', true);
    } else {
      const can = gameState.gold >= 5000;
      const btnX = px + 230, btnY2 = iy + 3, btnW2 = 50, btnH2 = 16;
      drawWoodButton(btnX, btnY2, btnW2, btnH2, ihov && can, !can);
      pxText('5000G', btnX + btnW2 / 2, btnY2 + 2, can ? '#FFF8E0' : '#8A7A6A', 8, 'center');
    }
  }

  // 关闭按钮
  const ch = gameState.hoveredBtn === 'close_shop';
  const clx = px + panelW - 25, cly = py + 3, clw = 20, clh = 16;
  drawWoodButton(clx, cly, clw, clh, ch, false);
  pxText('X', clx + clw / 2, cly + 2, '#FFF8E0', 10, 'center');
}

// ==================== 图鉴画面 ====================

function drawCollection(time) {
  drawScene(time);
  // 暖色遮罩
  ctx.fillStyle = 'rgba(25, 18, 8, 0.5)';
  ctx.fillRect(0, 0, W, H);

  const gs = gameState;
  const panelW = 360, panelH = 250;
  const px = W / 2 - panelW / 2, py = 8;

  // 羊皮纸面板
  drawPanel(px, py, panelW, panelH);

  const caught = Object.keys(gs.collection).length;
  pxText('图 鉴', W / 2, py + 4, '#4A2810', 16, 'center');
  pxText(`${caught} / ${FISH_DATA.length}`, W / 2, py + 22, '#7A6A5A', 9, 'center', true);

  // 网格 6×5（适配 30 种鱼）
  const gx0 = px + 12, gy0 = py + 36;
  const cw = 56, ch = 30;

  for (let i = 0; i < FISH_DATA.length; i++) {
    const fish = FISH_DATA[i];
    const col = i % 6, row = Math.floor(i / 6);
    const cx = gx0 + col * cw + cw / 2;
    const cy = gy0 + row * ch + 8;
    const cellX = gx0 + col * cw, cellY = gy0 + row * ch;
    const isCaught = gs.collection[fish.id];
    const isSel = gs.selectedFish === fish.id;
    const hov = gameState.hoveredBtn === `fish_${fish.id}`;

    // 格子背景
    ctx.fillStyle = isSel ? 'rgba(180,150,100,0.45)' : hov ? 'rgba(160,130,80,0.3)' : 'rgba(140,110,60,0.12)';
    ctx.fillRect(cellX + 1, cellY + 1, cw - 2, ch - 2);
    if (isSel) {
      ctx.strokeStyle = RARITY_COLORS[fish.rarity]; ctx.lineWidth = 1;
      ctx.strokeRect(cellX + 1, cellY + 1, cw - 2, ch - 2);
    }

    if (isCaught) drawPixelFish(cx, cy, fish, false, 0.7);
    else          drawFishSilhouette(cx, cy, 0.7);

    pxText(fish.name, cx, cellY + ch - 9, isCaught ? RARITY_COLORS[fish.rarity] : '#A09888', 7, 'center');
    if (isCaught) pxText(`x${gs.collection[fish.id].count}`, cx + 18, cellY + ch - 9, '#7A6A5A', 6, 'center', true);
  }

  // 详情
  if (gs.selectedFish >= 0 && gs.collection[gs.selectedFish]) {
    const fish = FISH_DATA[gs.selectedFish];
    const info = gs.collection[gs.selectedFish];
    const dy = gy0 + 5 * ch + 2;
    ctx.fillStyle = 'rgba(180,150,100,0.3)';
    ctx.fillRect(px + 10, dy, panelW - 20, 28);
    ctx.strokeStyle = 'rgba(139,105,20,0.3)'; ctx.lineWidth = 1;
    ctx.strokeRect(px + 10, dy, panelW - 20, 28);
    pxText(`[${RARITY_NAMES[fish.rarity]}] ${fish.name}`, px + 18, dy + 2, RARITY_COLORS[fish.rarity], 9, 'left', true);
    pxText(fish.desc, px + 18, dy + 15, '#6A5A4A', 7, 'left', true);
    pxText(`已钓: ${info.count}  最大: ${info.biggest}cm  单价: ${fish.value}G`,
           px + panelW - 18, dy + 7, '#7A6A5A', 7, 'right', true);
  }

  // 关闭按钮
  const ch2 = gameState.hoveredBtn === 'close_collection';
  const clx = px + panelW - 25, cly = py + 3, clw = 20, clh = 16;
  drawWoodButton(clx, cly, clw, clh, ch2, false);
  pxText('X', clx + clw / 2, cly + 2, '#FFF8E0', 10, 'center');
}

// ============================================================
//  作弊 / 测试面板（F9 切换）
// ============================================================
function drawCheatPanel() {
  const gs = gameState;
  if (!gs.showCheatPanel) return;

  const panelW = 280, panelH = 210;
  const px = W / 2 - panelW / 2, py = H / 2 - panelH / 2;

  // 半透明遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, W, H);

  // 深色面板
  ctx.fillStyle = 'rgba(30, 25, 40, 0.95)';
  ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = '#E04040';
  ctx.lineWidth = 2;
  ctx.strokeRect(px, py, panelW, panelH);
  ctx.strokeStyle = 'rgba(224, 64, 64, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 4, py + 4, panelW - 8, panelH - 8);

  // 标题
  pxText('作弊 / 测试面板', W / 2, py + 6, '#FF6666', 13, 'center');
  pxText('F9 关闭', W / 2, py + 22, '#887777', 8, 'center');

  // 按钮数据：3 列布局
  const btns = [
    { id: 'cheat_gold1k',   label: '+1000G',     col: 0, row: 0 },
    { id: 'cheat_gold5k',   label: '+5000G',     col: 1, row: 0 },
    { id: 'cheat_gold10k',  label: '+10000G',    col: 2, row: 0 },
    { id: 'cheat_maps',     label: '解锁全地图',  col: 0, row: 1 },
    { id: 'cheat_maxlv',    label: '满级装备',    col: 1, row: 1 },
    { id: 'cheat_allfish',  label: '全鱼入鉴',    col: 2, row: 1 },
    { id: 'cheat_fish',     label: '指定鱼搏斗',  col: 1, row: 2 },
    { id: 'cheat_reset',    label: '重置存档',    col: 0, row: 2 },
    { id: 'cheat_close',    label: '关闭面板',    col: 2, row: 2 },
  ];

  const bw = 78, bh = 28, gap = 6;
  const gx0 = px + (panelW - (bw * 3 + gap * 2)) / 2;
  const gy0 = py + 40;

  for (const btn of btns) {
    const bx = gx0 + btn.col * (bw + gap);
    const by = gy0 + btn.row * (bh + gap);
    const hov = gs.hoveredBtn === btn.id;
    const isDanger = btn.id === 'cheat_reset';

    // 按钮背景
    ctx.fillStyle = isDanger
      ? (hov ? '#A03030' : '#702020')
      : (hov ? '#505068' : '#3A3A4A');
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = isDanger ? '#E04040' : (hov ? '#AAAACC' : '#666680');
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    // 按钮文字
    const fontSize = btn.label.length > 4 ? 8 : 9;
    pxText(btn.label, bx + bw / 2, by + bh / 2 - fontSize / 2 + 1,
           isDanger ? '#FF8888' : (hov ? '#FFFFFF' : '#CCCCEE'), fontSize, 'center');
  }

  // 当前状态提示
  const curMap = MAPS.find(m => m.id === gs.currentMap) || MAPS[0];
  pxText(`金币: ${gs.gold}  地图: ${curMap.name}`, W / 2, py + panelH - 18, '#998888', 8, 'center');
  pxText(`竿Lv${gs.rodLevel} 线Lv${gs.lineLevel} 饵Lv${gs.baitLevel}  图鉴: ${Object.keys(gs.collection).length}/${FISH_DATA.length}`,
         W / 2, py + panelH - 8, '#776666', 7, 'center');
}
