// Drop-1 stages Justin found too simple (2026-11-09). Not loaded; kept for parts.
// ---- 2. Omphalos of Delphi: one long flat terrace, no platforms --------------------------
addMat('dusk', ['#b9785a','#dc9a72','#efbb8c','#f7d8ad','#fcecd0']);
addMat('lime', ['#3a2a22','#8a7260','#b9a184','#dcc8a6','#f6ead0']);
addMat('olive',['#1d2614','#3f5228','#5f763a','#879d58','#b5c584']);
addMat('cliff',['#4e4560','#6f6380','#8f8298','#b0a1ac','#d0c2c0']);
defStage({id:'delphi', name:'DELPHI', full:'OMPHALOS OF DELPHI',
  solids:[{l:92,r:324,t:140}], plats:[], altar:{l:92,r:324,t:140,b:112},
  camb:{x0:-100,x1:VW+100,y0:-170,y1:VH+2}, spawns:[150,266],
  build(s){
    const T=140, L=92, R=324;
    // far: dusk sky, low sun, the distant range
    const farArt=artLayer(s,0.42,(B,LX,LY,LW)=>{
      for (let a=0;a<2000;a++){ if (a%4) continue; const q=a/2000*TAU; dotPx(B,300+Math.cos(q)*40,96+Math.sin(q)*40,ci('dusk',3)); }
      ell(B,300,96,24,24,'dusk',{outline:false,flat:14});
      ell(B,300,96,19,19,'gold',{outline:false,flat:14});
      // two ranges, far one paler
      for (const [base,amp,mat,tone,sd] of [[118,26,'cliff',13,3],[142,30,'cliff',12,9]]){ seed=sd;
        const pts=[[LX,240]]; let y=base; for (let x=LX;x<=LX+LW+8;x+=8){ y=clamp(y+(rnd()-0.5)*amp*0.6,base-amp,base+amp*0.4); pts.push([x,y]); } pts.push([LX+LW+8,240]);
        poly(B,pts,mat,{outline:false},(x,yy)=>tone-((yy-base)>30?0:0)); }
      for (let i=0;i<5;i++){ const bx=150+i*23+rnd()*8, by=50+rnd()*30; pline(B,bx-3,by-1.5,bx,by,ci('cliff',1)); pline(B,bx,by,bx+3,by-1.5,ci('cliff',1)); }
    },{seed:5});
    const far=skyLayer(s,0.42,[[-180,'#8fa6d4'],[-40,'#b4c0dc'],[40,'#e7cfb6'],[100,'#f6d9ad'],[150,'#f0c08e']],farArt);
    // mid: the Phaedriades cliffs, the Temple of Apollo, cypresses and olives
    const mid=artLayer(s,0.72,(B,LX,LY,LW)=>{
      const cliffFace=(x0,x1,top,dir)=>{ const pts=[[x0,240],[x0,top+30]]; seed=x0&255;
        for (let x=x0;x<=x1;x+=5) pts.push([x, top + (dir>0?(x-x0):(x1-x))*0.55 + rnd()*10]); pts.push([x1,240]);
        const fac=[]; for (let i=0;i<26;i++) fac.push([x0+rnd()*(x1-x0), top+rnd()*260, rnd()]);
        poly(B,pts,'cliff',{},(x,y)=>{ let d1=1e9,d2=1e9,k=null; for (const p of fac){ const d=((x-p[0])*1.6)**2+((y-p[1])*0.45)**2; if (d<d1){ d2=d1; d1=d; k=p; } else if (d<d2) d2=d; }
          if (Math.sqrt(d2)-Math.sqrt(d1)<1.2) return 11; return k[2]>0.66?13:k[2]>0.25?12:(dir>0?12:13); }); };
      cliffFace(LX,58,-30,1); cliffFace(358,LX+LW,-40,-1);
      // terraced slope with the temple
      poly(B,[[40,240],[40,170],[90,160],[326,160],[376,170],[376,240]],'lime',{outline:false},(x,y)=>y<162?13:12);
      const st=152; poly(B,[[110,st],[306,st],[310,st+8],[106,st+8]],'lime',{},(x,y)=>y<st+2?14:y<st+5?13:12);
      const cols=[[118,1],[146,1],[174,0.55],[230,1],[258,0.8],[286,1]];
      for (const [x,h] of cols){ const top=st-62*h; stageColumn(B,x,top+5.5,st,10,'lime',{base:false}); if (h<1){ for (let k=0;k<3;k++) dotPx(B,x+2+k*3,top+5,ci('lime',1)); } }
      poly(B,[[112,st-62],[166,st-62],[166,st-54],[112,st-54]],'lime',{},(x,y)=>y<st-60?14:13);
      poly(B,[[224,st-62],[306,st-62],[306,st-54],[224,st-54]],'lime',{},(x,y)=>y<st-60?14:13);
      for (let x=114;x<164;x+=7) poly(B,[[x,st-59],[x+2.5,st-59],[x+2.5,st-55],[x,st-55]],'lime',{outline:false,flat:11});
      for (let x=226;x<304;x+=7) poly(B,[[x,st-59],[x+2.5,st-59],[x+2.5,st-55],[x,st-55]],'lime',{outline:false,flat:11});
      // fallen drums
      ell(B,196,st-3.5,7,3.5,'lime',{nk:0.8}); ell(B,206,st-2.5,3,2.5,'lime',{flat:12});
      // cypresses and olives
      const cypress=(x,y,h)=>{ poly(B,[[x-0.8,y],[x+0.8,y],[x+0.8,y-4],[x-0.8,y-4]],'leather',{flat:12});
        for (let k=0;k<5;k++) ell(B,x+(rnd()-0.5)*1.5,y-6-k*(h/6),4.2-k*0.6,h/5,'olive',{nk:0.9,bias:-0.15}); };
      const oliveTree=(x,y)=>{ caps(B,[[x,y,x-2,y-9,1.6,1.2],[x-2,y-9,x+1,y-16,1.2,0.9]],'leather',{nk:0.7});
        for (let k=0;k<6;k++) ell(B,x-8+rnd()*16,y-16-rnd()*8,5+rnd()*3,3+rnd()*2,'olive',{nk:0.8,bias:0.05}); };
      cypress(70,166,50); cypress(84,164,40); cypress(338,164,46); cypress(350,166,56);
      oliveTree(30,180); oliveTree(392,178); oliveTree(-20,190); oliveTree(450,188);
    },{seed:21});
    // fg: the terrace with polygonal masonry, omphalos, tripod
    const fg=artLayer(s,1,(B,LX,LY,LW)=>{
      // rock under the terrace, falling away
      poly(B,[[L+1,T+44],[R-1,T+44],[R-22,T+64],[R-50,240],[L+50,240],[L+22,T+64]],'lime',{},(x,y)=>y<T+50?12:clamp(0.32-(y-T-50)*0.006,0,1));
      for (let i=0;i<16;i++){ let x=L+40+rnd()*(R-L-80), y=T+48+rnd()*30; for (let j=0;j<10;j++){ dotPx(B,x,y,ci('lime',0)); x+=(rnd()-0.5)*1.5; y+=0.5; } }
      // polygonal (Lesbian) masonry: voronoi cells with mortar joints
      seed=77; const pts=[]; for (let i=0;i<70;i++) pts.push([L+rnd()*(R-L), T+5+rnd()*40, rnd()]);
      poly(B,[[L,T+4],[R,T+4],[R,T+46],[L,T+46]],'lime',{},(x,y)=>{
        let d1=1e9,d2=1e9,k=null; for (const p of pts){ const d=(x-p[0])**2+((y-p[1])*1.3)**2; if (d<d1){ d2=d1; d1=d; k=p; } else if (d<d2) d2=d; }
        if (Math.sqrt(d2)-Math.sqrt(d1)<0.9) return 11;
        return clamp(0.45+k[2]*0.25-(y-T)*0.006 - (x-k[0])*0.012,0,1); });
      // lit coping stones on top
      poly(B,[[L-3,T],[R+3,T],[R+3,T+4.5],[L-3,T+4.5]],'lime',{},(x,y)=>y<T+1.5?14:y<T+3.5?13:12);
      for (let x=L+10;x<R;x+=24) pline(B,x,T+0.5,x,T+4,ci('lime',1));
      // the omphalos: a carved stone egg under a knotted net, on a low base
      const ox=208, oy=T-1;
      poly(B,[[ox-12,oy],[ox+12,oy],[ox+10,oy-3],[ox-10,oy-3]],'lime',{},(x,y)=>y<oy-2?14:12);
      ell(B,ox,oy-11,8.5,10,'lime',{nk:0.85});
      for (let k=-2;k<=2;k++){ for (let a=0;a<30;a++){ const q=a/30*Math.PI; const x=ox+Math.cos(q)*8*Math.cos(k*0.32+ (a%2?0.08:0)); const y=oy-11-Math.sin(q)*9.5+(k*0); if (y<oy-3) dotPx(B,x+k*0.4*Math.sin(q),y,ci('lime',1)); } }
      for (const y0 of [-15,-9,-4]) for (let x=-7;x<=7;x+=0.5){ const yy=oy+y0+Math.abs(x)*0.08; if ((x*2)%3) dotPx(B,ox+x*(1-(y0+15)*0.0),yy,ci('lime',1)); }
      ell(B,ox,oy-21,1.4,1.2,'gold',{flat:13});
      // bronze tripod with a bowl (the smoke is animated)
      const tx=292, ty=T-1;
      caps(B,[[tx-6,ty,tx-2,ty-14,0.9,0.7],[tx+6,ty,tx+2,ty-14,0.9,0.7],[tx,ty,tx,ty-14,0.9,0.7]],'bronze',{nk:0.6});
      poly(B,[[tx-7,ty-19],[tx+7,ty-19],[tx+4.5,ty-13.5],[tx-4.5,ty-13.5]],'bronze',{},(x,y)=>y<ty-18?14:x<tx?13:12);
      for (const sx of [-6.5,6.5]) ell(B,tx+sx,ty-21,1.6,1.6,'bronze',{flat:12});
      // laurel bush at the left end
      for (let i=0;i<14;i++) feather(B,124+rnd()*10,T-1,(rnd()-0.5)*2.2+Math.PI,4+rnd()*4,1.4,'olive',{quill:false,bias:0.1});
    },{seed:31});
    // tripod smoke and drifting motes, redrawn every frame on the pixel grid
    const smoke={par:1, draw:(g,t)=>{ const tx=292, ty=140-20;
      for (let i=0;i<9;i++){ const k=((t*0.35+i/9)%1), y=ty-k*70, x=tx+Math.sin(t*1.3+i*2.1)*3*k+k*k*14, r=(1.5+k*5);
        g.globalAlpha=0.55*(1-k); g.fillStyle=k<0.25?'#fff4dc':'#e9d6c0';
        for (let a=0;a<8;a++){ const q=a/8*TAU+i; g.fillRect(snap(x+Math.cos(q)*r*0.6)-0.5,snap(y+Math.sin(q)*r*0.4)-0.5,1,1); } g.fillRect(snap(x)-1,snap(y)-1,2,2); }
      g.globalAlpha=1; }};
    return {back:[far,mid,fg,smoke], front:[]};
  }});

// ---- 3. Clouds of Olympus: a marble island above the clouds, two drifting cloud platforms ----
addMat('cloud',['#7486c0','#a9b8e0','#d6def2','#eff3fb','#ffffff']);
addMat('sun',  ['#e9a64a','#f5c86a','#fbe2a0','#fff0c8','#fffbea']);
addMat('dawn', ['#5b5f9e','#8a87b8','#b9b0cc','#ddd3dc','#f4ece6']);
defStage({id:'olympus', name:'OLYMPUS', full:'CLOUDS OF OLYMPUS',
  solids:[{l:118,r:298,t:138}], altar:{l:118,r:298,t:138,b:108},
  plats:[{l:136,r:186,t:96,soft:true,move:{T:10,ax:20,ph:0}},{l:230,r:280,t:96,soft:true,move:{T:10,ax:20,ph:Math.PI}}],
  camb:{x0:-110,x1:VW+110,y0:-180,y1:VH+2}, spawns:[152,264],
  build(s){
    const T=138, L=118, R=298;
    const farArt=artLayer(s,0.4,(B,LX,LY,LW)=>{
      // sun glow behind the peak
      ell(B,208,64,38,38,'sun',{outline:false,flat:13}); ell(B,208,64,26,26,'sun',{outline:false,flat:14});
      // the summit: a broad massif with snow
      const pts=[[LX,240],[LX,170],[40,150],[96,118],[140,96],[176,58],[198,44],[214,50],[236,40],[262,72],[300,104],[350,128],[420,150],[LX+LW,168],[LX+LW,240]];
      poly(B,pts,'dawn',{outline:false},(x,y)=>{ const n=Math.sin(x*0.13)*4+Math.sin(x*0.41)*2;
        if (y<70+Math.abs(x-214)*0.45+n) return x<218+(y-44)*0.3?14:13;
        return x<214+(y-44)*0.3+Math.sin(y*0.15)*4 ? 13 : 12; });
      // far sea of cloud
      for (let i=0;i<26;i++){ const x=LX+i*(LW/25)+rnd()*10; cloud(B,x,176+rnd()*10,46+rnd()*30,9+rnd()*5,'cloud',{outline:false,bias:-0.05}); }
      for (let i=0;i<10;i++){ const x=LX+rnd()*LW, y=LY+30+rnd()*120; ell(B,x,y,16+rnd()*24,1.5,'cloud',{outline:false,flat:13}); }
    },{seed:41});
    const far=skyLayer(s,0.4,[[-190,'#5c7fc8'],[-60,'#86a3db'],[40,'#bccbea'],[110,'#efe2cf'],[170,'#f8e7c0']],farArt);
    // mid: a tholos on its own cloud, and a giant golden winged sandal on a column
    const mid=artLayer(s,0.68,(B,LX,LY,LW)=>{
      // tholos (left)
      { const cx=10, by=120;
        cloud(B,cx,by+10,90,14,'cloud',{bias:0.1});
        poly(B,[[cx-30,by],[cx+30,by],[cx+32,by+5],[cx-32,by+5]],'marble',{},(x,y)=>y<by+2?14:12);
        for (let i=0;i<7;i++){ const x=cx-27+i*8.5; stageColumn(B,x,by-34,by,4.5,'marble',{base:false,lit:13}); }
        poly(B,[[cx-31,by-40],[cx+31,by-40],[cx+31,by-34],[cx-31,by-34]],'marble',{},(x,y)=>y<by-38?14:13);
        const dome=[]; for (let i=0;i<=20;i++){ const a=Math.PI+i/20*Math.PI; dome.push([cx+Math.cos(a)*28, by-40+Math.sin(a)*15]); }
        poly(B,dome,'marble',{},(x,y)=>clamp(0.8-(x-cx+20)*0.012-(by-40-y)*0.01,0,1));
        poly(B,[[cx-1,by-60],[cx+1,by-60],[cx+1,by-54],[cx-1,by-54]],'gold',{flat:13}); ell(B,cx,by-61,2,2,'gold',{flat:14}); }
      // the talaria monument (right)
      { const cx=410, by=150;
        cloud(B,cx,by+6,110,16,'cloud',{bias:0.1});
        stageColumn(B,cx-7,by-60,by,14,'marble',{});
        poly(B,[[cx-11,by-66],[cx+11,by-66],[cx+11,by-60],[cx-11,by-60]],'marble',{flat:14});
        const sy=by-70;
        caps(B,[[cx-10,sy-3,cx+12,sy-3,4.5,4.5],[cx+4,sy-6,cx+4,sy-16,4,3.5]],'gold',{nk:0.8});
        poly(B,[[cx-14,sy+1],[cx+18,sy+1],[cx+18,sy-1],[cx-14,sy-1]],'gold',{flat:12});
        for (let k=0;k<6;k++) feather(B,cx+1,sy-10,Math.PI+1.0+k*0.22,12+k*2.2,2.6,'wingw',{bias:0.15,lit:-1});
        for (let k=0;k<4;k++) feather(B,cx+1,sy-10,Math.PI+1.05+k*0.25,7+k*1.4,2.2,'gold',{bias:0.2,lit:-1}); }
      // nearer cloud banks
      for (let i=0;i<9;i++){ const x=LX+i*(LW/8)+rnd()*20; cloud(B,x,200+rnd()*8,60+rnd()*40,13+rnd()*5,'cloud',{bias:0.05}); }
    },{seed:43});
    // drifting wisps between the layers
    const wisps=[0,1,2,3].map(i=>artSprite(80,20,B=>{ seed=100+i; cloud(B,40,13,60+i*4,6+i%2*2,'cloud',{outline:false,bias:0.2}); }));
    const drift={par:0.85, draw:(g,t)=>{ g.globalAlpha=0.7; for (let i=0;i<5;i++){ const w=wisps[i%4], span=700, x=((t*(5+i*2)+i*190)%span)-150, y=10+i*34;
      g.drawImage(w,snap(x),snap(y),80,20); } g.globalAlpha=1; }};
    // fg: the island
    const fg=artLayer(s,1,(B)=>{
      // cloud mass under the island
      for (let i=0;i<7;i++){ const x=L+14+i*((R-L-28)/6); cloud(B,x,T+24+Math.sin(i*1.7)*3,34,9+(i%3)*1.5,'cloud',{bias:0.1}); }
      cloud(B,208,T+36,110,11,'cloud',{bias:0.05});
      // marble slab, gold edge, frieze with a running key
      poly(B,[[L-3,T],[R+3,T],[R+3,T+4],[L-3,T+4]],'marble',{},(x,y)=>y<T+1.5?14:13);
      pline(B,L-2,T+4.5,R+2,T+4.5,ci('gold',3));
      poly(B,[[L,T+5],[R,T+5],[R-4,T+16],[L+4,T+16]],'relief',{},(x,y)=>clamp(0.45-(y-T)*0.02,0,1));
      for (let x=L+6;x<R-12;x+=9){ const c=ci('gold',3), y0=T+7, Lk=(a,b,cc,d)=>pline(B,a,b,cc,d,c);
        Lk(x,y0+7,x+9,y0+7); Lk(x,y0+7,x,y0); Lk(x,y0,x+6.5,y0); Lk(x+6.5,y0,x+6.5,y0+5); Lk(x+6.5,y0+5,x+2.5,y0+5); Lk(x+2.5,y0+5,x+2.5,y0+2.5); }
      poly(B,[[L+4,T+16],[R-4,T+16],[R-8,T+20],[L+8,T+20]],'marble',{},(x,y)=>y<T+17.5?13:12);
      // braziers at the ends (the flames are animated)
      for (const bx of [L+10,R-10]){ poly(B,[[bx-4,T],[bx+4,T],[bx+2,T-3],[bx-2,T-3]],'marble',{flat:13});
        poly(B,[[bx-1.5,T-3],[bx+1.5,T-3],[bx+1.5,T-12],[bx-1.5,T-12]],'gold',{},(x)=>x<bx?13:12);
        poly(B,[[bx-6,T-16],[bx+6,T-16],[bx+3.5,T-12],[bx-3.5,T-12]],'gold',{},(x,y)=>y<T-15?14:13); }
    },{seed:47});
    // cloud platforms, drawn where the sim has them
    const cloudPlat=artSprite(70,22,B=>{ seed=55; for (let i=0;i<4;i++) cloud(B,15+i*13,13+(i%2)*1.5,22,6,'cloud',{bias:0.25}); cloud(B,35,17,30,5,'cloud',{bias:0.1});
      poly(B,[[7,4],[63,4],[63,7.5],[7,7.5]],'marble',{},(x,y)=>y<5.5?14:13); pline(B,8,8,62,8,ci('gold',3));
      for (let x=12;x<62;x+=10) ell(B,x,9.6,1,1,'gold',{flat:13}); });
    const plats={par:1, draw:(g,t)=>{ for (const p of PLATS) g.drawImage(cloudPlat,snap((p.l+p.r)/2-35),snap(p.t-4),70,22);
      // brazier flames
      for (const bx of [L+10,R-10]) for (let i=0;i<6;i++){ const k=(t*2.2+i/6)%1, y=T-17-k*9, x=bx+Math.sin(t*9+i*2)*1.5*(1-k);
        g.fillStyle=k<0.3?'#fff6c8':k<0.65?'#ffc34a':'#e9783a'; const r=k<0.5?1.5:1; g.fillRect(snap(x)-r/2,snap(y)-r/2,r,r); } }};
    // the sea of cloud in front of anyone falling off
    const sea=artLayer(s,1,(B,LX,LY,LW)=>{ for (let i=0;i<16;i++){ const x=LX+i*(LW/15)+rnd()*12; cloud(B,x,226+rnd()*6,56+rnd()*30,10+rnd()*4,'cloud',{bias:0.15}); } },{seed:61, alpha:0.85});
    return {back:[far,drift,mid,fg,plats], front:[sea]};
  }});

// ---- 4. Ferry of the Styx: Charon's barge on the river of the dead -------------------------
addMat('nite', ['#090c26','#141a44','#212c64','#324284','#4a5fa6']);
addMat('soul', ['#0b3446','#1d7488','#47c4cc','#a2f0ea','#efffff']);
addMat('wood', ['#160c0a','#3e2418','#5e3a24','#835532','#a87446']);
addMat('fog',  ['#2a3470','#3e4c8c','#5869a6','#7586bc','#97a6d2']);
defStage({id:'styx', name:'STYX', full:'FERRY OF THE STYX',
  solids:[{l:104,r:140,t:134},{l:140,r:276,t:139},{l:276,r:312,t:134}], plats:[{l:180,r:236,t:93,soft:true}],
  altar:{l:104,r:312,t:134,b:92}, camb:{x0:-100,x1:VW+100,y0:-170,y1:VH+2}, spawns:[156,260],
  build(s){
    const farArt=artLayer(s,0.4,(B,LX,LY,LW)=>{
      // cavern roof with stalactites
      const roof=[[LX,LY],[LX+LW,LY]]; for (let x=LX+LW;x>=LX;x-=6){ roof.push([x,-60+Math.sin(x*0.05)*16+(rnd()<0.25?rnd()*40:rnd()*8)]); }
      poly(B,roof,'nite',{outline:false},(x,y)=>y>-70+Math.sin(x*0.05)*16?12:11);
      // far bank: the gates of the underworld, glowing
      const gx=208, gy=150;
      poly(B,[[LX,240],[LX,150],[60,142],[140,136],[276,136],[356,142],[LX+LW,150],[LX+LW,240]],'nite',{outline:false},()=>12);
      poly(B,[[gx-46,gy-8],[gx+46,gy-8],[gx+46,gy-14],[gx-46,gy-14]],'fog',{outline:false,flat:11});
      for (let i=0;i<6;i++){ const x=gx-42+i*16; poly(B,[[x,gy-74],[x+6,gy-74],[x+6,gy-14],[x,gy-14]],'fog',{outline:false},(xx)=>xx-x<2?12:11); }
      poly(B,[[gx-50,gy-74],[gx+50,gy-74],[gx+50,gy-82],[gx-50,gy-82]],'fog',{outline:false,flat:12});
      poly(B,[[gx-52,gy-82],[gx,gy-100],[gx+52,gy-82]],'fog',{outline:false,flat:11});
      poly(B,[[gx-10,gy-14],[gx+10,gy-14],[gx+10,gy-50],[gx,gy-58],[gx-10,gy-50]],'soul',{outline:false},(x,y)=>y>gy-30?13:y>gy-46?14:13);
      // three-headed hound guarding the gate, a silhouette
      { const hx=gx+70, hy=gy-14; ell(B,hx,hy-7,10,5,'nite',{outline:false,flat:11}); for (const [dx,dy] of [[-9,-15],[-5,-18],[-1,-15]]){ ell(B,hx+dx,hy+dy,3.2,2.6,'nite',{outline:false,flat:11}); poly(B,[[hx+dx-1,hy+dy-2],[hx+dx+0.5,hy+dy-5],[hx+dx+1.5,hy+dy-2]],'nite',{outline:false,flat:11}); }
        caps(B,[[hx-8,hy-6,hx-8,hy,1.2,1.2],[hx+7,hy-6,hx+7,hy,1.2,1.2],[hx+10,hy-8,hx+16,hy-14,1,0.6]],'nite',{outline:false,flat:11}); }
      // pale soul-lights far off
      for (let i=0;i<60;i++) dotPx(B,LX+rnd()*LW,-40+rnd()*170,ci('soul',rnd()<0.3?3:2));
    },{seed:71});
    const far=skyLayer(s,0.4,[[-190,'#070a20'],[-60,'#121a48'],[40,'#26326c'],[100,'#3b4c8e'],[150,'#4e62a6'],[200,'#26326c']],farArt);
    // mid: rocky banks with stalagmites and asphodel
    const mid=artLayer(s,0.7,(B,LX,LY,LW)=>{
      const bank=(x0,x1,top,dir)=>{ const pts=[[x0,240]]; for (let x=x0;x<=x1;x+=4) pts.push([x, top+(dir>0?(x-x0):(x1-x))*0.5+rnd()*6]); pts.push([x1,240]);
        poly(B,pts,'nite',{},(x,y)=>{ const k=Math.sin(x*0.7+y*0.11); return k>0.7?14:k>-0.2?13:12; }); };
      bank(LX,40,120,1); bank(376,LX+LW,116,-1);
      for (const [x,h] of [[-70,70],[-40,48],[0,36],[400,40],[440,66],[480,52]]){ poly(B,[[x-6,190],[x+6,190],[x+1,190-h],[x-1,190-h]],'nite',{},(xx)=>xx<x?14:12); }
      for (let i=0;i<30;i++){ const x=rnd()<0.5?LX+rnd()*(40-LX):376+rnd()*(LX+LW-376), y=150+rnd()*40; caps(B,[[x,y,x,y-6,0.4,0.4]],'olive',{outline:false,flat:12}); ell(B,x,y-7,1.2,1.2,'cream',{outline:false,flat:14}); }
    },{seed:73});
    // a second ferry, far off, with the ferryman poling it across
    const ferry=artSprite(70,50,B=>{
      poly(B,[[4,38],[66,38],[58,46],[12,46]],'wood',{},(x,y)=>y<40?13:12);
      caps(B,[[4,38,0,30,1,0.8]],'wood',{flat:12});
      // the ferryman: tall hooded figure, pole, lantern
      poly(B,[[30,38],[44,38],[41,14],[36,10],[31,14]],'nite',{},(x,y)=>x<35?13:11);
      ell(B,36.5,13,4,4.5,'nite',{flat:11}); ell(B,37.5,14,1.6,1.2,'soul',{outline:false,flat:14});
      pline(B,24,48,46,2,ci('wood',3)); caps(B,[[40,22,30,26,1.2,1]],'nite',{flat:12});
      pline(B,58,38,58,24,ci('wood',2)); ell(B,58,26,2,2.5,'soul',{flat:13});
    });
    const water=artLayer(s,0.9,(B,LX,LY,LW)=>{
      poly(B,[[LX,158],[LX+LW,158],[LX+LW,240],[LX,240]],'nite',{outline:false},(x,y)=>y<160?13:(y<170?12:11));
      for (let i=0;i<120;i++){ const x=LX+rnd()*LW, y=160+rnd()*70, w=2+rnd()*8; pline(B,x,y,x+w,y,ci(rnd()<0.3?'soul':'nite',rnd()<0.3?1:3)); }
    },{seed:79});
    const river={par:0.9, draw:(g,t)=>{ const x=((t*6)%620)-140; g.drawImage(ferry,snap(x),snap(124),70,50);
      // ripples and rising souls
      for (let i=0;i<34;i++){ const k=(i*73)%100/100, y=162+k*60, x=((i*97+t*(8+k*10))%680)-160; g.fillStyle=i%4?'#3b4c8e':'#47c4cc'; g.fillRect(snap(x),snap(y),3+(i%3)*2,0.5); }
      for (let i=0;i<14;i++){ const k=((t*0.06+i/14)%1), x=(i*61%416)-20+Math.sin(t*0.8+i)*6, y=170-k*170;
        g.globalAlpha=Math.sin(k*Math.PI)*0.85; g.fillStyle='#a2f0ea'; g.fillRect(snap(x)-0.5,snap(y)-0.5,1.5,1.5); g.fillStyle='#47c4cc'; g.fillRect(snap(x)-0.5,snap(y)+1,1,2); }
      g.globalAlpha=1; }};
    // fg: the barge
    const fg=artLayer(s,1,(B)=>{
      const L=104, R=312;
      // mast and yard (the yard is the high platform)
      poly(B,[[206.5,139],[209.5,139],[209.5,70],[206.5,70]],'wood',{},(x)=>x<208?13:11);
      ell(B,208,69,2.5,2,'gold',{flat:13});
      poly(B,[[178,93],[238,93],[238,97],[178,97]],'wood',{},(x,y)=>y<94.5?14:12);
      for (let x=184;x<234;x+=6) ell(B,x+3,99.5,3.4,2.4,'cream',{nk:0.7,bias:-0.25});
      pline(B,208,72,180,93,ci('wood',1)); pline(B,208,72,236,93,ci('wood',1));
      // hull: dark planks curving to the keel, a curled prow and stern post
      const hull=[[L-14,128],[L-6,134],[L,134],[R,134],[R+6,134],[R+16,126],[R+10,146],[R-14,166],[L+20,168],[L-4,150]];
      poly(B,hull,'wood',{},(x,y)=>{ const pl=Math.floor((y-128)/5.5); if ((x+pl*11+400)%23<0.6) return 11; return (y-128)%5.5<0.7?11:clamp(0.55-pl*0.06+((pl*37+Math.floor(x/23))%3)*0.05,0,1); });
      // gunwale band with soul-light studs
      poly(B,[[L-6,134],[R+6,134],[R+4,138],[L-4,138]],'wood',{},(x,y)=>y<135.5?14:12);
      for (let x=L+4;x<R;x+=16) ell(B,x,146,1.4,1.4,'soul',{flat:13});
      // deck: raised ends, planks
      for (const so of s.solids){ poly(B,[[so.l,so.t],[so.r,so.t],[so.r,so.t+3],[so.l,so.t+3]],'wood',{},(x,y)=>y<so.t+1?14:13);
        for (let x=so.l+5;x<so.r;x+=7) pline(B,x,so.t+0.5,x,so.t+2.5,ci('wood',2)); }
      for (const [x0,x1] of [[140,140],[276,276]]){ poly(B,[[x0-1,134],[x0+1,134],[x0+1,139],[x0-1,139]],'wood',{flat:12}); }
      // prow: curling neck ending in a serpent head
      caps(B,[[L-12,129,L-18,120,2,1.6],[L-18,120,L-16,112,1.6,1.4],[L-16,112,L-10,110,1.4,1.4]],'wood',{nk:0.8});
      ell(B,L-9,110,2.6,2,'wood',{nk:0.8}); dotPx(B,L-8.5,109.5,ci('soul',4));
      // stern lantern post
      poly(B,[[R+3,134],[R+5,134],[R+9,100],[R+7,100]],'wood',{},(x)=>12);
      pline(B,R+8,100,R+14,98,ci('wood',3)); pline(B,R+14,98,R+14,102,ci('wood',1));
      poly(B,[[R+11,102],[R+17,102],[R+16,110],[R+12,110]],'bronze',{},(x,y)=>y<104?13:12);
    },{seed:83});
    const lamps={par:1, draw:(g,t)=>{ const R=312; const fl=0.75+0.25*Math.sin(t*11)*Math.sin(t*7.3);
      g.globalAlpha=0.35*fl; g.fillStyle='#47c4cc'; g.fillRect(snap(R+9),snap(100),10,13); g.globalAlpha=1;
      g.fillStyle=fl>0.8?'#efffff':'#a2f0ea'; g.fillRect(snap(R+13),snap(104),2,4);
      // soul-light studs on the hull pulse
      g.fillStyle='#a2f0ea'; for (let x=108,i=0;x<312;x+=16,i++){ if (Math.sin(t*2+i)>0.3) g.fillRect(snap(x)-0.5,snap(146)-0.5,1,1); } }};
    // the river's surface in front of anyone who falls in
    const surface=artLayer(s,1,(B,LX,LY,LW)=>{ poly(B,[[LX,167],[LX+LW,167],[LX+LW,240],[LX,240]],'nite',{outline:false},(x,y)=>y<168.5?14:y<172?13:12);
      for (let i=0;i<90;i++){ const x=LX+rnd()*LW, y=170+rnd()*60; pline(B,x,y,x+3+rnd()*9,y,ci(rnd()<0.35?'soul':'nite',rnd()<0.35?2:4)); } },{seed:89, alpha:0.6});
    return {back:[far,mid,water,river,fg,lamps], front:[surface]};
  }});

