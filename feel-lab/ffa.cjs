// Free-for-all check: four CPUs play whole matches headless in the real page (seeded, so a run repeats exactly).
//   NODE_PATH=$(npm root -g) node ffa.cjs [--html file] [--seeds 12] [--n 4] [--shot out.png]
// Checks that every match ends with one fighter left, that eliminated fighters stay out, that everyone takes part,
// and that positions stay finite. It is a correctness check, not a balance report.
// It also guards online play: a fixed two-fighter match is replayed and its end state compared with net-ver.json. If the
// simulation changed but NET.ver in the game did not, two copies of different builds would start a match and go out of step.
//   --update records the current end state and NET.ver; --fingerprint only prints them (use with --html on an old build).
const path=require('path'); const {load,launch}=require('./page.cjs');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const fs=require('fs');
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html'))), SEEDS=+arg('seeds',12), N=+arg('n',4), SHOT=arg('shot','');
const VERFILE=path.join(__dirname,'net-ver.json'), UPDATE=process.argv.includes('--update'), PRINT=process.argv.includes('--fingerprint');
const results=[]; const check=(name,ok,detail='')=>{ results.push(!!ok); console.log((ok?'  ok    ':'  FAIL  ')+name+(detail?'  ('+detail+')':'')); };
(async()=>{ const browser=await launch(); const errors=[]; const page=await load(browser,errors,HTML);
  const fp=await page.evaluate(()=>{ __seed(1); Object.assign(MS,{p1:'hermes',p2:'aethon',lv:2,stocks:3,time:0,stage:'altar'}); if ('n' in MS) MS.n=2; startMatch(); go('play');
    for (let f=0;f<1500;f++){ simIn={demo:true}; step(1/60); simIn=null; }
    const r=[H,D].map(F=>[F.x,F.y,F.dmg].map(v=>Math.round(v*100)).join(',')+','+F.stocks).join('|'); toMenu('select'); return {ver:typeof NET==='object'&&NET.ver||1,fp:r}; });
  if (PRINT){ console.log(JSON.stringify(fp)); await browser.close(); return; }
  if (UPDATE || !fs.existsSync(VERFILE)){ fs.writeFileSync(VERFILE,JSON.stringify(fp,null,1)+'\n'); console.log('  note  recorded NET.ver '+fp.ver+' in net-ver.json'); }
  const rec=JSON.parse(fs.readFileSync(VERFILE,'utf8'));
  check('the two-fighter simulation matches the one recorded for NET.ver '+rec.ver,rec.fp===fp.fp && rec.ver===fp.ver,
    rec.fp===fp.fp?(rec.ver===fp.ver?'':'NET.ver is now '+fp.ver+': run ffa.cjs --update'):rec.ver===fp.ver?'the simulation changed: raise NET.ver in the game, then run ffa.cjs --update':'run ffa.cjs --update');
  const out=[];
  for (let seed=1;seed<=SEEDS;seed++) out.push(await page.evaluate(([seed,n])=>{ const R=['hermes','aethon','kairos','iris'], stage=seed%2?'kyllene':'altar';
    __seed(seed); Object.assign(MS,{n,p1:R[seed%4],p2:R[(seed+1)%4],p3:R[(seed+2)%4],p4:R[(seed+3)%4],lv:2,stocks:2,time:0,stage}); startMatch(); go('play');
    let f=0, bad='', back=0; const goneAt={};
    for (;f<60*300 && match.over<=0;f++){ simIn={demo:true}; step(1/60); simIn=null;
      for (const F of FS){ if (!Number.isFinite(F.x+F.y+F.vx+F.vy+F.dmg)) bad=bad||'not finite at step '+f; if (F.gone && goneAt[FS.indexOf(F)]===undefined) goneAt[FS.indexOf(F)]=f; if (!F.gone && goneAt[FS.indexOf(F)]!==undefined) back++; if (F.gone && F.stocks>0) bad=bad||'gone with stocks'; } }
    const S=flow.stats, st=FS.map((F,i)=>{ const q=i===0?S.p1:i===1?S.p2:S['p'+(i+1)]||{}; return {ch:F.ch,stocks:F.stocks,dealt:Math.round(q.dealt||0),taken:Math.round(q.taken||0),kos:q.kos||0,sds:q.sds||0}; });
    const r={seed,stage,n:FS.length,frames:f,over:match.over>0,winner:match.winner?FS.indexOf(match.winner):-1,left:FS.filter(F=>F.stocks>0).length,st,bad,back};
    MS.n=2; toMenu('select'); return r; },[seed,N]));
  const ended=out.filter(o=>o.over), secs=ended.map(o=>o.frames/60);
  check(`${N} fighters are in every match`,out.every(o=>o.n===N));
  check('every match ends',ended.length===out.length,`${ended.length} of ${out.length}; ${secs.length?Math.round(Math.min(...secs))+' to '+Math.round(Math.max(...secs))+' s':''}`);
  check('a match ends with exactly one fighter left, and that fighter is the winner',ended.every(o=>o.left===1 && o.winner>=0 && o.st[o.winner].stocks>0));
  check('an eliminated fighter stays out',out.every(o=>o.back===0));
  check('positions stay finite',out.every(o=>!o.bad),out.map(o=>o.bad).filter(Boolean)[0]||'');
  const part=Array.from({length:N},(_,i)=>out.reduce((a,o)=>a+o.st[i].dealt,0)), hurt=Array.from({length:N},(_,i)=>out.reduce((a,o)=>a+o.st[i].taken,0));
  check('every slot deals and takes damage',part.every(v=>v>0) && hurt.every(v=>v>0),'dealt '+part.join(' / ')+', taken '+hurt.join(' / '));
  const wins=Array.from({length:N},(_,i)=>ended.filter(o=>o.winner===i).length);
  console.log('  note  wins by slot: '+wins.join(' / ')+'   self-destructs: '+out.reduce((a,o)=>a+o.st.reduce((b,q)=>b+q.sds,0),0)+', KOs: '+out.reduce((a,o)=>a+o.st.reduce((b,q)=>b+q.kos,0),0));
  if (SHOT){ await page.evaluate(n=>{ __seed(3); Object.assign(MS,{n,p1:'hermes',p2:'aethon',p3:'kairos',p4:'iris',lv:2,stocks:3,stage:'kyllene'}); startMatch(); go('play'); for (let f=0;f<420;f++){ simIn={demo:true}; step(1/60); simIn=null; } renderStage(performance.now(),1/60,{hud:true}); drawFlow(); },N);
    await page.screenshot({path:SHOT,clip:await page.evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {x:r.left,y:r.top+scrollY,width:r.width,height:r.height}; })}); await page.evaluate(()=>{ MS.n=2; toMenu('select'); }); }
  check('no page errors',errors.length===0,errors.slice(0,2).join(' ; '));
  await browser.close(); const bad=results.filter(x=>!x).length; console.log(bad?`${bad} of ${results.length} checks FAILED`:`all ${results.length} checks passed`); process.exit(bad?1:0); })();
