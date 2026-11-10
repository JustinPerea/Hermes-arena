#!/usr/bin/env node
// Render scenario clips for visual feel review (see REVIEW.md).
// usage: node clips.cjs [--html path] [--out dir] [--only ko_smash,jab_chain] [--ch hermes|aethon|both] [--set 'FEEL.shortHop=300']
// For each scenario x fighter: <out>/<name>-<ch>.gif (real-time, 30 fps) and <out>/<name>-<ch>-sheet-N.png
// (contact sheets, every 2nd frame by default, each tile stamped with its game frame number).
const fs=require('fs'); const path=require('path'); const {execFileSync}=require('child_process');
const {load,launch}=require('./page.cjs');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html')));
const OUT=path.resolve(arg('out',path.join(__dirname,'out','clips')));
const SET=arg('set',''), ONLY=arg('only',''), CHS=arg('ch','hermes')==='both'?['hermes','aethon']:[arg('ch','hermes')];
fs.mkdirSync(OUT,{recursive:true});

(async()=>{
  const errors=[]; const browser=await launch(); const page=await load(browser,errors,HTML,['scenarios.js'],SET);
  await page.evaluate(()=>{ stage.width=832; stage.height=468; });
  const names=await page.evaluate(()=>Object.keys(LAB.scen));
  const made=[];
  for (const name of names.filter(n=>!ONLY||ONLY.split(',').includes(n))) for (const ch of CHS){
    let events=[];
    const frames=await page.evaluate(([name,ch])=>{
      const sc=LAB.scen[name]; __seed(sc.seed||3); LAB.setup(ch,{foe:ch,cpu:!!sc.cpu||!!sc.dummy,dummyAway:false}); if (sc.cpu) cpu.level=2;
      sc.setup&&sc.setup();
      const every=sc.every||2, out=[], realPI=playerInput, realCI=cpuInput; let now=1000;
      if (sc.cpu) playerInput=()=>realCI(H,1/60);
      if (sc.dummy){ let k=0; cpuInput=(F,dt)=>F===D?LAB.inp(sc.dummy(k++)):realCI(F,dt); }
      if (typeof SFX==='object') SFX.rec=[];      // log sounds so videos can carry them
      try { for (let i=0;i<sc.frames;i++){
          if (sc.input){ const s=sc.input(i)||{}; playerInput=()=>LAB.inp(s); }
          if (typeof SFX==='object') SFX.frame=i;
          // same time handling as the game loop (KO slow motion)
          if (typeof simDt==='function') step(simDt(1/60)); else { if (koFx){ koFx.t-=1/60; if (koFx.t<=0) koFx=null; } step((1/60)*(koFx&&koFx.t<0.5?0.25:1)); } now+=1000/60; renderStage(now,1/60);
          if (i%every===0) out.push({i,png:stage.toDataURL('image/png'),
            note:(H.mv?H.mv.key+' f'+Math.floor(H.mv.f):H.stun>0?'stun':H.ground?'':'air')+' | '+(D.mv?D.mv.key:D.stun>0?'STUN':D.shielding?'shield':'')+(hitlag>0?' HITLAG':'')+(koFx?' KO-FX':'')}); } }
      finally { playerInput=realPI; cpuInput=realCI; }
      const ev=typeof SFX==='object'&&SFX.rec?SFX.rec:[]; if (typeof SFX==='object') SFX.rec=null;
      return {out,ev,frames:sc.frames}; },[name,ch]).then(r=>{ events=r.ev; return r.out; });
    const dir=path.join(OUT,'_frames',name+'-'+ch); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'events.json'),JSON.stringify(events));
    frames.forEach((f,k)=>fs.writeFileSync(path.join(dir,String(k).padStart(4,'0')+'.png'),Buffer.from(f.png.split(',')[1],'base64')));
    const every=frames.length>1?frames[1].i-frames[0].i:1;
    // GIF at real time
    const gif=path.join(OUT,`${name}-${ch}.gif`);
    execFileSync('ffmpeg',['-y','-loglevel','error','-framerate',String(60/every),'-i',path.join(dir,'%04d.png'),'-vf','scale=624:-1:flags=neighbor,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=none','-r',String(Math.min(30,60/every)),gif]);
    // contact sheets: 4 x 6 tiles, labelled with frame number and state
    const per=24, sheets=[];
    for (let s=0;s*per<frames.length;s++){
      const tiles=[]; frames.slice(s*per,(s+1)*per).forEach((f,k)=>{ const idx=s*per+k; const t=path.join(dir,'t'+String(idx).padStart(4,'0')+'.png');
        execFileSync('convert',[path.join(dir,String(idx).padStart(4,'0')+'.png'),'-filter','point','-resize','416x234','-gravity','north','-background','#111','-splice','0x16','-fill','#fff','-pointsize','12','-annotate','+0+1',`f${f.i}  ${f.note}`,t]); tiles.push(t); });
      const sheet=path.join(OUT,`${name}-${ch}-sheet-${s+1}.png`);
      execFileSync('montage',[...tiles,'-tile','4x','-geometry','+3+3','-background','#333',sheet]); sheets.push(sheet); }
    made.push({name,ch,gif,sheets,frames:frames.length});
    console.log(`${name}-${ch}: ${frames.length} frames -> ${path.basename(gif)}, ${sheets.length} sheet(s)`); }
  fs.writeFileSync(path.join(OUT,'index.json'),JSON.stringify({html:HTML,when:new Date().toISOString(),clips:made,errors},null,1));
  if (errors.length) console.log('PAGE ERRORS:\n'+errors.join('\n'));
  await browser.close();
})().catch(e=>{ console.error(e); process.exit(1); });
