// ============================================================
//  main.js — 画布尺寸设置 + 游戏主循环 + 启动
// ============================================================

// ---------- 画布尺寸（canvas / ctx 已在 index.html 中创建） ----------
canvas.width  = W * CANVAS_SCALE;
canvas.height = H * CANVAS_SCALE;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';

// ---------- 主循环 ----------
let lastTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min(timestamp - lastTime, 50); // 防止跳帧
  lastTime = timestamp;

  const gs = gameState;
  gs.time = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 应用缩放，所有绘制坐标按 CANVAS_SCALE 倍渲染
  ctx.save();
  ctx.scale(CANVAS_SCALE, CANVAS_SCALE);

  switch (gs.screen) {
    case 'title':
      drawTitle(timestamp);
      break;
    case 'shop':
      drawShop(timestamp);
      break;
    case 'collection':
      drawCollection(timestamp);
      break;
    default: // scene
      updateFishing(dt);
      drawScene(timestamp);
      drawSceneButtons(timestamp);
      break;
  }

  // 作弊面板（所有屏幕的顶层覆盖）
  drawCheatPanel();

  ctx.restore();

  updateParticles(dt);
  if (gs.hintTimer > 0) gs.hintTimer -= dt;

  requestAnimationFrame(gameLoop);
}

// ---------- 启动 ----------
loadUIImages();
loadGame();
applyMapLayout(gameState.currentMap); // 应用存档中的地图布局
gameState.screen  = 'title';
gameState.fishing = 'idle';
requestAnimationFrame(gameLoop);
