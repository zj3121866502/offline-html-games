'use strict';
/* ==================================================================
 * 修仙大富翁 v2 —— 界面层（SVG 图标库 / 工具 / 弹窗 / 渲染）
 * 军规：老内核无彩色 emoji 字体，一切图标用内联 SVG 手绘，全项目禁 emoji
 * ================================================================== */
const $=id=>document.getElementById(id);
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function rnd(n){return Math.floor(Math.random()*n)}
function pick(a){return a[rnd(a.length)]}
function fmt(n){return n>=0?n:('−'+(-n))}

/* ---------- 内联 SVG 图标库（24×24，描边风） ---------- */
const SVG_PATHS={
  flag:'M6 3v18M6 4h10l-2.5 3L16 10H6',
  sword:'M4 20l6-6M14 4l6 6-8 8-4-2-2-4 8-8zM13 5l6 6',
  leaf:'M12 21C6 16 6 8 12 3c6 5 6 13 0 18zM12 8v9',
  drop:'M12 3c4 5 7 8.5 7 12a7 7 0 0 1-14 0c0-3.5 3-7 7-12z',
  flame:'M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-5 .5 2 1.5 3 3 3-1-3-1-6 0-8z',
  mount:'M3 19L10 6l4 7 2-3 5 9H3z',
  scroll:'M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 0v14',
  cards:'M5 7l9-3 4 12-9 3zM8 9h6M8.5 12h6M9 15h4',
  meditate:'M12 3a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM6 20c1-4 3-6 6-6s5 2 6 6M8 14h8',
  shop:'M4 9l2-5h12l2 5M4 9h16v11H4zM10 20v-6h4v6',
  spring:'M12 3c3 4 6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 3-6 6-10zM8 21h8',
  moon:'M15 3a8 8 0 1 0 6 13 9 9 0 0 1-6-13z',
  fists:'M7 8l4-4 3 3-4 4M13 7l4 4-3 3-4-4M4 14l3 3 4-4M14 16l3 3 3-3',
  bolt:'M13 2L5 13h5l-2 9 9-12h-5l1-8z',
  boot:'M5 17V5h5v7c4 0 7 2 9 5v2H5z',
  nail:'M12 3v13M8 6h8M9 21h6',
  shield2:'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z',
  cup:'M4 6h12v5a6 6 0 0 1-12 0V6zM16 7h3a2 2 0 0 1 0 5h-3M7 20h8',
  dice:'M4 4h16v16H4zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  bag:'M5 8h14l-1.5 13h-11L5 8zM9 8V6a3 3 0 0 1 6 0v2',
  person:'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM4 21c1.5-5 4.5-7 8-7s6.5 2 8 7'
};
function ico(name,cls){const d=SVG_PATHS[name]||SVG_PATHS.person;
  return '<svg class="ico'+(cls?' '+cls:'')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+d+'"/></svg>'}
/* 骰面 1~6 点阵 */
const DIE_PTS={
  1:[[12,12]],2:[[7,7],[17,17]],3:[[7,7],[12,12],[17,17]],
  4:[[7,7],[17,7],[7,17],[17,17]],5:[[7,7],[17,7],[12,12],[7,17],[17,17]],
  6:[[7,6],[17,6],[7,12],[17,12],[7,18],[17,18]]};
function dieFace(n){const pts=DIE_PTS[n]||DIE_PTS[6];
  return '<svg class="ico die" viewBox="0 0 24 24" aria-hidden="true">'+
    '<rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="currentColor" opacity=".13"/>'+
    '<rect x="2.5" y="2.5" width="19" height="19" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.6"/>'+
    pts.map(p=>'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="1.9" fill="currentColor"/>').join('')+'</svg>'}

/* 头像：立绘缺失/加载失败时露出 SVG 剪影（颜色跟随人物） */
function avHtml(id){return '<svg class="ico avico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+SVG_PATHS.person+'"/></svg>'+
  (IMG.av[id]?'<img src="'+IMG.av[id]+'" alt="" onerror="this.remove()">':'')}

/* ---------- 日志 / toast（纯文字，无 emoji） ---------- */
function log(html){const b=$('logBox');const d=document.createElement('div');d.className='l';
  d.innerHTML='<span class="rn">R'+S.round+'</span>'+html;b.appendChild(d);
  while(b.children.length>90)b.removeChild(b.firstChild);b.scrollTop=b.scrollHeight}
function pname(p){return '<b style="color:'+p.color+'">'+esc(p.name)+'</b>'}
function toast(msg){const t=document.createElement('div');t.className='tst';t.textContent=msg;$('toast').appendChild(t);
  setTimeout(()=>{t.style.opacity='0';t.style.transition='opacity .3s';setTimeout(()=>t.remove(),320)},2100)}

/* ---------- 模态框（raw 与 msg 互斥，msg 禁含 HTML） ---------- */
function modal(o){return new Promise(res=>{
  if(o.raw&&o.msg!=null)console.warn('[modal] raw 与 msg 互斥，msg 已忽略：',(o.title||''));
  else if(!o.raw&&/[<>]/.test(o.msg||''))console.warn('[modal] msg 含 HTML 却未走 raw 通道：',(o.title||''));
  let h='<div class="modal-title">'+(o.icon?ico(o.icon)+' ':'')+esc(o.title||'')+'</div>';
  h+='<div class="modal-msg">'+(o.raw||esc(o.msg||''))+'</div>';
  box_html(h,o,res)})}
function box_html(h,o,res){
  const ov=document.createElement('div');ov.className='modal-overlay';
  const box=document.createElement('div');box.className='modal-box';
  box.innerHTML=h+'<div class="modal-btns"></div>';
  const btns=box.querySelector('.modal-btns');
  (o.buttons||[{text:'知道了',primary:true}]).forEach((b,i)=>{
    const el=document.createElement('button');el.textContent=b.text;if(b.primary)el.className='primary';
    if(b.disabled)el.disabled=true;
    el.onclick=()=>{ov.remove();res(i)};btns.appendChild(el)});
  ov.appendChild(box);$('modalRoot').appendChild(ov);
  /* AI 回合中的叙事弹窗自动确认，防止无人点击卡死；noAuto 的弹窗（如重开确认）不自动点 */
  if(!o.noAuto){const ap=P&&P[S.actor];
    if(ap&&isBot(ap)){setTimeout(()=>{if(ov.parentNode){const b=box.querySelector('.modal-btns button');if(b)b.click()}},450/Math.max(S.speed,1))}}}

/* ---------- 渲染 ---------- */
function buildBoard(){const bd=$('board');bd.querySelectorAll('.tile').forEach(e=>e.remove());
  TILES.forEach(t=>{const d=document.createElement('div');const[r,c]=POS_OF(t.i);
    d.className='tile'+((t.i%8===0)?' corner':'')+(t.group?' g-'+t.group:'');d.id='tile'+t.i;
    d.style.gridArea=r+'/'+c;
    let sub='';
    if(t.type==='dao')sub='价'+t.price;
    else if(t.type==='event')sub='福祸难料';else if(t.type==='luck')sub='抽一张';
    else if(t.type==='market')sub='买符箓';else if(t.type==='arena')sub='比斗夺彩';
    else if(t.type==='trib')sub='渡劫减损';else if(t.type==='spring')sub='回复灵力';
    else if(t.type==='moon')sub='顿悟 +15修为';else if(t.type==='start')sub='薪火补给';
    else if(t.type==='jail')sub='思过之地';
    d.innerHTML='<span class="ic">'+ico(t.icon)+'</span><span class="nm">'+esc(t.name)+'</span><span class="sub">'+sub+'</span><div class="tint" style="display:none"></div><div class="pips"></div>';
    bd.appendChild(d)});}
function renderTiles(){TILES.forEach(t=>{const d=$('tile'+t.i);if(!d)return;
  const tint=d.querySelector('.tint'),pips=d.querySelector('.pips'),sub=d.querySelector('.sub');
  if(t.type==='dao'){
    if(t.owner!=null){const o=P[t.owner];tint.style.display='';tint.style.background=GROUPS[t.group].c;tint.style.opacity=.18;
      d.style.boxShadow='inset 0 0 0 2.5px '+o.color;
      sub.textContent='租 '+rentOf(t);
      pips.textContent='◆'.repeat(t.level)}
    else{tint.style.display='none';d.style.boxShadow='';sub.textContent='价'+t.price;pips.textContent=''}
  }})}
function renderPlayers(){const w=$('players');w.innerHTML='';
  P.forEach(p=>{const d=document.createElement('div');d.className='pcard'+(p.id===S.cur&&!S.over?' active':'')+(p.alive?'':' dead');
    d.style.setProperty('--pc',p.color);
    const av=avHtml(p.id);
    let tags='';if(p===human())tags+='<span class="ptag rich">你</span>';if(p.auto)tags+='<span class="ptag">托管</span>';
    let st='';if(!p.alive)st='<span class="badge">陨落</span>';else if(p.jail>0)st+='<span class="badge">闭关'+p.jail+'</span>';
    if(p.frozen>0)st+='<span class="badge">定身</span>';if(p.shield)st+='<span class="badge shield">避劫</span>';
    if(p.xw>=S.winXw)st+='<span class="badge perfect">大圆满</span>';
    const itc=Object.entries(p.items).filter(([k,v])=>v>0).map(([k,v])=>ico(ITEMS[k].icon)+'×'+v).join(' ')||'—';
    d.innerHTML='<div class="pav">'+av+'</div><div class="pinfo"><div class="pnm">'+esc(p.name)+tags+'</div>'+
      '<div class="prs"><span>灵石 '+fmt(p.rs)+'</span><span>修为 '+p.xw+'</span></div>'+
      '<div class="pitems">符箓：'+itc+'</div></div><div class="pstat">'+st+'</div>';
    w.appendChild(d)})}
function tokOffsets(n){const off=[[0,0],[.42,-.38],[-.42,-.38],[.42,.38]];return off[Math.min(n,3)]}
function renderTokens(){const L=$('tokenLayer');if(L.children.length!==P.length){L.innerHTML='';
    P.forEach(p=>{const d=document.createElement('div');d.className='tok';d.style.setProperty('--pc',p.color);
      d.innerHTML='<div class="bubble">'+avHtml(p.id)+'</div>';L.appendChild(d)})}
  const cnt={};P.forEach((p,i)=>{const el=L.children[i];el.style.opacity=p.alive?'1':'.25';
    const c=cnt[p.pos]=(cnt[p.pos]||0);cnt[p.pos]++;const[dr,dc]=tokOffsets(c);
    const[r,cl]=POS_OF(p.pos);
    el.style.left=((cl-.5)/9*100+dc*4.2)+'%';el.style.top=((r-.5)/9*100+dr*4.2)+'%';
    el.classList.toggle('active',p.id===S.cur&&!S.over)});
  /* 当前行动玩家所在地块绿色高亮 */
  const bd=$('board');bd.querySelectorAll('.tile.curp').forEach(e=>e.classList.remove('curp'));
  const cp=P[S.cur];if(cp&&cp.alive&&!S.over){const cd=$('tile'+cp.pos);if(cd)cd.classList.add('curp')}}
function setTurnInfo(txt){$('turnInfo').textContent=txt}
function updateHUD(){$('roundInfo').textContent='第 '+Math.min(S.round,S.maxRound)+' / '+S.maxRound+' 轮';
  renderTiles();renderPlayers();renderTokens()}
function showDice(a,b,rolling){$('diceBox').classList.toggle('rolling',!!rolling);
  if(!rolling){$('die1').innerHTML=dieFace(a);$('die2').innerHTML=dieFace(b)}}
function delay(ms){return new Promise(r=>setTimeout(r,ms/Math.max(S.speed,.01)))}
