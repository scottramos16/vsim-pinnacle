export function showSummary(summary,{onFrame=()=>{}}={}){
  renderRankingPoints(summary);
  const select=document.getElementById('summary-robot'),slider=document.getElementById('summary-time');
  select.innerHTML=summary.robots.map(r=>`<option value="${r.id}">${r.id}${r.id==='R1'?' · You':''}</option>`).join('');
  slider.max=summary.duration;slider.value=summary.duration;
  const draw=()=>{
    const selected=summary.robots.find(r=>r.id===select.value)||summary.robots[0],t=Number(slider.value),canvas=document.getElementById('summary-map'),ctx=canvas.getContext('2d');
    const point=(x,z)=>[40+(x+72)*5,40+(z+72)*5];
    ctx.clearRect(0,0,800,800);ctx.fillStyle='#263735';ctx.fillRect(0,0,800,800);
    ctx.strokeStyle='#a7b9a32b';ctx.lineWidth=1;
    for(let n=-72;n<=72;n+=24){let [x]=point(n,0),[,z]=point(0,n);ctx.beginPath();ctx.moveTo(x,40);ctx.lineTo(x,760);ctx.moveTo(40,z);ctx.lineTo(760,z);ctx.stroke();}
    ctx.strokeStyle='#d6e6ce99';ctx.lineWidth=2;
    for(const x of [-24,24]){ctx.beginPath();ctx.moveTo(...point(x,-72));ctx.lineTo(...point(x,72));ctx.stroke();}
    for(const z of [-24,24]){ctx.beginPath();ctx.moveTo(...point(-24,z));ctx.lineTo(...point(24,z));ctx.stroke();}
    for(const [x,z,color] of [[-48,-24,'#ed6268'],[-48,24,'#ed6268'],[48,-24,'#5ebfea'],[48,24,'#5ebfea'],[0,-48,'#bcc9b7'],[0,48,'#bcc9b7'],[0,0,'#c6f36b']]){ctx.fillStyle=color;ctx.beginPath();ctx.arc(...point(x,z),12,0,Math.PI*2);ctx.fill();}
    for(const robot of summary.robots){
      const path=robot.path.filter(p=>p.t<=t),color=robot.id==='R1'?'#c6f36b':robot.color==='red'?'#f36970':'#56bced';
      ctx.globalAlpha=robot===selected?1:.25;ctx.strokeStyle=color;ctx.lineWidth=robot===selected?5:3;ctx.lineJoin='round';ctx.beginPath();path.forEach((p,i)=>{ctx[i?'lineTo':'moveTo'](...point(p.x,p.z));});ctx.stroke();
      if(path.length){ctx.fillStyle=color;ctx.beginPath();ctx.arc(...point(path[0].x,path[0].z),7,0,Math.PI*2);ctx.fill();const last=path.at(-1);ctx.beginPath();ctx.arc(...point(last.x,last.z),11,0,Math.PI*2);ctx.fill();ctx.font='bold 22px Segoe UI';ctx.fillText(robot.id,...point(last.x+3,last.z-3));}
    }
    ctx.globalAlpha=1;
    for(const event of summary.events.filter(e=>e.robot===selected.id&&e.t<=t&&(e.ownDelta||e.otherDelta))){ctx.strokeStyle=event.ownDelta>=0?'#ffffff':'#f2a16d';ctx.lineWidth=3;const [x,y]=point(event.x,event.z);ctx.strokeRect(x-7,y-7,14,14);}
    document.getElementById('summary-clock').textContent=`${t.toFixed(1)}s / ${summary.duration.toFixed(1)}s`;
    document.getElementById('summary-metrics').innerHTML=`<h3>${selected.id} ${selected.id==='R1'?'· Your robot':''}</h3><div class="summary-stats">${[['Points added',selected.pointsAdded],['Opponent points removed',selected.opponentRemoved],['Net score swing',selected.netSwing],['Parking points',selected.parking],['Distance driven',`${(selected.distance/12).toFixed(1)} ft`],['Objects placed',selected.placements],['Pickups',selected.pickups],['Intake feeds',selected.intakes]].map(([k,v])=>`<span>${k}</span><b>${v}</b>`).join('')}</div><p class="tiny">Points are credited when actions happen. Later cup visibility and roller changes can change the final field score. Initial field points are excluded.</p>`;
    document.getElementById('summary-events').innerHTML=summary.events.filter(e=>e.robot===selected.id&&e.t<=t).slice(-12).reverse().map(e=>`<li><span>${e.t.toFixed(1)}s · ${e.kind}</span><b>${e.ownDelta>=0?'+':''}${e.ownDelta}${e.otherDelta?` / opponent ${e.otherDelta>0?'+':''}${e.otherDelta}`:''}</b></li>`).join('')||'<li>No recorded actions yet.</li>';
  };
  const refresh=()=>{draw();onFrame({robot:select.value,time:Number(slider.value)});};
  select.onchange=refresh;slider.oninput=refresh;refresh();
  document.getElementById('summary-download').onclick=()=>{
    const blob=new Blob([JSON.stringify(summary,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='pinnacle-match-summary.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
}

function renderRankingPoints(summary){
 const target=document.getElementById('summary-ranking');if(!target)return;
 const ranking=summary.rankingPoints;if(!ranking){target.hidden=true;return;}target.hidden=false;
 target.innerHTML='<h3>Alliance ranking points</h3><div class="ranking-alliances">'+['red','blue'].map(color=>{const r=ranking.alliances[color];return '<div class="ranking-alliance"><strong>'+color.toUpperCase()+' <b>'+r.total+' RP</b></strong><p>'+r.result+': '+r.match+' match RP / '+r.endgame+' endgame RP</p><ul>'+r.conditions.map(c=>'<li class="'+(c.met?'met':'unmet')+'">'+(c.met?'&#10003;':'&#9675;')+' '+c.label+(c.value!==undefined?' ('+c.value+'/'+c.required+')':'')+'</li>').join('')+'</ul></div>';}).join('')+'</div><p class="tiny">Autonomous RP: not run. Head-to-head has no autonomous period. Parking uses approximate simulator loader-contact detection. <a href="https://games.recf.org/achieve/2.0" target="_blank" rel="noreferrer">Manual section 5.5</a></p>';
}
