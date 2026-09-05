import {createCourseCovers,coverBoxes,resolveTerrainCollisions,resetTerrainCollisionHistory} from './cover.js';

export const COLORS = [0xff508d,0x33dbce,0xffc64b,0x9e83ff,0x57aaff,0xff865c,0x91d957,0xf775d2,0x5dd9ff,0xc7a3ff,0xffda82,0x55c7a2];
export const BOT_NAMES = ['麻糬隊長','布丁暴走','薄荷閃電','芋泥球','檸檬蹦蹦','奶油小偷','泡泡糖','藍莓火箭','焦糖旋風','桃子汽水','棉花糖'];
export const THEMES = [
  { name:'糖霜起跑線', tag:'SUGAR SPRINT', hint:'小心冰面和分岔路！按住 E 抓拉附近對手。', color:0x39d4c5, sky:0xbbeefe, time:80 },
  { name:'果凍搖擺橋', tag:'JELLY JUNCTION', hint:'移動平台、巨槌、窄橋！被抓住時按 Shift 掙脫。', color:0xa58aff, sky:0xd7ceff, time:90 },
  { name:'皇冠狂想曲', tag:'CROWN CHAOS', hint:'複合機關全面開啟！拉人、衝撞，小心一起下去。', color:0xffbd4a, sky:0xffdfc3, time:100 },
];
export const TERRAIN_NAMES={plain:'糖霜跑道',ice:'溜冰糖漿 · 提早轉向',conveyor:'逆向輸送帶 · 小心側滑',bridge:'獨木糖橋 · 別被擠下去',split:'雙線甜甜圈 · 中間是洞',moving:'漂移果凍 · 抓準落點'};
export const GRAB={range:2.05,duration:.85,cooldown:2.5,immunity:1.25};
const MAP_REGIONS=['焦糖煉獄','極凍糖谷','逆流工廠','斷橋深淵','空心迷城','漂浮禁區'];
const MAP_TRIALS=['撞柱暴走','旋刃絞盤','拳柱伏擊','封路惡夢','巨槌審判','狂風裂隙'];
const MAP_TERRAINS=['plain','ice','conveyor','bridge','split','moving'];
const MAP_HAZARDS=['bumpers','sweeper','piston','slider','hammer','fan'];
export const MAP_CATALOG=MAP_REGIONS.flatMap((region,a)=>MAP_TRIALS.map((trial,b)=>({id:a*6+b+1,name:`${region}・${trial}`,terrain:MAP_TERRAINS[a],hazard:MAP_HAZARDS[b],difficulty:'極難'})));
export function selectMapIds(seed) {
  const random=rng(seed),ids=MAP_CATALOG.map(m=>m.id);
  for(let i=ids.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
  return ids.slice(0,3);
}
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function generateCourse(seed, round, mapId=selectMapIds(seed)[round]) {
  const map=MAP_CATALOG.find(m=>m.id===mapId);
  if(!map)throw new RangeError('Unknown map ID');
  const random = rng(seed + round * 123457+mapId*8191), platforms=[], obstacles=[];
  const count=12+round, width=9.2-round*.55;
  const shuffled=values=>{const bag=[...values];for(let i=bag.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[bag[i],bag[j]]=[bag[j],bag[i]];}return bag;};
  const terrains=[map.terrain,...shuffled(MAP_TERRAINS.filter(t=>t!==map.terrain))];
  const hazards=[map.hazard,...shuffled(MAP_HAZARDS.filter(h=>h!==map.hazard))];
  let start=-7, center=0;
  for(let i=0;i<count;i++) {
    const length=i===0?23:17+random()*4;
    if(i>0) center=clamp(center+(random()-.5)*3.4,-4,4);
    const kind=i===0||i===count-1?'plain':terrains[(i-1)%terrains.length];
    const segmentWidth=i===0?12.8:kind==='bridge'?5.3-round*.35:width;
    const platform={start,end:start+length,x:center,width:segmentWidth,kind,phase:random()*Math.PI*2,speed:.95+round*.15,amplitude:kind==='moving'?1.15+round*.15:0,beltX:kind==='conveyor'?(random()<.5?-1:1)*(1.7+round*.3):0,beltP:kind==='conveyor'?-2-round*.2:0};
    platforms.push(platform);
    if(i>0 && i<count-1) {
      const add=(kind,p,x=center)=>obstacles.push({kind,p,x,phase:random()*Math.PI*2,speed:1.85+random()*.55+round*.22,radius:segmentWidth*.42,offset:(random()-.5)*2,direction:random()<.5?-1:1});
      if(kind==='split') {add('piston',start+length*.46,center-segmentWidth*.3);add('piston',start+length*.67,center+segmentWidth*.3);}
      else if(kind==='bridge'){add('hammer',start+length*.42);add('sweeper',start+length*.75);}
      else if(kind!=='moving'){
        add(i===1?map.hazard:hazards[(i-1)%hazards.length],start+length*.4);
        add(hazards[(i+2)%hazards.length],start+length*.73);
      }
    }
    start+=length+(i===0?0:2.25+round*.14+random()*.3);
  }
  return {seed,round,map,platforms,obstacles,covers:createCourseCovers(platforms,round),length:platforms.at(-1).end-4,width};
}
export function obstaclePose(ob,time) {
  const angle=time*ob.speed+ob.phase,wave=Math.sin(angle);
  return { x:ob.kind==='slider'?ob.x+wave*ob.radius*.8:ob.kind==='hammer'?ob.x+wave*ob.radius*.72:ob.x+ob.offset,angle,y:.9+Math.abs(wave)*2.4,height:.18+Math.max(0,wave)*2.5,wind:ob.direction*(.7+.3*wave) };
}
export function platformX(platform,time=0) {return platform.x+(platform.amplitude||0)*Math.sin(time*platform.speed+platform.phase);}
export function platformAt(course,x,p,margin=0,time=0) { return course.platforms.find(s=>p>=s.start && p<=s.end && Math.abs(x-platformX(s,time))<=s.width/2+margin && !(s.kind==='split'&&p>s.start+5&&p<s.end-3&&Math.abs(x-s.x)<1.2-margin)); }
export function createRacers(name,seed) {
  const random=rng(seed);
  return [name,...BOT_NAMES].map((name,id)=>({id,name,color:COLORS[id],skill:.87+random()*.2,lane:(random()-.5)*5,points:0,results:[],totalTime:0}));
}
export function resetRacers(racers) {
  resetTerrainCollisionHistory(racers);
  racers.forEach((r,i)=>Object.assign(r,{x:(i%4-1.5)*2,p:-Math.floor(i/4)*2,y:0,vx:0,vp:0,vy:0,ground:true,checkpoint:{x:0,p:0},finished:false,finishTime:null,place:0,stun:0,impact:0,dive:0,diveCooldown:0,respawns:0,jumpHeld:false,diveHeld:false,maxP:0,grabTarget:null,grabbedBy:null,grabTime:0,grabCooldown:0,grabImmune:.8,grabHeld:false,grabbedTime:0,grabs:0,escapes:0,charred:0,burning:0,soaked:0,frozen:0,paralyzed:0,reversed:0,monsterHits:0,lastMonsterHit:null,pushHeld:false,sheltered:false}));
}
export function botInput(r,course,time,racers=[],event=null) {
  const lane=r.lane+Math.sin(r.respawns*2.4)*1.4;
  const segment=course.platforms.find(s=>s.end>r.p+2) || course.platforms.at(-1);
  let target=platformX(segment,time+.4)+clamp(lane,-segment.width/2+1.4,segment.width/2-1.4);
  let jump=false,forward=1;
  const current=course.platforms.find(s=>r.p>=s.start && r.p<=s.end);
  if(current && current.end-r.p<1.6 && current.end<course.length) {
    jump=true;
    const next=course.platforms[course.platforms.indexOf(current)+1];
    if(next) target=platformX(next,time+.55)+clamp(lane,-next.width/2+1.5,next.width/2-1.5);
  }
  // Commit to the nearest obstacle before planning a later one in a combo.
  for(const ob of course.obstacles.filter(ob=>ob.p-r.p>-1.7&&ob.p-r.p<10).slice(0,1)) {
    if(ob.p-r.p > -1.7 && ob.p-r.p<10) {
      if(ob.kind==='sweeper') { if(Math.abs(ob.p-r.p)<4) jump=true; }
      else if(ob.kind==='slider' || ob.kind==='piston') {
        const pose=obstaclePose(ob,time+Math.max(.2,(ob.p-r.p-1.2)/Math.max(5,r.vp)));
        target=segment.x+(pose.x>segment.x?-1:1)*(segment.width/2-1.8);
      } else if(ob.kind==='hammer') {
        const prediction=obstaclePose(ob,time+Math.max(0,ob.p-r.p)/8);
        target=segment.x+(prediction.x>segment.x?-1:1)*Math.min(1.5,segment.width/2-.8);
        const clearance=Math.hypot(prediction.x-target,prediction.y-1);
        if(ob.p-r.p>0&&ob.p-r.p<2.7&&prediction.y<1.4)jump=true;
        if(ob.p-r.p>2.7&&ob.p-r.p<4.7&&clearance<1.7)forward=0;
      } else if(ob.kind==='fan') {
        target=segment.x-ob.direction*(segment.width/2-1.8);
        if(segment.kind==='ice'&&ob.p-r.p>0&&ob.p-r.p<4)jump=true;
      } else {
        target=segment.x;
      }
    }
  }
  if(segment.kind==='split'&&r.p<segment.end-3){
    target=segment.x+(lane>=0?1:-1)*(segment.width*.3);
    const piston=course.obstacles.find(ob=>ob.kind==='piston'&&ob.p-r.p>0&&ob.p-r.p<5&&Math.abs(ob.x+ob.offset-target)<1.7);
    if(piston){if(piston.p-r.p<3.3&&obstaclePose(piston,time+.25).height>.7)forward=0;else if(piston.p-r.p<2.7)jump=true;}
  }
  if(segment.kind==='moving')target=platformX(segment,time+.3)+clamp(lane,-1.3,1.3);
  if(r.grabTarget!==null&&!jump)target=segment.x+(lane>=0?1:-1)*(segment.width/2-1.6);
  const nearby=racers.some(other=>other.id!==r.id&&!other.finished&&Math.hypot(other.x-r.x,other.p-r.p)<GRAB.range&&Math.abs(other.y-r.y)<1);
  let grab=r.grabTarget!==null || (!jump&&nearby&&(time+r.id*.71)%(3.6-r.skill*.3)<.65);
  const dive=r.grabbedBy!==null&&r.grabbedTime>.3&&r.diveCooldown<=0;
  const walls=coverBoxes(course,time),wall=walls.find(b=>b.p-r.p>-b.depth/2-.7&&b.p-r.p<6.5);
  const nextObstacle=course.obstacles.find(ob=>ob.p>r.p);
  if(wall){
    // Approach the apron walls from a free side, including after checkpoint recovery.
    const beforeWall=r.p<wall.p-wall.depth/2-1.3;
    const side=beforeWall&&Math.abs(target-wall.x)>.45?Math.sign(target-wall.x):Math.abs(r.x-wall.x)>.45?Math.sign(r.x-wall.x):lane>=0?1:-1;
    // A later trap can suggest the opposite lane. Keep this side until the whole
    // body has passed the wall, then allow that lane change.
    if((target-wall.x)*side<wall.width/2+.75)target=wall.x+side*(wall.width/2+.8);
    if(wall.p-r.p<wall.depth/2+1.2&&Math.abs(r.x-wall.x)<wall.width/2+.66)forward=0;
    // Ice needs braking room before the tight turn from a wall into a bumper gap.
    if(segment.kind==='ice'&&nextObstacle?.kind==='bumpers'&&nextObstacle.p-wall.p<4.5&&wall.p-r.p<3.5)forward=Math.min(forward,.38);
  }
  const approaching=course.obstacles.find(ob=>ob.p-r.p>1.1&&ob.p-r.p<4);
  if(approaching&&approaching.kind!=='fan'&&approaching.kind!=='sweeper'&&Math.abs(target-r.x)>.8&&(!wall||r.p>wall.p+wall.depth/2+.6))forward=segment.kind==='ice'&&r.vp>1?-.6:0;
  if(event&&time>event.startAt+.45+(1.07-r.skill)*1.4&&time<event.endAt){
    const distance=event.p-r.p;
    const shelter=event.shelters?.filter(s=>current&&s.p>current.start&&s.p<current.end&&Math.abs(s.p-r.p)<7&&platformAt(course,(s.x+r.x)/2,(s.p+r.p)/2,-.6,time)).sort((a,b)=>Math.hypot(a.x-r.x,a.p-r.p)-Math.hypot(b.x-r.x,b.p-r.p))[0];
    if(shelter&&distance>-event.depth/2-.2&&distance<event.depth/2+4&&current.end-r.p>2){
      // Walk around the end of the wall before crossing to its sheltered face.
      const blocking=walls.find(b=>b.id===shelter.coverId);
      const across=blocking&&(r.x-blocking.x)*(shelter.x-blocking.x)<0;
      const aroundP=blocking?blocking.p-(blocking.depth/2+.85):shelter.p;
      if(across&&r.p>aroundP+.1){target=r.x;forward=clamp((aroundP-r.p)*1.4-r.vp*.2,-1,1);}
      else {target=shelter.x;forward=across?0:clamp((shelter.p-r.p)*1.5-r.vp*.22,-1,1);}
      jump=false;grab=grab&&Math.hypot(shelter.x-r.x,shelter.p-r.p)<.6;
    }else if(distance>event.depth/2+.35&&distance<event.depth/2+4)forward=0;
  }
  // Release the jump key while airborne so adjacent traps can be jumped in turn.
  jump=jump&&r.ground&&!r.jumpHeld;
  return {x:clamp((target-r.x)*1.5-r.vx*(segment.kind==='ice'?.65:.08),-1,1),forward,jump,dive,grab};
}

function releaseGrab(holder,racers) {
  const victim=racers.find(r=>r.id===holder.grabTarget);
  if(victim&&victim.grabbedBy===holder.id){victim.grabbedBy=null;victim.grabbedTime=0;victim.grabImmune=GRAB.immunity;}
  holder.grabTarget=null;holder.grabTime=0;holder.grabCooldown=GRAB.cooldown;
}
export function stepGrabs(racers,inputs,dt) {
  const inputFor=r=>inputs.get(r.id)||{};
  for(const r of racers){r.grabCooldown=Math.max(0,r.grabCooldown-dt);r.grabImmune=Math.max(0,r.grabImmune-dt);}
  for(const holder of racers) {
    if(holder.grabTarget===null)continue;
    const victim=racers.find(r=>r.id===holder.grabTarget),input=inputFor(holder),escape=victim&&inputFor(victim).dive&&!victim.diveHeld&&victim.diveCooldown<=0&&victim.stun<=0;
    holder.grabTime+=dt;
    if(!victim||!input.grab||input.jump||input.dive||escape||holder.finished||victim.finished||holder.stun>0||victim.stun>0||holder.frozen>0||victim.frozen>0||holder.paralyzed>0||victim.paralyzed>0||holder.y<-.5||victim.y<-.5||Math.abs(holder.y-victim.y)>1.4||Math.hypot(holder.x-victim.x,holder.p-victim.p)>3||holder.grabTime>=GRAB.duration) {
      if(escape)victim.escapes++;
      releaseGrab(holder,racers);continue;
    }
    victim.grabbedTime+=dt;
    const dx=victim.x-holder.x,dp=victim.p-holder.p,d=Math.hypot(dx,dp)||1,nx=dx/d,np=dp/d;
    const separating=(victim.vx-holder.vx)*nx+(victim.vp-holder.vp)*np;
    const pull=clamp((d-1.05)*24+separating*4,0,26)*dt;
    victim.vx-=nx*pull;victim.vp-=np*pull;holder.vx+=nx*pull;holder.vp+=np*pull;
  }
  // Under the lightning curse, E repels instead of grabbing. It shares grab cooldown.
  for(const r of racers){const input=inputFor(r),pressed=input.push&&!r.pushHeld;r.pushHeld=!!input.push;
    if(!pressed||r.finished||r.grabCooldown>0||r.stun>0||r.frozen>0||r.paralyzed>0)continue;
    const target=racers.filter(v=>v.id!==r.id&&!v.finished&&Math.abs(v.y-r.y)<1.05&&Math.hypot(v.x-r.x,v.p-r.p)<=GRAB.range).sort((a,b)=>Math.hypot(a.x-r.x,a.p-r.p)-Math.hypot(b.x-r.x,b.p-r.p))[0];
    r.grabCooldown=target?GRAB.cooldown:.25;if(!target)continue;
    const dx=target.x-r.x,dp=target.p-r.p,d=Math.hypot(dx,dp)||1;target.vx+=dx/d*7;target.vp+=dp/d*7;target.impact=.3;r.vx-=dx/d*2;r.vp-=dp/d*2;
  }
  for(const r of racers) {
    // Holding E searches until a catch succeeds; one hold cannot chain catches.
    const input=inputFor(r),pressed=input.grab&&!r.grabHeld;if(!input.grab)r.grabHeld=false;
    if(!pressed||r.grabCooldown>0||r.grabTarget!==null||r.grabbedBy!==null||r.finished||r.stun>0||r.frozen>0||r.paralyzed>0||r.dive>0||r.y<-.1||input.dive||input.jump)continue;
    const victim=racers.filter(v=>v.id!==r.id&&!v.finished&&v.grabbedBy===null&&v.grabTarget===null&&v.grabImmune<=0&&v.y>=-.1&&Math.abs(v.y-r.y)<1.05&&Math.hypot(v.x-r.x,v.p-r.p)<=GRAB.range).sort((a,b)=>Math.hypot(a.x-r.x,a.p-r.p)-Math.hypot(b.x-r.x,b.p-r.p)||a.id-b.id)[0];
    if(!victim){r.grabCooldown=.25;continue;}
    r.grabTarget=victim.id;r.grabTime=0;r.grabHeld=true;victim.grabbedBy=r.id;victim.grabbedTime=0;r.grabs++;
    const dx=victim.x-r.x,dp=victim.p-r.p,d=Math.hypot(dx,dp)||1;
    victim.vx-=dx/d*2.2;victim.vp-=dp/d*2.2;r.vx+=dx/d*2.2;r.vp+=dp/d*2.2;
  }
}
function hit(r,dx,dp,strength=7) {
  if(r.stun>0 || r.y>2) return;
  const length=Math.hypot(dx,dp)||1;
  r.vx=dx/length*strength;r.vp=dp/length*strength;r.vy=5;r.ground=false;r.stun=.5;
}
export function stepRacer(r,input,course,time,dt) {
  if(r.finished) return;
  r.stun=Math.max(0,r.stun-dt);r.impact=Math.max(0,r.impact-dt);r.dive=Math.max(0,r.dive-dt);r.diveCooldown=Math.max(0,r.diveCooldown-dt);
  const standing=platformAt(course,r.x,r.p,0,time-dt);
  const speed=8.8*(r.id===0?1:r.skill)*(r.grabbedBy!==null?.42:r.grabTarget!==null?.68:1)*(r.burning>0?.65:1), norm=Math.max(1,Math.hypot(input.x,input.forward));
  const locked=r.frozen>0||r.paralyzed>0;
  if(locked){r.vx*=Math.exp(-dt*4);r.vp*=Math.exp(-dt*4);}
  if(r.stun<=0&&!locked) {
    // Briefly reduce steering after a body impact so input cannot erase its impulse.
    const lerp=1-Math.exp(-dt*(r.impact>0?3:r.ground?(standing?.kind==='ice'?2.2:14):5));
    const boost=r.dive>0?1.65:1;
    r.vx+=(input.x/norm*speed*boost-r.vx)*lerp;
    r.vp+=(input.forward/norm*speed*boost-r.vp)*lerp;
  }
  if(input.jump && !r.jumpHeld && r.ground && r.stun<=0&&!locked) {r.vy=9.7;r.ground=false;}
  if(input.dive && !r.diveHeld && r.diveCooldown<=0 && r.stun<=0&&!locked) {
    r.dive=.42;r.diveCooldown=1.15;
    if(r.ground) {r.vy=4.8;r.ground=false;}
    r.vp=input.backDive?Math.min(r.vp,-12):Math.max(r.vp,12);r.vy=Math.min(r.vy,4.8);
  }
  r.jumpHeld=input.jump;r.diveHeld=input.dive;
  const oldY=r.y;
  if(r.ground&&standing){r.x+=standing.beltX*dt+platformX(standing,time)-platformX(standing,time-dt);r.p+=standing.beltP*dt;}
  r.vy-=24*dt;r.x+=r.vx*dt;r.p+=r.vp*dt;r.y+=r.vy*dt;
  const floor=platformAt(course,r.x,r.p,0,time);
  if(floor && r.y<=0 && oldY>=-.15 && r.vy<=0) {
    r.y=0;r.vy=0;r.ground=true;
    if(floor.kind!=='moving'&&r.p>floor.start+1.4 && r.p<floor.end-1 && floor.start>r.checkpoint.p) r.checkpoint={x:floor.x,p:floor.start+2};
  } else r.ground=false;
  if(r.y < -8) {r.x=r.checkpoint.x;r.p=r.checkpoint.p;r.y=2;r.vy=0;r.vx=0;r.vp=0;r.stun=.25;r.impact=0;r.dive=0;r.respawns++;}
  r.maxP=Math.max(r.maxP,r.p);
  for(const ob of course.obstacles) {
    if(Math.abs(ob.p-r.p)>ob.radius+2) continue;
    const pose=obstaclePose(ob,time);
    if(ob.kind==='sweeper') {
      const dx=r.x-ob.x, dp=r.p-ob.p, along=dx*Math.cos(pose.angle)+dp*Math.sin(pose.angle);
      const perpendicular=-dx*Math.sin(pose.angle)+dp*Math.cos(pose.angle);
      if(Math.abs(along)<ob.radius+.4 && Math.abs(perpendicular)<.72 && r.y<.95 && r.y>-.5) hit(r,-Math.sin(pose.angle)*Math.sign(perpendicular||1),Math.cos(pose.angle)*Math.sign(perpendicular||1),9);
    } else if(ob.kind==='slider') {
      if(Math.abs(r.x-pose.x)<1.6 && Math.abs(r.p-ob.p)<1.05 && r.y<2.3 && r.y>-.5) hit(r,r.x-pose.x,r.p-ob.p);
    } else if(ob.kind==='piston') {
      if(Math.abs(r.x-pose.x)<1.35&&Math.abs(r.p-ob.p)<1.1&&r.y<pose.height&&r.y>-.5)hit(r,r.x-pose.x,r.p-ob.p,10+course.round);
    } else if(ob.kind==='hammer') {
      const dx=r.x-pose.x,dp=r.p-ob.p;
      if(Math.hypot(dx,dp,r.y+1-pose.y)<1.5)hit(r,Math.cos(pose.angle)*2,dp||-1,12+course.round*2);
    } else if(ob.kind==='fan') {
      if(Math.abs(r.p-ob.p)<3&&Math.abs(r.x-ob.x)<ob.radius+1&&r.y>-.3&&r.y<3)r.vx+=pose.wind*(20+course.round*8)*dt;
    } else {
      for(const side of [-1,1]) {const dx=r.x-(ob.x+side*ob.radius*.65),dp=r.p-ob.p;if(Math.hypot(dx,dp)<1.45 && r.y<1.8 && r.y>-.5) hit(r,dx,dp,9);}
    }
  }
}
export function resolveRacerCollisions(racers,course=null,time=0) {
  // Upright capsules match the bean bodies: radius .56, center segment .63.
  // Resolve horizontally to keep platform landing/jumping under the gravity solver.
  // All racers have equal mass. Multiple passes propagate shoves through a crowd.
  for(let pass=0;pass<3;pass++) {
    for(let i=0;i<racers.length;i++) for(let j=i+1;j<racers.length;j++) {
    const a=racers[i],b=racers[j];if(a.finished||b.finished)continue;
    const verticalGap=Math.max(0,Math.abs(a.y-b.y)-.63);
    if(verticalGap>=1.12)continue;
    const contactDistance=Math.sqrt(1.12**2-verticalGap**2);
    const dx=b.x-a.x,dp=b.p-a.p,d=Math.hypot(dx,dp);
    if(d>=contactDistance)continue;
    let nx,np;
    if(d>.00001){nx=dx/d;np=dp/d;}
    else {
      // A deterministic normal also separates racers sharing a respawn location.
      const relativeX=a.vx-b.vx,relativeP=a.vp-b.vp,speed=Math.hypot(relativeX,relativeP);
      const angle=(Math.min(a.id,b.id)*17+Math.max(a.id,b.id)*31)*2.39996,sign=a.id<b.id?1:-1;
      nx=speed>.00001?relativeX/speed:Math.cos(angle)*sign;
      np=speed>.00001?relativeP/speed:Math.sin(angle)*sign;
    }
    const correction=Math.max(0,contactDistance-d-.002)*.5;
    a.x-=nx*correction;a.p-=np*correction;b.x+=nx*correction;b.p+=np*correction;
    const approach=(a.vx-b.vx)*nx+(a.vp-b.vp)*np;
    if(approach<=0)continue; // Never pull racers back together as they separate.
    const impulse=approach*(1+.18)*.5;
    a.vx-=nx*impulse;a.vp-=np*impulse;b.vx+=nx*impulse;b.vp+=np*impulse;
    if(approach>3) {
      const recovery=Math.min(.28,.12+approach*.009);
      a.impact=Math.max(a.impact,recovery);b.impact=Math.max(b.impact,recovery);
      // A dive's extra speed produces extra impulse, then the impact ends the dive.
      a.dive=0;b.dive=0;
    }
    }
    if(course)resolveTerrainCollisions(racers,course,time);
  }
}
export function raceOrder(racers) {return [...racers].sort((a,b)=> a.finished!==b.finished?(a.finished?-1:1):a.finished?a.place-b.place:b.p-a.p||a.id-b.id);}
export function awardRound(racers,round,timeLimit) {
  const order=raceOrder(racers);
  order.forEach((r,i)=>{const points=Math.round((12-i)*10*(1+round*.5)*(r.finished?1:.5));const time=r.finishTime??timeLimit;r.points+=points;r.totalTime+=time;r.results.push({place:i+1,points,time,finished:r.finished});});
  return order;
}
export function finalOrder(racers) {return [...racers].sort((a,b)=>b.points-a.points||a.totalTime-b.totalTime||a.id-b.id);}
