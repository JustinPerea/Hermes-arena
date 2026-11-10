// Feel-lab probes. Injected into the game page after load; uses the game's own globals
// (H, D, step, landHit, startMove, CHARS, cpuInput, ...). Every probe drives the real
// simulation at a fixed 1/60 s step with scripted inputs, so numbers match what a player gets.
// Add a probe: write a function here, register it in LAB.probes, add its metric to spec.json.
(function(){
const DT=1/60;
const LAB=window.LAB={};
const realPI=playerInput;
const inp=s=>({ax:0,up:false,down:false,jumpHeld:false,atkHeld:false,shieldHeld:false,...(s||{}),p:{...((s&&s.p)||{})}});
LAB.inp=inp;
// run a scripted input for P1 for n frames; each(i) returning true stops early (returns i)
function run(script,n,each){ try { for (let i=0;i<n;i++){ const s=script(i); playerInput=()=>inp(s); step(DT); if (each && each(i)===true) return i; } }
  finally { playerInput=realPI; } return -1; }
LAB.run=run;
function setup(ch,opts={}){
  current=ch; H.ch=ch; D.ch=opts.foe||otherOf(ch); cpu.on=!!opts.cpu; resetFighters();
  hitlag=0; koFx=null; kos.length=0; lastAdv=null; shake=0; for (const k in pressed) delete pressed[k];
  H.ai=null; D.ai=null;
  if (opts.dummyAway!==false){ D.x=300; } }
LAB.setup=setup;
const free=F=>!F.mv && !(F.lag>0) && !(F.squat>0) && !(F.stun>0) && !F.lie && !F.ledge && !(F.brk>0) && !F.grabbedBy && !F.holding && !(F.pfrz>0) && !(F.sstun>0) && !F.helpless;
LAB.free=free;
const FLOOR=ALTAR.t;
const sideH=FLOOR-Math.min(...PLATS.filter(p=>p.t>70).map(p=>p.t)), topH=FLOOR-Math.min(...PLATS.map(p=>p.t));

// ---------- movement ----------
function jumpArc(holdF,dj){ setup(current); H.x=200; let left=-1, landed=-1, top=0; const y0=H.y; let apexF=-1;
  run(i=>({jumpHeld:i<holdF || (dj && i>=apexF && apexF>0), p:{jump:i===0 || (dj && i===apexF)}}),200,i=>{
    if (left<0 && !H.ground) left=i; const h=y0-H.y; if (h>top) top=h;
    if (dj && apexF<0 && left>=0 && H.vy>=0) apexF=i+1;
    if (left>=0 && H.ground && i>left){ landed=i; return true; } });
  return {squat:left, air:landed-left, top}; }
LAB.movement=function(){
  const m={};
  const full=jumpArc(999,false), sh=jumpArc(1,false), dj=jumpArc(999,true);
  m.jumpsquat_f=full.squat; m.fullhop_air_f=full.air; m.shorthop_air_f=sh.air;
  m.hop_ratio=+(sh.top/full.top).toFixed(3);
  m.fullhop_vs_sideplat=+(full.top/sideH).toFixed(3); m.dj_vs_topplat=+(dj.top/topH).toFixed(3);
  m._heights={full:+full.top.toFixed(1),short:+sh.top.toFixed(1),dj:+dj.top.toFixed(1),sideH,topH};
  // stage cross
  setup(current); H.x=ALTAR.l+12; D.x=ALTAR.r+60; D.y=400;
  const goal=ALTAR.r-12; m.cross_f=run(()=>({ax:1}),400,()=>H.x>=goal);
  // fast fall
  const fall=ff=>{ setup(current); H.x=200; let mx=0, apex=-1; run(i=>({jumpHeld:true,p:{jump:i===0,down:ff&&apex>=0&&i===apex+1}}),200,i=>{ if (apex<0 && H.vy>=0 && !H.ground) apex=i; mx=Math.max(mx,H.vy); if (H.ground&&i>10) return true; }); return mx; };
  m.ff_ratio=+(fall(true)/fall(false)).toFixed(3);
  // run turnaround: run right for 40 f, then hold left
  setup(current); H.x=ALTAR.l+20; let t0=-1;
  m.turn_f=run(i=>({ax:i<40?1:-1}),200,i=>{ if (i===40) t0=i; if (t0>=0 && H.vx<0) return true; }); if (m.turn_f>=0) m.turn_f-=40;
  // buffered follow-up: whiffed utilt, then a forward-tilt press 6 f before H is free
  // (a whiffed grounded move frees at its total once the game has cancelF)
  setup(current); H.x=200; const ut=FC(H).anims.utilt, ia=typeof cancelF==='function'?ut.total:(ut.iasa||ut.total); let startF=-1;
  run(i=>i===0?{up:true,p:{attack:true}}:(i===ia-6?{ax:1,p:{attack:true}}:{}),ut.total+20,i=>{ if (startF<0 && H.mv && H.mv.key==='attack'){ startF=i; return true; } });
  m.buffer_delay_f=startF<0?99:Math.max(0,startF-ia+1);
  return m; };

// ---------- air control and recovery ----------
// a scripted recovery: drift toward the stage, double jump(s) when falling, up special when out of jumps,
// Aethon glides after; success = grabs the ledge or lands on the altar
function recoverFrom(x,y){ setup(current,{foe:current}); D.x=300;
  Object.assign(H,{x,y,vx:0,vy:0,ground:false,jumps:FC(H).jumps-1,used:{},face:1,helpless:false,ledgeFresh:true});
  let ok=false, up=false;
  run(()=>{ const s={ax:H.x<ALTAR.l+24?1:-1,jumpHeld:true};
    if (H.mv||H.ledge) return s;
    if (H.vy>=0 && H.jumps>0) return {...s,p:{jump:true}};
    if (H.jumps<=0 && H.vy>20 && !up){ up=true; return {...s,up:true,p:{special:true}}; }
    return s; },60*6,()=>{ if (H.ledge || (H.ground && H.y<=ALTAR.t+1 && H.x>=ALTAR.l && H.x<=ALTAR.r)){ ok=true; return true; } if (kos.length || H.y>320) return true; });
  return ok; }
LAB.air=function(){
  const m={};
  // air speed vs run speed
  setup(current); H.x=150; let mx=0; run(i=>({ax:1,jumpHeld:true,p:{jump:i===0}}),40,i=>{ if (!H.ground && i>=20) mx=Math.max(mx,H.vx); });   // settled drift, after take-off speed is clamped
  m.air_speed_ratio=+(mx/(118*TUNE.run)).toFixed(3);
  // air turn: full drift right, then hold left: frames until moving left at half air speed
  setup(current); H.x=150; let t0=-1; m.air_turn_f=run(i=>({ax:i<14?1:-1,jumpHeld:true,p:{jump:i===0}}),80,i=>{ if (i===14) t0=i; if (t0>=0 && H.vx<=-mx*0.5) return true; }); if (m.air_turn_f>=0) m.air_turn_f-=14;
  // air friction: full drift, then let go of the stick: frames until drift falls below 20%
  setup(current); H.x=150; let t1=-1; m.air_stop_f=run(i=>({ax:i<14?1:0,jumpHeld:true,p:{jump:i===0}}),80,i=>{ if (i===14) t1=i; if (t1>=0 && H.vx<=mx*0.2) return true; if (H.ground&&i>3) return true; }); m.air_stop_f=(m.air_stop_f<0||!(H.vx<=mx*0.2))?99:m.air_stop_f-14;
  // horizontal recovery: farthest start (level with the stage) that still makes it back, as a share of the stage width
  let lo=0, hi=400; if (recoverFrom(ALTAR.l-hi,ALTAR.t)) lo=hi; else while (hi-lo>2){ const mid=(lo+hi)/2; if (recoverFrom(ALTAR.l-mid,ALTAR.t)) lo=mid; else hi=mid; }
  m.recovery_h=+(lo/(ALTAR.r-ALTAR.l)).toFixed(3); m._recovery_px=Math.round(lo);
  // vertical recovery: deepest start (30 px out from the ledge) that still makes it back, in body heights
  lo=0; hi=300; while (hi-lo>2){ const mid=(lo+hi)/2; if (recoverFrom(ALTAR.l-30,ALTAR.t+mid)) lo=mid; else hi=mid; }
  m.recovery_v=+(lo/52).toFixed(2);
  return m; };

// ---------- combat ----------
function hitOf(key,pick='kb'){ const A=FC(H).anims[key]; if (!A||!A.hits) return null; let best=A.hits[0]; for (const h of A.hits) if (h[pick]>best[pick]) best=h; return {...best,key}; }
// does hit h on D at damage pct, from x position, KO? Simulates flight with the real step().
function kos_at(h,pct,dx,dir){ setup(current,{foe:current}); H.x=200; H.face=dir; D.x=200+dir*dx; D.y=FLOOR; D.ground=true; D.dmg=pct; D.face=-dir;
  return launchKO(()=>landHit(D,h,dir,D.x,D.y-28,H,!h.throw)); }
// apply a hit, then fly: it is a KO only if D crosses a blast line while still in hitstun
// (a victim with no input who drifts off after hitstun would recover in a real match)
function launchKO(hit){ const before=kos.length; hit(); let ko=false, inStun=true;
  run(()=>({}),400,()=>{ if (kos.length>before){ ko=inStun; return true; } inStun=D.stun>0||hitlag>0; if (!inStun) return true; });
  return ko; }
function koPct(h,dx,dir,xAt){ let lo=0, hi=400; const test=p=>{ const k=kos_at(h,p,dx,dir); return k; };
  if (!test(hi)) return 999;
  while (hi-lo>1){ const mid=(lo+hi)>>1; if (test(mid)) hi=mid; else lo=mid; }
  return hi; }
LAB.combat=function(){
  const m={};
  // hitlag for a 10% hit, in real frames
  setup(current); D.x=H.x+20; landHit(D,{dmg:10,kb:5,ang:40},1,D.x,D.y-28,H,true); m.hitlag10_f=+(hitlag*60*TUNE.hitlag).toFixed(1); hitlag=0;
  // all combat probes use a mirror match: the victim is the same fighter
  // KO % at centre, uncharged smashes (strongest hitbox), launched toward the nearer blast line from x=208
  for (const k of ['fsmash','usmash','dsmash']){ const h=hitOf(k); m[k+'_ko']=h?koPct(h,8,1):999; }
  // back throw from the ledge: victim near the right edge, thrown off-stage
  { const t=FC(H).anims.throw_b.throw; const h={dmg:t.dmg,kb:t.kb,ang:t.ang,key:'throw_b',throw:true};
    let lo=0,hi=400; const test=p=>{ setup(current,{foe:current}); D.x=ALTAR.r-14; D.y=FLOOR; D.dmg=p; return launchKO(()=>landHit(D,h,1,D.x,D.y-26,H,false)); };
    if (!test(hi)) m.bthrow_ko=999; else { while (hi-lo>1){ const mid=(lo+hi)>>1; if (test(mid)) hi=mid; else lo=mid; } m.bthrow_ko=hi; } }
  // tumble threshold for forward tilt
  { const h=hitOf('attack'); let p=0; for (; p<=300; p+=5){ setup(current,{foe:current}); D.x=208; D.dmg=p; landHit(D,h,1,D.x,D.y-28,H,true); if (D.tumble) break; } m.tumble_ftilt=p; }
  // true-combo streak of one repeated move: the attacker re-presses the move whenever free, chasing the foe
  const chain=(key,startPct)=>{ setup(current,{foe:current}); H.x=190; H.face=1; D.x=212; D.face=-1; D.dmg=startPct;
    let streak=0, best=0, hits=0;
    const orig=landHit; landHit=function(T,h,dir,x,y,A,melee){ if (T===D && !T.shielding){ hits++; if (T.stun>0) streak++; else streak=1; best=Math.max(best,streak); } return orig.apply(this,arguments); };
    try { const press=key==='utilt'?{up:true}:key==='dtilt'?{down:true}:key==='attack'?{ax:1}:{};
      run(()=>{ const ax=Math.sign(D.x-H.x); const close=Math.abs(D.x-H.x)<22;
        // a player re-presses during the move; the buffer fires it on the first cancel frame
        if (close && (free(H) || (H.mv && H.mv.key===key))) { if (free(H) && ax && ax!==H.face) return {ax}; return {...press,ax:key==='attack'?H.face:0,p:{attack:true}}; }
        return free(H) && !close ? {ax} : {}; },60*6,()=>{ if (best>=12) return true; if (D.stun<=0 && hits>0 && free(D) && streak>0 && D.ground) return true; }); }
    finally { landHit=orig; }
    return best; };
  m.utilt_chain=chain('utilt',0);
  let mx=0; m._chains={}; for (const k of ['utilt','dtilt','attack','jab1']) for (const p of [0,40,80]){ const c=chain(k,p); m._chains[k+'@'+p]=c; mx=Math.max(mx,c); }
  m.max_chain=mx;
  // down throw at 20%: frames between the thrower and the victim becoming free
  { setup(current,{foe:current}); H.x=200; H.face=1; D.x=214; D.face=-1; D.dmg=20; let hf=-1, df=-1, thrown=-1;
    run(i=>{ if (H.holding && !H.mv) return {down:true}; if (i===0) return {p:{grab:true}}; return {}; },300,i=>{
      if (thrown<0 && D.stun>0) thrown=i; if (thrown>=0){ if (hf<0 && free(H)) hf=i; if (df<0 && (free(D)||D.lie)) df=i; if (hf>=0&&df>=0) return true; } });
    m.dthrow_adv20=(thrown<0||hf<0||df<0)?-99:df-hf; }
  return m; };

// ---------- frame data ----------
// startup = first active frame (1-based); on-shield advantage = shieldstun - frames until the attacker can act after the last hit.
// Aerials are scored on landing: shieldstun of the hit minus landing lag (as in Smash).
const BANDS={jab:{su:[2,5],sh:[-16,-4]}, tilt:{su:[5,11],sh:[-22,-6]}, smash:{su:[10,20],sh:[-45,-14]}, aerial:{su:[4,13],sh:[-14,0]}, dash:{su:[5,12],sh:[-28,-8]}};
const CLASS={jab1:'jab',attack:'tilt',utilt:'tilt',dtilt:'tilt',fsmash:'smash',usmash:'smash',dsmash:'smash',nair:'aerial',fair:'aerial',bair:'aerial',uair:'aerial',dair:'aerial',dashatk:'dash'};
LAB.framedata=function(){
  const AN=FC(H).anims, rows=[]; let ok=0, n=0;
  for (const k in CLASS){ const A=AN[k]; if (!A||!A.hits) continue; const c=CLASS[k], b=BANDS[c];
    const first=Math.min(...A.hits.map(h=>h.f[0])), lastH=A.hits.reduce((a,h)=>h.f[0]>=a.f[0]?h:a), su=first+1;
    const ss=Math.round(2+0.8*lastH.dmg); let sh;
    // grounded moves cancel early only on hit (cancelF in the game), so on shield they run to total
    const end=typeof cancelF==='function'?A.total:(A.chain?A.total:(A.iasa||A.total));
    if (c==='aerial') sh=ss-(A.landLag||8); else sh=ss-(end-lastH.f[0]);
    const suOk=su>=b.su[0]&&su<=b.su[1], shOk=sh>=b.sh[0]&&sh<=b.sh[1]; n++; if (suOk&&shOk) ok++;
    const dmg=A.hits.reduce((s,h)=>s+(h.grp&&A.hits.some(o=>o!==h&&o.grp===h.grp&&o.dmg>h.dmg)?0:h.dmg),0);
    rows.push({key:k,cls:c,startup:su,total:A.total,iasa:A.iasa||null,landLag:A.landLag||null,shieldAdv:sh,dmg:+dmg.toFixed(1),suOk,shOk}); }
  return {framedata_inband:Math.round(100*ok/n), rows}; };

// ---------- pacing: CPU vs CPU ----------
LAB.match=function(level,capS){
  setup(current,{cpu:true,foe:current,dummyAway:false}); cpu.level=level;
  const out={kos:[],nan:0,stuck:0,frames:0,timeout:false};
  const lastHit=new Map([[H,-99],[D,-99]]); let t=0;
  const oLH=landHit, oKB=koBurst;
  landHit=function(T){ const d0=T.dmg; const r=oLH.apply(this,arguments); if (T.dmg>d0) lastHit.set(T,t); return r; };
  // KO slow motion: fired, fired on a hit that did not KO within 6 s, and KOs off a hit that got none
  out.fx=0; out.fxWrong=0; out.fxMissed=0; out.hitKOs=0; let lastFx=null, pend=[]; const fxAt=new Map([[H,-99],[D,-99]]);
  koBurst=function(b){ out.kos.push({who:b===H?'P1':'P2',pct:Math.round(b.dmg),t:+t.toFixed(1),since:+(t-lastHit.get(b)).toFixed(1)});
    if (t-lastHit.get(b)<=4){ out.hitKOs++; if (t-fxAt.get(b)>6) out.fxMissed++; } pend=pend.filter(q=>q.o!==b); return oKB.apply(this,arguments); };
  const seen=new Map();
  playerInput=()=>cpuInput(H,DT);
  try {
    for (let i=0;i<capS*60;i++){ step(DT); t+=DT; out.frames++;
      if (koFx && koFx!==lastFx){ lastFx=koFx; out.fx++; fxAt.set(koFx.o,t); pend.push({o:koFx.o,t}); }
      if (pend.length && t-pend[0].t>6){ out.fxWrong++; pend.shift(); }
      if (match.over>0) break;
      for (const F of [H,D]){ if (!isFinite(F.x)||!isFinite(F.y)||!isFinite(F.vx)||!isFinite(F.vy)) out.nan++;
        const st=F.mv||(F.stun>0?'stun':null)||(F.brk>0?'brk':null)||(F.lie?'lie':null)||(F.ledge?'ledge':null)||(F.holding?'hold':null)||(F.shielding?'shield':null)||F.helpless&&'helpless'||'free';
        const s=seen.get(F); if (!s||s.st!==st) seen.set(F,{st,t}); else if (st!=='free' && t-s.t>5){ out.stuck++; out.stuckWhat=(F===H?'P1 ':'P2 ')+(st.key||st); seen.set(F,{st,t}); } } }
    if (!(match.over>0)) out.timeout=true;
  } finally { landHit=oLH; koBurst=oKB; playerInput=realPI; }
  out.secs=+(out.frames/60).toFixed(1); return out; };
})();
