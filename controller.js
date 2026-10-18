export const PAD_ACTIONS={toggle:'Pick up / drop',raise:'Raise lift',lower:'Lower lift',intake:'Intake (hold)',flip:'Flip stack',roller:'Turn roller',pause:'Pause / resume',loader:'Cycle team loader',precision:'Precision driving (hold)'};
export const defaultPad=()=>({enabled:true,deadZone:.15,driveAxis:1,turnAxis:0,invertDrive:true,invertTurn:true,buttons:{toggle:0,raise:5,lower:4,intake:7,flip:2,roller:3,pause:9,loader:8,precision:6}});
export function padAxis(value,deadZone){return Math.abs(value)<=deadZone?0:Math.sign(value)*(Math.abs(value)-deadZone)/(1-deadZone);}
export class PadInput{
  constructor(){this.previous=new Set();this.id=null;}
  sample(pads,config,allowActions=true){const pad=Array.from(pads||[]).find(p=>p?.connected);if(!pad||!config.enabled){this.previous.clear();this.id=null;return {input:{},actions:[],connected:false};}if(this.id!==pad.id)this.previous.clear();this.id=pad.id;const down=new Set(pad.buttons.map((b,i)=>b.pressed?i:-1).filter(i=>i>=0)),actions=[];
    for(const [action,index] of Object.entries(config.buttons))if(down.has(index)&&!this.previous.has(index)&&allowActions&&!['raise','lower','intake','precision'].includes(action))actions.push(action);
    this.previous=down;return {connected:true,name:pad.id,actions,input:{drive:padAxis(pad.axes[config.driveAxis]||0,config.deadZone)*(config.invertDrive?-1:1),turn:padAxis(pad.axes[config.turnAxis]||0,config.deadZone)*(config.invertTurn?-1:1),lift:(down.has(config.buttons.raise)?1:0)-(down.has(config.buttons.lower)?1:0),intake:down.has(config.buttons.intake),precision:down.has(config.buttons.precision)}};
  }
}
export function readPad(value){const c=defaultPad();if(!value||typeof value!=='object')return c;for(const k of ['enabled','invertDrive','invertTurn'])if(typeof value[k]==='boolean')c[k]=value[k];if(Number.isFinite(value.deadZone)&&value.deadZone>=.05&&value.deadZone<=.5)c.deadZone=value.deadZone;for(const k of ['driveAxis','turnAxis'])if(Number.isInteger(value[k])&&value[k]>=0&&value[k]<=7)c[k]=value[k];for(const k of Object.keys(c.buttons))if(Number.isInteger(value.buttons?.[k])&&value.buttons[k]>=0&&value.buttons[k]<=31)c.buttons[k]=value.buttons[k];return c;}
export const XBOX_BUTTON_NAMES=['A','B','X','Y','LB','RB','LT','RT','View','Menu','Left stick click','Right stick click','D-pad up','D-pad down','D-pad left','D-pad right','Xbox','Share'];
export const xboxButtonName=index=>XBOX_BUTTON_NAMES[index]||`Extra button ${index}`;
export function rebindPad(config,action,index){
 if(!Object.hasOwn(PAD_ACTIONS,action)||!Number.isInteger(index)||index<0||index>31)return null;
 const old=config.buttons[action],conflicts=Object.keys(config.buttons).filter(a=>a!==action&&config.buttons[a]===index);
 for(const other of conflicts)config.buttons[other]=old;config.buttons[action]=index;return {action,index,swapped:conflicts};
}
export class PadRebinder{
 constructor(){this.cancel();}
 cancel(){this.action=null;this.previous=new Set();this.id=null;}
 arm(action,pad){this.action=action;this.id=pad?.id||null;this.previous=new Set((pad?.buttons||[]).map((b,i)=>b.pressed?i:-1).filter(i=>i>=0));}
 poll(pad){if(!this.action||!pad?.connected)return null;const down=new Set(pad.buttons.map((b,i)=>b.pressed?i:-1).filter(i=>i>=0));if(this.id!==pad.id){this.id=pad.id;this.previous=down;return null;}const index=[...down].find(i=>!this.previous.has(i));this.previous=down;if(index===undefined||index>31)return null;const action=this.action;this.cancel();return {action,index};}
}
