import * as THREE from 'three';
import './style.css';
import { THEMES, COLORS, generateCourse, createRacers, resetRacers, botInput, obstaclePose, stepRacer, resolveRacerCollisions, raceOrder, awardRound, finalOrder, clamp } from './game.js';

const $=s=>document.querySelector(s);
$('#app').innerHTML=`
  <div id="world" aria-label="3D 糖豆競速場"></div><div class="vignette"></div>
  <header><a class="brand" href="./" aria-label="糖豆衝衝首頁"><span class="brand-icon">S<span>★</span></span><span>SUGAR<span class="brand-light">BEAT</span><small>糖豆衝衝</small></span></a><div class="top-right"><span class="local-badge"><i></i> SOLO + AI</span><button class="icon-button" id="sound" aria-label="開啟音效" title="音效">♫ <span>OFF</span></button><button class="icon-button hidden" id="pause" aria-label="暫停遊戲">Ⅱ</button></div></header>
  <main id="lobby"><div class="lobby-copy"><div class="eyebrow"><span></span> 12 位選手 · 3 場冒險 · 1 頂皇冠</div><h1>小糖豆，<br>大<span class="pink-word">暴走<span class="spark">✦</span></span>。</h1><p class="intro">跳過混亂，撲向終點。<br>每一輪，都是全新的糖果障礙賽。</p><form id="start-form"><label for="name">選手名稱 <span>PLAYER NAME</span></label><div class="input-wrap"><span>☺</span><input id="name" maxlength="16" autocomplete="nickname" placeholder="幫你的糖豆取個名字" required value="糖豆新星"><span class="input-status">READY</span></div><button class="play-button" type="submit">出發！開始挑戰 <span>↗</span></button></form><div class="controls-guide"><span><kbd>W</kbd><span class="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>移動</span><span class="control-divider"></span><kbd class="wide">SPACE</kbd><span>跳躍</span><kbd class="wide">SHIFT</kbd><span>前撲</span></div><p class="lobby-note">隨機賽道 · 全員連跑三關 · 無須下載</p></div><div class="hero-label"><span class="player-tag">★ THAT'S YOU!</span><span class="hero-caption">軟萌登場，認真開跑。</span></div><div class="round-preview"><span class="preview-label">YOUR NEXT ADVENTURE <span>每輪重新生成</span></span>${THEMES.map((t,i)=>`<div class="round-card"><span class="round-no">0${i+1}</span><div><strong>${t.name}</strong><small>${['熱身競速','進階挑戰','終極決勝'][i]}</small></div><span class="difficulty">${'▰'.repeat(i+1)}${'▱'.repeat(2-i)}</span></div>`).join('')}</div></main>
  <section id="hud" class="hidden"><div class="race-top"><div class="round-info"><span id="round-label"></span><h2 id="course-name"></h2></div><div class="race-stats"><div><small>即時名次</small><strong id="position">1<em>/12</em></strong></div><div><small>剩餘時間</small><strong id="timer">80<span>s</span></strong></div><div><small>總積分</small><strong id="score">0</strong></div></div></div><div class="race-progress"><div id="progress-fill"></div><span>START</span><span>FINISH ⚑</span></div><div class="leaderboard"><div class="board-title">LIVE RANKING <i></i></div><ol id="live-list"></ol></div><div id="race-hint"></div><div class="bottom-hud"><span><kbd>W A S D</kbd> 移動 <kbd>SPACE</kbd> 跳躍 <kbd>SHIFT</kbd> 前撲 <kbd>ESC</kbd> 暫停</span><div class="dive-status"><span id="dive-label">前撲就緒</span><div><i id="dive-meter"></i></div></div></div><div class="touch-controls"><div class="dpad"><button data-key="KeyW" aria-label="向前">▲</button><button data-key="KeyA" aria-label="向左">◀</button><button data-key="KeyS" aria-label="向後">▼</button><button data-key="KeyD" aria-label="向右">▶</button></div><div class="touch-actions"><button data-key="ShiftLeft">前撲</button><button data-key="Space">跳躍</button></div></div></section>
  <div id="countdown" class="hidden" aria-live="assertive"></div><div id="toast" class="hidden" role="status"></div>
  <section id="results" class="overlay hidden" aria-labelledby="result-title"><div class="results-panel"><div class="eyebrow" id="result-eyebrow"></div><h2 id="result-title"></h2><p id="result-subtitle"></p><div id="podium"></div><div class="table-scroll"><table><thead id="result-head"></thead><tbody id="result-body"></tbody></table></div><div class="result-footer"><span id="score-rule"></span><button class="play-button" id="next">下一關 →</button></div></div></section>
  <section id="pause-panel" class="overlay hidden"><div class="pause-card"><span class="eyebrow">TAKE A BREATHER</span><h2>糖豆休息中</h2><p>計時與 AI 都已暫停。</p><button id="resume" class="play-button">繼續挑戰 →</button><button id="exit" class="secondary-button">離開本輪，回到起點</button></div></section>
  <div id="error" class="overlay hidden"><div class="pause-card"><h2>3D 畫面未能啟動</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後重新整理。</p></div></div>
`;

let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});} catch {$('#error').classList.remove('hidden');throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xbceefe);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
$('#world').append(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xbceefe,50,160);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,250);
scene.add(new THREE.HemisphereLight(0xffffff,0x7181b8,2.6));
const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-18,32,20);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-30,right:30,top:32,bottom:-32,near:1,far:100});sun.shadow.bias=-.0005;scene.add(sun,sun.target);
let courseGroup=new THREE.Group(),beanGroup=new THREE.Group();scene.add(courseGroup,beanGroup);
const materials=new Map();
function mat(color,roughness=.64) {const key=`${color}-${roughness}`;if(!materials.has(key)) materials.set(key,new THREE.MeshStandardMaterial({color,roughness}));return materials.get(key);}
function mesh(geometry,color,parent,x=0,y=0,z=0) {const m=new THREE.Mesh(geometry,mat(color));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(w,h,d,color,parent,x,y,z) {return mesh(new THREE.BoxGeometry(w,h,d),color,parent,x,y,z);}
function sphere(radius,color,parent,x,y,z,sx=1,sy=1,sz=1) {const m=mesh(new THREE.SphereGeometry(radius,20,16),color,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
function bean(color) {
  const g=new THREE.Group(),body=new THREE.Group();g.add(body);
  mesh(new THREE.CapsuleGeometry(.56,.63,6,16),color,body,0,1.08,0);
  const face=sphere(.48,0xfff9ed,body,0,1.26,-.43,1,.9,.37);
  sphere(.07,0x262342,body,-.16,1.29,-.598,.7,1.5,.6);sphere(.07,0x262342,body,.16,1.29,-.598,.7,1.5,.6);
  const left=sphere(.23,color,body,-.69,.87,0,.85,1.65,1),right=sphere(.23,color,body,.69,.87,0,.85,1.65,1);
  left.rotation.z=-.4;right.rotation.z=.4;
  const feet=[sphere(.26,color,body,-.3,.23,-.1,1,.8,1.5),sphere(.26,color,body,.3,.23,-.1,1,.8,1.5)];
  g.userData={body,left,right,feet,face};return g;
}
function clearGroup(g) {g.traverse(o=>{if(o.geometry)o.geometry.dispose();});g.clear();}
let obstacleMeshes=[],racerMeshes=[],course,racers=[],round=0,seed=0,state='lobby',previousState='',elapsed=0,countTime=3.4,simulationTime=0,accumulator=0,finishCount=0,toastTimer=0,lastRespawns=0;
const keys=new Set();let muted=true,audio;
function beep(freq=550,duration=.09) {if(muted)return;try {audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
function toast(text) {$('#toast').textContent=text;$('#toast').classList.remove('hidden');toastTimer=3;}
function buildCourse(c) {
  clearGroup(courseGroup);obstacleMeshes=[];
  const theme=THEMES[c.round];scene.fog.color.setHex(theme.sky);renderer.setClearColor(theme.sky);
  c.platforms.forEach((p,i)=>{
    const length=p.end-p.start,z=-(p.start+p.end)/2;
    box(p.width,.8,length,i%2?theme.color:0xf8f3ff,courseGroup,p.x,-.4,z);
    box(.17,.08,length,0xffffff,courseGroup,p.x-p.width/2+.25,.04,z);box(.17,.08,length,0xffffff,courseGroup,p.x+p.width/2-.25,.04,z);
    for(const side of [-1,1]) {box(.42,.45,length,0xff6eac,courseGroup,p.x+side*(p.width/2+.2),-.37,z);}
    for(let j=0;j<3;j++) {
      const arrow=new THREE.Shape();arrow.moveTo(-.3,.0);arrow.lineTo(0,.45);arrow.lineTo(.3,0);arrow.lineTo(0,.15);arrow.closePath();
      const a=mesh(new THREE.ShapeGeometry(arrow),i%2?0xffffff:theme.color,courseGroup,p.x,.025,-p.start-3-j*.75);a.rotation.x=-Math.PI/2;
    }
    if(i>0){const pole=box(.09,1.1,.09,0xffffff,courseGroup,p.x-p.width/2+.6,.55,-p.start-2);box(.6,.35,.06,0x6654e8,courseGroup,pole.position.x+.28,.94,pole.position.z);}
  });
  c.obstacles.forEach(ob=>{
    const g=new THREE.Group();g.position.set(ob.x,0,-ob.p);courseGroup.add(g);
    if(ob.kind==='sweeper') {
      mesh(new THREE.CylinderGeometry(.48,.65,1.4,20),0xffc34b,g,0,.7,0);
      const pivot=new THREE.Group();g.add(pivot);box(ob.radius*2,.38,.42,0xff508d,pivot,0,.6,0);
      for(const side of [-1,1])sphere(.35,0xffffff,pivot,side*ob.radius,.6,0);
      g.userData.pivot=pivot;
    } else if(ob.kind==='slider') {
      box(ob.radius*2+.8,.035,.2,0x6652ba,g,0,.02,0);
      const moving=new THREE.Group();g.add(moving);box(2.15,2.1,1.2,0x9365e9,moving,0,1.05,0);box(2.2,.32,1.24,0xffe277,moving,0,1.15,0);sphere(.17,0xffffff,moving,-.45,1.65,-.62);sphere(.17,0xffffff,moving,.45,1.65,-.62);g.userData.moving=moving;
    } else {
      for(const side of [-1,1]) {mesh(new THREE.CylinderGeometry(.88,.88,1.4,20),0xff779e,g,side*ob.radius*.65,.7,0);mesh(new THREE.TorusGeometry(.87,.12,8,24),0xffffff,g,side*ob.radius*.65,1.05,0).rotation.x=Math.PI/2;sphere(.88,0xffc94e,g,side*ob.radius*.65,1.4,0,1,.38,1);}
    }
    obstacleMeshes.push({ob,g});
  });
  const finish=c.platforms.at(-1),z=-c.length;
  for(let x=0;x<12;x++)for(let j=0;j<2;j++)box(finish.width/12,.03,.65,(x+j)%2?0x45376d:0xffffff,courseGroup,finish.x-finish.width/2+(x+.5)*finish.width/12,.04,z-j*.65);
  for(const side of [-1,1])box(.5,5,.55,0xff508d,courseGroup,finish.x+side*(finish.width/2-.35),2.5,z);
  box(finish.width,1,.65,0xff508d,courseGroup,finish.x,4.7,z);
  const crown=new THREE.Group();crown.position.set(finish.x,6,z);courseGroup.add(crown);box(2,.65,.6,0xffd459,crown,0,0,0);for(let i=-1;i<=1;i++)mesh(new THREE.ConeGeometry(.42,.9,4),0xffd459,crown,i*.7,.65,0);
  const water=box(230,.4,c.length+200,0x72cee9,courseGroup,0,-10,-c.length/2);water.receiveShadow=false;
  for(let i=0;i<20;i++) {const p=i/20*c.length,x=(i%2?1:-1)*(18+Math.sin(i*4)*6);const cloud=new THREE.Group();cloud.position.set(x,2+Math.sin(i)*6,-p);courseGroup.add(cloud);for(let j=0;j<3;j++){const m=sphere(2.4,0xffffff,cloud,j*2,Math.sin(j)*.8,0,1, .55, .7);m.castShadow=false;}}
}
function buildRacers() {clearGroup(beanGroup);racerMeshes=racers.map(r=>{const g=bean(r.color);beanGroup.add(g);if(r.id===0){const marker=mesh(new THREE.ConeGeometry(.22,.4,4),0xffffff,g,0,2.7,0);marker.rotation.z=Math.PI;g.userData.marker=marker;}return g;});}
function lobbyScene() {
  course=generateCourse(23891,0);buildCourse(course);racers=createRacers('你',23891);resetRacers(racers);buildRacers();
  racers.forEach((r,i)=>{r.x=i===0?0:(i%4-1.5)*2.3;r.p=i===0?0:4+Math.floor(i/4)*3;r.y=0;});
  racerMeshes[0].scale.setScalar(2.4);camera.position.set(15,15,24);camera.lookAt(-3,0,-10);
}
function startRound() {
  course=generateCourse(seed,round);resetRacers(racers);buildCourse(course);buildRacers();elapsed=0;simulationTime=0;accumulator=0;finishCount=0;countTime=3.4;lastRespawns=0;keys.clear();state='countdown';
  $('#lobby').classList.add('hidden');$('#results').classList.add('hidden');$('#hud').classList.remove('hidden');$('#pause').classList.remove('hidden');$('#countdown').classList.remove('hidden');
  $('#round-label').textContent=`ROUND 0${round+1} / 03 · ${THEMES[round].tag}`;$('#course-name').textContent=THEMES[round].name;$('#race-hint').textContent=THEMES[round].hint;
  camera.position.set(0,11,17);camera.lookAt(0,0,-8);updateHUD();
}
function startGame() {const name=$('#name').value.trim()||'糖豆新星';$('#name').value=name;try{localStorage.setItem('sugar-beat-name',name);}catch{}seed=crypto.getRandomValues(new Uint32Array(1))[0];racers=createRacers(name,seed);round=0;startRound();beep();}
function togglePause() {if(state==='race'||state==='countdown') {previousState=state;state='paused';keys.clear();$('#pause-panel').classList.remove('hidden');}else if(state==='paused') {state=previousState;$('#pause-panel').classList.add('hidden');keys.clear();}}
function showResults() {
  state='results';keys.clear();$('#hud').classList.add('hidden');$('#pause').classList.add('hidden');$('#countdown').classList.add('hidden');
  const order=awardRound(racers,round,THEMES[round].time),isFinal=round===2,ranking=isFinal?finalOrder(racers):order,mine=racers[0].results[round];
  $('#results').classList.remove('hidden');$('#result-eyebrow').textContent=isFinal?'THE GRAND FINALE · 最終成績':`ROUND 0${round+1} COMPLETE`;
  $('#result-title').textContent=isFinal?`你的最終排名：第 ${ranking.findIndex(r=>r.id===0)+1} 名`:(mine.finished?`漂亮！第 ${mine.place} 名抵達`:'時間到！準備下一次衝刺');
  $('#result-subtitle').textContent=isFinal?'三關積分已加總。每一場跌倒與衝刺，都算數。':`本關 +${mine.points} 分 · 目前累積 ${racers[0].points} 分 · ${THEMES[round+1].name} 即將登場`;
  $('#podium').replaceChildren();
  if(isFinal) ranking.slice(0,3).forEach((r,i)=>{const d=document.createElement('div');d.className='podium-item';d.innerHTML=`<span>${['♛','②','③'][i]}</span><strong></strong><small>${r.points} 分</small>`;d.querySelector('strong').textContent=r.name;$('#podium').append(d);});
  $('#result-head').innerHTML=isFinal?'<tr><th>排名 / 選手</th><th>第一關</th><th>第二關</th><th>第三關</th><th>總積分</th></tr>':'<tr><th>排名 / 選手</th><th>完賽時間</th><th>本關得分</th><th>累積積分</th></tr>';
  $('#result-body').replaceChildren();ranking.forEach((r,i)=>{
    const tr=document.createElement('tr');if(r.id===0)tr.className='you-row';
    const td=document.createElement('td');const rank=document.createElement('span');rank.className='table-rank';rank.textContent=String(i+1).padStart(2,'0');td.append(rank);const dot=document.createElement('i');dot.className='bean-dot';dot.style.background=`#${r.color.toString(16).padStart(6,'0')}`;td.append(dot,document.createTextNode(r.name+(r.id===0?' · 你':'')));tr.append(td);
    const values=isFinal?[...r.results.map(s=>`${s.points} 分${s.finished?'':'*'}`),`${r.points}`]:[r.finished?`${r.finishTime.toFixed(2)}s`:'未完賽*',`+${r.results[round].points}`,`${r.points}`];
    values.forEach(v=>{const cell=document.createElement('td');cell.textContent=v;tr.append(cell);});$('#result-body').append(tr);
  });
  $('#score-rule').textContent=isFinal?'* 未完賽得分減半。同分時，以三關總用時較短者優先。':`名次基分 120–10 × ${1+round*.5} 倍。未完賽依當前進度排名，得分減半。`;
  $('#next').textContent=isFinal?'再玩一輪 ↻':'前往下一關 →';$('#next').focus();beep(isFinal?880:660,.25);
}
function updateHUD() {
  const order=raceOrder(racers),me=racers[0];$('#position').innerHTML=`${order.findIndex(r=>r.id===0)+1}<em>/12</em>`;$('#timer').innerHTML=`${Math.max(0,Math.ceil(THEMES[round].time-elapsed))}<span>s</span>`;$('#score').textContent=me.points;
  $('#progress-fill').style.width=`${clamp(me.p/course.length*100,0,100)}%`;$('#dive-meter').style.width=`${(1-me.diveCooldown/1.15)*100}%`;$('#dive-label').textContent=me.diveCooldown>0?'前撲恢復中':'前撲就緒';
  $('#live-list').replaceChildren();order.slice(0,5).forEach((r,i)=>{const li=document.createElement('li');li.className=r.id===0?'is-you':'';const n=document.createElement('span');n.textContent=`${i+1}  ${r.name}`;const p=document.createElement('b');p.textContent=r.finished?'⚑':`${Math.round(clamp(r.p/course.length*100,0,100))}%`;li.append(n,p);$('#live-list').append(li);});
}
function tick(dt) {
  simulationTime+=dt;
  if(state==='countdown') {const old=Math.ceil(countTime);countTime-=dt;$('#countdown').textContent=countTime>.4?Math.ceil(countTime-.4):'GO!';if(Math.ceil(countTime)!==old)beep(400+(4-Math.ceil(countTime))*120);if(countTime<=0){state='race';$('#countdown').classList.add('hidden');}return;}
  if(state!=='race')return;
  elapsed+=dt;
  for(const r of racers) {
    const input=r.id===0?{x:Number(keys.has('KeyD'))-Number(keys.has('KeyA')),forward:Number(keys.has('KeyW'))-Number(keys.has('KeyS')),jump:keys.has('Space'),dive:keys.has('ShiftLeft')||keys.has('ShiftRight')}:botInput(r,course,simulationTime);
    const wasGround=r.ground;stepRacer(r,input,course,simulationTime,dt);if(r.id===0&&wasGround&&!r.ground&&input.jump)beep(490,.06);
  }
  const previousImpact=racers[0].impact;
  resolveRacerCollisions(racers);
  if(previousImpact<=0&&racers[0].impact>0)beep(240,.07);
  for(const r of racers) {
    if(!r.finished&&r.p>=course.length&&r.y>=-.1&&platformAtFinish(r)) {r.finished=true;r.finishTime=elapsed;r.place=++finishCount;if(r.id===0){toast(`第 ${r.place} 名完賽！等待其他選手抵達…`);beep(880,.2);}}
  }
  if(racers[0].respawns>lastRespawns){lastRespawns=racers[0].respawns;toast('噗通！已回到最近的檢查點');beep(180,.16);}
  if(finishCount===racers.length||elapsed>=THEMES[round].time)showResults();
}
function platformAtFinish(r) {const p=course.platforms.at(-1);return Math.abs(r.x-p.x)<p.width/2;}
let last=performance.now(),hudTime=0;
function animate(now) {
  requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.08);last=now;
  if(state!=='paused') {
    if(state==='race'||state==='countdown'){accumulator+=dt;while(accumulator>=1/60){tick(1/60);accumulator-=1/60;}}
    else simulationTime+=dt;
    obstacleMeshes.forEach(({ob,g})=>{const pose=obstaclePose(ob,simulationTime);if(g.userData.pivot)g.userData.pivot.rotation.y=pose.angle;if(g.userData.moving)g.userData.moving.position.x=pose.x-ob.x;});
    racerMeshes.forEach((g,i)=>{
      const r=racers[i],data=g.userData,run=state==='lobby'?0:Math.hypot(r.vx,r.vp),bob=r.ground?Math.sin(now*.014+i)*Math.min(run*.007,.065):0;
      g.position.set(r.x,r.y+bob,-r.p);
      if(state==='lobby'){g.rotation.y=Math.PI-.35;data.body.rotation.z=Math.sin(now*.0018+i)*.07;g.position.y+=Math.sin(now*.002+i)*.1;}
      else {if(run>.2&&!r.finished)g.rotation.y=THREE.MathUtils.lerp(g.rotation.y,Math.atan2(-r.vx,r.vp),.18);data.body.rotation.x=r.dive>0?-1.2:0;data.body.rotation.z=r.stun>0?Math.sin(now*.04)*.3:r.impact>0?Math.sin(now*.045)*.2:0;}
      data.feet.forEach((f,j)=>f.position.z=-.1+Math.sin(now*.018+j*Math.PI)*Math.min(run*.035,.26));data.left.rotation.x=Math.sin(now*.017)*run*.055;data.right.rotation.x=-data.left.rotation.x;
      if(data.marker)data.marker.position.y=2.65+Math.sin(now*.004)*.13;
    });
    if(state==='race'||state==='countdown'||state==='results') {const me=racers[0],cp=clamp(me.p,-5,course.length),target=new THREE.Vector3(me.x*.6,Math.max(0,me.y)*.35+10.5,-cp+15);camera.position.lerp(target,1-Math.exp(-dt*5));camera.lookAt(me.x*.55,1,-cp-9);sun.position.set(me.x-15,30,-cp+14);sun.target.position.set(me.x,0,-cp-8);}
    else if(state==='lobby'){camera.position.set(innerWidth<760?18:15,14.5,24);camera.lookAt(innerWidth<760?-1:-6,1,-5);}
  }
  if(toastTimer>0&&state!=='paused'){toastTimer-=dt;if(toastTimer<=0)$('#toast').classList.add('hidden');}
  hudTime+=dt;if(hudTime>.12&&(state==='race'||state==='countdown')){updateHUD();hudTime=0;}
  renderer.render(scene,camera);
}
$('#start-form').addEventListener('submit',e=>{e.preventDefault();startGame();});
$('#next').onclick=()=>{if(round===2){startGame();}else{round++;startRound();}};
$('#pause').onclick=togglePause;$('#resume').onclick=togglePause;
$('#exit').onclick=()=>{state='lobby';keys.clear();$('#pause-panel').classList.add('hidden');$('#hud').classList.add('hidden');$('#countdown').classList.add('hidden');$('#pause').classList.add('hidden');$('#lobby').classList.remove('hidden');lobbyScene();};
$('#sound').onclick=()=>{muted=!muted;$('#sound span').textContent=muted?'OFF':'ON';$('#sound').setAttribute('aria-label',muted?'開啟音效':'關閉音效');beep();};
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(['Space','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight','Escape'].includes(e.code)){e.preventDefault();if(e.code==='Escape'&&!e.repeat)togglePause();else keys.add(e.code);}});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{keys.clear();if(state==='race'||state==='countdown')togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='race'||state==='countdown'))togglePause();});
document.querySelectorAll('[data-key]').forEach(button=>{button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);keys.add(button.dataset.key);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>keys.delete(button.dataset.key));});
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
try {const name=localStorage.getItem('sugar-beat-name');if(name)$('#name').value=name;}catch{}
lobbyScene();requestAnimationFrame(animate);

// Development-only bridge: exercise the real state machine without waiting five minutes.
// Vite removes this block completely from production builds.
if(import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
  window.__gameTest={
    snapshot:()=>({state,round,seed,elapsed,courseLength:course.length,player:{...racers[0]},racers:racers.map(r=>({id:r.id,points:r.points,results:r.results}))}),
    advance:(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++){if(state==='race'||state==='countdown')tick(1/60);}updateHUD();},
  };
}
