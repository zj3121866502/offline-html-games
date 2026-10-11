'use strict';
/* ==================================================================
 * 修仙大富翁 v2 —— 静态数据（美术资源 / 平衡参数 / 棋盘 / 道具 / 人物）
 * ================================================================== */
/* 美术资源：相对路径；文件缺失时界面自动回落 SVG 剪影（见 ui.js avHtml） */
const IMG={
  av:['assets/img/p0.jpg','assets/img/p1.jpg','assets/img/p2.jpg','assets/img/p3.jpg'],
  center:'assets/img/center.jpg',
  bg:'assets/img/bg.jpg'
};

/* ---------- 平衡参数（调平衡只动这里，别全文搜魔法数） ---------- */
const CONFIG={
  jailPay:300, jailRounds:2,                       /* 闭关赎金 / 面壁轮数 */
  startPassRs:300, startPassXw:8,                  /* 路过起点 */
  startLandRs:500, startLandXw:12,                 /* 正落起点（与路过叠加，规则弹窗已注明） */
  tribBase:250, tribXwMult:1.5, tribCap:650,       /* 天劫 = base + 修为×mult，封顶 cap */
  betRs:300, battleWinXw:10,                       /* 切磋赌注 / 胜者修为 */
  springRs:150, springXw:5, moonXw:12, teaXw:15,   /* 灵泉 / 飞升台 / 悟道茶（修为供给旋钮，防冲刺飞升） */
  epiphanyXw:12, hintXw:15,                        /* 机缘·醍醐灌顶 / 奇遇·高人指点 */
  marketRestock:3, restockChance:.35,              /* 坊市每轮 35% 概率补 1 张（上限 3） */
  sellBase:.5, sellPerLevel:.15,                   /* 卖地价 = 地价×(0.5 + 等级×0.15) */
  /* W2 飞升成本模型：cost = max(floor, winRs + 轮数×通胀 − 洞府折抵 − 整组折抵)
     K2 营造轴重定价：折抵 100/150→160/240（满配 ~1200 对 25 轮通胀 1750，builder 重新可活） */
  rsInflationPerRound:70, discountPerDao:160, discountPerGroup:240, costFloor:500,   /* K1：通胀 40→70 */
  /* W3 终局压力：最后 endgameFrom 轮内天劫 ×mult，奇遇按概率改判雷劫 */
  endgameFrom:8, endgameTribMult:1.5, endgameEventTribChance:.25,
  /* D3 归因开关：逐 W 独立关闭供归因复跑（全 true = 打包整体） */
  toggles:{w2:true, w3:true, w4:true}
};

/* ---------- 棋盘数据（icon 为 SVG 图标名，见 ui.js SVG_PATHS） ---------- */
const GROUPS={
  metal:{n:'金',c:'#b8860b',tiles:[1,3]},
  wood :{n:'木',c:'#4e8f4a',tiles:[5,6,7]},
  water:{n:'水',c:'#3f7fb5',tiles:[10,11,13]},
  fire :{n:'火',c:'#c0504d',tiles:[17,18,20]},
  earth:{n:'土',c:'#9c7a4f',tiles:[22,23,25]}
};
const TILES=[];
function D(i,type,name,icon,extra){TILES[i]={i,type,name,icon,owner:null,level:0,price:0,group:null,...(extra||{})}}
D(0,'start','起点','flag');
D(1,'dao','藏剑庐','sword',{group:'metal',price:600});
D(2,'event','奇遇','scroll');
D(3,'dao','锋金矿','sword',{group:'metal',price:800});
D(4,'luck','机缘','cards');
D(5,'dao','青木园','leaf',{group:'wood',price:1000});
D(6,'dao','万药谷','leaf',{group:'wood',price:1100});
D(7,'dao','灵植园','leaf',{group:'wood',price:1200});
D(8,'jail','闭关石室','meditate');
D(9,'market','坊市','shop');
D(10,'dao','碧波潭','drop',{group:'water',price:1400});
D(11,'dao','寒水宫','drop',{group:'water',price:1500});
D(12,'event','奇遇','scroll');
D(13,'dao','落霞渡','drop',{group:'water',price:1600});
D(14,'luck','机缘','cards');
D(15,'event','奇遇','scroll');
D(16,'spring','灵泉','spring');
D(17,'dao','烈阳峰','flame',{group:'fire',price:1800});
D(18,'dao','丹火崖','flame',{group:'fire',price:1900});
D(19,'event','奇遇','scroll');
D(20,'dao','炎晶洞','flame',{group:'fire',price:2000});
D(21,'luck','机缘','cards');
D(22,'dao','厚土城','mount',{group:'earth',price:2200});
D(23,'dao','盘石岭','mount',{group:'earth',price:2400});
D(24,'moon','飞升台','moon');
D(25,'dao','承天殿','mount',{group:'earth',price:2600});
D(26,'market','坊市','shop');
D(27,'event','奇遇','scroll');
D(28,'arena','切磋','fists');
D(29,'luck','机缘','cards');
D(30,'event','奇遇','scroll');
D(31,'trib','天劫','bolt');
const POS_OF=i=>{if(i===0)return[9,9];if(i<8)return[9,9-i];if(i===8)return[9,1];if(i<16)return[17-i,1];if(i===16)return[1,1];if(i<24)return[1,i-15];if(i===24)return[1,9];return[i-23,9]};

const RENT_MULT=[1,4,10,22];
function baseRent(t){return Math.round(t.price*.15/10)*10}
function groupTiles(g){return GROUPS[g].tiles}
function ownsFullGroup(p,g){return groupTiles(g).every(i=>TILES[i].owner===p.id)}
function rentOf(t){const o=P[t.owner];let m=RENT_MULT[t.level]*baseRent(t);
  if(o&&ownsFullGroup(o,t.group))m*=(t.level===0?2.5:1.5);return Math.round(m/10)*10}
function upCost(t){return Math.round(t.price*.6/10)*10}
/* W4 营造人设：器修（aggr 1.05~1.15）扩建费 −15%（D3：toggles.w4=false 时回 upCost） */
function buildCostOf(p,t){if(!CONFIG.toggles.w4)return upCost(t);
  const base=upCost(t);
  const a=p.persona.aggr;return(a>=1.05&&a<1.2)?Math.round(base*.85/10)*10:base}

/* ---------- 道具（icon 为 SVG 图标名） ---------- */
const ITEMS={
  shenxing:{n:'神行符',icon:'boot',price:400,desc:'立刻再掷骰行动一次'},
  dingshen:{n:'定身符',icon:'nail',price:500,desc:'指定一名对手下回合无法行动'},
  bijie:{n:'避劫符',icon:'shield2',price:300,desc:'自动抵挡下一次天劫或凶险'},
  wudao:{n:'悟道茶',icon:'cup',price:350,desc:'服用后 +15 修为'},
  zezi:{n:'择骰符',icon:'dice',price:450,desc:'下次掷骰任选点数（2~12）'}
};

/* ---------- 出场人物（人设四轴互斥，效果对扮演者真实生效） ----------
 * 剑修·竞速：坊市九折；丹修·守财：开局灵石+350；
 * 器修·营造：扩建费用−15%；体修·长生：天劫伤害−25% */
const PLAYERS_DEF=[
  {name:'剑修·凌霄',color:'#3b7dd8',isAI:false,persona:{aggr:1.25,reserve:500,fight:.9,likes:['zezi','shenxing']}},
  {name:'丹修·阿芷',color:'#d84b8a',isAI:true,persona:{aggr:.85,reserve:700,fight:.5,likes:['bijie','wudao']}},
  {name:'器修·公输',color:'#3ba55c',isAI:true,persona:{aggr:1.1,reserve:500,fight:.7,likes:['dingshen','zezi']}},
  {name:'体修·铁牛',color:'#d8a03b',isAI:true,persona:{aggr:1.0,reserve:420,fight:1.3,likes:['wudao','bijie']}}
];
const PERSONA_AXIS=['竞速','守财','营造','长生'];
const PERSONA_HINT=['坊市九折','开局+350灵石','扩建费-15%','天劫伤害-25%'];
