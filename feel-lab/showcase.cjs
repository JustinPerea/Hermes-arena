// scripted showcase of a fighter's moves, with captions and sound -> mp4
// usage: node showcase.cjs <segments.js> <out.mp4> [html]
const fs=require('fs'); const path=require('path'); const {execFileSync}=require('child_process');
const {load,launch}=require('./page.cjs');
const SEG=fs.readFileSync(path.resolve(process.argv[2]),'utf8'), OUT=path.resolve(process.argv[3]), HTML=path.resolve(process.argv[4]||path.join(__dirname,'../game/pixel-hermes.html'));
const DIR=OUT+'_frames'; fs.rmSync(DIR,{recursive:true,force:true}); fs.mkdirSync(DIR,{recursive:true});
(async()=>{ const errors=[]; const b=await launch(); const p=await load(b,errors,HTML);
  await p.evaluate(src=>{ stage.width=832; stage.height=468; window.SEGS=(0,eval)(src); SFX.rec=[]; window.__fi=0; },SEG);
  const n=await p.evaluate(()=>SEGS.length); let k=0;
  for (let s=0;s<n;s++){
    const pngs=await p.evaluate(s=>{ const S=SEGS[s], out=[], realPI=playerInput, realCI=cpuInput; let now=1000+__fi*1000/60;
      LAB.setup(S.ch,{foe:S.foe||'hermes',cpu:!!S.dummy,dummyAway:false}); H.x=S.x??170; D.x=S.dx??240; D.dmg=S.dmg??30; H.face=1; D.face=-1; S.setup&&S.setup();
      if (S.dummy){ let j=0; cpuInput=(F,dt)=>F===D?LAB.inp(S.dummy(j++)):realCI(F,dt); }
      try { for (let i=0;i<S.frames;i++){ const q=S.input?S.input(i)||{}:{}; playerInput=()=>LAB.inp(q); SFX.frame=__fi++;
          step(typeof simDt==='function'?simDt(1/60):1/60); now+=1000/60; renderStage(now,1/60);
          if (i%2===0){ const g=stage.getContext('2d'); g.setTransform(1,0,0,1,0,0); g.font='bold 22px monospace'; g.textAlign='left';
            g.lineWidth=5; g.strokeStyle='#1a2340'; g.strokeText(S.label,16,34); g.fillStyle='#ffe58a'; g.fillText(S.label,16,34);
            if (S.sub){ g.font='bold 15px monospace'; g.strokeText(S.sub,16,58); g.fillStyle='#ffffff'; g.fillText(S.sub,16,58); }
            out.push(stage.toDataURL('image/png')); } } }
      finally { playerInput=realPI; cpuInput=realCI; }
      return out; },s);
    for (const png of pngs) fs.writeFileSync(path.join(DIR,String(k++).padStart(5,'0')+'.png'),Buffer.from(png.split(',')[1],'base64'));
    console.log('segment',s,pngs.length); }
  const ev=await p.evaluate(()=>SFX.rec), fi=await p.evaluate(()=>__fi), dur=fi/60+0.5;
  const ch=await p.evaluate(async([ev,dur])=>{ const [L,R]=await sfxRender(ev,dur,f=>f/60); return [Array.from(L),Array.from(R)]; },[ev,dur]);
  const m=ch[0].length, buf=Buffer.alloc(44+m*4); buf.write('RIFF',0); buf.writeUInt32LE(36+m*4,4); buf.write('WAVEfmt ',8); buf.writeUInt32LE(16,16); buf.writeUInt16LE(1,20); buf.writeUInt16LE(2,22); buf.writeUInt32LE(44100,24); buf.writeUInt32LE(176400,28); buf.writeUInt16LE(4,32); buf.writeUInt16LE(16,34); buf.write('data',36); buf.writeUInt32LE(m*4,40);
  for (let j=0;j<m;j++){ buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[0][j]))*32767),44+j*4); buf.writeInt16LE(Math.round(Math.max(-1,Math.min(1,ch[1][j]))*32767),46+j*4); }
  fs.writeFileSync(path.join(DIR,'a.wav'),buf);
  execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',path.join(DIR,'%05d.png'),'-i',path.join(DIR,'a.wav'),'-vf','scale=1248:-2:flags=neighbor','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-shortest',OUT]);
  console.log('->',OUT,k,'frames',ev.length,'sounds','errors',errors); await b.close(); })().catch(e=>{ console.error(e); process.exit(1); });
