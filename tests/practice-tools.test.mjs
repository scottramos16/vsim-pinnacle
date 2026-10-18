import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.js';
import {AutoRunner,predictAutonomous,validateSequence,reliabilityTest} from '../autonomous.js';
import {EditHistory,captureWorld,restoreWorld,editField,explainGoal,ghostPose,challengeProgress} from '../practice-tools.js';
import {PadInput,defaultPad,padAxis,readPad} from '../controller.js';
test('distance and angle commands reach their targets with simultaneous lift',()=>{
 const g=new Game({random:()=>.5});g.reset('autonomous');g.start();const start={...g.robot},steps=[{action:'driveDistance',value:24,duration:15,parallel:['raise']},{action:'turnAngle',value:-90,duration:15}],r=new AutoRunner(steps);
 for(let i=0;i<900&&g.active;i++)g.tick(1/60,r.input(g,1/60));assert.equal(r.index,2);assert.ok(Math.abs(g.robot.x-start.x-24)<.4);assert.ok(Math.abs(g.robot.heading-start.heading+Math.PI/2)<.01);assert.ok(g.robot.lift>10);assert.equal(r.log.filter(e=>e.message==='Target reached').length,2);
});
test('signed distance runs backward and validates target ranges and parallel actions',()=>{
 assert.equal(validateSequence([{action:'driveDistance',value:200,duration:15}]),false);assert.equal(validateSequence([{action:'turnAngle',value:90,duration:15,parallel:['raise','lower']}]),false);
 const p=predictAutonomous([{action:'driveDistance',value:-12,duration:15}],{},[],{start:{x:-20,z:-60,heading:Math.PI/2}});assert.ok(Math.abs(p.path.at(-1).x+32)<.4);
});
test('prediction uses custom start and field setup without mutating either',()=>{
 const g=new Game();editField(g,{kind:'add',type:'cup',count:3,x:-20,z:0});const setup=captureWorld(g),saved=JSON.stringify(setup),start={x:-35,z:-55,heading:0};
 const p=predictAutonomous([{action:'wait',duration:.5}],{},[],{start,setup,applySetup:(model,s)=>restoreWorld(model,s,{setup:true})});assert.equal(p.frames[0].robot.x,-35);assert.equal(p.frames[0].objects.length,g.objects.length);assert.equal(JSON.stringify(setup),saved);
});
test('undo redo is independent, branches correctly and deduplicates edits',()=>{
 const history=new EditHistory({n:1});history.commit({n:2});history.commit({n:2});assert.deepEqual(history.undo(),{n:1});const v=history.redo();v.n=99;assert.deepEqual(history.undo(),{n:1});history.commit({n:3});assert.equal(history.redo(),null);
});
test('field editor moves whole stacks, saves/restores and rejects invalid moves atomically',()=>{
 const g=new Game();const id=editField(g,{kind:'add',type:'pin',count:5,x:-20,z:0});assert.equal(g.bundle(g.objects.find(o=>o.id===id)).length,5);const before=captureWorld(g);editField(g,{kind:'move',id,x:-12,z:12});assert.ok(g.bundle(g.objects.find(o=>o.id===id)).every(o=>o.x===-12));restoreWorld(g,before);assert.equal(g.objects.find(o=>o.id===id).x,-20);
 const scored=g.objects.find(o=>o.goalId==='center');const old=JSON.stringify(g.goals);assert.throws(()=>editField(g,{kind:'move',id:scored.id,x:0,z:0}));assert.equal(JSON.stringify(g.goals),old);
 editField(g,{kind:'delete',id,x:-20,z:0});assert.equal(g.objects.some(o=>o.id===id),false);
});
test('custom setups preserve fresh AI preloads when crossing modes',()=>{
 const solo=new Game(),setup=captureWorld(solo),g=new Game();g.reset('headtohead');restoreWorld(g,setup,{setup:true});assert.equal(g.bots.length,3);assert.ok(g.bots.every(b=>g.objects.find(o=>o.id===b.heldId)?.held));assert.equal(new Set(g.objects.map(o=>o.id)).size,g.objects.length);
});
test('scoring explanation distinguishes concealed and visible pin halves',()=>{
 const g=new Game(),goal=g.goals.find(g=>g.color==='red'),pin=g.make('pin',goal.x,goal.z,{top:'red',bottom:'yellow',goalId:goal.id});goal.stack.push(pin.id);const explanation=explainGoal(g,goal);assert.equal(explanation.halves.find(h=>h.end==='bottom').reason,'Concealed by goal');assert.equal(explanation.halves.find(h=>h.end==='top').points,5);assert.equal(explanation.score.total,5);
});
test('center yellow bonus is zero when the alliance count is tied',()=>{const g=new Game();g.reset('headtohead');const e=explainGoal(g,g.goals.find(g=>g.id==='center'));assert.equal(e.halves.find(h=>h.visible).points,0);});
test('ghost interpolates paths and replay restores object and robot state',()=>{
 const pose=ghostPose([{t:0,x:0,z:0},{t:2,x:10,z:0}],1);assert.equal(pose.x,5);assert.equal(pose.heading,Math.PI/2);const g=new Game(),frame=captureWorld(g);g.robot.x=0;g.objects=[];restoreWorld(g,frame);assert.equal(g.robot.x,-61);assert.ok(g.objects.length>20);
});
test('challenges track four unique corners and require a red goal stack',()=>{
 const g=new Game(),state={visited:[]};for(const [x,z] of [[-55,-55],[-55,55],[55,-55],[55,55]]){Object.assign(g.robot,{x,z});challengeProgress(g,'route',state);}assert.equal(challengeProgress(g,'route',state).done,true);assert.equal(challengeProgress(g,'stack').done,false);
});
test('controller dead zone, analog input, edge-triggered buttons, disconnect and persistence',()=>{
 assert.equal(padAxis(.1,.15),0);assert.equal(padAxis(1,.15),1);const reader=new PadInput(),config=defaultPad(),pad={id:'test controller',connected:true,axes:[.5,-1],buttons:Array.from({length:16},()=>({pressed:false}))};pad.buttons[0].pressed=true;const first=reader.sample([pad],config);assert.equal(first.input.drive,1);assert.ok(first.input.turn<0);assert.deepEqual(first.actions,['toggle']);assert.deepEqual(reader.sample([pad],config).actions,[]);assert.equal(reader.sample([],config).connected,false);assert.deepEqual(readPad(JSON.parse(JSON.stringify(config))),config);assert.equal(readPad({deadZone:99}).deadZone,.15);
});
test('reliability reports score distribution and refuses unfinished plans as success',async()=>{
 const r=await reliabilityTest([{action:'wait',duration:.2}],{},[],{targetScore:10},3);assert.equal(r.count,3);assert.equal(r.average,10);assert.equal(r.success,1);
 const blocked=await reliabilityTest([{action:'driveDistance',value:144,duration:.1}],{},[],{targetScore:0},2);assert.equal(blocked.success,0);
});
test('field stacks can be nested on goals and wall-side pieces can be deleted',()=>{
 const g=new Game(),goal=g.goals.find(x=>x.color==='red'),id=editField(g,{kind:'add',type:'pin',count:3,x:-20,z:0});editField(g,{kind:'move',id,x:goal.x,z:goal.z});assert.equal(goal.stack.length,3);assert.equal(g.objects.find(o=>o.id===id).goalId,goal.id);
 const wall=g.objects.find(o=>!o.held&&!o.goalId&&Math.abs(o.x)>68);editField(g,{kind:'delete',id:wall.id,x:wall.x,z:wall.z});assert.equal(g.objects.some(o=>o.id===wall.id),false);
});
test('lift conflicts across primary and parallel actions are rejected',()=>{
 assert.equal(validateSequence([{action:'raise',duration:1,parallel:['lower']}]),false);assert.equal(validateSequence([{action:'drive',duration:1,parallel:['lower','intake']}]),true);
});
test('teammate strategy overrides persist and park commands act before endgame',()=>{
 const g=new Game({random:()=>.5});g.reset('headtohead');const bot=g.bots[0];bot.command='center';bot.willPark=false;g.start();g.tick(2);assert.equal(bot.role,'center');bot.command='park';g.tick(.2);assert.equal(bot.parking,true);assert.ok(g.remaining>100);
});
import {PadRebinder,rebindPad,xboxButtonName} from '../controller.js';
test('Xbox mappings show familiar button names',()=>{assert.equal(xboxButtonName(0),'A');assert.equal(xboxButtonName(5),'RB');assert.equal(xboxButtonName(7),'RT');assert.equal(xboxButtonName(9),'Menu');assert.equal(xboxButtonName(20),'Extra button 20');});
test('controller rebinding ignores held buttons until released and pressed again',()=>{const r=new PadRebinder(),p={id:'Xbox Elite',connected:true,buttons:Array.from({length:18},()=>({pressed:false}))};p.buttons[0].pressed=true;r.arm('flip',p);assert.equal(r.poll(p),null);p.buttons[0].pressed=false;r.poll(p);p.buttons[0].pressed=true;assert.deepEqual(r.poll(p),{action:'flip',index:0});assert.equal(r.action,null);});
test('rebinding an occupied controller button swaps assignments and preserves settings',()=>{const c=defaultPad();const result=rebindPad(c,'flip',0);assert.deepEqual(result.swapped,['toggle']);assert.equal(c.buttons.flip,0);assert.equal(c.buttons.toggle,2);assert.equal(new Set(Object.values(c.buttons)).size,Object.keys(c.buttons).length);assert.deepEqual(readPad(JSON.parse(JSON.stringify(c))),c);});
test('cancelled bindings and disconnected controllers cannot assign a button',()=>{const r=new PadRebinder();r.arm('intake',null);assert.equal(r.poll(null),null);r.cancel();assert.equal(r.poll({id:'Xbox Elite',connected:true,buttons:[{pressed:true}]}),null);});
