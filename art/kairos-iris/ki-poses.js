function kIdle(i,n){ const p=poseIdle(i,n), ph=i/n*TAU, b=(1-Math.cos(ph))/2; return ov(p,{shF:1.0-b*0.04,elF:0.55,staff:0.04,grip:0.42,shB:-0.05,elB:0.6,lean:0.1,headBob:-0.6-b*0.3,tilt:0.08,cloak:Math.sin(ph)*0.06,orb:ph}); }
function kRun(i,n){ const p=poseRun(i,n), th=i/n*TAU; return ov(p,{hip:[1,-14.9-0.6*Math.abs(Math.sin(th))],lean:0.16,staff:0.5,grip:0.5,shF:0.7+0.1*Math.cos(th),elF:0.9,shB:0.2+0.5*Math.cos(th),elB:1.0,cloak:-0.4,tilt:0.02,orb:th}); }
function iIdle(i,n){ const p=poseIdle(i,n), ph=i/n*TAU, b=(1-Math.cos(ph))/2; return ov(p,{hip:[0,-15.2+b*0.8],shF:0.45-b*0.05,elF:0.7,staff:Math.PI,shB:-0.75,elB:0.45,lean:0.02,spread:0.2+0.05*Math.sin(ph),flap:0.1*Math.sin(ph),scarf:{droop:1.0,ph,amp:0.3,len:1}}); }
function iRun(i,n){ const p=poseRun(i,n), th=i/n*TAU; return ov(p,{shF:-0.6+0.4*Math.cos(th+Math.PI),elF:0.9,shB:0.3+0.7*Math.cos(th),elB:1.0,lean:0.28,spread:0.45,flap:0.15*Math.sin(th*2),scarf:{droop:0.1,ph:th*2,amp:0.5,len:1.15}}); }
window.DEV_ROWS=()=>{ const side=(fn,P)=>({cv:bufToCanvas(renderInto(SW,SH,B=>{ fn(B,P); finishSprite(B); }),SW,SH)});
  const fr=fn=>({front:true,cv:bufToCanvas(renderInto(FW,FH,B=>{ fn(B,{}); finishSprite(B); }),FW,FH)});
  return [
   [fr(drawHermesFront),fr(drawAethonFront),fr(drawKairosFront),fr(drawIrisFront)],
   [side(drawHermes,ANIMS.idle.pose(0)),side(drawAethon,AANIMS.idle.pose(0)),side(drawKairos,kIdle(0,12)),side(drawIris,iIdle(0,12))],
   [side(drawKairos,kRun(2,8)),side(drawKairos,ov(JUMP_KEYS[5],{staff:0.6,grip:0.5,orb:1})),side(drawKairos,ov(ATK_KEYS[3],{grip:0.35,orb:2})),side(drawKairos,ov(H_BASE,{shF:1.6,elF:0.1,staff:2.4,grip:0.5,shB:1.5,elB:0.2,lean:0.15,glow:1.5,orb:3,footF:[7,ANK]}))],
   [side(drawIris,iRun(2,8)),side(drawIris,ov(JUMP_KEYS[5],{spread:1,staff:Math.PI})),side(drawIris,ov(ATK_KEYS[3],{rib:26,staff:1.5,ribAmp:0.2,spread:0.4})),side(drawIris,ov(H_BASE,{shB:1.5,elB:0.1,pour:0.9,shF:-0.4,elF:0.8,spread:0.6,lean:0.2,footF:[7.5,ANK],flap:0.4}))],
  ]; };
