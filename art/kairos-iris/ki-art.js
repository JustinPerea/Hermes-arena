// ---- dev: new materials (merged into MATS in the game) ----
(function(){ const add=(n,a)=>{ if (MI[n]!=null) return; MATS[n]=a; MI[n]=MAT_NAMES.length; MAT_NAMES.push(n); a.forEach(h=>PAL.push(hexRGB(h))); };
  add('robe',  ['#12082a','#33185e','#4f2a8a','#7148b6','#a27ede']);
  add('sand',  ['#33240c','#7d5f2c','#b98f4c','#e0bb78','#f8e6b6']);
  add('glow',  ['#3a1a04','#b0600e','#eea226','#ffd870','#fffbe0']);
  add('wood',  ['#1a0f08','#4a2c16','#704426','#97663c','#bf8d5c']);
  add('pearl', ['#2e3448','#9aa3bc','#d6dbe8','#f1f3f8','#ffffff']);
  add('aqua',  ['#04262e','#0e6a76','#1fa2a8','#5fd2c8','#bff4ea']);
  add('ihair', ['#1a0806','#4c1a10','#7a2e18','#a4482a','#cc7246']);
  add('rbr',   ['#3a0610','#9c1a26','#de3a3a','#f87a64','#ffc2a8']);
  add('rbo',   ['#3e1604','#a8480c','#ee7c1e','#ffae4e','#ffdca0']);
  add('rby',   ['#3a2c04','#a07c0e','#e8c21c','#ffe45c','#fff6b8']);
  add('rbg',   ['#08280c','#1f7a2c','#3cb04a','#7ad870','#c4f4b0']);
  add('rbb',   ['#081a4a','#1a4cb0','#2f84e8','#6cb6ff','#c4e4ff']);
  add('rbv',   ['#1c0a3a','#4e2296','#7a46d0','#a882ee','#dcc8ff']);
})();
const RAINBOW=['rbr','rbo','rby','rbg','rbb','rbv'];

// =====================================================================
//  Kairos, the Hooded Sage
// =====================================================================
const KSTAFF_LEN=58;
// orrery: a glowing sun with two tilted rings and their planets; ph turns the rings
function drawOrrery(B,c,ph,sz=1,glow=0){
  const rings=[[7*sz,2.4*sz,0.35,ph],[6*sz,2*sz,-0.6,ph*1.6+2]];
  const pt=(r,a)=>{ const [rx,ry,rot]=r, x=Math.cos(a)*rx, y=Math.sin(a)*ry; return [c[0]+x*Math.cos(rot)-y*Math.sin(rot), c[1]+x*Math.sin(rot)+y*Math.cos(rot), Math.sin(a)]; };
  const ring=(r,front)=>{ let p=null; for (let i=0;i<=28;i++){ const q=pt(r,i/28*TAU); if (p && (q[2]>=0)===front) pline(B,p[0],p[1],q[0],q[1],ci('gold',front?4:2)); p=q; } };
  for (const r of rings) ring(r,false);
  for (const r of rings){ const q=pt(r,r[3]); if (q[2]<0) ell(B,q[0],q[1],1.2*sz,1.2*sz,'gold',{bias:-0.1}); }
  ell(B,c[0],c[1],2.9*sz+glow,2.9*sz+glow,'glow',{bias:0.1});
  for (const r of rings) ring(r,true);
  for (const r of rings){ const q=pt(r,r[3]); if (q[2]>=0) ell(B,q[0],q[1],1.3*sz,1.3*sz,r===rings[0]?'aqua':'gold',{bias:0.1}); }
}
function drawKStaff(B,hand,a,grip,ph,glow){
  const L=KSTAFF_LEN, d=[Math.sin(a),-Math.cos(a)], pp=[-d[1],d[0]];
  const bot=[hand[0]-d[0]*L*grip, hand[1]-d[1]*L*grip];
  const at=(f,o=0)=>[bot[0]+d[0]*L*f+pp[0]*o, bot[1]+d[1]*L*f+pp[1]*o];
  caps(B,[[...bot,...at(0.86),1.1,1.25]],'wood',{bias:0.05});
  ell(B,...bot,1.5,1.5,'gold');
  // a gnomon fork holds the orrery
  caps(B,[[...at(0.84),...at(0.9,-2.6),0.8,0.7],[...at(0.84),...at(0.9,2.6),0.8,0.7]],'gold');
  caps(B,[[...at(0.83),...at(0.86),1.5,1.5]],'gold');
  const top=at(0.95); drawOrrery(B,top,ph,1,glow||0);
  return top;
}
function drawKairos(B,P){
  const lean=P.lean||0, up=[Math.sin(lean),-Math.cos(lean)], rt=[Math.cos(lean),Math.sin(lean)];
  const H=[OX+P.hip[0], OY+P.hip[1]];
  const T=(u,v)=>[H[0]+rt[0]*u+up[0]*v, H[1]+rt[1]*u+up[1]*v];
  const TL=pts=>pts.map(p=>T(p[0],p[1]));
  const loc=(x,y)=>{ const dx=x-H[0], dy=y-H[1]; return [dx*rt[0]+dy*rt[1], dx*up[0]+dy*up[1]]; };
  const shF=T(4,13), shB=T(-3.6,13.2);
  const C=T(1.6+(P.headX||0), 24.2+(P.headBob||0));
  const tl=P.tilt||0, ct=Math.cos(tl), st=Math.sin(tl);
  const Hp=(dx,dy)=>[C[0]+dx*ct-dy*st, C[1]+dx*st+dy*ct];
  const sway=P.cloak||0, flare=P.flare||0, ph=(P.scarf&&P.scarf.ph)||0, orb=P.orb??ph;

  // 1. hood point and the long mantle down his back
  { const tip=Hp(-12-sway*3,6+flare*2+Math.sin(ph)*0.5);
    caps(B,[[...Hp(-6,-4),...Hp(-10,1),3.6,2.8],[...Hp(-10,1),...tip,2.8,1.2]],'robe',{bias:-0.12}); }
  { const bk=-10.5-flare*4+sway*6, by=-12+flare*7;
    poly(B,TL([[-6.4,14.6],[2,14.6],[1.5,4],[-1,-12+flare*5],[bk,by+Math.sin(ph)*0.6],[-9.2,2]]),'robe',{},(x,y)=>{ const [u,v]=loc(x,y); return clamp(0.22+0.1*Math.sin(u*1.3+v*0.2)+0.01*v,0,1); }); }

  // 2. back arm, a wide sleeve
  const arm=(sh,a,e)=>{ const d1=[Math.sin(a),Math.cos(a)], el=[sh[0]+d1[0]*5.4, sh[1]+d1[1]*5.4], a2=a+e, d2=[Math.sin(a2),Math.cos(a2)], hd=[el[0]+d2[0]*5.4, el[1]+d2[1]*5.4]; return {el,hd,d2}; };
  const drawArm=(sh,g,bias)=>{ caps(B,[[sh[0],sh[1],g.el[0],g.el[1],2.6,2.6]],'robe',{bias});
    caps(B,[[g.el[0],g.el[1],g.hd[0]-g.d2[0]*1.6,g.hd[1]-g.d2[1]*1.6,2.6,3.5]],'robe',{bias});
    const cf=[g.hd[0]-g.d2[0]*1.6,g.hd[1]-g.d2[1]*1.6]; pline(B,cf[0]-g.d2[1]*3.2,cf[1]+g.d2[0]*3.2,cf[0]+g.d2[1]*3.2,cf[1]-g.d2[0]*3.2,ci('sand',3)); };
  const AB=arm(shB,P.shB,P.elB);
  drawArm(shB,AB,-0.16); ell(B,AB.hd[0],AB.hd[1],2.1,2,'skin',{bias:-0.15});

  // 3. legs inside the robe, sandalled feet
  const legs=[];
  const leg=(hip,foot,toe,bias)=>{
    const [knee,ank]=ik(hip,foot,6.5,6.6); legs.push({hip,knee,ank});
    const tc=Math.cos(toe), ts=Math.sin(toe);
    ell(B,ank[0]+1.4*tc-1.6*ts, ank[1]+1.4*ts+1.6*tc,3.4,1.6,'wood',{rot:toe,bias});
    caps(B,[[ank[0],ank[1],ank[0]+1.6*tc-1*ts,ank[1]+1.6*ts+1*tc,1.6,1.4]],'skin',{bias});
    caps(B,[[hip[0],hip[1],knee[0],knee[1],3.1,2.9],[knee[0],knee[1],ank[0],ank[1]-1.4,2.9,2.9]],'robe',{bias:bias-0.04});
  };
  leg(T(-2.4,-0.6),[OX+P.footB[0],OY+P.footB[1]],P.toeB||0,-0.16);
  leg(T(2.4,-1),[OX+P.footF[0],OY+P.footF[1]],P.toeF||0,0);
  // 4. the robe skirt: from the waist to just above each ankle, swinging with the knees
  { const [b,f]=legs, hb=[b.ank[0]-1.5-sway*2,b.ank[1]-1.6], hf=[f.ank[0]+2.6,f.ank[1]-1.6];
    const pts=[T(-7,4),T(6.8,4),[f.knee[0]+3,f.knee[1]],hf,[(hf[0]+hb[0])/2,Math.max(hf[1],hb[1])+0.6],hb,[b.knee[0]-3.4-sway,b.knee[1]+1]];
    poly(B,pts,'robe',{},(x,y)=>{ const [u,v]=loc(x,y); return clamp(0.4+u*0.035+0.08*Math.sin(u*1.4),0,1); });
    pline(B,hb[0],hb[1],hf[0],hf[1],ci('sand',3));
    for (let k=1;k<4;k++){ const x=hb[0]+(hf[0]-hb[0])*k/4, y=hb[1]+(hf[1]-hb[1])*k/4; put(B,x,y-1.5,ci('glow',3)); } }

  // 5. torso: robe, a sand stole down the front, rope sash with an hourglass charm
  poly(B,TL([[-6.6,14],[6.2,14],[6,8],[5.4,3],[7,-4.5],[-7,-4.5],[-5.6,3],[-6.4,8]]),'robe',{},
    (x,y)=>{ const [u,v]=loc(x,y); return sphereShade(clamp(u/8.5,-0.95,0.95), v>8?-0.2:0.05); });
  poly(B,TL([[2.4,14.4],[5.4,14.4],[5.6,3],[6.6,-4.5],[3.6,-4.5],[3,3]]),'sand',{},(x,y)=>{ const [u]=loc(x,y); return clamp(0.5+u*0.04,0,1); });
  for (const v of [11,7,0.5,-3]) put(B,...T(4.6,v),ci('glow',4));
  caps(B,[[...T(-6.2,4.4),...T(6.4,4.4),1.3,1.3]],'sand',{bias:-0.05});
  { const hc=T(4.4,0.4); stamp(B,hc[0],hc[1]+1,['ggg','.y.','.y.','yyy','ggg'],{g:['gold',3],y:['glow',3]}); }
  stamp(B,...T(-1.2,9.6),['.g.','g.g','.g.'],{g:['glow',3]});

  // 6. head: deep hood, face in shadow, glowing eyes, long white beard
  ell(B,...Hp(-0.6,-2.6),10.2,10.4,'robe',{rot:tl,bias:-0.1,nk:0.9});
  ell(B,...Hp(-2.4,-9.6),5.2,4.2,'robe',{rot:tl-0.5,bias:-0.02});
  // hood opening, and the dark inside
  poly(B,[Hp(2.4,-6.6),Hp(8.6,-5.8),Hp(10.6,-0.6),Hp(10,6.4),Hp(4,7.4),Hp(1.6,1)],'robe',{oc:ci('robe',0)},()=>10);
  poly(B,[Hp(3.6,-5),Hp(8,-4.2),Hp(9.4,0),Hp(8.8,5.2),Hp(4.6,5.8),Hp(3,1)],'robe',{outline:false},()=>10.0);
  for (const [x,y] of [[5.6,0.4],[8.4,0.2]]){ const p=Hp(x,y); dotPx(B,p[0]-0.5,p[1],ci('glow',2)); put(B,p[0],p[1],ci('glow',4)); dotPx(B,p[0]+1,p[1],ci('glow',3)); }
  // beard falling over the chest
  poly(B,[Hp(4.6,3.4),Hp(9.6,3.4),Hp(10.2,5.8),Hp(8.6,10.6),Hp(6.4,15.4+sway*0.6),Hp(5,12),Hp(3.8,6.4)],'wingw',{},(x,y)=>{ const dx=x-C[0]; return clamp(0.4+(dx-6)*0.06,0,1); });
  pline(B,...Hp(6.6,5.4),...Hp(6.4,11.6),ci('wingw',1)); pline(B,...Hp(8.4,5.2),...Hp(7.6,9.4),ci('wingw',2));
  ell(B,...Hp(8.2,2.8),2.4,1.1,'wingw',{bias:0.1});
  // gold hem round the hood opening
  caps(B,[[...Hp(2.2,-6.8),...Hp(8.8,-6.2),0.8,0.8],[...Hp(8.8,-6.2),...Hp(11,-0.8),0.8,0.8]],'gold',{bias:0.05});
  { const s=Hp(-2,-12); put(B,s[0],s[1],ci('glow',4)); const s2=Hp(-6,-6); put(B,s2[0],s2[1],ci('glow',3)); }

  // 7. front arm and the orrery staff
  const AF=arm(shF,P.shF,P.elF);
  if (P.smear) smear(B,AF.hd[0],AF.hd[1],KSTAFF_LEN*(1-P.grip)*0.5,KSTAFF_LEN*(1-P.grip)+4,P.smear[0],P.smear[1]);
  const top=drawKStaff(B,AF.hd,P.staff,P.grip,orb,P.glow);
  drawArm(shF,AF,0);
  ell(B,AF.hd[0],AF.hd[1],2.3,2.2,'skin');
  if (P.spark) stamp(B,top[0],top[1],['....w....','..w.w.w..','...www...','wwwwowwww','...www...','..w.w.w..','....w....'],{w:['smear',4],o:['glow',4]});
}

// =====================================================================
//  Iris, the Rainbow Herald
// =====================================================================
// rainbow wing: rows of feathers, red at the leading edge to violet at the tips
function drawRainbowWing(B,base,sp,lean,sway,bias,scale,flap){
  const armA=0.3+sp*0.85-lean*0.4+(flap||0)*0.25;
  const L1=7*scale, L2=7*scale;
  const E=[base[0]-Math.sin(armA)*L1, base[1]-Math.cos(armA)*L1];
  const a2=armA+0.55-sp*0.5;
  const W=[E[0]-Math.sin(a2)*L2, E[1]-Math.cos(a2)*L2];
  const N=9, anchor=t=> t<0.5 ? [base[0]+(E[0]-base[0])*t*2, base[1]+(E[1]-base[1])*t*2] : [E[0]+(W[0]-E[0])*(t-0.5)*2, E[1]+(W[1]-E[1])*(t-0.5)*2];
  for (let i=N-1;i>=0;i--){ const t=i/(N-1), p=anchor(t);
    const fold=-(0.1+t*0.3), open=-(0.5+t*1.5), ang=fold+(open-fold)*sp+sway*0.6-(flap||0)*0.3*t;
    feather(B,p[0],p[1],ang,(10+t*14)*scale,2.8*scale,t>0.6?'rbv':'rbb',{lit:-1,bias:bias-(i%2)*0.06,sb:-0.02}); }
  for (let i=N-2;i>=0;i--){ const t=i/(N-1), p=anchor(t);
    const fold=-(0.16+t*0.3), open=-(0.7+t*1.4);
    feather(B,p[0],p[1],fold+(open-fold)*sp+sway*0.5,7*scale,2.4*scale,t>0.5?'rbg':'rby',{lit:-1,quill:false,bias:bias+0.08}); }
  for (let i=N-2;i>=0;i--){ const t=i/(N-1), p=anchor(t);
    const fold=-(0.22+t*0.3), open=-(0.9+t*1.3);
    feather(B,p[0],p[1],fold+(open-fold)*sp+sway*0.4,4.2*scale,2.1*scale,'rbo',{lit:-1,quill:false,bias:bias+0.14}); }
  caps(B,[[...base,...E,1.5*scale,1.4*scale],[...E,...W,1.4*scale,1*scale]],'rbr',{bias:bias+0.12});
}
// ribbon of light: a chain from p0 heading along angle a (0 = up, + toward +x), each band a colour of the rainbow
function drawRibbon(B,p0,a,len,ph,amp,w,curl=0){
  const n=Math.max(4,Math.round(len/3)), seg=len/n; let p=p0, th=a; const segs=[];
  for (let i=0;i<n;i++){ th=a+curl*i/n+amp*Math.sin(ph+i*0.8)*(0.3+i/n); const q=[p[0]+Math.sin(th)*seg, p[1]-Math.cos(th)*seg]; segs.push([p,q,i]); p=q; }
  segs.forEach(([p,q,i])=>caps(B,[[...p,...q,w*(1-i/n*0.5),w*(1-(i+1)/n*0.5)]],RAINBOW[Math.min(5,Math.floor(i/n*6))],{bias:0.1,nk:0.6}));
  return p;
}
function drawPitcher(B,c,tilt,sz=1){
  const r=tilt, R=(x,y)=>[c[0]+(x*Math.cos(r)-y*Math.sin(r))*sz, c[1]+(x*Math.sin(r)+y*Math.cos(r))*sz];
  // hydria: round belly, narrow neck, flared lip, black-figure band
  caps(B,[[...R(-2.6,-1),...R(-4.4,-3.6),0.7,0.7]],'bronze');
  ell(B,...R(0,1.2),3.6*sz,3.3*sz,'bronze',{rot:r,bias:0.05});
  caps(B,[[...R(0,-1.6),...R(0.4,-4),1.6*sz,1.3*sz]],'bronze');
  ell(B,...R(0.6,-4.6),2.2*sz,0.9*sz,'bronze',{rot:r,bias:0.15});
  pline(B,...R(-3.2,1),...R(3.2,1),ci('bronze',0));
  { const m=R(0.4,0.2); put(B,m[0],m[1],ci('aqua',3)); }
}
function drawIris(B,P){
  const lean=P.lean||0, up=[Math.sin(lean),-Math.cos(lean)], rt=[Math.cos(lean),Math.sin(lean)];
  const H=[OX+P.hip[0], OY+P.hip[1]+0.8];
  const T=(u,v)=>[H[0]+rt[0]*u+up[0]*v, H[1]+rt[1]*u+up[1]*v];
  const TL=pts=>pts.map(p=>T(p[0],p[1]));
  const loc=(x,y)=>{ const dx=x-H[0], dy=y-H[1]; return [dx*rt[0]+dy*rt[1], dx*up[0]+dy*up[1]]; };
  const shF=T(3.6,12.2), shB=T(-3.2,12.4);
  const C=T(1.6+(P.headX||0), 22.4+(P.headBob||0));
  const tl=P.tilt||0, ct=Math.cos(tl), st=Math.sin(tl);
  const Hp=(dx,dy)=>[C[0]+dx*ct-dy*st, C[1]+dx*st+dy*ct];
  const sc=P.scarf||{droop:1.1,ph:0,amp:0.25,len:1};
  const sp=P.spread??0.15, sway=P.cloak||0, flare=P.flare||0, ph=sc.ph||0, flap=P.flap||0;

  // 1. far wing, the ponytail, the shawl of light trailing behind
  drawRainbowWing(B,T(-0.8,11.6),sp,lean,sway,-0.2,0.85,flap);
  { let p=Hp(-4.6,-1); const segs=[];
    for (let i=1;i<=7;i++){ const th=Math.PI-sc.droop*1.15+0.12*i*sc.droop+sc.amp*Math.sin(sc.ph+i*0.9)*(i/7);
      const q=[p[0]+Math.cos(th)*2.8*sc.len, p[1]+Math.sin(th)*2.8*sc.len]; segs.push([...p,...q,3.4-i*0.32,3.4-(i+1)*0.32]); p=q; }
    caps(B,segs,'ihair',{bias:-0.08}); }
  drawRainbowWing(B,T(-3.2,12),sp,lean,sway,0,1,flap);

  // 2. back arm with the pitcher
  const arm=(sh,a,e)=>{ const d1=[Math.sin(a),Math.cos(a)], el=[sh[0]+d1[0]*5, sh[1]+d1[1]*5], a2=a+e, d2=[Math.sin(a2),Math.cos(a2)], hd=[el[0]+d2[0]*5, el[1]+d2[1]*5]; return {el,hd,d2}; };
  const drawArm=(sh,g,bias)=>{ caps(B,[[sh[0],sh[1],g.el[0],g.el[1],2,1.8],[g.el[0],g.el[1],g.hd[0],g.hd[1],1.8,1.5]],'skin',{bias});
    const b=[g.hd[0]-g.d2[0]*2.2,g.hd[1]-g.d2[1]*2.2]; caps(B,[[...b,...b,1.9,1.9]],'gold',{bias:bias+0.05}); };
  const AB=arm(shB,P.shB,P.elB);
  drawArm(shB,AB,-0.14);
  drawPitcher(B,[AB.hd[0]+0.6,AB.hd[1]+3],(P.pour||0)+lean*0.5,1);
  ell(B,AB.hd[0],AB.hd[1],1.8,1.7,'skin',{bias:-0.12});

  // 3. legs: bare, gold-laced sandals
  const leg=(hip,foot,toe,bias)=>{
    const [knee,ank]=ik(hip,foot,6.2,6.6);
    caps(B,[[hip[0],hip[1],knee[0],knee[1],2.4,1.9],[knee[0],knee[1],ank[0],ank[1],1.9,1.4]],'skin',{bias});
    const tc=Math.cos(toe), ts=Math.sin(toe);
    ell(B,ank[0]+1.5*tc-1.4*ts, ank[1]+1.5*ts+1.4*tc,3,1.4,'gold',{rot:toe,bias:bias-0.1});
    const dx=ank[0]-knee[0], dy=ank[1]-knee[1], L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L;
    for (const k of [0.45,0.7,0.92]) put(B,knee[0]+ux*L*k,knee[1]+uy*L*k,ci('gold',3));
    feather(B,ank[0]-1.3,ank[1]+0.3,Math.PI+1.1,3.8,1.2,'rbb',{quill:false,bias});
  };
  leg(T(-2,-0.4),[OX+P.footB[0],OY+P.footB[1]],P.toeB||0,-0.15);
  leg(T(2,-0.8),[OX+P.footF[0],OY+P.footF[1]],P.toeF||0,0);

  // 4. chiton: short pleated skirt, belted bodice, aqua sash across the chest
  { const fl=flare*2.5, sw=sway*3;
    poly(B,TL([[-5.6,4],[5.6,4],[7.6+fl*0.4,-6.6-fl*0.3],[3,-7.6],[-2,-7.2],[-7.8-fl-sw,-6.2+fl*0.5]]),'pearl',{},(x,y)=>{ const [u,v]=loc(x,y); return clamp(0.5+0.12*Math.sin(u*1.6)+u*0.02,0,1); });
    pline(B,...T(-7.4-fl-sw,-5.8+fl*0.5),...T(7.2+fl*0.4,-6.3-fl*0.3),ci('aqua',3));
    for (const u of [-3,1,4.6]) pline(B,...T(u,2.6),...T(u*1.2,-6.2),ci('pearl',1)); }
  poly(B,TL([[-5.6,13],[5.4,13],[5.4,8],[4.6,3.2],[-4.8,3.2],[-5.4,8]]),'pearl',{},
    (x,y)=>{ const [u,v]=loc(x,y); return sphereShade(clamp(u/7,-0.95,0.95), v>8?-0.2:0.1); });
  poly(B,TL([[-5.4,12.6],[-3,13],[5.4,5.2],[5,3.6]]),'aqua',{},()=>0.6);
  poly(B,TL([[-5,4.6],[4.8,4.6],[4.8,2.8],[-5,2.8]]),'gold',{outline:false},(x,y)=>{ const [u]=loc(x,y); return u>-1?0.8:0.45; });
  stamp(B,...T(3.4,12),['.g.','gog','.g.'],{g:['gold',3],o:['rbr',3]});

  // 5. head: face, hair swept back, gold diadem with a rainbow star
  caps(B,[[...Hp(0.6,7),...T(1.2,13.4),1.9,2.1]],'skin',{bias:-0.1});
  ell(B,...Hp(-1.2,-1.8),7.2,7,'ihair',{rot:tl,bias:-0.1});
  poly(B,[Hp(0,-4.4),Hp(5.6,-4.2),Hp(6.8,-1),Hp(7.4,1.6),Hp(6.6,2.4),Hp(6.4,4),Hp(4.4,6.2),Hp(1.6,6.4),Hp(-0.4,3)],'skin',{},(x,y)=>{ const dx=x-C[0], dy=y-C[1]; return sphereShade(clamp((dx-3)/5,-0.95,0.95),clamp(dy/7,-0.9,0.9)); });
  { const e=Hp(4.6,-0.6); dotPx(B,e[0],e[1],ci('ihair',0)); dotPx(B,e[0]+0.5,e[1],ci('ihair',0)); dotPx(B,e[0],e[1]+0.5,ci('rbv',2)); dotPx(B,e[0]+0.5,e[1]+0.5,ci('rbb',3));
    const m=Hp(5.4,3.6); dotPx(B,m[0],m[1],ci('rbr',2)); dotPx(B,m[0]+0.5,m[1],ci('rbr',2)); }
  // fringe and side hair over the ear
  poly(B,[Hp(-4,-7.2),Hp(3,-7.6),Hp(6.4,-5.4),Hp(6.2,-3.6),Hp(3.4,-4.6),Hp(1,-3),Hp(0.6,4.6),Hp(-2.4,5.4),Hp(-4.6,2.8)],'ihair',{},(x,y)=>{ const dx=x-C[0]; return clamp(0.3+dx*0.04,0,1); });
  caps(B,[[...Hp(-5.6,-4),...Hp(1,-7.2),0.9,0.9],[...Hp(1,-7.2),...Hp(6,-5.4),0.9,0.8]],'gold',{bias:0.05});
  stamp(B,...Hp(5.2,-6),['.r.','oyg','.b.'],{r:['rbr',3],o:['rbo',3],y:['rby',4],g:['rbg',3],b:['rbb',3]});


  // 6. front arm, and the ribbon of light from her hand
  const AF=arm(shF,P.shF,P.elF);
  if (P.smear) smear(B,AF.hd[0],AF.hd[1],8,8+(P.rib||16),P.smear[0],P.smear[1]);
  drawArm(shF,AF,0);
  ell(B,AF.hd[0],AF.hd[1],1.9,1.8,'skin');
  const rl=P.rib??0, rph=(P.ribPh??ph);
  if (rl>0) drawRibbon(B,AF.hd,P.staff,rl,rph,P.ribAmp??0.35,1.3,P.curl||0);
  else { // at rest the ribbon hangs from the hand in a loose loop
    drawRibbon(B,AF.hd,Math.PI-0.3+Math.sin(rph)*0.1,26,rph,0.22,1.1,2.1); }
  if (P.spark){ const tip=[AF.hd[0]+Math.sin(P.staff)*(rl||10), AF.hd[1]-Math.cos(P.staff)*(rl||10)];
    stamp(B,tip[0],tip[1],['....w....','..w.w.w..','...www...','wwwwowwww','...www...','..w.w.w..','....w....'],{w:['smear',4],o:['rby',4]}); }
}
