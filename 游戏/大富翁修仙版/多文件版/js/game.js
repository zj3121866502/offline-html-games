'use strict';
/* ==================================================================
 * 修仙大富翁 v2 —— 游戏逻辑（状态 / 回合 / AI / 存档 / 接线）
 * 依赖 data.js（静态数据）、audio.js（音效）、ui.js（渲染）
 * ================================================================== */
/* ---------- 全局状态 ---------- */
const S={gid:0,over:true,cur:0,round:1,maxRound:40,speed:1,phase:'idle',stock:{},forceDice:null,forceNoDouble:false,awaiting:null,actor:0,winXw:150,winRs:800,autoEnd:false};
let P=[];
/* 数值兜底：非数字取默认，超界钳制（首页参数与作弊面板共用思路） */
function numClamp(v,def,lo,hi){v=Math.round(Number(v));return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):def}
/* 开局选人：你扮演哪位修士（其余三位由 AI 出演），记忆上次选择 */
let HUMAN_PICK=0;
try{const pk=localStorage.getItem('xxsf.pick');if(pk!==null)HUMAN_PICK=Math.max(0,Math.min(3,+pk||0))}catch(e){}

/* ---------- 玩家 ---------- */
/* W1 遥测：来源计数器（闭环不变式：Σsrc.xw === 终xw−初xw，rs 同理） */
const SRC_XW=['pass','moon','event','item','battle','startLand','other'];
const SRC_RS=['pass','rent','rentPaid','event','sell','startLand','battleWin','tribPaid','other'];
function makeSrc(){const s={xw:{},rs:{}};SRC_XW.forEach(k=>s.xw[k]=0);SRC_RS.forEach(k=>s.rs[k]=0);return s}
function makePlayers(humanId,startRs){if(humanId==null)humanId=HUMAN_PICK;
  const rs0=numClamp(startRs,1800,1,99999);
  P=PLAYERS_DEF.map((d,i)=>{const p={id:i,...d,isAI:i!==humanId,rs:rs0,xw:0,pos:0,alive:true,jail:0,frozen:0,
    shield:false,items:{shenxing:0,dingshen:0,bijie:0,wudao:0,zezi:0},auto:false,doubled:false,src:makeSrc()};
    if(!p.isAI&&p.persona.reserve>=600)p.rs=rs0+350;   /* 丹修人设：开局多带灵石 */
    p.rs0=p.rs;p.xw0=0;                                 /* 闭环基线 */
    return p})}
const human=()=>P.find(q=>!q.isAI);
const isBot=p=>p.isAI||p.auto;
function aliveList(){return P.filter(p=>p.alive)}
function others(p){return P.filter(q=>q.alive&&q!==p)}

/* ---------- 掷骰 ---------- */
async function rollDice(){const box=$('diceBox');box.classList.add('rolling');SND.roll();
  for(let i=0;i<7;i++){showDice(1+rnd(6),1+rnd(6),true);await delay(75)}
  let a,b;
  if(S.forceDice){[a,b]=S.forceDice;S.forceDice=null;S.forceNoDouble=true}else{a=1+rnd(6);b=1+rnd(6);S.forceNoDouble=false}
  showDice(a,b,false);box.classList.remove('rolling');return[a,b]}
function waitHumanRoll(){return new Promise(res=>{S.awaiting={type:'roll',res};$('btnRoll').disabled=false})}
$('btnRoll').addEventListener('click',()=>{if(S.awaiting&&S.awaiting.type==='roll'){ac();const r=S.awaiting.res;S.awaiting=null;$('btnRoll').disabled=true;r()}});
async function rollPhase(p){let a,b,usedZezi=false;
  if(!isBot(p)&&p.items.zezi>0){
    const yes=await modal({icon:'dice',title:'择骰符',msg:'消耗一张择骰符，本次点数由你钦定（2~12）。要用吗？',
      buttons:[{text:'不用'},{text:'用！',primary:true}]});
    if(yes===1){const n=await pickNumber(p);if(n){p.items.zezi--;usedZezi=true;a=Math.max(1,Math.min(6,n-1));b=n-a;
      log(pname(p)+' 使用择骰符，钦定点数 '+n);showDice(a,b,false);SND.pop();await delay(300)}}}
  if(!usedZezi){
    if(isBot(p))await delay(550);else await waitHumanRoll();
    [a,b]=await rollDice()}
  log(pname(p)+' 掷出 <b>'+a+' + '+b+' = '+(a+b)+'</b>'+(a===b?'（对子！）':''));
  return{a,b,usedZezi}}
function pickNumber(p){return new Promise(res=>{
  ;(async()=>{const ov=document.createElement('div');ov.className='modal-overlay';
    const box=document.createElement('div');box.className='modal-box';
    box.innerHTML='<div class="modal-title">'+ico('dice')+' 择骰符 · 钦定点数</div><div class="modal-msg">点击想要的点数</div><div class="modal-btns"></div>';
    const bb=box.querySelector('.modal-btns');
    for(let n=2;n<=12;n++){const el=document.createElement('button');el.textContent=n;
      el.onclick=()=>{ov.remove();res(n)};bb.appendChild(el)}
    const cl=document.createElement('button');cl.textContent='取消';cl.onclick=()=>{ov.remove();res(0)};bb.appendChild(cl);
    ov.appendChild(box);$('modalRoot').appendChild(ov)})()})}

/* ---------- 移动 ---------- */
async function movePlayer(p,steps){for(let s=0;s<steps;s++){
    p.pos=(p.pos+1)%32;
    if(p.pos===0){p.rs+=CONFIG.startPassRs;p.xw+=CONFIG.startPassXw;SND.coin();
      p.src.rs.pass+=CONFIG.startPassRs;p.src.xw.pass+=CONFIG.startPassXw;
      log(pname(p)+' 路过起点，领取薪火补给 <b>灵石+'+CONFIG.startPassRs+' 修为+'+CONFIG.startPassXw+'</b>');renderPlayers()}
    renderTokens();await delay(140)}
  await delay(120)}

/* ---------- 支付 / 破产 ---------- */
function payTo(from,to,amount,reason){const pay=Math.min(from.rs,amount);from.rs-=pay;
  if(to)to.rs+=pay;
  if(to)log(pname(from)+' 向 '+pname(to)+' 支付 <b>灵石'+pay+'</b>（'+reason+'）');
  else log(pname(from)+' 损失 <b>灵石'+pay+'</b>（'+reason+'）');
  if(pay<amount){toast(from.name+' 灵石耗尽！');bankrupt(from)}
  else SND.pay();
  renderPlayers();return pay}
function bankrupt(p){p.alive=false;log(pname(p)+' 灵石耗尽，道消身殒，洞府尽数归于天地。');SND.lose();
  TILES.forEach(t=>{if(t.owner===p.id){t.owner=null;t.level=0}});
  renderTiles();
  const al=aliveList();
  if(al.length===1&&!S.over)endGame(al[0],'众修士接连陨落，'+al[0].name+' 独尊灵洲')}

/* ---------- 天劫 ---------- */
function tribulation(p,srcName){if(p.shield){p.shield=false;renderPlayers();
    log(pname(p)+' 的避劫符化作金光，挡下了'+srcName+'！');toast(p.name+' 避劫符生效！');SND.pop();return}
  const dmg=Math.round(Math.min(CONFIG.tribCap,CONFIG.tribBase+Math.floor(p.xw*CONFIG.tribXwMult))
    *(!CONFIG.toggles.w3?1:(S.round>S.maxRound-CONFIG.endgameFrom?CONFIG.endgameTribMult:1))   /* W3 终局压力（可归因关闭） */
    *(CONFIG.toggles.w4&&p.persona.fight>1.2?.75:1));                          /* 体修·长生：天劫-25%（W4，可归因关闭） */
  const loss=Math.min(p.rs,dmg);
  p.rs-=loss;p.src.rs.tribPaid+=loss;SND.hurt();
  log(pname(p)+' 硬扛'+srcName+'，损毁 <b>灵石'+loss+'</b>');
  toast(p.name+' 渡劫失败 -灵石'+loss);
  if(loss<dmg)bankrupt(p);renderPlayers()}

/* ---------- 切磋 ---------- */
async function doBattle(p,q){if(!q)return;SND.battle();
  const pa=Math.floor(p.xw/8)+(1+rnd(6))+(1+rnd(6));
  const qa=Math.floor(q.xw/8)+(1+rnd(6))+(1+rnd(6));
  let msg=p.name+' 攻击 '+pa+'\n'+q.name+' 攻击 '+qa+'\n\n';
  if(pa===qa){msg+='势均力敌，握手言和。';await modal({icon:'fists',title:'切磋 · 不分胜负',msg});return}
  const win=pa>qa?p:q,lose=pa>qa?q:p;
  msg+=(win.name+' 胜出！'+lose.name+' 甘拜下风，奉上 '+CONFIG.betRs+' 灵石。');
  await modal({icon:'fists',title:'切磋 · 问道斗法',msg});
  win.xw+=CONFIG.battleWinXw;win.src.xw.battle+=CONFIG.battleWinXw;
  log(pname(win)+' 切磋胜过 '+pname(lose)+'，赢 <b>灵石'+CONFIG.betRs+' 修为+'+CONFIG.battleWinXw+'</b>');
  const got=payTo(lose,win,CONFIG.betRs,'切磋赌注');win.src.rs.battleWin+=got;lose.src.rs.other-=got;SND.coin()}

/* ---------- 机缘卡 / 奇遇 ---------- */
function grantItem(p){const k=pick(Object.keys(ITEMS));p.items[k]++;
  log(pname(p)+' 获得符箓 '+ico(ITEMS[k].icon)+'<b>'+ITEMS[k].n+'</b>');return ITEMS[k]}
async function luckCard(p,gid,depth){
  const c=pick([
    {t:'天降灵石',d:'一道流光落入袖中，竟是 400 灵石！',f:()=>{p.rs+=400;p.src.rs.event+=400;SND.coin()}},
    {t:'路拾灵石',d:'道旁无人认领的灵石袋，+200。',f:()=>{p.rs+=200;p.src.rs.event+=200;SND.coin()}},
    {t:'走火入魔',d:'运转功法出了岔子，被护山阵法送入闭关石室。',f:()=>sendJail(p)},
    {t:'仙人指路',d:'一位白须老者含笑抬手：「归去来兮。」',f:async()=>{const steps=(32-p.pos)%32||32;await movePlayer(p,steps)}},
    {t:'空间乱流',d:'脚下阵纹忽亮，随机传送！',f:async()=>{await movePlayer(p,1+rnd(12))}},
    {t:'醍醐灌顶',d:'雨夜听雷，豁然开朗。+'+CONFIG.epiphanyXw+' 修为！',f:()=>{p.xw+=CONFIG.epiphanyXw;p.src.xw.event+=CONFIG.epiphanyXw;SND.up()}},
    {t:'心魔滋生',d:'旧事翻涌，道心蒙尘。-20 修为。',f:()=>{const d=Math.min(20,p.xw);p.xw-=d;p.src.xw.event-=d;SND.hurt()}},
    {t:'遭遇劫修',d:'林中跳出黑衣人：「此路是我开！」-300 灵石。',f:()=>{
        if(p.shield){p.shield=false;toast(p.name+' 避劫符挡下劫修！')}else{const l=payTo(p,null,300,'被劫');p.src.rs.event-=l}}},
    {t:'仙鹤代步',d:'一只仙鹤落在肩头，载你前行六格。',f:async()=>{await movePlayer(p,6)}},
    {t:'高人馈赠',d:'「小友骨骼清奇，此符赠你。」',f:()=>{grantItem(p)}},
    {t:'灵田丰收',d:'名下洞府灵植大熟，每处 +80 灵石。',f:()=>{const n=TILES.filter(t=>t.owner===p.id).length;
        p.rs+=n*80;p.src.rs.event+=n*80;if(n)SND.coin();log(pname(p)+' 名下 '+n+' 处洞府丰收 灵石+'+(n*80))}},
    {t:'天机紊乱',d:'你和一位道友的位置在迷雾中互换了……',f:async()=>{const o=pick(others(p));
        if(o){const t=p.pos;p.pos=o.pos;o.pos=t;log(pname(p)+' 与 '+pname(o)+' 互换位置');renderTokens();await delay(300)}}}
  ]);
  SND.pop();
  await modal({icon:'cards',title:'机缘 · '+c.t,msg:c.d});
  log(pname(p)+' 抽中机缘【'+c.t+'】');
  await c.f();
  renderPlayers();
  if((c.t==='空间乱流'||c.t==='仙鹤代步'||c.t==='仙人指路')&&depth<1){await delay(200);await resolveTile(p,gid,depth+1)}}
async function randomEvent(p,gid,depth){
  let e=pick([
    {t:'灵石雨',d:'天降灵雨，落地成金。+150 灵石！',f:()=>{p.rs+=150;p.src.rs.event+=150;SND.coin()}},
    {t:'高人指点',d:'山中老道随口一句，胜读十年书。+'+CONFIG.hintXw+' 修为！',f:()=>{p.xw+=CONFIG.hintXw;p.src.xw.event+=CONFIG.hintXw;SND.up()}},
    {t:'惊扰妖兽',d:'一脚踩上铁背蜈蚣的尾巴，被追了三里。-200 灵石（买路财）。',f:()=>{const l=payTo(p,null,200,'妖兽赔偿');p.src.rs.event-=l}},
    {t:'上古洞府',d:'误入一处上古洞府，取走遗宝。+300 灵石！',f:()=>{p.rs+=300;p.src.rs.event+=300;SND.coin()}},
    {t:'采得灵药',d:'崖边一株百年雪参。+100 灵石。',f:()=>{p.rs+=100;p.src.rs.event+=100;SND.coin()}},
    {t:'除害安民',d:'替山下村民赶走山匪，获赠干粮与谢礼。灵石+50 修为+5',f:()=>{p.rs+=50;p.src.rs.event+=50;p.xw+=5;p.src.xw.event+=5;SND.coin()}},
    {t:'心魔扰动',d:'夜里总是梦见没修完的功法。-15 修为。',f:()=>{const d=Math.min(15,p.xw);p.xw-=d;p.src.xw.event-=d;SND.hurt()}},
    {t:'神秘符箓',d:'石缝里塞着一张微微发烫的符纸……',f:()=>{grantItem(p)}},
    {t:'灵泉沐浴',d:'借灵泉泡了一炷香，神清气爽。+100 灵石。',f:()=>{p.rs+=100;p.src.rs.event+=100;SND.coin()}},
    {t:'仙缘际会',d:'与云游散修论道三日，相谈甚欢。+200 灵石。',f:()=>{p.rs+=200;p.src.rs.event+=200;SND.coin()}},
    {t:'无妄雷劫',d:'晴空一道雷，专挑你劈。-250 灵石。',f:()=>{
        if(p.shield){p.shield=false;toast(p.name+' 避劫符挡下雷劫！')}else{const l=payTo(p,null,250,'雷劫');p.src.rs.event-=l}}},
    {t:'散落灵石',d:'前人斗法遗落的碎片，捡了一小袋。+80 灵石。',f:()=>{p.rs+=80;p.src.rs.event+=80;SND.coin()}},
    {t:'道友邀战',d:'路过的修士抱拳：「可敢与我一战？」',f:async()=>{const o=pick(others(p));if(o)await doBattle(p,o)}},
    {t:'岔路迷踪',d:'雾中走岔了路，退了三格……',f:async()=>{for(let s=0;s<3;s++){p.pos=(p.pos+31)%32;renderTokens();await delay(140)}}}
  ]);
  /* W3 终局压力：末段奇遇按概率改判无妄雷劫（已在雷劫上的不重复改） */
  if(CONFIG.toggles.w3&&S.round>S.maxRound-CONFIG.endgameFrom&&e.t!=='无妄雷劫'&&Math.random()<CONFIG.endgameEventTribChance){
    e={t:'无妄雷劫',d:'末法将至，天威无常——晴空一道雷，专挑你劈。-250 灵石。',f:()=>{
      if(p.shield){p.shield=false;toast(p.name+' 避劫符挡下雷劫！')}else{const l=payTo(p,null,250,'雷劫');p.src.rs.event-=l}}};
  }
  SND.pop();
  await modal({icon:'scroll',title:'奇遇 · '+e.t,msg:e.d});
  log(pname(p)+' 奇遇【'+e.t+'】');
  await e.f();
  renderPlayers();
  if(e.t==='岔路迷踪'&&depth<1){await delay(200);await resolveTile(p,gid,depth+1)}}

/* ---------- 闭关 ---------- */
function sendJail(p){p.pos=8;p.jail=CONFIG.jailRounds;renderTokens();renderPlayers();SND.hurt();
  log(pname(p)+' 被送入闭关石室面壁 '+CONFIG.jailRounds+' 回合');toast(p.name+' 入定闭关')}
/* 闭关选项：按钮自带 act 语义，禁止按下标猜意图（P0-1 回归点，tests.js 有断言） */
function jailOpts(p){const o=[{text:'继续闭关（剩 '+p.jail+' 回合）',act:'stay'}];
  if(p.rs>=CONFIG.jailPay)o.push({text:'破关而出（灵石'+CONFIG.jailPay+'）',primary:true,act:'pay'});
  if(p.items.shenxing>0)o.push({text:'使用神行符（剩'+p.items.shenxing+'张）',act:'sym'});
  return o}
async function jailPhase(p){
  if(isBot(p)){await delay(500);
    if(p.rs>=CONFIG.jailPay){p.rs-=CONFIG.jailPay;p.src.rs.other-=CONFIG.jailPay;p.jail=0;log(pname(p)+' 花费 灵石'+CONFIG.jailPay+' 提前出关');return true}
    if(p.items.shenxing>0){p.items.shenxing--;p.jail=0;log(pname(p)+' 以神行符破关而出');return true}
    p.jail--;log(pname(p)+' 闭关静修（余 '+p.jail+' 回合）');return false}
  const opts=jailOpts(p);
  const i=await modal({icon:'meditate',title:'闭关石室',msg:'你正在闭关面壁。破关而出需 '+CONFIG.jailPay+' 灵石，或以神行符瞬身离开。',buttons:opts});
  const act=(opts[i]||{}).act;
  if(act==='pay'){p.rs-=CONFIG.jailPay;p.src.rs.other-=CONFIG.jailPay;p.jail=0;log(pname(p)+' 破关而出');return true}
  if(act==='sym'){p.items.shenxing--;p.jail=0;log(pname(p)+' 以神行符破关而出');return true}
  p.jail--;log(pname(p)+' 闭关静修（余 '+p.jail+' 回合）');return false}

/* ---------- 购地 / 建造 / 收租 / 出售 ---------- */
async function daoTile(p,t){
  if(t.owner==null){
    if(isBot(p)){if(decideBuy(p,t)){p.rs-=t.price;p.src.rs.other-=t.price;t.owner=p.id;SND.coin();
        log(pname(p)+' 以 灵石'+t.price+' 购入 <b>'+GROUPS[t.group].n+'系·'+esc(t.name)+'</b>');
        toast(p.name+' 购入 '+t.name);await delay(350);renderTiles();renderPlayers()}
      else log(pname(p)+' 观望 '+t.name+'，未出手');
      return}
    const full=ownsFullGroup(p,t.group);
    const i=await modal({icon:t.icon,title:GROUPS[t.group].n+'系洞府 · '+t.name,
      msg:'无主洞府，先到先得。\n购入：灵石'+t.price+'｜基础租金 '+baseRent(t)+
        (full?'｜你已集齐'+GROUPS[t.group].n+'系，租金加成！':'')+'\n你的灵石：'+p.rs,
      buttons:[{text:'放弃'},{text:'购入（灵石'+t.price+'）',primary:true,disabled:p.rs<t.price}]});
    if(i===1){p.rs-=t.price;p.src.rs.other-=t.price;t.owner=p.id;SND.coin();
      log(pname(p)+' 以 灵石'+t.price+' 购入 <b>'+esc(t.name)+'</b>');renderTiles();renderPlayers()}
    return}
  const o=P[t.owner];
  if(o===p){
    if(t.level<3){
      const cost=buildCostOf(p,t);
      if(isBot(p)){if(p.rs-cost>=p.persona.reserve){await buildUp(p,t)}return}
      if(p.rs<cost){toast('自家洞府（灵石不足扩建）');return}
      const i=await modal({icon:t.icon,title:'扩建洞天 · '+t.name,msg:'当前 '+t.level+' 级 → '+(t.level+1)+' 级\n耗费 灵石'+cost+
        (ownsFullGroup(p,t.group)?'\n（已集齐'+GROUPS[t.group].n+'系，租金额外加成！）':'')+'\n（等级越高租金越厚）',
        buttons:[{text:'不了'},{text:'扩建（灵石'+cost+'）',primary:true}]});
      if(i===1)await buildUp(p,t);
    }else toast('洞府已达 3 级洞天');
    return}
  const rent=rentOf(t);
  log(pname(p)+' 误入 '+pname(o)+' 的 <b>'+esc(t.name)+'</b>，租金 '+rent);
  await modal({icon:t.icon,title:'误入他人洞府',msg:esc(t.name)+' 乃 '+esc(o.name)+' 的地界。\n过路租金：灵石'+rent+'（'+t.level+' 级'+(ownsFullGroup(o,t.group)?' · 集齐'+GROUPS[t.group].n+'系':'')+'）'});
  const got=payTo(p,o,rent,'洞府租金');o.src.rs.rent+=got;p.src.rs.rentPaid+=got}
async function buildUp(p,t){const cost=buildCostOf(p,t);
  if(p.rs<cost||t.level>=3)return;
  p.rs-=cost;p.src.rs.other-=cost;t.level++;SND.build();
  log(pname(p)+' 将 <b>'+esc(t.name)+'</b> 扩建至 <b>'+t.level+' 级洞天</b>（灵石'+cost+'）');
  toast(t.name+' → '+t.level+' 级');renderTiles();renderPlayers();await delay(300)}
/* 折价卖地：自救通道 */
function sellPriceOf(p,t){return Math.round(t.price*(CONFIG.sellBase+t.level*CONFIG.sellPerLevel)/10)*10}
function sellTile(p,t){if(t.owner!==p.id)return;const v=sellPriceOf(p,t);
  t.owner=null;t.level=0;p.rs+=v;p.src.rs.sell+=v;SND.coin();
  log(pname(p)+' 将 <b>'+esc(t.name)+'</b> 售还给天地，得 <b>灵石'+v+'</b>');
  toast('已售出 '+t.name+'（+灵石'+v+'）');
  renderTiles();renderPlayers();saveGame()}
function decideBuy(p,t){const g=GROUPS[t.group];
  let budget=p.rs-p.persona.reserve;
  /* 天劫预留：钱花太狠撞上随修为缩放的天劫等于自杀（剑修 AI 曾因此必死） */
  budget-=Math.round(CONFIG.tribBase+p.xw*CONFIG.tribXwMult*.5);
  const mine=groupTiles(t.group).filter(i=>TILES[i].owner===p.id).length;
  if(mine>0)budget+=300;      /* 凑图鉴倾向 */
  if(mine===g.tiles.length-1)budget+=500;
  return t.price<=budget*p.persona.aggr}

/* ---------- 坊市 ---------- */
/* 售价：aggr≥1.2 的修士（剑修人设）享九折 */
function priceOf(p,k){return Math.round(ITEMS[k].price*(p.persona.aggr>=1.2?.9:1))}
async function marketShop(p){
  if(isBot(p)){await aiMarket(p);return}
  while(true){
    const buy=await shopModal(p);
    if(!buy)break;
    const k=buy;
    const cost=priceOf(p,k);
    if(S.stock[k]<=0||p.rs<cost)continue;
    p.rs-=cost;p.src.rs.other-=cost;S.stock[k]--;p.items[k]++;SND.coin();
    log(pname(p)+' 购入 '+ico(ITEMS[k].icon)+'<b>'+ITEMS[k].n+'</b>（灵石'+cost+'）');
    renderPlayers();await delay(250)}}
function shopModal(p){return new Promise(res=>{
  const ov=document.createElement('div');ov.className='modal-overlay';
  const box=document.createElement('div');box.className='modal-box';
  let h='<div class="modal-title">'+ico('shop')+' 坊市 · 符箓铺</div><div class="modal-msg">你的灵石：'+p.rs+'</div>';
  box.innerHTML=h;
  const bb=document.createElement('div');bb.className='modal-btns';
  bb.style.flexDirection='column';bb.style.alignItems='stretch';
  box.appendChild(bb);
  Object.entries(ITEMS).forEach(([k,it])=>{
    const cost=priceOf(p,k);
    const el=document.createElement('button');el.style.textAlign='left';
    const cant=S.stock[k]<=0||p.rs<cost;
    el.innerHTML=ico(ITEMS[k].icon)+' <b style="color:#ffd97a">'+it.n+'</b>　灵石'+cost+'　库存 '+S.stock[k]+'　—　<span style="color:#9aa4b8">'+it.desc+'</span>';
    if(cant)el.disabled=true;
    el.onclick=()=>{ov.remove();res(k)};bb.appendChild(el)});
  const cl=document.createElement('button');cl.textContent='离开坊市';cl.onclick=()=>{ov.remove();res(null)};bb.appendChild(cl);
  ov.appendChild(box);$('modalRoot').appendChild(ov)})}
async function aiMarket(p){const likes=p.persona.likes;let bought=0;
  for(const k of likes){if(bought>=2)break;
    const cost=priceOf(p,k);
    if(S.stock[k]>0&&p.rs>=cost+p.persona.reserve){
      p.rs-=cost;p.src.rs.other-=cost;S.stock[k]--;p.items[k]++;bought++;SND.coin();
      log(pname(p)+' 购入 '+ico(ITEMS[k].icon)+'<b>'+ITEMS[k].n+'</b>');await delay(350)}}
  renderPlayers()}

/* ---------- 结算格子 ---------- */
async function resolveTile(p,gid,depth){const t=TILES[p.pos];
  log(pname(p)+' 抵达 <b>'+esc(t.name)+'</b>');
  switch(t.type){
    case 'start':p.rs+=CONFIG.startLandRs;p.xw+=CONFIG.startLandXw;SND.coin();
      p.src.rs.startLand+=CONFIG.startLandRs;p.src.xw.startLand+=CONFIG.startLandXw;
      await modal({icon:'flag',title:'重归起点',msg:'脚踏灵洲大地，道心通明。\n灵石+'+CONFIG.startLandRs+' 修为+'+CONFIG.startLandXw+'（含路过补给合计 '+(CONFIG.startLandRs+CONFIG.startPassRs)+'/'+(CONFIG.startLandXw+CONFIG.startPassXw)+'）'});break;
    case 'dao':await daoTile(p,t);break;
    case 'event':await randomEvent(p,gid,depth||0);break;
    case 'luck':await luckCard(p,gid,depth||0);break;
    case 'market':toast('逛坊市');await marketShop(p);break;
    case 'arena':{const o=pick(others(p));await modal({icon:'fists',title:'切磋台',
        msg:(o?('撞上 '+o.name+'，对方应战！'):'台上无人，独自演武。')});
      if(o)await doBattle(p,o);break}
    case 'trib':await modal({icon:'bolt',title:'天劫降临',msg:'头顶雷云汇聚——天劫来了！'});
      tribulation(p,'天劫');break;
    case 'spring':p.rs+=CONFIG.springRs;p.src.rs.other+=CONFIG.springRs;p.xw+=CONFIG.springXw;p.src.xw.other+=CONFIG.springXw;SND.coin();
      toast('灵泉沐浴 灵石+'+CONFIG.springRs+' 修为+'+CONFIG.springXw);break;
    case 'moon':p.xw+=CONFIG.moonXw;SND.up();p.src.xw.moon+=CONFIG.moonXw;
      await modal({icon:'moon',title:'飞升台顿悟',raw:'月华灌顶，若有所悟。\n修为+'+CONFIG.moonXw+(p.xw>=S.winXw?'\n\n<b style="color:#ffd97a">你已修为大圆满！灵石足够时即可飞升！</b>':'')});
      break;
    case 'jail':toast('云游至闭关石室，隔墙听着诵经声');break}
  renderPlayers();renderTiles()}

/* ---------- 神行符 / 额外行动 ---------- */
async function extraRollCycle(p,gid){log(pname(p)+' 展开 <b>神行符</b>，身形再动！');
  const{a,b}=await rollPhase(p);
  await movePlayer(p,a+b);
  if(p.alive&&!S.over&&p.jail===0)await resolveTile(p,gid,0)}

/* ---------- 使用道具（人类） ---------- */
async function humanUseItem(p,k){
  if(k==='dingshen'){const o=await pickOpponent(p);if(!o)return false;
    p.items.dingshen--;o.frozen=1;SND.pop();
    log(pname(p)+' 对 '+pname(o)+' 贴了一张 <b>定身符</b>！');toast(o.name+' 被定身');return true}
  if(k==='wudao'){p.items.wudao--;p.xw+=CONFIG.teaXw;SND.up();p.src.xw.item+=CONFIG.teaXw;
    log(pname(p)+' 服下悟道茶 修为+'+CONFIG.teaXw);toast('修为+'+CONFIG.teaXw);return true}
  if(k==='shenxing'){p.items.shenxing--;await extraRollCycle(p,S.gid);return true}
  return false}
function pickOpponent(p){return new Promise(res=>{
  const os=others(p);if(!os.length){res(null);return}
  const ov=document.createElement('div');ov.className='modal-overlay';
  const box=document.createElement('div');box.className='modal-box';
  box.innerHTML='<div class="modal-title">'+ico('nail')+' 选择目标</div><div class="modal-btns" style="flex-direction:column;align-items:stretch"></div>';
  const bb=box.querySelector('.modal-btns');
  os.forEach(o=>{const el=document.createElement('button');el.style.textAlign='left';
    el.innerHTML='<b style="color:'+o.color+'">'+esc(o.name)+'</b>　灵石'+o.rs+'　修为'+o.xw;
    el.onclick=()=>{ov.remove();res(o)};bb.appendChild(el)});
  const cl=document.createElement('button');cl.textContent='取消';cl.onclick=()=>{ov.remove();res(null)};bb.appendChild(cl);
  ov.appendChild(box);$('modalRoot').appendChild(ov)})}

/* ---------- AI 决策 ---------- */
async function aiPreItems(p){
  /* 悟道茶：修为未满先喝为敬 */
  let drank=false;
  while(p.items.wudao>0&&p.xw<S.winXw){p.items.wudao--;p.xw+=CONFIG.teaXw;p.src.xw.item+=CONFIG.teaXw;drank=true;SND.up();
    log(pname(p)+' 服下悟道茶 修为+'+CONFIG.teaXw)}
  if(drank){renderPlayers();await delay(350)}
  /* 择骰符：前方 2~12 步有好落脚点才舍得用（forceNoDouble 防止钦点凑对子白嫖额外行动） */
  if(p.items.zezi>0){const n=aiBestDice(p);
    if(n>0){p.items.zezi--;S.forceDice=forceDiceOf(n);S.forceNoDouble=true;SND.pop();
      log(pname(p)+' 掐诀点燃 <b>择骰符</b>，钦定点数 '+n);await delay(300)}}
  if(p.items.dingshen>0&&Math.random()<.55){
    const t=others(p).sort((a,b)=>b.xw-a.xw)[0];
    if(t){p.items.dingshen--;t.frozen=1;SND.pop();
      log(pname(p)+' 对 '+pname(t)+' 贴了 <b>定身符</b>！');toast(t.name+' 被定身');
      renderPlayers();await delay(400)}}}
function forceDiceOf(n){const a=Math.max(1,Math.min(6,Math.floor(n/2)));return[a,n-a]}
function aiBestDice(p){let best=0,bestN=0;
  for(let n=2;n<=12;n++){const t=TILES[(p.pos+n)%32];let s=0;
    if(t.type==='dao'){
      if(t.owner==null)s=(t.price<=p.rs-p.persona.reserve)?60:10;
      else if(t.owner!==p.id)s=-Math.min(3,rentOf(t)/120);
      else s=5}
    else if(t.type==='moon')s=(p.xw>=S.winXw*.7&&p.xw<S.winXw)?45:8;
    else if(t.type==='start')s=40;
    else if(t.type==='spring')s=15;
    else if(t.type==='trib')s=-(15+p.xw/4);  /* 天劫威胁随修为缩放，防 AI 低估踩雷 */
    else if(t.type==='market')s=p.rs>800?12:2;
    else if(t.type==='arena')s=p.persona.fight>1?15:0;
    else s=8;                          /* 奇遇/机缘，期望偏正 */
    s-=Math.abs(n-7)*1.2;              /* 略偏好大路点数 */
    if(s>best){best=s;bestN=n}}
  return best>=30?bestN:0}

/* ---------- 飞升 ---------- */
/* W2 成本模型：基础 winRs + 轮数通胀 − 洞府/整组折抵，下限 costFloor。
   折抵是地产决策通向胜利的传动轴：越会经营，飞升越便宜。 */
function daoCountOf(p){return TILES.filter(t=>t.owner===p.id).length}
function groupCountOf(p){return Object.keys(GROUPS).filter(g=>ownsFullGroup(p,g)).length}
function ascendCostOf(p){if(!CONFIG.toggles.w2)return S.winRs;   /* D3 归因：关 w2 = 固定门槛 */
  return Math.max(CONFIG.costFloor,
  S.winRs + S.round*CONFIG.rsInflationPerRound
  - daoCountOf(p)*CONFIG.discountPerDao
  - groupCountOf(p)*CONFIG.discountPerGroup)}
function canAscend(p){return p.xw>=S.winXw&&p.rs>=ascendCostOf(p)}
async function offerAscend(p){
  if(isBot(p)){await doAscend(p);return true}
  const cost=ascendCostOf(p);
  const i=await modal({icon:'moon',title:'修为大圆满！',
    raw:'你的修为已达 <b style="color:#ffd97a">'+S.winXw+'</b>，天门为你而开。<br>就地飞升需耗费 灵石'+cost+
    '（基础 '+S.winRs+' + 通胀 '+S.round+'×'+CONFIG.rsInflationPerRound+' − 折抵 '+(daoCountOf(p)*CONFIG.discountPerDao+groupCountOf(p)*CONFIG.discountPerGroup)+'）<br>（也可以继续积攒，先落袋为安）',
    buttons:[{text:'暂不飞升'},{text:'飞升成仙！',primary:true}]});
  if(i===1){await doAscend(p);return true}
  return false}
async function doAscend(p){const cost=ascendCostOf(p);
  p.rs-=cost;p.src.rs.other-=cost;p._lastAscendCost=cost;SND.win();
  log(pname(p)+' 天门大开，白日飞升！！');
  await modal({icon:'moon',title:'白日飞升',msg:p.name+' 踏月而去，霞光万道。\n此界留下一段传说。'});
  endGame(p,'飞升成仙')}

/* ---------- 单回合 ---------- */
async function takeTurn(p,gid){
  if(!p.alive)return;
  S.actor=p.id;
  setTurnInfo(p.name+(isBot(p)?'（AI）':'')+' 的回合');
  renderPlayers();renderTokens();
  await delay(420);
  if(p.frozen>0){p.frozen--;renderPlayers();
    log(pname(p)+' 身中定身符，本回合动弹不得');toast(p.name+' 被定身');
    await delay(500);return}
  if(p.jail>0){const out=await jailPhase(p);renderPlayers();if(!out)return}
  if(canAscend(p)){const did=await offerAscend(p);if(did||S.over)return}
  if(isBot(p))await aiPreItems(p);
  let doubled=true;
  while(doubled&&!S.over&&gid===S.gid&&p.alive){
    doubled=false;
    const r=await rollPhase(p);
    if(S.over||gid!==S.gid)return;
    await movePlayer(p,r.a+r.b,gid);
    if(!p.alive||S.over||gid!==S.gid)return;
    setTurnInfo(p.name+' 结算 '+esc(TILES[p.pos].name));
    await resolveTile(p,gid,0);
    if(!p.alive||S.over||gid!==S.gid)return;
    /* 结算后飞升闸：中途达标者不用罚等一整圈（回合开始闸之外的第二道） */
    if(canAscend(p)){
      const did=await offerAscend(p);
      if(S.over||gid!==S.gid||did)return;
    }
    if(p.jail>0)break;
    if(r.a===r.b&&!r.usedZezi&&!S.forceNoDouble){doubled=true;log(pname(p)+' 天运加身（对子），再行一次！');toast('对子！再来一次')}}
  if(S.over||gid!==S.gid)return;
  await managePhase(p,gid)}
async function managePhase(p,gid){
  if(isBot(p)){setTurnInfo(p.name+' 调息整理…');await delay(450);
    /* 家底厚时，收尾前烧一张神行符多跑一趟 */
    if(!S.over&&gid===S.gid&&p.alive&&p.jail===0&&p.items.shenxing>0&&p.rs>=1000+p.persona.reserve&&Math.random()<.5){
      p.items.shenxing--;await extraRollCycle(p,gid);
      if(S.over||gid!==S.gid||!p.alive)return;
      await delay(350)}
    return}
  if(!p.auto){setTurnInfo('你的回合 · 可开背包用符，然后结束回合');
    await humanManage(p,gid)}
  else{await delay(450)}}
function humanManage(p,gid){return new Promise(res=>{
  S.phase='manage';$('btnEnd').classList.remove('hidden');
  let done=false;
  const finish=()=>{if(done)return;done=true;S.autoEndCheck=null;S.endFinish=null;
    S.phase='idle';$('btnEnd').classList.add('hidden');S.awaiting=null;res()};
  S.awaiting={type:'end',res:finish};
  S.endFinish=finish;   /* 神行符额外行动后据此重建结束等待 */
  /* 「自动结束回合」：整理阶段一张可用符都没有时，替玩家结束回合 */
  const tryAuto=()=>{if(done||S.over||gid!==S.gid)return;
    if(S.autoEnd&&S.awaiting&&S.awaiting.type==='end'&&!Object.values(p.items).some(n=>n>0)){
      log(pname(p)+' 无可用操作，自动结束回合');toast('无可用操作，自动结束');finish()}};
  S.autoEndCheck=tryAuto;   /* 背包用符后回调再检查一次 */
  if(S.autoEnd&&!Object.values(p.items).some(n=>n>0))setTimeout(tryAuto,800/Math.max(S.speed,1))})}
$('btnEnd').addEventListener('click',()=>{if(S.awaiting&&S.awaiting.type==='end'){const r=S.awaiting.res;S.awaiting=null;r()}});

/* ---------- 胜负 ---------- */
function endGame(winner,reason){if(S.over)return;S.over=true;S.awaiting=null;clearSave();
  $('btnRoll').disabled=true;$('btnEnd').classList.add('hidden');
  renderPlayers();renderTokens();renderTiles();
  const rest=P.filter(p=>p!==winner).sort((a,b)=>(b.xw*10+b.rs)-(a.xw*10+a.rs));
  const rank=winner?[winner,...rest]:rest;
  $('endTitle').textContent=winner?(winner.name+' 夺魁'):'尘埃落定';
  $('endReason').textContent=reason||'';
  const st=$('endStats');st.innerHTML='';
  const SRC_LABEL={pass:'过路',moon:'顿悟',event:'奇遇',item:'茶',battle:'斗法',startLand:'起点',other:'其他'};
  rank.forEach((p,i)=>{const d=document.createElement('div');d.className='er'+(p===winner?' win':'');
    const xwSrc=SRC_XW.filter(k=>p.src.xw[k]).map(k=>SRC_LABEL[k]+(p.src.xw[k]>0?'+':'')+p.src.xw[k]).join(' ');
    d.innerHTML='<span>'+(i+1)+'</span><span class="pav" style="--pc:'+p.color+';width:34px;height:34px;font-size:16px">'+avHtml(p.id)+'</span>'+
      '<span style="flex:1">'+esc(p.name)+(p.alive?'':'（陨落）')+'<br><span class="xwsrc">修为来源：'+(xwSrc||'无')+'</span></span><span>修为'+p.xw+'</span><span>灵石'+fmt(p.rs)+'</span>';
    st.appendChild(d)});
  SND.win();$('endOverlay').classList.remove('hidden')}
function endByRound(){const rank=aliveList().sort((a,b)=>(b.xw*10+b.rs)-(a.xw*10+a.rs));
  endGame(rank[0],'天劫将至，大限已到——以修为与灵石论道')}

/* ---------- 存档（localStorage，回合开始时落盘） ---------- */
const SAVE_KEY='xxsf.save2';
function saveGame(){if(S.over)return;
  try{const hid=P.findIndex(q=>!q.isAI);
    localStorage.setItem(SAVE_KEY,JSON.stringify({v:2,human:hid>=0?hid:0,round:S.round,cur:S.cur,stock:S.stock,
    maxRound:S.maxRound,winXw:S.winXw,winRs:S.winRs,
    tiles:TILES.map(t=>({o:t.owner,l:t.level})),
    ps:P.map(p=>({rs:p.rs,xw:p.xw,pos:p.pos,alive:p.alive,jail:p.jail,frozen:p.frozen,shield:p.shield,items:p.items})),
    log:$('logBox').innerHTML}))}catch(e){}}
function clearSave(){try{localStorage.removeItem(SAVE_KEY)}catch(e){}}
function loadSave(){try{const d=JSON.parse(localStorage.getItem(SAVE_KEY)||'null');
  return(d&&d.v===2&&d.ps&&d.ps.length===4&&d.tiles&&d.tiles.length===32)?d:null}catch(e){return null}}
function resumeGame(){const d=loadSave();if(!d){showSetup();return}
  if(S.endFinish)S.endFinish();      /* 旧局悬挂协程收尾 */
  S.gid++;S.over=false;S.awaiting=null;S.phase='idle';
  S.forceDice=null;S.forceNoDouble=false;
  S.maxRound=numClamp(d.maxRound,40,5,120);S.winXw=numClamp(d.winXw,150,10,9999);S.winRs=numClamp(d.winRs,800,0,99999);
  S.round=numClamp(d.round,1,1,S.maxRound);S.cur=numClamp(d.cur,0,0,3);
  S.stock={shenxing:CONFIG.marketRestock,dingshen:CONFIG.marketRestock,bijie:CONFIG.marketRestock,wudao:CONFIG.marketRestock,zezi:CONFIG.marketRestock};
  if(d.human!=null&&d.human>=0&&d.human<4)HUMAN_PICK=d.human;
  makePlayers(HUMAN_PICK);
  /* 坏档消毒：数值一律钳回合法区间，owner 走白名单，结构坏不至白屏 */
  const cl=(v,def,lo,hi)=>{v=Math.round(Number(v));return Number.isFinite(v)?Math.max(lo,Math.min(hi,v)):def};
  d.ps.forEach((q,i)=>{const p=P[i];
    p.rs=cl(q.rs,1800,0,999999);p.xw=cl(q.xw,0,0,9999);p.pos=cl(q.pos,0,0,31);
    p.alive=q.alive!==false;p.jail=cl(q.jail,0,0,9);p.frozen=cl(q.frozen,0,0,9);p.shield=q.shield===true;
    Object.keys(p.items).forEach(k=>{p.items[k]=cl((q.items||{})[k],0,0,99)});
    p.auto=false});
  if(!P[S.cur].alive){let g=0;do{S.cur=(S.cur+1)%4;g++}while(!P[S.cur].alive&&g<8)}
  $('btnAuto').textContent='托管';$('btnAuto').style.borderColor='';
  d.tiles.forEach((t,i)=>{TILES[i].owner=[0,1,2,3].includes(t.o)?t.o:null;
    TILES[i].level=(TILES[i].owner===null)?0:cl(t.l,0,0,3)});
  Object.keys(S.stock).forEach(k=>{if((d.stock||{})[k]!=null)S.stock[k]=cl((d.stock||{})[k],S.stock[k],0,CONFIG.marketRestock)});
  $('modalRoot').innerHTML='';
  ['endOverlay','setupOverlay','settingsOverlay'].forEach(id=>$(id).classList.add('hidden'));
  $('logBox').innerHTML=typeof d.log==='string'?d.log:'';
  $('btnRoll').disabled=true;$('btnEnd').classList.add('hidden');
  buildBoard();updateHUD();
  $('btnBag').disabled=false;   /* 续局同样启用背包（此前漏恢复，续局背包恒禁用） */
  log('沧海桑田，一局残卷续上前缘——自第 '+S.round+' 轮再启。');
  gameLoop()}

/* ---------- 主循环 ---------- */
/* W3 终局压力横幅 */
function updateEndgameBanner(){const b=$('endgameBanner');if(!b)return;
  const left=S.maxRound-S.round;
  const on=CONFIG.toggles.w3&&!S.over&&left>=0&&left<CONFIG.endgameFrom;
  b.classList.toggle('hidden',!on);
  if(on)b.textContent='天劫将至 · 余 '+(left+1)+' 轮';
  if(on&&!S._egLogged){S._egLogged=true;log('末法时代降临——最后 '+CONFIG.endgameFrom+' 轮，天劫威力提升，奇遇常有雷劫！')}
  if(!on)S._egLogged=false}
async function gameLoop(){const gid=S.gid;
  while(!S.over){
    if(gid!==S.gid)return;
    const p=P[S.cur];
    saveGame();
    await takeTurn(p,gid);
    if(S.over||gid!==S.gid)return;
    let n=S.cur,guard=0;
    do{n=(n+1)%4;guard++}while(!P[n].alive&&guard<8);
    if(n<=S.cur){S.round++;
      if(S.round>S.maxRound){endByRound();return}
      restock()}
    S.cur=n;updateHUD();updateEndgameBanner()}}
/* 坊市补货：每轮开始按概率补一张，防中期卖空成死格 */
function restock(){if(Math.random()>=CONFIG.restockChance)return;
  const ks=Object.keys(S.stock).filter(k=>S.stock[k]<CONFIG.marketRestock);
  if(!ks.length)return;const k=pick(ks);S.stock[k]++;
  log('坊市新到一批 <b>'+ITEMS[k].n+'</b>（库存 '+S.stock[k]+'）')}
function newGame(opts){opts=opts||{};
  if(S.endFinish)S.endFinish();      /* 上一局悬挂协程收尾（重开时 humanManage 的 Promise） */
  S.gid++;S.over=false;S.cur=0;S.round=1;S.awaiting=null;S.phase='idle';
  S.forceDice=null;S.forceNoDouble=false;   /* 钦点残留不跨局 */
  S.maxRound=numClamp(opts.round,40,5,120);
  S.winXw=numClamp(opts.winXw,150,10,9999);
  S.winRs=numClamp(opts.winRs,800,0,99999);
  $('modalRoot').innerHTML='';$('logBox').innerHTML='';
  ['startOverlay','endOverlay','setupOverlay','settingsOverlay'].forEach(id=>$(id).classList.add('hidden'));
  makePlayers(opts.human,opts.startRs);TILES.forEach(t=>{t.owner=null;t.level=0});
  S.stock={shenxing:CONFIG.marketRestock,dingshen:CONFIG.marketRestock,bijie:CONFIG.marketRestock,wudao:CONFIG.marketRestock,zezi:CONFIG.marketRestock};
  $('btnRoll').disabled=true;$('btnEnd').classList.add('hidden');$('btnBag').disabled=false;
  buildBoard();updateHUD();
  log('四位修士齐聚灵洲，飞升之路开启。（第 '+S.round+' / '+S.maxRound+' 轮，飞升门槛：修为'+S.winXw+'，基础花费灵石'+S.winRs+'，随轮数通胀、经营洞府可折抵）');
  gameLoop()}

/* ---------- 背包（符箓在此使用；洞府可折价出售自救） ---------- */
function openBag(){const h=human();if(!h)return;
  const ov=document.createElement('div');ov.className='modal-overlay';
  const box=document.createElement('div');box.className='modal-box';
  function render(){
    const myTurn=!S.over&&P[S.cur]===h;
    /* 点击时活查（按钮标签是 render 时快照，跨回合后必须以实时状态为准） */
    const canNow=k=>{const mt=!S.over&&P[S.cur]===h;
      return mt&&(k!=='shenxing'||(S.awaiting&&S.awaiting.type==='end'))};
    const canSell=()=>!S.over&&P[S.cur]===h;
    const its=Object.entries(ITEMS).map(([k,it])=>{
      const n=h.items[k]||0;
      let btn='';
      if(n>0){const ok=canNow(k);
        btn='<button class="bag-use" data-k="'+k+'"'+(ok?'':' disabled')+'>'+(!myTurn?'非你回合':(ok?'使 用':'整理阶段用'))+'</button>'}
      return '<div class="bag-row'+(n?'':' dim')+'"><b>'+ico(it.icon)+' '+it.n+' ×'+n+'</b><span>'+it.desc+'</span>'+btn+'</div>'}).join('');
    const props=TILES.filter(t=>t.owner===h.id);
    const propList=props.length?props.map(t=>{
      const v=sellPriceOf(h,t);
      const disc=ownsFullGroup(h,t.group)?CONFIG.discountPerGroup:CONFIG.discountPerDao;
      const sellBtn='<button class="bag-use sell" data-sell="'+t.i+'"'+(myTurn?'':' disabled')+'>售'+v+'</button>';
      return '<div class="bag-row"><b>'+ico(t.icon)+' '+esc(t.name)+'</b><span>'+(t.level+' 级洞天 · 租金 '+rentOf(t)+
      ' · 飞升折抵 −'+disc)+
      (ownsFullGroup(h,t.group)?'（整组）':'')+'</span>'+sellBtn+'</div>'}).join('')
      :'<div class="bag-row dim"><b>尚无洞府</b><span>踩到无主地块可以购入（洞府可折抵飞升成本）</span></div>';
    box.innerHTML='<div class="modal-title">'+ico('bag')+' 背包 · '+esc(h.name)+'</div><div class="modal-msg"><div class="bag-grid">'+
      '<div class="bag-sec">身家</div>'+
      '<div class="bag-row"><b>灵石 '+fmt(h.rs)+'</b><span>修为 '+h.xw+' / 飞升门槛 '+S.winXw+'</span></div>'+
      '<div class="bag-row"><b>当前飞升成本 '+ascendCostOf(h)+'</b><span>基础 '+S.winRs+' + 通胀 '+S.round+'×'+CONFIG.rsInflationPerRound+' − 折抵 '+(daoCountOf(h)*CONFIG.discountPerDao+groupCountOf(h)*CONFIG.discountPerGroup)+'</span></div>'+
      '<div class="bag-row"><b>'+(h.shield?'避劫符生效中':'无护盾')+'</b><span>'+(h.jail?'闭关 '+h.jail+' 回合':'行动自如')+(h.frozen?' · 中了定身符':'')+'</span></div>'+
      '<div class="bag-sec">符箓（轮到你时点击「使用」）</div>'+its+
      '<div class="bag-sec">名下洞府（'+props.length+' 处，可折价出售回灵）</div>'+propList+
      '</div></div><div class="modal-btns"><button class="primary" id="bagClose">关 闭</button></div>';
    box.querySelectorAll('.bag-use[data-k]').forEach(b=>{
      b.onclick=async()=>{const k=b.dataset.k;if(!canNow(k))return;
        if(k==='shenxing')ov.remove();   /* 神行符要接管行动，先收起背包 */
        await humanUseItem(h,k);
        /* 神行符额外行动期间掷骰会覆盖「结束回合」等待，行动完在此重建 */
        if(!S.over&&S.phase==='manage'&&P[S.cur]===h&&h.alive&&!S.awaiting&&S.endFinish){
          S.awaiting={type:'end',res:S.endFinish}}
        if(ov.parentNode)render();
        if(S.autoEndCheck)S.autoEndCheck()};   /* 用光符后可能触发自动结束 */
    });
    box.querySelectorAll('.bag-use[data-sell]').forEach(b=>{
      b.onclick=()=>{const t=TILES[+b.dataset.sell];
        if(!canSell()||!t||t.owner!==h.id)return;
        sellTile(h,t);render()};
    });
    box.querySelector('#bagClose').onclick=()=>ov.remove();
  }
  render();ov.appendChild(box);$('modalRoot').appendChild(ov)}
$('btnBag').addEventListener('click',()=>{if(!S.over&&P.length)openBag()});

/* ---------- 首页 / 配置页 / 设置页 ---------- */
const CFG_KEY='xxsf.cfg';
function showHome(){['setupOverlay','settingsOverlay','endOverlay'].forEach(id=>$(id).classList.add('hidden'));
  $('modalRoot').innerHTML='';   /* 清掉对局残留弹窗（背包/结算叙事等） */
  $('startOverlay').classList.remove('hidden');refreshContinue()}
function showSetup(){['startOverlay','settingsOverlay'].forEach(id=>$(id).classList.add('hidden'));
  $('setupOverlay').classList.remove('hidden')}
function showSettings(){['startOverlay','setupOverlay'].forEach(id=>$(id).classList.add('hidden'));
  $('settingsOverlay').classList.remove('hidden');
  $('cfgSpeed').value=String(S.speed);$('cfgAutoEnd').checked=!!S.autoEnd}
function refreshContinue(){const d=loadSave(),b=$('btnContinue');
  if(d){b.disabled=false;b.textContent='继 续 游 戏 · 第 '+Math.min(d.round,numClamp(d.maxRound,40,5,120))+' 轮'}
  else{b.disabled=true;b.textContent='继 续 游 戏（暂无存档）'}}
function readCfg(){const cfg={
    round:numClamp($('cfgRound').value,40,10,80),
    winXw:numClamp($('cfgXw').value,150,50,300),
    winRs:numClamp($('cfgRs').value,800,300,5000),
    start:numClamp($('cfgStart').value,1800,500,9999)};
  $('cfgRound').value=cfg.round;$('cfgXw').value=cfg.winXw;$('cfgRs').value=cfg.winRs;$('cfgStart').value=cfg.start;
  return cfg}
$('btnNew').addEventListener('click',()=>{ac();showSetup()});
$('btnSetupBack').addEventListener('click',showHome);
$('btnSetupGo').addEventListener('click',()=>{ac();const cfg=readCfg();
  try{localStorage.setItem(CFG_KEY,JSON.stringify(cfg))}catch(e){}
  newGame({human:HUMAN_PICK,round:cfg.round,winXw:cfg.winXw,winRs:cfg.winRs,startRs:cfg.start})});
$('btnContinue').addEventListener('click',()=>{ac();
  ['startOverlay','setupOverlay','settingsOverlay'].forEach(id=>$(id).classList.add('hidden'));
  resumeGame()});
$('btnHomeSettings').addEventListener('click',showSettings);
$('btnSetBack').addEventListener('click',showHome);
$('btnAgain').addEventListener('click',showHome);
$('btnRestart').addEventListener('click',async()=>{
  if(!S.over){const i=await modal({title:'重开一局？',noAuto:true,
      msg:'当前对局尚未结束，重开后这一局将烟消云散（存档也会被覆盖）。确定吗？',
      buttons:[{text:'继续下这局'},{text:'重开',primary:true}]});
    if(i!==1)return}
  $('endOverlay').classList.add('hidden');showSetup()});
/* 规则文案读「生效配置」：局中用当前局参数，首页用上次配置回填 */
function effCfg(){if(!S.over)return S;
  try{const c=JSON.parse(localStorage.getItem(CFG_KEY)||'null');
    if(c)return{winXw:numClamp(c.winXw,150,10,9999),winRs:numClamp(c.winRs,800,0,99999),maxRound:numClamp(c.round,40,5,120)}}catch(e){}
  return S}
function showRules(){const e=effCfg();modal({title:'规则速览',noAuto:true,raw:
  '<b style="color:#ffd97a">胜利</b>：修为 ≥'+e.winXw+' 且灵石 ≥当前飞升成本 → 达标即胜（回合开始或每次结算后询问飞升）；成本 = 基础 '+e.winRs+' + 每轮通胀 '+CONFIG.rsInflationPerRound+' − 名下每处洞府折抵 '+CONFIG.discountPerDao+' − 每套整组折抵 '+CONFIG.discountPerGroup+'（下限 '+CONFIG.costFloor+'）；或撑到最后（轮上限 '+e.maxRound+'，按 修为×10+灵石 结算）<br><br>'+
  '<b style="color:#ffd97a">洞府</b>：无主可购；再次踩到<b>自家洞府</b>可付费扩建一级（最多 3 级洞天，租 ×4/×10/×22）；集齐同组五行 → 租金额外加成；背包里可折价卖地回灵<br><br>'+
  '<b style="color:#ffd97a">起点</b>：路过 +'+CONFIG.startPassRs+'/+'+CONFIG.startPassXw+'；恰好落在起点再 +'+CONFIG.startLandRs+'/+'+CONFIG.startLandXw+'（合计 '+(CONFIG.startPassRs+CONFIG.startLandRs)+'/'+(CONFIG.startPassXw+CONFIG.startLandXw)+'）<br><br>'+
  '<b style="color:#ffd97a">奇遇·机缘</b>：随机事件，福祸相依<br>'+
  '<b style="color:#ffd97a">切磋</b>：随机对手斗法，输家赔 '+CONFIG.betRs+'，赢家 +'+CONFIG.battleWinXw+' 修为<br>'+
  '<b style="color:#ffd97a">天劫</b>：损灵石（'+CONFIG.tribBase+' + 修为×'+CONFIG.tribXwMult+'，上限 '+CONFIG.tribCap+'）<br>'+
  '<b style="color:#ffd97a">坊市</b>：五系符箓，每轮概率补货（库存上限 '+CONFIG.marketRestock+'）<br><br>'+
  '<b style="color:#ffd97a">骰子</b>：2 骰，对子可再行一次；走火入魔送闭关石室（'+CONFIG.jailRounds+' 回合，可用灵石或神行符提前出关）<br><br>'+
  '<b style="color:#ffd97a">人设</b>：剑修·竞速=坊市九折｜丹修·守财=开局+350灵石｜器修·营造=扩建费−15%｜体修·长生=天劫伤害−25%<br><br>'+
  '<b style="color:#ffd97a">存档</b>：每回合开始自动存到本机，首页「继续游戏」可接着玩'})}
$('btnHelp').addEventListener('click',showRules);
$('btnHomeHelp').addEventListener('click',showRules);
$('selSpeed').addEventListener('change',e=>{S.speed=+e.target.value;
  try{localStorage.setItem('xxsf.speed',String(S.speed))}catch(err){}});
$('cfgSpeed').addEventListener('change',e=>{S.speed=+e.target.value;
  $('selSpeed').value=String(S.speed);
  try{localStorage.setItem('xxsf.speed',String(S.speed))}catch(err){}});
$('cfgAutoEnd').addEventListener('change',e=>{S.autoEnd=e.target.checked;
  try{localStorage.setItem('xxsf.autoend',S.autoEnd?'1':'0')}catch(err){}});
$('btnWipe').addEventListener('click',async()=>{
  const i=await modal({title:'清除存档？',noAuto:true,
    msg:'将删除保存在本机的对局存档，未结束的局没法再「继续游戏」了。确定吗？',
    buttons:[{text:'手滑了'},{text:'清除',primary:true}]});
  if(i===1){clearSave();refreshContinue();toast('本机存档已清除')}});
$('btnAuto').addEventListener('click',()=>{const h=human();h.auto=!h.auto;
  $('btnAuto').textContent=h.auto?'取消托管':'托管';
  $('btnAuto').style.borderColor=h.auto?'#f0d998':'';
  if(h.auto&&S.awaiting&&S.awaiting.type==='roll'){const r=S.awaiting.res;S.awaiting=null;$('btnRoll').disabled=true;r()}
  else if(h.auto&&S.awaiting&&S.awaiting.type==='end'){const r=S.awaiting.res;S.awaiting=null;r()}
  renderPlayers()});
try{const spd=localStorage.getItem('xxsf.speed');if(spd){S.speed=+spd||1;$('selSpeed').value=String(S.speed)}}catch(e){}
try{if(localStorage.getItem('xxsf.autoend')==='1'){S.autoEnd=true;$('cfgAutoEnd').checked=true}}catch(e){}

/* ---------- 首页初始化（背景 / 配置回填 / 选人卡） ---------- */
(function(){
  const w=$('setupAvs');
  function markPick(){[...w.children].forEach((el,i)=>el.classList.toggle('sel',i===HUMAN_PICK))}
  PLAYERS_DEF.forEach((d,i)=>{
    const a=document.createElement('div');a.className='a';a.style.setProperty('--pc',d.color);
    a.title=d.name+' · '+PERSONA_HINT[i];
    a.innerHTML='<div class="pav" style="border-color:'+d.color+'">'+avHtml(i)+'</div><span>'+esc(d.name.split('·')[0])+'<span class="axis">【'+PERSONA_AXIS[i]+'】</span></span><span class="hint">'+PERSONA_HINT[i]+'</span>';
    a.onclick=()=>{HUMAN_PICK=i;try{localStorage.setItem('xxsf.pick',String(i))}catch(e){};markPick()};
    w.appendChild(a)});
  markPick();
  if(IMG.center)$('centerArt').style.backgroundImage='url('+IMG.center+')';
  if(IMG.bg){document.body.classList.add('hasbg');document.body.style.backgroundImage='url('+IMG.bg+')'}
  $('brandIco').innerHTML=ico('mount');
  $('die1').innerHTML=dieFace(6);$('die2').innerHTML=dieFace(6);
  try{const c=JSON.parse(localStorage.getItem(CFG_KEY)||'null');
    if(c){$('cfgRound').value=numClamp(c.round,40,10,80);$('cfgXw').value=numClamp(c.winXw,150,50,300);
      $('cfgRs').value=numClamp(c.winRs,800,300,5000);$('cfgStart').value=numClamp(c.start,1800,500,9999)}}catch(e){}
  refreshContinue();
  $('btnRoll').disabled=true})();
buildBoard();renderPlayers();renderTokens();

/* ---------- 测试钩子 ---------- */
window.__game={S,get P(){return P},get T(){return TILES},ITEMS,GROUPS,rentOf,upCost,newGame,saveGame,loadSave,aiBestDice};

/* ==================================================================
 * F9 开发者后门 —— 仅开发者自用：URL 带 ?dbg=1 或控制台设
 * localStorage.xxsf.dbg='1' 后刷新才会注入；正常玩家拿到的包里不存在
 * 控制台 API：window.__dbg.<cmd>()；所有数值 NaN 拒收 + 越界钳制
 * ================================================================== */
(function(){
  const dbgOn=(function(){try{
    return /[?&]dbg=1/.test(location.search)||localStorage.getItem('xxsf.dbg')==='1'}catch(e){return false}})();
  if(!dbgOn)return;
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const toInt=(v,def)=>{const n=Number(v);return Number.isFinite(n)?Math.round(n):def};
  function dlog(msg,cls){const box=$('dbgLog');if(!box)return;
    const d=document.createElement('div');if(cls)d.className=cls;
    d.textContent='['+new Date().toTimeString().slice(0,8)+'] '+msg;
    box.appendChild(d);while(box.children.length>60)box.removeChild(box.firstChild);box.scrollTop=box.scrollHeight}
  function needGame(){if(!P.length){dlog('未开局：先开新局','err');return false}return true}
  function target(){return clamp(toInt($('dbgTarget')?$('dbgTarget').value:0,0),0,P.length-1)}
  function amt(def){return toInt($('dbgAmt')?$('dbgAmt').value:NaN,def==null?NaN:def)}

  /* ---- 核心作弊指令（同时暴露到控制台 window.__dbg） ---- */
  const api={
    give(pid,key,n){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      n=toInt(n,NaN);if(!Number.isFinite(n)){dlog('数值不合法（NaN 拒收）','err');return}
      const p=P[pid];if(key==='rs'){p.rs=clamp(p.rs+n,0,999999)}
      else if(key==='xw'){p.xw=clamp(p.xw+n,0,999)}
      else return;dlog(p.name+' '+key+' '+(n>=0?'+':'')+n+' → '+p[key]);renderPlayers();saveGame()},
    setv(pid,key,n){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      n=toInt(n,NaN);if(!Number.isFinite(n)){dlog('数值不合法（NaN 拒收）','err');return}
      const p=P[pid];if(key==='rs')p.rs=clamp(n,0,999999);else if(key==='xw')p.xw=clamp(n,0,999);else return;
      dlog(p.name+' '+key+' := '+p[key]);renderPlayers();saveGame()},
    item(pid,key,n){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      n=toInt(n,1);const p=P[pid];p.items[key]=clamp((p.items[key]||0)+n,0,99);
      dlog(p.name+' 符箓['+key+'] → '+p.items[key]);renderPlayers();saveGame()},
    tp(pid,tile){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      tile=clamp(toInt(tile,0),0,31);P[pid].pos=tile;
      dlog(P[pid].name+' 传送 → '+tile+' '+TILES[tile].name);renderTokens();saveGame()},
    dice(n){n=clamp(toInt(n,7),2,12);S.forceDice=forceDiceOf(n);
      dlog('钦定下一掷 = '+n+'（'+S.forceDice[0]+'+'+S.forceDice[1]+'）')},
    freeze(pid){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);const p=P[pid];
      p.frozen=p.frozen>0?0:1;dlog(p.name+(p.frozen?' 定身':' 解除定身'));renderPlayers()},
    jail(pid,on){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);const p=P[pid];
      if(on){sendJail(p);dlog(p.name+' 送入闭关')}else{p.jail=0;dlog(p.name+' 解除闭关');renderPlayers()}},
    shield(pid){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);const p=P[pid];
      p.shield=!p.shield;dlog(p.name+' 避劫符 '+(p.shield?'ON':'OFF'));renderPlayers()},
    kill(pid){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      dlog(P[pid].name+' 手动陨落');bankrupt(P[pid]);updateHUD()},
    revive(pid){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);const p=P[pid];
      p.alive=true;p.rs=Math.max(p.rs,500);dlog(p.name+' 复活（灵石'+p.rs+'）');updateHUD()},
    ready(pid){api.setv(pid,'rs',1000);api.setv(pid,'xw',100);dlog('飞升就绪（下回合开始可飞升）')},
    poor(pid){api.setv(pid,'rs',1);dlog('破产边缘（试试踩天劫/交租）')},
    grantGroup(pid,g){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);
      const grp=GROUPS[g];if(!grp){dlog('无此五行组: '+g,'err');return}
      grp.tiles.forEach(i=>{TILES[i].owner=pid});
      dlog(P[pid].name+' 白得整套'+grp.n+'系（'+grp.tiles.length+' 处）');renderTiles();renderPlayers();saveGame()},
    upAll(pid){if(!needGame())return;pid=clamp(toInt(pid,0),0,3);let n=0;
      TILES.forEach(t=>{if(t.owner===pid&&t.level<3){t.level++;n++}});
      dlog(P[pid].name+' 名下 '+n+' 处洞府免费 +1 级');renderTiles();saveGame()},
    clearTiles(){TILES.forEach(t=>{t.owner=null;t.level=0});
      dlog('全场洞府归零');renderTiles();renderPlayers();saveGame()},
    round(n){n=clamp(toInt(n,1),1,S.maxRound);S.round=n;
      dlog('回合 := '+n+' / '+S.maxRound);updateHUD();saveGame()},
    fast(on){const h=P.find(q=>!q.isAI);if(!h)return;
      h.auto=!!on;S.speed=on?8:(+$('selSpeed').value||1);
      $('btnAuto').textContent=h.auto?'取消托管':'托管';
      $('btnAuto').style.borderColor=h.auto?'#f0d998':'';
      if(h.auto&&S.awaiting&&S.awaiting.type==='roll'){const r=S.awaiting.res;S.awaiting=null;$('btnRoll').disabled=true;r()}
      else if(h.auto&&S.awaiting&&S.awaiting.type==='end'){const r=S.awaiting.res;S.awaiting=null;r()}
      dlog(on?'全托管快进 8× ON（再点一次或按 F10 关）':'快进 OFF');renderPlayers()},
    check(){const issues=dbgCheck();
      if(issues.length){issues.forEach(x=>dlog('[X] '+x,'err'));dlog('自检发现 '+issues.length+' 处异常','err')}
      else dlog('[OK] 状态自检通过（'+P.length+' 名修士 / '+TILES.filter(t=>t.type==='dao').length+' 处洞府 / 第 '+S.round+' 轮）','ok');
      return issues},
    dump(){const data=JSON.stringify({t:new Date().toISOString(),round:S.round,cur:S.cur,
        ps:P.map(p=>({name:p.name,rs:p.rs,xw:p.xw,pos:p.pos,alive:p.alive,jail:p.jail,frozen:p.frozen,shield:p.shield,items:p.items})),
        tiles:TILES.map(t=>({o:t.owner,l:t.level})),stock:S.stock,
        src:P.map(p=>({name:p.name,xw:{...p.src.xw},rs:{...p.src.rs}}))});
      console.log('[DBG] 完整状态 JSON：\n'+data);
      dlog('状态 JSON 已打到浏览器控制台（'+data.length+' 字节）');
      try{navigator.clipboard&&navigator.clipboard.writeText(data).catch(()=>{});dlog('已尝试复制到剪贴板')}catch(e){}
      return data},
    clearSave(){clearSave();dlog('本地存档已清除')},
    saveNow(){if(S.over){dlog('对局未在进行，跳过','err');return}saveGame();dlog('已立即存档','ok')},
    restart(){dlog('直接重开新局（跳过确认）');newGame()}
  };
  window.__dbg=api;

  /* ---- 状态自检：专抓 NaN / 负数 / 越界 / 引用悬空 ---- */
  function dbgCheck(){const issues=[];
    if(!P.length){issues.push('P 为空（未开局）');return issues}
    const humans=P.filter(q=>!q.isAI);
    if(humans.length!==1)issues.push('人类玩家数='+humans.length+'（应为 1）');
    P.forEach(p=>{
      if(!Number.isFinite(p.rs)||p.rs<0)issues.push(p.name+' 灵石异常: '+p.rs);
      if(!Number.isFinite(p.xw)||p.xw<0)issues.push(p.name+' 修为异常: '+p.xw);
      if(!Number.isInteger(p.pos)||p.pos<0||p.pos>31)issues.push(p.name+' 位置越界: '+p.pos);
      Object.entries(p.items).forEach(([k,v])=>{if(!Number.isInteger(v)||v<0)issues.push(p.name+' 符箓['+k+']异常: '+v)});
      if(!Number.isInteger(p.jail)||p.jail<0)issues.push(p.name+' 闭关数异常: '+p.jail);
      if(!Number.isInteger(p.frozen)||p.frozen<0)issues.push(p.name+' 定身数异常: '+p.frozen)});
    TILES.forEach(t=>{if(t.type!=='dao')return;
      if(t.owner!=null&&(t.owner<0||t.owner>3||!P[t.owner]))issues.push(t.name+' 洞府主人越界: '+t.owner);
      if(!Number.isInteger(t.level)||t.level<0||t.level>3)issues.push(t.name+' 洞天等级越界: '+t.level);
      if(t.level>0&&t.owner==null)issues.push(t.name+' 有等级却无主')});
    Object.entries(S.stock).forEach(([k,v])=>{if(!Number.isInteger(v)||v<0)issues.push('坊市库存['+k+']异常: '+v)});
    if(!S.over&&(!Number.isInteger(S.round)||S.round<1||S.round>S.maxRound))issues.push('回合数越界: '+S.round);
    if(!S.over&&(!P[S.cur]||!P[S.cur].alive))issues.push('当前行动玩家无效: S.cur='+S.cur);
    return issues}

  /* ---- 面板 UI ---- */
  const panel=document.createElement('div');
  panel.id='dbgPanel';panel.className='hidden';
  panel.innerHTML=
    '<div class="dbg-hd"><span>ROOT@灵洲 ~ 后门</span><span>F9 开/关</span></div>'+
    '<div class="dbg-row">目标 <select id="dbgTarget"></select> 数值 <input id="dbgAmt" placeholder="可负"></div>'+
    '<div class="dbg-sec">修士</div>'+
    '<div class="dbg-row"><button data-a="addRs">灵石+</button><button data-a="setRs">灵石=</button><button data-a="addXw">修为+</button><button data-a="setXw">修为=</button></div>'+
    '<div class="dbg-row"><select id="dbgItem">'+Object.entries(ITEMS).map(([k,it])=>'<option value="'+k+'">'+it.n+'</option>').join('')+'</select><button data-a="giveItem">给1张</button><button data-a="clearItem">清空符</button><button data-a="shield">避劫</button><button data-a="freeze">定身</button></div>'+
    '<div class="dbg-row"><button data-a="ready">飞升就绪</button><button data-a="poor">破产边缘</button><button data-a="jailIn">入闭关</button><button data-a="jailOut">出关</button><button data-a="kill">陨落</button><button data-a="revive">复活</button></div>'+
    '<div class="dbg-sec">棋盘</div>'+
    '<div class="dbg-row"><input id="dbgTile" placeholder="地块0-31" style="width:70px"><button data-a="tp">传送</button><select id="dbgGroup">'+Object.entries(GROUPS).map(([k,g])=>'<option value="'+k+'">'+g.n+'系</option>').join('')+'</select><button data-a="group">白得整组</button></div>'+
    '<div class="dbg-row"><button data-a="upAll">自家全+1级</button><button data-a="clearTiles">全场洞府归零</button><button data-a="dice">下一掷=数值</button></div>'+
    '<div class="dbg-sec">系统</div>'+
    '<div class="dbg-row"><button data-a="check">状态自检</button><button data-a="runTests">回归测试</button><button data-a="dump">导出JSON</button><button data-a="saveNow">立即存档</button><button data-a="clearSave">清档</button></div>'+
    '<div class="dbg-row"><button data-a="round">回合=数值</button><button data-a="fast">全托管8×</button><button data-a="restart">重开</button></div>'+
    '<div class="dbg-tip">控制台：__dbg.check() / give(0,"rs",500) / dice(12)…</div>'+
    '<div id="dbgLog"></div>';
  document.body.appendChild(panel);

  function rebuildTargets(){const sel=$('dbgTarget');if(!sel)return;sel.innerHTML='';
    P.forEach(p=>{const o=document.createElement('option');o.value=p.id;
      o.textContent=(p===human()?'▶':'')+p.name.split('·')[0];sel.appendChild(o)})}
  function toggle(){panel.classList.toggle('hidden');
    if(!panel.classList.contains('hidden')){rebuildTargets();dlog('后门已开启 · 锟斤拷烫烫烫免疫中','ok')}}
  /* 入口三保险：F9 / 反引号 / 右下角 DEV 角标（功能键常被宿主或 Fn 键截获，别单押 F9） */
  const tab=document.createElement('button');tab.id='dbgTab';tab.textContent='DEV';
  tab.title='开发者面板（F9 或 ` 或点此）';
  tab.onclick=()=>toggle();
  /* 注入到右上角按钮行（速度/规则/重开旁），显眼且不依赖 fixed 定位 */
  const host=document.querySelector('.topbtns');
  if(host)host.appendChild(tab);else document.body.appendChild(tab);
  /* dbg 专属 64× 超速：跑流程用，动画在最粗档（恢复正常点顶部速度下拉任一档） */
  const s64=document.createElement('button');s64.id='dbgSpeed64';s64.className='pill';
  s64.textContent='64×';s64.title='dbg 专用：64 倍速（动画帧合并，纯跑流程）';
  s64.onclick=()=>{S.speed=64;
    document.getElementById('selSpeed').value='4';   /* 顶部下拉没有 64 档，显示就近档位 */
    try{localStorage.removeItem('xxsf.speed')}catch(err){}};   /* 64× 会话级临时速度，不落盘 */
  if(host)host.appendChild(s64);
  document.addEventListener('keydown',e=>{
    if(e.key==='F9'||e.key==='`'||e.key==='~'){e.preventDefault();toggle()}
    else if(e.key==='F10'){e.preventDefault();const h=P.find(q=>!q.isAI);
      if(h&&h.auto)api.fast(false);else if(h){h.auto=false;renderPlayers()}}});
  api.toggle=toggle;
  panel.addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;
    const a=b.dataset.a,pid=target();
    if(a==='addRs')api.give(pid,'rs',amt(0));
    else if(a==='setRs')api.setv(pid,'rs',amt(0));
    else if(a==='addXw')api.give(pid,'xw',amt(0));
    else if(a==='setXw')api.setv(pid,'xw',amt(0));
    else if(a==='giveItem')api.item(pid,$('dbgItem').value,1);
    else if(a==='clearItem'){['shenxing','dingshen','bijie','wudao','zezi'].forEach(k=>P[pid].items[k]=0);dlog(P[pid].name+' 符箓清空');renderPlayers()}
    else if(a==='shield')api.shield(pid);
    else if(a==='freeze')api.freeze(pid);
    else if(a==='ready')api.ready(pid);
    else if(a==='poor')api.poor(pid);
    else if(a==='jailIn')api.jail(pid,true);
    else if(a==='jailOut')api.jail(pid,false);
    else if(a==='kill')api.kill(pid);
    else if(a==='revive')api.revive(pid);
    else if(a==='tp')api.tp(pid,$('dbgTile').value);
    else if(a==='group')api.grantGroup(pid,$('dbgGroup').value);
    else if(a==='upAll')api.upAll(pid);
    else if(a==='clearTiles')api.clearTiles();
    else if(a==='dice')api.dice(amt(7));
    else if(a==='check')api.check();
    else if(a==='runTests'){
      if(typeof window.__runTests!=='function'){dlog('回归套件未加载','err');return}
      dlog('回归测试运行中…');
      Promise.resolve(window.__runTests()).then(r=>{
        dlog('回归 '+(r.total-r.fail)+'/'+r.total+' 通过（skip '+r.skipped+'）',r.fail?'err':'ok')});
    }
    else if(a==='dump')api.dump();
    else if(a==='saveNow')api.saveNow();
    else if(a==='clearSave')api.clearSave();
    else if(a==='round')api.round(amt(1));
    else if(a==='fast'){const h=P.find(q=>!q.isAI);api.fast(!(h&&h.auto))}
    else if(a==='restart')api.restart()});
  console.log('%c修仙大富翁 v2（开发者模式）%c F9 = 后门面板 · window.__dbg = 作弊 API',
    'font-size:15px;font-weight:bold;color:#f0d998','color:#22ff88');
})();
