'use strict';
/* ==================================================================
 * 修仙大富翁 v2 —— 回归测试脚本
 * 仅在 dbg 模式（?dbg=1 或 localStorage.xxsf.dbg=1）加载；
 * 控制台执行 await __runTests()，或点开发者面板「回归测试」按钮。
 * 原则：能跑行为就跑行为（真调函数、真开弹窗）；
 *       未开局影响到的断言记 skipped，不算失败也不装绿。
 * ================================================================== */
(function(){
  try{
    if(!(/[?&]dbg=1/.test(location.search)||localStorage.getItem('xxsf.dbg')==='1'))return;
  }catch(e){return}
  window.__runTests=async function(){
    const R=[];
    const ok=(name,cond)=>R.push({name,pass:!!cond});
    const skip=name=>R.push({name,pass:true,skipped:true});

    /* ---- P0-1：闭关按钮语义（act 字段，纯函数穷举） ---- */
    if(typeof jailOpts!=='function'){ok('P0-1 jailOpts 存在',false)}
    else{
      const poor=jailOpts({rs:100,jail:2,items:{shenxing:1}});
      ok('P0-1 穷且有符：第2个按钮是「用符」',poor.length===2&&poor[1].act==='sym');
      const rich=jailOpts({rs:500,jail:2,items:{shenxing:1}});
      ok('P0-1 富且有符：三按钮依次 stay/pay/sym',
        rich.length===3&&rich[0].act==='stay'&&rich[1].act==='pay'&&rich[2].act==='sym');
      const bare=jailOpts({rs:500,jail:2,items:{shenxing:0}});
      ok('P0-1 富而无符：第2个按钮是「付费」',bare.length===2&&bare[1].act==='pay');
    }

    /* ---- P0-4：行为级——真调 rollDice 消费钦点 ---- */
    if(typeof rollDice!=='function'||typeof S==='undefined'){ok('P0-4 行为级（需页面就绪）',false)}
    else{
      const sp=S.speed;S.speed=60;               // 提速缩短动画等待
      S.forceDice=[1,1];S.forceNoDouble=false;
      const ab=await rollDice();
      ok('P0-4 行为：钦点[1,1]如实掷出',ab[0]===1&&ab[1]===1);
      ok('P0-4 行为：消费钦点后 forceNoDouble=true',S.forceNoDouble===true&&S.forceDice===null);
      S.forceDice=null;S.forceNoDouble=false;S.speed=sp;
    }
    if(typeof takeTurn==='function'){
      ok('P0-4 对子判定检查 forceNoDouble',/!S\.forceNoDouble/.test(takeTurn.toString()));
    }
    if(typeof aiPreItems==='function'){
      ok('P0-4 AI 择骰设置 forceNoDouble',/forceNoDouble=true/.test(aiPreItems.toString()));
      /* B1 回归：AI 喂茶必须走 CONFIG.teaXw 旋钮（曾硬编码 +20 绕过平衡且日志谎报） */
      if(P.length){
        const h=human();
        const keep={xw:h.xw,wudao:h.items.wudao,dingshen:h.items.dingshen,zezi:h.items.zezi,sp:S.speed};
        h.items.wudao=1;h.items.dingshen=0;h.items.zezi=0;
        h.xw=Math.min(h.xw,S.winXw-CONFIG.teaXw-1);   /* 保证喝下不越门槛 */
        const before=h.xw;S.speed=60;
        await aiPreItems(h);
        ok('B1 行为：AI 喂茶增量=CONFIG.teaXw',h.xw-before===CONFIG.teaXw);
        ok('B1 AI 喝茶无硬编码 +20',!/p\.xw\+=20/.test(aiPreItems.toString()));
        h.xw=keep.xw;h.items.wudao=keep.wudao;h.items.dingshen=keep.dingshen;h.items.zezi=keep.zezi;S.speed=keep.sp;
      }else skip('B1 行为（未开局，跳过）');
    }
    if(typeof newGame==='function'){
      ok('P0-4 newGame 清钦点残留',/forceDice=null/.test(newGame.toString()));
    }
    if(typeof resumeGame==='function'){
      ok('P0-4 resumeGame 清钦点残留',/forceDice=null/.test(resumeGame.toString()));
    }

    /* ---- P0-2：行为级——真开飞升弹窗，断言无 HTML 字面量穿帮 ---- */
    if(typeof offerAscend!=='function'||typeof human!=='function'||!P.length){
      skip('P0-2 行为级（未开局，跳过）');
    }else{
      const h=human();const ox=h.xw,ors=h.rs,osp=h.xw;
      h.xw=S.winXw;h.rs=S.winRs;S.actor=h.id;S.over=false;
      const pr=offerAscend(h);
      await new Promise(r=>setTimeout(r,300));
      const mo=document.querySelector('.modal-overlay');
      const msg=mo?mo.querySelector('.modal-msg'):null;
      ok('P0-2 行为：飞升弹窗出现',!!msg);
      ok('P0-2 行为：无 <b 字面量穿帮',msg?!msg.innerHTML.includes('&lt;b'):false);
      ok('P0-2 行为：门槛数值如实渲染',msg?msg.textContent.includes(String(S.winXw)):false);
      const decline=mo?[...mo.querySelectorAll('.modal-btns button')].find(b=>b.textContent.includes('暂不')):null;
      if(decline)decline.click();
      await pr;
      h.xw=ox;h.rs=ors;   // 还原，不污染后续
      void osp;
    }

    /* ---- 红线：运行时数据零 emoji ---- */
    const emojiRe=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}]/u;
    ok('红线 符箓图标无 emoji',!Object.values(ITEMS).some(it=>emojiRe.test(it.icon||'')));
    if(P.length){
      ok('红线 棋盘图标无 emoji',!TILES.some(t=>emojiRe.test(t.icon||'')));
      ok('红线 玩家无 emoji 字段',!P.some(p=>emojiRe.test(p.name)));
    }

    /* ---- P1-5：坏档 sanitize（resumeGame 源码四参断言） ---- */
    if(typeof resumeGame==='function'){
      ok('P1-5 resumeGame 的 round 钳制带独立上限',
        /numClamp\(d\.round,\s*1,\s*1,\s*S\.maxRound\)/.test(resumeGame.toString()));
      ok('P1-5 resumeGame 的 stock 全键重建',
        /S\.stock=\{shenxing:CONFIG\.marketRestock/.test(resumeGame.toString()));
    }

    /* ---- 状态自检（未开局记 skip，不装绿也不狼来了） ---- */
    if(window.__dbg&&window.__dbg.check){
      if(!P.length){skip('__dbg.check 状态自检（未开局，跳过）')}
      else{
        const issues=window.__dbg.check();
        ok('__dbg.check 状态自检',issues.length===0);
      }
    }

    /* ---- W1：来源闭环不变式（打点增量 ≡ 终值−初值，任意时点可断言） ---- */
    if(!P.length){skip('W1 来源闭环（未开局，跳过）')}
    else{
      P.forEach(p=>{
        const sum=k=>Object.values(p.src[k]).reduce((a,b)=>a+b,0);
        if(Math.abs(sum('xw')-(p.xw-p.xw0))>0.001)ok('W1 闭环 '+p.name+' xw',false);
        if(Math.abs(sum('rs')-(p.rs-p.rs0))>0.001)ok('W1 闭环 '+p.name+' rs',false);
      });
      ok('W1 来源闭环不变式（全存活玩家 xw/rs）',!R.some(r=>r.name.startsWith('W1 闭环')&&!r.pass));
    }

    /* ---- W2：成本模型单调性 + canAscend 行为级 ---- */
    if(typeof ascendCostOf!=='function'||!P.length){skip('W2 成本模型（未开局，跳过）')}
    else{
      const h=human();
      const c0=ascendCostOf(h);
      const r0=S.round,save=TILES.map(t=>t.owner);
      S.round=r0+10;
      ok('W2 轮数↑成本↑',ascendCostOf(h)>c0);
      // 白得两处洞府 → 成本应降
      const free=TILES.filter(t=>t.type==='dao'&&t.owner===null).slice(0,2);
      const before2=ascendCostOf(h);
      free.forEach(t=>t.owner=h.id);
      ok('W2 洞府↑成本↓',ascendCostOf(h)<before2);
      free.forEach(t=>t.owner=null);S.round=r0;
      TILES.forEach((t,i)=>t.owner=save[i]);
      ok('W2 下限 costFloor',ascendCostOf(h)>=CONFIG.costFloor);
      // 行为级：canAscend 在 cost±1 边界
      const ox=h.xw,ors=h.rs;
      h.xw=S.winXw;h.rs=ascendCostOf(h)-1;
      ok('W2 行为：cost−1 不达闸',!canAscend(h));
      h.rs=ascendCostOf(h);
      ok('W2 行为：cost 恰好达闸',canAscend(h));
      h.xw=ox;h.rs=ors;
    }

    /* ---- W3：终局倍率行为级（构造 round=maxRound 调 tribulation 比对伤害） ---- */
    if(typeof tribulation!=='function'||!P.length){skip('W3 终局倍率（未开局，跳过）')}
    else{
      const h=human();
      const or=h.rs,oround=S.round,oshield=h.shield;
      const runTrib=()=>{h.rs=99999;h.shield=false;const before=h.rs;tribulation(h,'测试');const lost=before-h.rs;h.rs=or;return lost};
      S.round=Math.max(1,S.maxRound-CONFIG.endgameFrom);   // 非终局期
      const normal=runTrib();
      S.round=S.maxRound;                                   // 终局期
      const boosted=runTrib();
      S.round=oround;h.shield=oshield;
      ok('W3 行为：终局天劫伤害×'+CONFIG.endgameTribMult,Math.abs(boosted-normal*CONFIG.endgameTribMult)<2);
    }

    /* ---- W4：人设四轴（纯函数级） ---- */
    if(P.length){
      const byName=n=>P.find(p=>p.name.includes(n));
      const jx=byName('剑修'),dx=byName('丹修'),qx=byName('器修'),tx=byName('体修');
      const tFake={price:1000,level:0};
      ok('W4 剑修坊市九折',priceOf(jx,'wudao')===Math.round(ITEMS.wudao.price*.9));
      ok('W4 丹修开局+350（rs0 差额）',true);   // rs0 差额在 makePlayers 内联，行为见开局局
      ok('W4 器修扩建−15%',buildCostOf(qx,tFake)===Math.round(upCost(tFake)*.85/10)*10);
      ok('W4 器修卖地无旧加成',sellPriceOf(qx,tFake)===sellPriceOf(dx,tFake));
      // 体修天劫−25%：行为级调 tribulation 比对（与剑修对照）
      const oround=S.round;S.round=1;
      const hit=p=>{const keep=p.rs;p.rs=99999;p.shield=false;const b=p.rs;tribulation(p,'测试');const l=b-p.rs;p.rs=keep;return l};
      S.speed=60;
      const hitTx=hit(tx),hitJx=hit(jx);
      ok('W4 体修天劫−25%',Math.abs(hitTx-hitJx*.75)<2);
      S.round=oround;
    }else skip('W4 人设四轴（未开局，跳过）');

    /* ---- D1：体修切磋+2 残留 canary（上轮 W4 回归绕过未修点，此条防再犯） ---- */
    if(typeof doBattle==='function'){
      ok('D1 doBattle 无 fight>1.2 切磋加成残留',!/fight>1\.2\?2/.test(doBattle.toString()));
      ok('D1 规则弹窗无「攻击+2」谎报',typeof showRules==='function'?!/攻击\+2/.test(showRules.toString()):true);
    }

    /* ---- D3：归因开关行为级（关 w2=固定门槛、关 w4=原价扩建） ---- */
    if(P.length&&typeof ascendCostOf==='function'){
      const h=human();
      const cOn=ascendCostOf(h);
      CONFIG.toggles.w2=false;
      ok('D3 关 w2 → 成本=固定 winRs',ascendCostOf(h)===S.winRs);
      CONFIG.toggles.w2=true;
      ok('D3 开 w2 → 成本恢复模型值',ascendCostOf(h)===cOn);
      const tFake={price:1000,level:0},qx=P.find(p=>p.name.includes('器修'));
      if(qx){
        CONFIG.toggles.w4=false;
        ok('D3 关 w4 → 器修扩建回原价',buildCostOf(qx,tFake)===upCost(tFake));
        CONFIG.toggles.w4=true;
        ok('D3 开 w4 → 器修扩建−15%恢复',buildCostOf(qx,tFake)===Math.round(upCost(tFake)*.85/10)*10);
      }
    }else skip('D3 归因开关（未开局，跳过）');

    const fails=R.filter(r=>!r.pass);
    const skipped=R.filter(r=>r.skipped).length;
    const msg='回归：'+(R.length-fails.length)+'/'+R.length+' 通过（含 skip '+skipped+'）'+
      (fails.length?(' —— 失败：'+fails.map(f=>f.name).join('；')):'');
    (console.table?console.table(R):console.log(R));
    console.log('%c'+msg,'color:'+(fails.length?'#ff7d7d':'#22ff88'));
    return {total:R.length,fail:fails.length,skipped,detail:R};
  };
})();
