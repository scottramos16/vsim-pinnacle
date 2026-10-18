import {TouchControls} from './touch-controls.js';
import * as THREE from './vendor/three.module.js';
import { Game, PIN_HEIGHT, MAX_LIFT, LOADER_DEFS } from './game.js';
import { CONTROL_ACTIONS, SETTINGS_KEY, DECOR_COLORS, defaultSettings, readSettings, rebind, keyName } from './controls.js';
import { ROLE_NAMES } from './ai.js';
import { showSummary } from './summary-view.js';
import {EditHistory,captureWorld,restoreWorld,editField,explainGoal,CHALLENGES,challengeProgress,ghostPose} from './practice-tools.js';
import {PadInput,defaultPad,readPad,PAD_ACTIONS,PadRebinder,rebindPad,xboxButtonName} from './controller.js';
import {GameAudio} from './audio.js';
import {ReplayPlayback} from './replay-playback.js';
import {DIFFICULTIES,STRATEGY_ACTIONS,defaultProgram,validateProgram,parseStrategy,strategyText} from './ai-profiles.js';
import {defaultBatch,validateBatch} from './strategy-simulation.js';
import { AUTO_ACTIONS,AutoRunner,defaultSequence,validateSequence,predictAutonomous,configureTrial,reliabilityTest } from './autonomous.js';

const $ = id => document.getElementById(id);
const game = new Game();
const touchDevice=matchMedia('(pointer: coarse)').matches||navigator.maxTouchPoints>0;
let touchControls=null;
document.body.classList.toggle('touch-device',touchDevice);
let autoSteps=defaultSequence(),autoRunner=new AutoRunner(autoSteps);
try{const stored=JSON.parse(localStorage.getItem('pinnacle-auto-v1'));if(validateSequence(stored))autoSteps=stored;}catch{}
const colors = { red: 0xe94651, blue: 0x219bd6, yellow: 0xf4d84b, neutral: 0x292e2d, center: 0x252b28 };
const cssColors = { red: '#f35b62', blue: '#44b4f1', yellow: '#f3d956', neutral: '#bcc5ba', center: '#c6f36b' };
let renderer, scene, camera, robotMesh, carriage, fingers, targetRing;
let objectMeshes = new Map(), rollerMeshes = new Map(), loaderMeshes = [], keys = new Set();
let settings=readSettings({getItem:key=>localStorage.getItem(key)}),bindingAction=null;
const shortcut=action=>keyName(settings.bindings[action]);
let toastUntil = 0, lastTime = performance.now(), uiElapsed = 0;
let cameraInitialized = false, dragX = null, fallbackMouse = false, finishShown = false;
const wheels = [], cascadeStages = [], lookAt = new THREE.Vector3();
const intakeRollers=[],botMeshes=new Map();
const dr4bLinks=[];let fixedCascade,dr4b,topperGroup;
let spectator, spectatorArm;
let loaderPreview,menuPreview;
let autoPrediction=null,autoPreviewTime=0;
let autoStart={x:-61,z:-60,heading:Math.PI/2},selectedSetup=null,autoEditHistory=null,fieldEditHistory=null,fieldSelection=null,replayFrames=[],replayTime=null,replayModel=null,recordAt=0,challenge=null,challengeState=null,ghostMesh=null,ghostData=null,comparisonPrediction=null,challengeMarkers=[],contactShake=0,previousSpeed=0;
const playback=new ReplayPlayback();let playbackContext=null;
let strategyTextDirty=false;
const strategyPlayback=new ReplayPlayback();strategyPlayback.time=120;
let strategyWorker=null,strategyRunning=false,strategyResults=null,strategyConfig=readLocal('pinnacle-strategy-lab-v1',defaultBatch());if(validateBatch(strategyConfig))strategyConfig=defaultBatch();
const padRebinder=new PadRebinder();
const padReader=new PadInput();let padSettings=readPad(readLocal('pinnacle-pad-v1',null));
const audio=new GameAudio(readLocal('pinnacle-audio-v1',{}));
const welcome = $('welcome-dialog'), help = $('help-dialog'), result = $('result-dialog');

function material(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: .58, metalness: .12, ...extra }); }
const steel = material(0xbac6c6, { metalness: .7, roughness: .32 });
const darkSteel = material(0x263135, { metalness: .55, roughness: .5 });
const rubber = material(0x131b1d, { roughness: .94, metalness: 0 });
const lime = material(0xc6f36b, { roughness: .48 });
const playerDecor=material(0xc6f36b,{roughness:.48});
const cupDark = material(0x4b5052, { roughness: .65, side: THREE.DoubleSide });
const cupClear = material(0xc9e4dc, { transparent: true, opacity: .25, depthWrite: false, side: THREE.DoubleSide, metalness: .15, roughness: .2 });
const pinMaterials = Object.fromEntries(['red','blue','yellow'].map(c => [c,material(colors[c],{ roughness: .42 })]));

function mesh(parent, geometry, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, mat); m.position.set(x,y,z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}
function box(parent,w,h,d,mat,x=0,y=0,z=0) { return mesh(parent,new THREE.BoxGeometry(w,h,d),mat,x,y,z); }
function cylinder(parent,rt,rb,h,mat,x=0,y=0,z=0,open=false) { return mesh(parent,new THREE.CylinderGeometry(rt,rb,h,32,1,open),mat,x,y,z); }
function torus(parent,r,t,mat,x,y,z) { const m=mesh(parent,new THREE.TorusGeometry(r,t,8,40),mat,x,y,z); m.rotation.x=Math.PI/2; return m; }
function label(text, color = '#c6d4ce', size = 6) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.font = '500 50px Segoe UI, sans-serif'; ctx.textAlign='center'; ctx.fillText(text,256,80);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,opacity:.8,depthWrite:false})); sprite.scale.set(size*4,size,1); return sprite;
}
function floorText(text, x,z,width,height,color) {
  const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=256;
  const ctx=canvas.getContext('2d'); ctx.fillStyle=color; ctx.font='650 145px Segoe UI'; ctx.textAlign='center'; ctx.fillText(text,512,180);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const m=mesh(scene,new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false}),x,.03,z); m.rotation.x=-Math.PI/2; m.castShadow=false; return m;
}
function buildScene() {
  scene=new THREE.Scene(); scene.background=new THREE.Color(0x18262a); scene.fog=new THREE.FogExp2(0x18262a,.0028);
  camera=new THREE.PerspectiveCamera(53,innerWidth/innerHeight,.1,1600);
  renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.75)); renderer.setSize(document.documentElement.clientWidth,document.documentElement.clientHeight,false);
  renderer.shadowMap.enabled=!touchDevice; renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
  renderer.domElement.setAttribute('aria-label','Pinnacle 3D field. Click to capture the mouse and drive.'); renderer.domElement.tabIndex=0;
  $('viewport').appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe0f5ee,0x3a4846,2.1));
  const sun=new THREE.DirectionalLight(0xfff3dc,3.1); sun.position.set(-65,160,-90); sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048); Object.assign(sun.shadow.camera,{left:-120,right:120,top:120,bottom:-120,near:1,far:400}); sun.shadow.bias=-.00025; sun.shadow.normalBias=.08; scene.add(sun);
  const fill=new THREE.DirectionalLight(0x8acfd9,1); fill.position.set(100,50,80); scene.add(fill);
  box(scene,150,3,150,material(0x111c20),0,-1.65,0);
  const ground=mesh(scene,new THREE.PlaneGeometry(2400,2400),material(0x152226,{roughness:.95}),0,-3.3,0); ground.rotation.x=-Math.PI/2; ground.castShadow=false;
  for(let ix=0;ix<6;ix++) for(let iz=0;iz<6;iz++) {
    const tone=(ix+iz)%2===0?0x879191:0x818c8c;
    const tile=box(scene,23.87,.22,23.87,material(tone,{roughness:.98,metalness:0}),-60+ix*24,-.12,-60+iz*24); tile.castShadow=false;
  }
  const tape=material(0xe4e9e2,{roughness:1,metalness:0});
  for(const x of [-24,24]) box(scene,.55,.035,144,tape,x,.025,0).castShadow=false;
  for(const z of [-24,24]) box(scene,48,.035,.55,tape,0,.025,z).castShadow=false;
  // Low-key zone lettering lies outside the field, leaving competition markings clean.
  floorText('RED ZONE',-84,0,7,38,'#d26065').rotation.z=-Math.PI/2;
  floorText('BLUE ZONE',84,0,7,38,'#4893b4').rotation.z=Math.PI/2;
  floorText('P I N N A C L E',0,84,63,8,'#627c75');
  const rail=material(0x59696b,{metalness:.8,roughness:.4});
  const glass=material(0xb6d0d2,{transparent:true,opacity:.1,depthWrite:false,roughness:.2,side:THREE.DoubleSide});
  for(const x of [-73,73]) { box(scene,.8,11.6,145,glass,x,6,0).castShadow=false; box(scene,1.3,1.2,147,rail,x,12,0); box(scene,1.4,1.3,147,rail,x,.5,0); }
  for(const z of [-73,73]) { box(scene,147,11.6,.8,glass,0,6,z).castShadow=false; box(scene,147,1.2,1.3,rail,0,12,z); box(scene,147,1.3,1.4,rail,0,.5,z); }
  for(const x of [-73,73]) for(const z of [-73,-24,24,73]) box(scene,1.6,12,1.5,rail,x,6,z);
  for(const g of game.goals) {
    const group=new THREE.Group(); group.position.set(g.x,0,g.z); scene.add(group);
    const mat=material(colors[g.color],{roughness:.47});
    cylinder(group,3.6,4.0,1.0,mat,0,.5,0);
    cylinder(group,2.5,3.4,g.height-1,mat,0,(g.height+1)/2,0,true);
    torus(group,2.5,.24,mat,0,g.height,0);
    cylinder(group,1.65,1.65,.12,rubber,0,g.height-.6,0);
    for(let k=0;k<4;k++) cylinder(group,.16,.16,.12,steel,Math.cos(k*Math.PI/2)*3.25,1.04,Math.sin(k*Math.PI/2)*3.25);
  }
  for(const [zone,x,z,rot] of [['red',-73,0,Math.PI/2],['blue',73,0,Math.PI/2],['north',0,-73,0],['south',0,73,0]]) {
    const group=new THREE.Group(); group.position.set(x,14.2,z); group.rotation.y=rot; scene.add(group);
    const surface=box(group,26,2.4,2.8,material(colors.yellow),0,0,0); rollerMeshes.set(zone,surface);
    group.name=`wall-top-roller-${zone}`;
    for(const s of [-1,1]) box(group,1.3,3.2,3.4,darkSteel,s*14,-.6,0);
  }
  // A small cheering robot outside the perimeter. Visual only: no game objects,
  // collisions, scoring callbacks, or changes to the simulation's random state.
  spectator=new THREE.Group();spectator.name='sideline-spectator';spectator.position.set(-89,-1,42);spectator.rotation.y=Math.PI/2;scene.add(spectator);
  cylinder(spectator,5,5,.7,darkSteel,0,-1.5,0);
  for(const x of [-2,2]){box(spectator,1.7,3.5,2.3,darkSteel,x,.6,0);box(spectator,2.3,1,3,lime,x,-.6,.5);}
  box(spectator,6,5,3.4,lime,0,4.2,0);box(spectator,7,4.5,4.3,steel,0,9.3,0);
  box(spectator,5.8,2.6,.25,rubber,0,9.5,2.25);
  const eyeMat=material(0xc6f36b,{emissive:0xc6f36b,emissiveIntensity:.7});
  for(const x of [-1.5,1.5])box(spectator,.7,.8,.3,eyeMat,x,9.7,2.45);
  cylinder(spectator,.16,.16,2,steel,0,12.4,0);mesh(spectator,new THREE.SphereGeometry(.5,12,8),lime,0,13.6,0);
  box(spectator,1.4,4,1.4,steel,-4,4.5,0);
  spectatorArm=new THREE.Group();spectatorArm.position.set(4,6.1,0);spectator.add(spectatorArm);
  box(spectatorArm,1.4,4,1.4,steel,0,1.8,0);box(spectatorArm,2,1.5,1.7,lime,0,4.4,0);
  const cheer=label('GO, DRIVER!','#c6f36b',2.2);cheer.position.set(0,17,0);spectator.add(cheer);
  for(const l of LOADER_DEFS) {
    const group=new THREE.Group(); group.name=`auto-loader-${loaderMeshes.length}`;group.position.set(l.x,0,l.z); scene.add(group);
    const mat=material(colors[l.side],{roughness:.5});
    const wallDirection=Math.sign(l.x),back=wallDirection*4.2;
    // Photo reference: a wall-mounted upright with two guide rods and red/blue
    // brackets. The carriage slides up the post to present the load above the rail.
    box(group,1.0,18,6,darkSteel,back,9,0);
    for(const z of [-2.15,2.15]){
      cylinder(group,.13,.13,17,steel,back-wallDirection*.7,9,z);
      for(const y of [1.2,12.8]){
        const bolt=cylinder(group,.24,.24,.18,steel,back-wallDirection*.65,y,z);bolt.rotation.z=Math.PI/2;
      }
      const brace=box(group,3.2,.65,.65,mat,back-wallDirection*1.3,1.2,z);brace.rotation.z=-wallDirection*.8;
    }
    const handle=new THREE.Group();handle.name=`loader-upper-handle-${loaderMeshes.length}`;group.add(handle);
    box(handle,5,.55,6.8,mat,back-wallDirection*1.3,.4,0);
    box(handle,.55,1.8,6.8,mat,back+wallDirection*1.1,-.3,0);
    const tray=new THREE.Group();group.add(tray);
    tray.name=`loader-carriage-${loaderMeshes.length}`;
    box(tray,6,.4,5,mat,0,-.2,0);
    for(const z of [-2.5,2.5]) box(tray,6,1.2,.3,mat,0,.5,z);
    box(tray,.4,1.5,5,mat,Math.sign(l.x)*3,.6,0);
    box(tray,.6,3,5.8,mat,back-wallDirection*.9,-.8,0);
    for(const z of [-2,2]){
      const arm=box(tray,4.5,.55,.55,mat,wallDirection*1.6,-1.2,z);arm.rotation.z=wallDirection*.38;
      cylinder(tray,.3,.3,1,steel,back-wallDirection*.8,-.5,z);
    }
    loaderMeshes.push({tray,handle});
  }
  robotMesh=new THREE.Group(); scene.add(robotMesh);
  robotMesh.name='player-robot';
  box(robotMesh,14,2,16,darkSteel,0,3,0);
  for(const x of [-6.5,6.5]) {
    box(robotMesh,1,1.5,17,steel,x,4,0);
    for(const z of [-6,0,6]) {
      const wheel=cylinder(robotMesh,2,2,1.9,rubber,x+Math.sign(x)*1.1,2.2,z); wheel.name=`drive-wheel-${wheels.length}`;wheel.rotation.z=Math.PI/2; wheels.push(wheel);
      const hub=cylinder(robotMesh,.9,.9,2.02,steel,x+Math.sign(x)*1.1,2.2,z); hub.rotation.z=Math.PI/2;
      for(let k=0;k<8;k++) {
        const tread=box(wheel,1.1,2.05,.38,rubber,1.85*Math.cos(k*Math.PI/4),0,1.85*Math.sin(k*Math.PI/4)); tread.rotation.y=-k*Math.PI/4;
      }
    }
  }
  box(robotMesh,11,.6,11,steel,0,4.3,-1.5);
  box(robotMesh,5.4,1.6,4.2,darkSteel,0,5.5,-3);
  box(robotMesh,4.6,.15,3.1,material(0x44676c),0,6.36,-3);
  for(const x of [-4,4]) box(robotMesh,1,1.2,5,material(0x252c28),x,5.3,-4);
  for(const x of [-6,6]) {
    box(robotMesh,.2,2.5,6,material(colors.red),x,5.5,0);
    for(const z of [-2,0,2]) cylinder(robotMesh,.18,.18,.08,steel,x,7,z);
  }
  // Rear-mouth funnel, transverse rubber rollers, and a rising internal belt.
  // Pins follow the same local path in game.js before reaching the front claw.
  for(const sign of [-1,1]){
    const funnel=box(robotMesh,.55,2,7,lime,sign*6,2,-11);funnel.rotation.y=-sign*.3;
    const rail=box(robotMesh,.45,1,17,steel,sign*4.7,4,-3);rail.rotation.x=-.28;
  }
  for(let i=0;i<7;i++){
    const rotor=new THREE.Group();rotor.position.set(0,1.5+i*.72,-13+i*2.7);robotMesh.add(rotor);
    const roll=cylinder(rotor,.73,.73,9,rubber);roll.rotation.z=Math.PI/2;
    box(rotor,8.7,.2,.18,lime,0,.74,0);intakeRollers.push(rotor);
  }
  // Three nested cascade stages; the carriage rises continuously with A / D.
  fixedCascade=new THREE.Group();fixedCascade.name='cascade-fixed';robotMesh.add(fixedCascade);
  for(const x of [-4,4]) { box(fixedCascade,.85,15,1.1,steel,x,10.5,5); box(fixedCascade,.22,14,.25,darkSteel,x,10.5,5.65); }
  box(fixedCascade,9,.8,1.2,darkSteel,0,18,5);
  dr4b=new THREE.Group();dr4b.name='dr4b-lift';robotMesh.add(dr4b);
  for(const x of [-4.5,4.5])for(const stage of [0,1])for(const offset of [0,1.5]){
    const link=box(dr4b,.6,1,.7,stage?lime:steel);dr4bLinks.push({link,x,stage,offset});
  }
  for(const x of [-4.5,4.5]){const hub=cylinder(dr4b,1,1,1.2,darkSteel,x,4,5);hub.rotation.z=Math.PI/2;}
  for(let stage=1;stage<=3;stage++) {
    const group=new THREE.Group();robotMesh.add(group);cascadeStages.push(group);
    group.name=`cascade-stage-${stage}`;
    const halfWidth=4-stage*.62;
    for(const x of [-halfWidth,halfWidth])box(group,.52,15,.65,steel,x,10.5,5.2+stage*.28);
    box(group,halfWidth*2+.6,.45,.75,darkSteel,0,18,5.2+stage*.28);
  }
  carriage=new THREE.Group(); robotMesh.add(carriage);
  carriage.name='robot-carriage';
  box(carriage,6,.8,1.2,darkSteel,0,1,5.8);
  box(carriage,6,1,7,steel,0,0,8.5);
  box(carriage,5,.65,2,darkSteel,0,0,11.5);
  fingers=[];
  for(const sign of [-1,1]) {
    const finger=box(carriage,.5,2.4,4,lime,sign*2,0,12); fingers.push(finger);
    box(finger,.6,2.2,.6,rubber,0,0,1.5);
  }
  const front=label('01','#e4efdc',1.6);front.name='robot-number';front.position.set(0,7,-8.1); robotMesh.add(front);
  const ringMat=new THREE.MeshBasicMaterial({color:0xc6f36b,transparent:true,opacity:.8,depthWrite:false});
  targetRing=torus(scene,4,.12,ringMat,0,.3,0); targetRing.castShadow=false; targetRing.receiveShadow=false; targetRing.visible=false;
  window.addEventListener('resize',resizeAutonomousViewport);
}

function createObjectMesh(o,parent=scene) {
  const group=new THREE.Group(), bottomGroup=new THREE.Group(),topGroup=new THREE.Group(); group.add(bottomGroup,topGroup);
  if(o.type==='pin') {
    cylinder(bottomGroup,1.62,.65,3.12,pinMaterials[o.bottom],0,-1.62,0);
    cylinder(topGroup,.65,1.62,3.12,pinMaterials[o.top],0,1.62,0);
    cylinder(bottomGroup,1.88,1.88,.26,pinMaterials[o.bottom],0,-.13,0);
    cylinder(topGroup,1.88,1.88,.26,pinMaterials[o.top],0,.13,0);
    cylinder(topGroup,.66,.66,.09,rubber,0,3.25,0);
  } else {
    cylinder(bottomGroup,.73,1.68,3.16,o.clearUp?cupDark:cupClear,0,-1.62,0,true);
    cylinder(topGroup,1.68,.73,3.16,o.clearUp?cupClear:cupDark,0,1.62,0,true);
    torus(bottomGroup,1.68,.1,o.clearUp?cupDark:cupClear,0,-3.2,0);
    torus(topGroup,1.68,.1,o.clearUp?cupClear:cupDark,0,3.2,0);
    cylinder(group,.76,.76,.2,cupDark);
  }
  group.userData={bottomGroup,topGroup,signature:'',objectType:o.type}; parent.add(group); return group;
}
function updateObjectMesh(o,m) {
  m.position.set(o.x,o.y,o.z); m.rotation.set(0,o.yaw,0);
  if(o.inIntake)m.rotation.x=o.intakeTilt;else if(o.lying)m.rotation.x=Math.PI/2;
  const signature=`${o.top}:${o.bottom}:${o.clearUp}`;
  if(o.falling)m.rotation.x=o.fallTilt||0;
  if(o.held){m.rotation.x=o.stackTiltX||0;m.rotation.z=o.stackTiltZ||0;}
  if(m.userData.signature!==signature) {
    const {bottomGroup,topGroup}=m.userData;
    const set=(group,mat)=>group.traverse(child=>{if(child.isMesh && child.material!==rubber)child.material=mat;});
    set(bottomGroup,o.type==='pin'?pinMaterials[o.bottom]:o.clearUp?cupDark:cupClear);
    set(topGroup,o.type==='pin'?pinMaterials[o.top]:o.clearUp?cupClear:cupDark);
    m.userData.signature=signature;
  }
}
function syncObjects(view=game) {
  const ids=new Set(view.objects.map(o=>o.id));
  for(const [id,m] of objectMeshes) if(!ids.has(id)) {m.traverse(c=>{if(c.isMesh)c.geometry.dispose();c.userData.scoreTint?.dispose();});scene.remove(m);objectMeshes.delete(id);}
  for(const o of view.objects) {
    let m=objectMeshes.get(o.id);if(m&&m.userData.objectType!==o.type){m.traverse(c=>{if(c.isMesh)c.geometry.dispose();c.userData.scoreTint?.dispose();});scene.remove(m);objectMeshes.delete(o.id);m=null;} if(!m){m=createObjectMesh(o);objectMeshes.set(o.id,m);} updateObjectMesh(o,m);
  }
}
function resetMeshes() {
  for(const m of objectMeshes.values()){m.traverse(c=>{if(c.isMesh)c.geometry.dispose();c.userData.scoreTint?.dispose();});scene.remove(m);}objectMeshes.clear();
  for(const m of botMeshes.values())scene.remove(m);botMeshes.clear();
  for(const bot of game.bots){
    const m=robotMesh.clone(true);m.name=`ai-${bot.id}`;
    m.getObjectByName('player-topper')?.removeFromParent();m.getObjectByName('dr4b-lift').visible=false;m.getObjectByName('cascade-fixed').visible=true;
    for(let i=1;i<=3;i++)m.getObjectByName(`cascade-stage-${i}`).visible=true;
    m.traverse(c=>{if(c.isMesh&&c.userData.decoration)c.material=lime;});
    m.traverse(c=>{if(c.isMesh&&c.material.color?.getHex()===colors.red){c.material=c.material.clone();c.material.color.setHex(colors[bot.color]);}});
    const old=m.getObjectByName('robot-number');old?.removeFromParent();
    const number=label(bot.id,cssColors[bot.color],2);number.position.set(0,8,-8);m.add(number);
    const tag=label(`${bot.id} · ${ROLE_NAMES[bot.role]}`,cssColors[bot.color],2.2);tag.position.set(0,25,0);m.add(tag);m.userData.roleTag=tag;m.userData.role=bot.role;
    scene.add(m);botMeshes.set(bot.id,m);
  }
}
function renderFrame(dt) {
  const view=replayTime!==null?replayDisplay():autonomousDisplay(dt);
  const cheerTime=performance.now()/1000;
  spectatorArm.rotation.z=-.4+Math.sin(cheerTime*2.4)*.35;
  spectator.position.y=-1+Math.sin(cheerTime*2.4)*.2;
  const r=view.robot; robotMesh.position.set(r.x,0,r.z);robotMesh.rotation.y=r.heading;robotMesh.rotation.z=Math.sin(performance.now()*.08)*contactShake*.025;
  carriage.position.y=r.lift+PIN_HEIGHT/2;
  cascadeStages.forEach((stage,index)=>{stage.position.y=r.lift*(index+1)/4;});
  const rise=(r.lift+PIN_HEIGHT/2-4)/2,reach=Math.sqrt(Math.max(1,17*17-rise*rise));
  for(const {link,x,stage,offset} of dr4bLinks){
    const a=new THREE.Vector3(x,4+(stage?rise:0)+offset,stage?5-reach:5),b=new THREE.Vector3(x,4+(stage?2*rise:rise)+offset,stage?5:5-reach);
    const direction=b.clone().sub(a);link.position.copy(a).add(b).multiplyScalar(.5);link.scale.y=direction.length();link.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize());
  }
  for(let i=0;i<fingers.length;i++) fingers[i].position.x=(i===0?-1:1)*(view.held?1.95:3);
  for(const w of wheels) w.rotation.x+=r.speed*dt/2;
  if(view.active&&view.intake.running)for(const rotor of intakeRollers)rotor.rotation.x-=dt*13;
  for(const bot of view.bots){
    const visual=botMeshes.get(bot.id);if(!visual)continue;visual.position.set(bot.x,0,bot.z);visual.rotation.y=bot.heading;
    visual.getObjectByName('robot-carriage').position.y=bot.lift+PIN_HEIGHT/2;
    for(let i=1;i<=3;i++)visual.getObjectByName(`cascade-stage-${i}`).position.y=bot.lift*i/4;
    if(visual.userData.role!==bot.role){const old=visual.userData.roleTag;old.material.map.dispose();old.material.dispose();old.removeFromParent();const tag=label(`${bot.id} · ${ROLE_NAMES[bot.role]}`,cssColors[bot.color],2.2);tag.position.set(0,25,0);visual.add(tag);visual.userData.roleTag=tag;visual.userData.role=bot.role;}
  }
  clearScoringTints();syncObjects(view);applyScoringTints(view);
  view.loaders.forEach((loader,i)=>{
    const visual=loaderMeshes[i];visual.tray.position.y=loader.deck;
    visual.handle.position.y=loader.handle;
  });
  for(const [zone,m] of rollerMeshes) m.material.color.setHex(colors[view.rollers[zone]]);
  const target=view.placementTarget(),candidate=!view.held?view.pickCandidate():null;
  if(target){targetRing.visible=true;targetRing.position.set(target.goal.x,target.y+.15,target.goal.z);targetRing.material.color.setHex(target.valid?0xc6f36b:0xffaa66);}
  else if(candidate){targetRing.visible=true;targetRing.position.set(candidate.x,.15,candidate.z);targetRing.material.color.setHex(0xc6f36b);}
  else targetRing.visible=false;
  const s=Math.sin(r.heading),c=Math.cos(r.heading);
  const desired=new THREE.Vector3(r.x-s*settings.cameraDistance,settings.cameraDistance+Math.min(r.lift*.2,9),r.z-c*settings.cameraDistance);
  if(game.mode==='autonomous'||replayTime!==null){desired.set(170,205,195);}
  const desiredLook=new THREE.Vector3(r.x+s*20,6+Math.min(r.lift*.28,15),r.z+c*20);
  if(game.mode==='autonomous'||replayTime!==null)desiredLook.set(0,0,0);
  if(contactShake>0){desired.x+=Math.sin(performance.now()*.12)*contactShake;contactShake=Math.max(0,contactShake-dt*8);}
  if(!cameraInitialized){camera.position.copy(desired);lookAt.copy(desiredLook);cameraInitialized=true;}
  else {const alpha=1-Math.exp(-dt*6);camera.position.lerp(desired,alpha);lookAt.lerp(desiredLook,alpha);}
  updateGhost(view);camera.lookAt(lookAt);renderer.render(scene,camera);
  if(loaderPreview&&!$('loader-content').hidden)loaderPreview.renderer.render(loaderPreview.scene,loaderPreview.camera);
  renderSummaryCamera();
  if(menuPreview&&welcome.open){menuPreview.root.rotation.y+=dt*.1;menuPreview.renderer.render(menuPreview.scene,menuPreview.camera);}
}
function updateMinimap() {
  const ctx=$('minimap').getContext('2d'),w=240,scale=220/144,toX=x=>10+(x+72)*scale,toZ=z=>10+(z+72)*scale;
  ctx.clearRect(0,0,w,w);ctx.fillStyle='#263735';ctx.fillRect(0,0,w,w);
  ctx.fillStyle='#ed566008';ctx.fillRect(10,10,220/3,220);ctx.fillStyle='#43aae908';ctx.fillRect(10+440/3,10,220/3,220);
  ctx.strokeStyle='#a8b6a520';ctx.lineWidth=1;
  for(let i=-72;i<=72;i+=24){ctx.beginPath();ctx.moveTo(toX(i),10);ctx.lineTo(toX(i),230);ctx.stroke();ctx.beginPath();ctx.moveTo(10,toZ(i));ctx.lineTo(230,toZ(i));ctx.stroke();}
  ctx.strokeStyle='#d1dec168';
  for(const x of [-24,24]){ctx.beginPath();ctx.moveTo(toX(x),10);ctx.lineTo(toX(x),230);ctx.stroke();}
  for(const z of [-24,24]){ctx.beginPath();ctx.moveTo(toX(-24),toZ(z));ctx.lineTo(toX(24),toZ(z));ctx.stroke();}
  for(const o of game.objects){if(o.held||o.goalId)continue;ctx.fillStyle=o.type==='cup'?'#b4c4b5':cssColors[o.top];ctx.beginPath();ctx.arc(toX(o.x),toZ(o.z),o.type==='cup'?1.8:2.4,0,Math.PI*2);ctx.fill();}
  for(const g of game.goals){ctx.fillStyle=cssColors[g.color];ctx.beginPath();ctx.arc(toX(g.x),toZ(g.z),g.color==='center'?5:4.2,0,Math.PI*2);ctx.fill();ctx.fillStyle='#25382e';ctx.beginPath();ctx.arc(toX(g.x),toZ(g.z),1.7,0,Math.PI*2);ctx.fill();}
  for(const [zone,x,z,horizontal] of [['red',-72,0,false],['blue',72,0,false],['north',0,-72,true],['south',0,72,true]]){ctx.fillStyle=cssColors[game.rollers[zone]];ctx.fillRect(toX(x)-(horizontal?17:2),toZ(z)-(horizontal?2:17),horizontal?34:4,horizontal?4:34);}
  ctx.save();ctx.translate(toX(game.robot.x),toZ(game.robot.z));ctx.rotate(-game.robot.heading);ctx.fillStyle='#c6f36b';ctx.shadowColor='#c6f36b';ctx.shadowBlur=8;ctx.beginPath();ctx.moveTo(0,9);ctx.lineTo(-5,-5);ctx.lineTo(5,-5);ctx.closePath();ctx.fill();ctx.restore();
  for(const bot of game.bots){ctx.save();ctx.translate(toX(bot.x),toZ(bot.z));ctx.rotate(-bot.heading);ctx.fillStyle=cssColors[bot.color];ctx.beginPath();ctx.moveTo(0,8);ctx.lineTo(-5,-5);ctx.lineTo(5,-5);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#eef5e3';ctx.font='9px Segoe UI';ctx.fillText(bot.id,toX(bot.x)+5,toZ(bot.z)-5);}
}
function updateUI() {
  touchControls?.update({visible:touchDevice&&!welcome.open&&!help.open&&!result.open&&game.mode!=='autonomous'&&replayTime===null&&$('practice-tools').hidden&&!document.body.classList.contains('strategy-mode'),active:game.active,lift:game.robot.lift,maxLift:settings.robotType==='dr4b'?30:MAX_LIFT});

  if($('auto-progress')){
    $('auto-progress').hidden=game.mode!=='autonomous';
    if(game.mode==='autonomous')$('auto-progress').textContent=autoRunner.index<autoSteps.length?`STEP ${autoRunner.index+1} / ${autoSteps.length} · ${AUTO_ACTIONS[autoSteps[autoRunner.index].action]}`:'Sequence complete · waiting for timer';
  }
  const score=game.score(),o=game.held;
  const match=game.mode==='headtohead';
  $('score').textContent=match?score.red:score.total;$('blue-score').textContent=match?score.blue:0;
  $('alliance-score').hidden=!match;$('score-label').textContent=match?'RED ALLIANCE · YOU':'TOTAL SCORE';
  $('ai-panel').hidden=!match;
  $('ai-roster').innerHTML=game.bots.map(bot=>`<div class="ai-row"><b style="color:${cssColors[bot.color]}">${bot.id}</b><div><strong>${ROLE_NAMES[bot.role]}</strong><span>${bot.tendency} · ${bot.status}</span></div><small>${bot.rerolled?'↻':'·'}</small></div>`).join('');
  $('intake-status').textContent=game.intake.objectId?`${game.intake.running?'Feeding':'Paused'} · ${Math.round(game.intake.progress*100)}%`:game.intake.running?(game.heldObjects.length>=2?'Claw full':o?`Seeking ${o.type==='pin'?'cup':'pin'}`:'Seeking pin or cup'):`Hold ${shortcut('intake')} · rear intake`;
  const seconds=Math.ceil(game.remaining);$('timer').textContent=game.mode==='practice'?'∞':`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
  $('timer').classList.toggle('time-low',game.mode!=='practice'&&seconds<=10);
  $('timer-label').textContent=game.mode==='practice'?'NO TIME LIMIT':'TIME REMAINING';
  $('mode-label').textContent=match?'HEAD TO HEAD / 2V2':game.mode==='practice'?'FREE PRACTICE':'SOLO DRIVING / 60 SEC';
  $('run-state').textContent=game.finished?'Run complete':game.active?'Driving':game.started?'Paused':'Ready to drive';
  $('lift-height').textContent=Math.round(game.robot.lift);$('lift-fill').style.width=`${game.robot.lift/(settings.robotType==='dr4b'?30:MAX_LIFT)*100}%`;
  $('held-label').textContent=game.describe();$('held-detail').textContent=controlText(!o?'Q to pick up an object':game.heldObjects.length>2?`${game.heldObjects.length} objects ? R flips stack`:game.heldObjects.length>1?`${o.type==='pin'?'Cup':'Pin'} on top · R flips stack`:o.type==='pin'?`${o.top[0].toUpperCase()+o.top.slice(1)} facing up · R to flip`:`Clear half ${o.clearUp?'up':'down'} · R to flip`);
  $('pause-button').textContent=game.active?'Pause':'Resume';
  $('mode-button').textContent='Change mode ↗';
  $('goal-scores').innerHTML=game.goals.map(g=>{const s=score.goals.find(s=>s.id===g.id);return `<div class="goal-row ${g.color==='center'?'center':''}"><span><i style="background:${cssColors[g.color]}"></i>${g.name}</span><b>${match?`${s.red} / ${s.blue}`:s.total}</b></div>`;}).join('');
  $('roller-status').innerHTML=Object.entries(game.rollers).map(([zone,color])=>`<div class="roller-item"><i style="background:${cssColors[color]}"></i>${zone==='north'?'Upper neutral':zone==='south'?'Lower neutral':zone[0].toUpperCase()+zone.slice(1)}</div>`).join('');
  const loader=LOADER_DEFS[Number($('loader-select').value)],supply=game.supply[loader.side];
  const loaderState=game.loaders[Number($('loader-select').value)],config=loaderState.config;
  $('loader-summary').textContent=`AUTO · ${config.mode==='cup'?'CUP':config.pin.toUpperCase().split('').join('/')+(config.mode==='pair'?' + CUP':' PIN')}`;
  $('loader-state').textContent=loaderState.ids.length?`Load in lower holder · handle ${game.nearLoader(Number($('loader-select').value))?'up':'down'}`:'Holder empty · waiting for approach';
  $('supply-count').textContent=`Supply: R/Y ${supply.ry} · B/Y ${supply.by} · Y/Y ${supply.yy} · Cups ${supply.cup}`;
  const t=game.placementTarget(),candidate=!o?game.pickCandidate():null,nearRoller=game.nearRoller();
  $('interaction').textContent=touchDevice?(!game.active?'Tap to drive':game.held?'Carrying '+game.describe()+' / Grab-drop to release':'Approach an object / Tap Grab-drop'):!game.active?'Click the field to drive':game.intake.objectId?`Hold ${shortcut('intake')} · Feed pin to claw`:t?!t.allowed?'Opponent goal protected':t.valid?`E · Nest on ${t.goal.name.toLowerCase()}`:!t.compatible?`Next object: ${t.expectedType}`:game.claw.y<t.y?'A · Raise the cascade':'D · Lower toward the stack':candidate?`Q · Pick up ${game.describe(candidate)}`:nearRoller?'F · Rear bumper ready · rotate roller':!o&&game.loaders.some((l,i)=>game.nearLoader(i))?'Handle raised · grab from the lower holder':o?'Aim the claw over a goal · E to release':'Move the claw close to an object · Q to grab';
  $('interaction').textContent=controlText($('interaction').textContent);
  if(game.active&&game.intake.objectId)$('interaction').textContent=`Hold ${shortcut('intake')} · Feed pin to claw`;
  $('drive-overlay').style.display=game.active?'none':'grid';
  $('drive-overlay').style.visibility=game.finished||welcome.open||help.open||result.open?'hidden':'visible';
  $('aim-marker').style.display=game.active?'block':'none';
  updateTeammateDropdown();updateReplayButtons();
  updateMinimap();
  if(game.mode==='autonomous')updateAutonomousMap();
  if(game.mode==='autonomous')$('mode-label').textContent='AUTONOMOUS TEST / 15 SEC';
  if(document.body.classList.contains('strategy-mode'))$('mode-label').textContent='STRATEGY SIMULATOR';
  if(game.intake.objectId&&game.intake.progress>=.85&&game.robot.lift>.2)$('intake-status').textContent='Lower lift fully to transfer';
}
function controlText(text){const names={W:'forward',S:'backward',A:'raise',D:'lower',Q:'grab',E:'grab',R:'flip',F:'roller',L:'loader'};return text.replace(/\b[WSADQERFL]\b/g,key=>shortcut(names[key]));}
function toast(message){$('toast').textContent=controlText(message);$('toast').classList.add('visible');toastUntil=performance.now()+2800;}
function persistSettings(){if(game.mode==='autonomous')rebuildAutonomousPrediction();try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));}catch{$('binding-status').textContent='Controls work for this session; browser storage is unavailable.';}}
function renderSettings(){
  $('binding-list').innerHTML=Object.entries(CONTROL_ACTIONS).map(([action,name])=>`<span>${name}</span><button class="binding-key ${bindingAction===action?'listening':''}" data-rebind="${action}" aria-label="Change ${name.toLowerCase()} key">${bindingAction===action?'Press a key…':shortcut(action)}</button>`).join('');
  for(const button of $('binding-list').querySelectorAll('button'))button.onclick=()=>{bindingAction=button.dataset.rebind;keys.clear();$('binding-status').textContent='Press a replacement key. Escape cancels.';renderSettings();};
  $('sensitivity').value=settings.sensitivity;$('invert-mouse').checked=settings.invertMouse;
  document.querySelectorAll('[data-shortcut]').forEach(el=>el.textContent=shortcut(el.dataset.shortcut));
  document.querySelector('.drive-hint').innerHTML=`<span class="key">${shortcut('forward')}</span><span class="key">${shortcut('backward')}</span> Drive <span class="hint-separator">·</span><span class="mouse-icon">↔</span> Mouse steer <span class="hint-separator">·</span><span class="key">${shortcut('grab')}</span> Grab <span class="key">${shortcut('grab')}</span> Drop`;
  document.querySelector('.lift-display .tiny').textContent=`${shortcut('raise')} RAISE · ${shortcut('lower')} LOWER`;
  document.querySelector('.welcome-controls').innerHTML=`<span><b>${shortcut('forward')} / ${shortcut('backward')}</b> Drive</span><span><b>MOUSE</b> Turn</span><span><b>${shortcut('grab')}</b> Pick up / drop</span><span><b>${shortcut('raise')} / ${shortcut('lower')}</b> Lift / lower</span>`;
  document.querySelector('#roller-status').previousElementSibling.querySelector('.tiny').textContent=`${shortcut('roller')} · REAR CONTACT`;
  $('advanced-sliders').innerHTML=[['driveSpeed','Drive speed',15,50,1,'in/s'],['acceleration','Acceleration / braking',3,18,1,''],['liftSpeed','Lift speed',8,35,1,'in/s'],['turnSpeed','Keyboard turn speed',.5,3,.1,'rad/s'],['cameraDistance','Camera distance',45,100,1,'in']].map(([key,name,min,max,step,unit])=>`<label class="advanced-slider"><span>${name}</span><input data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><output>${settings[key]} ${unit}</output></label>`).join('');
  for(const el of $('advanced-sliders').querySelectorAll('input'))el.oninput=()=>{settings[el.dataset.setting]=Number(el.value);el.nextElementSibling.textContent=el.value;persistSettings();};
  $('robot-type').value=settings.robotType;$('decor-color').value=settings.decorColor;$('robot-topper').value=settings.topper;
  applyAppearance();
  document.querySelector('.drive-hint').innerHTML=`<span class="key">${shortcut('forward')}</span><span class="key">${shortcut('backward')}</span> Drive | Mouse steer | <span class="key">${shortcut('grab')}</span> Pick up / drop`;
}
function applyAppearance(){
  document.querySelector('.lift-display .eyebrow').textContent=settings.robotType==='dr4b'?'DR4B LIFT':'CASCADE LIFT';
  if(settings.robotType==='dr4b'&&game.robot.lift>30){game.robot.lift=30;game.syncHeld();}
  playerDecor.color.set(DECOR_COLORS[settings.decorColor]);
  robotMesh.traverse(c=>{if(c.isMesh&&(c.material===lime||c.userData.decoration)){c.userData.decoration=true;c.material=playerDecor;}});
  const cascade=settings.robotType==='cascade';fixedCascade.visible=cascade;for(const stage of cascadeStages)stage.visible=cascade;dr4b.visible=!cascade;
  if(topperGroup){topperGroup.traverse(c=>{if(c.isMesh)c.geometry.dispose();});topperGroup.removeFromParent();}
  topperGroup=new THREE.Group();topperGroup.name='player-topper';topperGroup.position.set(0,7,-4);robotMesh.add(topperGroup);
  if(settings.topper==='beacon'){cylinder(topperGroup,1.6,1.8,1,darkSteel,0,.5,0);cylinder(topperGroup,1.3,1.3,2,playerDecor,0,2,0);}
  if(settings.topper==='crown'){
    cylinder(topperGroup,2.3,2.3,1.4,playerDecor,0,.7,0,true);
    for(let i=0;i<5;i++)mesh(topperGroup,new THREE.ConeGeometry(.65,1.8,4),playerDecor,Math.sin(i*Math.PI*2/5)*2,2,Math.cos(i*Math.PI*2/5)*2);
  }
  if(settings.topper==='duck'){
    const yellow=pinMaterials.yellow;const body=mesh(topperGroup,new THREE.SphereGeometry(1.7,16,12),yellow,0,1.4,0);body.scale.set(1,1,1.3);
    mesh(topperGroup,new THREE.SphereGeometry(1.1,16,12),yellow,0,3,1);box(topperGroup,1.3,.4,1,material(0xef9b3b),0,2.9,2);
    for(const x of [-.85,.85])mesh(topperGroup,new THREE.SphereGeometry(.14,8,6),rubber,x,3.2,1.5);
  }
}
function exitMouse(){if(document.pointerLockElement)document.exitPointerLock();fallbackMouse=false;dragX=null;}
function pause(){touchControls?.reset();playback.pause();game.pause();keys.clear();exitMouse();updateUI();}
async function capture(){
  if(welcome.open||help.open||result.open||game.finished||!$('practice-tools').hidden||document.body.classList.contains('strategy-mode'))return;
  audio.unlock();game.start();keys.clear();
  if(game.mode==='autonomous'||touchDevice){updateUI();return;}
  try { await renderer.domElement.requestPointerLock(); } catch { fallbackMouse=true;toast('Mouse capture unavailable. Hold left mouse and drag to steer.'); }
  updateUI();
}
function begin(mode){
  touchControls?.reset();
  leaveStrategyLab();
  playback.pause();playbackContext=null;
  if(mode!=='timed'){challenge=null;challengeState=null;if($('challenge-hud'))$('challenge-hud').hidden=true;}
  game.matchConfig=readMatchSetup();autoRunner=new AutoRunner(autoSteps);replayTime=null;replayFrames=[];recordAt=0;
  exitMouse();keys.clear();game.reset(mode);resetMeshes();finishShown=false;cameraInitialized=false;
  for(const d of [welcome,help,result])if(d.open)d.close();
  if(selectedSetup)restoreWorld(game,selectedSetup,{setup:true});
  if(mode==='autonomous')configureTrial(game,{start:autoStart});
  if(challenge&&mode==='timed'){game.remaining=CHALLENGES[challenge].limit;game.robot.x=-55;game.robot.z=0;game.syncHeld();challengeState={visited:[]};}
  for(const robot of game.allRobots){const h=game.history?.robots[robot.id];if(h){h.last={x:robot.x,z:robot.z};h.path=[{t:0,x:robot.x,z:robot.z,heading:robot.heading,lift:robot.lift}];}}
  replayFrames.push(captureWorld(game));audio.reset(game);previousSpeed=0;
  setAutonomousLayout(mode==='autonomous');
  if($('replay-scrub')){$('replay-scrub').value=0;$('replay-scrub').max=mode==='headtohead'?120:mode==='autonomous'?15:60;}
  if($('field-editor-map')){fieldEditHistory=new EditHistory(captureWorld(game));drawFieldEditor();}
  loadGhost();
  syncLoaderForm();updateUI();toast(mode==='autonomous'?'Autonomous lab ready. Preview updates as you edit.':mode==='headtohead'?'2v2 ready. You drive R1. Click to start the two-minute match.':mode==='timed'?'Fresh field ready. Click to start the 60-second clock.':'Preload ready. Click the field to drive.');
}
function showResult(){
  if(replayFrames.at(-1)?.elapsed!==game.elapsed)replayFrames.push(captureWorld(game));
  savePersonalBest();
  if(game.mode==='autonomous'){finishShown=true;keys.clear();exitMouse();game.summary.autonomous={steps:structuredClone(autoSteps),log:structuredClone(autoRunner.log)};updateAutonomousMap();updateUI();return;}
  if(game.mode==='autonomous'&&game.summary)game.summary.autonomous={steps:structuredClone(autoSteps),log:structuredClone(autoRunner.log)};
  finishShown=true;keys.clear();exitMouse();const score=game.score();$('result-score').textContent=score.total;
  if(game.mode==='headtohead'){
    $('result-score').textContent=`${score.red} — ${score.blue}`;
    $('result-title').textContent=score.red===score.blue?'A tied match.':score.red>score.blue?'Red alliance wins.':'Blue alliance wins.';
    $('result-detail').textContent=`Red ${score.red} · Blue ${score.blue}. Includes end-of-match loader parking: red +${score.parking.red}, blue +${score.parking.blue}.`;
  }else{$('result-title').textContent="That's a run.";$('result-detail').textContent=`${score.cups} cups and ${score.halves} visible pin halves across ${score.goals.filter(g=>g.total>0).length} scoring goals. Your final score is frozen at the buzzer.`;}
  result.showModal();updateUI();
  showSummary(game.summary,{onFrame:({robot,time})=>{replayTime=time;summaryFollowId=robot;}});
  if(game.mode==='autonomous'){$('result-title').textContent='Autonomous test complete.';$('result-detail').textContent=`15-second test. ${Math.min(autoRunner.index,autoSteps.length)} of ${autoSteps.length} steps completed. Inspect the route below, then change the sequence in Change mode.`;}
}
function syncLoaderForm(){
  queueMicrotask(updateLoaderPreview);
  const i=Number($('loader-select').value),c=game.loaders[i].config;
  $('load-mode').value=c.mode;$('load-pin').value=c.pin;$('load-pin-flip').value=String(c.pinFlip);$('load-cup-clear').value=String(c.clearUp);$('load-order').value=c.order;
  $('pin-options').hidden=c.mode==='cup';$('cup-options').hidden=c.mode==='pin';$('pair-options').hidden=c.mode!=='pair';
  $('copy-loader').textContent=`Apply to both ${LOADER_DEFS[i].side} loaders`;
}
function saveLoaderForm(){
  game.configureLoader(Number($('loader-select').value),{mode:$('load-mode').value,pin:$('load-pin').value,pinFlip:$('load-pin-flip').value==='true',clearUp:$('load-cup-clear').value==='true',order:$('load-order').value});
  syncLoaderForm();updateUI();
}
function bindControls(){
  touchControls=new TouchControls($('app'),{available:()=>!welcome.open&&!help.open&&!result.open&&!game.finished&&game.mode!=='autonomous'&&replayTime===null&&$('practice-tools').hidden&&!document.body.classList.contains('strategy-mode'),start:()=>{if(!game.active){audio.unlock();game.start();updateUI();}},pause:()=>game.active?pause():capture(),action:kind=>{toast(kind==='grab'?(game.held?game.release():game.grab()):kind==='flip'?game.flip():game.rotateRoller());updateUI();}});
  if(touchDevice)$('capture-button').innerHTML='Tap to drive <span>Joystick to steer / slider to lift</span>';

  $('practice-start').onclick=()=>begin('practice');$('timed-start').onclick=()=>begin('timed');$('match-start').onclick=()=>begin('headtohead');
  $('capture-button').onclick=capture;renderer.domElement.onclick=()=>{if(!game.active)capture();};
  $('mode-button').onclick=()=>{pause();welcome.showModal();};$('reset-button').onclick=()=>begin(game.mode);
  $('pause-button').onclick=()=>game.active?pause():capture();
  $('help-button').onclick=()=>{pause();renderSettings();help.showModal();updateUI();};$('help-close').onclick=()=>{help.close();updateUI();};
  $('retry-button').onclick=()=>begin(game.mode);$('result-practice').onclick=()=>begin('practice');
  $('sensitivity').oninput=e=>{settings.sensitivity=Number(e.target.value);persistSettings();};
  $('invert-mouse').onchange=e=>{settings.invertMouse=e.target.checked;persistSettings();};
  for(const [id,key] of [['robot-type','robotType'],['decor-color','decorColor'],['robot-topper','topper']])$(id).onchange=()=>{settings[key]=$(id).value;applyAppearance();persistSettings();};
  $('reset-controls').onclick=()=>{const {robotType,decorColor,topper}=settings;settings={...defaultSettings(),robotType,decorColor,topper};bindingAction=null;keys.clear();persistSettings();renderSettings();$('binding-status').textContent='Default controls restored.';updateUI();};
  $('loader-toggle').onclick=()=>{$('loader-content').hidden=!$('loader-content').hidden;$('loader-toggle').setAttribute('aria-expanded',String(!$('loader-content').hidden));};
  $('loader-select').onchange=()=>{syncLoaderForm();updateUI();};
  for(const id of ['load-mode','load-pin','load-pin-flip','load-cup-clear','load-order'])$(id).onchange=saveLoaderForm;
  $('copy-loader').onclick=()=>{
    const i=Number($('loader-select').value),side=LOADER_DEFS[i].side;
    LOADER_DEFS.forEach((l,j)=>{if(l.side===side)game.configureLoader(j,{...game.loaders[i].config});});toast(`Recipe set for both ${side} loaders.`);updateUI();
  };
  window.addEventListener('keydown',e=>{
    if(bindingAction){
      e.preventDefault();e.stopPropagation();
      if(e.repeat)return;
      if(e.code==='Escape'){bindingAction=null;$('binding-status').textContent='Key change cancelled.';renderSettings();return;}
      const error=e.ctrlKey||e.altKey||e.metaKey?'Use a single key without Ctrl, Alt, or Command.':rebind(settings,bindingAction,e.code);
      $('binding-status').textContent=error||`${CONTROL_ACTIONS[bindingAction]} set to ${keyName(e.code)}.`;
      if(!error){bindingAction=null;persistSettings();}renderSettings();updateUI();return;
    }
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;
    if(e.code==='Escape'||e.code===settings.bindings.pause){if(game.active){e.preventDefault();pause();}return;}
    if(e.key==='?'&&!game.active&&!help.open&&!welcome.open&&!result.open){pause();renderSettings();help.showModal();return;}
    if(welcome.open||help.open||result.open)return;
    if(!game.active||game.mode==='autonomous'||replayTime!==null)return;
    if(Object.values(settings.bindings).includes(e.code))e.preventDefault();
    keys.add(e.code);if(e.repeat)return;
    if(e.code===settings.bindings.loader){$('loader-select').value=String((Number($('loader-select').value)+1)%4);syncLoaderForm();toast(`Selected ${$('loader-select').selectedOptions[0].textContent} loader`);updateUI();}
    const action=Object.entries({grab:'grab',release:'release',flip:'flip',roller:'rotateRoller'}).find(([name])=>settings.bindings[name]===e.code)?.[1];
    if(action){toast(action==='grab'&&game.held?game.release():game[action]());updateUI();}
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  window.addEventListener('blur',pause);document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==renderer.domElement&&game.active&&!fallbackMouse){game.pause();keys.clear();}updateUI();});
  document.addEventListener('mousemove',e=>{
    if(!game.active||game.mode==='autonomous'||replayTime!==null)return;
    const steer=settings.sensitivity*(settings.invertMouse?-1:1);
    if(document.pointerLockElement===renderer.domElement)game.turn(-e.movementX*steer);
    else if(fallbackMouse&&dragX!==null){game.turn(-(e.clientX-dragX)*steer);dragX=e.clientX;}
  });
  renderer.domElement.addEventListener('mousedown',e=>{if(fallbackMouse&&e.button===0)dragX=e.clientX;});
  window.addEventListener('mouseup',()=>{dragX=null;});
  for(const d of [welcome,help,result])d.addEventListener('close',updateUI);
  help.addEventListener('close',()=>{bindingAction=null;keys.clear();$('binding-status').textContent='';});
  welcome.addEventListener('cancel',e=>{e.preventDefault();begin('practice');});
}
function animate(now){
  const elapsed=Math.max(0,(now-lastTime)/1000),dt=Math.min(elapsed,.05);lastTime=now;
  advanceReplay(elapsed);
  if(strategyPlayback.playing&&!$('strategy-lab').hidden){strategyPlayback.tick(elapsed);drawStrategyRoute();}
  const controller=sampleController();
  const input={drive:(keys.has(settings.bindings.forward)?1:0)-(keys.has(settings.bindings.backward)?1:0),lift:(keys.has(settings.bindings.raise)?1:0)-(keys.has(settings.bindings.lower)?1:0),intake:keys.has(settings.bindings.intake),turn:(keys.has(settings.bindings.turnLeft)?1:0)-(keys.has(settings.bindings.turnRight)?1:0),precision:keys.has(settings.bindings.precision),driveSpeed:settings.driveSpeed,liftSpeed:settings.liftSpeed,acceleration:settings.acceleration,turnSpeed:settings.turnSpeed,maxLift:settings.robotType==='dr4b'?30:MAX_LIFT};
  if(game.mode!=='autonomous'&&!welcome.open&&!help.open&&!result.open){for(const key of ['drive','turn','lift'])if(Math.abs(controller.input[key]||0)>Math.abs(input[key]||0))input[key]=controller.input[key];input.intake ||= !!controller.input.intake;input.precision ||= !!controller.input.precision;}
  if(touchDevice&&game.active&&game.mode!=='autonomous'&&replayTime===null&&!welcome.open&&!help.open&&!result.open){
    for(const key of ['drive','turn'])if(Math.abs(touchControls.input[key])>Math.abs(input[key]))input[key]=touchControls.input[key];
    input.intake ||= touchControls.input.intake;input.precision ||= touchControls.input.precision;
    if(touchControls.liftTarget!==null){const diff=touchControls.liftTarget-game.robot.lift;input.lift=Math.abs(diff)<.15?0:Math.max(-1,Math.min(1,diff/Math.max(.001,(settings.liftSpeed||23)*elapsed)));}
  }
  // Stable physics steps, while accounting for the full active elapsed time.
  let remaining=game.active&&replayTime===null?elapsed:0;
  while(remaining>1e-8&&game.active){
    const sequenceStep=autoRunner.steps[autoRunner.index];
    const step=Math.min(remaining,1/60,game.mode==='autonomous'&&sequenceStep?Math.max(1e-8,sequenceStep.duration-autoRunner.time):Infinity);
    game.tick(step,game.mode==='autonomous'?{...input,drive:0,lift:0,turn:0,intake:false,...autoRunner.input(game,step,input)}:input);remaining-=step;
  }
  if(game.started&&(game.elapsed>=recordAt||game.finished&&!finishShown)){replayFrames.push(captureWorld(game));if(game.mode==='practice'&&replayFrames.length>1800)replayFrames.shift();recordAt=game.elapsed+.1;}
  const collision=game.active&&Math.abs(previousSpeed)>10&&Math.abs(game.robot.speed)>5&&game.robot.motion&&Math.hypot(game.robot.motion.vx||0,game.robot.motion.vz||0)<2;
  if(collision)contactShake=Math.min(.8,contactShake+dt*3);previousSpeed=game.robot.speed;
  audio.update(game,collision);updateChallenge();
  if(!document.body.classList.contains('strategy-mode'))renderFrame(dt);uiElapsed+=dt;
  if(uiElapsed>.08){updateUI();updatePracticeTools();uiElapsed=0;}
  if(game.finished&&!finishShown)showResult();
  if(toastUntil&&now>toastUntil){$('toast').classList.remove('visible');toastUntil=0;}
  requestAnimationFrame(animate);
}
try {
  buildScene();buildExtendedMenus();buildPracticeTools();buildStrategyLab();bindControls();renderSettings();syncLoaderForm();updateUI();welcome.showModal();requestAnimationFrame(animate);
  // Test access is opt-in and absent from normal play.
  if(new URLSearchParams(location.search).has('test'))window.__pinnacle={touchControls,game,begin,updateUI,renderFrame,renderer,camera,scene,features:()=>({replayTime,frames:replayFrames.length,autoStart:{...autoStart},padSettings:structuredClone(padSettings),audio:{...audio.config},audioState:audio.context?.state})};
} catch(error){$('error-banner').hidden=false;$('error-banner').textContent=`The 3D view could not start: ${error.message}. Try an up-to-date Chrome or Edge browser with hardware acceleration enabled.`;console.error(error);}
function readMatchSetup(){
  const bots={};for(const id of ['R2','B1','B2'])bots[id]={role:$(`strategy-${id}`).value,tendency:$(`tendency-${id}`).value,parking:$(`parking-${id}`).value,difficulty:$(`difficulty-${id}`)?.value||'standard'};
  const config={bots,speed:Number($('ai-speed').value),reroll:$('ai-reroll').checked};
  try{localStorage.setItem('pinnacle-match-v1',JSON.stringify(config));}catch{}return config;
}
function miniature(canvas,width,height,position){
  const r=new THREE.WebGLRenderer({canvas,antialias:true});r.setSize(width,height,false);r.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:2));r.setClearColor(0x142522);
  const s=new THREE.Scene();s.add(new THREE.HemisphereLight(0xffffff,0x526450,2.5));const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(15,25,10);s.add(light);
  const camera=new THREE.PerspectiveCamera(42,width/height,.1,500);camera.position.set(...position);camera.lookAt(0,3,0);const root=new THREE.Group();s.add(root);return {renderer:r,scene:s,camera,root};
}
function updateLoaderPreview(){
  if(!loaderPreview)return;const root=loaderPreview.root;
  root.traverse(c=>{if(c.isMesh)c.geometry.dispose();});root.clear();
  const config=game.loaders[Number($('loader-select').value)].config;
  box(root,10,.6,10,darkSteel,0,-.5,0);
  const types=config.mode==='pair'?config.order.split('-'):[config.mode];
  types.forEach((type,i)=>{const pair=config.pin==='ry'?['red','yellow']:config.pin==='by'?['blue','yellow']:['yellow','yellow'];if(config.pinFlip)pair.reverse();
    const o={type,x:0,z:0,y:3.24+i*3.24,yaw:0,top:pair[0],bottom:pair[1],clearUp:config.clearUp};const m=createObjectMesh(o,root);updateObjectMesh(o,m);
  });
  $('loader-preview-caption').textContent=`Bottom to top: ${types.join(' then ')}. Pin: ${config.pinFlip?'second':'first'} color up; cup: clear half ${config.clearUp?'up':'down'}.`;
  loaderPreview.renderer.render(loaderPreview.scene,loaderPreview.camera);
}
function saveAuto(){autoEditHistory?.commit({steps:autoSteps,start:autoStart,setup:selectedSetup});if(game.mode==='autonomous'){if(game.active)game.pause();begin('autonomous');}try{localStorage.setItem('pinnacle-auto-v1',JSON.stringify(autoSteps));}catch{}}
function buildExtendedMenus(){
  welcome.insertAdjacentHTML('afterbegin','<div class="mode-stage"><canvas id="mode-preview" aria-label="Rotating 3D field preview"></canvas><div><span class="eyebrow">CHOOSE YOUR SESSION</span><h2 id="mode-preview-title">Your next best run.</h2><p id="mode-preview-description">Explore the field, challenge the clock, or plan a precise autonomous route.</p></div></div>');
  welcome.querySelector('h1').hidden=true;welcome.querySelector('.intro').hidden=true;
  welcome.querySelector('.welcome-controls').insertAdjacentHTML('beforebegin',`<details class="setup-panel"><summary>Advanced head-to-head setup</summary><p>Choose each driver's strategy, personality and parking behavior.</p>${['R2','B1','B2'].map(id=>`<div class="bot-setup"><b>${id}</b><select id="strategy-${id}" aria-label="${id} strategy"><option value="random">Random strategy</option><option value="defender">Defender</option><option value="center">Center scorer / descorer</option><option value="field">Alliance / neutral scorer</option></select><select id="tendency-${id}" aria-label="${id} tendency"><option value="random">Random tendency</option><option value="cautious">Cautious</option><option value="drifty">Drifty</option><option value="persistent">Persistent</option></select><select id="parking-${id}" aria-label="${id} parking"><option value="normal">Normal parking odds</option><option value="always">Always attempt parking</option><option value="never">Never park</option></select></div>`).join('')}<label class="setting-select">AI speed multiplier<input id="ai-speed" type="number" min="0.5" max="1.5" step="0.1" value="1"></label><label class="invert-setting">Reroll strategies once mid-match<input id="ai-reroll" type="checkbox" checked></label></details><details class="setup-panel"><summary>15-second autonomous · sequence editor</summary><p>Steps run in order without driver input. Drive and turn durations use your current control settings. Grab, release and flip happen once at the start of their step. Reset restores the field for repeatable trials.</p><div id="auto-steps"></div><button id="auto-add" class="quiet">+ Add step</button><p id="auto-total"></p><button id="auto-start" class="primary">Run 15-second autonomous test ?</button></details>`);
  try{const c=JSON.parse(localStorage.getItem('pinnacle-match-v1'));if(c){for(const id of ['R2','B1','B2'])for(const key of ['strategy','tendency','parking'])$(`${key}-${id}`).value=c.bots[id][key==='strategy'?'role':key];$('ai-speed').value=c.speed;$('ai-reroll').checked=c.reroll;}}catch{}
  buildAutonomousWorkspace();
  $('auto-start').onclick=()=>begin('autonomous');$('auto-add').onclick=()=>{if(autoSteps.length<64)autoSteps.push({action:'wait',duration:1});saveAuto();renderAutoEditor();};renderAutoEditor();
  $('interaction').insertAdjacentHTML('afterend','<div id="auto-progress" class="auto-progress" hidden></div>');
  $('loader-content').insertAdjacentHTML('afterbegin','<canvas id="loader-preview" aria-label="3D preview of loader stack"></canvas><p id="loader-preview-caption" class="tiny"></p>');
  loaderPreview=miniature($('loader-preview'),240,170,[15,12,20]);
  menuPreview=miniature($('mode-preview'),560,260,[145,160,155]);menuPreview.camera.lookAt(0,0,0);
  box(menuPreview.root,144,1,144,material(0x66746c));for(const x of [-72,72])box(menuPreview.root,2,9,146,darkSteel,x,4,0);for(const z of [-72,72])box(menuPreview.root,146,9,2,darkSteel,0,4,z);
  for(const g of game.goals)cylinder(menuPreview.root,5,6,4,material(colors[g.color]),g.x,3,g.z);
  for(const x of [-24,24])box(menuPreview.root,.5,.2,144,steel,x,.65,0);
  const robotMarkers=[];for(let i=0;i<4;i++){const m=box(menuPreview.root,16,9,16,material(i<2?colors.red:colors.blue),i<2?-50:50,5,i%2?-48:48);robotMarkers.push(m);}
  const descriptions=[['practice-start','Free practice','Unlimited time to learn the field, build stacks and tune your driving.'],['timed-start','Beat your best · 60 seconds','A fresh solo field and a path-by-path summary when the buzzer sounds.'],['match-start','Head to head · 2 vs 2','Drive red alongside an AI teammate. Customize your opposition below.'],['auto-start','Autonomous lab · 15 seconds','Build an action sequence, run it hands-free, then inspect its route.']];
  for(const [id,title,description] of descriptions)for(const event of ['mouseenter','focus'])$(id).addEventListener(event,()=>{$('mode-preview-title').textContent=title;$('mode-preview-description').textContent=description;robotMarkers.forEach((m,i)=>m.visible=id==='match-start'||i===0);});robotMarkers.forEach((m,i)=>m.visible=i===0);
  help.insertAdjacentHTML('beforeend','<p>Whole stacks can be grabbed from the floor or your alliance goals. Neutral goals allow top-object pickup only, and opposing alliance goals and loaders are protected. Tall loads sway and may spill during fast driving or sharp turns. Rear intake accepts pins and cups; lower the claw completely to finish a transfer.</p>');
}
function buildAutonomousWorkspace(){
  const old=$('auto-steps').closest('details');
  document.querySelector('#app').insertAdjacentHTML('beforeend',`<aside id="autonomous-workspace" class="autonomous-workspace" hidden><div class="dialog-kicker">AUTONOMOUS LAB / 15 SECONDS</div><h2>Plan. Watch. Refine.</h2><p class="tiny">Fixed field camera. The planned routine replays automatically; edit any step to update it.</p><div class="auto-map-heading"><b>Bird's-eye route</b><span id="auto-map-clock"></span></div><canvas id="auto-route-map" width="600" height="600" aria-label="Planned and actual autonomous paths on the field"></canvas><p class="tiny">Lime: planned route &nbsp; White: actual route &nbsp; Numbered dots: step starts</p><div id="auto-plan-stats" class="auto-plan-stats"></div><div class="auto-run-actions"><button id="auto-run" class="primary">Run 15s test</button><button id="auto-edit-reset" class="quiet">Reset / preview</button></div><h3>Action sequence</h3><div id="auto-editor-slot"></div><p id="auto-inline-results" class="tiny" aria-live="polite"></p></aside>`);
  for(const id of ['auto-steps','auto-add','auto-total'])$('auto-editor-slot').append($(id));old.remove();
  $('match-start').insertAdjacentHTML('afterend','<button id="auto-start" class="mode-card autonomous-card"><span class="mode-number">04 / AUTONOMOUS LAB</span><strong>15-second autonomous <span>↗</span></strong><span>A fixed 3D field, editable action sequence and live route preview on one screen.</span></button>');
  $('auto-run').onclick=()=>{audio.unlock();begin('autonomous');game.start();updateUI();};
  $('auto-edit-reset').onclick=()=>{autoPreviewPaused=false;begin('autonomous');};
  const inspector=document.createElement('div');inspector.className='auto-inspector';
  const mapColumn=document.createElement('div'),controlsColumn=document.createElement('div');
  const map=$('auto-route-map'),heading=map.previousElementSibling,legend=map.nextElementSibling;
  heading.before(inspector);mapColumn.append(heading,map,legend);controlsColumn.append($('auto-plan-stats'),document.querySelector('.auto-run-actions'));inspector.append(mapColumn,controlsColumn);
  window.addEventListener('resize',resizeAutonomousViewport);
}
function resizeAutonomousViewport(){
  const auto=game.mode==='autonomous';
  const screenWidth=document.documentElement.clientWidth,screenHeight=document.documentElement.clientHeight;
  const width=auto&&screenWidth>800?screenWidth-Math.min(440,screenWidth*.4):screenWidth;
  const height=auto&&screenWidth<=800?screenHeight*.48:screenHeight;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
}
function setAutonomousLayout(enabled){
  document.body.classList.toggle('autonomous-mode',enabled);$('autonomous-workspace').hidden=!enabled;
  resizeAutonomousViewport();
  if(enabled)rebuildAutonomousPrediction();
}
function rebuildAutonomousPrediction(){
  const input={driveSpeed:settings.driveSpeed,liftSpeed:settings.liftSpeed,acceleration:settings.acceleration,turnSpeed:settings.turnSpeed,maxLift:settings.robotType==='dr4b'?30:MAX_LIFT};
  autoPreviewPaused=false;autoPrediction=predictAutonomous(autoSteps,input,game.loaders.map(l=>l.config),{start:autoStart,setup:selectedSetup,applySetup:(g,s)=>restoreWorld(g,s,{setup:true})});autoPreviewTime=0;
  updateAutonomousMap();
}
function autonomousDisplay(dt){
  if(game.mode!=='autonomous'||!autoPrediction||game.started||!$('practice-tools').hidden)return game;
  if(!autoPreviewPaused)autoPreviewTime=(autoPreviewTime+dt) % 16;
  const frames=autoPrediction.frames;
  const frame=frames[Math.min(frames.length-1,Math.floor(Math.min(15,autoPreviewTime)*10))];
  Object.assign(autoPrediction.model,frame);autoPrediction.model.player=autoPrediction.model.robot;
  return autoPrediction.model;
}
function updateAutonomousMap(){
  if(!autoPrediction||!$('auto-route-map'))return;
  const canvas=$('auto-route-map'),ctx=canvas.getContext('2d'),to=v=>25+(v+72)*550/144,point=p=>[to(p.x),to(p.z)];
  ctx.fillStyle='#263735';ctx.fillRect(0,0,600,600);
  ctx.fillStyle='#ed56600c';ctx.fillRect(25,25,550/3,550);ctx.fillStyle='#43aae90c';ctx.fillRect(25+1100/3,25,550/3,550);
  ctx.lineWidth=1;ctx.strokeStyle='#9ead9d35';for(let i=-72;i<=72;i+=24){ctx.beginPath();ctx.moveTo(to(i),25);ctx.lineTo(to(i),575);ctx.moveTo(25,to(i));ctx.lineTo(575,to(i));ctx.stroke();}
  ctx.strokeStyle='#d6e6ce99';ctx.lineWidth=2;for(const x of [-24,24]){ctx.beginPath();ctx.moveTo(to(x),25);ctx.lineTo(to(x),575);ctx.stroke();}for(const z of [-24,24]){ctx.beginPath();ctx.moveTo(to(-24),to(z));ctx.lineTo(to(24),to(z));ctx.stroke();}
  for(const goal of game.goals){ctx.fillStyle=cssColors[goal.color];ctx.beginPath();ctx.arc(to(goal.x),to(goal.z),9,0,Math.PI*2);ctx.fill();}
  const drawPath=(path,color,width)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineJoin='round';ctx.beginPath();path.forEach((p,i)=>ctx[i?'lineTo':'moveTo'](...point(p)));ctx.stroke();};
  if(comparisonPrediction)drawPath(comparisonPrediction.path,'#c19aff',3);
  drawPath(autoPrediction.path,'#c6f36b',4);
  const actual=game.history?.robots.R1.path||[];if(game.started)drawPath(replayTime===null?actual:actual.filter(p=>p.t<=replayTime),'#ffffff',3);
  let t=0;ctx.font='bold 13px Segoe UI';ctx.textAlign='center';ctx.textBaseline='middle';
  autoSteps.forEach((step,i)=>{if(t<15){const p=autoPrediction.path.find(p=>p.t>=t-1e-8)||autoPrediction.path.at(-1);ctx.fillStyle='#16251e';ctx.beginPath();ctx.arc(...point(p),10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#c6f36b';ctx.fillText(String(i+1),...point(p));}t+=step.duration;});
  const shown=replayTime!==null?replayDisplay().robot:game.started?game.robot:autoPrediction.frames[Math.min(autoPrediction.frames.length-1,Math.floor(Math.min(15,autoPreviewTime)*10))].robot;
  ctx.save();ctx.translate(...point(shown));ctx.rotate(-shown.heading);ctx.fillStyle=game.started?'#fff':'#c6f36b';ctx.beginPath();ctx.moveTo(0,13);ctx.lineTo(-8,-8);ctx.lineTo(8,-8);ctx.closePath();ctx.fill();ctx.restore();
  if($('auto-scrub')&&replayTime===null&&!autoPreviewPaused)$('auto-scrub').value=game.started?game.elapsed:autoPreviewTime;
  $('auto-map-clock').textContent=replayTime!==null?`Replay ${replayTime.toFixed(1)} / 15s`:game.started?`${game.elapsed.toFixed(1)} / 15s`:`Preview ${Math.min(15,autoPreviewTime).toFixed(1)} / 15s`;
  $('auto-plan-stats').textContent=`Planned score: ${autoPrediction.score.total} pts | ${game.started?`Actual score: ${(replayTime!==null?replayDisplay():game).score().total} pts`:'Fresh field / red preload'}`;
  $('auto-inline-results').textContent=game.finished?`Test complete. ${Math.min(autoRunner.index,autoSteps.length)} / ${autoSteps.length} steps finished. Actual route and score remain visible. Edit a step to preview again.`:game.active?'Running your routine. Driver inputs are disabled.':game.started?'Test paused. Resume below or reset to edit.':'Automatic preview uses the same field and movement model as your test. Load spills can vary.';
  for(const [i,row] of [...$('auto-steps').children].entries())row.classList.toggle('active-step',game.active&&i===autoRunner.index);
}
function readLocal(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
function writeLocal(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{toast('Browser storage is full or unavailable.');return false;}}
function drivingConfig(){return {driveSpeed:settings.driveSpeed,liftSpeed:settings.liftSpeed,acceleration:settings.acceleration,turnSpeed:settings.turnSpeed,maxLift:settings.robotType==='dr4b'?30:MAX_LIFT};}
function renderAutoEditor(){
  if(!$('auto-steps'))return;
  $('auto-steps').innerHTML=autoSteps.map((s,i)=>{const measured=['driveDistance','turnAngle'].includes(s.action);return `<div class="auto-step advanced-auto-step"><b>${i+1}</b><select data-action="${i}" aria-label="Step ${i+1} action">${Object.entries(AUTO_ACTIONS).map(([k,n])=>`<option value="${k}" ${k===s.action?'selected':''}>${n}</option>`).join('')}</select><label><input ${measured?'data-value':'data-duration'}="${i}" type="number" step="${measured?1:.1}" min="${measured?-720:.1}" max="${measured?720:15}" value="${measured?s.value:s.duration}" aria-label="Step ${i+1} ${measured?'target':'seconds'}">${measured?s.action==='driveDistance'?'in':'deg':'s'}</label><button data-up="${i}" aria-label="Move step up">&#8593;</button><button data-delete="${i}" aria-label="Delete step">&times;</button><div class="parallel-options"><span>Also:</span>${['raise','lower','intake'].map(a=>`<label><input type="checkbox" data-parallel="${i}" value="${a}" ${(s.parallel||[]).includes(a)?'checked':''}>${a}</label>`).join('')}${measured?'<small>15s target timeout</small>':''}</div></div>`;}).join('');
  $('auto-total').textContent=autoSteps.some(s=>['driveDistance','turnAngle'].includes(s.action))?'Distance/angle steps finish at their targets. Test ends at 15 seconds.':`${autoSteps.reduce((n,s)=>n+s.duration,0).toFixed(1)} / 15 seconds`;
  for(const el of $('auto-steps').querySelectorAll('[data-action]'))el.onchange=()=>{const step=autoSteps[Number(el.dataset.action)];step.action=el.value;step.parallel=(step.parallel||[]).filter(a=>a!==step.action&&!(step.action==='raise'&&a==='lower')&&!(step.action==='lower'&&a==='raise'));if(['driveDistance','turnAngle'].includes(step.action)){step.value=step.action==='driveDistance'?24:90;step.duration=15;}saveAuto();renderAutoEditor();};
  for(const el of $('auto-steps').querySelectorAll('[data-duration],[data-value]')){const measured=el.hasAttribute('data-value'),index=Number(measured?el.dataset.value:el.dataset.duration);el.oninput=()=>{const v=Number(el.value),max=measured?(autoSteps[index].action==='driveDistance'?144:720):15;if(!el.value||!Number.isFinite(v)||Math.abs(v)>(max)||measured&&Math.abs(v)<.1||!measured&&v<.1)return;autoSteps[index][measured?'value':'duration']=v;saveAuto();};el.onchange=()=>renderAutoEditor();}
  for(const el of $('auto-steps').querySelectorAll('[data-parallel]'))el.onchange=()=>{const step=autoSteps[Number(el.dataset.parallel)],current=new Set(step.parallel||[]);el.checked?current.add(el.value):current.delete(el.value);if(el.checked&&el.value==='raise')current.delete('lower');if(el.checked&&el.value==='lower')current.delete('raise');step.parallel=[...current].filter(a=>a!==step.action&&!(step.action==='raise'&&a==='lower')&&!(step.action==='lower'&&a==='raise'));saveAuto();renderAutoEditor();};
  for(const el of $('auto-steps').querySelectorAll('[data-up]'))el.onclick=()=>{const i=Number(el.dataset.up);if(i>0)[autoSteps[i-1],autoSteps[i]]=[autoSteps[i],autoSteps[i-1]];saveAuto();renderAutoEditor();};
  for(const el of $('auto-steps').querySelectorAll('[data-delete]'))el.onclick=()=>{autoSteps.splice(Number(el.dataset.delete),1);saveAuto();renderAutoEditor();};
}
function buildPracticeTools(){
  const storedStart=readLocal('pinnacle-auto-start-v1',null);if(storedStart&&[storedStart.x,storedStart.z,storedStart.heading].every(Number.isFinite)&&game.canStand(storedStart.x,storedStart.z,game.robot,true))autoStart=storedStart;
  autoEditHistory=new EditHistory({steps:autoSteps,start:autoStart,setup:selectedSetup});
  $('auto-editor-slot').insertAdjacentHTML('beforebegin',`<details class="lab-details"><summary>Start position, routines & reliability</summary><p class="tiny">Drag the start marker on the map. Shift-drag sets its heading. Positive angle turns left; negative turns right.</p><div class="start-inputs"><label>X<input id="start-x" type="number" min="-63" max="63" step="1"></label><label>Z<input id="start-z" type="number" min="-63" max="63" step="1"></label><label>Heading<input id="start-heading" type="number" min="-360" max="360" step="5"></label></div><div class="tool-row"><button id="auto-undo">Undo</button><button id="auto-redo">Redo</button></div><input id="routine-name" maxlength="50" placeholder="Routine name" aria-label="Routine name"><div class="tool-row"><button id="routine-save">Save routine</button><select id="routine-list" aria-label="Saved routines"></select><button id="routine-compare">Compare</button><button id="routine-load">Load</button><button id="routine-delete">Delete</button></div><div class="tool-row"><button id="reliability-run">Test 20 variations</button><label>Target pts <input id="reliability-target" type="number" min="0" max="500" value="10"></label></div><p id="reliability-result" class="tiny" aria-live="polite"></p><p id="routine-comparison" class="tiny"></p></details><div class="auto-replay"><label>Inspect time<input id="auto-scrub" type="range" min="0" max="15" step="0.1" value="0"></label><button id="auto-live" class="quiet">Live / preview</button></div>`);
  for(const id of ['start-x','start-z','start-heading'])$(id).onchange=()=>setAutoStart({x:Number($('start-x').value),z:Number($('start-z').value),heading:Number($('start-heading').value)*Math.PI/180});syncStartInputs();
  $('auto-undo').onclick=()=>restoreAutoEdit(autoEditHistory.undo());$('auto-redo').onclick=()=>restoreAutoEdit(autoEditHistory.redo());
  $('auto-route-map').addEventListener('pointerdown',e=>{if(game.active)return;const p=mapPoint(e,$('auto-route-map'));$('auto-route-map').setPointerCapture(e.pointerId);$('auto-route-map').onpointermove=ev=>{const q=mapPoint(ev,$('auto-route-map'));if(ev.shiftKey)setAutoStart({...autoStart,heading:Math.atan2(q.x-autoStart.x,q.z-autoStart.z)},false);else setAutoStart({x:q.x,z:q.z,heading:autoStart.heading},false);};$('auto-route-map').onpointerup=()=>{clearTimeout(startPreviewTimer);autoEditHistory.commit({steps:autoSteps,start:autoStart,setup:selectedSetup});$('auto-route-map').onpointermove=null;if(game.mode==='autonomous')begin('autonomous');};if(!e.shiftKey)setAutoStart({x:p.x,z:p.z,heading:autoStart.heading},false);});
  $('routine-compare').onclick=()=> $('routine-list').onchange();$('routine-save').onclick=saveRoutine;$('routine-load').onclick=loadRoutine;$('routine-delete').onclick=()=>{const list=readLocal('pinnacle-routines-v1',[]).filter(r=>r.name!==$('routine-list').value);writeLocal('pinnacle-routines-v1',list);refreshRoutines();};refreshRoutines();
  $('routine-list').onchange=()=>{const r=readLocal('pinnacle-routines-v1',[]).find(r=>r.name===$('routine-list').value);comparisonPrediction=r?predictAutonomous(r.steps,r.config||drivingConfig(),game.loaders.map(l=>l.config),{start:r.start,setup:r.setup,applySetup:(g,s)=>restoreWorld(g,s,{setup:true})}):null;updateAutonomousMap();$('routine-comparison').textContent=r?`Purple route: ${r.name}: ${r.score} planned pts; ${r.steps.length} steps. Current: ${autoPrediction?.score.total??'--'} pts.`:'';};
  $('reliability-run').onclick=runReliability;
  $('auto-scrub').oninput=()=>{if(game.active)pause();replayTime=Number($('auto-scrub').value);if(!game.started){autoPreviewTime=replayTime;replayTime=null;autoPreviewPaused=true;}updateAutonomousMap();};$('auto-live').onclick=()=>{replayTime=null;autoPreviewPaused=false;};
  $('pause-button').insertAdjacentHTML('beforebegin','<button id="tools-button" class="quiet">Practice tools</button>');
  $('app').insertAdjacentHTML('beforeend',`<aside id="practice-tools" class="practice-tools" hidden><div class="tool-row"><h2>Practice tools</h2><button id="tools-close" class="quiet">Close</button></div><details open><summary>Custom field setup</summary><p class="tiny">Pause to edit. Drag a pin, cup or stack to move it. Add onto a goal to nest a stack. Edits affect the next run when saved as the active setup.</p><canvas id="field-editor-map" width="600" height="600" aria-label="Editable overhead field layout"></canvas><div class="tool-row"><select id="field-add-type"><option value="pin">Pin</option><option value="cup">Cup</option></select><label>Stack size <input id="field-stack-count" type="number" min="1" max="9" value="1"></label><button id="field-add">Add at center-left</button><select id="field-pin-colors" aria-label="Selected pin colors"><option value="ry">Red / yellow</option><option value="by">Blue / yellow</option><option value="yy">Yellow / yellow</option><option value="rb">Red / blue</option></select><button id="field-flip">Flip selected</button><label>Heading <input id="field-heading" type="number" min="-360" max="360" value="0"></label><button id="field-delete">Delete selected</button></div><div class="tool-row"><button id="field-undo">Undo</button><button id="field-redo">Redo</button><button id="field-use">Use this setup</button><button id="field-default">Default field</button></div><input id="setup-name" maxlength="50" placeholder="Setup name" aria-label="Setup name"><div class="tool-row"><button id="setup-save">Save setup</button><select id="setup-list" aria-label="Saved field setups"></select><button id="setup-load">Load</button><button id="setup-delete">Delete</button></div><p id="field-editor-status" class="tiny" aria-live="polite"></p></details><details open><summary>Replay & personal bests</summary><p id="personal-best" class="tiny"></p><label class="tool-check"><input id="ghost-enabled" type="checkbox" checked>Show personal-best ghost</label><label>Replay time<input id="replay-scrub" type="range" min="0" max="120" step="0.1" value="0"></label><div class="tool-row"><button id="replay-live">Return to live view</button><button id="replay-export">Export replay</button></div><p id="replay-status" class="tiny"></p></details><details open><summary>Scoring explanation</summary><label class="tool-check"><input id="score-overlay" type="checkbox">Highlight scoring pin halves in 3D</label><select id="explain-goal" aria-label="Goal to explain"></select><div id="scoring-explanation"></div></details><details open><summary>Practice challenges</summary><select id="challenge-select">${Object.entries(CHALLENGES).map(([id,c])=>`<option value="${id}">${c.name}</option>`).join('')}</select><p id="challenge-description" class="tiny"></p><button id="challenge-start">Start challenge</button><button id="challenge-stop">Stop challenge</button><p id="challenge-status" class="tiny" aria-live="polite"></p></details><details open><summary>AI teammate commands</summary><p class="tiny">Commands apply to red teammate R2 until changed.</p><div class="tool-row">${[['auto','Auto'],['defender','Defend'],['center','Focus center'],['field','Field scoring'],['space','Give space'],['park','Park now']].map(([c,n])=>`<button data-command="${c}">${n}</button>`).join('')}</div><p id="teammate-command-status" class="tiny"></p></details></aside><div id="stability-indicator" class="stability-indicator" hidden></div><div id="challenge-hud" class="challenge-hud" hidden></div>`);
  $('tools-button').onclick=()=>{pause();$('practice-tools').hidden=false;document.body.classList.add('tools-open');fieldEditHistory=new EditHistory(captureWorld(game));drawFieldEditor();updatePracticeTools();};$('tools-close').onclick=()=>{$('practice-tools').hidden=true;document.body.classList.remove('tools-open');};
  for(const goal of game.goals)$('explain-goal').add(new Option(goal.name,goal.id));$('explain-goal').onchange=updateScoringExplanation;
  $('field-editor-map').onpointerdown=e=>{if(game.active)return;const p=mapPoint(e,$('field-editor-map'));const o=game.objects.filter(o=>!o.held&&!o.inIntake&&o.loaderIndex==null).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];if(!o||Math.hypot(o.x-p.x,o.z-p.z)>8)return;fieldSelection=o.id;drawFieldEditor();$('field-editor-map').setPointerCapture(e.pointerId);$('field-editor-map').onpointerup=ev=>{const q=mapPoint(ev,$('field-editor-map'));try{editField(game,{kind:'move',id:fieldSelection,...q});commitFieldEdit();}catch(error){$('field-editor-status').textContent=error.message;}};};
  $('field-add').onclick=()=>{try{fieldSelection=editField(game,{kind:'add',type:$('field-add-type').value,count:Number($('field-stack-count').value),x:-20,z:0});commitFieldEdit();}catch(error){toast(error.message);}};
  $('field-pin-colors').onchange=()=>{const object=game.objects.find(o=>o.id===fieldSelection);if(!object)return;const pair={ry:['red','yellow'],by:['blue','yellow'],yy:['yellow','yellow'],rb:['red','blue']}[$('field-pin-colors').value];for(const p of game.bundle(object))if(p.type==='pin'){p.top=pair[0];p.bottom=pair[1];}commitFieldEdit();};
  $('field-flip').onclick=()=>{const object=game.objects.find(o=>o.id===fieldSelection);if(!object)return;for(const p of game.bundle(object)){if(p.type==='pin')[p.top,p.bottom]=[p.bottom,p.top];else p.clearUp=!p.clearUp;}commitFieldEdit();};
  $('field-heading').onchange=()=>{const object=game.objects.find(o=>o.id===fieldSelection);if(!object)return;for(const p of game.bundle(object))p.yaw=Number($('field-heading').value)*Math.PI/180;commitFieldEdit();};
  $('field-delete').onclick=()=>{const o=game.objects.find(p=>p.id===fieldSelection);if(!o)return;editField(game,{kind:'delete',id:o.id,x:o.x,z:o.z});fieldSelection=null;commitFieldEdit();};
  $('field-undo').onclick=()=>restoreFieldEdit(fieldEditHistory?.undo());$('field-redo').onclick=()=>restoreFieldEdit(fieldEditHistory?.redo());
  $('field-use').onclick=()=>{selectedSetup=captureWorld(game);$('field-editor-status').textContent='This setup will be used for subsequent runs.';if(game.mode==='autonomous')rebuildAutonomousPrediction();};
  $('field-default').onclick=()=>{selectedSetup=null;begin(game.mode);$('field-editor-status').textContent='Default field restored.';};
  $('setup-save').onclick=saveSetup;$('setup-load').onclick=loadSetup;$('setup-delete').onclick=()=>{writeLocal('pinnacle-setups-v1',readLocal('pinnacle-setups-v1',[]).filter(s=>s.name!==$('setup-list').value));refreshSetups();};refreshSetups();
  $('replay-scrub').oninput=()=>{pause();replayTime=Number($('replay-scrub').value);$('replay-status').textContent=`Inspecting ${replayTime.toFixed(1)}s. Robot and object states are frozen at this time.`;};$('replay-live').onclick=()=>{replayTime=null;$('replay-status').textContent='Live view restored.';};$('replay-export').onclick=()=>downloadJSON('pinnacle-replay.json',{mode:game.mode,frames:replayFrames,summary:game.summary});
  $('ghost-enabled').checked=readLocal('pinnacle-ghost-v1',true);$('ghost-enabled').onchange=()=>writeLocal('pinnacle-ghost-v1',$('ghost-enabled').checked);
  $('challenge-select').onchange=()=>{$('challenge-description').textContent=CHALLENGES[$('challenge-select').value].description;};$('challenge-select').onchange();$('challenge-start').onclick=()=>{challenge=$('challenge-select').value;selectedSetup=null;begin('timed');$('practice-tools').hidden=true;document.body.classList.remove('tools-open');audio.unlock();game.start();};$('challenge-stop').onclick=()=>{challenge=null;challengeState=null;$('challenge-hud').hidden=true;};
  for(const button of document.querySelectorAll('[data-command]'))button.onclick=()=>issueTeammateCommand(button.dataset.command);
  $('result-dialog').querySelector('.result-actions').insertAdjacentHTML('beforeend','<button id="inspect-replay" class="quiet">Inspect 3D replay</button>');$('inspect-replay').onclick=()=>{result.close();$('tools-button').click();$('replay-scrub').value=game.elapsed;replayTime=game.elapsed;};
  document.addEventListener('keydown',event=>{if(!(event.ctrlKey||event.metaKey)||['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)||game.active||welcome.open||help.open||result.open||bindingAction)return;const redo=event.code==='KeyY'||event.code==='KeyZ'&&event.shiftKey;if(event.code!=='KeyZ'&&event.code!=='KeyY')return;if(!$('practice-tools').hidden){event.preventDefault();restoreFieldEdit(redo?fieldEditHistory.redo():fieldEditHistory.undo());}else if(game.mode==='autonomous'){event.preventDefault();restoreAutoEdit(redo?autoEditHistory.redo():autoEditHistory.undo());}});
  buildSummaryCameraControls();buildMatchCommandAndPlaybackUI();buildSoundAndControllerSettings();fieldEditHistory=new EditHistory(captureWorld(game));
  for(const [kind,points] of [['route',[[-55,-55],[-55,55],[55,-55],[55,55]]],['park',[[-61,-60],[-61,60]]]])points.forEach(([x,z],index)=>{const m=torus(scene,kind==='route'?11:8,.3,material(0xc6f36b,{transparent:true,opacity:.6}),x,.12,z);m.visible=false;challengeMarkers.push({kind,index,mesh:m});});
  document.addEventListener('pointerdown',()=>audio.unlock(),{once:true});document.addEventListener('keydown',()=>audio.unlock(),{once:true});
}
let autoPreviewPaused=false,startPreviewTimer=null;
let summaryRenderer=null,summaryCamera=null,summaryFollowId='R1';
function syncStartInputs(){if(!$('start-x'))return;$('start-x').value=autoStart.x.toFixed(1);$('start-z').value=autoStart.z.toFixed(1);$('start-heading').value=Math.round(autoStart.heading*180/Math.PI);}
function setAutoStart(start,commit=true){if(![start.x,start.z,start.heading].every(Number.isFinite)||!game.canStand(start.x,start.z,game.robot,true)){toast('The starting robot must clear walls and goals.');return;}autoStart=start;writeLocal('pinnacle-auto-start-v1',start);syncStartInputs();if(commit)autoEditHistory.commit({steps:autoSteps,start:autoStart,setup:selectedSetup});if(game.mode==='autonomous'){clearTimeout(startPreviewTimer);if(commit)begin('autonomous');else{Object.assign(game.robot,start);game.syncHeld();startPreviewTimer=setTimeout(()=>begin('autonomous'),80);}}}
function restoreAutoEdit(value){if(!value)return;autoSteps=value.steps;autoStart=value.start;selectedSetup=value.setup||null;writeLocal('pinnacle-auto-v1',autoSteps);writeLocal('pinnacle-auto-start-v1',autoStart);syncStartInputs();renderAutoEditor();if(game.mode==='autonomous')begin('autonomous');}
function mapPoint(e,canvas){const r=canvas.getBoundingClientRect(),size=Math.min(r.width,r.height),left=r.left+(r.width-size)/2,top=r.top+(r.height-size)/2;return {x:Math.max(-68,Math.min(68,((e.clientX-left)/size*600-25)*144/550-72)),z:Math.max(-68,Math.min(68,((e.clientY-top)/size*600-25)*144/550-72))};}
function saveRoutine(){const name=$('routine-name').value.trim();if(!name){toast('Name the routine first.');return;}const list=readLocal('pinnacle-routines-v1',[]).filter(r=>r.name!==name);list.push({name,steps:structuredClone(autoSteps),start:{...autoStart},score:autoPrediction?.score.total||0,setup:selectedSetup,config:drivingConfig()});writeLocal('pinnacle-routines-v1',list.slice(-20));refreshRoutines();$('routine-list').value=name;$('routine-list').onchange?.();toast('Routine saved.');}
function refreshRoutines(){if(!$('routine-list'))return;$('routine-list').replaceChildren(...readLocal('pinnacle-routines-v1',[]).map(r=>new Option(`${r.name} (${r.score} pts)`,r.name)));}
function loadRoutine(){const r=readLocal('pinnacle-routines-v1',[]).find(r=>r.name===$('routine-list').value);if(!r||!validateSequence(r.steps))return;autoSteps=structuredClone(r.steps);autoStart={...r.start};selectedSetup=r.setup||null;comparisonPrediction=null;saveAuto();syncStartInputs();renderAutoEditor();}
async function runReliability(){const button=$('reliability-run');button.disabled=true;const sequence=structuredClone(autoSteps),config=drivingConfig(),options={start:{...autoStart},setup:selectedSetup,applySetup:(g,s)=>restoreWorld(g,s,{setup:true}),targetScore:Math.max(0,Number($('reliability-target').value)||0)};try{const r=await reliabilityTest(sequence,config,game.loaders.map(l=>({...l.config})),options,20,(n,total)=>$('reliability-result').textContent=`Testing ${n} / ${total}...`);$('reliability-result').textContent=`${Math.round(r.success*100)}% reached ${r.target} pts with all targets reached. Average ${r.average.toFixed(1)} pts; range ${r.min}-${r.max}. Movement varies +/-6%, acceleration +/-10%; spills remain random.`;}catch(error){$('reliability-result').textContent=error.message;}finally{button.disabled=false;}}
function commitFieldEdit(){game.finalScore=null;fieldEditHistory.commit(captureWorld(game));replayTime=null;resetMeshes();drawFieldEditor();updateUI();$('field-editor-status').textContent='Field edited. Use this setup to keep it for resets.';}
function restoreFieldEdit(value){if(!value)return;restoreWorld(game,value);resetMeshes();drawFieldEditor();updateUI();}
function saveSetup(){const name=$('setup-name').value.trim();if(!name){toast('Name the setup first.');return;}const setup=captureWorld(game),list=readLocal('pinnacle-setups-v1',[]).filter(s=>s.name!==name);list.push({name,setup});writeLocal('pinnacle-setups-v1',list.slice(-12));selectedSetup=setup;refreshSetups();$('setup-list').value=name;toast('Field setup saved.');}
function refreshSetups(){if($('setup-list'))$('setup-list').replaceChildren(...readLocal('pinnacle-setups-v1',[]).map(s=>new Option(s.name,s.name)));}
function loadSetup(){const s=readLocal('pinnacle-setups-v1',[]).find(s=>s.name===$('setup-list').value);if(!s)return;selectedSetup=s.setup;begin(game.mode);$('field-editor-status').textContent=`Loaded ${s.name}.`;}
function drawFieldEditor(){if(!$('field-editor-map'))return;const c=$('field-editor-map'),ctx=c.getContext('2d'),to=n=>25+(n+72)*550/144;ctx.fillStyle='#263735';ctx.fillRect(0,0,600,600);ctx.strokeStyle='#9ead9d55';for(let n=-72;n<=72;n+=24){ctx.beginPath();ctx.moveTo(to(n),25);ctx.lineTo(to(n),575);ctx.moveTo(25,to(n));ctx.lineTo(575,to(n));ctx.stroke();}for(const goal of game.goals){ctx.fillStyle=cssColors[goal.color];ctx.beginPath();ctx.arc(to(goal.x),to(goal.z),11,0,Math.PI*2);ctx.fill();}for(const o of game.objects){if(o.held)continue;ctx.fillStyle=o.type==='cup'?'#ccd6ce':cssColors[o.top];ctx.beginPath();ctx.arc(to(o.x),to(o.z),o.type==='cup'?6:8,0,Math.PI*2);ctx.fill();if(o.id===fieldSelection){ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}}ctx.fillStyle='#c6f36b';ctx.fillRect(to(game.robot.x)-7,to(game.robot.z)-7,14,14);}
function replayDisplay(){const source=game.mode==='autonomous'&&!game.started?autoPrediction?.frames:replayFrames;if(!source?.length)return game;const frame=source.findLast(f=>(f.elapsed??f.t??0)<=replayTime)||source[0];if(!replayModel)replayModel=new Game();restoreWorld(replayModel,frame);replayModel.mode=game.mode;replayModel.running=false;return replayModel;}
function updateChallenge(){for(const marker of challengeMarkers){marker.mesh.visible=marker.kind===challenge;marker.mesh.material.color.setHex(marker.kind==='route'&&challengeState?.visited.includes(marker.index)?0x56754e:0xc6f36b);}if(!challenge||!challengeState)return;const status=challengeProgress(game,challenge,challengeState);if(status.done&&!challengeState.done){challengeState.done=true;challengeState.time=game.elapsed;audio.tone(880,.35,.12,'sine',1320);if(game.active)game.finish();}const text=challengeState.done?`Challenge complete in ${challengeState.time.toFixed(1)}s!`:game.finished?'Time up. Reset to try again.':status.text;$('challenge-hud').hidden=false;$('challenge-hud').textContent=`${CHALLENGES[challenge].name}: ${text}`;if($('challenge-status'))$('challenge-status').textContent=text;}
function savePersonalBest(){if(game.mode==='practice')return;const score=game.mode==='headtohead'?game.score().red:game.score().total,key=bestKey(),best=readLocal(key,null);if(!best||score>best.score){writeLocal(key,{score,date:new Date().toISOString(),duration:game.elapsed,path:game.history.robots.R1.path,robotType:settings.robotType,signature:scenarioSignature()});}loadGhost();}
function scenarioSignature(){return JSON.stringify({mode:game.mode,type:settings.robotType,start:game.mode==='autonomous'?autoStart:null,setup:selectedSetup?selectedSetup.objects.map(o=>[o.type,o.x,o.y,o.z,o.top,o.bottom,o.clearUp,o.goalId]):null,challenge});}
function bestKey(){let hash=0;for(const c of scenarioSignature())hash=(hash*31+c.charCodeAt(0))|0;return `pinnacle-best-v1-${hash}`;}
function loadGhost(){ghostData=readLocal(bestKey(),null);if(ghostMesh){scene.remove(ghostMesh);ghostMesh.traverse(c=>{if(c.isMesh)c.material.dispose();});ghostMesh=null;}if(ghostData){ghostMesh=robotMesh.clone(true);ghostMesh.name='personal-best-ghost';ghostMesh.traverse(c=>{if(c.isMesh){c.material=c.material.clone();c.material.transparent=true;c.material.opacity=.22;c.material.depthWrite=false;c.material.color.setHex(0x88dfff);}else if(c.isSprite)c.visible=false;});scene.add(ghostMesh);}}
function updateGhost(){if(!ghostMesh)return;ghostMesh.visible=!!$('ghost-enabled')?.checked&&game.started&&replayTime===null;const pose=ghostPose(ghostData.path,game.elapsed);if(pose){ghostMesh.position.set(pose.x,0,pose.z);ghostMesh.rotation.y=pose.heading;const lift=ghostMesh.getObjectByName('robot-carriage');if(lift&&Number.isFinite(pose.lift)){lift.position.y=pose.lift+PIN_HEIGHT/2;for(let i=1;i<=3;i++){const stage=ghostMesh.getObjectByName(`cascade-stage-${i}`);if(stage)stage.position.y=pose.lift*i/4;}}}}
function updateScoringExplanation(){const view=replayTime!==null?replayDisplay():game,goal=view.goals.find(g=>g.id===$('explain-goal')?.value);if(!goal)return;const info=explainGoal(view,goal);$('scoring-explanation').innerHTML=`<p class="tiny">${game.mode==='headtohead'?`Red ${info.score.red} / Blue ${info.score.blue}`:`${info.score.total} points`} | ${info.cups} cups. Goal and opaque cup halves conceal adjacent pin halves.</p><div class="half-list">${info.halves.map(h=>`<div><i style="background:${cssColors[h.color]}"></i><span>${h.color} ${h.end}<small>${h.reason}</small></span><b>${h.visible?h.points:0}</b></div>`).join('')||'<p class="tiny">No scored pins on this goal.</p>'}</div>`;}
function updatePracticeTools(){
  const count=game.heldObjects.length,stress=game.robot.stackStress||0,risk=Math.min(1,stress/1.2);$('stability-indicator').hidden=!count;$('stability-indicator').textContent=`Load stability: ${risk>.75?'HIGH SPILL RISK':risk>.3?'CAUTION':'STABLE'} | ${count} objects`;$('stability-indicator').classList.toggle('unstable',risk>.6);
  if(!$('practice-tools').hidden){updateScoringExplanation();if(replayTime!==null){const score=replayDisplay().score();$('replay-status').textContent=`${replayTime.toFixed(1)}s | ${game.mode==='headtohead'?`Red ${score.red} / Blue ${score.blue}`:`${score.total} points`} at this replay time. The live match is unchanged.`;}const best=readLocal(bestKey(),null);$('personal-best').textContent=best?`Personal best: ${best.score} pts in this mode, robot and field setup.`:'Finish a run to record a personal best for this setup.';$('replay-scrub').max=Math.max(0,game.elapsed);$('replay-scrub').min=replayFrames[0]?.elapsed||0;}

}
function downloadJSON(name,data){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function buildSoundAndControllerSettings(){
  $('help-close').insertAdjacentHTML('beforebegin',`<details class="advanced-settings" open><summary id="settings-sound">Sound & music</summary><label class="invert-setting">Enable game audio<input id="sound-enabled" type="checkbox"></label><label class="sensitivity">Master volume<input id="sound-volume" type="range" min="0" max="1" step="0.05"></label><label class="invert-setting">Quiet background music<input id="music-enabled" type="checkbox"></label><p class="tiny">Synthesized locally. Pickup, scoring, contact, spills, countdown and buzzer effects. Audio starts after a click or key press.</p></details><details class="advanced-settings" open><summary id="settings-controller">Game controller</summary><p id="controller-status" class="tiny">Connect a controller and press a button.</p><label class="invert-setting">Enable controller<input id="pad-enabled" type="checkbox"></label><label class="sensitivity">Stick dead zone<input id="pad-deadzone" type="range" min="0.05" max="0.5" step="0.01"></label><label class="setting-select">Drive axis<select id="pad-drive-axis">${Array.from({length:8},(_,i)=>`<option value="${i}">Axis ${i}</option>`).join('')}</select></label><label class="setting-select">Turn axis<select id="pad-turn-axis">${Array.from({length:8},(_,i)=>`<option value="${i}">Axis ${i}</option>`).join('')}</select></label><label class="invert-setting">Invert drive axis<input id="pad-invert-drive" type="checkbox"></label><label class="invert-setting">Invert turn axis<input id="pad-invert-turn" type="checkbox"></label><p class="tiny">Click an action below, then press the Xbox button or paddle you want. Press Escape to cancel. An occupied button swaps assignments.</p><div id="pad-mappings"></div><p id="pad-binding-status" class="binding-status" role="status" aria-live="polite"></p><button id="pad-bind-cancel" class="quiet" hidden>Cancel button assignment</button><button id="pad-defaults" class="quiet">Restore controller defaults</button><p class="tiny">Default: left stick drives/turns, A/Cross picks up or drops, bumpers raise/lower, right trigger runs intake, X/Square flips, Y/Triangle turns rollers, Menu pauses. Controller steering works without capturing the mouse. Xbox names are shown for standard buttons. Paddles use whichever button your controller reports. Autonomous and replay block manual input.</p></details>`);
  $('help-dialog').querySelector('h2').insertAdjacentHTML('afterend','<div class="settings-shortcuts tool-row"><button data-settings-jump="binding-list">Keys</button><button data-settings-jump="advanced-sliders">Driving</button><button data-settings-jump="robot-type">Robot</button><button data-settings-jump="settings-controller">Controller</button><button data-settings-jump="settings-sound">Sound</button></div>');for(const button of document.querySelectorAll('[data-settings-jump]'))button.onclick=()=>{const target=$(button.dataset.settingsJump),details=target.closest('details');if(details)details.open=true;target.scrollIntoView({block:'start',behavior:'smooth'});};
  $('sound-enabled').checked=audio.config.enabled;$('sound-volume').value=audio.config.volume;$('music-enabled').checked=audio.config.music;
  for(const id of ['sound-enabled','sound-volume','music-enabled'])$(id).oninput=()=>{audio.configure({enabled:$('sound-enabled').checked,volume:Number($('sound-volume').value),music:$('music-enabled').checked});writeLocal('pinnacle-audio-v1',audio.config);audio.unlock();};
  const cancelPadBinding=()=>{padRebinder.cancel();$('pad-binding-status').textContent='Button assignment cancelled.';renderPadSettings();};
  $('pad-bind-cancel').onclick=cancelPadBinding;
  window.addEventListener('keydown',event=>{if(padRebinder.action&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();cancelPadBinding();}});
  help.addEventListener('close',()=>{padRebinder.cancel();$('pad-binding-status').textContent='';renderPadSettings();});
  renderPadSettings();for(const id of ['pad-enabled','pad-deadzone','pad-drive-axis','pad-turn-axis','pad-invert-drive','pad-invert-turn'])$(id).onchange=()=>{padSettings=readPad({enabled:$('pad-enabled').checked,deadZone:Number($('pad-deadzone').value),driveAxis:Number($('pad-drive-axis').value),turnAxis:Number($('pad-turn-axis').value),invertDrive:$('pad-invert-drive').checked,invertTurn:$('pad-invert-turn').checked,buttons:padSettings.buttons});writeLocal('pinnacle-pad-v1',padSettings);};$('pad-defaults').onclick=()=>{padRebinder.cancel();$('pad-binding-status').textContent='Controller defaults restored.';padSettings=defaultPad();renderPadSettings();writeLocal('pinnacle-pad-v1',padSettings);};
}
function renderPadSettings(){
  $('pad-enabled').checked=padSettings.enabled;$('pad-deadzone').value=padSettings.deadZone;$('pad-drive-axis').value=padSettings.driveAxis;$('pad-turn-axis').value=padSettings.turnAxis;$('pad-invert-drive').checked=padSettings.invertDrive;$('pad-invert-turn').checked=padSettings.invertTurn;
  $('pad-mappings').innerHTML=Object.entries(PAD_ACTIONS).map(([action,name])=>`<div class="setting-select"><span>${name}</span><button type="button" class="binding-key ${padRebinder.action===action?'listening':''}" data-pad-rebind="${action}" aria-label="Change controller ${name.toLowerCase()}">${padRebinder.action===action?'Press Xbox button...':xboxButtonName(padSettings.buttons[action])}</button></div>`).join('');
  $('pad-bind-cancel').hidden=!padRebinder.action;
  for(const button of $('pad-mappings').querySelectorAll('[data-pad-rebind]'))button.onclick=()=>{let pad=null;try{pad=Array.from(navigator.getGamepads?.()||[]).find(p=>p?.connected);}catch{}padRebinder.arm(button.dataset.padRebind,pad);$('pad-binding-status').textContent='Press the desired Xbox button or paddle. Release any held button first.';renderPadSettings();};

}
function sampleController(){
  let pads=[];try{pads=navigator.getGamepads?.()||[];}catch{}
  const available=!welcome.open&&!help.open&&!result.open&&!document.body.classList.contains('strategy-mode'),replaying=replayTime!==null;
  const assignment=padRebinder.poll(Array.from(pads).find(p=>p?.connected));
  if(assignment){const change=rebindPad(padSettings,assignment.action,assignment.index);if(change){writeLocal('pinnacle-pad-v1',padSettings);$('pad-binding-status').textContent=`${PAD_ACTIONS[assignment.action]} set to ${xboxButtonName(assignment.index)}.${change.swapped.length?' Swapped with '+change.swapped.map(a=>PAD_ACTIONS[a]).join(', ')+'.':''}`;renderPadSettings();}}
  const sample=padReader.sample(pads,padSettings,available&&!replaying&&!padRebinder.action);
  if($('controller-status'))$('controller-status').textContent=sample.connected?`Connected: ${sample.name}`:'Connect a controller and press a button.';
  if(!available||replaying||!$('practice-tools').hidden)return {...sample,input:{}};
  for(const action of sample.actions){if(action==='pause'){audio.unlock();if(game.active)pause();else if(!game.finished){game.start();updateUI();}continue;}if(game.mode==='autonomous')continue;if(!game.active&&!game.finished){audio.unlock();game.start();}if(!game.active)continue;if(action==='toggle')toast(game.held?game.release():game.grab());if(action==='flip')toast(game.flip());if(action==='roller')toast(game.rotateRoller());if(action==='loader'){$('loader-select').value=String((Number($('loader-select').value)+1)%4);syncLoaderForm();toast('Next team loader selected.');}}
  if(game.mode==='autonomous')return {...sample,input:{}};
  if(!game.active&&!game.finished&&Math.abs(sample.input.drive||0)>.1){audio.unlock();game.start();updateUI();}
  return sample;
}
function clearScoringTints(){for(const m of objectMeshes.values())m.traverse(c=>{if(c.userData.scoreOriginal){c.material=c.userData.scoreOriginal;delete c.userData.scoreOriginal;}});}
function applyScoringTints(view){if(!$('score-overlay')?.checked)return;for(const goal of view.goals){const info=explainGoal(view,goal);for(const h of info.halves){const group=objectMeshes.get(h.id)?.userData[h.end==='top'?'topGroup':'bottomGroup'];group?.traverse(c=>{if(c.isMesh){c.userData.scoreOriginal=c.material;const tint=c.userData.scoreTint||(c.userData.scoreTint=c.material.clone());tint.copy(c.material);tint.emissive?.setHex(h.visible&&h.points>0?0x4f7624:0x481710);c.material=tint;}});}}}
function buildSummaryCameraControls(){
  document.querySelector('.summary-toolbar').insertAdjacentHTML('beforeend',`<label>View <select id="summary-camera"><option value="map">Bird's-eye path map</option><option value="station">Alliance station</option><option value="overhead">Bird's-eye 3D</option><option value="side">Close side 3D</option><option value="follow">Follow robot</option></select></label>`);
  $('summary-map').insertAdjacentHTML('beforebegin','<div id="summary-3d-view" hidden><canvas id="summary-3d-canvas" aria-label="3D match replay from selected camera"></canvas><p id="summary-camera-caption" class="tiny"></p></div>');
  document.querySelector('.summary-toolbar').insertAdjacentHTML('afterend','<div id="summary-camera-options" class="summary-camera-options" hidden><label id="summary-station-option">Station <select id="summary-station"><option value="auto">Selected robot alliance</option><option value="red">Red station</option><option value="blue">Blue station</option></select></label><label>Zoom <input id="summary-zoom" type="range" min="0.65" max="1.7" step="0.05" value="1"></label></div>');
  $('result-detail').insertAdjacentHTML('afterend','<section id="summary-ranking" class="summary-ranking" hidden></section>');
  const selected=readLocal('pinnacle-summary-camera-v1','map');if(['map','station','overhead','side','follow'].includes(selected))$('summary-camera').value=selected;
  $('summary-camera').onchange=()=>{const mode=$('summary-camera').value;$('summary-map').hidden=mode!=='map';$('summary-3d-view').hidden=mode==='map';$('summary-camera-options').hidden=mode==='map';$('summary-station-option').hidden=mode!=='station';writeLocal('pinnacle-summary-camera-v1',mode);};$('summary-camera').onchange();
}
function renderSummaryCamera(){
  if(!result.open||$('summary-camera').value==='map')return;
  if(!summaryRenderer){summaryRenderer=new THREE.WebGLRenderer({canvas:$('summary-3d-canvas'),antialias:true});summaryRenderer.setPixelRatio(Math.min(devicePixelRatio,touchDevice?1:1.5));summaryRenderer.setClearColor(0x142522);summaryRenderer.outputColorSpace=THREE.SRGBColorSpace;summaryRenderer.toneMapping=renderer.toneMapping;summaryRenderer.toneMappingExposure=renderer.toneMappingExposure;summaryRenderer.shadowMap.enabled=!touchDevice;summaryCamera=new THREE.PerspectiveCamera(55,1,.1,1200);}
  const width=Math.max(280,Math.round($('summary-3d-view').clientWidth));if(summaryRenderer.domElement.width!==Math.round(width*summaryRenderer.getPixelRatio()))summaryRenderer.setSize(width,width,false);
  const view=replayTime!==null?replayDisplay():game,robot=view.allRobots.find(r=>r.id===summaryFollowId)||view.robot,mode=$('summary-camera').value;
  summaryCamera.up.set(0,1,0);summaryCamera.fov=55;
  const target=new THREE.Vector3(robot.x,10+Math.min(15,robot.lift*.2),robot.z);
  if(mode==='station'){
    const selected=$('summary-station').value,color=selected==='auto'?robot.color:selected;summaryCamera.fov=75;summaryCamera.position.set(color==='red'?-107:107,60,0);target.set(0,7,0);$('summary-camera-caption').textContent=`${color==='red'?'Red':'Blue'} alliance driver station / approximately standing eye height.`;
  }else if(mode==='overhead'){
    summaryCamera.position.set(0,225,.01);summaryCamera.up.set(0,0,-1);target.set(0,0,0);$('summary-camera-caption').textContent='Overhead field view / same orientation as the path map.';
  }else if(mode==='side'){
    summaryCamera.position.set(robot.x+58,42,robot.z+38);$('summary-camera-caption').textContent=`Close 3D side view of ${robot.id}.`;
  }else{
    const s=Math.sin(robot.heading),c=Math.cos(robot.heading);summaryCamera.position.set(robot.x-s*48,35+Math.min(12,robot.lift*.12),robot.z-c*48);target.x+=s*12;target.z+=c*12;$('summary-camera-caption').textContent=`Following ${robot.id} / select a different robot above to follow it.`;
  }
  summaryCamera.zoom=Number($('summary-zoom').value);summaryCamera.updateProjectionMatrix();summaryCamera.lookAt(target);summaryRenderer.render(scene,summaryCamera);
}
function issueTeammateCommand(command){
 const bot=game.bots.find(b=>b.id==='R2');if(!bot)return;
 bot.command=command==='auto'?null:command;bot.job=null;bot.path=[];bot.decision=0;
 const names={auto:'Auto',defender:'Defend',center:'Focus center',field:'Field scoring',space:'Give space',park:'Park now'};
 $('teammate-command-status').textContent=`R2: ${names[command]}`;if($('match-command'))$('match-command').value=command;
 toast(`R2: ${names[command]}. Resume to continue the match.`);
}
function updateTeammateDropdown(){
 if(!$('match-command-panel'))return;
 const visible=game.mode==='headtohead'&&!game.active&&!game.finished&&!welcome.open&&!help.open&&!result.open&&replayTime===null;
 $('match-command-panel').hidden=!visible;
 const bot=game.bots.find(b=>b.id==='R2');if(bot&&document.activeElement!==$('match-command'))$('match-command').value=bot.command||'auto';
}
function buildMatchCommandAndPlaybackUI(){
 $('app').insertAdjacentHTML('beforeend',`<aside id="match-command-panel" class="match-command-panel" hidden><label for="match-command">R2 / TEAMMATE COMMAND</label><select id="match-command"><option value="auto">Auto strategy</option><option value="defender">Defend opponents</option><option value="center">Focus center</option><option value="field">Score alliance / neutral goals</option><option value="space">Give me space</option><option value="park">Park now</option></select><p>Esc releases the cursor and pauses. Choose a command, then resume driving.</p><button id="match-command-resume" class="primary small">Resume match</button></aside>`);
 $('match-command').onchange=()=>{if(!game.active&&!document.pointerLockElement)issueTeammateCommand($('match-command').value);};$('match-command-resume').onclick=capture;
 document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)updateTeammateDropdown();});
 document.querySelector('.summary-toolbar').insertAdjacentHTML('afterend',`<div class="replay-transport"><button id="summary-play">Play replay</button><button id="summary-restart">Replay from start</button><label>Speed <select id="summary-replay-speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option></select></label><label><input id="summary-replay-loop" type="checkbox">Loop</label></div>`);
 $('replay-live').insertAdjacentHTML('beforebegin',`<button id="practice-replay-play">Play replay</button><button id="practice-replay-restart">From start</button><label>Speed <select id="practice-replay-speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option><option value="4">4x</option></select></label><label><input id="practice-replay-loop" type="checkbox">Loop</label>`);
 $('summary-play').onclick=()=>toggleReplay('summary');$('summary-restart').onclick=()=>startReplay('summary',0);
 $('practice-replay-play').onclick=()=>toggleReplay('practice');$('practice-replay-restart').onclick=()=>startReplay('practice',replayFrames[0]?.elapsed||0);
 $('summary-time').addEventListener('input',()=>playback.pause());$('replay-scrub').addEventListener('input',()=>playback.pause());$('auto-scrub').addEventListener('input',()=>playback.pause());
 $('replay-live').addEventListener('click',()=>playback.pause());$('auto-live').addEventListener('click',()=>playback.pause());
 result.addEventListener('close',()=>{if(playbackContext==='summary')playback.pause();});
 $('summary-3d-view').insertAdjacentHTML('beforeend','<p class="tiny">3D replay lets you review pickups, scoring and robot contact from different angles. Press Play replay to watch the recorded match automatically.</p>');
}
function toggleReplay(context){if(playback.playing&&playbackContext===context){playback.pause();updateReplayButtons();return;}const slider=context==='summary'?$('summary-time'):$('replay-scrub');startReplay(context,Number(slider.value));}
function startReplay(context,time){
 game.pause();keys.clear();exitMouse();playbackContext=context;
 const duration=context==='summary'?game.summary?.duration||game.elapsed:game.elapsed;
 const prefix=context==='summary'?'summary':'practice';playback.rate=Number($(prefix+'-replay-speed').value);playback.loop=$(prefix+'-replay-loop').checked;
 playback.play(duration,time,context==='practice'?(replayFrames[0]?.elapsed||0):0);replayTime=playback.time;
 if(context==='summary'){$('summary-time').value=replayTime;$('summary-time').oninput?.();}else $('replay-scrub').value=replayTime;
 updateReplayButtons();
}
function advanceReplay(dt){
 if(!playback.playing)return;if(playbackContext==='summary'&&!result.open){playback.pause();return;}
 const prefix=playbackContext==='summary'?'summary':'practice';playback.rate=Number($(prefix+'-replay-speed').value);playback.loop=$(prefix+'-replay-loop').checked;
 replayTime=playback.tick(dt);
 if(playbackContext==='summary'){$('summary-time').value=replayTime;$('summary-time').oninput?.();}else $('replay-scrub').value=replayTime;
 updateReplayButtons();
}
function updateReplayButtons(){if(!$('summary-play'))return;$('summary-play').textContent=playback.playing&&playbackContext==='summary'?'Pause replay':'Play replay';$('practice-replay-play').textContent=playback.playing&&playbackContext==='practice'?'Pause replay':'Play replay';}
function difficultyOptions(value='standard'){if(!DIFFICULTIES[value])value='standard';return Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${id===value?'selected':''}>${d.name}</option>`).join('');}
function buildStrategyLab(){
 const existing=readLocal('pinnacle-match-v1',{});
 for(const id of ['R2','B1','B2']){const wrapper=document.createElement('label');wrapper.className='bot-skill';wrapper.textContent=`${id} skill `;const select=document.createElement('select');select.id=`difficulty-${id}`;select.setAttribute('aria-label',`${id} difficulty`);select.innerHTML=difficultyOptions(existing.bots?.[id]?.difficulty);wrapper.append(select);$(`strategy-${id}`).closest('.bot-setup').append(wrapper);}
 const setup=$('ai-speed').closest('details');setup.querySelector('summary').insertAdjacentHTML('afterend','<label class="setting-select">Set both opponents<select id="opponent-difficulty"><option value="">Individual skill settings</option>'+difficultyOptions()+'</select></label><p class="tiny">Skill changes speed, turning, lift handling, reaction time and wandering. Easy drivers can miss pickups. Standard keeps the original AI behavior. Set R2 separately to adjust your teammate.</p>');
 $('opponent-difficulty').value='';$('opponent-difficulty').onchange=()=>{if($('opponent-difficulty').value)for(const id of ['B1','B2'])$(`difficulty-${id}`).value=$('opponent-difficulty').value;};
 $('auto-start').insertAdjacentHTML('afterend','<button id="strategy-start" class="mode-card strategy-card"><span class="mode-number">05 / STRATEGY LAB</span><strong>Strategy simulator <span>&#8599;</span></strong><span>Design an alliance plan. Choose opponent strategies and skill. Test hundreds of matches in the background.</span></button>');$('strategy-start').onclick=enterStrategyLab;
 $('mode-button').insertAdjacentHTML('beforebegin','<button id="strategy-lab-button" class="quiet">Strategy lab</button>');$('strategy-lab-button').onclick=enterStrategyLab;
 $('app').insertAdjacentHTML('beforeend',`<section id="strategy-lab" class="strategy-lab" hidden><header class="strategy-header"><div><span class="eyebrow">STRATEGY LAB / 2V2 / 120 SECONDS</span><h1>Test a match plan.</h1><p>R1 runs your strategy. Configure your teammate and opponents, then estimate success across repeated simulated matches.</p></div><button id="strategy-back" class="quiet">Back to modes</button></header><div class="strategy-columns"><div class="strategy-editor"><h2>Your robot / R1</h2><label class="setting-select">Your robot skill<select id="lab-own-skill">${difficultyOptions(strategyConfig.ownDifficulty)}</select></label><label class="tool-check"><input id="lab-intake" type="checkbox" ${strategyConfig.intakeEnabled!==false?'checked':''}>R1 has a rear intake</label><p class="tiny">Strategy simulator only. Without an intake, R1 collects objects with its front claw.</p><div class="tool-row"><button id="lab-preset-center">Center first</button><button id="lab-preset-field">Field scoring</button><button id="lab-preset-defend">Defense first</button></div><div id="strategy-phases"></div><button id="strategy-add-phase">+ Split final phase</button><details class="lab-details"><summary>Type a strategy</summary><p class="tiny">Use one start-end: action per line. Actions: center, alliance, neutral, balanced, defend, park. Phases must cover 0-120s without gaps. Example: 0-45: center; 45-108: alliance; 108-120: park.</p><textarea id="strategy-script" rows="5" spellcheck="false" aria-label="Typed match strategy"></textarea><button id="strategy-apply-text">Apply typed strategy</button><p id="strategy-parse-status" class="tiny" role="status"></p></details><details class="lab-details" open><summary>Behavior and endgame</summary>${[['wander','Wandering / detours',0,1,.01],['descore','Center descoring tendency',0,1,.01],['aggression','Defensive pressure',0,1,.01],['parkingChance','Automatic parking attempt chance',0,1,.01],['parkAt','Automatic return with seconds left',0,30,1]].map(([key,label,min,max,step])=>`<label class="lab-slider">${label}<input data-program="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${strategyConfig.program[key]}"><output>${key==='parkAt'?strategyConfig.program[key]+'s':Math.round(strategyConfig.program[key]*100)+'%'}</output></label>`).join('')}<p class="tiny">A Park phase always attempts parking. Automatic parking applies when the lead time is reached and the attempt is selected. Role phases keep running until their end time.</p></details><h2>Other robots</h2>${['R2','B1','B2'].map(id=>`<div class="lab-robot"><b>${id} ${id==='R2'?'teammate':'opponent'}</b><label>Strategy<select id="lab-role-${id}">${[['random','Random each match'],['center','Center scorer/descorer'],['field','Alliance / neutral scorer'],['defender','Defender']].map(([r,n])=>`<option value="${r}" ${strategyConfig.bots[id].role===r?'selected':''}>${n}</option>`).join('')}</select></label><label>Skill<select id="lab-skill-${id}">${difficultyOptions(strategyConfig.bots[id].difficulty)}</select></label></div>`).join('')}<label class="tool-check"><input id="lab-use-setup" type="checkbox">Use current custom field setup</label></div><div class="strategy-analysis"><h2>Experiment</h2><label class="setting-select">Count as success when<select id="lab-objective"><option value="win">Red wins the match</option><option value="score">Red reaches a score target</option><option value="endgame">Red earns the endgame RP</option><option value="win-endgame">Red wins and earns endgame RP</option></select></label><div class="tool-row"><label>Target score<input id="lab-target" type="number" min="0" max="2000" value="${strategyConfig.targetScore}"></label><label>Matches<input id="lab-count" type="number" min="1" max="500" value="${strategyConfig.trials}"></label><label>Seed<input id="lab-seed" type="number" min="0" max="4294967295" value="${strategyConfig.seed}"></label></div><div class="tool-row"><button id="strategy-run" class="primary">Run background matches</button><button id="strategy-suggest">Find best strategies</button><button id="strategy-cancel" disabled>Stop after this match</button><button id="strategy-export" disabled>Export results</button></div><progress id="strategy-progress" max="100" value="0"></progress><p id="strategy-run-status" class="tiny" role="status">Ready. Your current live match will not be modified.</p><div id="strategy-recommendations" class="lab-details"></div><div id="strategy-metrics" class="strategy-metrics"></div><div class="tool-row"><label>Example route<select id="strategy-example"><option value="best">Best score margin</option><option value="worst">Worst score margin</option></select></label></div><div class="tool-row"><button id="strategy-route-play">Play route</button><button id="strategy-route-restart">Restart</button><label>Speed<select id="strategy-route-speed"><option value="1">1x</option><option value="2">2x</option><option value="4" selected>4x</option><option value="8">8x</option></select></label><label>Robot<select id="strategy-route-focus"><option value="all">All robots</option><option>R1</option><option>R2</option><option>B1</option><option>B2</option></select></label></div><label class="lab-slider">Match progression <input id="strategy-route-time" type="range" min="0" max="120" step="0.1" value="120"><output id="strategy-route-clock">120.0 / 120s</output></label><p id="strategy-route-phase" class="tiny"></p><canvas id="strategy-route" width="600" height="600" aria-label="Representative simulated match robot paths"></canvas><p id="strategy-example-caption" class="tiny"></p><p class="tiny">Paths track robot centers. Outlined robots show their size; the forward line shows claw reach. Rings and dashed lines mark goal placements. Lime R1, pink R2, blue B1/B2.</p><div id="strategy-route-events" class="tiny" aria-live="off"></div><p class="strategy-limits">Success percentages describe this simulator and the chosen opponents. They are not predictions of a real tournament. Use more trials to narrow sampling uncertainty. Identical settings and seed produce repeatable matches. Ties are reported separately and do not count as wins.</p></div></div></section>`);
 $('lab-objective').value=strategyConfig.objective;$('strategy-start').onmouseenter=()=>{$('mode-preview-title').textContent='Strategy simulator';$('mode-preview-description').textContent='Test customizable alliance plans against opponents of different skill levels.';};
 $('strategy-start').onfocus=$('strategy-start').onmouseenter;
 $('strategy-back').onclick=()=>{leaveStrategyLab();welcome.showModal();};
 const preset=(phases)=>{strategyConfig.program.phases=phases;renderStrategyPhases();saveStrategyConfig();};
 $('lab-preset-center').onclick=()=>preset(defaultProgram().phases);$('lab-preset-field').onclick=()=>preset([{until:108,action:'alliance'},{until:120,action:'park'}]);$('lab-preset-defend').onclick=()=>preset([{until:55,action:'defender'},{until:108,action:'neutral'},{until:120,action:'park'}]);
 $('strategy-add-phase').onclick=()=>{const phases=strategyConfig.program.phases,last=phases.at(-1),previous=phases.at(-2)?.until||0;if(phases.length>=12||120-previous<2)return;last.until=(previous+120)/2;phases.push({until:120,action:'park'});renderStrategyPhases();saveStrategyConfig();};
 $('strategy-script').oninput=()=>{strategyTextDirty=true;$('strategy-parse-status').textContent='Text edited. Apply to preview, or Run to parse and test it.';};
 $('strategy-apply-text').onclick=()=>{try{strategyConfig.program=parseStrategy($('strategy-script').value,strategyConfig.program);renderStrategyPhases();saveStrategyConfig();$('strategy-parse-status').textContent='Applied. The phase list shows the strategy that will run.';}catch(error){$('strategy-parse-status').textContent=error.message;}};
 for(const el of document.querySelectorAll('[data-program]'))el.oninput=()=>{strategyConfig.program[el.dataset.program]=Number(el.value);el.nextElementSibling.textContent=el.dataset.program==='parkAt'?el.value+'s':Math.round(Number(el.value)*100)+'%';saveStrategyConfig();};
 $('strategy-run').onclick=()=>runStrategyBatch();$('strategy-suggest').onclick=()=>runStrategyBatch(true);$('strategy-cancel').onclick=()=>{strategyWorker?.postMessage({type:'cancel'});$('strategy-run-status').textContent='Stopping after the current match...';};$('strategy-export').onclick=()=>{if(strategyResults)downloadJSON('pinnacle-strategy-results.json',strategyResults);};$('strategy-example').onchange=()=>{strategyPlayback.pause();drawStrategyRoute();};
 $('strategy-route-time').oninput=()=>{strategyPlayback.pause();strategyPlayback.time=Number($('strategy-route-time').value);drawStrategyRoute();};
 $('strategy-route-play').onclick=()=>{if(!strategyResults?.[$('strategy-example').value])return;if(strategyPlayback.playing)strategyPlayback.pause();else strategyPlayback.play(120);drawStrategyRoute();};
 $('strategy-route-restart').onclick=()=>{if(!strategyResults?.[$('strategy-example').value])return;strategyPlayback.play(120,0);drawStrategyRoute();};
 $('strategy-route-speed').onchange=()=>strategyPlayback.rate=Number($('strategy-route-speed').value);strategyPlayback.rate=4;
 $('strategy-route-focus').onchange=drawStrategyRoute;
 for(const el of $('strategy-lab').querySelectorAll('select,input:not([data-program])'))el.addEventListener('change',saveStrategyConfig);
 renderStrategyPhases();drawStrategyRoute();
}
function enterStrategyLab(){pause();if(welcome.open)welcome.close();if(help.open)help.close();if(result.open)result.close();$('practice-tools').hidden=true;document.body.classList.remove('tools-open');document.body.classList.add('strategy-mode');$('strategy-lab').hidden=false;updateUI();}
function leaveStrategyLab(){strategyPlayback.pause();document.body.classList.remove('strategy-mode');if($('strategy-lab'))$('strategy-lab').hidden=true;}
function renderStrategyPhases(){
 $('strategy-phases').innerHTML=strategyConfig.program.phases.map((p,i)=>`<div class="strategy-phase"><span>${i===0?0:strategyConfig.program.phases[i-1].until}s to</span><input data-phase-end="${i}" type="number" min="1" max="120" step="1" value="${p.until}" ${i===strategyConfig.program.phases.length-1?'disabled':''} aria-label="Phase ${i+1} end time"><span>s</span><select data-phase-action="${i}" aria-label="Phase ${i+1} strategy">${Object.entries(STRATEGY_ACTIONS).map(([id,n])=>`<option value="${id}" ${id===p.action?'selected':''}>${n}</option>`).join('')}</select><button data-phase-delete="${i}" aria-label="Delete phase ${i+1}" ${strategyConfig.program.phases.length===1?'disabled':''}>&times;</button></div>`).join('');
 strategyTextDirty=false;$('strategy-script').value=strategyText(strategyConfig.program);
 for(const el of $('strategy-phases').querySelectorAll('[data-phase-action]'))el.onchange=()=>{strategyConfig.program.phases[Number(el.dataset.phaseAction)].action=el.value;saveStrategyConfig();$('strategy-script').value=strategyText(strategyConfig.program);};
 for(const el of $('strategy-phases').querySelectorAll('[data-phase-end]'))el.onchange=()=>{const i=Number(el.dataset.phaseEnd),old=strategyConfig.program.phases[i].until;strategyConfig.program.phases[i].until=Number(el.value);const error=validateProgram(strategyConfig.program);if(error){strategyConfig.program.phases[i].until=old;toast(error);}saveStrategyConfig();renderStrategyPhases();};
 for(const el of $('strategy-phases').querySelectorAll('[data-phase-delete]'))el.onclick=()=>{strategyConfig.program.phases.splice(Number(el.dataset.phaseDelete),1);strategyConfig.program.phases.at(-1).until=120;renderStrategyPhases();saveStrategyConfig();};
}
function saveStrategyConfig(){if(!$('lab-own-skill'))return;strategyConfig.intakeEnabled=$('lab-intake').checked;strategyConfig.ownDifficulty=$('lab-own-skill').value;for(const id of ['R2','B1','B2'])strategyConfig.bots[id]={role:$(`lab-role-${id}`).value,difficulty:$(`lab-skill-${id}`).value};strategyConfig.objective=$('lab-objective').value;strategyConfig.targetScore=Number($('lab-target').value);strategyConfig.trials=Number($('lab-count').value);strategyConfig.seed=Number($('lab-seed').value);if(!validateBatch(strategyConfig))writeLocal('pinnacle-strategy-lab-v1',strategyConfig);}
function runStrategyBatch(recommend=false){
 if(strategyTextDirty){try{strategyConfig.program=parseStrategy($('strategy-script').value,strategyConfig.program);renderStrategyPhases();$('strategy-parse-status').textContent='Typed strategy parsed and applied.';}catch(error){$('strategy-run-status').textContent=error.message;$('strategy-parse-status').textContent=error.message;return;}}
 saveStrategyConfig();const error=validateBatch(strategyConfig);if(error){$('strategy-run-status').textContent=error;return;}if(strategyRunning)return;
 const config=structuredClone(strategyConfig);if($('lab-use-setup').checked){if(!selectedSetup){$('strategy-run-status').textContent='Save or activate a custom field setup first.';return;}config.setup=selectedSetup;}
 strategyPlayback.pause();strategyPlayback.time=120;strategyResults=null;strategyRunning=true;$('strategy-recommendations').textContent=recommend?'Comparing five plans using the same trial seeds and robot settings. Each plan runs the selected number of matches.':'';$('strategy-suggest').disabled=true;$('strategy-run').disabled=true;$('strategy-cancel').disabled=false;$('strategy-export').disabled=true;$('strategy-progress').max=config.trials;$('strategy-progress').value=0;$('strategy-run-status').textContent='Starting background worker...';
 try{strategyWorker=new Worker('./strategy-worker.js',{type:'module'});}catch(error){finishStrategyError(error.message);return;}
 strategyWorker.onerror=event=>finishStrategyError(event.message||'Background simulation could not start.');
 strategyWorker.onmessage=({data})=>{if(data.type==='error'){finishStrategyError(data.message);return;}strategyResults={...data,config:data.config||config};$('strategy-progress').max=data.total||config.trials;$('strategy-progress').value=data.completed??data.summary.completed;renderStrategyResults(data.summary);drawStrategyRoute();$('strategy-lab-button').textContent=`Strategy lab (${data.summary.completed}/${config.trials})`;
  if(data.type==='complete'){renderStrategyRecommendations(data.recommendations);strategyRunning=false;$('strategy-suggest').disabled=false;$('strategy-run').disabled=false;$('strategy-cancel').disabled=true;$('strategy-export').disabled=false;$('strategy-run-status').textContent=`${data.cancelled?'Stopped':'Finished'} ${data.summary.completed} / ${config.trials} matches. Results use the settings captured when this batch started.${recommend?' Compared '+(data.recommendations?.length||0)+' complete plans; the map shows the highest ranked plan.':''}`;strategyWorker.terminate();strategyWorker=null;}else $('strategy-run-status').textContent=`Simulated ${data.completed??data.summary.completed} / ${data.total||config.trials} matches${data.candidate?' | '+data.candidate:''}. You may return to other modes while this runs.`;
 };strategyWorker.postMessage({type:recommend?'recommend':'run',config});
}
function finishStrategyError(message){$('strategy-suggest').disabled=false;strategyRunning=false;strategyWorker?.terminate();strategyWorker=null;$('strategy-run').disabled=false;$('strategy-cancel').disabled=true;$('strategy-run-status').textContent=message;}
function renderStrategyResults(s){if(!s.completed){$('strategy-metrics').textContent='No completed matches.';return;}$('strategy-metrics').innerHTML=`<div class="strategy-success"><strong>${(s.successRate*100).toFixed(1)}%</strong><span>${({win:'won the match',score:'reached '+strategyResults.config.targetScore+' points',endgame:'earned endgame RP','win-endgame':'won and earned endgame RP'})[strategyResults.config.objective]}<br><small>95% sampling interval ${(s.interval[0]*100).toFixed(1)}-${(s.interval[1]*100).toFixed(1)}%</small></span></div><div class="summary-stats">${[['Matches',s.completed],['Wins / ties / losses',`${s.wins} / ${s.ties} / ${s.losses}`],['Win rate',`${(s.winRate*100).toFixed(1)}%`],['Average red / blue score',`${s.averageRed.toFixed(1)} / ${s.averageBlue.toFixed(1)}`],['Red score range',`${s.minRed}-${s.maxRed}`],['Endgame RP earned',`${(s.endgameRate*100).toFixed(1)}%`],['Average red ranking points',s.averageRanking.toFixed(2)]].map(([k,v])=>`<span>${k}</span><b>${v}</b>`).join('')}</div>`;}
function strategyPose(path,t){
 const i=path.findIndex(p=>p.t>t);if(i<0)return path.at(-1);if(i===0)return path[0];const a=path[i-1],b=path[i],f=(t-a.t)/(b.t-a.t),angle=Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading));return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,heading:a.heading+angle*f};
}
function drawStrategyRoute(){
 if(!$('strategy-route'))return;const canvas=$('strategy-route'),ctx=canvas.getContext('2d'),scale=550/144,to=n=>25+(n+72)*scale,t=strategyPlayback.time,focus=$('strategy-route-focus').value;
 $('strategy-route-time').value=t;$('strategy-route-clock').textContent=t.toFixed(1)+' / 120s';$('strategy-route-play').textContent=strategyPlayback.playing?'Pause route':'Play route';
 ctx.fillStyle='#263735';ctx.fillRect(0,0,600,600);ctx.strokeStyle='#a6b8a040';for(let n=-72;n<=72;n+=24){ctx.beginPath();ctx.moveTo(to(n),25);ctx.lineTo(to(n),575);ctx.moveTo(25,to(n));ctx.lineTo(575,to(n));ctx.stroke();}
 const trial=strategyResults?.[$('strategy-example').value];for(const g of trial?.goals||game.goals){ctx.fillStyle=cssColors[g.color];ctx.beginPath();ctx.arc(to(g.x),to(g.z),4.5*scale,0,Math.PI*2);ctx.fill();}
 if(!trial){$('strategy-example-caption').textContent='Example paths appear after the first simulated match.';$('strategy-route-events').textContent='';$('strategy-route-phase').textContent='';return;}
 const color=r=>r.id==='R1'?'#c6f36b':r.color==='red'?'#ed777d':r.id==='B1'?'#62bcec':'#b4a8ff';
 for(const r of trial.paths){const active=focus==='all'||focus===r.id;ctx.globalAlpha=active?1:.15;ctx.strokeStyle=color(r);ctx.lineWidth=r.id==='R1'?4:2;ctx.beginPath();for(const [i,p] of r.path.entries()){if(p.t>t)break;ctx[i?'lineTo':'moveTo'](to(p.x),to(p.z));}const p=strategyPose(r.path,t);ctx.lineTo(to(p.x),to(p.z));ctx.stroke();ctx.save();ctx.translate(to(p.x),to(p.z));ctx.rotate(-p.heading);ctx.fillStyle='#162523bb';ctx.lineWidth=2;ctx.fillRect(-8*scale,-8*scale,16*scale,16*scale);ctx.strokeRect(-8*scale,-8*scale,16*scale,16*scale);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,12*scale);ctx.stroke();ctx.beginPath();ctx.arc(0,12*scale,3,0,Math.PI*2);ctx.stroke();ctx.restore();ctx.fillStyle=color(r);ctx.font='bold 13px sans-serif';ctx.fillText(r.id,to(p.x)+9,to(p.z)-9);}
 ctx.globalAlpha=1;
 const events=(trial.timeline||[]).filter(e=>e.t<=t&&(focus==='all'||e.robot===focus));
 for(const e of events.filter(e=>e.kind==='place')){const r=trial.paths.find(r=>r.id===e.robot);if(!r)continue;const p=strategyPose(r.path,e.t);ctx.strokeStyle=color(r);ctx.globalAlpha=t-e.t<3?1:.35;ctx.setLineDash([4,5]);ctx.beginPath();ctx.moveTo(to(p.x),to(p.z));ctx.lineTo(to(e.x),to(e.z));ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(to(e.x),to(e.z),20,0,Math.PI*2);ctx.stroke();}ctx.globalAlpha=1;
 const score=trial.scoreTimeline?.findLast(s=>s.t<=t)||{red:0,blue:0},phase=strategyResults.config.program.phases.find(p=>t<p.until)||strategyResults.config.program.phases.at(-1);
 $('strategy-route-phase').textContent='R1 phase: '+STRATEGY_ACTIONS[phase.action]+' | Red '+score.red+' : '+score.blue+' Blue | '+(120-t).toFixed(1)+'s remaining';
 $('strategy-example-caption').textContent='Trial '+(trial.index+1)+', seed '+trial.seed+'. Final score: red '+trial.red+', blue '+trial.blue+'.';
 $('strategy-route-events').textContent=events.slice(-5).map(e=>e.t.toFixed(1)+'s '+e.robot+' '+e.kind+(e.goalId?' at '+e.goalId:'')+(e.ownDelta?' ('+(e.ownDelta>0?'+':'')+e.ownDelta+' pts)':'')).join(' ? ')||'No robot actions yet.';
}

function renderStrategyRecommendations(rows){
 const root=$('strategy-recommendations');root.replaceChildren();if(!rows)return;
 const note=document.createElement('p');note.className='tiny';note.textContent='Ranked by your success condition, then average score margin and ranking points. Only fully tested plans are included. These are the best of the five plans tested; small differences may be sampling noise.';root.append(note);
 rows.forEach((r,i)=>{const box=document.createElement('div');box.className='lab-details';const text=document.createElement('p');text.textContent=(i+1)+'. '+r.name+' - '+(r.summary.successRate*100).toFixed(1)+'% success, '+r.summary.averageRed.toFixed(1)+' average red points, '+r.summary.completed+' matches';const button=document.createElement('button');button.textContent='Use this plan';button.onclick=()=>{strategyConfig.program=structuredClone(r.program);renderStrategyPhases();saveStrategyConfig();toast('Strategy applied. Run matches to test your edits.');};box.append(text,button);root.append(box);});
}
