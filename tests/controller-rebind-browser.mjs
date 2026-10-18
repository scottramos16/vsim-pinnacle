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

  await evaluate('__pinnacle.begin("practice");document.querySelector("#help-button").click();window.mockPad={id:"Xbox Elite",connected:true,axes:[0,0,0,0],buttons:Array.from({length:22},()=>({pressed:false}))};Object.defineProperty(navigator,"getGamepads",{configurable:true,value:()=>[window.mockPad]})');
  assert.equal(await evaluate('document.querySelectorAll("#pad-mappings select").length'),0);
  assert.equal(await evaluate('document.querySelector("[data-pad-rebind=toggle]").textContent'),'A');
  await evaluate('document.querySelector("[data-pad-rebind=toggle]").click();window.mockPad.buttons[1].pressed=true');for(let i=0;i<30;i++){if(await evaluate('__pinnacle.features().padSettings.buttons.toggle===1'))break;await delay(100);}
  assert.equal(await evaluate('__pinnacle.features().padSettings.buttons.toggle'),1);
  assert.equal(await evaluate('document.querySelector("[data-pad-rebind=toggle]").textContent'),'B');
  await evaluate('document.querySelector("[data-pad-rebind=flip]").click()');await delay(150);
  assert.ok(await evaluate('document.querySelector("[data-pad-rebind=flip]").textContent.includes("Press Xbox")'),'held button was ignored');
  await evaluate('window.mockPad.buttons[1].pressed=false');await delay(400);await evaluate('window.mockPad.buttons[1].pressed=true');for(let i=0;i<30;i++){if(await evaluate('__pinnacle.features().padSettings.buttons.flip===1'))break;await delay(100);}
  assert.equal(await evaluate('__pinnacle.features().padSettings.buttons.flip'),1);assert.equal(await evaluate('__pinnacle.features().padSettings.buttons.toggle'),2);
  assert.ok(await evaluate('document.querySelector("#pad-binding-status").textContent.includes("Swapped")'));
  await evaluate('document.querySelector("[data-pad-rebind=intake]").click()');await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate('document.querySelector("#help-dialog").open'),true);assert.equal(await evaluate('document.querySelector("#pad-bind-cancel").hidden'),true);
  assert.equal(await evaluate('JSON.parse(localStorage.getItem("pinnacle-pad-v1")).buttons.flip'),1);assert.equal(await evaluate('__pinnacle.game.started'),false);
  assert.deepEqual(errors,[]);console.log('PASS: Xbox press-to-bind UI, named buttons, held-button protection, assignment swapping, persistence and Escape cancellation.');
}finally{if(ws?.readyState===1){await Promise.race([call('Browser.close').catch(()=>{}),delay(1000)]);ws.close();}else proc.kill();}
