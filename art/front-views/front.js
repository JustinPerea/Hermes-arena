// ---- front views (fighter select, results, HUD portraits) ----
// Larger than the fight sprites but on the same pixel grid, palette and shading, so they can be shown unscaled.
// Coordinates are from the feet, y up. P.b = breath 0..1, P.ph = phase, P.wing = helmet wing sway
const FW=128, FH=116, FX=64, FY=108;
function frontKit(B){
  const E=(x,y,rx,ry,m,o,d=0)=>ell(B,FX+x,FY-y+d,rx,ry,m,o||{});
  const C=(segs,m,o,d=0)=>caps(B,segs.map(g=>[FX+g[0],FY-g[1]+d,FX+g[2],FY-g[3]+d,g[4],g[5]]),m,o||{});
  const PL=(pts,m,o,sh,d=0)=>poly(B,pts.map(q=>[FX+q[0],FY-q[1]+d]),m,o||{},sh?((x,y)=>sh(x-FX,FY-y+d)):undefined);
  const F=(x,y,a,len,w,m,o,d=0)=>feather(B,FX+x,FY-y+d,a,len,w,m,o||{});
  const L=(x0,y0,x1,y1,c,d=0)=>pline(B,FX+x0,FY-y0+d,FX+x1,FY-y1+d,c);
  const D=(x,y,c,d=0)=>dotPx(B,FX+x,FY-y+d,c);
  return {E,C,PL,F,L,D};
}
const upA=a=>Math.PI-a;          // feather pointing up, tilted a radians toward +x
function drawHermesFront(B,P={}){
  const {E,C,PL,F,L,D}=frontKit(B), b=P.b||0, ph=P.ph||0, tb=b*0.5, hb=b*1.0, wg=P.wing||0;
  const sym=f=>{ f(-1); f(1); };
  // 1. feather cloak: long blue layer, then the cream mantle on the shoulders
  sym(s=>{ for (let k=8;k>=0;k--) F(s*(2.5+k*1.75),55,s*(0.04+k*0.058)+Math.sin(ph+k*0.7)*0.012,41-k*1.5,4.3,'cloak',{lit:s,bias:-0.06-(k%2)*0.05},tb); });
  sym(s=>{ for (let k=4;k>=0;k--) F(s*(9+k*2.3),55,s*(0.2+k*0.1),22-k*1.2,3.7,'cream',{lit:s,bias:-0.04},tb); });
  // 3. legs: blue hose, gold greaves, winged sandals
  sym(s=>{ const bias=s<0?-0.12:0.02, hp=[s*5,35], kn=[s*6.4,23.4], an=[s*7.4,5.4];
    C([[...hp,...kn,4.3,3.5]],'tunic',{bias});
    [[0.5,9.5],[0.86,8],[1.2,6.5]].forEach(([a,l],i)=>F(an[0]+s*2.2,an[1]+2.6,upA(s*a),l,2.5,'cream',{lit:s,quill:i>0?false:undefined,bias:bias+0.04}));
    E(s*8,2.6,4.6,2.8,'leather',{bias:bias-0.02}); L(s*8-3,3.8,s*8+3,3.8,ci('leather',0)); E(s*8.1,1.4,1.9,1.1,'gold',{bias:bias+0.08});
    C([[kn[0],kn[1]-2,s*6.9,16,3,3.4],[s*6.9,16,an[0],an[1]+0.6,3.4,2.3]],'gold',{bias});
    L(kn[0]-s*0.3,kn[1]-4,an[0]-s*0.3,an[1]+1.5,ci('gold',4));
    PL([[kn[0]-3.5,kn[1]+1.2],[kn[0],kn[1]+3.4],[kn[0]+3.5,kn[1]+1.2],[kn[0]+3.1,kn[1]-2.4],[kn[0]-3.1,kn[1]-2.4]],'gold',{},(x)=>clamp(0.62+(x-kn[0])*0.07+bias,0,1));
    L(kn[0]-3,kn[1]-2.2,kn[0]+3,kn[1]-2.2,ci('gold',1)); E(an[0]+s*2.1,an[1]+2,1.5,1.5,'gold',{bias}); });
  // 4. skirt, torso, belt, tabard
  PL([[-9.4,42],[9.4,42],[13.2,30.6],[-13.2,30.6]],'tunic',{},(x,y)=>clamp(0.42+x*0.022-(y<34?0.1:0),0,1),tb);
  for (const u of [-7.4,-3.8,3.8,7.4]) L(u,40.5,u*1.4,32.8,ci('tunic',1),tb);
  PL([[-12.7,32.6],[12.7,32.6],[13.2,30.6],[-13.2,30.6]],'gold',{outline:false},(x)=>x>-3?0.8:0.5,tb);
  PL([[-12.6,57.5],[12.6,57.5],[11.8,50],[9.4,44],[9.4,41],[-9.4,41],[-9.4,44],[-11.8,50]],'tunic',{},(x,y)=>sphereShade(clamp(x/14,-0.95,0.95),y>52?-0.3:0.1),tb);
  stamp(B,FX,FY-50.5+tb,['g.......g','gg.....gg','ggg.g.ggg','.ggggggg.','..ggggg..','...ggg...','..g.g.g..'],{g:['gold',3]});
  PL([[-9.8,44.6],[9.8,44.6],[9.8,40.6],[-9.8,40.6]],'leather',{},(x)=>clamp(0.5+x*0.03,0,1),tb);
  for (const u of [-7,-4.4,4.4,7]) D(u,42.6,ci('gold',4),tb);
  PL([[-4.2,40.8],[4.2,40.8],[4.2,26.8],[0,22.6],[-4.2,26.8]],'gold',{},()=>0.75,tb);
  PL([[-2.9,40.4],[2.9,40.4],[2.9,27.4],[0,24.6],[-2.9,27.4]],'tunic',{outline:false},(x)=>clamp(0.38+x*0.04,0,1),tb);
  L(0,38,0,27.5,ci('cream',3),tb);
  for (const y of [36.6,33.8,31]) for (const s of [-1,1]) L(0,y-1.6,s*1.7,y,ci('cream',3),tb);
  E(0,42.6,3,3,'gold',{},tb); E(0,42.6,1.3,1.3,'orb',{},tb);
  // 5. cowl scarf with a tail over the left shoulder
  { const w=k=>Math.sin(ph+k)*0.8; C([[9,59,15,61+w(0),2.2,2],[15,61+w(0),20.5,59.6+w(1),2,1.7],[20.5,59.6+w(1),26,61.4+w(2),1.7,1.3],[26,61.4+w(2),31,60+w(3),1.3,0.7]],'scarf',{bias:0.02},tb); }
  // 6. arms: the right holds the staff out, the left hangs in a loose fist
  sym(s=>{ for (let j=0;j<3;j++) F(s*(12+j*2.6),53.5,s*(0.25+j*0.2),8.5,2.6,'cream',{lit:s,quill:false,bias:-0.02},tb); });
  { const sh=[14.6,53.5], el=[18.2,43.6], hd=[18.8,33.6];
    C([[...sh,...el,3.7,3.2]],'tunic',{bias:0},tb); C([[...el,hd[0],hd[1]+2,3.2,2.8]],'gold',{bias:0},tb);
    L(el[0]-2.6,el[1]-2.4,el[0]+2.8,el[1]-2.4,ci('gold',4),tb);
    E(hd[0],hd[1]-0.6,3.1,3,'skin',{},tb); for (const x of [-1,0.7]) L(hd[0]+x,hd[1]-3,hd[0]+x,hd[1]-1,ci('skin',1),tb); }
  sym(s=>{ E(s*15.2,56,6.3,5.1,'gold',{bias:s<0?-0.1:0.04},tb); E(s*12.2,54.6,1.4,1.4,'orb',{},tb);
    L(s*10.6,52.2,s*20,53.2,ci('gold',1),tb); });
  E(0,58,11.6,4.4,'scarf',{bias:-0.1},tb);
  E(0,56.6,8.6,3.6,'scarf',{bias:0.04},tb);
  L(-7.5,57.6,-2,55.4,ci('scarf',1),tb); L(7.5,57.6,2,55.4,ci('scarf',1),tb);
  // 7. head: winged kettle helmet, eyes in shadow, scarf mask
  sym(s=>{ [[0.18,25],[0.46,23],[0.76,19.5],[1.06,15],[1.34,10.5]].forEach(([a,l],i)=>F(s*(8.2+i*0.5),75-i*0.4,upA(s*(a+wg)),l,4,'cream',{lit:s,bias:-0.05-i*0.03},hb));
    [[0.32,12],[0.66,11],[1.0,9.5],[1.3,7]].forEach(([a,l])=>F(s*8.6,74.6,upA(s*(a+wg)),l,3.1,'cream',{lit:s,quill:false,bias:0.12},hb)); });
  E(0,73.2,11.2,9.6,'steel',{bias:-0.12,nk:0.9},hb);
  sym(s=>PL([[s*6.2,69.4],[s*11.4,69.4],[s*10.6,61.8],[s*7.2,59.8]],'steel',{},()=>s<0?0.3:0.62,hb));
  E(0,64.6,7.5,6.4,'skin',{},hb);
  PL([[-7.6,69.6],[7.6,69.6],[7.4,65.4],[-7.4,65.4]],'skin',{outline:false,flat:10},null,hb);
  for (const s of [-1,1]){ const ex=s*3.5; for (const dx of [-0.5,0,0.5]) for (const dy of [0,0.5]) D(ex+dx,67.2+dy,ci('orb',dx*s>0?3:4),hb); D(ex-s*1,67.2,ci('orb',2),hb); }
  PL([[-7.7,65.6],[7.7,65.6],[8,62.4],[5.2,58.6],[-5.2,58.6],[-8,62.4]],'scarf',{},(x,y)=>sphereShade(clamp((x-0.5)/8,-0.95,0.95),clamp((62.5-y)/5,-0.9,0.9)),hb);
  L(-6.4,62,-2.4,60.2,ci('scarf',1),hb); L(6.4,62,2.6,60.2,ci('scarf',1),hb); L(0.5,65,0.9,63,ci('scarf',4),hb);
  C([[-15.2,71,0,69.8,1.5,1.7],[0,69.8,15.2,71,1.7,1.5]],'gold',{bias:-0.02,nk:0.7},hb);
  
  C([[0,82.4,0,73,1.1,1.25]],'gold',{bias:0.05},hb);
  for (const u of [-11,-5.5,5.5,11]) D(u,70.6,ci('gold',4),hb);
  sym(s=>E(s*9.3,74.4,2.4,2.4,'gold',{bias:s<0?-0.1:0.05},hb));
  // 8. the caduceus, planted at arm's length, and the arm that holds it
  { const sx=-26, top=84;
    for (const s of [-1,1]) [[1.32,13.5],[1.02,11.5],[0.7,9]].forEach(([a,l],i)=>F(sx+s*1.4,top-5.5,upA(s*a),l,2.9,'gold',{lit:s,quill:false,bias:0.05-i*0.05},tb));
    C([[sx,1.5,sx,top-4,1.35,1.35]],'gold',{},tb); E(sx,1.6,2.1,2.1,'gold',{},tb);
    const a=[], c=[]; let pa=null, pc=null;
    for (let i=0;i<=10;i++){ const y=top-25+i*1.9, o=Math.sin(i*0.95+0.5)*(3.2-i*0.06); if (pa){ a.push([pa[0],pa[1],sx+o,y,1.05,1.05]); c.push([pc[0],pc[1],sx-o,y,1.05,1.05]); } pa=[sx+o,y]; pc=[sx-o,y]; }
    C(a.concat(c),'gold',{bias:-0.2},tb);
    E(sx-3,top-5.6,1.7,1.4,'gold',{},tb); E(sx+3,top-5.6,1.7,1.4,'gold',{},tb);
    E(sx,top-3.2,2.9,1.7,'gold',{},tb); E(sx,top+1.4,4.4,4.4,'orb',{},tb); }
  { const sh=[-14.6,53.5], el=[-20.4,44.6], hd=[-25.6,47.8];
    C([[...sh,...el,3.7,3.2]],'tunic',{bias:-0.12},tb); C([[...el,hd[0]+1.6,hd[1]-0.6,3.2,2.8]],'gold',{bias:-0.1},tb);
    E(hd[0]-0.4,hd[1],3.1,3,'skin',{bias:-0.05},tb); for (const y of [-1,0.6]) L(hd[0]-2.4,hd[1]+y,hd[0]+1.6,hd[1]+y,ci('skin',1),tb); }
  E(-15.2,56,6.3,5.1,'gold',{bias:-0.1},tb); E(-12.2,54.6,1.4,1.4,'orb',{},tb); L(-10.6,52.2,-20,53.2,ci('gold',1),tb);
}
function drawAethonFront(B,P={}){
  const {E,C,PL,F,L,D}=frontKit(B), b=P.b||0, ph=P.ph||0, tb=b*0.5, hb=b*1.0, sp=P.spread||0;
  const sym=f=>{ f(-1); f(1); };
  // 1. wings arched behind the shoulders: long primaries, then two rows of coverts
  sym(s=>{ const base=[s*6,54], wr=[s*(19+sp*3),78+sp], tip=[s*(24.5+sp*4),83+sp];
    const at=t=>t<0.6?[base[0]+(wr[0]-base[0])*t/0.6,base[1]+(wr[1]-base[1])*t/0.6]:[wr[0]+(tip[0]-wr[0])*(t-0.6)/0.4,wr[1]+(tip[1]-wr[1])*(t-0.6)/0.4];
    for (let i=11;i>=0;i--){ const t=i/11, q=at(t); F(q[0],q[1],s*(0.06+t*0.44+sp*0.25)+Math.sin(ph+i*0.5)*0.01,19+t*25,3.6,'wingw',{lit:s,bias:-0.1-(i%2)*0.06,sb:-0.04},tb); }
    for (let i=10;i>=0;i--){ const t=i/10, q=at(t); F(q[0],q[1],s*(0.14+t*0.42+sp*0.2),11+t*8,3.1,'wingw',{lit:s,quill:false,bias:0.02},tb); }
    for (let i=9;i>=0;i--){ const t=i/9, q=at(t); F(q[0],q[1],s*(0.22+t*0.4),6+t*3,2.6,'wingw',{lit:s,quill:false,bias:0.14},tb); }
    C([[...base,...wr,2.8,2.5],[...wr,...tip,2.5,1.7]],'wingw',{bias:0.16},tb); });
  // 2. crimson cape
  PL([[-12.6,57],[12.6,57],[14.6,34],[13.4,21.5+Math.sin(ph)*0.5],[7,23],[0,21],[-7,23],[-13.4,21.5+Math.sin(ph+1)*0.5],[-14.6,34]],'crimson',{},(x,y)=>clamp(0.3+0.12*Math.sin(x*0.9)+0.004*(y-20),0,1),tb);
  // 3. legs: bare thighs, bronze greaves, sandals
  sym(s=>{ const bias=s<0?-0.12:0.02, hp=[s*5,35], kn=[s*6.3,23.6], an=[s*7.3,5.4];
    C([[...hp,...kn,4.2,3.3]],'skin',{bias});
    E(s*7.9,2.5,4.5,2.6,'leather',{bias:bias-0.05}); L(s*7.9-3,3.9,s*7.9+3,3.9,ci('leather',0)); L(s*7.9,4.2,s*7.9,1,ci('leather',0));
    C([[kn[0]+s*0.1,kn[1]-3.2,s*6.8,16,2.9,3.5],[s*6.8,16,an[0],an[1]+0.6,3.5,2.3]],'bronze',{bias});
    L(kn[0]-s*0.2,kn[1]-4,an[0]-s*0.2,an[1]+1.5,ci('bronze',4)); });
  // 4. pteruges over a crimson skirt, linen cuirass with a bronze scale band
  PL([[-9.6,42],[9.6,42],[12.6,30],[-12.6,30]],'crimson',{},(x)=>clamp(0.42+x*0.025,0,1),tb);
  for (let k=0;k<9;k++){ const u0=-10.4+k*2.32, f=1.28;
    PL([[u0,41.4],[u0+2.1,41.4],[(u0+2.1)*f+0.1,30.6],[u0*f+0.1,30.6]],k%2?'leather':'cream',{},(x,y)=>clamp(0.5+x*0.025+(y-30)*0.012,0,1),tb);
    D((u0+1.05)*f,32.2,ci('bronze',4),tb); }
  PL([[-12.4,57.5],[12.4,57.5],[11.6,50],[9.8,44],[9.8,41],[-9.8,41],[-9.8,44],[-11.6,50]],'cream',{},(x,y)=>sphereShade(clamp(x/13.5,-0.95,0.95),y>52?-0.3:y<45?0.25:0),tb);
  PL([[-10.2,46.8],[10.2,46.8],[9.8,41.6],[-9.8,41.6]],'bronze',{},(x,y)=>{ const X=Math.round(x+FX), Y=Math.round(y); return ((X+(Y>>1))%3===0)?0.25:0.65+x*0.01; },tb);
  sym(s=>{ PL([[s*4.4,57.5],[s*11.6,57.5],[s*8,48.6],[s*3.6,48.6]],'cream',{},(x)=>clamp(0.72+x*0.012,0,1),tb); L(s*4.4,57,s*3.6,48.8,ci('crimson',2),tb); L(s*3.6,48.6,s*8,48.6,ci('crimson',2),tb); });
  L(-10.2,47.2,10.2,47.2,ci('crimson',2),tb);
  E(0,50.4,2.3,2.3,'bronze',{bias:0.12},tb); E(0,50.4,0.9,0.9,'crimson',{},tb);
  PL([[-10,42.2],[10,42.2],[10,40.4],[-10,40.4]],'leather',{},()=>0.3,tb);
  // 5. neck, left arm, the aspis
  C([[0,60,0,57,2.6,3.2]],'skin',{bias:-0.25},hb);
  C([[14.4,53.5,17.4,44.5,3.7,3.3]],'skin',{},tb);
  { const c=[15.5,37.6];
    E(c[0],c[1],12,13.6,'bronze',{nk:0.85,bias:0.1},tb);
    E(c[0],c[1],9.9,11.5,'crimson',{oc:ci('bronze',0),bias:0.06,nk:0.8},tb);
    for (const s of [-1,1]) [[1.12,9.6],[0.78,8.6],[0.44,6.6]].forEach(([a,l],i)=>F(c[0]+s*0.7,c[1]-4.6,upA(s*a),l,2.2,'wingw',{lit:s,quill:false,oc:ci('crimson',0),bias:0.22-i*0.03},tb)); }
  sym(s=>{ E(s*13.6,55.6,5,3.5,'bronze',{bias:s<0?-0.1:0.04},tb); });
  // 6. Corinthian helmet from the front, crest standing over it
  sym(s=>E(s*7.2,59.6,2.6,3.2,'hair',{},hb));
  { const w=Math.sin(ph)*0.03;
    [[-0.42,10],[0.42,10],[-0.28,13.5],[0.28,13.5],[-0.14,16],[0.14,16],[0,17.5]].forEach(([a,l])=>F(a*4.5,83.4,upA(a+w),l,2.6,'plume',{lit:a<0?-1:1,bias:a===0?0.08:-0.04},hb)); }
  PL([[-2.6,82],[2.6,82],[2.3,84.4],[-2.3,84.4]],'bronze',{},()=>0.7,hb);
  PL([[-1.3,64.4],[1.3,64.4],[1.9,54.8],[-1.9,54.8]],'bronze',{outline:false,flat:10},null,hb);
  { const top=[]; for (let k=0;k<=16;k++){ const a=Math.PI*k/16; top.push([-10.7*Math.cos(a),71.6+10.8*Math.sin(a)]); }
    const right=[[10.5,67],[9.7,62],[8.8,58.6],[7.7,56],[3.9,54.6],[1.25,56.4],[0.8,63.4]], left=right.map(q=>[-q[0],q[1]]).reverse();
    PL(top.concat(right,left),'bronze',{},(x,y)=>sphereShade(clamp(x/11.5,-0.95,0.95),clamp((70-y)/15,-0.9,0.9)),hb); }
  sym(s=>PL([[s*1.7,66.6],[s*4.4,69.3],[s*8.1,69.2],[s*8.7,67.5],[s*5.9,65.1],[s*2.7,64.8]],'bronze',{outline:false,flat:10},null,hb));
  for (const s of [-1,1]){ D(s*4.9,67.1,ci('wingw',4),hb); D(s*4.9+0.5,67.1,ci('wingw',4),hb); D(s*4.9,66.6,ci('wingw',2),hb); D(s*4.9+0.5,66.6,ci('wingw',2),hb); }
  sym(s=>{ L(s*1.4,68,s*4.4,70.3,ci('bronze',4),hb); L(s*4.4,70.3,s*9,70.3,ci('bronze',4),hb); L(s*1.6,65,s*1.1,63.2,ci('bronze',1),hb); L(s*8.6,58.4,s*4.8,55.2,ci('bronze',4),hb); });
  L(0.25,70.4,0.25,63.8,ci('bronze',4),hb);
  // 7. the spear, planted, and the arm that holds it
  { const sx=-26;
    C([[sx,2,sx,84,1.05,1.05]],'leather',{bias:0.05},tb);
    F(sx,5,0,5,1.3,'bronze',{quill:false},tb);
    C([[sx,82.6,sx,85,1.6,1.6]],'bronze',{},tb);
    F(sx,84,Math.PI,13,2.7,'blade',{lit:1},tb); }
  { const sh=[-14.4,53.5], el=[-20.2,44.6], hd=[-25.6,47.8];
    C([[...sh,...el,3.7,3.3]],'skin',{bias:-0.12},tb); C([[...el,hd[0]+1.6,hd[1]-0.6,3.3,2.9]],'leather',{bias:-0.1},tb);
    E(hd[0]-0.4,hd[1],3.1,3,'skin',{bias:-0.05},tb); for (const y of [-1,0.6]) L(hd[0]-2.4,hd[1]+y,hd[0]+1.6,hd[1]+y,ci('skin',1),tb); }
  E(-13.6,55.6,5,3.5,'bronze',{bias:-0.1},tb);
}
// breathing loop of the front view, 8 frames, built on first use
const frontCache={};
function frontFrames(ch){ return frontCache[ch]||(frontCache[ch]=Array.from({length:8},(_,i)=>{ const ph=i/8*TAU, b=(1-Math.cos(ph))/2;
  return bufToCanvas(renderInto(FW,FH,B=>{ (ch==='hermes'?drawHermesFront:drawAethonFront)(B,{b,ph,wing:Math.sin(ph)*0.04,spread:0.06*Math.sin(ph)}); finishSprite(B); }),FW,FH); })); }

