import {Game} from '../game.js';
let attempts=0,parked=0,total=0;
for(let seed=1;seed<=100;seed++){
  let n=seed;const g=new Game({random:()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;}});g.reset('headtohead');g.start();g.tick(120);
  for(const b of g.bots){total++;attempts+=Number(b.willPark);parked+=Number([-60,60].some(z=>Math.hypot(b.x-(b.color==='red'?-68.5:68.5),b.z-z)<10));}
}
console.log(JSON.stringify({total,attempts,parked,attemptRate:attempts/total,parkRate:parked/total}));
