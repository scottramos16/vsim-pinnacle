import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.js';
import {calculateRankingPoints,visibleAllianceHalves} from '../ranking-points.js';
function stack(g,goal,color,pins,clearUp=false){for(let i=0;i<pins*2-1;i++){const o=g.make(i%2?'cup':'pin',goal.x,goal.z,{top:color,bottom:'yellow',clearUp,goalId:goal.id,y:goal.height+i*3.24});goal.stack.push(o.id);}}
function finish(g){g.remaining=0;g.finish();return g.summary.rankingPoints;}
test('endgame RP requires one qualifying stack, a matching roller and own-loader parking',()=>{
 const g=new Game();g.reset('headtohead');const goal=g.goals.find(p=>p.color==='red');stack(g,goal,'red',5);g.rollers.north='red';Object.assign(g.robot,{x:-61,z:-60});const r=finish(g).alliances.red;assert.equal(r.endgame,1);assert.equal(r.conditions[0].value,5);assert.equal(r.match,2);assert.equal(r.total,3);assert.equal(r.autonomous,null);
});
test('halfpins across different stacks cannot be combined for the endgame RP',()=>{
 const g=new Game();g.reset('headtohead');const goals=g.goals.filter(p=>p.color==='red');stack(g,goals[0],'red',3);stack(g,goals[1],'red',3);g.rollers.red='red';const r=finish(g).alliances.red;assert.equal(r.endgame,0);assert.equal(r.conditions[0].value,3);
});
test('concealed colored halves do not count and yellow does not substitute for alliance color',()=>{
 const g=new Game();g.reset('headtohead');const goal=g.goals.find(p=>p.color==='red');stack(g,goal,'red',5,true);assert.equal(visibleAllianceHalves(goal,g.objects,'red'),1);const all=g.objects.filter(p=>p.goalId===goal.id&&p.type==='pin');all.forEach(p=>p.top='yellow');assert.equal(visibleAllianceHalves(goal,g.objects,'red'),0);
});
test('no roller or no parking independently prevents an endgame RP',()=>{
 for(const missing of ['roller','park']){const g=new Game();g.reset('headtohead');stack(g,g.goals.find(p=>p.color==='red'),'red',5);if(missing!=='roller')g.rollers.red='red';if(missing==='park')for(const r of g.allRobots)if(r.color==='red'){r.x=-40;r.z=0;}const r=finish(g).alliances.red;assert.equal(r.endgame,0);assert.equal(r.conditions.find(c=>c.id===missing).met,false);}
});
test('match ranking points award two for a win, one each for a tie and none for a loss',()=>{
 const g=new Game();g.reset('headtohead');for(const r of g.allRobots){r.x=r.color==='red'?-35:35;r.z=r.id==='R1'||r.id==='B1'?-10:10;}let result=finish(g);assert.equal(result.alliances.red.match,1);assert.equal(result.alliances.blue.match,1);
 const h=new Game();h.reset('headtohead');stack(h,h.goals.find(g=>g.color==='blue'),'blue',5);h.rollers.blue='blue';result=finish(h);assert.equal(result.alliances.blue.match,2);assert.equal(result.alliances.red.match,0);
});
test('RP is absent from solo modes and summary/export retains a frozen breakdown',()=>{
 const solo=new Game();solo.finish();assert.equal(solo.summary.rankingPoints,null);assert.equal(calculateRankingPoints(solo),null);
 const g=new Game();g.reset('headtohead');const ranking=finish(g),frozen=JSON.stringify(ranking);g.rollers.red='red';g.objects=[];assert.equal(JSON.stringify(g.summary.rankingPoints),frozen);
});
