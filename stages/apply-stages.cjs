#!/usr/bin/env node
// Hermes Arena: wires the stage registry (stages.js) into pixel-hermes.html.
// usage: node apply-stages.cjs <in.html> [out.html]      (out defaults to in, overwritten in place)
// Idempotent: a file that already has the stage block gets its stage block replaced with the
// current stages.js and every other anchor is skipped. If an anchor can't be found it exits 1
// and writes nothing.
const fs=require('fs'), path=require('path');
const IN=process.argv[2], OUT=process.argv[3]||IN;
if (!IN){ console.error('usage: node apply-stages.cjs <in.html> [out.html]'); process.exit(2); }
let src=fs.readFileSync(IN,'utf8');
const MOD=fs.readFileSync(path.join(__dirname,'stages.js'),'utf8').trim();
const BEGIN='// ===== STAGES BEGIN (generated from stages.js by apply-stages.cjs; edit stages.js, not this block) =====';
const END='// ===== STAGES END =====';
const block=BEGIN+'\n'+MOD+'\n'+END;
const fail=[];

if (src.includes(BEGIN)){
  // already patched: just refresh the module
  const a=src.indexOf(BEGIN), b=src.indexOf(END,a);
  if (b<0){ console.error('stage block has no end marker'); process.exit(1); }
  src=src.slice(0,a)+block+src.slice(b+END.length);
  fs.writeFileSync(OUT,src); console.log('refreshed stage block in',OUT); process.exit(0);
}

// [anchor, replacement] pairs, applied in order; each anchor must occur exactly once
const R=[
  // geometry becomes per-stage
  ['const SOLIDS=[', 'let SOLIDS=['],
  ['const PLATS=[{l:123', 'let PLATS=[{l:123'],
  ['const ALTAR={l:96', 'let ALTAR={l:96'],
  ['const CAMB={x0:-100', 'let CAMB={x0:-100'],
  ['const LEDGES=[{x:ALTAR.l', 'let LEDGES=[{x:ALTAR.l'],
  ['const ZMAX=1.38, ZMIN=', 'const ZMAX=1.38; let ZMIN='],
  // the stage module goes right after the Altar's art is built
  ['buildFg();\n', 'buildFg();\n'+block+'\n'],
  // spawns come from the stage
  ['Object.assign(H,base,{x:142,y:139,face:1,plat:SOLIDS[0],jumps:FC(H).jumps});', 'Object.assign(H,base,spawnAt(0),{face:1,jumps:FC(H).jumps});'],
  ['Object.assign(D,base,{x:276,y:139,face:-1,plat:SOLIDS[2],jumps:FC(D).jumps});', 'Object.assign(D,base,spawnAt(1),{face:-1,jumps:FC(D).jumps});'],
  // climbing up from the right ledge lands on the last solid, whatever the stage has
  ['plat:SOLIDS[L.dir>0?0:2]', 'plat:L.plat||SOLIDS[L.dir>0?0:SOLIDS.length-1]'],
  // big maps: solid blocks with walls and ceilings (the Altar keeps its single wall test)
  ['  if (!b.ground && b.y>ALTAR.t+9 && b.y<ALTAR.b+80', '  if (STAGE.blocks) blockCollide(b,py); else if (!b.ground && b.y>ALTAR.t+9 && b.y<ALTAR.b+80'],
  ['const lo=F.plat.soft?F.plat.l:ALTAR.l, hi=F.plat.soft?F.plat.r:ALTAR.r', 'const lo=F.plat.soft||STAGE.blocks?F.plat.l:ALTAR.l, hi=F.plat.soft||STAGE.blocks?F.plat.r:ALTAR.r'],
  ['x:208+(b===H?-24:24),y:-20,', 'x:respawnX(b),y:respawnY(b),'],
  ['tx=(x0+x1)/2*0.85+VW/2*0.15; ty=(y0+y1)/2*0.9+(VH/2)*0.1;', '{ const k=STAGE.big?0:1; tx=(x0+x1)/2*(1-0.15*k)+VW/2*0.15*k; ty=(y0+y1)/2*(1-0.1*k)+(VH/2)*0.1*k; }'],
  // CPU: on a big map "off the stage" means nothing underneath, and home is the nearest ledge
  ['const foeOff=!foe.ground && !foe.ledge && foe.stocks>0 && (foe.x<ALTAR.l-2||foe.x>ALTAR.r+2||foe.y>ALTAR.t+6);', 'const foeOff=!foe.ground && !foe.ledge && foe.stocks>0 && offStage(foe);'],
  ['if (foeOff && F.y<ALTAR.t && (F.jumps>1 || F.vy<0)){', 'if (foeOff && F.y<homeLedge(foe).y && (F.jumps>1 || F.vy<0)){'],
  ['if (foeOff){ const ex=foe.x<208?ALTAR.l:ALTAR.r, side=ex===ALTAR.l?1:-1, d=ex+side*20-F.x;', 'if (foeOff){ const hl=homeLedge(foe), ex=hl.x, side=hl.dir, d=ex+side*20-F.x;'],
  ['Math.abs(foe.x-ex)<70 && foe.y<ALTAR.t+40', 'Math.abs(foe.x-ex)<70 && foe.y<hl.y+40'],
  ['  if (!F.ground && (F.x<ALTAR.l-2 || F.x>ALTAR.r+2 || F.y>ALTAR.t+6)){\n    const home=F.x<208?1:-1; I.ax=home;\n    if (F.helpless || F.mv) return I;\n    const edge=Math.min(Math.abs(F.x-ALTAR.l),Math.abs(F.x-ALTAR.r));\n    if (F.vy>-30 && F.jumps>0 && F.y>ALTAR.t-50){',
   '  if (!F.ground && offStage(F)){\n    const hl=homeLedge(F), home=STAGE.big?(Math.sign(hl.x+hl.dir*8-F.x)||hl.dir):(F.x<208?1:-1); I.ax=home;\n    if (F.helpless || F.mv) return I;\n    const edge=STAGE.big?Math.abs(F.x-hl.x):Math.min(Math.abs(F.x-ALTAR.l),Math.abs(F.x-ALTAR.r)), HT=STAGE.big?hl.y:ALTAR.t;\n    if (F.vy>-30 && F.jumps>0 && F.y>HT-50){'],
  ['      if (F.y>ALTAR.t-25 && !F.used.up){', '      if (F.y>HT-25 && !F.used.up){'],
  ['      if (edge>60 && !F.used.side && F.y<ALTAR.t+20){', '      if (edge>60 && !F.used.side && F.y<HT+20){'],
  ['if (F.helpless) I.ax=F.x<208?1:-1;', 'if (F.helpless) I.ax=STAGE.big?(Math.sign(homeLedge(F).x-F.x)||1):F.x<208?1:-1;'],
  ['const nearEdge=dir=>F.ground && ((dir<0 && F.x<ALTAR.l+16) || (dir>0 && F.x>ALTAR.r-16));', 'const nearEdge=dir=>F.ground && (STAGE.big ? dropAhead(F,dir) : ((dir<0 && F.x<ALTAR.l+16) || (dir>0 && F.x>ALTAR.r-16)));'],
  // CPU on a big map: double jump up to a foe on a higher floor, hop over walls in the way
  ['    if (!F.ground && adx>14) I.ax=to;\n', '    if (STAGE.big) cpuClimb(F,I,ai,dt,dx,dy,adx,to);\n    if (!F.ground && adx>14) I.ax=to;\n'],
  // moving platforms tick with the sim (frozen during hitlag, like everything else)
  ['  shake=Math.max(0,shake-dt);\n  if (match.over>0)', '  shake=Math.max(0,shake-dt); stageStep(dt);\n  if (match.over>0)'],
  // drawing: the stage's layers replace the Altar's four fixed ones; front layers go over the fighters
  ['  if (now-armT>90){ drawArmillary(now/1000); armT=now; }\n', ''],
  ['  view(PAR.far); sg.drawImage(farCv,LX,LY,LW,LH);\n  view(PAR.arm); sg.drawImage(armCv,0,0,VW,150);\n  view(PAR.mid); sg.drawImage(midCv,LX,LY,LW,LH);\n  view(1); sg.drawImage(fgCv,LX,LY,LW,LH);\n',
   '  stageDraw(STAGE.L.back,view,now);\n'],
  ['  if (VIEW.boxes) drawBoxes();\n', '  stageDraw(STAGE.L.front,view,now); view(1);\n  if (VIEW.boxes) drawBoxes();\n'],
  // match setup: the chosen stage loads at the start of every match
  ['function startMatch(sudden){\n', 'function startMatch(sudden){\n  loadStage(MS.stage);\n'],
  ['const msSave=()=>', "if (!STAGES[MS.stage]) MS.stage='altar';\n{ const q=new URLSearchParams(location.search).get('stage'); if (q && STAGES[q]) MS.stage=q; }\nloadStage(MS.stage); resetFighters();\nconst msSave=()=>"],
  // fighter select: a STAGE row (row 5); FIGHT! moves to row 6
  ["flow.row=s==='select'?5:0;", "flow.row=s==='select'?6:0;"],
  ['menuNav(P,6,false);', 'menuNav(P,7,false);'],
  ['  else if (row===4){ if (MS.lv===3) return; MS.time=cyc(TIMES,MS.time,d); }\n',
   '  else if (row===4){ if (MS.lv===3) return; MS.time=cyc(TIMES,MS.time,d); }\n  else if (row===5){ MS.stage=cyc(STAGE_IDS,MS.stage,d); loadStage(MS.stage); resetFighters(); }\n'],
  ["['TIME LIMIT',dummy||!MS.time?'NONE':MS.time+':00']];", "['TIME LIMIT',dummy||!MS.time?'NONE':MS.time+':00'],['STAGE',STAGES[MS.stage].name]];"],
  ['const r=i+2, y=149+i*14, on=flow.row===r, off=dummy&&r>2;', 'const r=i+2, y=147+i*13, on=flow.row===r, off=dummy&&r>2&&r<5;'],
  ["const on=flow.row===5; box(160,193,96,18,on,on?'rgba(120,70,10,0.96)':null); TX('FIGHT!',VW/2,196,",
   "const on=flow.row===6; box(160,202,96,16,on,on?'rgba(120,70,10,0.96)':null); TX('FIGHT!',VW/2,203,"],
  ['hitArea(160,193,96,18,', 'hitArea(160,202,96,16,'],
  // the countdown names the stage
  ["  if (s==='ready'){ if (flow.sudden)", "  if (s==='ready' && !flow.sudden) TX(STAGE.full,VW/2,40,tMd(CREAM),'c');\n  if (s==='ready'){ if (flow.sudden)"],
];
for (const [a,b] of R){
  const n=src.split(a).length-1;
  if (n!==1){ fail.push(`${n?'found '+n+'x':'missing'}: ${a.slice(0,90).replace(/\n/g,'\\n')}`); continue; }
  src=src.replace(a,()=>b);
}
if (fail.length){ console.error('apply-stages: anchors failed, nothing written:\n  '+fail.join('\n  ')); process.exit(1); }
fs.writeFileSync(OUT,src); console.log('patched',OUT,'('+R.length+' edits)');
