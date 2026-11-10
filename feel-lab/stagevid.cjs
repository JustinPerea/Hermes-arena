// walkthrough video of the match flow, rendered frame by frame from the real game loop (flowFrame), with its sound
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path'); const {execFileSync}=require('child_process');
const {load}=require('./page.cjs');
const OUT=process.argv[2]||__dirname+'/out/stages.mp4', DIR=require('os').tmpdir()+'/hermes-sv';
fs.rmSync(DIR,{recursive:true,force:true}); fs.mkdirSync(DIR,{recursive:true});
(async()=>{ const errors=[]; const b=await chromium.launch(); const p=await load(b,errors,require('path').join(__dirname,'../game/pixel-hermes.html'));
 await p.evaluate(()=>{ __seed(7); stage.width=832; stage.height=468; SFX.rec=[]; window.__realPI=playerInput; });
 const plan=[['altar','hermes','aethon'],['delphi','aethon','hermes'],['olympus','hermes','aethon'],['styx','aethon','hermes']];
 let i=0, k=0;
 for (const [st,p1,p2] of plan){
   await p.evaluate(([st,p1,p2])=>{ Object.assign(MS,{p1,p2,lv:2,stocks:3,time:0,stage:st}); toMenu('select'); flow.row=5; },[st,p1,p2]);
   const seg=async(n,setup)=>{ for (let j=0;j<n;j+=60){ const chunk=await p.evaluate(([i0,m])=>{ const out=[]; for (let i=i0;i<i0+m;i++){ SFX.frame=i;
       if (flow.s==='play') playerInput=()=>cpuInput(H,1/60); flowFrame(1000+i*1000/60,1/60); playerInput=__realPI; if (i%2===0) out.push(stage.toDataURL('image/png')); } return out; },[i,Math.min(60,n-j)]);
     for (const png of chunk) fs.writeFileSync(path.join(DIR,String(k++).padStart(5,'0')+'.png'),Buffer.from(png.split(',')[1],'base64')); i+=Math.min(60,n-j); } };
   await seg(60);
   await p.evaluate(()=>{ startMatch(); H.dmg=60; D.dmg=60; });
   await seg(st==='altar'?600:480);
 }
 const ev=await p.evaluate(()=>SFX.rec); const dur=i/60+0.5;
 const ch=await p.evaluate(async([ev,dur])=>{ const [L,R]=await sfxRender(ev,dur,f=>f/60); return [Array.from(L),Array.from(R)]; },[ev,dur]);
 const n=ch[0].length, buf=Buffer.alloc(44+n*4); buf.write('RIFF',0); buf.writeUInt32LE(36+n*4,4); buf.write('WAVEfmt ',8); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(2,22); buf.writeUInt32LE(44100,24); buf.writeUInt32LE(176400,28); buf.writeUInt16LE(4,32); buf.writeUInt16LE(16,34); buf.write('data',36); buf.writeUInt32LE(n*4,40);
 for (let j=0;j<n;j++){ buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[0][j]))*32767),44+j*4); buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[1][j]))*32767),46+j*4); }
 fs.writeFileSync(path.join(DIR,'a.wav'),buf);
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',path.join(DIR,'%05d.png'),'-i',path.join(DIR,'a.wav'),'-vf','scale=1248:-2:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-shortest',OUT]);
 console.log('->',OUT,k,'frames',ev.length,'sounds',errors); await b.close(); })().catch(e=>{ console.error(e); process.exit(1); });
