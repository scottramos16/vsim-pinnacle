import {simulateStrategy,summarizeTrials,validateBatch,recommendationCandidates,rankRecommendations} from './strategy-simulation.js';
let cancelled=false,running=false;
self.onmessage=async ({data})=>{
 if(data.type==='cancel'){cancelled=true;return;}if(!['run','recommend'].includes(data.type)||running)return;
 const config=data.config,error=validateBatch(config);if(error){self.postMessage({type:'error',message:error});return;}
 running=true;cancelled=false;const comparing=data.type==='recommend',candidates=comparing?recommendationCandidates(config):[{name:'Your current plan',program:config.program}],rows=[];let completed=0;
 try{
 for(const candidate of candidates){if(cancelled)break;const trialConfig={...structuredClone(config),program:candidate.program},trials=[];let best=null,worst=null;
 for(let i=0;i<config.trials&&!cancelled;i++){
  const result=simulateStrategy(trialConfig,i);if(!best||result.red-result.blue>best.red-best.blue)best=result;if(!worst||result.red-result.blue<worst.red-worst.blue)worst=result;
  const {paths,timeline,scoreTimeline,goals,...metrics}=result;trials.push(metrics);completed++;
  self.postMessage({type:'progress',summary:summarizeTrials(trials),planned:config.trials,completed,total:config.trials*candidates.length,candidate:comparing?candidate.name:null,best,worst,config:trialConfig});await new Promise(r=>setTimeout(r,0));
 }
 if(trials.length)rows.push({...candidate,summary:summarizeTrials(trials),trials,best,worst,config:trialConfig});
 }
 const full=rows.filter(r=>r.trials.length===config.trials),ranked=rankRecommendations(full),chosen=comparing?(ranked[0]||rows[0]):rows[0];
 self.postMessage({type:'complete',cancelled,summary:chosen?.summary||{completed:0},trials:chosen?.trials||[],best:chosen?.best,worst:chosen?.worst,config:chosen?.config||config,completed,total:config.trials*candidates.length,recommendations:comparing?ranked.map(({name,program,summary})=>({name,program,summary})):null});
 }catch(error){self.postMessage({type:'error',message:error.message});}finally{running=false;}
};
