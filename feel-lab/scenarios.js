// Clip scenarios for visual review (clips.cjs). Each one sets up a moment and scripts P1's input per frame.
// The dummy (D) is the same fighter unless the scenario says otherwise. Add scenarios freely.
(function(){
const free=F=>LAB.free(F);
const S=LAB.scen={};
// a smash that KOs: tests anticipation, hit impact, hitlag, launch readability, KO slow-mo and zoom
S.ko_smash={frames:120, setup(){ H.x=170; H.face=1; D.x=196; D.face=-1; D.dmg=150; },
  input:i=>i===2?{ax:1,p:{attack:true},atkHeld:true}:(i>2&&i<14)?{ax:1,atkHeld:true}:{}};
// jab 1-2-3 then rapid jab: tests that presses chain and the hits read as separate beats
S.jab_chain={frames:90, setup(){ H.x=180; H.face=1; D.x=204; D.face=-1; D.dmg=20; },
  input:i=>[2,12,24].includes(i)?{p:{attack:true}}:{}};
// short hop nair, land, short hop fair: tests hop height, aerial timing and landing lag
S.shorthop_aerials={frames:110, setup(){ H.x=150; H.face=1; D.x=210; D.face=-1; D.dmg=30; },
  input:i=>i===2?{ax:1,p:{jump:true}}:i===6?{ax:1,p:{attack:true}}:(i>6&&i<40)?{ax:1}:i===52?{ax:1,p:{jump:true}}:i===57?{ax:1,p:{attack:true}}:(i>57&&i<90)?{ax:1}:{}};
// grab, down throw, then chase with a full hop up air: tests the throw read and the follow-up
S.dthrow_followup={frames:120, setup(){ H.ai_j=0; H.x=190; H.face=1; D.x=206; D.face=-1; D.dmg=25; },
  input:i=>{ if (i===2) return {p:{grab:true}}; if (H.holding && !H.mv) return {down:true};
    if (!H.holding && i>20 && free(H) && !H.ai_j){ H.ai_j=1; return {jumpHeld:true,ax:Math.sign(D.x-H.x),p:{jump:true}}; }
    if (H.ai_j===1 && !H.ground){ if (H.y-D.y>18 && !H.mv){ H.ai_j=2; return {up:true,p:{attack:true},jumpHeld:true}; } return {ax:Math.sign(D.x-H.x),jumpHeld:true}; }
    return {}; }};
// ftilt into a shield, then the shield gets hit by a smash: tests shield hit feedback and pushback
S.shield_hits={frames:100, setup(){ H.x=180; H.face=1; D.x=204; D.face=-1; D.shielding=true; D.ch=H.ch; },
  input:i=>i===2?{ax:1,p:{attack:true}}:i===40?{down:true,p:{attack:true},atkHeld:true}:(i>40&&i<52)?{down:true,atkHeld:true}:{}, dummy:i=>({shieldHeld:true,p:{shield:i===0}})};
// forward tilt into a shield. The attacker tries to shield again as soon as it can; the defender jumps out of
// shield the moment its shieldstun ends and does a neutral air. Tests Smash-like safety: is a blocked attack punishable?
S.shield_punish={frames:80, setup(){ H.x=186; H.face=1; D.x=206; D.face=-1; D.shielding=true; D.ch=H.ch; D.pun=0; },
  input:i=>i===2?{ax:1,p:{attack:true}}:i>=12?{shieldHeld:true,p:{shield:i===12}}:{},
  dummy:i=>{ if (D.pun===0){ if (i>10 && !(D.sstun>0)){ D.pun=1; return {jumpHeld:true,ax:-1,p:{jump:true}}; } return {shieldHeld:true,p:{shield:i===0}}; }
    if (D.pun===1 && !D.ground){ D.pun=2; return {ax:-1,p:{attack:true}}; } return {ax:D.pun<3?-1:0}; }};
// mashing up tilt on a foe at 0%: how many hits connect before they fall out (Smash: 2-4)
S.utilt_chain={frames:110, setup(){ H.x=192; H.face=1; D.x=212; D.face=-1; D.dmg=0; },
  input:i=>{ const close=Math.abs(D.x-H.x)<22; if (close) return {up:true,p:{attack:i%2===0}}; return LAB.free(H)?{ax:Math.sign(D.x-H.x)}:{}; }};
// recovering from 210 px out at stage level: double jump, then up special, aiming for the ledge
S.recovery_far={frames:200, setup(){ D.x=290; Object.assign(H,{x:ALTAR.l-210,y:ALTAR.t,vx:0,vy:0,ground:false,jumps:FC(H).jumps-1,used:{},face:1,helpless:false}); H.rec=0; },
  input:()=>{ const s={ax:H.x<ALTAR.l+24?1:-1,jumpHeld:true}; if (H.mv||H.ledge) return s; if (H.vy>=0 && H.jumps>0) return {...s,p:{jump:true}};
    if (H.jumps<=0 && H.vy>20 && !H.rec){ H.rec=1; return {...s,up:true,p:{special:true}}; } return s; }};
// Aethon-style long recovery from 245 px out: jumps, wingbeats, then glide toward the ledge
S.recovery_glide={frames:260, setup(){ D.x=290; Object.assign(H,{x:ALTAR.l-245,y:ALTAR.t,vx:0,vy:0,ground:false,jumps:FC(H).jumps-1,used:{},face:1,helpless:false}); H.rec=0; },
  input:()=>{ const s={ax:H.x<ALTAR.l+24?1:-1,jumpHeld:true}; if (H.mv||H.ledge) return s; if (H.vy>=0 && H.jumps>0) return {...s,p:{jump:true}};
    if (H.jumps<=0 && H.vy>20 && !H.rec){ H.rec=1; return {...s,up:true,p:{special:true}}; } return s; }};
// six seconds of CPU Hard vs CPU Hard: general readability of a real exchange
S.cpu_exchange={frames:360, every:3, cpu:true, seed:5, setup(){ H.dmg=40; D.dmg=40; }, input:null};
// CPU Hard (P2) using each down special against a scripted P1. Run each with its own fighter:
//   node clips.cjs --only cpu_counter --ch hermes     (Psychopomp Guard answers a forward tilt)
//   node clips.cjs --only cpu_stomp,cpu_plunge --ch aethon   (shockwave along the floor; plunge from above)
//   node clips.cjs --only cpu_field --ch kairos       (Stilled Instant, then Kairos steps out of his own field)
//   node clips.cjs --only cpu_puddle,cpu_stream --ch iris    (a puddle in the runner's path; the stream on a foe below)
// The CPU rolls dice, so each has a seed where the move comes out (find-seeds.cjs looks for them with ok()).
const wait=(cd=1.5)=>{ D.ai={cd,hold:0,holdDir:'n',jumpHold:0,projCd:1,wander:0}; };
S.cpu_counter={frames:110, cpu:true, seed:1, setup(){ H.x=176; H.face=1; D.x=204; D.face=-1; H.dmg=D.dmg=30; wait(); },
  input:i=>i===12?{ax:1,p:{attack:true}}:{}, ok:()=>!!(D.mv&&D.mv.countered)};
S.cpu_stomp={frames:150, cpu:true, seed:4, setup(){ H.x=120; H.face=1; D.x=230; D.face=-1; H.dmg=D.dmg=30; wait(0.3); },
  input:i=>i<30?{ax:1}:{}, ok:()=>H.stun>0 && D.mv && D.mv.key==='dspec' && !D.mv.plunge};
S.cpu_plunge={frames:170, cpu:true, seed:4, setup(){ H.x=208; H.face=1; H.dmg=D.dmg=30; Object.assign(D,{x:206,y:53,face:-1}); wait(0.2); },
  input:i=>({shieldHeld:i>70&&i<80}), ok:()=>D.mv && D.mv.key==='dspec' && D.mv.plunge && D.mv.hit.has('spike')};
S.cpu_field={frames:240, every:3, cpu:true, seed:14, setup(){ H.x=110; H.face=1; D.x=250; D.face=-1; H.dmg=D.dmg=30; wait(0.3); },
  input:i=>({ax:1}), ok:()=>fields.some(q=>q.own===D && Math.hypot(H.x-q.x,H.y-24-q.y)<q.r) && slowOf(D)===1 && H.stun>0};
S.cpu_puddle={frames:200, every:3, cpu:true, seed:1, setup(){ H.x=110; H.face=1; D.x=285; D.face=-1; H.dmg=D.dmg=30; wait(0.2); },
  input:i=>i<20?{}:{ax:1}, ok:()=>!!H.lie && H.dmg>30 && H.dmg<=32.5};
S.cpu_stream={frames:170, cpu:true, seed:4, setup(){ H.x=208; H.face=1; H.dmg=D.dmg=30; Object.assign(D,{x:206,y:53,face:-1}); wait(0.2); },
  input:i=>({}), ok:()=>H.stun>0 && D.stale[D.stale.length-1]==='stream'};
})();
