import {scoreGoal,scoreAllianceGoal,STACK_STEP} from './game.js';
export class EditHistory{
  constructor(initial,limit=60){this.past=[structuredClone(initial)];this.future=[];this.limit=limit;}
  commit(value){if(JSON.stringify(value)===JSON.stringify(this.past.at(-1)))return;this.past.push(structuredClone(value));if(this.past.length>this.limit)this.past.shift();this.future=[];}
  undo(){if(this.past.length<2)return null;this.future.push(this.past.pop());return structuredClone(this.past.at(-1));}
  redo(){if(!this.future.length)return null;const v=this.future.pop();this.past.push(v);return structuredClone(v);}
}
export function captureWorld(g){return structuredClone({objects:g.objects,goals:g.goals,loaders:g.loaders,rollers:g.rollers,supply:g.supply,robot:g.robot,bots:g.bots,heldId:g.heldId,intake:g.intake,elapsed:g.elapsed,remaining:g.remaining,mode:g.mode,nextId:g.nextId});}
export function restoreWorld(g,state,{setup=false}={}){
 const v=structuredClone(state),bots=g.bots;
 for(const key of ['objects','goals','loaders','rollers','supply','heldId','intake','nextId'])if(v[key]!==undefined)g[key]=v[key];
 if(!setup){g.robot=v.robot;g.player=g.robot;g.bots=v.bots||[];g.elapsed=v.elapsed??v.t??0;if(v.remaining!==undefined)g.remaining=v.remaining;if(v.mode)g.mode=v.mode;}
 else{
  const playerParts=new Set(g.bundle(g.objects.find(o=>o.id===v.heldId)).map(o=>o.id));g.objects=g.objects.filter(o=>!o.held||playerParts.has(o.id));g.nextId=Math.max(0,...g.objects.map(o=>o.id))+1;
  for(const bot of bots){const pin=g.make('pin',bot.x,bot.z,{top:bot.color,bottom:'yellow',held:true});bot.heldId=pin.id;g.asRobot(bot,()=>g.syncHeld());}
 }
 if(setup&&g.automatedPlayer)g.player.heldId=g.heldId;g.syncHeld();g.finalScore=null;
}
export function editField(g,edit){
  if(!['add','move','delete'].includes(edit.kind)||edit.kind==='add'&&!['pin','cup'].includes(edit.type))throw Error('Choose a pin, cup or stack action.');
  if(g.active)throw Error('Pause before editing the field.');
  if(edit.kind!=='delete'&&(!Number.isFinite(edit.x)||!Number.isFinite(edit.z)||Math.abs(edit.x)>68||Math.abs(edit.z)>68))throw Error('Keep objects inside the field.');
  if(edit.kind==='add'){
    const count=Math.max(1,Math.min(9,Math.floor(edit.count||1))),goal=g.goals.find(p=>Math.hypot(p.x-edit.x,p.z-edit.z)<6);
    if(goal&&edit.type!==(goal.stack.length%2?'cup':'pin'))throw Error('This goal needs the opposite object type.');
    const parts=[];for(let i=0;i<count;i++){const type=i%2?(edit.type==='pin'?'cup':'pin'):edit.type;const p=g.make(type,goal?goal.x:edit.x,goal?goal.z:edit.z,{top:'red',bottom:'yellow',clearUp:false,y:goal?goal.height+(goal.stack.length)*STACK_STEP:3.24+i*STACK_STEP,goalId:goal?.id||null});if(goal)goal.stack.push(p.id);parts.push(p);}
    if(!goal&&parts.length>1)parts.forEach((p,i)=>Object.assign(p,{bundleId:parts[0].id,bundleIndex:i}));return parts[0].id;
  }
  const object=g.objects.find(o=>o.id===edit.id);if(!object||object.held||object.inIntake||object.loaderIndex!=null)throw Error('Choose a loose or scored object.');
  const destination=edit.kind==='move'?g.goals.find(p=>Math.hypot(p.x-edit.x,p.z-edit.z)<6):null;
  if(destination&&(object.goalId===destination.id||object.type!==(destination.stack.length%2?'cup':'pin')))throw Error('This goal needs the opposite object type, or the stack is already here.');
  let parts=g.bundle(object);if(object.goalId){const goal=g.goals.find(p=>p.id===object.goalId),index=goal.stack.indexOf(object.id);parts=goal.stack.splice(index).map(id=>g.objects.find(o=>o.id===id));}
  if(edit.kind==='delete'){const ids=new Set(parts.map(p=>p.id));g.objects=g.objects.filter(p=>!ids.has(p.id));return null;}
  if(destination){for(const p of parts){Object.assign(p,{x:destination.x,z:destination.z,y:destination.height+destination.stack.length*STACK_STEP,goalId:destination.id,lying:false,bundleId:null,bundleIndex:0,vy:0});destination.stack.push(p.id);}return parts[0].id;}
  parts.forEach((p,i)=>Object.assign(p,{x:edit.x,z:edit.z,y:3.24+i*STACK_STEP,goalId:null,lying:false,bundleId:parts.length>1?parts[0].id:null,bundleIndex:i,vy:0}));return parts[0].id;
}
export function explainGoal(g,goal){
  const stack=[];for(const id of goal.stack){const o=g.objects.find(p=>p.id===id);if(!o||o.type!==(stack.length%2?'cup':'pin'))break;stack.push(o);}
  const halves=[];for(const [i,o] of stack.entries())if(o.type==='pin')for(const end of ['bottom','top']){const visible=end==='bottom'?i>0&&stack[i-1].clearUp:!stack[i+1]||!stack[i+1].clearUp;const color=o[end];let reason=visible?'Visible':end==='bottom'&&i===0?'Concealed by goal':'Concealed by opaque cup';let points=0;
    if(visible){if(g.mode==='headtohead'){points=goal.color==='center'?10:goal.color==='neutral'?7:5;if(color==='yellow'&&!['red','blue'].includes(g.rollers[goal.zone])&&goal.color!=='center'){points=0;reason='Yellow needs an alliance-owned roller';}else if(color!=='yellow'&&['red','blue'].includes(goal.color)&&goal.color!==color){points=0;reason='Wrong alliance goal';}}
    else{points=goal.color==='center'?10:color==='yellow'?(g.rollers[goal.zone]===(goal.color==='blue'?'blue':'red')?5:0):(goal.color===color||goal.color==='neutral'?5:0);if(!points)reason=color==='yellow'?'Yellow needs the matching roller':'Wrong color for this goal';}}
    halves.push({id:o.id,end,color,visible,points,reason});}
  if(g.mode==='headtohead'&&goal.color==='center'){const red=halves.filter(h=>h.visible&&h.color==='red').length,blue=halves.filter(h=>h.visible&&h.color==='blue').length;if(red===blue)for(const h of halves)if(h.color==='yellow'&&h.visible){h.points=0;h.reason='Center tied: no yellow bonus';}}
  const score=g.mode==='headtohead'?scoreAllianceGoal(goal,g.objects,g.rollers):scoreGoal(goal,g.objects,g.rollers);
  return {goal:goal.name,halves,cups:stack.filter(o=>o.type==='cup').length,score};
}
export const CHALLENGES={stack:{name:'Build a three-object stack',description:'Score a pin, cup and pin on one red goal.',limit:90},route:{name:'Four corners',description:'Visit all four marked corners of the field.',limit:60},park:{name:'Last-second parking',description:'Reach either red loader before the 30-second buzzer.',limit:30}};
export function challengeProgress(g,id,state={visited:[]}){if(id==='stack')return {done:g.goals.some(p=>p.color==='red'&&p.stack.length>=3),text:'Build pin / cup / pin on a red goal.'};if(id==='route'){for(const [i,p] of [[-55,-55],[-55,55],[55,-55],[55,55]].entries())if(Math.hypot(g.robot.x-p[0],g.robot.z-p[1])<15&&!state.visited.includes(i))state.visited.push(i);return {done:state.visited.length===4,text:`Corners visited: ${state.visited.length} / 4`};}return {done:g.elapsed>1&&g.loaders.some((l,i)=>i<2&&Math.hypot(g.robot.x-[-73,-73][i],g.robot.z-[-60,60][i])<14),text:'Park next to either red loader.'};}
export function ghostPose(path,t){if(!path?.length)return null;let i=path.findIndex(p=>p.t>=t);if(i<0)i=path.length-1;const b=path[i],a=path[Math.max(0,i-1)],f=b.t===a.t?0:Math.max(0,Math.min(1,(t-a.t)/(b.t-a.t)));return {x:a.x+(b.x-a.x)*f,z:a.z+(b.z-a.z)*f,heading:Number.isFinite(a.heading)&&Number.isFinite(b.heading)?a.heading+Math.atan2(Math.sin(b.heading-a.heading),Math.cos(b.heading-a.heading))*f:Math.atan2(b.x-a.x,b.z-a.z),lift:Number.isFinite(a.lift)&&Number.isFinite(b.lift)?a.lift+(b.lift-a.lift)*f:undefined};}
