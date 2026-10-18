import {applyDifficulty,applyProgram} from './ai-profiles.js';
export const AI_ROLES=['defender','center','field'];
export const ROLE_NAMES={defender:'Defender',center:'Center specialist',field:'Alliance / neutral scorer'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const angleDifference=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
const randomPoint=(game)=>({x:game.random()*112-56,z:game.random()*112-56});

export function createBots(game){
  return [ ['R2','red',-61,60,Math.PI/2], ['B1','blue',61,-60,-Math.PI/2], ['B2','blue',61,60,-Math.PI/2], ...(game.matchConfig?.automatedPlayer?[[ 'R1','red',-61,-60,Math.PI/2]]:[]) ].map(([id,color,x,z,heading])=>{
    const role=AI_ROLES[Math.floor(game.random()*3)];
    const tendency=['cautious','drifty','persistent'][Math.floor(game.random()*3)];
    const bot={id,color,x,z,heading,lift:2.2,speed:0,role,tendency,roleHistory:[{time:0,role}],rerollAt:50+game.random()*20,rerolled:false,
      tendencies:{wander:tendency==='drifty'?.3:tendency==='cautious'?.16:.06,descoring:.35+game.random()*.5,neutral:.2+game.random()*.6},
      maxSpeed:9+game.random()*5,thinkDelay:.5+game.random()*.6,decision:0,job:null,path:[],stall:0,defenseCooldown:0,engaged:0,status:'Ready',stats:{scored:0,removed:0,picked:0},discardHeld:false};
    // Some returns fail in traffic. 80% attempting yields roughly 75% actual
    // parking in baseline simulated matches, rather than counting intent alone.
    bot.willPark=game.random()<.8;bot.parkAt=7+game.random()*8;bot.parking=false;bot.parked=false;bot.parkDetour=false;
    const selected=game.matchConfig?.bots?.[id];
    if(selected){
      if(AI_ROLES.includes(selected.role)){bot.role=selected.role;bot.roleHistory=[{time:0,role:bot.role}];}
      if(['cautious','drifty','persistent'].includes(selected.tendency)){bot.tendency=selected.tendency;bot.tendencies.wander=selected.tendency==='drifty'?.3:selected.tendency==='cautious'?.16:.06;}
      if(selected.parking==='always')bot.willPark=true;if(selected.parking==='never')bot.willPark=false;
    }
    bot.maxSpeed*=Math.max(.5,Math.min(1.5,game.matchConfig?.speed||1));
    applyDifficulty(bot,selected?.difficulty||'standard');
    if(selected?.program){bot.program=structuredClone(selected.program);bot.parkAt=bot.program.parkAt;bot.willPark=game.random()<bot.program.parkingChance;}
    if(game.matchConfig?.reroll===false)bot.rerollAt=Infinity;
    const preload=id==='R1'?game.held:game.make('pin',x,z,{top:color,bottom:'yellow',held:true});bot.heldId=preload.id;
    game.asRobot(bot,()=>game.syncHeld());return bot;
  });
}

// Small deterministic grid search around fixed goals. Dynamic robots are handled
// by movement collision checks and short sidesteps, not by teleporting pieces.
function pathTo(game,bot,target){
  const cells=[];for(let z=-60;z<=60;z+=10)for(let x=-60;x<=60;x+=10)if(game.canStand(x,z,bot,true))cells.push({x,z});
  const closest=p=>cells.reduce((a,b)=>dist(p,a)<dist(p,b)?a:b);
  const start=closest(bot),end=closest(target),key=p=>`${p.x},${p.z}`;
  const map=new Map(cells.map(p=>[key(p),p])),queue=[start],parents=new Map([[key(start),null]]);
  for(let i=0;i<queue.length;i++){
    const current=queue[i];if(key(current)===key(end))break;
    for(const [dx,dz] of [[10,0],[-10,0],[0,10],[0,-10],[10,10],[-10,-10],[10,-10],[-10,10]]){
      const next=map.get(`${current.x+dx},${current.z+dz}`);if(!next||parents.has(key(next)))continue;
      if(!game.canStand((current.x+next.x)/2,(current.z+next.z)/2,bot,true))continue;
      parents.set(key(next),current);queue.push(next);
    }
  }
  if(!parents.has(key(end)))return [target];
  const path=[];let cursor=end;while(cursor){path.unshift(cursor);cursor=parents.get(key(cursor));}
  if(path.length&&dist(path[0],bot)<9)path.shift();path.push(target);return path;
}
function approach(game,bot,object){
  const positions=[];
  for(let i=0;i<24;i++){
    const h=i*Math.PI/12,p={x:object.x-Math.sin(h)*14,z:object.z-Math.cos(h)*14,heading:h};
    if(game.canStand(p.x,p.z,bot,true))positions.push(p);
  }
  return positions.sort((a,b)=>dist(bot,a)-dist(bot,b))[0]||null;
}
function assign(game,bot,job){
  bot.job=job;bot.path=job?.destination?pathTo(game,bot,job.destination):[];bot.stall=0;
}
function wander(game,bot,label='Wandering'){
  let destination;
  for(let i=0;i<30;i++){const p=randomPoint(game);if(game.canStand(p.x,p.z,bot,true)){destination=p;break;}}
  assign(game,bot,{kind:'wander',destination:destination||{x:bot.x,z:bot.z}});bot.status=label;
}
function held(game,bot){return game.objects.find(o=>o.id===bot.heldId);}
function prepareHeld(game,bot){
  const objects=game.bundle(held(game,bot));
  for(const o of objects){if(o.type==='pin'&&o.bottom===bot.color)[o.top,o.bottom]=[o.bottom,o.top];if(o.type==='cup')o.clearUp=false;}
}
function plan(game,bot){
  const carried=held(game,bot),center=game.goals.find(g=>g.id==='center');
  if(bot.discardHeld&&carried){
    const destination={x:clamp(bot.x+(bot.x<0?-15:15),-58,58),z:clamp(bot.z+18,-58,58)};
    if(game.canStand(destination.x,destination.z,bot,true)){assign(game,bot,{kind:'drop',destination});bot.status='Clearing a removed object';return;}
  }
  if(bot.role==='defender'&&bot.defenseCooldown<=0){
    const opponents=game.allRobots.filter(r=>r.color!==bot.color).sort((a,b)=>dist(bot,a)-dist(bot,b));
    const opponent=opponents[Math.min(opponents.length-1,bot.tendency==='drifty'&&game.random()<.4?1:0)];
    if(!opponent){wander(game,bot,'Looking for an opponent');return;}
    const destination={x:clamp(opponent.x+Math.sin(opponent.heading)*19,-60,60),z:clamp(opponent.z+Math.cos(opponent.heading)*19,-60,60)};
    if(game.canStand(destination.x,destination.z,bot,true)){assign(game,bot,{kind:'defend',destination,opponentId:opponent.id,refresh:1.2});bot.status=`Blocking ${opponent.id}`;return;}
  }
  if(game.random()<bot.tendencies.wander || (bot.role==='defender'&&bot.defenseCooldown>0)){wander(game,bot,bot.role==='defender'?'Giving space':'Taking a detour');return;}
  if(!carried&&bot.role==='center'&&game.canTouchGoal(center,true,bot)&&center.stack.length&&game.random()<bot.tendencies.descoring){
    const top=game.objects.find(o=>o.id===center.stack.at(-1));
    const pin=top.type==='pin'?top:game.objects.find(o=>o.id===center.stack.at(-2));
    if(pin&&(pin.top!==bot.color&&pin.top!=='yellow'||pin.bottom!==bot.color&&pin.bottom!=='yellow')){
      const destination=approach(game,bot,top);if(destination){assign(game,bot,{kind:'descore',objectId:top.id,destination});bot.status='Removing opposing center object';return;}
    }
  }
  let goals=game.goals.filter(g=>game.canTouchGoal(g,false,bot)&&g.stack.length<16&&(bot.strategyTarget==='alliance'?g.color===bot.color:bot.strategyTarget==='neutral'?g.color==='neutral':bot.strategyTarget==='balanced'?true:bot.role==='center'?g.id==='center':g.id!=='center'));
  if(carried){
    prepareHeld(game,bot);
    const parts=game.bundle(carried);
    goals=goals.filter(g=>parts.every((p,i)=>p.type===((g.stack.length+i)%2===0?'pin':'cup')));
    goals.sort((a,b)=>dist(bot,a)-dist(bot,b)+(a.color==='neutral'?-bot.tendencies.neutral*20:0)-(b.color==='neutral'?-bot.tendencies.neutral*20:0));
    for(const goal of goals){const destination=approach(game,bot,goal);if(destination){assign(game,bot,{kind:'score',goalId:goal.id,destination});bot.status=`Scoring ${goal.name}`;return;}}
    // A center specialist sometimes has the wrong piece for the current stack.
    bot.discardHeld=true;wander(game,bot,'Making room for the next object');return;
  }
  goals.sort((a,b)=>dist(bot,a)-dist(bot,b));
  const desired=goals[0]?.stack.length%2===0?'pin':'cup';
  const candidates=game.objects.filter(o=>!o.held&&!o.inIntake&&!o.goalId&&!(o.bundleIndex>0)&&o.type===desired&&(o.loaderIndex==null||game.mode!=='headtohead'||(o.x<0?'red':'blue')===bot.color));
  candidates.sort((a,b)=>{
    const preference=o=>o.type==='pin'&&!([o.top,o.bottom].includes(bot.color))?80:0;
    return dist(bot,a)+preference(a)-dist(bot,b)-preference(b);
  });
  for(const object of candidates){const destination=approach(game,bot,object);if(destination){assign(game,bot,{kind:'pick',objectId:object.id,destination});bot.status=`Collecting ${object.type}`;return;}}
  wander(game,bot,'Looking for an object');
}
function navigate(game,bot,dt){
  if(bot.job?.kind==='park')while(bot.path.length>1){
    const next=bot.path[1],length=dist(bot,next),steps=Math.max(1,Math.ceil(length/3));let clear=true;
    for(let i=1;i<=steps;i++)if(!game.canStand(bot.x+(next.x-bot.x)*i/steps,bot.z+(next.z-bot.z)*i/steps,bot,true)){clear=false;break;}
    if(!clear)break;bot.path.shift();
  }
  while(bot.path.length&&dist(bot,bot.path[0])<1.5)bot.path.shift();
  if(!bot.path.length)return true;
  const point=bot.path[0],desired=Math.atan2(point.x-bot.x,point.z-bot.z),diff=angleDifference(desired,bot.heading);
  const returning=bot.job?.kind==='park',turnRate=returning?4.2:(bot.turnRate||1.65);
  bot.heading+=clamp(diff,-dt*turnRate,dt*turnRate);
  const routeLength=returning?bot.path.reduce((n,p,i)=>n+dist(i?bot.path[i-1]:bot,p),0):0;
  const returnSpeed=clamp(routeLength/Math.max(1,game.remaining-2),24,34);
  bot.speed=Math.abs(diff)<.55?(returning?returnSpeed:bot.maxSpeed):0;
  const step=Math.min(dist(bot,point),bot.speed*dt),x=bot.x+Math.sin(bot.heading)*step,z=bot.z+Math.cos(bot.heading)*step;
  if(game.canStand(x,z,bot)){bot.x=x;bot.z=z;bot.stall=0;}
  else{
    bot.stall+=dt;
    for(const side of [1,-1]){
      const sx=bot.x+Math.cos(bot.heading)*side*dt*6,sz=bot.z-Math.sin(bot.heading)*side*dt*6;
      if(game.canStand(sx,sz,bot)){bot.x=sx;bot.z=sz;break;}
    }
    if(bot.stall>(returning ? .8 : 3)){wander(game,bot,'Repositioning');bot.decision=1.5;}
  }
  return false;
}
function updateParking(game,bot,dt){
  if(!bot.parking){bot.parking=true;bot.job=null;bot.path=[];bot.decision=0;}
  const x=bot.color==='red'?-61:61;
  const spaces=[{x,z:-60,index:0},{x,z:60,index:1}].filter(p=>
    !game.allRobots.some(r=>r!==bot&&dist(r,p)<18)&&
    !game.allRobots.some(r=>r!==bot&&r.color===bot.color&&r.parking&&r.job?.kind==='park'&&r.job.destination.index===p.index));
  if(bot.parked&&bot.job&&dist(bot,bot.job.destination)<2){bot.speed=0;bot.status='Parked';game.asRobot(bot,()=>game.syncHeld());return;}
  if(bot.job?.kind!=='park'||!spaces.some(p=>p.index===bot.job.destination.index)){
    const destination=spaces.sort((a,b)=>dist(bot,a)-dist(bot,b))[0];
    if(!destination){bot.speed=0;bot.status='Waiting for parking space';bot.job=null;game.asRobot(bot,()=>game.syncHeld());return;}
    assign(game,bot,{kind:'park',destination});bot.parked=false;
    // One small meander, only when the remaining route still fits the clock.
    const travel=bot.path.reduce((n,p,i)=>n+dist(i?bot.path[i-1]:bot,p),0)/24;
    if(!bot.parkDetour&&game.remaining>travel+3){
      const mid={x:clamp(bot.x+(game.random()-.5)*12,-60,60),z:clamp(bot.z+(game.random()-.5)*12,-60,60)};
      if(game.canStand(mid.x,mid.z,bot,true))bot.path.unshift(mid);
      bot.parkDetour=true;
    }
  }
  bot.status='Returning to park';bot.lift+=clamp(2.2-bot.lift,-dt*(bot.liftRate||12),dt*(bot.liftRate||12));
  if(navigate(game,bot,dt)){bot.parked=true;bot.speed=0;bot.status='Parked';}
  game.asRobot(bot,()=>game.syncHeld());
}
export function updateBots(game,dt){
  for(const bot of (game.automatedPlayer?[game.player,...game.bots]:game.bots)){
    if(bot===game.player&&bot.strategyIntake&&game.intake.objectId){game.asRobot(bot,()=>{bot.lift=Math.max(0,bot.lift-dt*12);bot.speed=0;game.updateIntake(dt,true);});continue;}
    applyProgram(game,bot);
    if(bot.strategyTarget==='park'){updateParking(game,bot,dt);continue;}
    if(bot.command==='park'){bot.willPark=true;updateParking(game,bot,dt);continue;}
    if(bot.command==='space'){
      const player=game.player,d=dist(bot,player);bot.status='Giving you space';
      if(d<40){const dx=bot.x-player.x,dz=bot.z-player.z,length=Math.hypot(dx,dz)||1,destination={x:clamp(bot.x+dx/length*18,-60,60),z:clamp(bot.z+dz/length*18,-60,60)};if(!bot.job||bot.job.kind!=='wander')assign(game,bot,{kind:'wander',destination});if(navigate(game,bot,dt))bot.job=null;}else{bot.job=null;bot.speed=0;}
      game.asRobot(bot,()=>game.syncHeld());continue;
    }
    if(['defender','center','field'].includes(bot.command))bot.role=bot.command;
    if(!bot.command&&!bot.program&&!bot.rerolled&&game.elapsed>=bot.rerollAt){
      const choices=AI_ROLES.filter(r=>r!==bot.role);bot.role=choices[Math.floor(game.random()*choices.length)];bot.rerolled=true;bot.roleHistory.push({time:game.elapsed,role:bot.role});bot.job=null;bot.path=[];bot.status='Switching strategy';
    }
    if(bot.willPark&&game.remaining<=bot.parkAt){updateParking(game,bot,dt);continue;}
    bot.defenseCooldown=Math.max(0,bot.defenseCooldown-dt);bot.decision=Math.max(0,bot.decision-dt);
    if(!bot.job){if(bot.decision<=0){plan(game,bot);bot.decision=bot.thinkDelay;}else{game.asRobot(bot,()=>game.syncHeld());continue;}}
    const job=bot.job;
    if(job.kind==='defend'){
      const opponent=game.allRobots.find(r=>r.id===job.opponentId);job.refresh-=dt;
      bot.engaged=dist(bot,opponent)<25?bot.engaged+dt:0;
      if(bot.engaged>(bot.engagementLimit||3.2)){bot.engaged=0;bot.defenseCooldown=bot.defenseRest||4.5;bot.job=null;}
      else if(job.refresh<=0)bot.job=null;
    }
    if(!bot.job){game.asRobot(bot,()=>game.syncHeld());continue;}
    const arrived=navigate(game,bot,dt);
    game.asRobot(bot,()=>{
      const target=job.objectId?game.objects.find(o=>o.id===job.objectId):null;
      const goal=job.goalId?game.goals.find(g=>g.id===job.goalId):null;
      if(target&&(target.held||target.inIntake||(job.kind==='pick'&&target.goalId))){bot.job=null;return;}
      const useIntake=bot===game.player&&bot.strategyIntake&&job.kind==='pick'&&target&&target.loaderIndex==null&&!target.bundleId&&target.y<4;
      const targetY=goal?goal.height+goal.stack.length*3.24:target?.y??3.24;
      const desiredLift=useIntake?0:clamp(targetY-3.24,0,60);bot.lift+=clamp(desiredLift-bot.lift,-dt*12,dt*12);
      if(arrived&&['pick','descore','score'].includes(job.kind)){
        const focus=goal||target;if(!focus){bot.job=null;return;}
        const aim=Math.atan2(focus.x-bot.x,focus.z-bot.z)+(useIntake?Math.PI:0),delta=angleDifference(aim,bot.heading);bot.heading+=clamp(delta,-dt*(bot.aimRate||2),dt*(bot.aimRate||2));
        game.syncHeld();
        if(Math.abs(delta)<.1&&Math.abs(desiredLift-bot.lift)<.4){
          if(bot.missChance&&game.random()<bot.missChance){bot.job=null;bot.decision=bot.thinkDelay*2;bot.status='Re-aiming';return;}
          if(job.kind==='score'){
            const before=game.heldId;game.release();if(before&&!game.heldId)bot.stats.scored++;
          }else{
            if(useIntake)game.updateIntake(dt,true);else game.grab();if(game.held){bot.stats.picked++;if(job.kind==='descore'){bot.stats.removed++;bot.discardHeld=true;}}
          }
          bot.job=null;bot.decision=bot.thinkDelay;
        }
      }else if(arrived&&job.kind==='drop'){
        if(!game.placementTarget()){game.release();if(!game.held){bot.discardHeld=false;bot.job=null;}}else bot.job=null;
      }else if(arrived&&job.kind==='wander')bot.job=null;
      game.syncHeld();
    });
  }
}
