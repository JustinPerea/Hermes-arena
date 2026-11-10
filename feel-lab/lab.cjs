#!/usr/bin/env node
// Hermes Arena feel lab: measures the game against spec.json and writes a scorecard.
// usage: node lab.cjs [--html path] [--out dir] [--quick] [--seeds 3] [--label text] [--set 'FEEL.shortHop=300']
//   --set     JS run in the page before probing: try a change without editing the game
//   --quick   skip the CPU pacing matches (about 10 s instead of ~1-2 min)
// Output: <out>/report.json, <out>/report.md, and one line appended to <lab>/history.jsonl
const fs=require('fs'); const path=require('path'); const crypto=require('crypto');
const LAB=__dirname;
const arg=(k,d)=>{ const i=process.argv.indexOf('--'+k); return i<0?d:(process.argv[i+1]&&!process.argv[i+1].startsWith('--')?process.argv[i+1]:true); };
const HTML=path.resolve(arg('html',path.join(__dirname,'../game/pixel-hermes.html')));
const CHS=String(arg('ch','hermes,aethon')).split(',');
const OUT=path.resolve(arg('out',path.join(LAB,'out')));
const SET=arg('set',''), QUICK=!!arg('quick',false), SEEDS=+arg('seeds',6), LABEL=arg('label','');
const spec=JSON.parse(fs.readFileSync(path.join(LAB,'spec.json'),'utf8'));
fs.mkdirSync(OUT,{recursive:true});

const {load,launch}=require('./page.cjs');

function grade(v,m){ if (v==null||Number.isNaN(v)) return 'fail'; const [a,b]=m.target, [c,d]=m.warn; if (v>=a&&v<=b) return 'pass'; if (v>=c&&v<=d) return 'warn'; return 'fail'; }

(async()=>{
  const t0=Date.now(); const errors=[]; const browser=await launch();
  const page=await load(browser,errors,HTML,[],SET);
  const res={html:HTML, md5:crypto.createHash('md5').update(fs.readFileSync(HTML)).digest('hex').slice(0,10), when:new Date().toISOString(), label:LABEL, set:SET, fighters:{}};
  for (const ch of CHS){
    const r=await page.evaluate(ch=>{ __seed(7); LAB.setup(ch); const mv=LAB.movement(); const ar=LAB.air(); const cb=LAB.combat(); const fd=LAB.framedata(); return {...mv,...ar,...cb,framedata_inband:fd.framedata_inband,_frames:fd.rows}; },ch);
    if (!QUICK){ const ms=[]; for (let s=1;s<=SEEDS;s++) ms.push(await page.evaluate(([ch,s])=>{ __seed(s*101); LAB.setup(ch); return LAB.match(2,240); },[ch,s]));
      const kos=ms.flatMap(m=>m.kos), stocks=kos.length;
      r.sec_per_stock=stocks?+(ms.reduce((a,m)=>a+m.secs,0)/stocks).toFixed(1):999;
      r.ko_pct=stocks?Math.round(kos.reduce((a,k)=>a+k.pct,0)/stocks):0;
      r.timeout_rate=+(ms.filter(m=>m.timeout).length/ms.length).toFixed(2);
      r.self_destructs=stocks?+(kos.filter(k=>k.since>4).length/stocks).toFixed(2):0;
      r.nan_frames=ms.reduce((a,m)=>a+m.nan,0); r.stuck=ms.reduce((a,m)=>a+m.stuck,0);
      r._matches=ms.map(m=>({secs:m.secs,timeout:m.timeout,kos:m.kos,stuckWhat:m.stuckWhat})); }
    res.fighters[ch]=r; }
  res.page_errors=errors.length; res.errors=errors;
  await browser.close();

  // scoring: pass 1, warn 0.5, fail 0, averaged over every metric x fighter
  const rows=[]; let pts=0, n=0; const counts={pass:0,warn:0,fail:0};
  for (const grp in spec){ if (grp.startsWith('_')) continue; for (const id in spec[grp]){ const m=spec[grp][id];
    for (const ch of CHS){ let v=id==='page_errors'?res.page_errors:res.fighters[ch][id];
      if (v===undefined) continue; if (id==='page_errors' && ch==='aethon') continue;
      const g=grade(v,m); counts[g]++; pts+=g==='pass'?1:g==='warn'?0.5:0; n++;
      rows.push({grp,id,ch:id==='page_errors'?'both':ch,label:m.label,v,target:m.target,g}); } } }
  res.score=+(100*pts/n).toFixed(1); res.counts=counts; res.rows=rows; res.secs=Math.round((Date.now()-t0)/1000);
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(res,null,1));

  const icon={pass:'PASS',warn:'warn',fail:'FAIL'};
  let md=`# Feel lab report\n\n${res.when} · html ${res.md5}${LABEL?' · '+LABEL:''}${SET?' · set `'+SET+'`':''}${QUICK?' · quick (no pacing)':''}\n\n**Score ${res.score}/100** · ${counts.pass} pass · ${counts.warn} warn · ${counts.fail} fail · ${res.secs}s\n\n`;
  md+='| | Metric | Fighter | Value | Target |\n|---|---|---|---|---|\n';
  for (const r of rows.sort((a,b)=>({fail:0,warn:1,pass:2})[a.g]-({fail:0,warn:1,pass:2})[b.g])) md+=`| ${icon[r.g]} | ${r.label} | ${r.ch} | ${r.v} | ${r.target.join(' to ')} |\n`;
  for (const ch of CHS){ const f=res.fighters[ch];
    md+=`\n## ${ch} frame data\n\n| Move | Class | Startup | Total | IASA | Landing lag | On shield | Dmg |\n|---|---|---|---|---|---|---|---|\n`;
    for (const x of f._frames) md+=`| ${x.key} | ${x.cls} | ${x.startup}${x.suOk?'':' ⚠'} | ${x.total} | ${x.iasa??''} | ${x.landLag??''} | ${x.shieldAdv}${x.shOk?'':' ⚠'} | ${x.dmg} |\n`;
    md+=`\nRecovery: ${f._recovery_px}px level with the stage · Heights: ${JSON.stringify(f._heights)} · chains: ${JSON.stringify(f._chains)}\n`;
    if (f._matches) md+=`\nMatches: ${f._matches.map(m=>`${m.secs}s${m.timeout?' TIMEOUT':''} KOs [${m.kos.map(k=>k.who+'@'+k.pct+'%'+(k.since>4?' SD':'')).join(', ')}]${m.stuckWhat?' stuck:'+m.stuckWhat:''}`).join(' · ')}\n`; }
  if (errors.length) md+=`\n## Page errors\n\n${errors.map(e=>'- '+e).join('\n')}\n`;
  fs.writeFileSync(path.join(OUT,'report.md'),md);
  fs.appendFileSync(path.join(LAB,'history.jsonl'),JSON.stringify({when:res.when,md5:res.md5,label:LABEL,set:SET,quick:QUICK,score:res.score,counts,fails:rows.filter(r=>r.g==='fail').map(r=>r.id+':'+r.ch)})+'\n');
  console.log(`score ${res.score} (${counts.pass}/${counts.warn}/${counts.fail}) in ${res.secs}s -> ${path.join(OUT,'report.md')}`);
  for (const r of rows.filter(r=>r.g!=='pass')) console.log(`  ${r.g.padEnd(4)} ${r.id.padEnd(20)} ${r.ch.padEnd(7)} ${String(r.v).padEnd(8)} target ${r.target.join('..')}`);
})().catch(e=>{ console.error(e); process.exit(1); });
