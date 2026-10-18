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
  const initialize=await call('Page.addScriptToEvaluateOnNewDocument',{source:'for(const key of Object.keys(localStorage))if(key.startsWith("pinnacle-"))localStorage.removeItem(key);'});
  await call('Page.navigate',{url:'http://127.0.0.1:5173/?test=1'});
  let ready=false;
  for(let i=0;i<100;i++){ready=await evaluate('!!window.__pinnacle');if(ready)break;await delay(100);}
  assert.ok(ready,'3D app initialized');
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:initialize.identifier});
  await evaluate(`document.querySelector('#ai-reroll').checked=true;for(const id of ['R2','B1','B2']){document.querySelector('#strategy-'+id).value='random';document.querySelector('#tendency-'+id).value='random';document.querySelector('#parking-'+id).value='normal';}document.querySelector('#ai-speed').value=1;localStorage.removeItem('pinnacle-auto-v1');`);
  assert.equal(await evaluate('document.querySelector("#welcome-dialog").open'),true);

  await evaluate('document.querySelector("#opponent-difficulty").value="expert";document.querySelector("#opponent-difficulty").dispatchEvent(new Event("change"));document.querySelector("#difficulty-R2").value="easy";document.querySelector("#match-start").click()');
  assert.deepEqual(await evaluate('__pinnacle.game.bots.map(b=>b.difficulty)'),['easy','expert','expert']);
  assert.ok(await evaluate('JSON.parse(localStorage.getItem("pinnacle-match-v1")).bots.B1.difficulty==="expert"'));
  await evaluate('document.querySelector("#strategy-lab-button").click()');assert.equal(await evaluate('document.querySelector("#strategy-lab").hidden'),false);
  await evaluate('window.labPad={id:"Xbox",connected:true,axes:[0,-1],buttons:Array.from({length:16},()=>({pressed:true}))};Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[window.labPad]})');await delay(150);
  assert.equal(await evaluate('__pinnacle.game.active'),false,'strategy screen blocks controller actions on live match');
  await evaluate('window.labPad.connected=false');
  await evaluate('window.beforeStrategy=JSON.stringify({mode:__pinnacle.game.mode,elapsed:__pinnacle.game.elapsed,objects:__pinnacle.game.objects,poses:__pinnacle.game.allRobots.map(r=>[r.x,r.z])});document.querySelector("#strategy-script").value="drive around and win";document.querySelector("#strategy-script").dispatchEvent(new Event("input"));document.querySelector("#strategy-run").click()');
  assert.ok(await evaluate('document.querySelector("#strategy-run-status").textContent.includes("Line 1")'));
  await evaluate('document.querySelector("#strategy-script").value="0-35: center;35-100: alliance;100-120: park";document.querySelector("#strategy-script").dispatchEvent(new Event("input"));document.querySelector("#lab-count").value=5;document.querySelector("#lab-objective").value="score";document.querySelector("#lab-target").value=0;document.querySelector("#lab-skill-B1").value="hard";document.querySelector("#strategy-run").click()');
  for(let i=0;i<150;i++){if(await evaluate('document.querySelector("#strategy-run-status").textContent.startsWith("Finished")'))break;await delay(100);}
  assert.ok(await evaluate('document.querySelector("#strategy-run-status").textContent.includes("Finished 5 / 5")'));
  assert.ok(await evaluate('document.querySelector("#strategy-metrics").textContent.includes("100.0%")'));
  assert.equal(await evaluate('document.querySelectorAll(".strategy-phase").length'),3);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("pinnacle-strategy-lab-v1")).bots.B1.difficulty'),'hard');
  assert.equal(await evaluate('JSON.stringify({mode:__pinnacle.game.mode,elapsed:__pinnacle.game.elapsed,objects:__pinnacle.game.objects,poses:__pinnacle.game.allRobots.map(r=>[r.x,r.z])})'),await evaluate('window.beforeStrategy'),'worker leaves live match untouched');
  await evaluate('document.querySelector("#strategy-route-time").value=0;document.querySelector("#strategy-route-time").dispatchEvent(new Event("input"))');
  assert.equal(await evaluate('document.querySelector("#strategy-route-clock").textContent'),'0.0 / 120s');
  assert.equal(await evaluate('document.querySelector("#strategy-route-events").textContent'),'No robot actions yet.');
  await evaluate('document.querySelector("#strategy-route-play").click()');await delay(450);
  assert.ok(await evaluate('Number(document.querySelector("#strategy-route-time").value)>0'),'route advances automatically');
  await evaluate('document.querySelector("#strategy-route-play").click();document.querySelector("#strategy-route-time").value=60;document.querySelector("#strategy-route-time").dispatchEvent(new Event("input"));document.querySelector("#strategy-route-focus").value="R1";document.querySelector("#strategy-route-focus").dispatchEvent(new Event("change"))');
  assert.equal(await evaluate('document.querySelector("#strategy-route-clock").textContent'),'60.0 / 120s');
  assert.ok(await evaluate('document.querySelector("#strategy-route-phase").textContent.includes("60.0s remaining")'));
  assert.ok(await evaluate('document.querySelector("#strategy-route-events").textContent.includes("R1")'));
  await evaluate('document.querySelector("#lab-count").value=2;document.querySelector("#lab-intake").checked=false;document.querySelector("#lab-intake").dispatchEvent(new Event("change"));document.querySelector("#strategy-suggest").click()');
  for(let i=0;i<200;i++){if(await evaluate('document.querySelector("#strategy-run-status").textContent.includes("Compared 5 complete plans")'))break;await delay(100);}
  assert.equal(await evaluate('document.querySelectorAll("#strategy-recommendations button").length'),5);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("pinnacle-strategy-lab-v1")).intakeEnabled'),false);
  await evaluate('document.querySelector("#strategy-recommendations button").click()');
  assert.ok(await evaluate('document.querySelector("#strategy-script").value.includes("120")'));
  let shot=await call('Page.captureScreenshot',{format:'png'});await writeFile(path.join(profile,'strategy-lab.png'),Buffer.from(shot.data,'base64'));
  await evaluate('document.querySelector("#lab-count").value=100;document.querySelector("#strategy-run").click();document.querySelector("#strategy-cancel").click()');
  for(let i=0;i<100;i++){if(await evaluate('document.querySelector("#strategy-run-status").textContent.startsWith("Stopped")'))break;await delay(100);}
  assert.ok(await evaluate('document.querySelector("#strategy-run-status").textContent.startsWith("Stopped")'));
  await evaluate('document.querySelector("#lab-count").value=5;document.querySelector("#strategy-run").click();document.querySelector("#strategy-back").click();document.querySelector("#practice-start").click()');
  assert.equal(await evaluate('document.querySelector("#strategy-lab").hidden'),true);assert.equal(await evaluate('__pinnacle.game.mode'),'practice');
  for(let i=0;i<100;i++){if(await evaluate('document.querySelector("#strategy-run-status").textContent.startsWith("Finished")'))break;await delay(100);}
  assert.ok(await evaluate('document.querySelector("#strategy-run-status").textContent.includes("Finished 5 / 5")'));
  assert.deepEqual(errors,[]);console.log('PASS: live opponent skill, typed strategy validation, real background worker, result percentages, live-match isolation, cancellation and continuing in other modes.');
}finally{if(ws?.readyState===1){await Promise.race([call('Browser.close').catch(()=>{}),delay(1000)]);ws.close();}else proc.kill();}
