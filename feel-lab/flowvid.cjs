// walkthrough video of the match flow, rendered frame by frame from the real game loop (flowFrame), with its sound
const {chromium}=require('playwright'); const fs=require('fs'); const path=require('path'); const {execFileSync}=require('child_process');
const {load}=require('./page.cjs');
const OUT=process.argv[2]||__dirname+'/out/match-flow.mp4', DIR=require('os').tmpdir()+'/hermes-fv';
fs.rmSync(DIR,{recursive:true,force:true}); fs.mkdirSync(DIR,{recursive:true});
(async()=>{ const errors=[]; const b=await chromium.launch(); const p=await load(b,errors,require('path').join(__dirname,'../game/pixel-hermes.html'));
 await p.evaluate(()=>{ __seed(7); stage.width=832; stage.height=468; Object.assign(MS,{p1:'hermes',p2:'aethon',lv:1,stocks:3,time:0}); toMenu('title');
   SFX.rec=[]; const realPI=playerInput; window.__realPI=realPI;
   const at={180:'attack',230:'down',265:'right',305:'left',345:'down',385:'down',420:'right',460:'down',495:'left',530:'left',570:'down',605:'right',645:'down',690:'attack'};
   let resAt=-1, rem=-1, sdT=-1;
   window.__drive=i=>{ SFX.frame=i; const k=at[i]; if (k) pressed[k]=true;
     if (i===700){ H.dmg=105; D.dmg=105; }                       // short demo: both start the fight at 105%
     if (flow.s==='play' && !flow.sudden) playerInput=()=>cpuInput(H,1/60);
     if (i===1000) pressed.start=true; if (i===1040) pressed.down=true; if (i===1075) pressed.up=true; if (i===1110) pressed.attack=true;
     if (flow.s==='results' && resAt<0) resAt=i;
     if (resAt>0){ const r=i-resAt; if (r===200) pressed.right=true; if (r===240) pressed.left=true; if (r===280){ pressed.attack=true; rem=i; } }
     if (rem>0 && flow.s==='play' && sdT<0){ sdT=i; flow.clock=3.2; }
     return flow.s; };
 });
 let i=0, k=0, done=-1, lastS='';
 while (i<4000){
   const chunk=await p.evaluate(([i0,n])=>{ const out=[]; for (let i=i0;i<i0+n;i++){ const s=__drive(i); flowFrame(1000+i*1000/60,1/60); playerInput=__realPI; if (i%2===0) out.push([i,stage.toDataURL('image/png'),flow.s,flow.sudden]); } return out; },[i,60]);
   for (const [fi,png,s,sd] of chunk){ fs.writeFileSync(path.join(DIR,String(k++).padStart(5,'0')+'.png'),Buffer.from(png.split(',')[1],'base64')); if (s!==lastS){ console.log('f'+fi,s,sd?'sudden':''); lastS=s; } if (sd && s==='results' && done<0) done=fi+200; }
   i+=60; if (done>0 && i>=done) break; }
 const ev=await p.evaluate(()=>SFX.rec); const dur=i/60+0.5;
 const ch=await p.evaluate(async([ev,dur])=>{ const [L,R]=await sfxRender(ev,dur,f=>f/60); return [Array.from(L),Array.from(R)]; },[ev,dur]);
 const n=ch[0].length, buf=Buffer.alloc(44+n*4); buf.write('RIFF',0); buf.writeUInt32LE(36+n*4,4); buf.write('WAVEfmt ',8); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(2,22); buf.writeUInt32LE(44100,24); buf.writeUInt32LE(176400,28); buf.writeUInt16LE(4,32); buf.writeUInt16LE(16,34); buf.write('data',36); buf.writeUInt32LE(n*4,40);
 for (let j=0;j<n;j++){ buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[0][j]))*32767),44+j*4); buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[1][j]))*32767),46+j*4); }
 fs.writeFileSync(path.join(DIR,'a.wav'),buf);
 execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',path.join(DIR,'%05d.png'),'-i',path.join(DIR,'a.wav'),'-vf','scale=1248:-2:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-shortest',OUT]);
 console.log('->',OUT,k,'frames',ev.length,'sounds',errors); await b.close(); })().catch(e=>{ console.error(e); process.exit(1); });
