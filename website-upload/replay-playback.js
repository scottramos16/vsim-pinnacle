export class ReplayPlayback{
 constructor(){this.time=0;this.duration=0;this.start=0;this.playing=false;this.rate=1;this.loop=false;}
 play(duration,time=this.time,start=0){this.duration=Math.max(0,duration);this.start=Math.max(0,Math.min(start,this.duration));this.time=Math.max(this.start,Math.min(time,this.duration));if(this.time>=this.duration)this.time=this.start;this.playing=this.duration>this.start;return this.time;}
 pause(){this.playing=false;}
 tick(dt){if(!this.playing||!Number.isFinite(dt)||dt<0)return this.time;this.time+=dt*this.rate;if(this.time>=this.duration){if(this.loop&&this.duration>this.start)this.time=this.start+(this.time-this.start)%(this.duration-this.start);else{this.time=this.duration;this.playing=false;}}return this.time;}
}
