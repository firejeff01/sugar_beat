// Pure, seeded encounter simulation shared by the game and the tests.
import {rng,clamp,platformX} from './game.js';

export const ATTACKS={
  fire:{name:'熔糖吐息',warning:'火焰即將橫掃！離開紅色區域',color:0xff692b,duration:1.25},
  water:{name:'巨浪水砲',warning:'水砲瞄準中！小心被沖出賽道',color:0x36bfff,duration:1.5},
  ice:{name:'冰封龍息',warning:'寒流即將噴出！避開結冰區域',color:0x9af6ff,duration:1.3},
  lightning:{name:'反轉雷暴',warning:'雷暴蓄力！命中後麻痺＋反轉操作',color:0xd598ff,duration:1},
};
export function createMonsterDirector(seed,round) {
  return {random:rng(seed^Math.imul(round+1,0x45d9f3b)),round,nextAt:3.8,event:null,sequence:0,bag:[],history:[]};
}
export function beginMonsterEvent(director,course,racers,time,forcedType) {
  const random=director.random,eligible=racers.filter(r=>!r.finished&&r.y>-.5);
  if(!eligible.length)return null;
  if(!director.bag.length){director.bag=Object.keys(ATTACKS);for(let i=3;i>0;i--){const j=Math.floor(random()*(i+1));[director.bag[i],director.bag[j]]=[director.bag[j],director.bag[i]];}}
  const type=forcedType??director.bag.pop();
  const player=eligible.find(r=>r.id===0),target=player&&random()<.55?player:eligible[Math.floor(random()*eligible.length)];
  const aim=clamp(target.p+8+random()*6,4,course.length-5);
  const segment=course.platforms.find(p=>p.end>aim+2)||course.platforms.at(-1);
  const warn=1.65-director.round*.1,centerX=platformX(segment,time+warn),side=random()<.5?-1:1;
  const event={id:++director.sequence,type,startAt:time,attackAt:time+warn,endAt:time+warn+ATTACKS[type].duration,despawnAt:time+warn+ATTACKS[type].duration+.7,p:clamp(aim,segment.start+3,segment.end-3),x:centerX,width:segment.width+1,depth:5+director.round*.35,monsterX:centerX+side*(segment.width/2+5.2),side,hitIds:[]};
  director.event=event;director.history.push({id:event.id,type,at:time,mapId:course.map.id});
  return event;
}
export function eventPhase(event,time) {
  if(!event||time<event.startAt||time>event.despawnAt)return 'idle';
  return time<event.attackAt?'warning':time<=event.endAt?'attack':'retreat';
}
export function insideMonsterAttack(event,racer) {
  return !racer.finished&&racer.y>=-.25&&racer.y<3.4&&Math.abs(racer.p-event.p)<=event.depth/2&&Math.abs(racer.x-event.x)<=event.width/2;
}
export function applyMonsterHit(r,type,direction) {
  r.monsterHits++;r.lastMonsterHit=type;r.dive=0;
  if(type==='fire'){r.charred=3.5;r.burning=2.5;r.stun=Math.max(r.stun,.35);r.vy=3;r.ground=false;}
  if(type==='water'){r.soaked=2;r.vx=direction*14;r.vp*=.35;r.vy=3;r.ground=false;r.impact=.9;r.stun=Math.max(r.stun,.32);}
  if(type==='ice'){r.frozen=1.8;r.vx*=.12;r.vp*=.12;}
  if(type==='lightning'){r.paralyzed=.65;r.reversed=5;r.vx*=.2;r.vp*=.2;}
}
export function stepMonsterEvents(director,course,racers,time,dt) {
  if(!director.event&&time>=director.nextAt) {
    beginMonsterEvent(director,course,racers,time);
    if(!director.event)director.nextAt=time+.4;
  }
  const event=director.event;if(!event)return;
  if(eventPhase(event,time)==='attack')for(const r of racers) {
    if(!insideMonsterAttack(event,r))continue;
    if(!event.hitIds.includes(r.id)){applyMonsterHit(r,event.type,-event.side);event.hitIds.push(r.id);}
    if(event.type==='water')r.vx+=-event.side*24*dt;
  }
  if(time>event.despawnAt){director.event=null;director.nextAt=time+1.8+director.random()*(2.4-director.round*.35);}
}
export function advanceStatuses(r,dt) {
  const clean=n=>n<1e-8?0:n;
  const blockedTime=Math.min(r.paralyzed,dt);
  r.paralyzed=clean(Math.max(0,r.paralyzed-dt));
  // Five full seconds of reversed controls begin after paralysis ends.
  r.reversed=clean(Math.max(0,r.reversed-(dt-blockedTime)));
  for(const key of ['charred','burning','soaked','frozen'])r[key]=clean(Math.max(0,r[key]-dt));
}
export function effectiveInput(r,input) {
  if(r.frozen>0||r.paralyzed>0)return {x:0,forward:0,jump:false,dive:false,grab:false,push:false,backDive:false};
  if(r.reversed<=0)return {...input,push:false,backDive:false};
  return {...input,x:input.x?-input.x:0,forward:input.forward?-input.forward:0,jump:!!input.dive,dive:!!input.jump,grab:false,push:!!input.grab,backDive:true};
}
