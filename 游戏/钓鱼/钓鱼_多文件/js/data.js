// ============================================================
//  data.js — 游戏数据与配置常量（纯数据，不含逻辑）
// ============================================================

// ---------- 画布尺寸 ----------
const W = 480;
const H = 270;
const CANVAS_SCALE = 2;  // 画布像素分辨率倍率

// ---------- 场景布局常量 ----------
const CONFIG = {
  WATERLINE: 125,        // 水面 y 坐标
  DOCK_Y: 168,           // 码头平台 y 坐标
  DOCK_LEFT: 0,          // 码头左边界
  DOCK_RIGHT: 175,       // 码头右边界
  CHAR_X: 110,           // 角色 x
  CHAR_Y: 183,           // 角色 y（站在码头上）
  UI_BAR_Y: 240,         // 底部 UI 栏
  BOBBER_REST_X: 310,    // 浮标默认 x
  BOBBER_REST_Y: 145,    // 浮标默认 y
  WAIT_MIN: 3000,        // 最短等待 ms
  WAIT_MAX: 8000,        // 最长等待 ms
  BITE_WINDOW: 1500,     // 咬钩判定窗口 ms
};

// ---------- 鱼类数据 ----------
// rarity: 0=普通  1=优良  2=稀有  3=传说  4=隐藏
// timeLimit: 收杆时间限制（毫秒），超时鱼会跑掉
const FISH_DATA = [
  // 原有鱼种
  { id: 0, name: '鲫鱼',   rarity: 0, value: 5,   hp: 30,  pull: 2,  hookWindow: 2000, timeLimit: 15000, color: '#C0A060', size: [8, 12],  desc: '最常见的淡水鱼，肉质鲜嫩' },
  { id: 1, name: '鲤鱼',   rarity: 0, value: 8,   hp: 40,  pull: 3,  hookWindow: 1800, timeLimit: 14000, color: '#D4A030', size: [12, 20], desc: '金色鳞片，力大无穷' },
  { id: 2, name: '草鱼',   rarity: 0, value: 10,  hp: 35,  pull: 2,  hookWindow: 1800, timeLimit: 14000, color: '#6B8E4E', size: [14, 24], desc: '水草为食，身形修长' },
  { id: 3, name: '鲶鱼',   rarity: 1, value: 20,  hp: 60,  pull: 5,  hookWindow: 1500, timeLimit: 12000, color: '#5A4A3A', size: [16, 28], desc: '夜行性底栖鱼，胡须灵敏' },
  { id: 4, name: '黑鱼',   rarity: 1, value: 25,  hp: 70,  pull: 6,  hookWindow: 1300, timeLimit: 11000, color: '#2A3A2A', size: [18, 32], desc: '凶猛掠食者，生命力顽强' },
  { id: 5, name: '鳜鱼',   rarity: 1, value: 30,  hp: 55,  pull: 4,  hookWindow: 1500, timeLimit: 12000, color: '#8B7355', size: [14, 22], desc: '花纹美丽，肉质鲜美' },
  { id: 6, name: '鲈鱼',   rarity: 2, value: 50,  hp: 90,  pull: 8,  hookWindow: 1000, timeLimit: 9000,  color: '#7A9B6A', size: [20, 35], desc: '路亚目标鱼，爆发力强' },
  { id: 7, name: '金鱼',   rarity: 2, value: 40,  hp: 50,  pull: 3,  hookWindow: 1000, timeLimit: 10000, color: '#FF6B35', size: [8, 14],  desc: '观赏珍品，意外上钩' },
  { id: 8, name: '锦鲤',   rarity: 2, value: 80,  hp: 100, pull: 10, hookWindow: 800,  timeLimit: 8000,  color: '#E84040', size: [22, 38], desc: '好运象征，极为珍贵' },
  { id: 9, name: '龙鱼',   rarity: 3, value: 200, hp: 150, pull: 15, hookWindow: 500,  timeLimit: 10000, color: '#FFD700', size: [28, 45], desc: '传说中的鱼中之王' },
  // 新增鱼种
  { id: 10, name: '黄腹月亮宝石', rarity: 2, value: 60,  hp: 70,  pull: 6,  hookWindow: 900,  timeLimit: 9000,  color: '#FFD700', size: [10, 16], desc: '腹部金黄如宝石，月光下闪烁' },
  { id: 11, name: '魔鬼刀',       rarity: 2, value: 70,  hp: 80,  pull: 7,  hookWindow: 800,  timeLimit: 8500,  color: '#4A4A4A', size: [20, 30], desc: '背鳍如刀，游姿诡异' },
  { id: 12, name: '枯叶鲶',       rarity: 1, value: 35,  hp: 50,  pull: 4,  hookWindow: 1200, timeLimit: 11000, color: '#8B7355', size: [15, 22], desc: '伪装成枯叶，伏击猎物' },
  { id: 13, name: '笑猫',         rarity: 3, value: 150, hp: 120, pull: 12, hookWindow: 600,  timeLimit: 7000,  color: '#FF8C00', size: [18, 28], desc: '嘴角上扬如笑，极为罕见' },
  { id: 14, name: '哥伦比亚豹猫', rarity: 3, value: 180, hp: 130, pull: 13, hookWindow: 550,  timeLimit: 6500,  color: '#D2691E', size: [22, 35], desc: '豹纹斑斓，来自哥伦比亚' },
  { id: 15, name: '一间鼠',       rarity: 1, value: 25,  hp: 45,  pull: 3,  hookWindow: 1400, timeLimit: 12000, color: '#A9A9A9', size: [8, 12],  desc: '体型小巧，行动敏捷' },
  { id: 16, name: '红钻藩王',     rarity: 4, value: 500, hp: 200, pull: 20, hookWindow: 300,  timeLimit: 12000, color: '#DC143C', size: [30, 50], desc: '【隐藏】红色钻石般的鳞片，王者之气' },
  { id: 17, name: '七彩神仙',     rarity: 2, value: 90,  hp: 85,  pull: 7,  hookWindow: 850,  timeLimit: 8000,  color: '#FF69B4', size: [16, 24], desc: '七彩斑斓，神仙般美丽' },
  { id: 18, name: '皇冠直升机',   rarity: 3, value: 160, hp: 110, pull: 11, hookWindow: 650,  timeLimit: 6800,  color: '#FFD700', size: [25, 40], desc: '背鳍如皇冠，游动如直升机' },
  { id: 19, name: '虎纹银板',     rarity: 1, value: 40,  hp: 65,  pull: 5,  hookWindow: 1100, timeLimit: 10000, color: '#C0C0C0', size: [18, 28], desc: '银色身体带虎纹，群游壮观' },
  { id: 20, name: '红尾猫',       rarity: 2, value: 55,  hp: 75,  pull: 6,  hookWindow: 950,  timeLimit: 9500,  color: '#FF4500', size: [20, 32], desc: '尾巴鲜红如猫，活泼好动' },
  { id: 21, name: '虎皮鸭嘴',     rarity: 2, value: 65,  hp: 80,  pull: 7,  hookWindow: 900,  timeLimit: 8800,  color: '#DAA520', size: [22, 35], desc: '虎纹皮肤，鸭嘴形状独特' },
  { id: 22, name: '海马',         rarity: 3, value: 120, hp: 90,  pull: 8,  hookWindow: 700,  timeLimit: 7500,  color: '#FFA500', size: [6, 10],  desc: '直立游泳，雄性育儿' },
  { id: 23, name: '美人鱼',       rarity: 4, value: 800, hp: 250, pull: 25, hookWindow: 200,  timeLimit: 15000, color: '#FF69B4', size: [35, 60], desc: '【隐藏】传说中的生物，半人半鱼' },
];

const RARITY_NAMES  = ['普通', '优良', '稀有', '传说', '隐藏'];
const RARITY_COLORS = ['#AAAAAA', '#55CC55', '#5599FF', '#FFAA00', '#FF44FF'];

// ---------- 升级数据 ----------
const UPGRADES = {
  rod:  { name: '鱼竿', desc: '收杆速度+25%，咬钩窗口+0.3s', costs: [0, 30, 80, 200, 500, 1000, 2000, 4000, 8000, 15000] },
  line: { name: '鱼线', desc: '张力恢复+12%，张力上限+12',    costs: [0, 25, 60, 150, 400, 800, 1600, 3200, 6000, 12000] },
  bait: { name: '鱼饵', desc: '等待时间-10%，稀有鱼概率+5%',  costs: [0, 20, 50, 120, 300, 600, 1200, 2500, 5000, 10000] },
};

// ---------- 地图数据 ----------
// 每张地图有独立的背景图、场景布局、可钓鱼种
const MAPS = [
  {
    id: 'default',
    name: '宁静湖畔',
    bgImage: 'bg_scene_main',
    // 场景布局
    waterline: 125,
    dockY: 168,
    dockLeft: 0,
    dockRight: 175,
    charX: 110,
    charY: 183,
    bobberX: 310,
    bobberY: 145,
    // 可钓鱼种 ID 列表
    fishIds: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23],
  },
  {
    id: 'ice_lake',
    name: '北方冰湖',
    bgImage: 'bg_scene_ice_lake',
    waterline: 120,
    dockY: 165,
    dockLeft: 0,
    dockRight: 160,
    charX: 100,
    charY: 180,
    bobberX: 300,
    bobberY: 140,
    // 冷水鱼种
    fishIds: [3, 4, 6, 9, 11, 13, 16, 22, 24, 25, 26],
  },
  {
    id: 'africa_river',
    name: '南非河流',
    bgImage: 'bg_scene_africa_river',
    waterline: 130,
    dockY: 170,
    dockLeft: 0,
    dockRight: 170,
    charX: 105,
    charY: 185,
    bobberX: 305,
    bobberY: 148,
    // 热带/非洲鱼种
    fishIds: [0, 1, 3, 5, 7, 10, 12, 14, 17, 19, 20, 21, 27, 28, 29],
  },
];

// 新地图专属鱼种（id 24+）
// 北方冰湖专属
FISH_DATA.push(
  { id: 24, name: '三文鱼',   rarity: 1, value: 45,  hp: 70,  pull: 6,  hookWindow: 1100, timeLimit: 10000, color: '#E87878', size: [18, 30], desc: '洄游鱼类，肉质鲜美', maps: ['ice_lake'] },
  { id: 25, name: '虹鳟鱼',   rarity: 2, value: 75,  hp: 85,  pull: 8,  hookWindow: 900,  timeLimit: 9000,  color: '#FF6B6B', size: [16, 26], desc: '冷水鱼，体侧有彩虹条纹', maps: ['ice_lake'] },
  { id: 26, name: '北极红点鲑', rarity: 3, value: 180, hp: 120, pull: 14, hookWindow: 600,  timeLimit: 7000,  color: '#FF4444', size: [22, 38], desc: '极地珍稀鱼类，红色斑点', maps: ['ice_lake'] },
);
// 南非河流专属
FISH_DATA.push(
  { id: 27, name: '罗非鱼',   rarity: 0, value: 15,  hp: 40,  pull: 3,  hookWindow: 1600, timeLimit: 13000, color: '#8B8B8B', size: [12, 20], desc: '非洲常见淡水鱼，适应力强', maps: ['africa_river'] },
  { id: 28, name: '虎鱼',     rarity: 3, value: 200, hp: 140, pull: 16, hookWindow: 500,  timeLimit: 6000,  color: '#FFD700', size: [24, 40], desc: '非洲猛鱼，牙齿锋利如虎', maps: ['africa_river'] },
  { id: 29, name: '象鼻鱼',   rarity: 2, value: 90,  hp: 60,  pull: 5,  hookWindow: 1000, timeLimit: 9500,  color: '#4A4A6A', size: [14, 22], desc: '长鼻如象，能发出电脉冲', maps: ['africa_river'] },
);
