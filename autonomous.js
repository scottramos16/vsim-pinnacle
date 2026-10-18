import {Game} from './game.js';
export const AUTO_ACTIONS={drive:'Drive forward',reverse:'Drive backward',left:'Turn left',right:'Turn right',driveDistance:'Drive distance',turnAngle:'Turn angle',raise:'Raise lift',lower:'Lower lift',intake:'Run intake',grab:'Grab',release:'Release',flip:'Flip',wait:'Wait'};
const companions=['raise','lower','intake','grab','release','flip'];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function validateSequence(steps){return Array.isArray(steps)&&steps.length<=64&&steps.every(s=>s&&Object.hasOwn(AUTO_ACTIONS,s.action)&&Number.isFinite(s.duration)&&s.duration>=.1&&s.duration<=15&&(!['driveDistance','turnAngle'].includes(s.action)||Number.isFinite(s.value)&&Math.abs(s.value)<= (s.action==='turnAngle'?720:144)&&Math.abs(s.value)>=.1)&&(!s.parallel||Array.isArray(s.parallel)&&s.parallel.every(a=>companions.includes(a))&&!([s.action,...s.parallel].includes('raise')&&[s.action,...s.parallel].includes('lower'))));}
export const defaultSequence=()=>[{action:'drive',duration:1},{action:'wait',duration:.3},{action:'left',duration:.5},{action:'wait',duration:.2}];
export class AutoRunner{
  constructor(steps){if(!validateSequence(steps))throw Error('Invalid autonomous sequence');this.steps=structuredClone(steps);this.reset();}
  reset(){this.index=0;this.time=0;this.entered=false;this.log=[];this.start=null;this.angle=0;this.previousHeading=0;}
  input(game,dt,settings={}){
    for(let transitions=0;transitions<65;transitions++){
      const step=this.steps[this.index];if(!step)return {};
      if(!this.entered){this.entered=true;this.start={x:game.robot.x,z:game.robot.z,heading:game.robot.heading};this.angle=0;this.previousHeading=game.robot.heading;
        for(const action of [step.action,...(step.parallel||[])])if(['grab','release','flip'].includes(action))this.log.push({step:this.index,time:game.elapsed,message:game[action]()});
      }
      const delta=game.robot.heading-this.previousHeading;this.angle+=Math.atan2(Math.sin(delta),Math.cos(delta));this.previousHeading=game.robot.heading;
      let error=null;
      if(step.action==='driveDistance')error=step.value-((game.robot.x-this.start.x)*Math.sin(this.start.heading)+(game.robot.z-this.start.z)*Math.cos(this.start.heading));
      if(step.action==='turnAngle')error=step.value*Math.PI/180-this.angle;
      if(error!==null&&(Math.abs(error)<(step.action==='driveDistance'?.25:.005)||this.time>=step.duration-1e-8)){
        this.log.push({step:this.index,time:game.elapsed,message:Math.abs(error)<(step.action==='driveDistance'?.25:.005)?'Target reached':'Target timeout',error});if(step.action==='driveDistance')game.robot.speed=0;
        this.index++;this.time=0;this.entered=false;continue;
      }
      const input={};for(const action of [step.action,...(step.parallel||[])]){
        if(action==='drive')input.drive=1;if(action==='reverse')input.drive=-1;if(action==='left')input.turn=1;if(action==='right')input.turn=-1;
        if(action==='raise')input.lift=1;if(action==='lower')input.lift=-1;if(action==='intake')input.intake=true;
      }
      if(step.action==='driveDistance')input.drive=clamp(error/5,-1,1);
      if(step.action==='turnAngle')input.turn=clamp(error/((settings.turnSpeed||1.8)*dt),-1,1);
      this.time+=dt;
      if(!['driveDistance','turnAngle'].includes(step.action)&&this.time>=step.duration-1e-8){this.time=0;this.index++;this.entered=false;}
      return input;
    }return {};
  }
}
export function configureTrial(model,options={}){
  const p=options.start;if(p&&[p.x,p.z,p.heading].every(Number.isFinite)&&model.canStand(p.x,p.z,model.robot,true)){Object.assign(model.robot,{x:p.x,z:p.z,heading:p.heading});model.syncHeld();}
  if(options.setup)options.applySetup?.(model,options.setup);
  if(model.history?.robots.R1){model.history.robots.R1.path=[{t:0,x:model.robot.x,z:model.robot.z}];model.history.robots.R1.last={x:model.robot.x,z:model.robot.z};}
}
export function predictAutonomous(steps,settings={},loaderConfigs=[],options={}){
  const model=new Game({random:options.random||(()=>.5)});model.reset('autonomous');loaderConfigs.forEach((config,i)=>model.configureLoader(i,config));configureTrial(model,options);
  const runner=new AutoRunner(steps),frames=[],path=[];
  const snapshot=()=>{frames.push(structuredClone({t:model.elapsed,elapsed:model.elapsed,robot:model.robot,bots:[],heldId:model.heldId,objects:model.objects,intake:model.intake,loaders:model.loaders,rollers:model.rollers,goals:model.goals}));path.push({t:model.elapsed,x:model.robot.x,z:model.robot.z});};
  snapshot();model.start();let next=.1;
  while(model.active){const current=runner.steps[runner.index],dt=Math.min(1/60,model.remaining,current?Math.max(1e-8,current.duration-runner.time):Infinity);model.tick(dt,{...settings,...runner.input(model,dt,settings)});if(model.elapsed>=next-1e-8||model.finished){snapshot();next+=.1;}}
  return {model,frames,path,score:model.score(),log:runner.log,completedSteps:runner.index};
}
export async function reliabilityTest(steps,settings,loaders,options={},count=20,onProgress=()=>{}){
  const results=[];for(let i=0;i<count;i++){
    const scale=.94+Math.random()*.12,variation={...settings,driveSpeed:(settings.driveSpeed||38)*scale,turnSpeed:(settings.turnSpeed||1.8)*(.94+Math.random()*.12),acceleration:(settings.acceleration||10)*(.9+Math.random()*.2)};
    const trial=predictAutonomous(steps,variation,loaders,{...options,random:Math.random});results.push({score:trial.score.total,completed:trial.completedSteps>=steps.length&&trial.log.every(e=>e.message!=='Target timeout'),end:trial.path.at(-1)});onProgress(i+1,count);await new Promise(r=>setTimeout(r,0));
  }
  const avg=results.reduce((s,r)=>s+r.score,0)/count,target=options.targetScore||predictAutonomous(steps,settings,loaders,options).score.total;
  return {count,average:avg,min:Math.min(...results.map(r=>r.score)),max:Math.max(...results.map(r=>r.score)),success:results.filter(r=>r.score>=target&&r.completed).length/count,target,results};
}
