// Two-player check: plays the real page in Chrome with real key events and two stand-in controllers.
//   NODE_PATH=$(npm root -g) node pvp.cjs [--html file] [--shot out.png]
// Covers: PLAYER 2 on the fighter screen, the split keyboard (each half moves only its own fighter, both at once),
// nobody driving P2 but the player, pause from either side, menus still taking every key, one controller = P2,
// two controllers = P1 and P2, a P2 win on the results screen, and that a CPU match afterwards is as before.
const path=require('path'); const {launch}=require('./page.cjs');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html'))), SHOT=arg('shot','');
const results=[]; const check=(name,ok,detail='')=>{ results.push(!!ok); console.log((ok?'  ok    ':'  FAIL  ')+name+(detail?'  ('+detail+')':'')); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// stand-in controllers: window.__pads is what navigator.getGamepads() returns
const PADS=()=>{ window.__pads=[]; navigator.getGamepads=()=>window.__pads;
  window.__pad=i=>({index:i,id:'Test Pad '+(i+1)+' (stand-in)',connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))});
  window.__btn=(i,b,on)=>{ window.__pads[i].buttons[b]={pressed:on,value:on?1:0}; }; };
(async()=>{
  const browser=await launch(); const errors=[];
  const page=await browser.newPage({viewport:{width:1100,height:900}});
  page.on('pageerror',e=>errors.push(String(e.stack||e).split('\n').slice(0,2).join(' | ')));
  await page.addInitScript(PADS);
  await page.addInitScript(()=>{ try{ localStorage.clear(); }catch(e){} });
  await page.goto('file://'+HTML);
  await page.waitForFunction(()=>typeof flow==='object' && flow.s==='title'); await sleep(300);
  const st=()=>page.evaluate(()=>({s:flow.s,row:flow.row,lv:MS.lv,p2:cpu.p2,on:cpu.on,hx:H.x,dx:D.x,hg:H.ground,dg:D.ground,hm:H.mv?H.mv.key:'',dm:D.mv?D.mv.key:'',hs:H.stocks,ds:D.stocks}));
  const until=async(fn,ms=6000)=>{ const t0=Date.now(); while (Date.now()-t0<ms){ if (await page.evaluate(fn)) return true; await sleep(50); } return false; };
  const tap=async(k,ms=60)=>{ await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(60); };
  const startVs=async()=>{ await until(()=>flow.s==='select'); for (let i=0;i<4;i++) await tap('ArrowUp');
    for (let i=0;i<6 && (await st()).lv!==4;i++) await tap('ArrowRight'); await tap('Enter'); return until(()=>flow.s==='play',8000); };
  // count the moves each fighter starts (to see who is being driven)
  await page.evaluate(()=>{ window.__n={H:0,D:0}; const o=startMove; startMove=function(F,key){ const m0=F.mv; const r=o.apply(this,arguments); if (F.mv && F.mv!==m0) window.__n[F===H?'H':'D']++; return r; }; });

  console.log('keyboard');
  await tap('j'); const a=await st();
  check('the title screen still starts with J',a.s==='select');
  for (let i=0;i<4;i++) await tap('ArrowUp');
  for (let i=0;i<6 && (await st()).lv!==4;i++) await tap('ArrowRight');
  check('PLAYER 2 can be picked as the opponent',(await st()).lv===4 && (await st()).row===2);
  await tap('Enter'); await until(()=>flow.s==='ready');
  await sleep(700); if (SHOT) await page.screenshot({path:SHOT,clip:await page.evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}; })});
  check('the match starts as a two-player match',await until(()=>flow.s==='play',8000) && (await st()).p2 && (await st()).on);
  let b=await st(); await page.evaluate(()=>{ window.__n.H=window.__n.D=0; });
  await sleep(2500); let c=await st(); const n0=await page.evaluate(()=>window.__n);
  check('nobody drives player 2 while its keys are untouched',n0.D===0 && Math.abs(c.dx-b.dx)<1,`${n0.D} moves started, moved ${Math.abs(c.dx-b.dx).toFixed(1)} px`);
  b=await st(); await tap('d',400); c=await st();
  check('D moves player 1 only',c.hx-b.hx>8 && Math.abs(c.dx-b.dx)<1,`P1 ${(c.hx-b.hx).toFixed(0)} px, P2 ${(c.dx-b.dx).toFixed(0)} px`);
  await sleep(600); b=await st(); await tap('ArrowLeft',400); c=await st();
  check('the left arrow moves player 2 only',b.dx-c.dx>8 && Math.abs(c.hx-b.hx)<1,`P2 ${(c.dx-b.dx).toFixed(0)} px, P1 ${(c.hx-b.hx).toFixed(0)} px`);
  await sleep(400); b=await st(); await page.keyboard.down('a'); await page.keyboard.down('ArrowRight'); await sleep(400); await page.keyboard.up('a'); await page.keyboard.up('ArrowRight'); c=await st();
  check('both players can move at the same time',b.hx-c.hx>8 && c.dx-b.dx>8,`P1 ${(c.hx-b.hx).toFixed(0)} px, P2 ${(c.dx-b.dx).toFixed(0)} px`);
  await sleep(500); await page.evaluate(()=>{ window.__n.H=window.__n.D=0; }); await page.keyboard.down('j'); await sleep(50); c=await st(); await page.keyboard.up('j'); await sleep(50);
  let n=await page.evaluate(()=>window.__n);
  check('J is player 2\'s attack in a two-player match',n.D===1 && n.H===0,`P2 started ${n.D}, P1 started ${n.H}`);
  await sleep(700); await page.evaluate(()=>{ window.__n.H=window.__n.D=0; }); await tap('f'); n=await page.evaluate(()=>window.__n);
  check('F is player 1\'s attack',n.H===1 && n.D===0,`P1 started ${n.H}, P2 started ${n.D}`);
  await sleep(700); await page.keyboard.down('n'); await sleep(150); c=await st(); await page.keyboard.up('n');
  check('N makes player 2 jump',!c.dg && c.hg);
  await sleep(900); await page.keyboard.down('Space'); await sleep(150); c=await st(); await page.keyboard.up('Space');
  check('Space makes player 1 jump',!c.hg && c.dg);
  await sleep(900); await page.evaluate(()=>{ window.__n.H=window.__n.D=0; }); await tap('k'); n=await page.evaluate(()=>window.__n);
  check('K is player 2\'s special',n.D===1 && n.H===0);
  await sleep(1200); await tap('Enter'); check('Enter pauses',(await st()).s==='pause');
  b=await st(); await tap('ArrowDown'); c=await st();
  check('in the pause menu the arrow keys choose again',c.row===b.row+1);
  await tap('ArrowUp'); await tap('Escape'); check('Esc resumes',(await st()).s==='play');
  await page.keyboard.down('ArrowRight'); await sleep(120); await tap('Enter'); await page.keyboard.up('ArrowRight'); await tap('Escape'); await sleep(900); b=await st(); await sleep(400); c=await st();
  check('a key let go during the pause does not stay held',Math.abs(c.dx-b.dx)<1 && Math.abs(c.hx-b.hx)<1,`P2 drifted ${(c.dx-b.dx).toFixed(1)} px`);

  console.log('controllers');
  await page.evaluate(()=>{ window.__pads=[window.__pad(0)]; }); await sleep(200);
  check('one controller in a two-player match is player 2\'s',await page.evaluate(()=>PAD2.on && !PAD.on));
  await page.evaluate(()=>{ window.__n.H=window.__n.D=0; window.__btn(0,0,true); }); await sleep(120); await page.evaluate(()=>window.__btn(0,0,false)); await sleep(100); n=await page.evaluate(()=>window.__n);
  check('its attack button is player 2\'s attack',n.D===1 && n.H===0,`P2 started ${n.D}, P1 started ${n.H}`);
  await sleep(700); await page.evaluate(()=>window.__btn(0,9,true)); await sleep(120); await page.evaluate(()=>window.__btn(0,9,false)); await sleep(100);
  check('player 2 can pause with Start',(await st()).s==='pause');
  b=await st(); await page.evaluate(()=>window.__btn(0,13,true)); await sleep(120); await page.evaluate(()=>window.__btn(0,13,false)); await sleep(100); c=await st();
  check('in the pause menu that controller chooses',c.row===b.row+1 && await page.evaluate(()=>PAD.on && !PAD2.on));
  await page.evaluate(()=>window.__btn(0,12,true)); await sleep(120); await page.evaluate(()=>window.__btn(0,12,false)); await sleep(100);
  await page.evaluate(()=>{ window.__n.H=window.__n.D=0; window.__btn(0,0,true); }); await sleep(200); c=await st(); n=await page.evaluate(()=>window.__n);
  check('resuming with a held button does not also attack',c.s==='play' && n.D===0 && n.H===0,`state ${c.s}, P1 started ${n.H}, P2 started ${n.D}`);
  await page.evaluate(()=>window.__btn(0,0,false)); await sleep(300);
  await page.evaluate(()=>{ window.__pads=[window.__pad(0),window.__pad(1)]; }); await sleep(200);
  check('two controllers are player 1 and player 2',await page.evaluate(()=>PAD.on && PAD.idx===0 && PAD2.on && PAD2.idx===1));
  b=await st(); await page.evaluate(()=>{ window.__pads[0].axes[0]=-1; window.__pads[1].axes[0]=1; }); await sleep(400); await page.evaluate(()=>{ window.__pads[0].axes[0]=0; window.__pads[1].axes[0]=0; }); c=await st();
  check('each stick moves its own fighter',b.hx-c.hx>8 && c.dx-b.dx>8,`P1 ${(c.hx-b.hx).toFixed(0)} px, P2 ${(c.dx-b.dx).toFixed(0)} px`);
  await page.evaluate(()=>{ window.__pads=[]; }); await sleep(200);

  console.log('match flow');
  await page.evaluate(()=>{ H.stocks=1; H.inv=0; H.y=900; }); 
  check('player 2 wins when player 1 loses the last stock',await until(()=>flow.s==='results',12000) && await page.evaluate(()=>flow.winner===D && cpu.p2));
  await sleep(800); await tap('j'); check('rematch starts another two-player match',await until(()=>flow.s==='play',8000) && (await st()).p2);
  await tap('Enter'); for (let i=0;i<2;i++) await tap('ArrowDown'); await tap('j'); await until(()=>flow.s==='select');
  for (let i=0;i<4;i++) await tap('ArrowUp'); for (let i=0;i<6 && (await st()).lv!==1;i++) await tap('ArrowRight'); await tap('Enter');
  check('a CPU match after it is a CPU match',await until(()=>flow.s==='play',8000) && !(await st()).p2 && (await st()).on);
  await page.evaluate(()=>{ window.__n.H=window.__n.D=0; }); await tap('j'); await sleep(2500); n=await page.evaluate(()=>window.__n);
  check('against the CPU, J is player 1\'s attack again and the CPU plays',n.H>=1 && n.D>=1,`P1 started ${n.H}, CPU started ${n.D}`);
  check('no page errors',errors.length===0,errors.join(' || '));
  await browser.close();
  const bad=results.filter(r=>!r).length; console.log(bad?`\n${bad} of ${results.length} checks failed`:`\nall ${results.length} checks passed`); process.exit(bad?1:0);
})().catch(e=>{ console.error(e); process.exit(2); });
