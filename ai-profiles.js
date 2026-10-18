export const DIFFICULTIES={easy:{name:'Easy',speed:.72,turn:.8,lift:.8,think:1.6,wander:1.6,miss:.15},standard:{name:'Standard',speed:1,turn:1,lift:1,think:1,wander:1,miss:0},hard:{name:'Hard',speed:1.25,turn:1.3,lift:1.25,think:.65,wander:.55,miss:0},expert:{name:'Expert',speed:1.55,turn:1.6,lift:1.5,think:.4,wander:.2,miss:0}};
export function applyDifficulty(bot,key='standard'){
 const d=DIFFICULTIES[key]||DIFFICULTIES.standard;bot.difficulty=DIFFICULTIES[key]?key:'standard';bot.maxSpeed*=d.speed;bot.thinkDelay*=d.think;bot.turnRate=1.65*d.turn;bot.liftRate=12*d.lift;bot.aimRate=2*d.turn;bot.missChance=d.miss;bot.tendencies.wander=Math.min(.85,bot.tendencies.wander*d.wander);
}
export const STRATEGY_ACTIONS={center:'Score / descore center',alliance:'Score alliance goals',neutral:'Score neutral goals',balanced:'Score any legal goal',defender:'Defend opponents',park:'Park at own loader'};
export const defaultProgram=()=>({phases:[{until:45,action:'center'},{until:108,action:'alliance'},{until:120,action:'park'}],wander:.08,descore:.65,aggression:.5,parkAt:12,parkingChance:.75});
export function validateProgram(p){
 if(!p||!Array.isArray(p.phases)||!p.phases.length||p.phases.length>12)return 'Use 1-12 phases.';
 let previous=0;for(const phase of p.phases){if(!Number.isFinite(phase.until)||phase.until<=previous||phase.until>120||!Object.hasOwn(STRATEGY_ACTIONS,phase.action))return 'Phase end times must increase and stay within 120 seconds.';previous=phase.until;}if(previous!==120)return 'The final phase must end at 120 seconds.';
 for(const key of ['wander','descore','aggression','parkingChance'])if(!Number.isFinite(p[key])||p[key]<0||p[key]>1)return `${key} must be between 0 and 1.`;
 if(!Number.isFinite(p.parkAt)||p.parkAt<0||p.parkAt>30)return 'Parking lead time must be 0-30 seconds.';return null;
}
export function parseStrategy(text,base=defaultProgram()){
 const phases=[];let expected=0;const aliases={center:'center',centre:'center',alliance:'alliance',field:'alliance',neutral:'neutral',balanced:'balanced',defend:'defender',defender:'defender',park:'park'};
 const lines=text.split(/\n|;/).map(l=>l.trim()).filter(l=>l&&!l.startsWith('#'));if(!lines.length)throw Error('Enter a phase such as 0-45: center.');
 for(const [i,line] of lines.entries()){const m=line.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*:\s*(\w+)$/i);if(!m||!aliases[m[3].toLowerCase()])throw Error(`Line ${i+1}: use start-end: center, alliance, neutral, balanced, defend or park.`);if(Number(m[1])!==expected)throw Error(`Line ${i+1}: this phase must start at ${expected}s.`);expected=Number(m[2]);phases.push({until:expected,action:aliases[m[3].toLowerCase()]});}
 const program={...structuredClone(base),phases},error=validateProgram(program);if(error)throw Error(error);return program;
}
export function strategyText(program){let start=0;return program.phases.map(p=>{const line=`${start}-${p.until}: ${p.action}`;start=p.until;return line;}).join('\n');}
export function applyProgram(game,bot){
 const p=bot.program;if(!p)return;const i=p.phases.findIndex(phase=>game.elapsed<phase.until),phase=p.phases[i<0?p.phases.length-1:i];
 if(bot.programPhase!==i){bot.programPhase=i;bot.job=null;bot.path=[];bot.decision=0;}
 bot.strategyTarget=phase.action;bot.role=phase.action==='center'?'center':phase.action==='defender'?'defender':'field';
 bot.tendencies.wander=p.wander*(DIFFICULTIES[bot.difficulty]?.wander||1);bot.tendencies.descoring=p.descore;bot.engagementLimit=1.5+p.aggression*2.5;bot.defenseRest=6-p.aggression*4;
}
