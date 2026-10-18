export class GameAudio{
  constructor(config={}){this.config={enabled:true,volume:.35,music:false,...config};this.context=null;this.lastEvent=0;this.lastScore=null;this.lastSecond=null;this.musicAt=0;this.note=0;this.lastContact=0;}
  async unlock(){if(!this.config.enabled)return;try{if(!this.context){this.context=new (window.AudioContext||window.webkitAudioContext)();this.master=this.context.createGain();this.master.connect(this.context.destination);this.master.gain.value=this.config.volume;}await this.context.resume();}catch{}}
  configure(config){Object.assign(this.config,config);if(this.master)this.master.gain.setTargetAtTime(this.config.enabled?this.config.volume:0,this.context.currentTime,.05);}
  tone(frequency,duration=.12,volume=.15,type='sine',end=frequency){const c=this.context;if(!c||c.state!=='running'||!this.config.enabled)return;const osc=c.createOscillator(),gain=c.createGain(),t=c.currentTime;osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume,t+.01);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};}
  reset(game){this.lastEvent=game.history?.events.length||0;this.lastScore=game.score().total;this.lastSecond=null;this.ended=false;}
  update(game,contact=false){if(!this.context)return;const now=this.context.currentTime;
    if(this.config.music&&game.active&&now>this.musicAt){const notes=[130.81,164.81,196,164.81,146.83,174.61,220,174.61];this.tone(notes[this.note++%notes.length],.6,.025,'sine');this.musicAt=now+.8;}
    const events=game.history?.events||[];for(const e of events.slice(this.lastEvent)){if(e.kind==='place'){this.tone(660,.16,.13,'sine',990);}else if(e.kind==='pickup'||e.kind==='intake')this.tone(300,.1,.08,'triangle',500);else if(e.kind==='drop')this.tone(240,.12,.07,'triangle',120);else if(e.kind==='spill')this.tone(180,.3,.12,'triangle',65);else if(e.kind==='roller')this.tone(440,.1,.06,'square',550);}this.lastEvent=events.length;
    if(contact&&now-this.lastContact>.35){this.tone(100,.09,.13,'triangle',45);this.lastContact=now;}
    const sec=Math.ceil(game.remaining);if(game.active&&game.mode!=='practice'&&sec<=10&&sec!==this.lastSecond){this.tone(sec<=3?880:440,.09,.07);this.lastSecond=sec;}
    if(game.finished&&!this.ended){this.tone(220,.7,.15,'triangle',110);this.ended=true;}
  }
}
