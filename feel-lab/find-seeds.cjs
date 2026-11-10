#!/usr/bin/env node
// Find a seed where a dice-rolling scenario shows what it is meant to show (its ok() turns true).
// It steps and draws exactly as clips.cjs does: drawing rolls dice too, so a seed found without it would not replay.
// usage: node find-seeds.cjs --only cpu_counter --ch hermes [--max 80] [--html path]
const path=require('path'); const {load,launch}=require('./page.cjs');
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:process.argv[i+1]; };
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html'))), ONLY=String(arg('only','')).split(','), CH=arg('ch','hermes'), MAX=+arg('max',80);
(async()=>{ const errors=[]; const b=await launch(); const page=await load(b,errors,HTML,['scenarios.js']);
  await page.evaluate(()=>{ stage.width=832; stage.height=468; });
  for (const name of ONLY){ const hits=await page.evaluate(([name,ch,MAX])=>{ const sc=LAB.scen[name], hits=[], realPI=playerInput, realCI=cpuInput; let now=1000;
      { const st=sc.stage||'altar'; if (STAGE.id!==st){ loadStage(st); resetFighters(); } }
      for (let seed=1;seed<=MAX&&hits.length<3;seed++){ __seed(seed); now=1000; LAB.setup(ch,{foe:ch,cpu:true,dummyAway:false}); cpu.level=2; sc.setup&&sc.setup();
        try { for (let i=0;i<sc.frames;i++){ if (sc.input){ const s=sc.input(i)||{}; playerInput=()=>LAB.inp(s); } else playerInput=()=>realCI(H,1/60);
            step(simDt(1/60)); now+=1000/60; renderStage(now,1/60); if (sc.ok()){ hits.push(seed+' (f'+i+')'); break; } } } finally { playerInput=realPI; } }
      return hits; },[name,CH,MAX]);
    console.log(name.padEnd(12),CH.padEnd(7),hits.length?'seeds: '+hits.join(', '):'no seed found in 1..'+MAX); }
  if (errors.length) console.log('PAGE ERRORS:\n'+errors.join('\n')); await b.close(); })().catch(e=>{ console.error(e); process.exit(1); });
