import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,LOADER_DEFS} from '../game.js';
import {AutoRunner,validateSequence} from '../autonomous.js';
test('whole floor and own goal stacks transfer together; neutral pickup remains single',()=>{
  const g=new Game();g.start();g.objects=[];g.heldId=null;Object.assign(g.robot,{x:-20,z:-12,heading:0,lift:0});
  const parts=['pin','cup','pin','cup','pin'].map((type,i)=>g.make(type,-20,0,{y:3.24+i*3.24,bundleId:100,bundleIndex:i}));
  g.grab();assert.equal(g.heldObjects.length,5);g.release();assert.ok(parts.every(p=>!p.held));
  const goal=g.goals.find(x=>x.color==='red');parts.forEach((p,i)=>Object.assign(p,{goalId:goal.id,bundleId:null,bundleIndex:0,x:goal.x,z:goal.z,y:goal.height+i*3.24}));goal.stack=parts.map(p=>p.id);
  Object.assign(g.robot,{x:goal.x,z:goal.z-12,heading:0,lift:goal.height-3.24});g.grab();assert.equal(g.heldObjects.length,5);assert.equal(goal.stack.length,0);
  const neutral=g.goals.find(x=>x.color==='neutral');parts.forEach((p,i)=>Object.assign(p,{held:false,goalId:neutral.id,bundleId:null,bundleIndex:0,x:neutral.x,z:neutral.z,y:neutral.height+i*3.24}));neutral.stack=parts.map(p=>p.id);g.heldId=null;
  Object.assign(g.robot,{x:neutral.x,z:neutral.z-12,lift:neutral.height+4*3.24-3.24});g.grab();assert.equal(g.heldObjects.length,1);assert.equal(neutral.stack.length,4);
});
test('opposing loader objects cannot be grabbed at the exact claw position',()=>{
  const g=new Game();g.reset('headtohead');g.start();g.held.held=false;g.heldId=null;
  const i=2,l=LOADER_DEFS[i];g.fillLoader(i);Object.assign(g.robot,{x:l.x-12,z:l.z,heading:Math.PI/2,lift:g.loaders[i].deck});assert.equal(g.pickCandidate(),undefined);
  assert.ok(g.loaders[i].ids.length);for(const id of g.loaders[i].ids)assert.equal(g.canTakeLoad(g.objects.find(o=>o.id===id)),false);
});
test('aggressive motion spills tall loads; gentle holds stay intact',()=>{
  const g=new Game({random:()=>0});g.start();g.robot.lift=40;const base=g.held;base.bundleId=base.id;
  for(let i=1;i<5;i++)g.make(i%2?'cup':'pin',0,0,{held:true,bundleId:base.id,bundleIndex:i});g.syncHeld();
  for(let i=0;i<100;i++)g.asRobotPhysics(g.robot,.02);assert.equal(g.heldObjects.length,5);
  for(let i=0;i<150;i++){g.robot.x+=.8;g.asRobotPhysics(g.robot,.02);}assert.ok(g.heldObjects.length<5);assert.ok(g.objects.some(o=>o.falling));assert.ok(g.history.events.some(e=>e.kind==='spill'));
  const lost=g.objects.filter(o=>o.falling);g.tick(3);assert.ok(lost.every(o=>!o.falling&&o.y===1.65));
});
test('AI setup controls role, personality, parking, speed and reroll',()=>{
  const g=new Game();g.matchConfig={bots:{R2:{role:'defender',tendency:'drifty',parking:'never'},B1:{role:'center',parking:'always'}},speed:.5,reroll:false};g.reset('headtohead');
  assert.equal(g.bots[0].role,'defender');assert.equal(g.bots[0].tendency,'drifty');assert.equal(g.bots[0].willPark,false);assert.equal(g.bots[1].willPark,true);assert.ok(g.bots.every(b=>b.maxSpeed<=7&&b.rerollAt===Infinity));
});
test('autonomous validates steps, triggers discrete actions once and stops at 15 seconds',()=>{
  assert.equal(validateSequence([{action:'bad',duration:1}]),false);assert.equal(validateSequence([{action:'drive',duration:NaN}]),false);
  const g=new Game();g.reset('autonomous');const runner=new AutoRunner([{action:'flip',duration:.5},{action:'drive',duration:1},{action:'left',duration:.5},{action:'wait',duration:15}]);g.start();
  const top=g.held.top;for(let i=0;i<1000&&g.active;i++)g.tick(.02,runner.input(g,.02));assert.notEqual(g.held.top,top);assert.equal(runner.log.length,1);assert.equal(g.finished,true);assert.ok(Math.abs(g.elapsed-15)<1e-8);assert.equal(g.remaining,0);assert.ok(g.summary.robots[0].distance>0);
});
test('floor nesting builds a recoverable stack beyond intake capacity',()=>{
  const g=new Game();g.start();g.objects=[];g.heldId=null;Object.assign(g.robot,{x:-20,z:-12,heading:0,lift:3.24});
  const base=g.make('pin',-20,0,{y:3.24});const cup=g.make('cup',0,0,{held:true});g.heldId=cup.id;g.syncHeld();g.release();assert.equal(g.bundle(base).length,2);
  const pin=g.make('pin',0,0,{held:true});g.heldId=pin.id;g.robot.lift=6.48;g.syncHeld();g.release();assert.equal(g.bundle(base).length,3);
  g.robot.lift=0;g.grab();assert.equal(g.heldObjects.length,3);assert.equal(new Set(g.heldObjects.map(o=>o.id)).size,3);
});
import {predictAutonomous} from '../autonomous.js';
test('automatic preview is repeatable, reflects edits and matches execution',()=>{
  const steps=[{action:'drive',duration:.7},{action:'right',duration:.4},{action:'reverse',duration:.8},{action:'raise',duration:.5}];
  const config={driveSpeed:28,turnSpeed:1.4,liftSpeed:20,acceleration:7};
  const preview=predictAutonomous(steps,config),again=predictAutonomous(steps,config);assert.deepEqual(preview.path,again.path);assert.equal(preview.frames[0].t,0);assert.ok(Math.abs(preview.frames.at(-1).t-15)<1e-8);assert.equal(preview.frames[0].objects.filter(o=>o.held).length,1);
  const g=new Game({random:()=>.5});g.reset('autonomous');g.start();const runner=new AutoRunner(steps);
  while(g.active){const step=runner.steps[runner.index],dt=Math.min(1/60,g.remaining,step?Math.max(1e-8,step.duration-runner.time):Infinity);g.tick(dt,{...config,...runner.input(g,dt)});}
  assert.deepEqual(preview.path.at(-1),{t:g.elapsed,x:g.robot.x,z:g.robot.z});assert.equal(preview.frames.at(-1).robot.lift,g.robot.lift);assert.deepEqual(preview.score,g.score());
  const edited=predictAutonomous([{action:'drive',duration:1.2}],config);assert.notEqual(edited.path.at(-1).x,preview.path.at(-1).x);
});
