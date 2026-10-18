import {calculateRankingPoints} from './ranking-points.js';
export function createHistory(game){
  return {nextSample:0,events:[],robots:Object.fromEntries(game.allRobots.map(r=>[r.id,{id:r.id,color:r.color,distance:0,last:{x:r.x,z:r.z},path:[{t:0,x:r.x,z:r.z,heading:r.heading,lift:r.lift}],pointsAdded:0,opponentRemoved:0,netSwing:0,pickups:0,placements:0,intakes:0,parking:0}]))};
}
export function sampleHistory(game,force=false){
  if(!game.history)return;
  const sample=force||game.elapsed>=game.history.nextSample;
  for(const robot of game.allRobots){
    const h=game.history.robots[robot.id];if(!h)continue;
    h.distance+=Math.hypot(robot.x-h.last.x,robot.z-h.last.z);h.last={x:robot.x,z:robot.z};
    if(sample)h.path.push({t:game.elapsed,x:robot.x,z:robot.z,heading:robot.heading,lift:robot.lift});
  }
  if(sample)game.history.nextSample=game.elapsed+.25;
}
export function recordAction(game,kind,before,meta={}){
  const h=game.history?.robots[game.robot.id];if(!h)return;
  const after=game.score(),match=game.mode==='headtohead',other=game.robot.color==='red'?'blue':'red';
  const ownDelta=before?(match?after[game.robot.color]-before[game.robot.color]:after.total-before.total):0;
  const otherDelta=before&&match?after[other]-before[other]:0;
  h.pointsAdded+=Math.max(0,ownDelta);h.opponentRemoved+=Math.max(0,-otherDelta);h.netSwing+=ownDelta-otherDelta;
  if(kind==='pickup')h.pickups++;if(kind==='place')h.placements+=meta.count||1;if(kind==='intake')h.intakes++;
  game.history.events.push({t:game.elapsed,robot:game.robot.id,kind,ownDelta,otherDelta,x:game.robot.x,z:game.robot.z,...meta});
}
export function buildSummary(game){
  return {mode:game.mode,duration:game.elapsed,finished:game.finished,score:structuredClone(game.score()),rankingPoints:calculateRankingPoints(game),
    robots:Object.values(game.history?.robots||{}).map(({last,...r})=>structuredClone(r)),events:structuredClone(game.history?.events||[]),
    attribution:'Action-time points added and net score swing; later visibility/roller changes may change final field points. Starting field points are not credited to a robot.'};
}
