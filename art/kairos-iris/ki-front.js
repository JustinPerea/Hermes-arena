function drawKairosFront(B,P={}){
  const {E,C,PL,F,L,D}=frontKit(B), b=P.b||0, ph=P.ph||0, tb=b*0.5, hb=b*1.0;
  const sym=f=>{ f(-1); f(1); };
  // 1. mantle behind him, and the hood's back
  PL([[-14,58],[14,58],[17.5,30],[16,6+Math.sin(ph)*0.5],[0,4],[-16,6+Math.sin(ph+1)*0.5],[-17.5,30]],'robe',{},(x,y)=>clamp(0.18+0.06*Math.sin(x*0.8)+0.003*y,0,1),tb);
  // 2. feet under the hem
  sym(s=>{ E(s*6.4,2.4,4,2.2,'wood',{bias:s<0?-0.1:0}); E(s*6.2,3.6,2.4,1.6,'skin',{bias:s<0?-0.12:0}); });
  // 3. the robe, flaring to the hem; a sand stole down the front
  PL([[-12.2,57],[12.2,57],[13,40],[15.4,10],[14.6,4.6],[0,3.6],[-14.6,4.6],[-15.4,10],[-13,40]],'robe',{},(x,y)=>sphereShade(clamp(x/16,-0.95,0.95),clamp((40-y)/40,-0.5,0.6)),tb);
  for (const u of [-8.6,8.4]) L(u,36,u*1.25,6,ci('robe',1),tb);
  L(-14.6,5,14.6,5,ci('sand',3),tb);
  for (let k=-5;k<=5;k++) if (k) D(k*2.5,6.6,ci('glow',k%2?3:4),tb);
  sym(s=>{ PL([[s*1.2,56],[s*4.6,56],[s*5.4,4.6],[s*2,4.4]],'sand',{},(x)=>clamp(0.55+x*0.025,0,1),tb);
    for (const y of [50,42,28,18,10]) D(s*3.3,y,ci('glow',4),tb); });
  stamp(B,FX,FY-23+tb,['.g.','g.g','.g.'],{g:['glow',3]});
  // 4. rope sash with the hourglass charm
  C([[-12.8,41,0,39.4,1.5,1.5],[0,39.4,12.8,41,1.5,1.5]],'sand',{bias:-0.05},tb);
  C([[3.6,39.4,4.4,32,0.7,0.7]],'sand',{},tb);
  stamp(B,FX+4.6,FY-28.6+tb,['ggg','.y.','.y.','yyy','ggg'],{g:['gold',3],y:['glow',3]});
  // 5. sleeves: the left hand rests on the sash, the right holds the staff out
  { const sh=[13.4,54], el=[16.6,44], hd=[10.4,38.6];
    C([[...sh,...el,3.8,3.6]],'robe',{bias:0.02},tb); C([[...el,hd[0]+2,hd[1]+1,3.5,4.4]],'robe',{bias:0.04},tb);
    L(hd[0]+4.6,hd[1]+5.2,hd[0]+0.2,hd[1]-1.4,ci('sand',3),tb); E(hd[0],hd[1],2.7,2.5,'skin',{},tb); }
  // 6. hood and face: shadow, glowing eyes, the long beard
  E(0,72,12.6,12.2,'robe',{bias:-0.06,nk:0.9},hb);
  PL([[-3.8,82.6],[3.8,82.6],[0,87.4]],'robe',{},()=>0.35,hb);
  PL([[-8.6,77],[0,79.6],[8.6,77],[9.4,68],[8,60.6],[0,58.2],[-8,60.6],[-9.4,68]],'robe',{oc:ci('robe',0)},()=>10,hb);
  sym(s=>{ D(s*3.6,69.4,ci('glow',4),hb); D(s*3.6+0.5,69.4,ci('glow',4),hb); D(s*3.6,69,ci('glow',3),hb); D(s*3.6+0.5,69,ci('glow',3),hb); D(s*3.6-s*0.5,69.4,ci('glow',2),hb); });
  PL([[-6.8,65.6],[6.8,65.6],[7.6,58],[5.4,50],[2.2,44.4],[0,42.6],[-2.2,44.4],[-5.4,50],[-7.6,58]],'wingw',{},(x,y)=>clamp(0.45+x*0.02+(y-55)*0.01,0,1),hb);
  for (const u of [-3.4,0,3.4]) L(u,62,u*0.6,47.6,ci('wingw',1),hb);
  sym(s=>C([[0.6*s,66.4,6.2*s,64.6,1.2,0.8]],'wingw',{bias:0.1},hb));
  C([[-9.2,64,-9.6,72],[-9.6,72,-5,79.4],[-5,79.4,0,80.4],[0,80.4,5,79.4],[5,79.4,9.6,72],[9.6,72,9.2,64]].map(g=>[...g,0.85,0.85]),'gold',{bias:0.05},hb);
  D(-6,82,ci('glow',4),hb); D(7,79.6,ci('glow',3),hb);
  // 7. the orrery staff, planted, and the arm that holds it
  { const sx=-26;
    C([[sx,2,sx,88,1.25,1.25]],'wood',{bias:0.05},tb); E(sx,2,1.6,1.6,'gold',{},tb);
    C([[sx,88,sx-3,92,0.8,0.7],[sx,88,sx+3,92,0.8,0.7]],'gold',{},tb); C([[sx,87,sx,89,1.6,1.6]],'gold',{},tb);
    drawOrrery(B,[FX+sx,FY-95+tb],ph*0.5,1.25,0); }
  { const sh=[-13.4,54], el=[-20.6,45.4], hd=[-25.6,48];
    C([[...sh,...el,3.8,3.6]],'robe',{bias:-0.12},tb); C([[...el,hd[0]+2.2,hd[1]-0.8,3.5,4.4]],'robe',{bias:-0.1},tb);
    E(hd[0]-0.2,hd[1],3,2.9,'skin',{bias:-0.05},tb); for (const y of [-1,0.6]) L(hd[0]-2.4,hd[1]+y,hd[0]+1.6,hd[1]+y,ci('skin',1),tb); }
  sym(s=>E(s*12.4,55.2,5.4,3.8,'robe',{bias:s<0?-0.08:0.06},tb));
}
function drawIrisFront(B,P={}){
  const {E,C,PL,F,L,D}=frontKit(B), b=P.b||0, ph=P.ph||0, tb=b*0.5, hb=b*1.0, sp=P.spread||0;
  const sym=f=>{ f(-1); f(1); };
  // 2. rainbow wings arched behind her shoulders
  sym(s=>{ const base=[s*5,52], wr=[s*(16+sp*3),70+sp], tip=[s*(21+sp*4),76+sp];
    const at=t=>t<0.6?[base[0]+(wr[0]-base[0])*t/0.6,base[1]+(wr[1]-base[1])*t/0.6]:[wr[0]+(tip[0]-wr[0])*(t-0.6)/0.4,wr[1]+(tip[1]-wr[1])*(t-0.6)/0.4];
    for (let i=10;i>=0;i--){ const t=i/10, q=at(t); F(q[0],q[1],s*(0.08+t*0.46+sp*0.25)+Math.sin(ph+i*0.5)*0.01,16+t*20,3.2,t>0.55?'rbv':'rbb',{lit:s,bias:-0.06-(i%2)*0.06,sb:-0.02},tb); }
    for (let i=9;i>=0;i--){ const t=i/9, q=at(t); F(q[0],q[1],s*(0.16+t*0.42+sp*0.2),9+t*7,2.8,t>0.5?'rbg':'rby',{lit:s,quill:false,bias:0.04},tb); }
    for (let i=8;i>=0;i--){ const t=i/8, q=at(t); F(q[0],q[1],s*(0.24+t*0.4),5+t*3,2.3,'rbo',{lit:s,quill:false,bias:0.12},tb); }
    C([[...base,...wr,1.8,1.6],[...wr,...tip,1.6,1.1]],'rbr',{bias:0.14},tb); });
  // 3. long hair falling behind the shoulders
  PL([[-9.6,72],[9.6,72],[11.6,56],[10.4,42+Math.sin(ph)*0.6],[-10.4,42+Math.sin(ph+1)*0.6],[-11.6,56]],'ihair',{},(x)=>clamp(0.25+x*0.02,0,1),hb);
  // 4. legs: bare, gold-laced sandals with little rainbow wings
  sym(s=>{ const bias=s<0?-0.12:0.02, hp=[s*4.4,32], kn=s<0?[-5.6,19]:[4,18.6], an=s<0?[-5.8,5.2]:[6.6,5.6];
    const mid=[(kn[0]+an[0])/2+0.3*s,12]; C([[...hp,...kn,3.7,2.7],[...kn,...mid,2.7,2.5],[...mid,...an,2.5,1.8]],'skin',{bias});
    E(an[0]+s*0.4,2.4,3.6,2.2,'gold',{bias:bias-0.08});
    for (const y of [8,11.5,15]) L(an[0]-2.2,y-1,an[0]+2.2,y+1,ci('gold',3));
    [[0.6,7],[1.0,5.6]].forEach(([a,l],i)=>F(an[0]+s*2.2,an[1]+2,upA(s*a),l,2,i?'rbv':'rbb',{lit:s,quill:false,bias})); });
  // 5. chiton: short pleated skirt, belt, bodice and an aqua sash
  PL([[-8.4,40],[8.4,40],[12.4,21.6+Math.sin(ph)*0.4],[-12.4,21.6+Math.sin(ph+2)*0.4]],'pearl',{},(x,y)=>clamp(0.5+0.1*Math.sin(x*1.4)+x*0.012,0,1),tb);
  for (const u of [-6,-2,2,6]) L(u,38.6,u*1.4,23,ci('pearl',1),tb);
  L(-12.2,22.4,12.2,22.4,ci('aqua',3),tb); L(-12,23.2,12,23.2,ci('aqua',2),tb);
  PL([[-10.2,54.6],[10.2,54.6],[9.2,46],[8.4,39.6],[-8.4,39.6],[-9.2,46]],'pearl',{},(x,y)=>sphereShade(clamp(x/11,-0.95,0.95),y>50?-0.2:0.15),tb);
  PL([[-9.8,52.6],[-6.4,54.4],[9,42.4],[7,40.6]],'aqua',{},(x)=>clamp(0.6+x*0.01,0,1),tb);
  PL([[-8.8,42],[8.8,42],[8.8,39.2],[-8.8,39.2]],'gold',{outline:false},(x)=>x>-2?0.8:0.45,tb);
  stamp(B,FX-7.2,FY-52+tb,['.g.','gog','.g.'],{g:['gold',3],o:['rbr',3]});
  // 6. arms: the pitcher at her side, the other hand lifting the ribbon
  { const sh=[-11.6,52.6], el=[-14.2,43.4], hd=[-14.6,35.4];
    C([[...sh,...el,2.8,2.4],[...el,...hd,2.4,2]],'skin',{bias:-0.1},tb); C([[hd[0],hd[1]+3,hd[0],hd[1]+3,2.4,2.4]],'gold',{},tb);
    E(hd[0],hd[1],2.3,2.2,'skin',{bias:-0.06},tb);
    const pc=[FX+hd[0]-0.4,FY-hd[1]+6.4+tb]; drawPitcher(B,pc,0.06,1.35); }
  { const sh=[11.6,52.6], el=[17.4,45.6], hd=[23.6,49.6];
    C([[...sh,...el,2.8,2.4],[...el,...hd,2.4,2]],'skin',{},tb); C([[el[0]+2.6,el[1]+1.4,el[0]+2.6,el[1]+1.4,2.3,2.3]],'gold',{},tb);
    E(hd[0],hd[1],2.3,2.2,'skin',{},tb); }
  drawRibbon(B,[FX+23.6,FY-49.6+tb],1.0,44,ph,0.16,1.25,-2.6);
  sym(s=>E(s*10.4,53.4,3.2,2,'pearl',{bias:s<0?-0.1:0.06},tb));
  // 7. head: neck, face, hair parted in the middle, gold diadem with a rainbow star
  C([[0,57,0,54,2,2.4]],'skin',{bias:-0.25},hb);
  E(0,65.4,9.6,9.4,'ihair',{bias:-0.08},hb);
  E(0,62.6,6.3,6.9,'skin',{},hb);
  PL([[-7.6,73.6],[7.6,73.6],[8,67.4],[4.6,69],[0,67.4],[-4.6,69],[-8,67.4]],'ihair',{},(x)=>clamp(0.3+x*0.03,0,1),hb);
  sym(s=>{ PL([[s*5.6,69],[s*8.4,68.4],[s*8.8,58],[s*7.4,54],[s*6,58],[s*6.2,64]],'ihair',{},()=>s<0?0.25:0.5,hb);
    for (const dx of [-0.5,0,0.5]){ D(s*2.8+dx,63.6,ci('ihair',0),hb); D(s*2.8+dx,63.1,ci(dx*s>0?'rbv':'rbb',dx?2:3),hb); D(s*2.8+dx,62.6,ci('rbb',dx?2:3),hb); } D(s*3.6,60.6,ci('rbr',4),hb); });
  D(0,58.6,ci('rbr',2),hb); D(0.5,58.6,ci('rbr',2),hb); D(-0.5,58.6,ci('rbr',1),hb);
  C([[-8.2,70.6,0,72.8,0.9,0.9],[0,72.8,8.2,70.6,0.9,0.9]],'gold',{bias:0.05},hb);
  stamp(B,FX,FY-73.4+hb,['..r..','.oyo.','rygbr','.gbg.','..v..'],{r:['rbr',3],o:['rbo',3],y:['rby',4],g:['rbg',3],b:['rbb',3],v:['rbv',3]});
}
window.drawKairosFront=drawKairosFront; window.drawIrisFront=drawIrisFront;
