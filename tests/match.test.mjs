import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,scoreAllianceGoal,STACK_STEP} from '../game.js';
const seeded=seed=>()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);
const p=(id,top,bottom)=>({id,type:'pin',top,bottom});
const c=(id,clearUp)=>({id,type:'cup',clearUp});
function score(color,objects,roller='yellow'){
  return scoreAllianceGoal({color,zone:'test',stack:objects.map(o=>o.id)},objects,{test:roller});
}
test('reference field pin directions, cup orientation and four nested side stations',()=>{
  const g=new Game();
  for(const x of [-48,48])for(const z of [-48,48]){
    const upper=g.objects.find(o=>o.type==='pin'&&o.x===x&&o.z===z-3.3);
    assert.ok(upper);near(Math.cos(upper.yaw),-Math.SQRT1_2);assert.equal(upper.top,x*z>0?'red':'blue');
    const lower=g.objects.find(o=>o.type==='pin'&&o.x===x&&o.z===z+3.3);assert.equal(lower.top,'yellow');
  }
  for(const x of [-69.5,69.5])for(const z of [-36,36]){
    const root=g.objects.find(o=>o.type==='cup'&&o.x===x&&o.z===z);
    assert.ok(root);const parts=g.bundle(root);assert.equal(parts.length,2);assert.equal(parts[1].type,'pin');
    near(parts[1].y-root.y,STACK_STEP);assert.equal(parts[1].top,x<0?'blue':'red');
    assert.equal(g.objects.filter(o=>o.x===x&&Math.abs(o.z-z)<=3.5&&o.type==='cup').length,3);
  }
  assert.equal(g.objects.find(o=>o.type==='cup'&&o.x===0&&o.z===24).clearUp,false);
});
test('rear intake requires hold and empty claw, conveys along robot-local path, pauses and feeds once',()=>{
  const g=new Game();g.start();Object.assign(g.robot,{x:-20,z:5,heading:0,lift:10});
  const pin=g.make('pin',-20,-9,{top:'blue',bottom:'yellow',lying:true,y:1.65});
  g.tick(.1,{intake:true});assert.equal(g.intake.objectId,null,'occupied claw blocks acquisition');
  g.held.held=false;g.held.x=50;g.held.z=50;g.heldId=null;
  g.tick(.3,{intake:true});assert.equal(g.intake.objectId,pin.id);assert.equal(pin.inIntake,true);assert.ok(pin.z>-9&&pin.z<5);
  const progress=g.intake.progress;g.tick(.4);near(g.intake.progress,progress);assert.equal(g.held,null);
  Object.assign(g.robot,{x:-15,z:10,heading:Math.PI/2});g.tick(.3,{intake:true});assert.ok(pin.x<g.robot.x,'pin follows rotated robot');
  assert.match(g.grab(),/Intake is feeding/);
  g.tick(2,{intake:true});assert.equal(g.held,null);near(g.intake.progress,.85);g.robot.lift=0;g.tick(.5,{intake:true});assert.equal(g.held.id,pin.id);assert.equal(g.intake.objectId,null);assert.equal(pin.inIntake,false);near(pin.x,g.claw.x);near(pin.y,g.claw.y);
  assert.equal(g.objects.filter(o=>o.id===pin.id).length,1);
});
test('intake excludes nested loads, scored objects and objects outside rear mouth',()=>{
  const g=new Game();g.start();g.held.held=false;g.heldId=null;Object.assign(g.robot,{x:-20,z:0,heading:0});
  g.objects=g.objects.filter(o=>o.goalId);g.make('cup',-20,-14,{bundleId:998});g.make('pin',-20,-14,{bundleId:999});g.make('pin',-20,14);
  g.tick(1,{intake:true});assert.equal(g.intake.objectId,null);
});
test('alliance scoring: matching goals, neutral roller ownership, center majority and ties',()=>{
  assert.deepEqual(score('red',[p(1,'red','yellow')]),{red:5,blue:0});
  assert.deepEqual(score('blue',[p(1,'red','yellow')]),{red:0,blue:0});
  const objects=[p(1,'red','yellow'),c(2,false),p(3,'yellow','blue')];
  assert.deepEqual(score('neutral',objects),{red:7,blue:0});
  assert.deepEqual(score('neutral',objects,'blue'),{red:7,blue:8});
  assert.deepEqual(score('center',objects),{red:21,blue:0});
  assert.deepEqual(score('center',[p(1,'red','yellow'),c(2,false),p(3,'blue','yellow')]),{red:10,blue:10});
  assert.deepEqual(score('center',[p(1,'yellow','yellow')]),{red:0,blue:0});
});
test('2v2 has one teammate and two opponents, four preloads, slow varied AI and one role reroll each',()=>{
  const g=new Game({random:seeded(47)});g.reset('headtohead');assert.equal(g.remaining,120);
  assert.deepEqual(g.bots.map(b=>b.color),['red','blue','blue']);assert.equal(g.objects.filter(o=>o.held).length,4);
  assert.ok(g.bots.every(b=>b.maxSpeed<=14&&b.maxSpeed>=9&&b.tendencies.descoring>0));
  const tendencies=g.bots.map(b=>JSON.stringify(b.tendencies));
  g.start();g.tick(120);assert.equal(g.finished,true);assert.equal(g.remaining,0);
  g.bots.forEach((b,i)=>{assert.equal(b.roleHistory.length,2);assert.notEqual(b.roleHistory[0].role,b.roleHistory[1].role);assert.equal(JSON.stringify(b.tendencies),tendencies[i]);assert.ok(Math.abs(b.x)<=61.5&&Math.abs(b.z)<=61.5);});
  const snapshot=JSON.stringify(g.bots);const score=g.score();g.tick(30);assert.equal(JSON.stringify(g.bots),snapshot);assert.deepEqual(g.score(),score);
});
test('AI uses physical scoring interactions over full matches without duplicating objects',()=>{
  let scored=0;
  for(const seed of [1,2,3]){
    const g=new Game({random:seeded(seed)});g.reset('headtohead');g.start();g.tick(120);
    scored+=g.bots.reduce((n,b)=>n+b.stats.scored,0);
    assert.equal(new Set(g.objects.map(o=>o.id)).size,g.objects.length);
    for(const goal of g.goals)goal.stack.forEach((id,i)=>{const o=g.objects.find(o=>o.id===id);assert.equal(o.type,i%2===0?'pin':'cup');assert.equal(o.goalId,goal.id);assert.equal(o.held,false);});
    const ids=[g.heldId,...g.bots.map(b=>b.heldId)].filter(Boolean);assert.equal(new Set(ids).size,ids.length);
    assert.ok(g.score().red>=0&&g.score().blue>=0);
  }
  assert.ok(scored>5,'AI actually picks and scores pieces, rather than only wandering');
});
test('center specialist removes an opposing top object before protection begins',()=>{
  const g=new Game({random:()=>.5});g.reset('headtohead');const bot=g.bots[1];g.bots=[bot];
  g.objects.find(o=>o.id===bot.heldId).held=false;bot.heldId=null;
  Object.assign(bot,{role:'center',rerollAt:999,x:0,z:-14,heading:0,lift:12.01,job:null,decision:0});bot.tendencies.wander=0;bot.tendencies.descoring=1;
  const center=g.goals.at(-1),cup=g.make('cup',0,0,{goalId:center.id,y:12.01,clearUp:false}),enemy=g.make('pin',0,0,{top:'red',bottom:'yellow',goalId:center.id,y:15.25});
  center.stack.push(cup.id,enemy.id);g.start();g.tick(2);
  assert.ok(bot.stats.removed>=1);assert.ok(!center.stack.includes(enemy.id));
});
test('head-to-head protects opposing alliance goals and locks neutral descoring in final 30 seconds',()=>{
  const g=new Game();g.reset('headtohead');g.start();g.bots=[];
  const blue=g.goals.find(x=>x.color==='blue');Object.assign(g.robot,{x:blue.x,z:blue.z-14,heading:0,lift:3});g.syncHeld();assert.match(g.release(),/protected/);
  const center=g.goals.at(-1);Object.assign(g.robot,{x:0,z:-14,heading:0,lift:6});
  g.held.held=false;g.held.x=40;g.held.z=40;g.heldId=null;g.remaining=30;assert.equal(g.canTouchGoal(center,true),false);assert.equal(g.canTouchGoal(center,false),true);assert.match(g.grab(),/No object/);
});
test('pause freezes intake, AI positions and role clocks; solo modes have no AI',()=>{
  const g=new Game({random:seeded(17)});g.reset('headtohead');g.start();g.tick(5);g.pause();const state=JSON.stringify(g.bots),remaining=g.remaining;g.tick(60,{intake:true});assert.equal(JSON.stringify(g.bots),state);assert.equal(g.remaining,remaining);
  g.reset('practice');assert.equal(g.bots.length,0);assert.equal(g.intake.objectId,null);
});
