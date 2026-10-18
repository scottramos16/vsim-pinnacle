import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.js';
import {defaultProgram,parseStrategy,strategyText,validateProgram,applyProgram} from '../ai-profiles.js';
import {defaultBatch,simulateStrategy,validateBatch,summarizeTrials,wilson,seededRandom,recommendationCandidates,rankRecommendations} from '../strategy-simulation.js';
test('typed strategy grammar round trips and refuses ambiguous instructions, gaps and overlaps',()=>{
 const p=defaultProgram();assert.deepEqual(parseStrategy(strategyText(p)),p);assert.equal(parseStrategy('0-60: defend;60-120: park').phases[0].action,'defender');for(const t of ['score a lot','0-30: center\n40-120: park','0-80: center\n50-120: park','0-60: alliance','0-120: teleport'])assert.throws(()=>parseStrategy(t));
});
test('program validation covers phase ordering and behavior limits',()=>{const p=defaultProgram();assert.equal(validateProgram(p),null);assert.ok(validateProgram({...p,descore:2}));assert.ok(validateProgram({...p,parkAt:50}));assert.ok(validateProgram({...p,phases:[]}));});
test('difficulty controls individual opponents and preserves standard defaults',()=>{
 const a=new Game({random:seededRandom(42)}),b=new Game({random:seededRandom(42)});a.matchConfig={bots:{B1:{difficulty:'easy'},B2:{difficulty:'expert'}}};b.matchConfig={bots:{}};a.reset('headtohead');b.reset('headtohead');assert.equal(a.bots[0].maxSpeed,b.bots[0].maxSpeed);assert.ok(a.bots[1].maxSpeed<b.bots[1].maxSpeed);assert.ok(a.bots[2].maxSpeed>b.bots[2].maxSpeed);assert.ok(a.bots[1].thinkDelay>b.bots[1].thinkDelay);assert.ok(a.bots[2].turnRate>b.bots[2].turnRate);assert.equal(a.automatedPlayer,false);
});
test('four-robot strategy simulation runs repeatably and includes a moving, scoring R1',()=>{
 const c=defaultBatch();c.trials=2;const a=simulateStrategy(c,0),b=simulateStrategy(c,0);assert.deepEqual(a,b);assert.equal(a.paths.length,4);assert.equal(new Set(a.paths.map(p=>p.id)).size,4);const path=a.paths.find(p=>p.id==='R1').path;assert.ok(path.some(p=>Math.hypot(p.x-path[0].x,p.z-path[0].z)>10));assert.ok(a.events>0);assert.ok(a.red>=0&&a.blue>=0);
});
test('different trial seeds vary behavior and settings do not mutate during simulation',()=>{const c=defaultBatch(),before=JSON.stringify(c),a=simulateStrategy(c,0),b=simulateStrategy(c,1);assert.notEqual(a.seed,b.seed);assert.notDeepEqual(a.paths,b.paths);assert.equal(JSON.stringify(c),before);});
test('automated player keeps one preload and synchronizes held state after release and spills',()=>{
 const g=new Game({random:()=>0});g.matchConfig={automatedPlayer:true,bots:{}};g.reset('headtohead');assert.equal(g.allRobots.length,4);assert.equal(g.objects.filter(o=>o.held).length,4);g.start();g.asRobot(g.player,()=>{g.release();});assert.equal(g.heldId,null);assert.equal(g.player.heldId,null);
 const pin=g.make('pin',0,0,{held:true});g.heldId=g.player.heldId=pin.id;g.player.lift=40;g.player.stackStress=2;g.player.motion={x:g.player.x-1,z:g.player.z,vx:50,vz:0,heading:g.player.heading};g.updateStackPhysics(.02);assert.equal(g.heldId,null);assert.equal(g.player.heldId,null);
});
test('program phase transitions clear the previous job and apply the requested scoring focus',()=>{const g=new Game();g.reset('headtohead');const b=g.bots[0];b.program=defaultProgram();b.job={kind:'wander'};applyProgram(g,b);assert.equal(b.role,'center');assert.equal(b.job,null);g.elapsed=50;applyProgram(g,b);assert.equal(b.strategyTarget,'alliance');g.elapsed=110;applyProgram(g,b);assert.equal(b.strategyTarget,'park');});
test('batch validation rejects invalid robot skill, excessive work and unknown success criteria',()=>{const c=defaultBatch();assert.equal(validateBatch(c),null);assert.ok(validateBatch({...c,trials:1000}));assert.ok(validateBatch({...c,objective:'unknown'}));assert.ok(validateBatch({...c,ownDifficulty:'superhuman'}));});
test('reported percentages separate wins from ties, include uncertainty and handle partial batches',()=>{const s=summarizeTrials([{win:true,tie:false,success:true,red:100,blue:80,endgame:1,rankingPoints:3},{win:false,tie:true,success:false,red:50,blue:50,endgame:0,rankingPoints:1}]);assert.equal(s.successRate,.5);assert.equal(s.winRate,.5);assert.equal(s.ties,1);assert.equal(s.averageRed,75);assert.ok(s.interval[0]<.5&&s.interval[1]>.5);assert.deepEqual(wilson(0,0),[0,1]);assert.deepEqual(summarizeTrials([]),{completed:0});});

test('strategy route records ordered actions, goal positions and score progression through the finish',()=>{
 const r=simulateStrategy(defaultBatch());assert.ok(r.timeline.length>0);assert.ok(r.timeline.every((e,i,a)=>e.t>=0&&e.t<=120.001&&(!i||e.t>=a[i-1].t)));assert.ok(r.timeline.some(e=>e.kind==='place'&&r.goals.some(g=>g.id===e.goalId&&g.x===e.x&&g.z===e.z)));assert.equal(r.scoreTimeline[0].t,0);assert.ok(Math.abs(r.scoreTimeline.at(-1).t-120)<.001);assert.equal(r.scoreTimeline.at(-1).red,r.red);assert.equal(r.scoreTimeline.at(-1).blue,r.blue);for(const robot of r.paths)assert.ok(robot.path.every(p=>Number.isFinite(p.heading)));
});

test('strategy-only intake option changes collection and leaves ordinary robots untouched',()=>{
 const c=defaultBatch(),withIntake=simulateStrategy(c),without=simulateStrategy({...c,intakeEnabled:false});assert.ok(withIntake.timeline.some(e=>e.robot==='R1'&&e.kind==='intake'));assert.ok(!without.timeline.some(e=>e.robot==='R1'&&e.kind==='intake'));assert.ok(without.timeline.some(e=>e.robot==='R1'&&e.kind==='pickup'));assert.equal(new Game().player.strategyIntake,undefined);assert.ok(validateBatch({...c,intakeEnabled:'no'}));
});
test('recommendations preserve behavior settings and rank by selected success before score margin',()=>{
 const c=defaultBatch(),before=JSON.stringify(c),candidates=recommendationCandidates(c);assert.equal(candidates.length,5);for(const r of candidates){assert.equal(validateProgram(r.program),null);assert.equal(r.program.wander,c.program.wander);}assert.equal(JSON.stringify(c),before);const rows=[{name:'score',summary:{successRate:.1,averageRed:500,averageBlue:0,averageRanking:3}},{name:'success',summary:{successRate:.9,averageRed:50,averageBlue:40,averageRanking:2}}];assert.equal(rankRecommendations(rows)[0].name,'success');
});
