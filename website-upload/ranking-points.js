// Pinnacle v2.0 manual section 5.5; qualification points belong to alliances.
export function visibleAllianceHalves(goal,objects,color){
 const stack=[];for(const id of goal.stack){const o=objects.find(p=>p.id===id);if(!o||o.type!==(stack.length%2?'cup':'pin'))break;stack.push(o);}
 let count=0;stack.forEach((o,i)=>{if(o.type!=='pin')return;if(i>0&&stack[i-1].clearUp&&o.bottom===color)count++;if((!stack[i+1]||!stack[i+1].clearUp)&&o.top===color)count++;});return count;
}
export function calculateRankingPoints(game){
 if(game.mode!=='headtohead')return null;
 const score=game.score(),alliances={};
 for(const color of ['red','blue']){
  const other=color==='red'?'blue':'red',highestStack=Math.max(0,...game.goals.map(g=>visibleAllianceHalves(g,game.objects,color))),roller=Object.values(game.rollers).includes(color),parked=(score.parking?.[color]||0)>0;
  const conditions=[{id:'stack',label:'One stack with at least 5 visible alliance-colored halfpins',met:highestStack>=5,value:highestStack,required:5},{id:'roller',label:'At least one roller showing your alliance color',met:roller},{id:'park',label:'At least one robot parked at your alliance loader',met:parked}];
  const endgame=conditions.every(c=>c.met)?1:0,match=score[color]>score[other]?2:score[color]===score[other]?1:0;
  alliances[color]={color,endgame,match,autonomous:null,total:endgame+match,result:match===2?'Win':match===1?'Tie':'Loss',conditions};
 }
 return {manual:'Pinnacle v2.0, sections 5.5.1-5.5.3',source:'https://games.recf.org/achieve/2.0',autonomousStatus:'Not run: this simulator match skips the autonomous period.',alliances};
}
