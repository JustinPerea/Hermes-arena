(()=>{ const P=(i,o)=>i===0?o:{}; const tap=(k,extra={})=>i=>i===0?{p:{[k]:true},...extra}:{};
const air=()=>{ H.y-=50; H.ground=false; };
return [
 {ch:'kairos',label:'KAIROS · Hour Bolt',sub:'tap special: quick bolt',frames:70,input:i=>i===0?{p:{special:true}}:{}},
 {ch:'kairos',label:'KAIROS · Hour Bolt',sub:'hold special to charge, let go to fire',frames:150,dx:260,input:i=>({specHeld:i<95,p:{special:i===0}})},
 {ch:'kairos',label:'KAIROS · Orrery Ring',sub:'side special: flies out and comes back',frames:110,x:140,dx:215,input:i=>i===0?{ax:1,p:{special:true}}:{}},
 {ch:'kairos',label:'KAIROS · Stepped Moment',sub:'up special: warps in any direction',frames:90,x:150,dx:300,input:i=>i<10?{up:true,ax:i>0?1:0,p:{special:i===0}}:{}},
 {ch:'kairos',label:'KAIROS · Stilled Instant',sub:'down special: everything inside moves at half speed',frames:150,x:150,dx:280,input:i=>i===0?{down:true,p:{special:true}}:{},dummy:j=>j>30&&j<110?{ax:-1}:j>=110&&j<112?{p:{attack:true}}:{}},
 {ch:'kairos',label:'KAIROS · Meridian',sub:'forward smash',frames:80,dmg:60,input:i=>i<3?{ax:1,atkHeld:true,p:{attack:i===0}}:{},setup:()=>{ startMove(H,'fsmash'); }},
 {ch:'kairos',label:'KAIROS · Zenith',sub:'up smash',frames:75,dx:190,input:i=>({}),setup:()=>{ startMove(H,'usmash'); }},
 {ch:'kairos',label:'KAIROS · Equinox',sub:'down smash',frames:70,dx:200,setup:()=>{ startMove(H,'dsmash'); }},
 {ch:'kairos',label:'KAIROS · Rising Dial',sub:'up tilt',frames:45,dx:190,setup:()=>{ startMove(H,'utilt'); }},
 {ch:'kairos',label:'KAIROS · Orrery',sub:'neutral air',frames:60,dx:200,setup:()=>{ air(); startMove(H,'nair'); }},
 {ch:'kairos',label:'KAIROS · Falling Sand',sub:'down air',frames:60,dx:174,setup:()=>{ H.y-=70; H.ground=false; D.x=172; startMove(H,'dair'); }},
 {ch:'iris',label:'IRIS · Prism Shards',sub:'special: three shards; stalls her in the air',frames:60,input:i=>i===0?{p:{special:true}}:{}},
 {ch:'iris',label:'IRIS · Rainbow Arc',sub:'side special: hold up or down to bend it',frames:60,x:120,dx:330,setup:air,input:i=>({ax:i===0?1:0,up:i>6&&i<20,p:{special:i===0}})},
 {ch:'iris',label:'IRIS · Bridge of Heaven',sub:'up special: leaves a rainbow bridge for 3 seconds',frames:150,x:110,dx:300,input:i=>i<6?{up:true,p:{special:i===0}}:{}},
 {ch:'iris',label:'IRIS · Styx Pour',sub:'down special: a puddle that trips runners',frames:130,x:150,dx:290,input:i=>i===0?{down:true,p:{special:true}}:{},dummy:j=>j>40&&j<90?{ax:-1}:{}},
 {ch:'iris',label:'IRIS · Styx Pour',sub:'in the air the stream spikes',frames:60,x:200,dx:204,setup:()=>{ H.y-=60; H.ground=false; D.y=H.y+40; D.ground=false; },input:i=>i===0?{down:true,p:{special:true}}:{}},
 {ch:'iris',label:'IRIS · Prism Burst',sub:'forward smash',frames:70,dmg:60,dx:205,setup:()=>{ startMove(H,'fsmash'); }},
 {ch:'iris',label:'IRIS · Rainbow Fountain',sub:'up smash',frames:70,dx:185,setup:()=>{ startMove(H,'usmash'); }},
 {ch:'iris',label:'IRIS · Raindrop',sub:'down air',frames:55,dx:172,setup:()=>{ H.y-=60; H.ground=false; D.x=172; startMove(H,'dair'); }},
 {ch:'iris',label:'IRIS · Rainbow Dive',sub:'dash attack',frames:50,x:130,dx:230,setup:()=>{ startMove(H,'dashatk'); }},
]; })()
