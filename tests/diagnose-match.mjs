import {Game} from '../game.js';
for(let seed=1;seed<=5;seed++){
  let n=seed;const random=()=>{n=(1664525*n+1013904223)>>>0;return n/4294967296;};
  const g=new Game({random});g.reset('headtohead');g.start();g.tick(120);
  console.log(JSON.stringify({seed,red:g.score().red,blue:g.score().blue,bots:g.bots.map(b=>({id:b.id,role:b.role,status:b.status,stats:b.stats,position:[Math.round(b.x),Math.round(b.z)],history:b.roleHistory}))}));
}
