import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.js';
import {defaultSettings,readSettings,DECOR_COLORS} from '../controls.js';
test('rear intake accepts pin then cup and cup then pin, keeps two-object capacity and order',()=>{
  for(const first of ['pin','cup']){
    const g=new Game();g.start();g.objects=[];g.heldId=null;Object.assign(g.robot,{x:-20,z:0,heading:0,lift:0});
    const a=g.make(first,-20,-14);g.tick(2.4,{intake:true});assert.equal(g.held.id,a.id);
    const b=g.make(first==='pin'?'cup':'pin',-20,-14);g.tick(2.4,{intake:true});assert.deepEqual(g.heldObjects.map(o=>o.id),[a.id,b.id]);assert.equal(g.history.robots.R1.intakes,2);
    const extra=g.make('pin',-20,-14);g.tick(3,{intake:true});assert.equal(extra.held,false);assert.equal(g.heldObjects.length,2);
    g.flip();assert.deepEqual(g.heldObjects.map(o=>o.id),[b.id,a.id]);
  }
});
test('contact briefly nudges AI and then resists continuous bulldozing',()=>{
  const g=new Game();g.reset('headtohead');g.bots=[g.bots[0]];const b=g.bots[0];
  Object.assign(g.robot,{x:-30,z:-15,heading:Math.PI/2});Object.assign(b,{x:-12,z:-15});const start=b.x;
  for(let i=0;i<10;i++)g.movePlayerContact(g.robot.x+.15,g.robot.z,.05);
  assert.ok(b.x>start,'AI yields a little on contact');const stopped=b.x;
  for(let i=0;i<400;i++)g.movePlayerContact(b.x-17.95,b.z,.05);
  assert.ok(b.x-stopped<1,'sustained contact cannot slide AI across field');
  assert.ok(b.x-start<4);
});
test('holding forward cannot bypass contact resistance through separate X/Z movement checks',()=>{
  const g=new Game();g.reset('headtohead');g.bots=[g.bots[0]];const b=g.bots[0];
  Object.assign(g.robot,{x:-30,z:-15,heading:Math.PI/2});Object.assign(b,{x:-12,z:-15,willPark:false,rerollAt:999,decision:1e9,job:null,maxSpeed:0});
  const start=b.x;g.start();g.tick(10,{drive:1});assert.ok(b.x>start);assert.ok(b.x-start<4);
});
test('match summary records movement, action-time points, placements and frozen paths',()=>{
  const g=new Game();g.start();g.tick(.5,{drive:1});assert.ok(g.history.robots.R1.distance>0);
  Object.assign(g.robot,{x:-48,z:-38,heading:0,lift:3});g.syncHeld();g.release();
  assert.equal(g.history.robots.R1.pointsAdded,5);assert.equal(g.history.robots.R1.placements,1);assert.equal(g.history.events.at(-1).kind,'place');
  g.finish();assert.ok(g.summary.robots[0].path.length>1);assert.equal(g.summary.robots[0].pointsAdded,5);assert.equal(g.summary.score.total,15);
  const s=JSON.stringify(g.summary);g.tick(3);assert.equal(JSON.stringify(g.summary),s);
});
test('advanced settings and appearance persist with validation, leaving license colors separate',()=>{
  const s={...defaultSettings(),driveSpeed:45,liftSpeed:30,acceleration:6,turnSpeed:2.3,cameraDistance:90,robotType:'dr4b',decorColor:'purple',topper:'duck'};
  assert.deepEqual(readSettings({getItem:()=>JSON.stringify(s)}),s);assert.ok(!Object.hasOwn(DECOR_COLORS,'red')&&!Object.hasOwn(DECOR_COLORS,'blue'));
  const invalid=readSettings({getItem:()=>JSON.stringify({...s,driveSpeed:999,robotType:'bad',decorColor:'red'})});assert.equal(invalid.driveSpeed,38);assert.equal(invalid.robotType,'cascade');assert.equal(invalid.decorColor,'lime');
});
test('precision mode and speed/lift controls affect driving, and keyboard turning works',()=>{
  const a=new Game(),b=new Game();a.start();b.start();a.tick(.5,{drive:1,driveSpeed:40});b.tick(.5,{drive:1,driveSpeed:40,precision:true});assert.ok(a.robot.x-b.robot.x>5);
  const h=b.robot.heading;b.tick(.2,{turn:1,turnSpeed:2,lift:1,liftSpeed:30});assert.ok(b.robot.heading>h);assert.ok(b.robot.lift>7);
  b.tick(3,{lift:1,maxLift:30});assert.equal(b.robot.lift,30);
});
