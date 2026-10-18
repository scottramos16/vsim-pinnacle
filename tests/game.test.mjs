import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, GOAL_DEFS, LOADER_DEFS, scoreGoal, halfPoints, MAX_LIFT, LOADER_HANDLE_UP, LOADER_HANDLE_DOWN, LOADER_DECK_DOWN, STACK_STEP } from '../game.js';

const rollers={red:'yellow',blue:'yellow',north:'yellow',south:'yellow'};
const pin=(id,top,bottom)=>({id,type:'pin',top,bottom});
const cup=(id,clearUp)=>({id,type:'cup',clearUp});
function score(color,objects,zone='red',r=rollers){return scoreGoal({color,zone,stack:objects.map(o=>o.id)},objects,r);}

test('custom field positions, object counts and one held red/yellow preload',()=>{
  const g=new Game();
  assert.equal(g.goals.length,7);assert.deepEqual(g.goals.map(o=>[o.x,o.z]),GOAL_DEFS.map(o=>[o.x,o.z]));
  assert.equal(g.objects.filter(o=>o.type==='cup').length,16);
  assert.equal(g.objects.filter(o=>o.type==='pin'&&!o.held).length,25);
  assert.equal(g.objects.filter(o=>o.held).length,1);assert.equal(g.held.top,'red');assert.equal(g.held.bottom,'yellow');
  assert.equal(g.score().total,10);assert.equal(g.robot.x,-61);assert.equal(g.mode,'practice');
});
test('halfpin points for matching, mismatching, neutral, center and yellow roller conditions',()=>{
  for(const color of ['red','blue','yellow'])assert.equal(halfPoints(color,{color:'center'},rollers),10);
  assert.equal(halfPoints('red',{color:'red'},rollers),5);assert.equal(halfPoints('red',{color:'blue'},rollers),0);
  assert.equal(halfPoints('blue',{color:'neutral'},rollers),5);
  for(const [goal,zone,required] of [['red','red','red'],['blue','blue','blue'],['neutral','north','red']]){
    assert.equal(halfPoints('yellow',{color:goal,zone},rollers),0);
    assert.equal(halfPoints('yellow',{color:goal,zone},{...rollers,[zone]:required}),5);
  }
});
test('goal conceals lower pin half; opaque cup halves control neighboring visibility',()=>{
  assert.equal(score('red',[pin(1,'red','red')]).total,5);
  assert.deepEqual(score('red',[pin(1,'red','red'),cup(2,true)]),{total:1,cups:1,halves:0});
  assert.deepEqual(score('red',[pin(1,'red','red'),cup(2,false)]),{total:6,cups:1,halves:1});
  assert.deepEqual(score('red',[pin(1,'red','yellow'),cup(2,true),pin(3,'red','red')]),{total:11,cups:1,halves:2});
});
test('manual examples 1 and 2: blue goal six cups, three blue and three yellow visible halves',()=>{
  const objects=[pin(1,'blue','red'),cup(2,false),pin(3,'yellow','red'),cup(4,false),pin(5,'blue','red'),cup(6,false),pin(7,'yellow','red'),cup(8,false),pin(9,'blue','red'),cup(10,false),pin(11,'yellow','red'),cup(12,false)];
  assert.equal(score('blue',objects,'blue').total,21);
  assert.equal(score('blue',objects,'blue',{...rollers,blue:'blue'}).total,36);
});
test('invalid support chains cannot score floating cups or successive pins',()=>{
  assert.equal(score('red',[cup(1,true)]).total,0);
  assert.equal(score('red',[pin(1,'red','yellow'),pin(2,'red','yellow')]).total,5);
});
test('preload can be flipped and nested, followed by a cup; scoring updates after removal',()=>{
  const g=new Game();g.start();const goal=g.goals[0];
  g.robot.x=goal.x;g.robot.z=goal.z-12;g.robot.heading=0;g.robot.lift=goal.height-3.24;g.syncHeld();
  assert.equal(g.placementTarget().valid,true);assert.match(g.release(),/Nested/);assert.equal(g.score().total,15);
  const c=g.make('cup',0,0,{held:true,clearUp:false});g.heldId=c.id;g.robot.lift+=3.24;g.syncHeld();
  assert.match(g.release(),/Nested/);assert.equal(g.score().total,16);
  assert.match(g.grab(),/Picked up/);assert.equal(g.score().total,10);
  assert.equal(g.heldObjects.length,2);assert.equal(goal.stack.length,0);
  g.robot.lift=goal.height-3.24;g.syncHeld();g.release();assert.equal(g.score().total,16);
});
test('placing a pin on a pin or releasing below goal height is rejected without losing held object',()=>{
  const g=new Game();g.start();const goal=g.goals[0];g.robot.x=goal.x;g.robot.z=goal.z-12;g.robot.heading=0;g.robot.lift=0;g.syncHeld();
  assert.match(g.release(),/Raise/);assert.ok(g.held);
  g.robot.lift=goal.height;g.syncHeld();g.release();
  const p=g.make('pin',0,0,{held:true});g.heldId=p.id;g.syncHeld();
  assert.match(g.release(),/needs a cup/);assert.ok(g.held);
});
test('60 seconds active play, pause freezes clock, score and actions freeze at buzzer',()=>{
  const g=new Game();g.reset('timed');g.tick(5,{drive:1});assert.equal(g.remaining,60);
  g.start();g.tick(20);assert.ok(Math.abs(g.remaining-40)<1e-8);g.pause();const paused=g.remaining;g.tick(10);assert.equal(g.remaining,paused);
  g.start();g.tick(41);assert.equal(g.remaining,0);assert.equal(g.finished,true);
  const score=g.score().total;g.rollers.red='red';g.goals[0].stack.push(g.heldId);assert.equal(g.score().total,score);
  const heading=g.robot.heading;g.turn(1);assert.equal(g.robot.heading,heading);assert.match(g.release(),/resume/);
});
test('movement, cascade clamps, walls and goals',()=>{
  const g=new Game();g.start();const x=g.robot.x;g.tick(.1,{drive:1,lift:1});assert.ok(g.robot.x>x);assert.ok(g.robot.lift>2.2);
  g.tick(10,{lift:1});assert.equal(g.robot.lift,MAX_LIFT);g.tick(10,{lift:-1});assert.equal(g.robot.lift,0);
  g.robot.x=61;g.robot.z=-60;g.robot.heading=Math.PI/2;
  for(let i=0;i<100;i++)g.tick(.016,{drive:1});assert.ok(g.robot.x<=61.5);
  const goal=g.goals[0];g.robot.x=goal.x;g.robot.z=goal.z-15;g.robot.heading=0;
  for(let i=0;i<100;i++)g.tick(.016,{drive:1});assert.ok(Math.hypot(g.robot.x-goal.x,g.robot.z-goal.z)>=12.1);
});
test('loader supply is finite, side-specific, and blocked when occupied',()=>{
  const g=new Game();assert.match(g.load(0,'ry'),/resume/);g.start();
  assert.match(g.load(1,'ry'),/Added/);assert.equal(g.supply.red.ry,10);assert.match(g.load(1,'cup'),/occupied/);
  const state=g.loaders[1];g.objects=g.objects.filter(o=>!state.ids.includes(o.id));state.ids=[];
  g.supply.red.ry=0;assert.match(g.load(1,'ry'),/No more/);assert.match(g.load(1,'cup'),/Added/);assert.equal(g.supply.red.cup,19);
});
test('roller interaction requires proximity and updates yellow-half scoring',()=>{
  const g=new Game();g.start();assert.match(g.rotateRoller(),/closer/);
  g.robot.x=-61;g.robot.z=0;assert.match(g.rotateRoller(),/red roller → red/);assert.equal(g.rollers.red,'red');
  g.rotateRoller();assert.equal(g.rollers.red,'blue');g.rotateRoller();assert.equal(g.rollers.red,'yellow');
});

test('rollers require rear bumper contact at all four walls, reject front, side, far and beyond roller ends',()=>{
  const g=new Game();g.start();
  for(const [zone,x,z,h] of [['red',-61,0,Math.PI/2],['blue',61,0,-Math.PI/2],['north',0,-61,0],['south',0,61,Math.PI]]){
    Object.assign(g.robot,{x,z,heading:h});assert.equal(g.nearRoller(),zone);
    g.robot.heading=h+Math.PI;assert.equal(g.nearRoller(),null,'front facing wall');
    g.robot.heading=h+Math.PI/2;assert.equal(g.nearRoller(),null,'side facing wall');
    Object.assign(g.robot,{x:x*.9,z:z*.9,heading:h});assert.equal(g.nearRoller(),null,'bumper too far away');
  }
  Object.assign(g.robot,{x:-61,z:24,heading:Math.PI/2});assert.equal(g.nearRoller(),null);
});

test('proximity fills fixed lower holder and raises ONLY upper handle; load stays still',()=>{
  const g=new Game();g.start();assert.equal(g.loaders[0].config.mode,'pair');assert.equal(g.loaders[1].config.pin,'ry');
  g.tick(2);const state=g.loaders[0];assert.equal(state.ids.length,2);assert.equal(state.deck,LOADER_DECK_DOWN);assert.equal(state.handle,LOADER_HANDLE_UP);
  assert.equal(g.supply.red.ry,10);assert.equal(g.supply.red.cup,19);
  const parts=state.ids.map(id=>g.objects.find(o=>o.id===id));assert.equal(parts[0].type,'cup');assert.equal(parts[1].type,'pin');assert.ok(Math.abs(parts[1].y-parts[0].y-STACK_STEP)<1e-10);
  g.tick(2);assert.equal(g.supply.red.cup,19);assert.equal(state.ids.length,2);
  const height=parts[0].y;Object.assign(g.robot,{x:20,z:20});g.tick(2);assert.equal(state.deck,LOADER_DECK_DOWN);assert.equal(state.handle,LOADER_HANDLE_DOWN);assert.equal(parts[0].y,height);
});

test('auto loading is inactive before start, while paused, after buzzer, and beyond approach radius',()=>{
  const g=new Game();g.tick(1);assert.equal(g.loaders[0].ids.length,0);g.start();g.pause();g.tick(1);assert.equal(g.loaders[0].ids.length,0);
  Object.assign(g.robot,{x:20,z:20});g.start();g.tick(1);assert.ok(g.loaders.every(l=>!l.ids.length));
  g.finish();Object.assign(g.robot,{x:-61,z:-60});g.tick(1);assert.equal(g.loaders[0].ids.length,0);
});

test('all pin/cup recipe orientations are created correctly and two-piece loads use supply atomically',()=>{
  for(const mode of ['pin','cup','pair'])for(const pinFlip of [false,true])for(const clearUp of [false,true])for(const order of ['pin-cup','cup-pin']){
    const g=new Game();g.configureLoader(0,{mode,pin:'by',pinFlip,clearUp,order});g.start();g.tick(1);
    const parts=g.loaders[0].ids.map(id=>g.objects.find(o=>o.id===id));assert.equal(parts.length,mode==='pair'?2:1);
    const p=parts.find(o=>o.type==='pin'),c=parts.find(o=>o.type==='cup');
    if(p){assert.equal(p.top,pinFlip?'yellow':'blue');assert.equal(p.bottom,pinFlip?'blue':'yellow');}
    if(c)assert.equal(c.clearUp,clearUp);
    if(mode==='pair')assert.equal(parts[0].type,order==='pin-cup'?'pin':'cup');
  }
  const g=new Game();g.start();g.supply.red.cup=0;g.tick(1);assert.equal(g.loaders[0].ids.length,0);assert.equal(g.supply.red.ry,11);
  assert.equal(g.configureLoader(0,{pin:'bad'}),false);
});

test('Q grabs an entire loader pair, R reverses its order, E scores or drops it together, then tray refills',()=>{
  const g=new Game();g.configureLoader(0,{order:'pin-cup'});g.start();g.held.held=false;g.held.x=20;g.held.z=20;g.heldId=null;
  Object.assign(g.robot,{x:-61,z:-60,heading:-Math.PI/2,lift:LOADER_DECK_DOWN});g.tick(2);
  assert.match(g.grab(),/Picked up Pin \+ cup/);assert.equal(g.heldObjects.length,2);assert.equal(g.loaders[0].ids.length,0);
  const pair=g.heldObjects;assert.ok(pair.every(o=>o.loaderIndex===null&&o.held));
  g.flip();assert.equal(g.held.type,'cup');assert.equal(g.heldObjects[1].type,'pin');g.flip();assert.equal(g.held.type,'pin');
  Object.assign(g.robot,{x:-48,z:-36,heading:0,lift:3});g.syncHeld();assert.match(g.release(),/Nested/);
  assert.equal(g.goals[0].stack.length,2);assert.equal(g.score().total,16);assert.ok(pair.every(o=>!o.bundleId));
  Object.assign(g.robot,{x:-61,z:-60,heading:-Math.PI/2,lift:LOADER_DECK_DOWN});g.tick(2);assert.equal(g.loaders[0].ids.length,2);assert.equal(g.supply.red.cup,18);
  g.grab();const dropIds=g.heldObjects.map(o=>o.id);Object.assign(g.robot,{x:-20,z:10,heading:0});g.syncHeld();g.release();g.tick(1);
  const dropped=g.objects.filter(o=>dropIds.includes(o.id));assert.equal(dropped.length,2);assert.equal(dropped[1].y-dropped[0].y,STACK_STEP);
});

test('recipes persist across run reset but tray loads and supplies reset',()=>{
  const g=new Game();g.configureLoader(1,{mode:'cup',clearUp:true});g.reset('timed');assert.equal(g.loaders[1].config.mode,'cup');assert.equal(g.loaders[1].config.clearUp,true);assert.equal(g.loaders[1].ids.length,0);assert.equal(g.supply.red.cup,20);
});
test('reset restores preload, timer, rollers, supplies and scoring',()=>{
  const g=new Game();g.start();g.tick(5);g.flip();g.rollers.red='red';g.supply.red.cup=0;g.reset('timed');
  assert.equal(g.held.top,'red');assert.equal(g.remaining,60);assert.equal(g.rollers.red,'yellow');assert.equal(g.supply.red.cup,20);assert.equal(g.score().total,10);assert.equal(g.active,false);
});
