#!/usr/bin/env node
// Try several candidate changes and compare them to the current game, metric by metric.
// usage: node sweep.cjs [--full] [--html path] --try "FEEL.shortHop=290" --try "FEEL.shortHop=310; FEEL.stunK=0.0028" ...
// Prints each candidate's score and every metric whose grade or value moved. Reports go to out/sweep/<n>/.
const {execFileSync}=require('child_process'); const fs=require('fs'); const path=require('path');
const argv=process.argv.slice(2), tries=[], pass=[]; let full=false;
for (let i=0;i<argv.length;i++){ if (argv[i]==='--try') tries.push(argv[++i]); else if (argv[i]==='--full') full=true; else pass.push(argv[i]); }
const run=(set,dir)=>{ execFileSync('node',[path.join(__dirname,'lab.cjs'),...(full?[]:['--quick']),'--out',dir,'--label','sweep',...(set?['--set',set]:[]),...pass],{stdio:'pipe'});
  return JSON.parse(fs.readFileSync(path.join(dir,'report.json'),'utf8')); };
const OUT=path.join(__dirname,'out','sweep'); fs.rmSync(OUT,{recursive:true,force:true});
const base=run('',path.join(OUT,'0-base'));
const key=r=>r.id+':'+r.ch, bm=new Map(base.rows.map(r=>[key(r),r]));
console.log(`base: score ${base.score} (${base.counts.pass}/${base.counts.warn}/${base.counts.fail})`);
tries.forEach((t,k)=>{ const r=run(t,path.join(OUT,(k+1)+'')); const d=r.score-base.score;
  console.log(`\n[${k+1}] ${t}\n    score ${r.score} (${d>=0?'+':''}${d.toFixed(1)})  ${r.counts.pass}/${r.counts.warn}/${r.counts.fail}${r.page_errors?'  PAGE ERRORS '+r.page_errors:''}`);
  for (const x of r.rows){ const b=bm.get(key(x)); if (!b || (b.v===x.v && b.g===x.g)) continue;
    console.log(`    ${x.g!==b.g?(x.g==='pass'||(x.g==='warn'&&b.g==='fail')?'▲':'▼'):' '} ${key(x).padEnd(28)} ${String(b.v).padStart(7)} -> ${String(x.v).padEnd(7)} ${b.g}->${x.g}  target ${x.target.join('..')}`); } });
