import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game.js';
const seeded=seed=>()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};
test('parking intention compensates for traffic failures, with randomized 7–15 second departure',()=>{
  let eligible=0,total=0;for(let seed=1;seed<=500;seed++){
    const g=new Game({random:seeded(seed)});g.reset('headtohead');
    for(const b of g.bots){eligible+=Number(b.willPark);total++;assert.ok(b.parkAt>=7&&b.parkAt<=15);}
  }
  assert.ok(eligible/total>.76&&eligible/total<.84);
});
test('endgame overrides role, parks at own loader, stays there, and earns parking points',()=>{
  const g=new Game({random:seeded(11)});g.reset('headtohead');const bot=g.bots[0];g.bots=[bot];
  Object.assign(bot,{x:-50,z:47,willPark:true,parkAt:10,job:{kind:'wander',destination:{x:20,z:20}},path:[]});
  g.start();g.remaining=11;g.tick(.1);assert.equal(bot.parking,false);
  g.remaining=10;g.tick(5);assert.equal(bot.parking,true);assert.equal(bot.parked,true);assert.equal(bot.status,'Parked');assert.equal(bot.job.destination.x,-61);
  const position=[bot.x,bot.z];g.tick(5);assert.deepEqual([bot.x,bot.z],position);assert.equal(g.finished,true);assert.equal(g.score().parking.red,42);
});
test('blue teammates choose different loaders; opting out retains ordinary role behavior',()=>{
  const g=new Game({random:seeded(19)});g.reset('headtohead');g.bots=g.bots.filter(b=>b.color==='blue');
  g.bots.forEach((b,i)=>Object.assign(b,{x:45,z:i?35:-35,willPark:true,parkAt:11,job:null}));
  g.start();g.remaining=10;g.tick(.05);
  assert.ok(g.bots.every(b=>b.job.kind==='park'));assert.notEqual(g.bots[0].job.destination.index,g.bots[1].job.destination.index);
  g.tick(9.95);assert.equal(g.score().parking.blue,42);
  const other=new Game({random:seeded(20)});other.reset('headtohead');other.bots.forEach(b=>b.willPark=false);other.start();other.remaining=8;other.tick(1);assert.ok(other.bots.every(b=>!b.parking));
});
