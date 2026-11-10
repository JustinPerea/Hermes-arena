// Online-play check: two copies of the real page in Chrome, joined by a stand-in connection that runs through this
// script (so it can add lag and jitter, or drop the line), both driven with real key events.
//   NODE_PATH=$(npm root -g) node net.cjs [--html file] [--secs 25] [--shot out.png] [--live]
// --live adds the real thing: the two pages find each other with a room code through the public signaling server and
// play over a real WebRTC data channel (both pages are on this machine, so it does not test getting through a home router).
// Covers: the handshake, both players moving their own fighter on both screens, the two copies holding the exact same
// state step for step through a mashed match (several fighters, both stages, 0 to 150 ms of lag), pause and resume from
// either side, a rematch, leaving, a dropped line, and that a CPU match afterwards is as before.
const path=require('path'); const {launch}=require('./page.cjs');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html'))), SECS=+arg('secs',25), SHOT=arg('shot',''), LIVE=process.argv.includes('--live');
const results=[]; const check=(name,ok,detail='')=>{ results.push(!!ok); console.log((ok?'  ok    ':'  FAIL  ')+name+(detail?'  ('+detail+')':'')); };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let seed=7; const rnd=()=>{ seed|=0; seed=seed+0x6D2B79F5|0; let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
// in the page: a full summary of the match after every online step, keyed by step number
const DIGEST=()=>{ window.__dig={}; window.__sent=0;
  const ser=(v,d,k)=>{ if (v===null || v===undefined) return 'n'; const t=typeof v;
    if (t==='number') return String(Math.round(v*4096)/4096); if (t==='boolean' || t==='string') return String(v); if (t==='function') return '';
    if (v instanceof Map || v instanceof Set) return 'S'+v.size; if (k==='foe' || k==='o' || k==='owner' || k==='by' || k==='grabbedBy' || k==='grabbing') return v===H?'H':v===D?'D':'?';
    if (k==='plat') return 'p'+SOLIDS.concat(PLATS).indexOf(v); if (d>2) return '~';
    if (Array.isArray(v)) return '['+v.map(x=>ser(x,d+1,'')).join(',')+']';
    return '{'+Object.keys(v).sort().filter(q=>typeof v[q]!=='function').map(q=>q+':'+ser(v[q],d+1,q)).join(',')+'}'; };
  window.__ser=()=>({H:ser(H,0,''),D:ser(D,0,''),shots:ser(shots,0,''),flow:[flow.s,Math.round(flow.t*4096),Math.round(flow.clock*4096),flow.row].join(','),sim:[Math.round(gameT*4096),Math.round(hitlag*4096)].join(',')});
  const o=flowTick; flowTick=function(P,dt){ const f=NET.on?NET.f:-1; const r=o.apply(this,arguments); if (f>=0){ const s=window.__ser(); window.__dig[f]=s.H+'#'+s.D+'#'+s.shots+'#'+s.flow+'#'+s.sim; } return r; };
  window.__link=()=>({send(o){ window.__sent++; window.__out(JSON.stringify(o)); },close(){ window.__closed=true; }}); };
(async()=>{
  const browser=await launch(); const errors=[]; const pages=[]; const net={lag:0,jit:0,cut:false};
  for (let i=0;i<2;i++){ const ctx=await browser.newContext({viewport:{width:1000,height:900}}); const p=await ctx.newPage(); pages.push(p);
    p.on('pageerror',e=>errors.push('page '+i+': '+String(e.stack||e).split('\n').slice(0,2).join(' | ')));
    await p.addInitScript(()=>{ try{ localStorage.clear(); }catch(e){} });
    let due=0, chain=Promise.resolve();      // an ordered line, like the real data channel: a late message holds back the ones behind it
    await p.exposeFunction('__out',json=>{ if (net.cut) return; const to=pages[1-i]; due=Math.max(due,Date.now()+net.lag+rnd()*net.jit); const at=due;
      chain=chain.then(()=>sleep(Math.max(0,at-Date.now()))).then(()=>to.evaluate(s=>netRecv(JSON.parse(s)),json).catch(()=>{})); });
    await p.goto('file://'+HTML); await p.waitForFunction(()=>typeof flow==='object' && flow.s==='title'); await p.evaluate(DIGEST); }
  const [A,B]=pages; await sleep(300);
  const both=fn=>Promise.all(pages.map(p=>p.evaluate(fn)));
  const until=async(fn,ms=8000)=>{ const t0=Date.now(); while (Date.now()-t0<ms){ const r=await both(fn); if (r[0] && r[1]) return true; await sleep(50); } return false; };
  const tap=async(p,k,ms=70)=>{ await p.keyboard.down(k); await sleep(ms); await p.keyboard.up(k); await sleep(80); };
  const connect=async(a,b,stage,stocks)=>{ await both(()=>{ window.__dig={}; if (flow.s==='title') go('select'); });
    await A.evaluate(([c,s,n])=>{ MS.p1=c; MS.stage=s; MS.stocks=n; MS.time=0; },[a,stage,stocks]); await B.evaluate(c=>{ MS.p1=c; },b);
    await B.evaluate(()=>netOpen(window.__link(),false)); await A.evaluate(()=>netOpen(window.__link(),true)); return until(()=>NET.on && flow.s==='play',9000); };
  // compare the two pages' summaries for every step both have
  const compare=async()=>{ const [a,b]=await both(()=>window.__dig); let n=0, bad=null; for (const f of Object.keys(a)){ if (!(f in b)) continue; n++; if (a[f]!==b[f] && (bad===null || +f<bad)) bad=+f; }
    let where=''; if (bad!==null){ const x=a[bad].split(/[,#{}]/), y=b[bad].split(/[,#{}]/); where=x.filter((v,i)=>v!==y[i]).slice(0,6).join(' ')+' vs '+y.filter((v,i)=>v!==x[i]).slice(0,6).join(' '); }
    return {n,bad,where}; };
  // both players walk at each other most of the time and mash everything else, so the match has hits, grabs, shields and KOs in it
  const KEYS=['w','s','Space','f','f','f','f','f','f','g','g','Shift','q'];
  const mash=async secs=>{ const down=[new Set(),new Set()], t0=Date.now(); let n=0;
    const set=async(i,k,on)=>{ if (on===down[i].has(k)) return; if (on){ await pages[i].keyboard.down(k); down[i].add(k); } else { await pages[i].keyboard.up(k); down[i].delete(k); } };
    while (Date.now()-t0<secs*1000){ const i=rnd()<0.5?0:1, k=KEYS[Math.floor(rnd()*KEYS.length)];
      if (n++%8===0){ const q=await A.evaluate(()=>[H.x,D.x]); for (const j of [0,1]){ const to=(j?q[0]-q[1]:q[1]-q[0])>0?'d':'a', chase=rnd()<0.92; await set(j,to,chase); await set(j,to==='d'?'a':'d',false); } }
      else await set(i,k,!down[i].has(k) && down[i].size<3);
      await sleep(15+rnd()*60); }
    for (const i of [0,1]) for (const k of down[i]) await pages[i].keyboard.up(k); await sleep(300); };

  console.log('handshake and control');
  check('two pages connect and start the same match',await connect('hermes','aethon','altar',3));
  let s=await both(()=>({me:NET.me,delay:NET.delay,h:H.ch,d:D.ch,p2:cpu.p2,seed:NET.cfg.seed}));
  check('host is player 1, guest is player 2, same fighters and seed',s[0].me===0 && s[1].me===1 && s[0].h==='hermes' && s[1].h==='hermes' && s[0].d==='aethon' && s[1].d==='aethon' && s[0].seed===s[1].seed,`delay ${s[0].delay} steps`);
  const pos=()=>both(()=>({hx:H.x,dx:D.x,f:NET.f}));
  let p0=await pos(); await tap(A,'d',400); await sleep(250); let p1=await pos();
  check('the host\'s keys move player 1 on both screens',p1[0].hx-p0[0].hx>8 && p1[1].hx-p0[1].hx>8 && Math.abs(p1[0].dx-p0[0].dx)<1,`${(p1[0].hx-p0[0].hx).toFixed(0)} px and ${(p1[1].hx-p0[1].hx).toFixed(0)} px`);
  await sleep(1200); p0=await pos(); await tap(B,'d',400); await sleep(250); p1=await pos();
  check('the guest\'s keys move player 2 on both screens',p1[0].dx-p0[0].dx>8 && p1[1].dx-p0[1].dx>8 && Math.abs(p1[1].hx-p0[1].hx)<1,`${(p1[0].dx-p0[0].dx).toFixed(0)} px and ${(p1[1].dx-p0[1].dx).toFixed(0)} px`);
  if (SHOT) for (const i of [0,1]) await pages[i].screenshot({path:SHOT.replace(/(\.\w+)$/,'-'+(i?'guest':'host')+'$1'),clip:await pages[i].evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}; })});

  console.log('pause');
  await tap(B,'Enter'); check('the guest pausing pauses both',await until(()=>flow.s==='pause',3000));
  await tap(A,'Enter'); check('the host resuming resumes both',await until(()=>flow.s==='play',3000));

  console.log('in step');
  const runs=[['hermes','aethon','altar',0,0],['kairos','iris','kyllene',60,20],['iris','hermes','altar',150,40],['aethon','kairos','kyllene',30,60]];
  for (let r=0;r<runs.length;r++){ const [a,b,stage,lag,jit]=runs[r];
    if (r){ net.lag=0; net.jit=0; await A.evaluate(()=>netEnd()); await until(()=>!NET.on && flow.s==='select',4000); net.lag=lag; net.jit=jit; if (!await connect(a,b,stage,2)){ check(`${a} v ${b} on ${stage} connects`,false); continue; } }
    await mash(SECS); const c=await compare(); const q=await both(()=>({f:NET.f,on:NET.on,desync:NET.desync,delay:NET.delay,s:flow.s,st:[H.stocks,D.stocks],dmg:[Math.round(H.dmg),Math.round(D.dmg)]}));
    check(`${a} v ${b} on ${stage}, ${lag}±${jit} ms: same state at every step`,c.n>SECS*40 && c.bad===null && q[0].on && q[1].on && !q[0].desync && !q[1].desync,
      c.bad===null?`${c.n} steps, delay ${q[0].delay}, now ${q[0].s}, stocks ${q[0].st}, damage ${q[0].dmg}`:`first difference at step ${c.bad}: ${c.where}`); }
  net.lag=0; net.jit=0;

  console.log('leaving and a dropped line');
  await B.evaluate(()=>netEnd()); 
  check('one side leaving sends both back to the fighter screen',await until(()=>!NET.on && flow.s==='select',4000) && (await A.evaluate(()=>flow.msg&&flow.msg.text))==='OPPONENT LEFT');
  await connect('hermes','aethon','altar',3); net.cut=true; const t0=Date.now();
  const lost=await until(()=>!NET.on && flow.s==='select',30000); net.cut=false;
  check('a dead line ends the match on both sides',lost && (await A.evaluate(()=>flow.msg&&flow.msg.text))==='CONNECTION LOST',`after ${((Date.now()-t0)/1000).toFixed(0)} s`);
  await A.evaluate(()=>{ flow.msg=null; }); for (let i=0;i<4;i++) await tap(A,'ArrowUp'); await A.evaluate(()=>{ MS.lv=1; }); await tap(A,'Enter');
  const cpuOk=await A.evaluate(()=>new Promise(r=>{ const t0=performance.now(); (function w(){ if (flow.s==='play') return r(true); if (performance.now()-t0>8000) return r(false); requestAnimationFrame(w); })(); }));
  s=await A.evaluate(()=>({p2:cpu.p2,on:cpu.on,net:NET.on,tune:TUNE.speed}));
  check('a CPU match afterwards is a CPU match',cpuOk && !s.p2 && s.on && !s.net,`speed ${s.tune}`);
  if (LIVE){ console.log('room code and WebRTC (live)');
    await A.evaluate(()=>{ toMenu('select'); }); await B.evaluate(()=>{ toMenu('select'); MS.p1='kairos'; }); await both(()=>{ window.__dig={}; flow.msg=null; });
    for (const p of pages){ for (let i=0;i<4;i++) await tap(p,'ArrowUp'); for (let i=0;i<7 && (await p.evaluate(()=>MS.lv))!==5;i++) await tap(p,'ArrowRight'); await tap(p,'Enter'); }
    check('ONLINE on the fighter screen opens the online screen',await until(()=>flow.s==='online' && LOB.mode==='menu',3000));
    await tap(A,'Enter'); const hosted=await A.evaluate(()=>new Promise(r=>{ const t0=performance.now(); (function w(){ if (LOB.note==='WAITING FOR YOUR FRIEND') return r(LOB.code); if (performance.now()-t0>15000) return r(''); requestAnimationFrame(w); })(); }));
    check('hosting gets a room code from the signaling server',/^[A-Z2-9]{5}$/.test(hosted),hosted?'a five-character code':await A.evaluate(()=>LOB.mode+' / '+LOB.note));
    if (SHOT) await A.screenshot({path:SHOT.replace(/(\.\w+)$/,'-room$1'),clip:await A.evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}; })});
    await tap(B,'ArrowDown'); await tap(B,'Enter'); for (const ch of hosted.toLowerCase()) await tap(B,ch,40);
    const joined=await until(()=>NET.on && flow.s==='play',30000);
    check('typing the code joins and the match starts over WebRTC',joined,joined?'delay '+await A.evaluate(()=>NET.delay)+' steps':(await both(()=>LOB.mode+' / '+LOB.note+' / '+flow.s)).join(' | '));
    if (joined){ s=await both(()=>({h:H.ch,d:D.ch,ws:!!LOB.ws,beat:LOB.beat,kind:NET.link.dc?NET.link.dc.label:''}));
      check('each side brought its own fighter, and the signaling socket is closed',s[0].h==='hermes' && s[0].d==='kairos' && s[1].d==='kairos' && !s[0].ws && !s[1].ws && !s[0].beat && !s[1].beat && s[0].kind==='pxh');
      await mash(Math.min(SECS,15)); const c=await compare(); const q=await both(()=>({on:NET.on,desync:NET.desync,f:NET.f}));
      check('same state at every step over the real connection',c.n>300 && c.bad===null && q[0].on && q[1].on,c.bad===null?`${c.n} steps`:`first difference at step ${c.bad}: ${c.where}`);
      await B.evaluate(()=>netQuit());
      check('the guest leaving ends it for the host',await until(()=>!NET.on && !NET.link && flow.s==='select',6000) && (await A.evaluate(()=>flow.msg&&flow.msg.text))==='OPPONENT LEFT'); }
    await B.evaluate(()=>{ flow.msg=null; if (flow.s!=='select') toMenu('select'); MS.lv=5; go('online'); lobStart(false); }); for (const ch of 'zzzz9') await tap(B,ch,40);
    const none=await B.evaluate(()=>new Promise(r=>{ const t0=performance.now(); (function w(){ if (!LOB.ws && LOB.note && LOB.note!=='CONNECTING') return r(LOB.note); if (performance.now()-t0>30000) return r('still '+LOB.note); requestAnimationFrame(w); })(); }));
    check('a code nobody is hosting is refused',none==='NO ROOM WITH THAT CODE',none);
    await both(()=>{ netQuit(); MS.lv=1; }); }
  check('no page errors',errors.length===0,errors.slice(0,3).join(' ; '));
  await browser.close();
  const bad=results.filter(x=>!x).length; console.log(bad?`${bad} of ${results.length} checks FAILED`:`all ${results.length} checks passed`); process.exit(bad?1:0);
})();
