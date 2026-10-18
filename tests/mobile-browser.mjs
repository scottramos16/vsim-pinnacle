// Runs a real Chrome/Edge headless instance against the local server.
// Requires the server on :5173. Uses an isolated browser profile, never your own.
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if(!chrome)throw Error('Chrome or Edge is required');
const profile=path.resolve('.test-browser');await mkdir(profile,{recursive:true});
const proc=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=9223',`--user-data-dir=${profile}`,'--window-size=1440,1000','--use-angle=swiftshader','--enable-unsafe-swiftshader','about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ws,seq=0,pending=new Map(),errors=[];
function call(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
try{
  let targets;
  for(let i=0;i<100;i++){try{targets=await(await fetch('http://127.0.0.1:9223/json')).json();break;}catch{await delay(100);}}
  if(!targets)throw Error('Browser debugging endpoint did not start');
  ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  ws.onmessage=event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);if(p){pending.delete(msg.id);msg.error?p.reject(Error(JSON.stringify(msg.error))):p.resolve(msg.result);}}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);else if(msg.method==='Log.entryAdded'&&msg.params.entry.level==='error')errors.push(msg.params.entry);};
  await call('Runtime.enable');await call('Log.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  const initialize=await call('Page.addScriptToEvaluateOnNewDocument',{source:'for(const key of Object.keys(localStorage))if(key.startsWith("pinnacle-"))localStorage.removeItem(key);'});
  await call('Page.navigate',{url:'http://127.0.0.1:5173/?test=1'});
  let ready=false;
  for(let i=0;i<100;i++){ready=await evaluate('!!window.__pinnacle');if(ready)break;await delay(100);}
  assert.ok(ready,'3D app initialized');
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:initialize.identifier});
  await evaluate(`document.querySelector('#ai-reroll').checked=true;for(const id of ['R2','B1','B2']){document.querySelector('#strategy-'+id).value='random';document.querySelector('#tendency-'+id).value='random';document.querySelector('#parking-'+id).value='normal';}document.querySelector('#ai-speed').value=1;localStorage.removeItem('pinnacle-auto-v1');`);
  assert.equal(await evaluate('document.querySelector("#welcome-dialog").open'),true);


  assert.equal(await evaluate('document.body.classList.contains("touch-device")'),true);
  assert.equal(await evaluate('__pinnacle.renderer.shadowMap.enabled'),false);
  assert.equal(await evaluate('document.querySelector("#welcome-dialog").scrollWidth<=document.querySelector("#welcome-dialog").clientWidth+2'),true,'welcome fits phone');
  await evaluate('document.querySelector("#practice-start").click();document.querySelector("#capture-button").click()');await delay(250);
  assert.equal(await evaluate('__pinnacle.game.active'),true);assert.equal(await evaluate('!!document.pointerLockElement'),false);
  assert.equal(await evaluate('document.querySelector("#touch-controls").hidden'),false);
  const bounds=async id=>evaluate('(()=>{const b=document.getElementById('+JSON.stringify(id)+').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()');
  let stick=await bounds('touch-stick'),intake=await bounds('touch-intake');
  const point={x:stick.x+stick.w/2,y:stick.y+stick.h*.18,id:1},second={x:intake.x+intake.w/2,y:intake.y+intake.h/2,id:2};
  const before=await evaluate('({x:__pinnacle.game.robot.x,z:__pinnacle.game.robot.z})');
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
  await call('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point,second]});await delay(400);
  assert.ok(await evaluate('__pinnacle.touchControls.input.drive>.5&&__pinnacle.touchControls.input.intake'),'multitouch drive + intake');
  const after=await evaluate('({x:__pinnacle.game.robot.x,z:__pinnacle.game.robot.z})');assert.ok(Math.hypot(after.x-before.x,after.z-before.z)>1,'touch moves robot');
  await call('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:stick.x+stick.w*.8,y:stick.y+stick.h/2},second]});
  assert.ok(await evaluate('__pinnacle.touchControls.input.turn<0'),'right joystick uses the same turn direction as the right-arrow control');
  await call('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await delay(100);
  assert.equal(await evaluate('__pinnacle.touchControls.input.drive'),0);assert.equal(await evaluate('__pinnacle.touchControls.input.intake'),false);
  await evaluate('document.querySelector("#touch-lift").value=20;document.querySelector("#touch-lift").dispatchEvent(new Event("input"))');await delay(350);assert.ok(await evaluate('__pinnacle.game.robot.lift>3'));
  await evaluate('document.querySelector("#touch-pause").click()');assert.equal(await evaluate('__pinnacle.game.active'),false);assert.equal(await evaluate('__pinnacle.touchControls.liftTarget'),null);
  await evaluate('document.querySelector("#mobile-loaders").click();document.querySelector("#loader-toggle").click()');
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#loader-panel")).display!=="none"'),true);
  let shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,'mobile-portrait.png'),Buffer.from(shot.data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:2,mobile:true});await delay(200);
  for(const id of ['touch-stick','touch-grab','touch-intake','touch-lift']){const b=await bounds(id);assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=845&&b.y+b.h<=391,id+' fits landscape');}
  await evaluate('document.querySelector("#mobile-loaders").click();document.querySelector("#strategy-lab-button").click()');
  assert.equal(await evaluate('document.querySelector("#touch-controls").hidden'),true);
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});await delay(200);
  assert.ok(await evaluate('document.querySelector("#strategy-lab").scrollWidth<=document.querySelector("#strategy-lab").clientWidth+2'),'strategy lab fits phone');
  await evaluate('document.querySelector("#strategy-route").scrollIntoView()');shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,'mobile-strategy.png'),Buffer.from(shot.data,'base64'));

  assert.ok(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+2'), 'whole page fits after rotation');
  await evaluate('document.querySelector("#strategy-back").click();document.querySelector("#auto-start").click()');await delay(250);
  assert.equal(await evaluate('document.querySelector("#touch-controls").hidden'),true);
  assert.ok(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+2'),'autonomous editor fits phone');
  assert.ok(await evaluate('document.querySelector("#autonomous-workspace").scrollWidth<=document.querySelector("#autonomous-workspace").clientWidth+2'),'autonomous steps fit phone');
  await evaluate('__pinnacle.begin("headtohead");document.querySelector("#capture-button").click();__pinnacle.game.tick(120)');await delay(250);
  assert.equal(await evaluate('document.querySelector("#result-dialog").open'),true);
  assert.ok(await evaluate('document.querySelector("#result-dialog").scrollWidth<=document.querySelector("#result-dialog").clientWidth+2'),'match summary fits phone');
  assert.deepEqual(errors,[]);console.log('PASS: mobile portrait/landscape layout, touch drive + intake, lift target, pause reset, loaders, no mouse lock, mobile rendering and Strategy Lab.');
}finally{if(ws?.readyState===1){await Promise.race([call('Browser.close').catch(()=>{}),delay(1000)]);ws.close();}else proc.kill();}
