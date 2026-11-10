// =====================================================================
//  Stages: a registry. Each stage is its geometry plus art layers, all drawn in code
//  with the same rasteriser as the fighters. The Altar of the Agora above is STAGES.altar.
//  Every stage is centred on x=208 (the engine uses 208 as the stage centre), its main
//  body is ALTAR (walls + ledges), SOLIDS run left to right, PLATS are soft and may move.
// =====================================================================
const STAGES={};
let STAGE=null, stageT=0, STAGE_BLOCKS=null;
function defStage(s){ STAGES[s.id]=s; return s; }
// extra palette ramps for stage art (appended, so fighter colours never shift)
function addMat(name,ramp){ if (MI[name]!=null) return; MI[name]=MAT_NAMES.length; MAT_NAMES.push(name); MATS[name]=ramp; ramp.forEach(h=>PAL.push(hexRGB(h))); }
// load a stage's geometry (fresh copies, so moving platforms restart) and build its art once
function loadStage(id){
  const s=STAGES[id]||STAGES.altar; STAGE=s; stageT=0;
  PLATS=s.plats.map(o=>({...o,cx:(o.l+o.r)/2,t0:o.t}));
  CAMB={...s.camb};
  if (s.blocks){
    // a big map: solid blocks (walls, ceilings, a top you stand on, ledges at exposed top corners)
    STAGE_BLOCKS=s.blocks.map(o=>({...o})); SOLIDS=STAGE_BLOCKS.map(k=>(k.top={l:k.l,r:k.r,t:k.t}));
    ALTAR={...s.blocks[s.main]};
    LEDGES=[]; for (const k of STAGE_BLOCKS){ const lg=k.ledges||[1,1];
      if (lg[0]) LEDGES.push({x:k.l,y:k.t,dir:1,plat:k.top}); if (lg[1]) LEDGES.push({x:k.r,y:k.t,dir:-1,plat:k.top}); }
  } else {
    STAGE_BLOCKS=null; SOLIDS=s.solids.map(o=>({...o})); ALTAR={...s.altar};
    LEDGES=[{x:SOLIDS[0].l,y:SOLIDS[0].t,dir:1},{x:SOLIDS[SOLIDS.length-1].r,y:SOLIDS[SOLIDS.length-1].t,dir:-1}];
  }
  ZMIN=s.zmin||Math.max(VW/(CAMB.x1-CAMB.x0), VH/(CAMB.y1-CAMB.y0));
  if (!s.L){ const r=RES; s.L=s.build(s); RES=r; }
  try { cam.x=VW/2; cam.y=VH/2; } catch(e){}
  return s;
}
// where fighter i starts: on the highest solid under its spawn x
function spawnAt(i){ const x=STAGE.spawns[i]; let s=null; for (const q of SOLIDS) if (x>=q.l && x<=q.r && (!s||q.t<s.t)) s=q; s=s||SOLIDS[0]; return {x,y:s.t,plat:s}; }
// moving platforms: sway on a sine; whoever stands on one rides along
function stageStep(dt){ stageT+=dt;
  for (const p of PLATS){ const m=p.move; if (!m) continue;
    const a=TAU*stageT/m.T+(m.ph||0), cx=p.cx+Math.sin(a)*(m.ax||0), t=p.t0+Math.sin(2*a)*(m.ay||0);
    const dx=cx-(p.l+p.r)/2; p.l+=dx; p.r+=dx; p.t=t;
    for (const F of [H,D]) if (F.ground && F.plat===p){ F.x+=dx; F.y=t; } } }
// fighters: feet at y, body about this tall (for ceilings and walls on big maps)
const BODY_H=30;
function blockCollide(b,py){
  for (const k of STAGE_BLOCKS){ if (b.x<=k.l-5 || b.x>=k.r+5) continue;
    // ceiling: a rising head that crosses the underside stops there
    if (b.vy<0 && py-BODY_H>=k.b-0.5 && b.y-BODY_H<k.b && b.x>k.l-1 && b.x<k.r+1){ b.y=k.b+BODY_H; b.vy=0; continue; }
    // walls: anything beside the block below its top is pushed out to the nearer side
    if (b.y>k.t+(b.ground?1:9) && b.y-BODY_H<k.b){ const left=b.x<(k.l+k.r)/2;
      if (!b.ground){ b.wallHit=left?-1:1; b.wallV=b.vx; } b.x=left?k.l-5:k.r+5; b.vx=0; } } }
// respawn points (default: above the centre, as before)
const respawnX=b=>STAGE.respawn?STAGE.respawn[b===H?0:1][0]:208+(b===H?-24:24);
const respawnY=b=>STAGE.respawn?STAGE.respawn[b===H?0:1][1]:-20;
// CPU helpers. Small stages keep the old rules exactly; big maps use what is under the fighter.
function offStage(F){ if (!STAGE.big) return F.x<ALTAR.l-2||F.x>ALTAR.r+2||F.y>ALTAR.t+6; return surfaceBelow(F)===null; }
function homeLedge(F){ if (!STAGE.big) return F.x<208?LEDGES[0]:LEDGES[1];
  let best=LEDGES[0], bs=1e9;
  for (const L of LEDGES){ if (L.plat && L.plat.t<L.y-1) continue; const dx=L.x-F.x;
    const sc=Math.abs(dx)+0.4*Math.abs(L.y-F.y)-(Math.sign(dx)===Math.sign(F.vx)?20:0)+(L.y<F.y-90?200:0); if (sc<bs){ bs=sc; best=L; } }
  return best; }
// walking dir would step off a solid top with nothing underneath
function dropAhead(F,dir){ const p=F.plat; if (!p || p.soft) return false;
  if (!((dir<0 && F.x<p.l+16) || (dir>0 && F.x>p.r-16))) return false;
  return surfaceBelow({x:F.x+dir*26,y:F.y+1})===null; }
function cpuClimb(F,I,ai,dt,dx,dy,adx,to){
  // in the air below the foe: use the double jumps to get up a floor
  if (!F.ground && F.vy>=-30 && dy<-24 && F.jumps>0 && adx<120 && Math.random()<dt*8){ I.p.jump=true; ai.jumpHold=0.25; }
  if (!F.ground) return;
  // a wall in the way: jump it
  if (adx>20) for (const k of STAGE_BLOCKS){ const edge=to>0?k.l:k.r, d=(edge-F.x)*to; if (d>0 && d<22 && k.t<F.y-2 && k.b>F.y-BODY_H){ I.ax=to; I.p.jump=true; ai.jumpHold=0.3; return; } }
  // a gap in the way: run and jump it
  if (adx>40 && dropAhead(F,to) && Math.abs(dy)<90){ I.ax=to; I.p.jump=true; ai.jumpHold=0.3; return; }
  // the foe is on a floor above: get under and jump
  if (dy<-34 && adx<110 && Math.random()<dt*2.2){ I.p.jump=true; ai.jumpHold=0.25; } }
// draw a list of layers; each is {par, cv,x,y,w,h} or {par, draw(g,now)}, optional alpha
function stageDraw(Ls,view,now){ for (const l of Ls){ view(l.par); if (l.alpha!=null) sg.globalAlpha=l.alpha;
  if (l.cv) sg.drawImage(l.cv,l.x,l.y,l.w,l.h); else l.draw(sg,now/1000); sg.globalAlpha=1; } }

// ---- art helpers --------------------------------------------------------------------------
const snap=v=>Math.round(v*RES)/RES;
function stageBounds(s){ const c=s.camb, LX=c.x0-10, LY=c.y0-10; return {LX,LY,LW:c.x1-c.x0+20,LH:Math.max(VH,c.y1+10)-LY}; }
// rasterise fn over the stage's whole layer area -> layer at parallax par
function artLayer(s,par,fn,o={}){ const {LX,LY,LW,LH}=stageBounds(s); const sd=o.seed??11; seed=sd;
  return {par, cv:bufToCanvas(renderInto(LW,LH,B=>fn(B,LX,LY,LW,LH),LX,LY),LW,LH), x:LX,y:LY,w:LW,h:LH, alpha:o.alpha}; }
// a small sprite canvas (w x h design px, origin at its top-left ox,oy in design space)
function artSprite(w,h,fn,ox=0,oy=0){ return bufToCanvas(renderInto(w,h,B=>fn(B),ox,oy),w,h); }
// dithered vertical gradient: stops [[y,hex],...] (design y), drawn under an optional art layer
function skyLayer(s,par,stops,over){
  const {LX,LY,LW,LH}=stageBounds(s), W=LW*RES, Hh=LH*RES, cv=document.createElement('canvas'); cv.width=W; cv.height=Hh;
  // each segment is split into 6 close steps and dithered between neighbours: smooth up close,
  // and no moire when the camera zooms out (a dither between far-apart colours aliases badly)
  const g=cv.getContext('2d'), im=g.createImageData(W,Hh), d=im.data, cols=stops.map(q=>hexRGB(q[1])), N=6;
  for (let y=0;y<Hh;y++){ const wy=y/RES+LY; let k=0; while (k<stops.length-2 && wy>stops[k+1][0]) k++;
    const f=clamp((wy-stops[k][0])/(stops[k+1][0]-stops[k][0]),0,1)*N, a=cols[k], b=cols[k+1];
    for (let x=0;x<W;x++){ const st=clamp(Math.floor(f+BAYER[(y&3)*4+(x&3)]*0.9+0.5),0,N)/N, i=(y*W+x)*4;
      d[i]=Math.round(a[0]+(b[0]-a[0])*st); d[i+1]=Math.round(a[1]+(b[1]-a[1])*st); d[i+2]=Math.round(a[2]+(b[2]-a[2])*st); d[i+3]=255; } }
  g.putImageData(im,0,0); if (over) g.drawImage(over.cv,0,0);
  return {par,cv,x:LX,y:LY,w:LW,h:LH}; }
// a puffy cloud: a row of overlapping lit ellipses, flat underside optional
function cloud(B,cx,cy,w,h,mat,o={}){ const n=Math.max(2,Math.round(w/(h*0.9)));
  const flat=o.flat;
  for (let i=0;i<n;i++){ const f=n===1?0.5:i/(n-1), x=cx-w/2+h*0.7+f*(w-h*1.4), r=h*(0.62+0.38*Math.sin(Math.PI*f))*(0.85+rnd()*0.3);
    ell(B,x,cy-r*0.35,r*1.15,r,mat,{outline:o.outline??true,nk:0.7,bias:o.bias??0.15,flat}); }
  if (o.base!==false) ell(B,cx,cy+h*0.15,w/2,h*0.42,mat,{outline:o.outline??true,nk:0.5,bias:(o.bias??0.15)-0.1,flat}); }
// fluted column, shaft x0..x0+w from top to bot, in mat; doric (no volutes) unless ionic
function stageColumn(B,x0,top,bot,w,mat,o={}){
  poly(B,[[x0,top],[x0+w,top],[x0+w,bot],[x0,bot]],mat,o,(x)=>{ const X=((x-x0)*RES)|0, f=(x-x0)/w; if (X%(3*RES)===RES) return 11; return f<0.28?(o.lit??14):f<0.66?13:12; });
  poly(B,[[x0-1.5,top-3],[x0+w+1.5,top-3],[x0+w,top],[x0,top]],mat,{...o,flat:13});
  poly(B,[[x0-2.5,top-5.5],[x0+w+2.5,top-5.5],[x0+w+2.5,top-3],[x0-2.5,top-3]],mat,{...o,flat:14});
  if (o.ionic){ ell(B,x0-2.6,top-2.8,1.8,1.8,mat,{flat:12}); ell(B,x0+w+2.6,top-2.8,1.8,1.8,mat,{flat:12}); }
  if (o.base!==false) poly(B,[[x0-1.5,bot-3],[x0+w+1.5,bot-3],[x0+w+3,bot],[x0-3,bot]],mat,{...o,flat:13}); }

// big maps: a pale wash over the scenery, then every surface you can stand on drawn crisp on top:
// a bright cream-and-gold top edge with a dark ink outline. Solid ground gets a solid dark underside;
// pass-through floors get a dashed underside, so you can tell which ones you can jump up through.
function hazeLayer(s,col){ const {LX,LY,LW,LH}=stageBounds(s); return {par:1, draw:g=>{ g.fillStyle=col; g.fillRect(LX,LY,LW,LH); }}; }
function walkLayer(s){
  const {LX,LY,LW,LH}=stageBounds(s), K=RES, cv=document.createElement('canvas'); cv.width=LW*K; cv.height=LH*K;
  const g=cv.getContext('2d'), R=(x,y,w,h,c)=>{ g.fillStyle=c; g.fillRect(Math.round((x-LX)*K),Math.round((y-LY)*K),Math.round(w*K),Math.round(h*K)); };
  const INKC='#0b1030', TOP='#fff8e2', GLD='#efbe46', GLD2='#c98a1c', FACE='#e2e7f2', FACE2='#bcc7e2';
  const edge=(l,r,t,soft)=>{ const w=r-l;
    R(l-1.5,t-1,w+3,soft?6:5.5,INKC);                 // ink outline
    R(l-1,t-0.5,w+2,1.5,TOP);                         // lit walking surface
    R(l-1,t+1,w+2,1,GLD); R(l-1,t+2,w+2,1,GLD2);      // gold band
    R(l-1,t+3,w+2,soft?1.5:1.5,soft?FACE2:FACE);
    if (soft){ for (let x=l;x<r-2;x+=6) R(x,t+5,3,1.5,INKC); }               // dashed underside = pass-through
    else R(l-1.5,t+4.5,w+3,1.5,INKC);
    R(l-1.5,t-1,1,soft?6:6,INKC); R(r+0.5,t-1,1,soft?6:6,INKC); };
  for (const k of s.blocks||[]) edge(k.l,k.r,k.t,false);
  for (const p of s.plats) edge(p.l,p.r,p.t,true);
  return {par:1, cv, x:LX,y:LY,w:LW,h:LH}; }

// ---- 1. Altar of the Agora: the original stage, art built above ----------------------------
defStage({id:'altar', name:'ALTAR', full:'ALTAR OF THE AGORA',
  solids:SOLIDS.map(o=>({...o})), plats:PLATS.map(o=>({...o})), altar:{...ALTAR}, camb:{...CAMB}, spawns:[142,276],
  build(){ return {back:[
    {par:PAR.far, cv:farCv, x:LX,y:LY,w:LW,h:LH},
    {par:PAR.arm, draw:(g,t)=>{ const now=t*1000; if (now-armT>90){ drawArmillary(t); armT=now; } g.drawImage(armCv,0,0,VW,150); }},
    {par:PAR.mid, cv:midCv, x:LX,y:LY,w:LW,h:LH},
    {par:1, cv:fgCv, x:LX,y:LY,w:LW,h:LH}], front:[]}; }});
STAGE=STAGES.altar; STAGES.altar.L=STAGES.altar.build();

// ---- 2. Sanctuary of Kyllene: a big map. Hermes' birthplace on Mount Kyllene: a three-storey temple
//      in the middle, cliffs with a watchtower (left) and a herm shrine (right) across two chasms.
addMat('stone',['#1e2750','#4f5d8c','#7d8bb4','#aab6d4','#d9e0ef']);
addMat('olive',['#1d2a1e','#3b5236','#5a7550','#83996f','#b4c49a']);
addMat('wood', ['#160c0a','#3e2418','#5e3a24','#835532','#a87446']);
addMat('nite2',['#0c1236','#18224e','#26336c','#38498a','#5066a8']);
addMat('hill', ['#7f93c4','#93a5d0','#a8b8dc','#bccae6','#d0daee']);
defStage({id:'kyllene', name:'KYLLENE', full:'SANCTUARY OF KYLLENE', big:true, main:2, zmin:0.6,
  // solid blocks (walls, ceilings, tops you stand on, ledges at the top corners)
  blocks:[
    {l:-380,r:-150,t:176,b:420},               // 0 west cliff
    {l:-322,r:-286,t:96,b:176},                // 1 watchtower on it
    {l:-90,r:506,t:139,b:420},                 // 2 the temple base (main body)
    {l:566,r:796,t:176,b:420},                 // 3 east cliff
    {l:702,r:734,t:124,b:176},                 // 4 herm shrine altar on it
  ],
  // pass-through floors: jump up through them, hold down to drop
  plats:[
    {l:-136,r:-104,t:158,soft:true}, {l:520,r:552,t:158,soft:true},           // stepping stones over the chasms
    {l:-70,r:110,t:82,soft:true}, {l:306,r:486,t:82,soft:true},              // 2nd storey galleries
    {l:-30,r:150,t:24,soft:true}, {l:266,r:446,t:24,soft:true},              // 3rd storey galleries
    {l:96,r:320,t:-34,soft:true},                                            // roof cornice
    {l:180,r:236,t:-92,soft:true},                                           // the gilded finial at the top
    {l:-262,r:-188,t:124,soft:true}, {l:-376,r:-300,t:42,soft:true},         // west: column slab, lookout
    {l:604,r:678,t:124,soft:true}, {l:716,r:792,t:58,soft:true},             // east: column slab, lookout
    {l:-252,r:-176,t:-16,soft:true}, {l:600,r:676,t:-10,soft:true},          // floating ruins high over the wings
  ],
  camb:{x0:-420,x1:836,y0:-215,y1:262}, spawns:[100,316], respawn:[[184,-60],[232,-60]],
  build(s){
    const B0=s.blocks, T2=139;
    // ---- far: sky, the Arcadian ranges, Kyllene's twin peaks
    const farArt=artLayer(s,0.3,(B,LX,LY,LW,LH)=>{
      const range=(base,amp,step,tone,sd)=>{ seed=sd; const pts=[[LX,LY+LH]]; let y=base;
        for (let x=LX;x<=LX+LW+step;x+=step){ y=clamp(y+(rnd()-0.5)*amp,base-amp*1.4,base+amp*0.5); pts.push([x,y]); } pts.push([LX+LW+step,LY+LH]);
        poly(B,pts,'hill',{outline:false},()=>tone); };
      // twin peaks, snow on top
      poly(B,[[-60,LY+LH],[60,-30],[120,-110],[160,-80],[210,-150],[270,-60],[380,30],[520,LY+LH]],'hill',{outline:false},(x,y)=>{
        const snow=y< -150+Math.abs(x-210)*0.55+Math.sin(x*0.3)*4 || y< -110+Math.abs(x-120)*0.7+Math.sin(x*0.4)*3; return snow?14:(x<210+(y+150)*0.25?13:12); });
      range(40,30,14,13,3); range(100,24,10,12,5);
      for (let i=0;i<16;i++){ const x=LX+rnd()*LW, y=LY+40+rnd()*170; ell(B,x,y,20+rnd()*40,1.6+rnd(),'bgfar',{outline:false,flat:14}); }
    },{seed:5});
    const far=skyLayer(s,0.3,[[-260,'#7f9ad4'],[-120,'#a4b8e2'],[20,'#cfd9ee'],[140,'#e8ebee'],[262,'#dfe5ef']],farArt);
    // ---- mid: hills, cypresses, olive groves, a little tholos on a far hill
    const mid=artLayer(s,0.6,(B,LX,LY,LW,LH)=>{
      seed=9; const pts=[[LX,LY+LH]]; for (let x=LX;x<=LX+LW+10;x+=10) pts.push([x,150+Math.sin(x*0.011)*26+Math.sin(x*0.037)*8]); pts.push([LX+LW+10,LY+LH]);
      poly(B,pts,'hill',{},(x,y)=>Math.sin(x*0.02+y*0.05)>0.7?12:11);
      const cypress=(x,y,h)=>{ for (let k=0;k<5;k++) ell(B,x+(rnd()-0.5)*1.5,y-4-k*(h/6),4-k*0.55,h/5,'olive',{nk:0.9,bias:0.1}); };
      const olive=(x,y)=>{ caps(B,[[x,y,x-2,y-6,1.3,1]],'wood',{nk:0.6}); for (let k=0;k<4;k++) ell(B,x-6+rnd()*12,y-9-rnd()*5,4+rnd()*3,2.6+rnd()*1.5,'olive',{nk:0.8,bias:0.2}); };
      for (let i=0;i<34;i++){ const x=LX+rnd()*LW, y=152+Math.sin(x*0.011)*26+Math.sin(x*0.037)*8+4; if (rnd()<0.45) cypress(x,y,26+rnd()*22); else olive(x,y+2); }
      // far tholos on the west hill
      { const cx=-250, by=124; poly(B,[[cx-20,by],[cx+20,by],[cx+22,by+4],[cx-22,by+4]],'marble',{flat:13});
        for (let i=0;i<5;i++) stageColumn(B,cx-17+i*8,by-22,by,3.5,'marble',{base:false,lit:13});
        const dome=[]; for (let i=0;i<=16;i++){ const a=Math.PI+i/16*Math.PI; dome.push([cx+Math.cos(a)*19,by-27+Math.sin(a)*10]); }
        poly(B,[[cx-21,by-27],[cx+21,by-27],[cx+21,by-23],[cx-21,by-23]],'marble',{flat:14}); poly(B,dome,'marble',{},(x,y)=>x<cx?13:12); }
    },{seed:7});
    // ---- the temple and the cliffs, behind the fighters
    const fg=artLayer(s,1,(B,LX,LY,LW,LH)=>{
      const box=(x0,y0,x1,y1,mat,sh,o={})=>poly(B,[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],mat,o,sh);
      const BOT=LY+LH;
      // rock faces of the cliffs and the temple foundations: faceted stone
      const rock=(x0,x1,top)=>{ const fac=[]; for (let i=0;i<Math.round((x1-x0)/12);i++) fac.push([x0+rnd()*(x1-x0), top+rnd()*(BOT-top), rnd()]);
        box(x0,top,x1,BOT,'stone',(x,y)=>{ let d1=1e9,d2=1e9,k=null; for (const p of fac){ const d=((x-p[0])*1.3)**2+((y-p[1])*0.8)**2; if (d<d1){ d2=d1; d1=d; k=p; } else if (d<d2) d2=d; }
          if (Math.sqrt(d2)-Math.sqrt(d1)<1.1) return 11; return clamp(0.25+k[2]*0.45-(y-top)*0.0025,0,1); }); };
      // west cliff: grass lip, Maia's cave below
      const W=B0[0], E=B0[3];
      rock(W.l,W.r,W.t+3); rock(E.l,E.r,E.t+3);
      for (const k of [W,E]){ box(k.l-2,k.t,k.r+2,k.t+4,'olive',(x,y)=>y<k.t+1.5?14:13);
        for (let x=k.l;x<k.r;x+=3) if (rnd()<0.5) pline(B,x,k.t+4,x+(rnd()-0.5)*2,k.t+6+rnd()*4,ci('olive',2)); }
      { const cx=-262, cy=222; const arch=[]; for (let i=0;i<=18;i++){ const a=Math.PI+i/18*Math.PI; arch.push([cx+Math.cos(a)*20,cy+Math.sin(a)*24]); }
        poly(B,[[cx-20,BOT],...arch,[cx+20,BOT]],'nite2',{},(x,y)=>y<cy-10?12:11);
        for (let i=0;i<5;i++) ell(B,cx-10+i*5,cy+10,1.2,1.2,'gold',{flat:14,outline:false}); }
      // watchtower: ashlar blocks, slit windows, cornice
      { const k=B0[1]; box(k.l,k.t,k.r,k.b,'stone',(x,y)=>{ const row=Math.floor((y-k.t)/6), off=row%2?6:0; if ((y-k.t)%6<0.6 || (x-k.l+off)%12<0.6) return 11; return clamp(0.62-(x-k.l)*0.01,0,1); });
        box(k.l-3,k.t,k.r+3,k.t+4,'marble',(x,y)=>y<k.t+1.5?14:12);
        for (const wy of [k.t+16,k.t+44]) box(k.l+15,wy,k.l+21,wy+12,'nite2',null,{flat:11});
        for (let i=0;i<4;i++) box(k.l-3+i*12,k.t-5,k.l+3+i*12,k.t,'marble',null,{flat:13}); }
      // herm shrine altar, and the great herm (a pillar with Hermes' bearded head) behind it
      { const hx=650, hb=E.t; box(hx-8,hb-70,hx+8,hb,'marble',(x)=>x<hx-3?14:x<hx+4?13:12);
        ell(B,hx,hb-80,9,11,'marble',{nk:0.85}); ell(B,hx,hb-74,7,6,'marble',{flat:12}); ell(B,hx-1,hb-82,4,3,'marble',{flat:14});
        poly(B,[[hx-11,hb-86],[hx+11,hb-86],[hx+9,hb-92],[hx-9,hb-92]],'marble',{flat:13}); feather(B,hx-9,hb-88,-2.1,8,1.8,'gold',{quill:false}); feather(B,hx+9,hb-88,2.1,8,1.8,'gold',{quill:false});
        box(hx-12,hb-6,hx+12,hb,'marble',(x,y)=>y<hb-4?14:12);
        const k=B0[4]; box(k.l,k.t,k.r,k.b,'marble',(x,y)=>y<k.t+2?14:clamp(0.55-(x-k.l)*0.008,0,1));
        // lyre relief on the altar face
        caps(B,[[k.l+9,k.t+30,k.l+8,k.t+14,1,0.8],[k.r-9,k.t+30,k.r-8,k.t+14,1,0.8],[k.l+8,k.t+14,k.r-8,k.t+14,0.7,0.7]],'gold',{flat:13});
        ell(B,(k.l+k.r)/2,k.t+32,8,4,'gold',{nk:0.8}); for (let i=0;i<4;i++) pline(B,k.l+11+i*3.5,k.t+15,k.l+11+i*3.5,k.t+30,ci('gold',4)); }
      // temple: stylobate steps down the front of the base, then foundations
      const M=B0[2]; rock(M.l+10,M.r-10,M.t+30);
      [[0,10],[10,20],[20,30]].forEach(([a,b2],i)=>box(M.l-i*0+i*4,M.t+a,M.r-i*4,M.t+b2,'marble',(x,y)=>y<M.t+a+2?0.95:clamp(0.5-(y-M.t-a)*0.02,0,1)));
      box(M.l-3,M.t,M.r+3,M.t+3,'marble',(x,y)=>y<M.t+1.2?14:13);
      // back walls of each storey (darker relief so the fighters read in front)
      box(-70,82,486,T2,'relief',(x,y)=>clamp(0.28+(T2-y)*0.003,0,1));
      box(-30,24,446,82,'relief',(x,y)=>clamp(0.34+(82-y)*0.003,0,1));
      box(96,-34,320,24,'relief',(x,y)=>clamp(0.4+(24-y)*0.003,0,1));
      // the central doorway with bronze doors and a golden caduceus above
      box(174,92,242,T2,'marble',(x)=>x<178?14:x>238?12:13); box(170,88,246,93,'marble',(x,y)=>y<89.5?14:12);
      box(181,98,235,T2,'nite2',null,{flat:11});
      for (const [a,b2] of [[182,207],[209,234]]){ box(a,99,b2,T2,'bronze',(x,y)=>{ const u=(x-a)/(b2-a); if ((y-99)%13<0.8 || u<0.06 || u>0.94) return 11; return clamp(0.62-u*0.3-(y-99)*0.003,0,1); });
        for (let y=105;y<T2;y+=13) for (let x=a+4;x<b2-2;x+=6) ell(B,x,y,0.9,0.9,'gold',{flat:14,outline:false});
        ell(B,a<200?b2-4:a+4,120,1.4,1.4,'gold',{flat:13}); }
      // atrium: a tall niche with the golden caduceus between the galleries
      box(126,30,290,82,'nite2',(x,y)=>y<40?11:clamp(0.35-(82-y)*0.004,0,1)+0);
      { const cx=208, top=34, bot=80; caps(B,[[cx,top+6,cx,bot,1.6,1.6]],'gold',{nk:0.8});
        // two serpents winding up the staff, heads facing each other under the wings
        for (const sd of [-1,1]){ const sg2=[]; let pp=null; for (let i=0;i<=28;i++){ const y=bot-4-i*1.45, x=cx+sd*Math.sin(i*0.42)*5.2; const q=[x,y]; if (pp) sg2.push([...pp,...q,1.2,1.2]); pp=q; }
          caps(B,sg2,sd<0?'gold':'bronze',{nk:0.8}); ell(B,pp[0]-sd*0.5,pp[1]-1.5,2.2,1.6,sd<0?'gold':'bronze',{nk:0.8}); }
        ell(B,cx,top+3,3.5,3.5,'orb',{nk:0.9});
        for (const sd of [-1,1]) for (let k=0;k<6;k++) feather(B,cx+sd*3,top+8,sd*(1.9+k*0.18),10+k*1.8,2.2,'gold',{bias:0.15,lit:-sd}); }
      // columns: Doric below, Ionic above, smaller on the top storey
      for (let x=-62;x<=478;x+=36){ if (x>150 && x<266) continue; stageColumn(B,x,88,T2,9,'marble',{}); }
      for (let x=-22;x<=438;x+=30){ if (x>126 && x<290) continue; stageColumn(B,x,30,82,7,'marble',{ionic:true}); }
      for (let x=104;x<=310;x+=26) stageColumn(B,x,-28,24,6,'marble',{ionic:true});
      // gallery floors: cornice + frieze slabs (these are the pass-through floors)
      const slab=(l,r,t)=>{ box(l-3,t,r+3,t+3.5,'marble',(x,y)=>y<t+1.4?14:12); box(l,t+3.5,r,t+9,'relief',(x,y)=>clamp(0.4+(t+9-y)*0.03,0,1));
        for (let x=l+4;x<r-4;x+=11){ box(x,t+3.5,x+4,t+9,'marble',(px)=>px-x<1?14:13); if (x+11<r-4) ell(B,x+7.5,t+6.2,1.1,1.1,'gold',{flat:13}); }
        box(l+0.5,t+9,r-0.5,t+10,'marble',null,{flat:12}); };
      for (const p of s.plats) if (p.t<100 && p.l>-100 && p.r<520) { if (p.t>-60) slab(p.l,p.r,p.t); }
      // the pediment over the roof cornice, with a winged sandal in the tympanum
      poly(B,[[92,-34],[208,-88],[324,-34]],'marble',{},(x,y)=>y>-37?12:13);
      poly(B,[[108,-38],[208,-82],[308,-38]],'relief',{outline:false},(x,y)=>clamp(0.35+(y+82)*0.006,0,1));
      { const cx=208, cy=-50; caps(B,[[cx-14,cy,cx+10,cy,3.2,3.2],[cx+2,cy-3,cx+2,cy-10,2.6,2.2]],'gold',{nk:0.8});
        for (let k=0;k<5;k++) feather(B,cx-6,cy-6,Math.PI+1+k*0.24,8+k*1.5,2,'wingw',{bias:0.15,lit:-1}); }
      // the gilded finial platform at the very top
      box(176,-92,240,-88,'gold',(x,y)=>y<-90.5?14:13); caps(B,[[208,-88,208,-80,1.4,1.8]],'gold',{nk:0.7});
      for (const sd of [-1,1]) feather(B,208+sd*20,-89,sd*2.4,10,1.8,'gold',{quill:false});
      // west lookout on posts, column slab; east the same
      const post=(x,t0,t1)=>box(x-1,t0,x+1,t1,'wood',(px)=>px<x?13:11);
      const lookout=(l,r,t,down)=>{ post(l+6,t,down); post(r-6,t,down); pline(B,l+6,t+6,r-6,t+22,ci('wood',2)); pline(B,r-6,t+6,l+6,t+22,ci('wood',2));
        box(l-1,t,r+1,t+4,'wood',(x,y)=>y<t+1.4?14:12); for (let x=l+3;x<r;x+=6) pline(B,x,t+0.5,x,t+3.5,ci('wood',1)); };
      const colSlab=(l,r,t,down)=>{ stageColumn(B,(l+r)/2-5,t+12,down,10,'marble',{}); box(l-2,t,r+2,t+4,'marble',(x,y)=>y<t+1.4?14:12); box(l,t+4,r,t+9,'relief',(x,y)=>0.45); };
      lookout(-376,-300,42,96); colSlab(-262,-188,124,176); lookout(716,792,58,124); colSlab(604,678,124,176);
      for (const [l,r,t] of [[-252,-176,-16],[600,676,-10]]){ slab(l,r,t); stageColumn(B,l+10,t+16,t+30,8,'marble',{base:false}); stageColumn(B,r-18,t+16,t+24,8,'marble',{base:false});
        for (let i=0;i<5;i++) ell(B,l+8+rnd()*(r-l-16),t+34+rnd()*14,1.6,1.2,'marble',{flat:12}); }
      // stepping stones: drums of a fallen column, floating over the chasms
      for (const p of s.plats) if (p.t===158){ const cx=(p.l+p.r)/2; ell(B,cx,p.t+6,16,6,'marble',{nk:0.8}); box(p.l,p.t,p.r,p.t+5,'marble',(x,y)=>y<p.t+1.4?14:13);
        for (let i=0;i<4;i++) ell(B,cx-9+i*6,p.t+16+i*3,2,1.5,'marble',{flat:12}); }
      // braziers at the gallery ends (flames are animated)
      for (const [x,t] of [[-60,82],[476,82],[-20,24],[436,24]]){ box(x-3,t-10,x+3,t,'gold',(px)=>px<x?13:12); box(x-5,t-13,x+5,t-10,'gold',null,{flat:14}); }
    },{seed:31});
    const fx={par:1, draw:(g,t)=>{
      for (const [bx,bt] of [[-60,82],[476,82],[-20,24],[436,24]]) for (let i=0;i<6;i++){ const k=(t*2.2+i/6)%1, y=bt-14-k*9, x=bx+Math.sin(t*9+i*2)*1.5*(1-k);
        g.fillStyle=k<0.3?'#fff6c8':k<0.65?'#ffc34a':'#e9783a'; const r=k<0.5?1.5:1; g.fillRect(snap(x)-r/2,snap(y)-r/2,r,r); }
      // birds circling the summit
      for (let i=0;i<5;i++){ const a=t*0.3+i*1.3, x=208+Math.cos(a)*(160+i*30), y=-140+Math.sin(a*1.7)*20+i*8, w=Math.sin(t*6+i)>0?1:0;
        g.fillStyle='#4f5d8c'; g.fillRect(snap(x)-2,snap(y)-w,2,1); g.fillRect(snap(x),snap(y)-w,2,1); }
      // leaves drifting from the groves
      for (let i=0;i<12;i++){ const k=((t*0.05+i/12)%1), x=-420+((i*131+t*20)%1300), y=-100+k*360+Math.sin(t*2+i)*4;
        g.fillStyle=i%2?'#83996f':'#5a7550'; g.fillRect(snap(x),snap(y),1.5,1); } }};
    return {back:[far,mid,fg,hazeLayer(s,'rgba(205,216,238,0.36)'),walkLayer(s),fx], front:[]};
  }});

const STAGE_IDS=Object.keys(STAGES);
