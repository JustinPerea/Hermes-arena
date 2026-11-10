// shared: load the game page headless with a seeded RNG and its render loop paused, then inject the lab scripts
const fs=require('fs'); const path=require('path'); const LAB=__dirname;
// a seeded Math.random (so CPU matches replay exactly) and a paused render loop
const PRE=`<script>(function(){ let s=1; window.__seed=v=>{ s=(v>>>0)||1; };
  Math.random=function(){ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  const raf=window.requestAnimationFrame.bind(window); window.__paused=false; window.requestAnimationFrame=cb=>window.__paused?0:raf(cb); })();</script>`;

// set: JS run in the page after load and before any probe, e.g. "FEEL.shortHop=300; CHARS.hermes.weight=1"
async function load(browser,errors,HTML,extra=[],set=''){
  const p=await browser.newPage({viewport:{width:1100,height:900}});
  p.on('pageerror',e=>errors.push(String(e.stack||e).split('\n').slice(0,3).join(' | ')));
  const src=fs.readFileSync(HTML,'utf8');
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>'+PRE+src+'</body></html>');
  await p.waitForFunction(()=>typeof step==='function' && typeof H==='object' && CHARS.hermes.anims.attack,null,{timeout:20000});
  await p.waitForTimeout(1500);
  await p.evaluate(()=>{ window.__paused=true; try{ localStorage.removeItem('pxh-tune'); }catch(e){} Object.assign(TUNE,TUNE_DEF); });
  await p.waitForTimeout(100);
  for (const f of ['probes.js',...extra]) await p.addScriptTag({content:fs.readFileSync(path.join(LAB,f),'utf8')});
  if (set) await p.evaluate(js=>{ (0,eval)(js); },set);
  return p; }

// The browser: the installed Google Chrome when there is one (it keeps getting security updates, sandbox on),
// otherwise Playwright's own Chromium.
const CHROME={darwin:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',linux:'/usr/bin/google-chrome',win32:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'}[process.platform];
function launch(opts={}){ const {chromium}=require('playwright'); return chromium.launch(CHROME&&fs.existsSync(CHROME)?{channel:'chrome',...opts}:opts); }

module.exports={load,launch};
