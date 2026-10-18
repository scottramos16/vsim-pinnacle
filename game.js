// Independent simulation model. World coordinates and dimensions are inches.
import { createBots, updateBots } from './ai.js';
import { createHistory, sampleHistory, recordAction, buildSummary } from './summary.js';
export const FIELD_HALF = 72;
export const PIN_HEIGHT = 6.48;
export const CUP_HEIGHT = 6.48;
// Nested objects overlap by one half: centers are 3.24 inches apart.
export const STACK_STEP = PIN_HEIGHT / 2;
export const MAX_LIFT = 60;
export const LOADER_DECK_DOWN = .7;
export const LOADER_HANDLE_DOWN = 11.8;
export const LOADER_HANDLE_UP = 16.5;
export const PIN_COLORS = { ry: ['red','yellow'], by: ['blue','yellow'], yy: ['yellow','yellow'], rb: ['red','blue'] };
export const GOAL_DEFS = [
  { id: 'red-upper', name: 'Red · upper', color: 'red', x: -48, z: -24, height: 5.77, zone: 'red' },
  { id: 'red-lower', name: 'Red · lower', color: 'red', x: -48, z: 24, height: 5.77, zone: 'red' },
  { id: 'blue-upper', name: 'Blue · upper', color: 'blue', x: 48, z: -24, height: 5.77, zone: 'blue' },
  { id: 'blue-lower', name: 'Blue · lower', color: 'blue', x: 48, z: 24, height: 5.77, zone: 'blue' },
  { id: 'neutral-upper', name: 'Neutral · upper', color: 'neutral', x: 0, z: -48, height: 5.77, zone: 'north' },
  { id: 'neutral-lower', name: 'Neutral · lower', color: 'neutral', x: 0, z: 48, height: 5.77, zone: 'south' },
  { id: 'center', name: 'Center', color: 'center', x: 0, z: 0, height: 8.77, zone: null },
];
export const LOADER_DEFS = [
  { x: -68.5, z: -60, side: 'red' }, { x: -68.5, z: 60, side: 'red' },
  { x: 68.5, z: -60, side: 'blue' }, { x: 68.5, z: 60, side: 'blue' },
];
export function halfPoints(color, goal, rollers) {
  if (goal.color === 'center') return 10;
  if (color === 'red' || color === 'blue') return goal.color === color || goal.color === 'neutral' ? 5 : 0;
  const required = goal.color === 'blue' ? 'blue' : 'red';
  return rollers[goal.zone] === required ? 5 : 0;
}
export function scoreGoal(goal, objects, rollers) {
  let total = 0, cups = 0, halves = 0;
  const stack = [];
  for (const id of goal.stack) {
    const object = objects.find(o => o.id === id);
    if (!object || object.type !== (stack.length % 2 === 0 ? 'pin' : 'cup')) break;
    stack.push(object);
  }
  // Validate the entire support chain: pin in goal, cup on pin, pin in cup.
  for (let i = 0; i < stack.length; i++) {
    const object = stack[i];
    if (!object || object.type !== (i % 2 === 0 ? 'pin' : 'cup')) break;
    if (object.type === 'cup') { cups++; total++; continue; }
    const below = stack[i - 1], above = stack[i + 1];
    const bottomVisible = i > 0 && below.type === 'cup' && below.clearUp;
    const topVisible = !above || (above.type === 'cup' && !above.clearUp);
    for (const [visible, color] of [[bottomVisible, object.bottom], [topVisible, object.top]]) {
      if (visible) { halves++; total += halfPoints(color, goal, rollers); }
    }
  }
  return { total, cups, halves };
}
export class Game {
  constructor({random=Math.random}={}) { this.random=random;this.reset('practice'); }
  make(type, x, z, options = {}) {
    const o = { id: this.nextId++, type, x, z, y: PIN_HEIGHT / 2, vy: 0, yaw: 0,
      top: 'red', bottom: 'yellow', clearUp: true, goalId: null, held: false, lying: false, ...options };
    this.objects.push(o); return o;
  }
  reset(mode = this.mode) {
    this.mode = mode; this.remaining = mode==='headtohead'?120:mode==='autonomous'?15:60; this.elapsed = 0; this.running = false;
    this.finished = false; this.started = false; this.nextId = 1; this.objects = [];
    this.robot = { id:'R1',color:'red', x: -61, z: -60, heading: Math.PI / 2, lift: 2.2, speed: 0 };
    this.player=this.robot;this.bots=[];this.automatedPlayer=false;this.intake={objectId:null,progress:0,running:false};this.contactTime=0;this.lastContact=-Infinity;
    this.goals = GOAL_DEFS.map(g => ({ ...g, stack: [] }));
    this.rollers = { red: 'yellow', blue: 'yellow', north: 'yellow', south: 'yellow' };
    this.supply = { red: { ry: 11, by: 2, yy: 7, cup: 20 }, blue: { ry: 2, by: 12, yy: 7, cup: 20 } };
    // Each tray has its own recipe; the two red trays start with R/Y + cup.
    this.loaders = LOADER_DEFS.map((_,i) => ({ config: { ...(this.loaders?.[i]?.config || { mode: 'pair', pin: 'ry', pinFlip: false, clearUp: false, order: 'cup-pin' }) }, deck: LOADER_DECK_DOWN, handle:LOADER_HANDLE_DOWN, ids: [], cooldown: 0 }));
    const pin = (x, z, top, bottom, yaw = 0) => this.make('pin', x, z, { top, bottom, lying: true, yaw, y: 1.65 });
    // The uploaded layout: two pins at each outer tile intersection.
    for (const x of [-48, 48]) for (const z of [-48, 48]) {
      pin(x, z - 3.3, x * z > 0 ? 'red' : 'blue', 'yellow', Math.PI);
      pin(x, z + 3.3, 'yellow', x * z > 0 ? 'blue' : 'red', Math.PI);
    }
    for (const x of [-24, 24]) for (const z of [-24, 24]) {
      const sx = Math.sign(x), sz = Math.sign(z), yaw = Math.atan2(sx, sz);
      pin(x + sx * 2.35, z + sz * 2.35, z < 0 ? 'blue' : 'red', 'yellow', yaw);
      pin(x - sx * 2.35, z - sz * 2.35, 'yellow', 'yellow', yaw);
    }
    // Four additional pins shown in the user's reference, around side cups.
    for (const x of [-48, 48]) {
      const color = x < 0 ? 'red' : 'blue';
      pin(x - 3.8, 0, color, 'yellow', -Math.PI / 2);
      pin(x + 3.8, 0, 'yellow', color, -Math.PI / 2);
      this.make('cup', x, 0,{clearUp:false});
    }
    this.make('cup', 0, -24,{clearUp:false}); this.make('cup', 0, 24,{clearUp:false});
    for (const x of [-69.5, 69.5]) for (const z of [-36, 36]) {
      this.make('cup', x, z - 3.5,{clearUp:false}); this.make('cup', x, z + 3.5,{clearUp:false});
      // Side station: cup BELOW the upright R/B pin, not beside it.
      const c=this.make('cup',x,z,{clearUp:true,bundleIndex:0});
      c.bundleId=c.id;
      this.make('pin', x, z, { top: x < 0 ? 'blue' : 'red', bottom: x < 0 ? 'red' : 'blue',y:PIN_HEIGHT/2+STACK_STEP,bundleId:c.id,bundleIndex:1 });
    }
    // Yellow/yellow pin prepositioned in the center goal in the supplied image.
    const center = this.goals.find(g => g.id === 'center');
    const centerPin = this.make('pin', 0, 0, { top: 'yellow', bottom: 'yellow', goalId: center.id, y: center.height });
    center.stack.push(centerPin.id);
    const preload = this.make('pin', 0, 0, { top: 'red', bottom: 'yellow', held: true });
    this.heldId = preload.id; this.syncHeld(); this.finalScore = null;
    if(mode==='headtohead'){
      this.supply.red.ry=10;this.supply.blue.by=10;this.bots=createBots(this);
      if(this.matchConfig?.automatedPlayer){const i=this.bots.findIndex(b=>b.id==='R1');this.player=this.robot=this.bots.splice(i,1)[0];this.heldId=this.robot.heldId;this.automatedPlayer=true;}
    }
    for(const o of this.objects)if(o.type==='pin'&&o.lying)o.yaw+=Math.PI/4;
    this.history=createHistory(this);this.summary=null;
  }
  get held() { return this.objects.find(o => o.id === this.heldId) || null; }
  bundle(o) {
    return o?.bundleId ? this.objects.filter(p => p.bundleId === o.bundleId).sort((a,b) => a.bundleIndex-b.bundleIndex) : o ? [o] : [];
  }
  get heldObjects() { return this.bundle(this.held); }
  get active() { return this.running && !this.finished; }
  get claw() {
    const r = this.robot;
    return { x: r.x + Math.sin(r.heading) * 12, z: r.z + Math.cos(r.heading) * 12, y: r.lift + PIN_HEIGHT / 2 };
  }
  syncHeld() {
    const claw = this.claw;
    this.heldObjects.forEach((o,i) => Object.assign(o, claw, {x:claw.x+Math.sin(this.robot.swayX||0)*i*STACK_STEP,z:claw.z+Math.sin(this.robot.swayZ||0)*i*STACK_STEP,y: claw.y+i*STACK_STEP,lying:false,yaw:this.robot.heading,vy:0,stackTiltX:this.robot.swayZ||0,stackTiltZ:-(this.robot.swayX||0)}));
  }
  start() { this.started = true; this.running = true; }
  pause() { this.running = false; this.robot.speed = 0;this.intake.running=false; }
  get allRobots(){return [this.player,...this.bots];}
  asRobot(actor,fn){
    if(this.automatedPlayer&&actor===this.player){this.robot=actor;this.heldId=actor.heldId;try{return fn();}finally{actor.heldId=this.heldId;}}
    const previous=this.robot,id=this.heldId;this.robot=actor;this.heldId=actor.heldId;
    try{return fn();}finally{actor.heldId=this.heldId;this.robot=previous;this.heldId=id;}
  }
  canTouchGoal(goal,remove=false,actor=this.robot){
    if(this.mode!=='headtohead')return true;
    if(['red','blue'].includes(goal.color)&&goal.color!==actor.color)return false;
    return !(remove&&['neutral','center'].includes(goal.color)&&this.remaining<=30);
  }
  score() {
    if (this.finalScore) return this.finalScore;
    const goals = this.goals.map(g => ({ id: g.id, ...scoreGoal(g, this.objects, this.rollers),...(this.mode==='headtohead'?scoreAllianceGoal(g,this.objects,this.rollers):{}) }));
    const scores={ total: goals.reduce((n, g) => n + g.total, 0), goals, cups: goals.reduce((n, g) => n + g.cups, 0), halves: goals.reduce((n, g) => n + g.halves, 0) };
    if(this.mode==='headtohead'){
      const parking={red:0,blue:0};
      if(this.finished||this.remaining<=0)for(const l of LOADER_DEFS)if(this.allRobots.some(r=>r.color===l.side&&Math.hypot(r.x-l.x,r.z-l.z)<10))parking[l.side]+=21;
      scores.parking=parking;scores.red=goals.reduce((n,g)=>n+g.red,0)+parking.red;scores.blue=goals.reduce((n,g)=>n+g.blue,0)+parking.blue;scores.total=scores.red+scores.blue;
    }
    return scores;
  }
  finish() {
    this.finalScore = this.score(); this.running = false; this.finished = true; this.robot.speed = 0;this.intake.running=false;
    if(this.mode==='headtohead')for(const l of LOADER_DEFS){
      const r=this.allRobots.filter(r=>r.color===l.side&&Math.hypot(r.x-l.x,r.z-l.z)<10).sort((a,b)=>Math.hypot(a.x-l.x,a.z-l.z)-Math.hypot(b.x-l.x,b.z-l.z))[0];
      if(r){const h=this.history.robots[r.id];h.parking+=21;h.netSwing+=21;}
    }
    sampleHistory(this,true);this.summary=buildSummary(this);
  }
  tick(dt, input = {}) {
    if (!this.active) return;
    if(dt>.05){let left=dt;while(left>1e-8&&this.active){const step=Math.min(left,.05);this.tick(step,input);left-=step;}return;}
    const used = this.mode !== 'practice' ? Math.min(dt, this.remaining) : dt;
    this.elapsed += used;
    if (this.mode !== 'practice') this.remaining = Math.max(0, this.remaining - used);
    const r = this.robot;
    if(!this.automatedPlayer){
    r.lift = Math.max(0, Math.min(input.maxLift||MAX_LIFT, r.lift + (input.lift || 0) * (input.liftSpeed||23) * used));
    const desired = (input.drive || 0) * (input.driveSpeed||38)*(input.precision ? .4 : 1);
    r.speed += (desired - r.speed) * Math.min(1, used * (input.acceleration||10));
    if(input.turn)this.turn(input.turn*(input.turnSpeed||1.8)*used);
    const move = r.speed * used;
    // Resolve chassis against the wall and round goal footprints, one axis at a time.
    const canMove = (x, z) => this.movePlayerContact(x,z,used);
    const nx = r.x + Math.sin(r.heading) * move;
    if (canMove(nx, r.z)) r.x = nx;
    const nz = r.z + Math.cos(r.heading) * move;
    if (canMove(r.x, nz)) r.z = nz;
    this.syncHeld();
    this.updateIntake(used,!!input.intake);
    }
    updateBots(this,used);
    this.updateStackPhysics(used);
    this.updateLoaders(used);
    for (const o of this.objects) {
      if (o.held || o.goalId || o.loaderIndex != null || o.inIntake) continue;
      const floor = (o.lying||o.falling ? 1.65 : PIN_HEIGHT / 2) + (o.bundleIndex || 0)*STACK_STEP;
      if(o.falling){
        o.x=Math.max(-70,Math.min(70,o.x+(o.vx||0)*used));o.z=Math.max(-70,Math.min(70,o.z+(o.vz||0)*used));o.fallTilt=(o.fallTilt||0)+used*(o.spin||2);
        if(o.y<=1.7){o.lying=true;o.falling=false;o.y=1.65;o.vy=0;}
      }
      if (o.y > floor) { o.vy -= 100 * used; o.y = Math.max(floor, o.y + o.vy * used); if (o.y === floor) o.vy = 0; }
      if (o.y <= floor + .1) {
        for(const actor of this.allRobots){
        const dx = o.x - actor.x, dz = o.z - actor.z, d = Math.hypot(dx, dz);
        if (d < 11 && d > .01) {
          const px = Math.max(-70, Math.min(70, actor.x + dx / d * 11));
          const pz = Math.max(-70, Math.min(70, actor.z + dz / d * 11));
          if (this.goals.every(g => Math.hypot(px - g.x, pz - g.z) > 5)) { for(const part of this.bundle(o)){part.x=px;part.z=pz;} }
        }
        }
      }
    }
    sampleHistory(this);
    if (this.mode !== 'practice' && this.remaining <= 1e-8){this.remaining=0;this.finish();}
  }
  turn(delta) { if (this.active) { this.robot.heading = (this.robot.heading + delta) % (Math.PI * 2); this.syncHeld(); } }
  pickCandidate() {
    const c = this.claw;
    return this.objects.filter(o => !o.held && !o.inIntake && this.canTakeLoad(o) && !(o.bundleIndex > 0) && o.y <= c.y + 4 && Math.abs(o.y - c.y) < 6 && Math.hypot(o.x - c.x, o.z - c.z) < 6.5 && (!o.goalId || (this.canTouchGoal(this.goals.find(g=>g.id===o.goalId),true)&&(this.goals.find(g=>g.id===o.goalId).stack.at(-1)===o.id||(this.goals.find(g=>g.id===o.goalId).color===this.robot.color&&this.goals.find(g=>g.id===o.goalId).stack[0]===o.id))))).sort((a,b) => Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z))[0];
  }
  canTakeLoad(o,actor=this.robot){return this.mode!=='headtohead'||o.loaderIndex==null||LOADER_DEFS[o.loaderIndex].side===actor.color;}
  grab() {
    if (!this.active) return 'Click the field to resume driving.';
    if (this.held) return 'Claw is full. E releases the held object.';
    if(this.robot===this.player&&this.intake.objectId)return 'Intake is feeding a pin to the claw.';
    let o = this.pickCandidate();
    if (!o) return 'No object in reach. Move closer or adjust the lift.';
    const before=this.score(),oldGoal=o.goalId;
    let parts=this.bundle(o);
    if (o.goalId){
      const goal=this.goals.find(g=>g.id===o.goalId);
      if(goal.color===this.robot.color){
        parts=goal.stack.map(id=>this.objects.find(o=>o.id===id));o=parts[0];
        if(parts.length>1)parts.forEach((p,i)=>Object.assign(p,{bundleId:o.id,bundleIndex:i}));
        goal.stack=[];
      }else goal.stack.pop();
    }
    if(o.loaderIndex != null) {
      const loader=this.loaders[o.loaderIndex];loader.ids=[];loader.cooldown=1.5;
    }
    for(const part of parts)Object.assign(part, { held: true, goalId: null, lying: false, loaderIndex: null });
    this.heldId = o.id; this.syncHeld();recordAction(this,'pickup',before,{goalId:oldGoal});return `Picked up ${this.describe(o)}.`;
  }
  placementTarget() {
    if (!this.held) return null;
    const c = this.claw;
    const candidates = this.goals.filter(g => Math.hypot(g.x - c.x, g.z - c.z) < 6);
    const g = candidates.sort((a,b) => Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z))[0];
    if (!g) return null;
    const expectedType = g.stack.length % 2 === 0 ? 'pin' : 'cup';
    const y = g.height + g.stack.length * STACK_STEP;
    const compatible = this.heldObjects.every((o,i) => o.type === ((g.stack.length+i)%2===0 ? 'pin' : 'cup'));
    const heightOK = c.y >= y - 1.1 && c.y <= y + 7;
    const allowed=this.canTouchGoal(g);
    return { goal: g, y, compatible, heightOK, allowed, valid: compatible && heightOK && allowed, expectedType };
  }
  release() {
    if (!this.active) return 'Click the field to resume driving.';
    if(this.robot===this.player&&this.intake.objectId)return 'Finish feeding the intake before releasing the claw.';
    const o = this.held;
    if (!o) return 'The claw is empty. Q picks up an object.';
    const target = this.placementTarget();
    if(target&&!target.allowed)return 'Opponent alliance goals are protected.';
    if (target && !target.valid) return !target.compatible ? `This stack needs a ${target.expectedType} next.` : this.claw.y < target.y ? 'Raise the cascade to clear the top of the goal.' : 'Lower the cascade closer to the top of the stack.';
    const beforeScore=this.score(),before = beforeScore.total;
    const parts = this.heldObjects;
    if (target) {
      parts.forEach((part,i)=>{
        Object.assign(part, { x: target.goal.x, z: target.goal.z, y: target.y+i*STACK_STEP, goalId: target.goal.id, held: false, lying: false, bundleId: null, bundleIndex: 0 });
        target.goal.stack.push(part.id);
      });
    } else {
      const c = this.claw;
      if (Math.abs(c.x) > 70 || Math.abs(c.z) > 70) return 'Move away from the perimeter before releasing.';
      if (this.goals.some(g => Math.hypot(g.x-c.x,g.z-c.z) < 6)) return 'Move the claw clear of the goal before dropping.';
      const base=this.objects.filter(p=>!p.held&&!p.goalId&&!p.inIntake&&!p.lying&&!p.falling&&p.loaderIndex==null&&!(p.bundleIndex>0)&&Math.hypot(p.x-c.x,p.z-c.z)<3).sort((a,b)=>Math.hypot(a.x-c.x,a.z-c.z)-Math.hypot(b.x-c.x,b.z-c.z))[0];
      const existing=base?this.bundle(base):[],top=existing.at(-1);
      if(top&&top.type!==parts[0].type&&Math.abs(c.y-(top.y+STACK_STEP))<5){
        const combined=[...existing,...parts];combined.forEach((p,i)=>Object.assign(p,{bundleId:base.id,bundleIndex:i,x:base.x,z:base.z,y:base.y+i*STACK_STEP,held:false,goalId:null,lying:false,vy:0,stackTiltX:0,stackTiltZ:0}));
      }else parts.forEach((part,i)=>Object.assign(part, c, { y: c.y+i*STACK_STEP, held: false, goalId: null, vy: 0, lying: false,stackTiltX:0,stackTiltZ:0 }));
    }
    this.heldId = null;
    if(target)recordAction(this,'place',beforeScore,{goalId:target.goal.id,count:parts.length,x:target.goal.x,z:target.goal.z});else recordAction(this,'drop',beforeScore,{count:parts.length});
    const delta = this.score().total - before;
    return target ? `Nested on ${target.goal.name.toLowerCase()} · ${delta >= 0 ? '+' : ''}${delta} pts` : 'Released onto the field.';
  }
  flip() {
    if (!this.active) return 'Click the field to resume driving.';
    const o = this.held;
    if (!o) return 'Pick up a pin or cup before flipping.';
    const parts=this.heldObjects;
    for(const part of parts) {
      if(part.type==='pin')[part.top,part.bottom]=[part.bottom,part.top];else part.clearUp=!part.clearUp;
    }
    if(parts.length>1){parts.reverse().forEach((part,i)=>part.bundleIndex=i);this.heldId=parts[0].id;this.syncHeld();return 'Flipped pin + cup stack.';}
    return o.type === 'pin' ? `${o.top} half facing up.` : `Transparent half facing ${o.clearUp ? 'up' : 'down'}.`;
  }
  nearRoller() {
    const { x, z, heading } = this.robot;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const rear = { x: x - fx * 9, z: z - fz * 9 };
    // Rear bumper must face the wall and be within 4 inches of the roller.
    if (fx > .8 && Math.abs(rear.x + 73) <= 4 && Math.abs(rear.z) <= 14) return 'red';
    if (fx < -.8 && Math.abs(rear.x - 73) <= 4 && Math.abs(rear.z) <= 14) return 'blue';
    if (fz > .8 && Math.abs(rear.z + 73) <= 4 && Math.abs(rear.x) <= 14) return 'north';
    if (fz < -.8 && Math.abs(rear.z - 73) <= 4 && Math.abs(rear.x) <= 14) return 'south';
    return null;
  }
  rotateRoller() {
    if (!this.active) return 'Click the field to resume driving.';
    const zone = this.nearRoller();
    if (!zone) return 'Back the robot closer to the wall roller first.';
    const before=this.score();
    const colors = ['yellow', 'red', 'blue'];
    this.rollers[zone] = colors[(colors.indexOf(this.rollers[zone]) + 1) % 3];
    recordAction(this,'roller',before,{zone});
    return `${zone} roller → ${this.rollers[zone]}`;
  }
  load(index, type) {
    if (!this.active) return 'Start or resume the run before loading.';
    if(!this.loaders[index] || !['ry','by','yy','rb','cup','pair'].includes(type))return 'Unknown supply object.';
    const config={...this.loaders[index].config};
    if(type==='cup')config.mode='cup';else if(type==='pair')config.mode='pair';else{config.mode='pin';config.pin=type;}
    return this.fillLoader(index,config);
  }
  configureLoader(index, patch) {
    const loader=this.loaders[index];if(!loader)return false;
    const next={...loader.config,...patch};
    if(!['pin','cup','pair'].includes(next.mode)||!Object.hasOwn(PIN_COLORS,next.pin)||!['pin-cup','cup-pin'].includes(next.order)||typeof next.pinFlip!=='boolean'||typeof next.clearUp!=='boolean')return false;
    loader.config=next;return true;
  }
  nearLoader(index) {
    const l=LOADER_DEFS[index];return l && this.allRobots.some(r=>(this.mode!=='headtohead'||r.color===l.side)&&Math.hypot(r.x-l.x,r.z-l.z)<=22);
  }
  fillLoader(index, config=this.loaders[index]?.config) {
    const state=this.loaders[index],l=LOADER_DEFS[index];
    if(!state||!config)return 'Unknown loader.';
    if(state.ids.length || this.objects.some(o=>!o.held&&!o.goalId&&Math.hypot(o.x-l.x,o.z-l.z)<5))return 'This loader is occupied. Remove its object first.';
    const supply=this.supply[l.side],wantsPin=config.mode!=='cup',wantsCup=config.mode!=='pin';
    // Red/blue pins are on-field only; don't silently create them from other stock.
    if((wantsPin&&!supply[config.pin])||(wantsCup&&!supply.cup))return 'No more of this object in this driver box.';
    if(wantsPin)supply[config.pin]--;if(wantsCup)supply.cup--;
    const types=config.mode==='pair'?(config.order==='pin-cup'?['pin','cup']:['cup','pin']):[config.mode];
    let [top,bottom]=PIN_COLORS[config.pin];if(config.pinFlip)[top,bottom]=[bottom,top];
    state.ids=types.map((type,i)=>this.make(type,l.x,l.z,{top,bottom,clearUp:config.clearUp,loaderIndex:index,y:state.deck+PIN_HEIGHT/2+i*STACK_STEP,bundleIndex:i}).id);
    if(state.ids.length>1)for(const id of state.ids)this.objects.find(o=>o.id===id).bundleId=state.ids[0];
    return `Added ${config.mode==='pair'?'pin + cup':config.mode} to ${l.side} loader.`;
  }
  updateLoaders(dt) {
    this.loaders.forEach((state,index)=>{
      const l=LOADER_DEFS[index],near=this.nearLoader(index);
      state.cooldown=Math.max(0,state.cooldown-dt);
      // Refill only after the previous load is clear, and from available supply.
      if(near&&!state.ids.length&&!state.cooldown)this.fillLoader(index);
      const target=near?LOADER_HANDLE_UP:LOADER_HANDLE_DOWN;
      const distance=target-state.handle;
      state.handle=Math.abs(distance)<=dt*9?target:state.handle+Math.sign(distance)*dt*9;
      state.deck=LOADER_DECK_DOWN;
      state.ids.forEach((id,i)=>{const o=this.objects.find(o=>o.id===id);if(o)Object.assign(o,{x:l.x,z:l.z,y:state.deck+PIN_HEIGHT/2+i*STACK_STEP,vy:0});});
    });
  }
  canStand(x,z,actor=this.robot,ignoreRobots=false){
    return Math.abs(x)<=61.5&&Math.abs(z)<=61.5&&this.goals.every(g=>Math.hypot(x-g.x,z-g.z)>=12.1)&&(ignoreRobots||this.allRobots.every(r=>r===actor||Math.hypot(x-r.x,z-r.z)>=18));
  }
  movePlayerContact(x,z,dt){
    if(!this.canStand(x,z,this.player,true))return false;
    const contacts=this.bots.filter(b=>Math.hypot(x-b.x,z-b.z)<18);
    if(!contacts.length)return true;
    if(this.elapsed-this.lastContact>.5)this.contactTime=0;
    this.lastContact=this.elapsed;
    this.contactTime=(this.contactTime||0)+dt;
    for(const b of contacts){
      const dx=b.x-x,dz=b.z-z,d=Math.hypot(dx,dz)||1;
      // A brief, resisted shove with a little sideways yielding. Sustained
      // pressure rapidly loses force, preventing a cross-field bulldozer.
      const strength=this.contactTime<.8?3.4:0;
      const amount=Math.min(18-d,strength*dt);
      const nx=b.x+dx/d*amount,nz=b.z+dz/d*amount;
      if(this.canStand(nx,nz,b)){b.x=nx;b.z=nz;b.parked=false;b.stall+=dt;}
    }
    return this.bots.every(b=>Math.hypot(x-b.x,z-b.z)>=17.9);
  }
  updateIntake(dt,running){
    const state=this.intake,r=this.player;state.running=running;
    const accepts=o=>this.heldObjects.length<2&&(!this.held||this.held.type!==o.type);
    if(!state.objectId&&running&&this.heldObjects.length<2){
      const s=Math.sin(r.heading),c=Math.cos(r.heading);
      const candidate=this.objects.find(o=>accepts(o)&&!o.held&&!o.goalId&&!o.bundleId&&!o.inIntake&&o.loaderIndex==null&&o.y<4&&Math.hypot(o.x-(r.x-s*14),o.z-(r.z-c*14))<6);
      if(candidate){
        state.objectId=candidate.id;state.progress=0;
        const dx=candidate.x-r.x,dz=candidate.z-r.z;
        state.start={x:dx*c-dz*s,y:candidate.y,z:dx*s+dz*c};state.startTilt=candidate.lying?Math.PI/2:0;candidate.inIntake=true;candidate.intakeTilt=state.startTilt;candidate.lying=false;
      }
    }
    const o=this.objects.find(o=>o.id===state.objectId);if(!o)return;
    if(running&&accepts(o))state.progress=Math.min(r.lift<=.2?1:.85,state.progress+dt/2.2);
    const points=[state.start,{x:0,y:2.1,z:-10},{x:0,y:4.2,z:-4},{x:0,y:6.5,z:2},{x:0,y:PIN_HEIGHT/2+(this.held?STACK_STEP:0),z:12}];
    const t=state.progress*4,i=Math.min(3,Math.floor(t)),a=points[i],b=points[i+1],u=t-i,e=u*u*(3-2*u);
    const x=a.x+(b.x-a.x)*e,y=a.y+(b.y-a.y)*e,z=a.z+(b.z-a.z)*e,s=Math.sin(r.heading),c=Math.cos(r.heading);
    Object.assign(o,{x:r.x+x*c+z*s,y,z:r.z-x*s+z*c,yaw:r.heading,intakeTilt:state.startTilt*Math.max(0,1-state.progress*2)});
    if(state.progress>=1&&accepts(o)&&r.lift<=.2){
      o.inIntake=false;o.intakeTilt=0;o.held=true;
      if(this.held){const base=this.held;base.bundleId=base.id;base.bundleIndex=0;o.bundleId=base.id;o.bundleIndex=1;}else this.heldId=o.id;
      state.objectId=null;state.progress=0;this.syncHeld();recordAction(this,'intake',null,{objectType:o.type});
    }
  }
  updateStackPhysics(dt){
    for(const actor of this.allRobots)this.asRobotPhysics(actor,dt);if(this.automatedPlayer)this.player.heldId=this.heldId;
  }
  asRobotPhysics(actor,dt){
    const previous=actor.motion||{x:actor.x,z:actor.z,vx:0,vz:0,heading:actor.heading};
    const vx=(actor.x-previous.x)/dt,vz=(actor.z-previous.z)/dt,ax=Math.max(-100,Math.min(100,(vx-previous.vx)/dt)),az=Math.max(-100,Math.min(100,(vz-previous.vz)/dt));
    const omega=Math.atan2(Math.sin(actor.heading-previous.heading),Math.cos(actor.heading-previous.heading))/dt;
    actor.motion={x:actor.x,z:actor.z,vx,vz,heading:actor.heading};
    const parts=actor===this.player?this.heldObjects:this.bundle(this.objects.find(o=>o.id===actor.heldId));
    const targetX=Math.max(-.3,Math.min(.3,-ax*.0025)),targetZ=Math.max(-.3,Math.min(.3,-az*.0025));
    actor.swayX=(actor.swayX||0)+(targetX-(actor.swayX||0))*Math.min(1,dt*5);actor.swayZ=(actor.swayZ||0)+(targetZ-(actor.swayZ||0))*Math.min(1,dt*5);
    if(!parts.length){actor.stackStress=0;return;}
    const speed=Math.hypot(vx,vz),unstable=(speed>30&&(actor.lift>8||parts.length>2))||(speed>10&&Math.abs(omega)>2.2&&(actor.lift>10||parts.length>2));
    actor.stackStress=Math.max(0,(actor.stackStress||0)+(unstable?dt*(parts.length*.35+actor.lift/35):-dt*.6));
    if(actor.stackStress>1.2&&this.random()<dt*.8){
      const keep=parts.length>1?Math.max(1,Math.floor(parts.length/2)):0,lost=parts.slice(keep);
      for(const p of lost)Object.assign(p,{held:false,bundleId:null,bundleIndex:0,falling:true,fallTilt:0,spin:2+this.random()*3,vx:vx*.45+(this.random()-.5)*10,vz:vz*.45+(this.random()-.5)*10,vy:3,stackTiltX:0,stackTiltZ:0});
      if(parts.length- lost.length===1)Object.assign(parts[0],{bundleId:null,bundleIndex:0});
      if(!keep){if(actor===this.player)this.heldId=null;else actor.heldId=null;}
      actor.stackStress=0;const old=this.robot;this.robot=actor;recordAction(this,'spill',null,{count:lost.length});this.robot=old;
    }
    if(actor===this.player)this.syncHeld();else this.asRobot(actor,()=>this.syncHeld());
  }
  describe(o = this.held) { return !o ? 'Empty' : this.bundle(o).length>2?`Stack · ${this.bundle(o).length} objects`:this.bundle(o).length>1 ? 'Pin + cup' : o.type === 'cup' ? 'Cup' : `${o.top} / ${o.bottom} pin`; }
}

export function scoreAllianceGoal(goal,objects,rollers){
  const stack=[];for(const id of goal.stack){const o=objects.find(p=>p.id===id);if(!o||o.type!==(stack.length%2===0?'pin':'cup'))break;stack.push(o);}
  const visible={red:0,blue:0,yellow:0};let cups=0;
  stack.forEach((o,i)=>{if(o.type==='cup'){cups++;return;}if(i>0&&stack[i-1].clearUp)visible[o.bottom]++;if(!stack[i+1]||!stack[i+1].clearUp)visible[o.top]++;});
  const score={red:0,blue:0};
  if(goal.color==='center'){
    score.red=visible.red*10;score.blue=visible.blue*10;
    if(visible.red!==visible.blue)score[visible.red>visible.blue?'red':'blue']+=cups+visible.yellow*10;
  }else if(goal.color==='neutral'){
    score.red=visible.red*7;score.blue=visible.blue*7;
    if(['red','blue'].includes(rollers[goal.zone]))score[rollers[goal.zone]]+=cups+visible.yellow*7;
  }else{
    score[goal.color]=cups+visible[goal.color]*5;
    // v2.0 alliance example 3 awards yellow to the roller's alliance, even on
    // an opposite-colored goal; preserve that explicit example's behavior.
    if(['red','blue'].includes(rollers[goal.zone]))score[rollers[goal.zone]]+=visible.yellow*5;
  }
  return score;
}
