import * as THREE from 'three';
import './style.css';
import './mobile.css';
import {createTouchControls} from './touch-controls.js';
import { THEMES, COLORS, TERRAIN_NAMES, GRAB, MAP_CATALOG, selectMapIds, generateCourse, platformX, createRacers, resetRacers, botInput, obstaclePose, stepGrabs, stepRacer, resolveRacerCollisions, raceOrder, awardRound, finalOrder, clamp } from './game.js';
import {ATTACKS,createMonsterDirector,beginMonsterEvent,eventPhase,insideMonsterAttack,stepMonsterEvents,advanceStatuses,effectiveInput} from './monster.js';
import {MonsterView,addStatusVisuals,updateStatusVisuals} from './monster-view.js';
import {coverBoxes,isSheltered,shelterSpots,resetTerrainCollisionHistory} from './cover.js';

const $=s=>document.querySelector(s);
const coarsePointer=matchMedia('(any-pointer: coarse)');
const useTouchLayout=()=>coarsePointer.matches||innerWidth<=760;
document.body.classList.toggle('touch-mode',useTouchLayout());
$('#app').innerHTML=`
  <div id="world" aria-label="3D 糖豆競速場"></div><div class="vignette"></div>
  <header><a class="brand" href="./" aria-label="糖豆衝衝首頁"><span class="brand-icon">S<span>★</span></span><span>SUGAR<span class="brand-light">BEAT</span><small>糖豆衝衝</small></span></a><div class="top-right"><span class="local-badge"><i></i> SOLO + AI</span><button class="icon-button" id="sound" aria-label="開啟音效" title="音效">♫ <span>OFF</span></button><button class="icon-button hidden" id="pause" aria-label="暫停遊戲">Ⅱ</button></div></header>
  <main id="lobby"><div class="lobby-copy"><div class="eyebrow"><span></span> 36 張極難地圖 · 12 位選手 · 怪獸亂入</div><h1>小糖豆，<br>大<span class="pink-word">暴走<span class="spark">✦</span></span>。</h1><p class="intro">推他一下，拉他一把。<br>躲進威化牆背面，別被拉去餵怪獸。</p><form id="start-form"><label for="name">選手名稱 <span>PLAYER NAME</span></label><div class="input-wrap"><span>☺</span><input id="name" maxlength="16" autocomplete="nickname" placeholder="幫你的糖豆取個名字" required value="糖豆新星"><span class="input-status">READY</span></div><button class="play-button" type="submit">出發！開始挑戰 <span>↗</span></button></form><div class="controls-guide"><span><kbd>W</kbd><span class="key-row"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span>移動</span><span class="control-divider"></span><kbd class="wide">SPACE</kbd><span>跳躍</span><kbd class="wide">SHIFT</kbd><span>前撲</span><kbd>E</kbd><span>抓拉</span></div><p class="lobby-note">左右 Shift 都可前撲／掙脫 · 按住 E + 方向鍵拉人</p><div class="mobile-guide"><span>◉ 左手搖桿移動</span><span>↑ 右手跳躍／前撲／抓拉</span><small>可以同時操作 · 按住抓拉＋搖桿拖人<br>橫放手機，賽道看得更清楚</small></div></div><div class="hero-label"><span class="player-tag">★ THAT'S YOU!</span><span class="hero-caption">軟萌登場，認真開跑。</span></div><div class="round-preview"><span class="preview-label">MONSTER MAYHEM <span>36 張隨機抽 3 張</span></span>${THEMES.map((t,i)=>`<div class="round-card"><span class="round-no">0${i+1}</span><div><strong>${t.name}</strong><small>${['極難起跑','怪獸追擊','地獄決勝'][i]}</small></div><span class="difficulty">${'▰'.repeat(i+1)}${'▱'.repeat(2-i)}</span></div>`).join('')}</div></main>
  <section id="hud" class="hidden"><div class="race-top"><div class="round-info"><span id="round-label"></span><h2 id="course-name"></h2></div><div class="race-stats"><div><small>即時名次</small><strong id="position">1<em>/12</em></strong></div><div><small>剩餘時間</small><strong id="timer">80<span>s</span></strong></div><div><small>總積分</small><strong id="score">0</strong></div></div></div><div class="race-progress"><div id="progress-fill"></div><span>START</span><span>FINISH ⚑</span></div><div class="leaderboard"><div class="board-title">LIVE RANKING <i></i></div><ol id="live-list"></ol></div><div id="race-hint"></div><div id="monster-warning" class="hidden" role="status"><strong></strong><span></span></div><div id="status-panel" class="hidden" role="status"><strong id="status-list"></strong><span id="reverse-keys" class="hidden">W ⇄ S · A ⇄ D<br>SPACE ⇄ SHIFT · E 變推開</span></div><div class="bottom-hud"><span><kbd>W A S D</kbd> 移動 <kbd>SPACE</kbd> 跳躍 <kbd>左右 SHIFT</kbd> 前撲 / 掙脫 <kbd>E</kbd> 抓拉 <kbd>ESC</kbd> 暫停</span><div class="ability-meters"><div class="dive-status" id="grab-status"><span id="grab-label">E 抓拉就緒</span><div><i id="grab-meter"></i></div></div><div class="dive-status"><span id="dive-label">前撲就緒</span><div><i id="dive-meter"></i></div></div></div></div><div class="touch-controls" aria-label="手機遊戲控制"><div class="stick-wrap"><div id="touch-stick" role="group" aria-label="移動搖桿，向任意方向拖曳"><span class="stick-arrow north">▲</span><span class="stick-arrow south">▼</span><span class="stick-arrow west">◀</span><span class="stick-arrow east">▶</span><span class="stick-thumb"></span></div><small>拖動移動</small></div><div class="touch-actions"><button data-key="KeyE" aria-label="按住抓拉"><b>✋</b><span data-label>抓拉</span><small data-note>按住拖人</small><span class="touch-meter"><i></i></span></button><button data-key="ShiftLeft" aria-label="前撲或掙脫"><b>↗</b><span data-label>前撲</span><small data-note>也能掙脫</small><span class="touch-meter"><i></i></span></button><button data-key="Space" aria-label="跳躍"><b>↑</b><span data-label>跳躍</span><small data-note>放開再跳</small></button></div></div></section>
  <div id="countdown" class="hidden" aria-live="assertive"></div><div id="toast" class="hidden" role="status"></div>
  <section id="results" class="overlay hidden" aria-labelledby="result-title"><div class="results-panel"><div class="eyebrow" id="result-eyebrow"></div><h2 id="result-title"></h2><p id="result-subtitle"></p><div id="podium"></div><div class="table-scroll"><table><thead id="result-head"></thead><tbody id="result-body"></tbody></table></div><div class="result-footer"><span id="score-rule"></span><button class="play-button" id="next">下一關 →</button></div></div></section>
  <section id="pause-panel" class="overlay hidden"><div class="pause-card"><span class="eyebrow">TAKE A BREATHER</span><h2>糖豆休息中</h2><p>計時與 AI 都已暫停。</p><button id="resume" class="play-button">繼續挑戰 →</button><button id="exit" class="secondary-button">離開本輪，回到起點</button></div></section>
  <div id="error" class="overlay hidden"><div class="pause-card"><h2>3D 畫面未能啟動</h2><p>請使用支援 WebGL 的瀏覽器，並開啟硬體加速後重新整理。</p></div></div>
`;

let renderer;
try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});} catch {$('#error').classList.remove('hidden');throw new Error('WebGL unavailable');}
renderer.setPixelRatio(Math.min(devicePixelRatio,coarsePointer.matches?1.3:1.8));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;renderer.setClearColor(0xbceefe);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
$('#world').append(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.Fog(0xbceefe,50,160);
const monsterView=new MonsterView(scene);
const camera=new THREE.PerspectiveCamera(48,innerWidth/innerHeight,.1,250);
scene.add(new THREE.HemisphereLight(0xffffff,0x7181b8,2.6));
const sun=new THREE.DirectionalLight(0xffffff,3.2);sun.position.set(-18,32,20);sun.castShadow=true;sun.shadow.mapSize.set(coarsePointer.matches?1024:2048,coarsePointer.matches?1024:2048);Object.assign(sun.shadow.camera,{left:-30,right:30,top:32,bottom:-32,near:1,far:100});sun.shadow.bias=-.0005;scene.add(sun,sun.target);
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
  const coloredMeshes=[];body.traverse(m=>{if(m.isMesh&&m.material.color.getHex()===color){m.userData.cleanMaterial=m.material;coloredMeshes.push(m);}});
  g.userData={body,left,right,feet,face,coloredMeshes};addStatusVisuals(g);return g;
}
function clearGroup(g) {g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.userData.status){const {ice,halo,smoke}=o.userData.status;ice.material.dispose();halo.material.dispose();smoke.children.forEach(m=>m.material.dispose());}});g.clear();}
let obstacleMeshes=[],platformMeshes=[],racerMeshes=[],grabLines=[],course,racers=[],round=0,seed=0,state='lobby',previousState='',elapsed=0,countTime=3.4,simulationTime=0,accumulator=0,finishCount=0,toastTimer=0,lastRespawns=0,director=null;
const keys=new Set();let muted=true,audio;
const touchControls=createTouchControls({stick:$('#touch-stick'),buttons:document.querySelectorAll('.touch-actions [data-key]'),isEnabled:()=>state==='race'||state==='countdown'});
function clearInputs(){keys.clear();touchControls.reset();}
function readPlayerInput(){
  if(state!=='race'&&state!=='countdown')return {x:0,forward:0,jump:false,dive:false,grab:false};
  const touch=touchControls.read();
  return {x:clamp(touch.x+Number(keys.has('KeyD'))-Number(keys.has('KeyA')),-1,1),forward:clamp(touch.forward+Number(keys.has('KeyW'))-Number(keys.has('KeyS')),-1,1),jump:touch.jump||keys.has('Space'),dive:touch.dive||keys.has('ShiftLeft')||keys.has('ShiftRight'),grab:touch.grab||keys.has('KeyE')};
}
function beep(freq=550,duration=.09) {if(muted)return;try {audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const osc=audio.createOscillator(),gain=audio.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(.07,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);osc.connect(gain);gain.connect(audio.destination);osc.start();osc.stop(audio.currentTime+duration);}catch{}}
function toast(text) {$('#toast').textContent=useTouchLayout()?text.replaceAll('按 Shift','點「前撲」').replaceAll('按住 E + 方向鍵','按住「抓拉」＋拖動搖桿'):text;$('#toast').classList.remove('hidden');toastTimer=3;}
function buildCourse(c) {
  clearGroup(courseGroup);obstacleMeshes=[];platformMeshes=[];
  const theme=THEMES[c.round];scene.fog.color.setHex(theme.sky);renderer.setClearColor(theme.sky);
  c.platforms.forEach((p,i)=>{
    const length=p.end-p.start,z=-(p.start+p.end)/2,g=new THREE.Group();courseGroup.add(g);platformMeshes.push({p,g});
    const surface={ice:0x91e6ff,conveyor:0x44416b,bridge:0xffbe60,split:0xc598f8,moving:0x45d8b7}[p.kind]??(i%2?theme.color:0xf8f3ff);
    if(p.kind==='split') {
      box(p.width,.8,5,surface,g,p.x,-.4,-p.start-2.5);box(p.width,.8,3,surface,g,p.x,-.4,-p.end+1.5);
      const laneWidth=p.width/2-1.2;
      for(const side of [-1,1]){box(laneWidth,.8,length-8,surface,g,p.x+side*(1.2+laneWidth/2),-.4,z-1);box(.14,.1,length-8,0xffde68,g,p.x+side*1.25,.03,z-1);}
    }else box(p.width,.8,length,surface,g,p.x,-.4,z);
    box(.17,.08,length,0xffffff,g,p.x-p.width/2+.25,.04,z);box(.17,.08,length,0xffffff,g,p.x+p.width/2-.25,.04,z);
    for(const side of [-1,1]) {box(.42,.45,length,0xff6eac,g,p.x+side*(p.width/2+.2),-.37,z);}
    if(p.kind==='conveyor') {
      const stripes=new THREE.Group();g.add(stripes);g.userData.stripes=stripes;
      for(let j=1;j<length-1;j+=1.25){box(p.width-.6,.04,.12,0xfed467,stripes,p.x,.04,-p.start-j);}
      for(const side of [-1,1])for(let j=2;j<length;j+=4)mesh(new THREE.CylinderGeometry(.25,.25,.3,10),0x9b91b5,g,p.x+side*p.width/2,-.15,-p.start-j).rotation.z=Math.PI/2;
    }
    if(p.kind==='ice')for(let j=0;j<5;j++){const streak=box(.06,.02,2.5,0xe8fbff,g,p.x+(j%3-1)*2,.04,-p.start-4-j*2.5);streak.rotation.y=.45;}
    if(p.kind==='bridge')for(let j=1;j<length;j+=1.5)box(p.width-.3,.03,.09,0xf49c53,g,p.x,.025,-p.start-j);
    if(p.kind==='moving') {box(p.width+3,.18,.22,0x857fb3,courseGroup,p.x,-1.2,z);for(const side of [-1,1])sphere(.4,0xffcf61,g,p.x+side*(p.width/2-.6),.45,z);}
    for(let j=0;j<3;j++) {
      const arrow=new THREE.Shape();arrow.moveTo(-.3,.0);arrow.lineTo(0,.45);arrow.lineTo(.3,0);arrow.lineTo(0,.15);arrow.closePath();
      const a=mesh(new THREE.ShapeGeometry(arrow),i%2?0xffffff:theme.color,g,p.x,.06,-p.start-3-j*.75);a.rotation.x=-Math.PI/2;
    }
    if(i>0&&p.kind!=='moving'){const pole=box(.09,1.1,.09,0xffffff,g,p.x-p.width/2+.6,.55,-p.start-2);box(.6,.35,.06,0x6654e8,g,pole.position.x+.28,.94,pole.position.z);}
    for(const cover of c.covers.filter(cover=>cover.platformIndex===i)){
      const wall=new THREE.Group();wall.position.set(p.x+cover.xOffset,0,-cover.p);g.add(wall);
      box(cover.width,cover.height,cover.depth,0xd79748,wall,0,cover.height/2,0);
      box(cover.width,.18,cover.depth,0x2cbe97,wall,0,cover.height-.09,0);
      for(const side of [-1,1])for(let row=0;row<3;row++)for(let col=0;col<2;col++)box(.4,.68,.025,0xffd387,wall,(col-.5)*.53,.5+row*.85,side*(cover.depth/2+.012));
      // Waffle panels and shield emblems identify the solid terrain that blocks breath.
      for(const side of [-1,1]){
        for(let row=0;row<3;row++)for(let col=0;col<2;col++)box(.025,.68,.72,0xffd387,wall,side*(cover.width/2+.012),.5+row*.85,(col-.5)*.94);
        const shield=new THREE.Shape();shield.moveTo(-.32,.3);shield.lineTo(.32,.3);shield.lineTo(.3,-.15);shield.lineTo(0,-.42);shield.lineTo(-.3,-.15);shield.closePath();
        const emblem=mesh(new THREE.ShapeGeometry(shield),0x087e69,wall,side*(cover.width/2+.035),2.55,0);emblem.rotation.y=side*Math.PI/2;
      }
    }
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
    } else if(ob.kind==='piston') {
      box(2.4,.12,2,0xffd661,g,ob.offset,.06,0);
      const piston=box(1.8,1,1.5,0xff568e,g,ob.offset,.5,0);g.userData.piston=piston;
      box(2.5,.08,.14,0x403354,g,ob.offset,.14,-1);box(2.5,.08,.14,0x403354,g,ob.offset,.14,1);
    } else if(ob.kind==='hammer') {
      for(const side of [-1,1])box(.2,5.8,.2,0x7266a0,g,side*(ob.radius+.6),2.9,0);
      box(ob.radius*2+1.5,.25,.25,0x7266a0,g,0,5.8,0);
      const head=sphere(.96,0xff705f,g,0,1,0,1,1,1.1);g.userData.head=head;
      const rod=mesh(new THREE.CylinderGeometry(.1,.1,1,10),0xffd464,g,0,3.5,0);g.userData.rod=rod;
    } else if(ob.kind==='fan') {
      const side=-ob.direction,x=side*(ob.radius+1.1),fan=new THREE.Group();fan.position.set(x,1.5,0);g.add(fan);fan.rotation.y=Math.PI/2;
      mesh(new THREE.TorusGeometry(1,.16,10,24),0x7b64b5,fan);
      const blades=new THREE.Group();fan.add(blades);box(1.8,.22,.12,0xfdd271,blades,0,0,0);box(.22,1.8,.12,0xfdd271,blades,0,0,0);g.userData.blades=blades;
      box(.25,1.7,.25,0x7b64b5,g,x,.7,0);
      const gusts=new THREE.Group();g.add(gusts);g.userData.gusts=gusts;
      for(let j=0;j<6;j++)box(.9,.035,.06,0xffffff,gusts,-ob.radius+j*ob.radius/3,.4+j%2,-2+j*.7);
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
function buildRacers() {clearGroup(beanGroup);grabLines=racers.map(()=>{const line=mesh(new THREE.CylinderGeometry(.045,.045,1,8),0xffd24f,beanGroup);line.visible=false;return line;});racerMeshes=racers.map(r=>{const g=bean(r.color);beanGroup.add(g);if(r.id===0){const marker=mesh(new THREE.ConeGeometry(.22,.4,4),0xffffff,g,0,2.7,0);marker.rotation.z=Math.PI;g.userData.marker=marker;}return g;});}
function lobbyScene() {
  course=generateCourse(23891,0);buildCourse(course);racers=createRacers('你',23891);resetRacers(racers);buildRacers();
  racers.forEach((r,i)=>{r.x=i===0?0:(i%4-1.5)*2.3;r.p=i===0?0:4+Math.floor(i/4)*3;r.y=0;});
  racerMeshes[0].scale.setScalar(2.4);camera.position.set(15,15,24);camera.lookAt(-3,0,-10);
}
function startRound() {
  course=generateCourse(seed,round);resetRacers(racers);buildCourse(course);buildRacers();elapsed=0;simulationTime=0;accumulator=0;finishCount=0;countTime=3.4;lastRespawns=0;clearInputs();state='countdown';
  director=createMonsterDirector(seed^course.map.id,round);director.nextAt+=countTime;
  $('#lobby').classList.add('hidden');$('#results').classList.add('hidden');$('#hud').classList.remove('hidden');$('#pause').classList.remove('hidden');$('#countdown').classList.remove('hidden');
  $('#round-label').textContent=`ROUND 0${round+1} / 03 · MAP ${String(course.map.id).padStart(2,'0')} / 36 · 極難`;$('#course-name').textContent=course.map.name;$('#race-hint').textContent=THEMES[round].hint;
  camera.position.set(0,11,17);camera.lookAt(0,0,-8);updateHUD();
}
function startGame() {$('#name').blur();const name=$('#name').value.trim()||'糖豆新星';$('#name').value=name;try{localStorage.setItem('sugar-beat-name',name);}catch{}seed=crypto.getRandomValues(new Uint32Array(1))[0];racers=createRacers(name,seed);round=0;startRound();beep();}
function togglePause() {if(state==='race'||state==='countdown') {previousState=state;state='paused';clearInputs();$('#pause-panel').classList.remove('hidden');}else if(state==='paused') {state=previousState;$('#pause-panel').classList.add('hidden');clearInputs();}}
function showResults() {
  state='results';clearInputs();$('#hud').classList.add('hidden');$('#pause').classList.add('hidden');$('#countdown').classList.add('hidden');
  const order=awardRound(racers,round,THEMES[round].time),isFinal=round===2,ranking=isFinal?finalOrder(racers):order,mine=racers[0].results[round];
  $('#results').classList.remove('hidden');$('#result-eyebrow').textContent=isFinal?'THE GRAND FINALE · 最終成績':`ROUND 0${round+1} COMPLETE`;
  $('#result-title').textContent=isFinal?`你的最終排名：第 ${ranking.findIndex(r=>r.id===0)+1} 名`:(mine.finished?`漂亮！第 ${mine.place} 名抵達`:'時間到！準備下一次衝刺');
  $('#result-subtitle').textContent=isFinal?'三關積分已加總。每一場跌倒與衝刺，都算數。':`本關 +${mine.points} 分 · 累積 ${racers[0].points} 分 · 下一張：${MAP_CATALOG.find(m=>m.id===selectMapIds(seed)[round+1]).name}`;
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
  $('#grab-meter').style.width=`${(me.grabTarget!==null?1-me.grabTime/GRAB.duration:1-me.grabCooldown/GRAB.cooldown)*100}%`;
  $('#grab-label').textContent=me.grabbedBy!==null?'被抓住！Shift 掙脫':me.grabTarget!==null?'抓到了！移動拉走他':me.grabCooldown>0?`抓拉冷卻 ${me.grabCooldown.toFixed(1)}s`:'E 抓拉就緒';
  $('#grab-status').classList.toggle('caught',me.grabbedBy!==null);
  const segment=course.platforms.find(p=>me.p>=p.start&&me.p<=p.end);
  $('#race-hint').textContent=me.grabbedBy!==null?'被對手抓住！按 Shift 前撲掙脫':segment&&segment.kind!=='plain'?TERRAIN_NAMES[segment.kind]:THEMES[round].hint;
  const event=director?.event,phase=eventPhase(event,simulationTime),warn=$('#monster-warning');
  warn.classList.toggle('hidden',phase==='idle'||phase==='retreat');
  const sheltered=(phase==='warning'||phase==='attack')&&insideMonsterAttack(event,me)&&isSheltered(event,me,coverBoxes(course,simulationTime));
  warn.classList.toggle('sheltered',!!sheltered);
  if(phase==='warning'||phase==='attack'){
    warn.dataset.type=event.type;warn.querySelector('strong').textContent=sheltered?'✓ 掩體保護中 · 小心被拉出去':`${phase==='warning'?'怪物現身':'正在攻擊'} · ${ATTACKS[event.type].name}`;
    warn.querySelector('span').textContent=sheltered?'威化牆已擋住攻擊 · 留在綠色區域、別跳起露身':phase==='warning'?`${ATTACKS[event.type].warning} · ${Math.max(0,event.attackAt-simulationTime).toFixed(1)}s`:'躲到威化牆背面的綠色區域，或離開攻擊範圍！';
  }
  const statuses=[];
  if(me.charred>0)statuses.push(`燒焦 ${me.charred.toFixed(1)}s${me.burning>0?' · 移動減速':''}`);
  if(me.soaked>0)statuses.push(`水砲衝擊 ${me.soaked.toFixed(1)}s`);
  if(me.frozen>0)statuses.push(`冰凍 ${me.frozen.toFixed(1)}s · 無法操作`);
  if(me.paralyzed>0)statuses.push(`麻痺 ${me.paralyzed.toFixed(1)}s`);
  if(me.reversed>0)statuses.push(`操作反轉 ${me.reversed.toFixed(1)}s`);
  $('#status-panel').classList.toggle('hidden',!statuses.length);$('#status-list').textContent=statuses.join(' / ');$('#reverse-keys').classList.toggle('hidden',me.reversed<=0);
  if(me.reversed>0){$('#grab-label').textContent=me.grabCooldown>0?'反轉推開 · 冷卻中':'E 現在是推開';$('#dive-label').textContent='SPACE 後撲 / SHIFT 跳';}
  if(useTouchLayout()){
    $('#race-hint').textContent=$('#race-hint').textContent.replaceAll('按 Shift','點「前撲」').replaceAll('按住 E','按住「抓拉」');
    $('#reverse-keys').innerHTML='搖桿方向相反<br>跳躍 ⇄ 前撲 · 抓拉變推開';
  }else $('#reverse-keys').innerHTML='W ⇄ S · A ⇄ D<br>SPACE ⇄ SHIFT · E 變推開';
  const reversed=me.reversed>0,locked=me.frozen>0||me.paralyzed>0;
  const touchLabels={KeyE:[reversed?'推開':'抓拉',me.grabTarget!==null?'拉走他！':me.grabCooldown>0?`${me.grabCooldown.toFixed(1)}s 冷卻`:reversed?'點一下推開':'按住拖人'],ShiftLeft:[reversed?'跳躍':'前撲',reversed?'放開再跳':me.diveCooldown>0?`${me.diveCooldown.toFixed(1)}s 冷卻`:me.grabbedBy!==null?'點我掙脫':'也能掙脫'],Space:[reversed?'後撲':'跳躍',reversed?me.diveCooldown>0?`${me.diveCooldown.toFixed(1)}s 冷卻`:'反向撲出去':'放開再跳']};
  for(const button of document.querySelectorAll('.touch-actions [data-key]')){
    const [label,note]=touchLabels[button.dataset.key];button.querySelector('[data-label]').textContent=label;button.querySelector('[data-note]').textContent=locked?'暫時無法操作':note;button.classList.toggle('locked',locked);button.setAttribute('aria-label',label==='抓拉'?'按住抓拉':label==='前撲'?'前撲或掙脫':label);
    const meter=button.querySelector('.touch-meter i');if(meter)meter.style.width=button.dataset.key==='KeyE'?$('#grab-meter').style.width:reversed?'100%':$('#dive-meter').style.width;
  }
  $('#live-list').replaceChildren();order.slice(0,5).forEach((r,i)=>{const li=document.createElement('li');li.className=r.id===0?'is-you':'';const n=document.createElement('span');n.textContent=`${i+1}  ${r.name}`;const p=document.createElement('b');p.textContent=r.finished?'⚑':`${Math.round(clamp(r.p/course.length*100,0,100))}%`;li.append(n,p);$('#live-list').append(li);});
}
function tick(dt) {
  simulationTime+=dt;
  if(state==='countdown') {const old=Math.ceil(countTime);countTime-=dt;$('#countdown').textContent=countTime>.4?Math.ceil(countTime-.4):'GO!';if(Math.ceil(countTime)!==old)beep(400+(4-Math.ceil(countTime))*120);if(countTime<=0){state='race';$('#countdown').classList.add('hidden');}return;}
  if(state!=='race')return;
  elapsed+=dt;
  for(const r of racers)advanceStatuses(r,dt);
  const previousHits=racers[0].monsterHits;
  stepMonsterEvents(director,course,racers,simulationTime,dt);
  if(racers[0].monsterHits>previousHits)beep(racers[0].lastMonsterHit==='lightning'?110:200,.22);
  const inputs=new Map(racers.map(r=>[r.id,effectiveInput(r,r.id===0?readPlayerInput():botInput(r,course,simulationTime,racers,director.event))]));
  const wasGrabbed=racers[0].grabbedBy,previousGrabs=racers[0].grabs;
  stepGrabs(racers,inputs,dt);
  if(racers[0].grabbedBy!==null&&wasGrabbed===null){toast('喂！有人拉你！按 Shift 掙脫');beep(180,.15);}
  if(racers[0].grabs>previousGrabs){toast('抓到了！按住 E + 方向鍵拖走對手');beep(650,.1);}
  for(const r of racers) {
    const input=inputs.get(r.id);
    const wasGround=r.ground;stepRacer(r,input,course,simulationTime,dt);if(r.id===0&&wasGround&&!r.ground&&input.jump)beep(490,.06);
  }
  const previousImpact=racers[0].impact;
  resolveRacerCollisions(racers,course,simulationTime);
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
    monsterView.update(director?.event,simulationTime,state==='race',course);
    platformMeshes.forEach(({p,g})=>{g.position.x=platformX(p,simulationTime)-p.x;if(g.userData.stripes)g.userData.stripes.position.z=(simulationTime*-p.beltP)%1.25;});
    obstacleMeshes.forEach(({ob,g})=>{
      const pose=obstaclePose(ob,simulationTime),data=g.userData;
      if(data.pivot)data.pivot.rotation.y=pose.angle;if(data.moving)data.moving.position.x=pose.x-ob.x;
      if(data.piston){data.piston.scale.y=pose.height;data.piston.position.y=pose.height/2;}
      if(data.head){data.head.position.set(pose.x-ob.x,pose.y,0);const top=new THREE.Vector3(0,5.8,0),vector=data.head.position.clone().sub(top);data.rod.position.copy(top.add(data.head.position).multiplyScalar(.5));data.rod.scale.y=vector.length();data.rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vector.normalize());}
      if(data.blades)data.blades.rotation.z=simulationTime*15;if(data.gusts)data.gusts.position.x=pose.wind*((simulationTime*5)%1.8);
    });
    racerMeshes.forEach((g,i)=>{
      const r=racers[i],data=g.userData,run=state==='lobby'?0:Math.hypot(r.vx,r.vp),bob=r.ground?Math.sin(now*.014+i)*Math.min(run*.007,.065):0;
      g.position.set(r.x,r.y+bob,-r.p);
      if(state==='lobby'){g.rotation.y=Math.PI-.35;data.body.rotation.z=Math.sin(now*.0018+i)*.07;g.position.y+=Math.sin(now*.002+i)*.1;}
      else {if(run>.2&&!r.finished)g.rotation.y=THREE.MathUtils.lerp(g.rotation.y,Math.atan2(-r.vx,r.vp),.18);data.body.rotation.x=r.dive>0?-1.2:0;data.body.rotation.z=r.paralyzed>0?Math.sin(now*.12)*.22:r.stun>0?Math.sin(now*.04)*.3:r.impact>0?Math.sin(now*.045)*.2:0;}
      updateStatusVisuals(g,r,simulationTime,mat(0x332d36));
      data.feet.forEach((f,j)=>f.position.z=-.1+Math.sin(now*.018+j*Math.PI)*Math.min(run*.035,.26));data.left.rotation.x=r.grabTarget!==null?-1.35:Math.sin(now*.017)*run*.055;data.right.rotation.x=r.grabTarget!==null?-1.35:-data.left.rotation.x;
      const victim=r.grabTarget!==null?racers.find(v=>v.id===r.grabTarget):null,line=grabLines[i];line.visible=!!victim&&state==='race';
      if(victim){const start=new THREE.Vector3(r.x,r.y+2.15,-r.p),end=new THREE.Vector3(victim.x,victim.y+2.15,-victim.p),delta=end.clone().sub(start);line.position.copy(start.add(end).multiplyScalar(.5));line.scale.y=delta.length();line.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());}
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
$('#exit').onclick=()=>{state='lobby';clearInputs();$('#pause-panel').classList.add('hidden');$('#hud').classList.add('hidden');$('#countdown').classList.add('hidden');$('#pause').classList.add('hidden');$('#lobby').classList.remove('hidden');lobbyScene();};
$('#sound').onclick=()=>{muted=!muted;$('#sound span').textContent=muted?'OFF':'ON';$('#sound').setAttribute('aria-label',muted?'開啟音效':'關閉音效');beep();};
// A second finger does not synthesize a click while the first holds the joystick.
for(const selector of ['#pause','#resume','#exit','#next','#sound']){
  const button=$(selector),action=button.onclick;let start=null,lastTouch=-Infinity;
  button.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')start={id:e.pointerId,x:e.clientX,y:e.clientY};});
  button.addEventListener('pointercancel',()=>start=null);
  button.addEventListener('pointerup',e=>{if(start?.id!==e.pointerId)return;const tapped=Math.hypot(e.clientX-start.x,e.clientY-start.y)<14;start=null;if(tapped){e.preventDefault();lastTouch=performance.now();action();}});
  button.onclick=e=>{if(e.detail===0||performance.now()-lastTouch>600)action();};
}
addEventListener('keydown',e=>{if(e.target instanceof HTMLInputElement)return;if(['Space','KeyW','KeyA','KeyS','KeyD','KeyE','ShiftLeft','ShiftRight','Escape'].includes(e.code)){e.preventDefault();if(e.code==='Escape'&&!e.repeat)togglePause();else keys.add(e.code);}});
addEventListener('keyup',e=>keys.delete(e.code));
addEventListener('blur',()=>{clearInputs();if(state==='race'||state==='countdown')togglePause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state==='race'||state==='countdown'))togglePause();});
let landscape=innerWidth>innerHeight;
function resizeGame(){
  const nextLandscape=innerWidth>innerHeight,touch=useTouchLayout();
  if(nextLandscape!==landscape||document.body.classList.contains('touch-mode')!==touch)clearInputs();
  landscape=nextLandscape;document.body.classList.toggle('touch-mode',touch);
  camera.aspect=innerWidth/innerHeight;camera.fov=touch&&!landscape?58:48;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);
  if(state==='race'||state==='countdown')updateHUD();
}
addEventListener('resize',resizeGame);addEventListener('orientationchange',clearInputs);coarsePointer.addEventListener('change',resizeGame);
resizeGame();
try {const name=localStorage.getItem('sugar-beat-name');if(name)$('#name').value=name;}catch{}
lobbyScene();requestAnimationFrame(animate);

// Development-only bridge: exercise the real state machine without waiting five minutes.
// Vite removes this block completely from production builds.
if(import.meta.env.DEV && new URLSearchParams(location.search).has('test')) {
  window.__gameTest={
    snapshot:()=>({state,round,seed,elapsed,input:readPlayerInput(),courseLength:course.length,map:course.map,event:director?.event,events:director?.history.length,player:{...racers[0]},racers:racers.map(r=>({id:r.id,points:r.points,results:r.results,monsterHits:r.monsterHits}))}),
    advance:(seconds)=>{for(let i=0;i<Math.ceil(seconds*60);i++){if(state==='race'||state==='countdown')tick(1/60);}updateHUD();},
    arrangeGrab:(asVictim=false)=>{racers.forEach((r,i)=>{r.x=i===0?0:i===1?1.3:30+i*2;r.p=3;r.y=0;r.vx=0;r.vp=0;r.grabImmune=0;r.grabTarget=null;r.grabbedBy=null;r.grabHeld=false;r.grabCooldown=0;r.diveCooldown=0;});if(asVictim){racers[1].grabTarget=0;racers[1].grabTime=0;racers[0].grabbedBy=1;racers[0].grabbedTime=.1;}},
    arrangeMonster:(type)=>{const r=racers[0];racers.slice(1).forEach((bot,i)=>Object.assign(bot,{x:40+i*2,p:4,finished:true}));Object.assign(r,{x:0,p:4,y:0,vx:0,vp:0,vy:0,ground:true,stun:0,impact:0,charred:0,burning:0,soaked:0,frozen:0,paralyzed:0,reversed:0,grabTarget:null,grabbedBy:null});const event=beginMonsterEvent(director,course,[r],simulationTime,type);Object.assign(event,{x:0,p:4,width:12.8,monsterX:11.6,side:1});updateHUD();},
    stopMonsters:()=>{director.event=null;director.nextAt=Infinity;},
    arrangeShelter:(type,side=1,exposed=false)=>{
      const r=racers[0];resetRacers(racers);racers.slice(1).forEach(bot=>bot.finished=true);
      Object.assign(r,{x:0,p:10,y:0,vx:0,vp:0,vy:0});
      const event=beginMonsterEvent(director,course,[r],simulationTime,type);
      Object.assign(event,{x:0,p:10,width:12.8,monsterX:side*11.6,side});
      const spots=shelterSpots(event,course,simulationTime,coverBoxes(course,simulationTime));
      const spot=spots[0];Object.assign(r,{x:exposed?-spot.x:spot.x,p:spot.p});resetTerrainCollisionHistory(racers);
      updateHUD();return spot;
    },
  };
}
