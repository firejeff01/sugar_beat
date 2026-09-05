import {rng,clamp,platformAt,platformX} from './game.js';
import {coverBoxes,resolveTerrainCollisions} from './cover.js';

export const ZOMBIE={duration:10,speedMultiplier:1.2,biteRange:1.85,biteCooldown:1.1,maxNPCs:2,npcLifetime:17,emergeTime:.85,npcRetargetTime:12};
const active=r=>!r.finished&&!r.eliminated;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.p-b.p);

export function canFinishRace(racer) {return active(racer)&&!(racer.zombie>0);}
export function createZombieDirector(seed,round) {
  const random=rng(seed^Math.imul(round+1,0x27d4eb2d));
  return {random,round,zombies:[],history:[],sequence:0,nextAt:8+random()*4};
}

function segmentHitsBox(a,b,box,radius=0) {
  let near=0,far=1;
  for(const [axis,min,max] of [['x',box.x-box.width/2-radius,box.x+box.width/2+radius],['p',box.p-box.depth/2-radius,box.p+box.depth/2+radius]]) {
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<1e-8){if(a[axis]<min||a[axis]>max)return false;continue;}
    let start=(min-a[axis])/delta,end=(max-a[axis])/delta;
    if(start>end)[start,end]=[end,start];
    near=Math.max(near,start);far=Math.min(far,end);if(near>far)return false;
  }
  return near<=1&&far>=0;
}
function floorPath(course,a,b,time,margin=0) {
  const steps=Math.max(1,Math.ceil(distance(a,b)/.25));
  for(let i=0;i<=steps;i++)if(!platformAt(course,a.x+(b.x-a.x)*i/steps,a.p+(b.p-a.p)*i/steps,-margin,time))return false;
  return true;
}
export function canBite(source,target,course,time,boxes=coverBoxes(course,time)) {
  if(!active(source)||!active(target)||source===target||source.y<-.15||target.y<-.15||Math.abs(source.y-target.y)>1.05||distance(source,target)>ZOMBIE.biteRange)return false;
  const mouthHeight=Math.min(source.y,target.y)+1.15;
  return !boxes.some(box=>mouthHeight<box.height&&segmentHitsBox(source,target,box,.04))&&floorPath(course,source,target,time);
}

function releaseInfectedGrab(racer,racers) {
  if(racer.grabTarget===null)return;
  const victim=racers.find(r=>r.id===racer.grabTarget);
  if(victim?.grabbedBy===racer.id){victim.grabbedBy=null;victim.grabbedTime=0;}
  racer.grabTarget=null;racer.grabTime=0;racer.grabHeld=false;racer.pushHeld=false;
}
export function infectRacer(target,sourceId,racers=[]) {
  if(!active(target))return false;
  target.zombie=ZOMBIE.duration;target.zombieInfections=(target.zombieInfections??0)+1;target.lastInfectedBy=sourceId;
  releaseInfectedGrab(target,racers);
  return true;
}

function clearWalk(course,a,b,time,boxes) {
  return floorPath(course,a,b,time,.56)&&!boxes.some(box=>segmentHitsBox(a,b,box,.57));
}
function chasePoint(source,target,course,time,boxes) {
  if(clearWalk(course,source,target,time,boxes))return target;
  // A short visibility graph takes the hunter around a wafer wall. Every edge
  // stays on solid ground, so neither corners nor split lanes permit shortcuts.
  const points=[source,target];
  for(const box of boxes.filter(box=>Math.abs(box.p-source.p)<8))for(const sx of [-1,1])for(const sp of [-1,1]) {
    const point={x:box.x+sx*(box.width/2+.72),p:box.p+sp*(box.depth/2+.72)};
    if(platformAt(course,point.x,point.p,-.58,time))points.push(point);
  }
  const costs=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set();costs[0]=0;
  for(let step=0;step<points.length;step++) {
    let index=-1;
    for(let i=0;i<points.length;i++)if(!visited.has(i)&&(index<0||costs[i]<costs[index]))index=i;
    if(index<0||!Number.isFinite(costs[index]))break;
    if(index===1) {
      let next=1;while(previous[next]>0)next=previous[next];return points[next];
    }
    visited.add(index);
    for(let next=1;next<points.length;next++)if(!visited.has(next)&&clearWalk(course,points[index],points[next],time,boxes)) {
      const cost=costs[index]+distance(points[index],points[next]);
      if(cost<costs[next]){costs[next]=cost;previous[next]=index;}
    }
  }
  return null;
}

export function zombieBotInput(racer,course,time,racers,base) {
  const input={...base,grab:false,bite:false};
  if(racer.stun>0||racer.frozen>0||racer.paralyzed>0)return input;
  const current=platformAt(course,racer.x,racer.p,0,time);
  const target=racers.filter(other=>other!==racer&&active(other)&&!(other.zombie>0)&&other.y>=-.15&&Math.abs(other.y-racer.y)<1.05&&distance(racer,other)<4.5&&current===platformAt(course,other.x,other.p,0,time))
    .sort((a,b)=>distance(racer,a)-distance(racer,b))[0];
  input.bite=!!target&&racer.biteCooldown<=0;
  const gate=course.gates?.[racer.gatePasses??0];
  const prioritizeFinish=(gate&&gate.p-racer.p<6.5)||course.length-racer.p<6.5;
  const boxes=coverBoxes(course,time);
  const openGround=current&&current.end-racer.p>4&&racer.p-current.start>2.5&&current.kind!=='ice'&&current.kind!=='bridge'&&current.kind!=='split'&&!course.obstacles.some(obstacle=>Math.abs(obstacle.p-racer.p)<6)&&!boxes.some(box=>Math.abs(box.p-racer.p)<3.5);
  if(prioritizeFinish)input.bite=false;
  // Hunt in brief bursts, then prioritize reaching the next deadline. Rivals
  // waiting at a gate must not turn into an endless reinfection carousel.
  if(target&&openGround&&!prioritizeFinish&&!base.jump&&(time+racer.id*.39)%3<1.6) {
    const point=chasePoint(racer,target,course,time,boxes);
    if(point){input.x=clamp((point.x-racer.x)*2,-1,1);input.forward=clamp((point.p-racer.p)*2,-1,1);}
  }
  // Infection cannot finish a round. Brake on the final apron while recovering
  // instead of repeatedly running off its far edge and respawning.
  if(racer.p>course.length-3) {
    input.forward=clamp((course.length-.85-racer.p)*1.8-racer.vp*.25,-1,1);
    input.jump=false;input.dive=false;
  }
  return input;
}

export function spawnZombie(director,course,racers,time) {
  if(director.zombies.length>=ZOMBIE.maxNPCs)return null;
  const eligible=racers.filter(r=>active(r)&&r.y>=-.15&&platformAt(course,r.x,r.p,-.56,time));
  if(!eligible.length)return null;
  const random=director.random,player=eligible.find(r=>r.id===0),target=player&&random()<.5?player:eligible[Math.floor(random()*eligible.length)];
  const platform=platformAt(course,target.x,target.p,0,time),platformIndex=course.platforms.indexOf(platform),boxes=coverBoxes(course,time);
  const candidates=[];
  for(const dp of [4,-4,6,-6,2.8])for(const side of [-1,1]) {
    const point={x:platformX(platform,time)+side*Math.min(platform.width/2-.85,1.8+random()),p:clamp(target.p+dp,platform.start+1,platform.end-1),y:0};
    if(distance(point,target)<2.5||!platformAt(course,point.x,point.p,-.6,time)||boxes.some(box=>segmentHitsBox(point,point,box,.6)))continue;
    candidates.push(point);
  }
  if(!candidates.length)return null;
  const position=candidates[Math.floor(random()*candidates.length)];
  const zombie={id:`zombie-${++director.sequence}`,...position,platformIndex,vx:0,vp:0,vy:0,respawns:0,finished:false,eliminated:false,spawnedAt:time,expiresAt:time+ZOMBIE.npcLifetime,biteCooldown:0,facing:0,biteAt:-Infinity,bittenAt:{},phase:'emerging'};
  director.zombies.push(zombie);director.history.push({type:'spawn',at:time,sourceId:zombie.id,x:zombie.x,p:zombie.p});
  return zombie;
}

export function stepZombieEvents(director,course,racers,time,dt,inputs=new Map()) {
  const result={spawned:[],infected:[],bites:[],expired:[]},boxes=coverBoxes(course,time);
  // Capture infected attackers before applying any bites to prevent a whole
  // crowd becoming a multi-generation chain in a single simulation tick.
  const attackers=racers.filter(r=>active(r)&&r.zombie>0&&r.stun<=0&&r.frozen<=0&&r.paralyzed<=0&&r.biteCooldown<=0&&inputs.get(r.id)?.bite);
  for(const zombie of director.zombies)if(time>=zombie.expiresAt){result.expired.push(zombie);director.history.push({type:'despawn',at:time,sourceId:zombie.id});}
  director.zombies=director.zombies.filter(zombie=>time<zombie.expiresAt);
  if(time>=director.nextAt) {
    const spawned=spawnZombie(director,course,racers,time);if(spawned)result.spawned.push(spawned);
    director.nextAt=time+(spawned?7+director.random()*4:1.5);
  }
  for(const zombie of director.zombies) {
    zombie.biteCooldown=Math.max(0,zombie.biteCooldown-dt);
    const platform=course.platforms[zombie.platformIndex];
    zombie.x+=platformX(platform,time)-platformX(platform,time-dt);
    zombie.phase=time<zombie.spawnedAt+ZOMBIE.emergeTime?'emerging':'hunt';
    if(zombie.phase==='emerging')continue;
    const targets=racers.filter(r=>active(r)&&!(r.zombie>0)&&time-(zombie.bittenAt?.[r.id]??-Infinity)>=ZOMBIE.npcRetargetTime&&r.y>=-.15&&platformAt(course,r.x,r.p,0,time)===platform&&distance(zombie,r)<13)
      .sort((a,b)=>distance(zombie,a)-distance(zombie,b));
    const target=targets[0];
    if(target) {
      const point=chasePoint(zombie,target,course,time,boxes);
      if(point&&distance(zombie,target)>.95) {
        const d=distance(zombie,point)||1,speed=5.6+director.round*.45;
        const next={x:zombie.x+(point.x-zombie.x)/d*speed*dt,p:zombie.p+(point.p-zombie.p)/d*speed*dt};
        if(floorPath(course,zombie,next,time,.56)) {
          zombie.vx=(next.x-zombie.x)/dt;zombie.vp=(next.p-zombie.p)/dt;
          zombie.facing=Math.atan2(zombie.vx,zombie.vp);zombie.x=next.x;zombie.p=next.p;
        }
      }
      resolveTerrainCollisions([zombie],course,time);
      if(zombie.biteCooldown<=0&&targets.some(r=>canBite(zombie,r,course,time,boxes)))attackers.push(zombie);
    }
  }
  for(const source of attackers) {
    source.biteCooldown=ZOMBIE.biteCooldown;source.biteAt=time;
    // Computer hunters spread infection to healthy rivals. They do not keep a
    // crowd permanently infected by endlessly refreshing each other's timers.
    // Manual bites retain the ability to refresh any rival's ten-second timer.
    const computer=typeof source.id==='string'||inputs.get(source.id)?.ai;
    const target=racers.filter(r=>(!computer||!(r.zombie>0))&&(typeof source.id!=='string'||time-(source.bittenAt?.[r.id]??-Infinity)>=ZOMBIE.npcRetargetTime)&&canBite(source,r,course,time,boxes))
      .sort((a,b)=>(a.zombie>0)-(b.zombie>0)||distance(source,a)-distance(source,b)||a.id-b.id)[0];
    const bite={type:'bite',at:time,sourceId:source.id,targetId:target?.id??null};
    result.bites.push(bite);director.history.push(bite);
    if(target&&infectRacer(target,source.id,racers)) {
      source.bites=(source.bites??0)+1;
      if(typeof source.id==='string'){source.bittenAt??={};source.bittenAt[target.id]=time;}
      const infection={type:'infect',at:time,sourceId:source.id,targetId:target.id};
      result.infected.push(infection);director.history.push(infection);
    }
  }
  return result;
}
