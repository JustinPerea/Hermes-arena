#!/usr/bin/env node
// Before/after comparison video of scenarios: two builds side by side with a title card per scenario.
// usage: node video.cjs --before old.html [--after new.html] [--only a,b] [--ch hermes] [--out out/compare.mp4] [--slow 2]
// Scenarios play at 1/slow speed (default half speed) except cpu_exchange, which plays in real time.
const {execFileSync}=require('child_process'); const {chromium}=require('playwright'); const {load}=require('./page.cjs'); const fs=require('fs'); const path=require('path');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const BEFORE=path.resolve(arg('before')), AFTER=path.resolve(arg('after',path.join(__dirname,'../game/pixel-hermes.html')));
const ONLY=arg('only','shield_punish,ko_smash,shorthop_aerials,dthrow_followup,cpu_exchange'), CH=arg('ch','hermes');
const OUT=path.resolve(arg('out',path.join(__dirname,'out','compare.mp4'))), SLOW=+arg('slow',2);
const LB=arg('lb','Before'), LA=arg('la','After');
const TMP=path.join(__dirname,'out','vid'); const FONT='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const TITLES={shield_punish:'Blocked forward tilt, defender jumps out of shield with a neutral air',ko_smash:'Forward smash KO at 150%',
  shorthop_aerials:'Short hop neutral air, then short hop forward air',dthrow_followup:'Grab, down throw, chase with up air',
  jab_chain:'Jab 1-2-3',utilt_chain:'Mashing up tilt on a foe at 0%',recovery_far:'Recovering from 210 px out at stage level',recovery_glide:'Aethon recovering from 245 px out: jumps, wingbeats, glide',shield_hits:'Forward tilt and down smash on a shield',cpu_exchange:'CPU Hard vs CPU Hard (real time)'};
const SKIP=process.argv.includes('--reuse');   // reuse frames from the last run
const run=(html,dir)=>SKIP?0:execFileSync('node',[path.join(__dirname,'clips.cjs'),'--html',html,'--out',dir,'--only',ONLY,'--ch',CH],{stdio:'inherit'});
run(BEFORE,path.join(TMP,'before')); run(AFTER,path.join(TMP,'after'));
const ff=a=>execFileSync('ffmpeg',['-y','-loglevel','error',...a]);
const esc=t=>t.replace(/\\/g,'\\\\').replace(/:/g,'\\:').replace(/'/g,"\u2019").replace(/%/g,'\\%');
let tfn=0; const tf=t=>{ const p=path.join(TMP,'t'+(tfn++)+'.txt'); fs.writeFileSync(p,t); return p; };
const parts=[];
// 16-bit stereo WAV from two Float32 channels
const wav=(file,[L,R])=>{ const n=L.length, b=Buffer.alloc(44+n*4); b.write('RIFF',0); b.writeUInt32LE(36+n*4,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(2,22);
  b.writeUInt32LE(44100,24); b.writeUInt32LE(44100*4,28); b.writeUInt16LE(4,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*4,40);
  for (let i=0;i<n;i++){ b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,L[i]))*32767),44+i*4); b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,R[i]))*32767),46+i*4); } fs.writeFileSync(file,b); };
(async()=>{
const browser=await chromium.launch(); const page=await load(browser,[],AFTER); const hasSnd=await page.evaluate(()=>typeof sfxRender==='function');
for (const [k,name] of ONLY.split(',').entries()){
  const fb=path.join(TMP,'before','_frames',`${name}-${CH}`), fa=path.join(TMP,'after','_frames',`${name}-${CH}`);
  const n=Math.min(fs.readdirSync(fb).filter(f=>/^\d+\.png$/.test(f)).length, fs.readdirSync(fa).filter(f=>/^\d+\.png$/.test(f)).length);
  const every=name==='cpu_exchange'?3:2, slow=name==='cpu_exchange'?1:SLOW, fps=60/every/slow;
  const title=path.join(TMP,`p${k}a.mp4`), clip=path.join(TMP,`p${k}b.mp4`);
  ff(['-f','lavfi','-i','color=c=#141826:s=1664x528:d=2:r=30','-f','lavfi','-i','anullsrc=r=44100:cl=stereo','-t','2','-vf',
    `drawtext=fontfile=${FONT}:textfile=${tf(TITLES[name]||name)}:expansion=none:fontcolor=white:fontsize=34:x=(w-tw)/2:y=h/2-40,drawtext=fontfile=${FONT}:textfile=${tf(LB+'  |  '+LA+(slow>1?'   ·   '+(1/slow)+'x speed':''))}:expansion=none:fontcolor=#9fb4ff:fontsize=24:x=(w-tw)/2:y=h/2+20`,
    '-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-ar','44100','-ac','2',title]);
  // sound of the After build (events logged by clips.cjs), stretched in time to the playback speed; the Before side is silent
  const dur=n*every/60*slow+1, evf=path.join(fa,'events.json'), aw=path.join(TMP,`p${k}.wav`);
  const events=fs.existsSync(evf)?JSON.parse(fs.readFileSync(evf,'utf8')).filter(e=>e.f<n*every):[];
  const ch=hasSnd&&events.length?await page.evaluate(async([ev,dur,slow])=>{ const [L,R]=await sfxRender(ev,dur,f=>f/60*slow); return [Array.from(L),Array.from(R)]; },[events,dur,slow]):[new Float32Array(Math.ceil(44100*dur)),new Float32Array(Math.ceil(44100*dur))];
  wav(aw,ch);
  ff(['-framerate',String(fps),'-start_number','0','-i',path.join(fb,'%04d.png'),'-framerate',String(fps),'-start_number','0','-i',path.join(fa,'%04d.png'),'-i',aw,'-filter_complex',
    `[0]trim=end_frame=${n},setpts=PTS-STARTPTS[a];[1]trim=end_frame=${n},setpts=PTS-STARTPTS[b];[a][b]hstack,pad=1664:528:0:60:#141826,`+
    `drawtext=fontfile=${FONT}:textfile=${tf(LB)}:expansion=none:fontcolor=white:fontsize=30:x=416-tw/2:y=16,drawtext=fontfile=${FONT}:textfile=${tf(LA)}:expansion=none:fontcolor=#ffd27a:fontsize=30:x=1248-tw/2:y=16,`+
    `tpad=stop_mode=clone:stop_duration=1,fps=30[v]`,'-map','[v]','-map','2:a','-c:v','libx264','-pix_fmt','yuv420p','-crf','20','-c:a','aac','-ar','44100','-ac','2','-shortest',clip]);
  parts.push(title,clip); }
await browser.close();
const list=path.join(TMP,'list.txt'); fs.writeFileSync(list,parts.map(p=>`file '${p}'`).join('\n'));
ff(['-f','concat','-safe','0','-i',list,'-c','copy',OUT]);
console.log('video ->',OUT);
})().catch(e=>{ console.error(e); process.exit(1); });
