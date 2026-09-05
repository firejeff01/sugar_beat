import test from 'node:test';
import assert from 'node:assert/strict';
import {createRacers,resetRacers,stepRacer,stepGrabs,generateCourse,botInput} from '../src/game.js';
import {advanceStatuses,effectiveInput,applyMonsterHit} from '../src/monster.js';
import {stepTimedGates} from '../src/timed-gates.js';
import {ZOMBIE,createZombieDirector,stepZombieEvents,infectRacer,canBite,canFinishRace,spawnZombie} from '../src/zombie.js';

const dt=1/60,idle={x:0,forward:0,jump:false,dive:false,grab:false};
function setup(count=3) {
  const racers=createRacers('Zombie test',42).slice(0,count);resetRacers(racers);
  racers.forEach((r,i)=>Object.assign(r,{x:i*1.5,p:0,skill:1}));
  const course={platforms:[{x:0,start:-50,end:150,width:80,kind:'plain',amplitude:0,beltX:0,beltP:0}],length:145,round:0,obstacles:[],covers:[],map:{id:1},gates:[]};
  const director=createZombieDirector(42,0);director.nextAt=Infinity;
  return {racers,course,director};
}
function bite(director,course,racers,time,...ids) {
  return stepZombieEvents(director,course,racers,time,dt,new Map(ids.map(id=>[id,{...idle,bite:true}])));
}

test('infection lasts ten simulation seconds, survives falls, resets between rounds and can recur',()=>{
  const {racers,course}=setup(1),r=racers[0];
  infectRacer(r,'npc',racers);assert.equal(r.zombie,10);assert.equal(r.zombieInfections,1);
  r.y=-9;stepRacer(r,idle,course,0,dt);assert.equal(r.respawns,1);assert.equal(r.zombie,10);
  for(let i=0;i<599;i++)advanceStatuses(r,dt);
  assert.ok(r.zombie>0);advanceStatuses(r,dt);assert.equal(r.zombie,0);
  infectRacer(r,1,racers);assert.equal(r.zombie,10);assert.equal(r.zombieInfections,2);assert.equal(r.lastInfectedBy,1);
  r.biteCooldown=.8;r.bites=3;r.gateBlocked=true;resetRacers(racers);
  assert.equal(r.zombie,0);assert.equal(r.biteCooldown,0);assert.equal(r.zombieInfections,0);assert.equal(r.bites,0);assert.equal(r.lastInfectedBy,null);assert.equal(r.gateBlocked,false);
});

test('bite chains advance one generation per tick, refresh existing infection and respect cooldowns',()=>{
  const {racers,course,director}=setup(),[a,b,c]=racers;
  infectRacer(a,'npc',racers);
  const first=bite(director,course,racers,1,0,1,2);
  assert.deepEqual(first.infected.map(e=>e.targetId),[1]);assert.equal(b.zombie,10);assert.equal(c.zombie,0);assert.equal(a.biteCooldown,ZOMBIE.biteCooldown);
  const next=bite(director,course,racers,1+dt,0,1,2);
  assert.deepEqual(next.infected.map(e=>e.targetId),[2]);assert.equal(c.zombie,10);
  b.zombie=2;
  assert.equal(bite(director,course,racers,1.1,0).bites.length,0);assert.equal(b.zombie,2);
  advanceStatuses(a,1.1);const refreshed=bite(director,course,racers,2.2,0);
  assert.equal(refreshed.infected[0].targetId,1);assert.equal(b.zombie,10);assert.equal(b.zombieInfections,2);
  advanceStatuses(b,10);assert.equal(b.zombie,0);advanceStatuses(a,1.1);
  bite(director,course,racers,3.4,0);assert.equal(b.zombie,10);assert.equal(b.zombieInfections,3);
});

test('infected interaction is a bite, never a simultaneous grab or lightning push',()=>{
  const {racers}=setup(2),[a,b]=racers;
  Object.assign(a,{grabTarget:1,grabTime:.2});Object.assign(b,{grabbedBy:0,grabbedTime:.2});
  infectRacer(a,'npc',racers);assert.equal(a.grabTarget,null);assert.equal(b.grabbedBy,null);
  a.reversed=5;
  const mapped=effectiveInput(a,{...idle,x:1,forward:1,grab:true});
  assert.equal(mapped.x,-1);assert.equal(mapped.forward,-1);assert.equal(mapped.bite,true);assert.equal(mapped.grab,false);assert.equal(mapped.push,false);
  stepGrabs(racers,new Map([[0,{...mapped,grab:true,push:true}]]),dt);assert.equal(a.grabTarget,null);assert.equal(b.vx,0);
  for(const status of ['frozen','paralyzed']) {
    a[status]=1;assert.equal(effectiveInput(a,{...idle,bite:true}).bite,false);a[status]=0;
  }
});

test('wafer walls, gaps, height and finished or eliminated racers block bites',()=>{
  const {racers,course,director}=setup(2),[a,b]=racers;
  a.x=-.91;b.x=.91;a.p=b.p=5;infectRacer(a,'npc',racers);
  course.covers=[{id:'wall',platformIndex:0,xOffset:0,p:5,width:.5,depth:2,height:3.2}];
  assert.equal(canBite(a,b,course,1),false);assert.equal(bite(director,course,racers,1,0).infected.length,0);
  course.covers=[];a.biteCooldown=0;assert.equal(canBite(a,b,course,1),true);
  b.y=1.1;assert.equal(canBite(a,b,course,1),false);b.y=0;
  for(const field of ['finished','eliminated']) {
    b[field]=true;assert.equal(infectRacer(b,0),false);assert.equal(canBite(a,b,course,1),false);b[field]=false;
    a[field]=true;assert.equal(bite(director,course,racers,2,0).infected.length,0);a[field]=false;
  }
  Object.assign(a,{x:0,p:4.6});Object.assign(b,{x:0,p:5.5});
  course.platforms=[{...course.platforms[0],end:4.8},{...course.platforms[0],start:5.2}];
  assert.equal(canBite(a,b,course,1),false,'a short bite must not cross empty space');
});

test('infection gives exactly 1.2 times running speed while preserving manual movement',()=>{
  const {racers,course}=setup(2),[normal,zombie]=racers;
  normal.id=zombie.id=0;normal.x=zombie.x=0;infectRacer(zombie,'npc');
  for(let i=0;i<60;i++)for(const r of racers)stepRacer(r,{...idle,forward:1},course,(i+1)*dt,dt);
  assert.ok(Math.abs(zombie.vp/normal.vp-1.2)<1e-10);assert.ok(Math.abs(zombie.p/normal.p-1.2)<1e-10);
  for(let i=0;i<6;i++)stepRacer(zombie,{...idle,x:-1},course,1+(i+1)*dt,dt);
  assert.ok(zombie.vx<-9);assert.ok(zombie.vp<1,'the infected player can turn and stop moving forward');
  assert.equal(canFinishRace(zombie),false);advanceStatuses(zombie,10);assert.equal(canFinishRace(zombie),true);
});

test('infection barrier holds at the next unpassed gate and opens immediately on recovery',()=>{
  const {racers,course}=setup(1),r=racers[0];
  course.gates=[{id:1,platformIndex:0,p:10,deadline:20},{id:2,platformIndex:0,p:30,deadline:30}];
  infectRacer(r,'npc');Object.assign(r,{p:9.9,vp:10});
  let previous=new Map([[0,{...r}]]);r.p=10.1;
  stepTimedGates(racers,course,1,1,dt,previous);
  assert.ok(r.p<10);assert.equal(r.gatePasses,0);assert.equal(r.gateBlocked,true);assert.equal(r.vp,0);
  advanceStatuses(r,10);previous=new Map([[0,{...r}]]);r.p=10.1;
  stepTimedGates(racers,course,11,11,dt,previous);
  assert.equal(r.gatePasses,1);assert.equal(r.gateBlocked,false);
  infectRacer(r,'npc');r.p=31;stepTimedGates(racers,course,29,29,dt,new Map([[0,{...r,p:29.9}]]));
  assert.equal(r.gatePasses,1);assert.equal(r.gateTimes.length,1);assert.ok(r.p<30);
  stepTimedGates(racers,course,30,30,dt);assert.equal(r.eliminated,true);assert.equal(r.eliminationGate,2);
});

test('manual steering starts, stops and reverses quickly without erasing ice or attack momentum',()=>{
  const {racers,course}=setup(1),r=racers[0];
  for(let i=0;i<3;i++)stepRacer(r,{...idle,x:1},course,(i+1)*dt,dt);
  assert.ok(r.vx>6.5,'keyboard and analog input reach useful speed within 50 ms');
  for(let i=0;i<3;i++)stepRacer(r,{...idle,x:-1},course,.05+(i+1)*dt,dt);
  assert.ok(r.vx<-5,'opposite input reverses direction within 50 ms');
  for(let i=0;i<5;i++)stepRacer(r,idle,course,.1+(i+1)*dt,dt);
  assert.ok(Math.abs(r.vx)<.8,'releasing movement brakes promptly');
  Object.assign(r,{vx:8.8,p:0,x:0});course.platforms[0].kind='ice';
  stepRacer(r,idle,course,.3,.1);assert.ok(r.vx>5,'ice keeps its distinct slide');
  course.platforms[0].kind='plain';applyMonsterHit(r,'water',1);
  stepRacer(r,{...idle,x:-1},course,.4,dt);assert.ok(r.vx>12,'water retains its real knockback impulse');
});

test('random NPC spawns are seeded on all maps, capped at two and expire',()=>{
  for(let mapId=1;mapId<=36;mapId++) {
    const course=generateCourse(55,0,mapId),racers=createRacers('spawn',55);resetRacers(racers);
    const a=createZombieDirector(55,0),b=createZombieDirector(55,0);
    assert.deepEqual(spawnZombie(a,course,racers,10),spawnZombie(b,course,racers,10));
    assert.equal(a.zombies.length,1);assert.ok(a.zombies[0].p>=course.platforms[0].start);
    spawnZombie(a,course,racers,11);assert.equal(spawnZombie(a,course,racers,12),null);assert.equal(a.zombies.length,2);
    a.nextAt=Infinity;const result=stepZombieEvents(a,course,racers,29,dt);
    assert.equal(result.expired.length,2);assert.equal(a.zombies.length,0);
  }
});

test('NPC walks around a real wall to bite and cannot chase across platform gaps',()=>{
  const {racers,course,director}=setup(1),r=racers[0];Object.assign(r,{x:1.6,p:5});
  course.covers=[{id:'wall',platformIndex:0,xOffset:0,p:5,width:1.15,depth:2.1,height:3.2}];
  const npc={id:'zombie-test',x:-1.6,p:5,y:0,platformIndex:0,vx:0,vp:0,respawns:0,spawnedAt:-1,expiresAt:100,biteCooldown:0,phase:'hunt'};
  director.zombies.push(npc);
  for(let frame=0;frame<180&&!r.zombie;frame++) {
    stepZombieEvents(director,course,racers,frame*dt,dt);
    const dx=Math.max(Math.abs(npc.x)-.575,0),dp=Math.max(Math.abs(npc.p-5)-1.05,0);
    assert.ok(Math.hypot(dx,dp)>=.56-1e-6,'hunter cannot clip through the wafer wall');
  }
  assert.equal(r.zombie,10);assert.equal(r.lastInfectedBy,'zombie-test');
  course.covers=[];course.platforms=[{...course.platforms[0],end:10},{...course.platforms[0],start:14}];
  Object.assign(npc,{x:0,p:9});Object.assign(r,{x:0,p:15,zombie:0});
  for(let frame=0;frame<60;frame++)stepZombieEvents(director,course,racers,4+frame*dt,dt);
  assert.ok(npc.p<10);assert.equal(r.zombie,0);
});

test('infected AI may pursue and bite nearby racers while retaining navigation input',()=>{
  const {racers,course}=setup(2),[a,b]=racers;Object.assign(a,{id:1,p:5,x:0});Object.assign(b,{id:2,p:6,x:1.2});
  infectRacer(a,'npc');const input=botInput(a,course,.1,racers);
  assert.equal(input.ai,true);assert.equal(input.bite,true);assert.equal(input.grab,false);assert.ok(input.x>0);assert.ok(input.forward>0);
  b.finished=true;const alone=botInput(a,course,.1,racers);assert.equal(alone.bite,false);assert.ok(alone.forward>0);
  b.finished=false;course.gates=[{p:10}];
  assert.equal(botInput(a,course,.1,racers).bite,false,'AI approaching its next gate prioritizes qualification');
});

test('computer hunters spread to healthy rivals without perpetually refreshing an infected crowd',()=>{
  const {racers,course,director}=setup(2),[a,b]=racers;
  infectRacer(a,'npc');infectRacer(b,'npc');advanceStatuses(b,4);
  const aiInput=botInput(a,course,.1,racers);assert.equal(aiInput.bite,false);
  stepZombieEvents(director,course,racers,1,dt,new Map([[a.id,{...idle,ai:true,bite:true}]]));
  assert.equal(b.zombie,6,'even a stale AI bite input must not refresh infection');
  a.biteCooldown=0;advanceStatuses(b,6);
  stepZombieEvents(director,course,racers,2,dt,new Map([[a.id,{...idle,ai:true,bite:true}]]));
  assert.equal(b.zombie,10,'a recovered rival can be infected again');
  advanceStatuses(b,4);a.biteCooldown=0;
  stepZombieEvents(director,course,racers,3,dt,new Map([[a.id,{...idle,bite:true}]]));
  assert.equal(b.zombie,10,'manual bites still refresh existing infections');
  a.finished=true;b.zombie=0;
  director.zombies=[{id:'zombie-test',x:b.x+1.4,p:b.p,y:0,vx:0,vp:0,platformIndex:0,spawnedAt:0,expiresAt:100,biteCooldown:0}];
  stepZombieEvents(director,course,racers,4,dt);assert.equal(b.zombie,10);
  advanceStatuses(b,10);director.zombies[0].biteCooldown=0;
  stepZombieEvents(director,course,racers,14,dt);assert.equal(b.zombie,0,'NPC looks for another rival while its previous target recovers');
  stepZombieEvents(director,course,racers,16,dt);assert.equal(b.zombie,10,'NPC can eventually infect the same rival again');
});

test('infected AI brakes before the finish until cured instead of running off the course',()=>{
  const {racers,course}=setup(1),r=racers[0];Object.assign(r,{p:course.length-2,vp:10.56,gatePasses:3});infectRacer(r,'npc');
  for(let frame=0;frame<300;frame++) {
    advanceStatuses(r,dt);const input=effectiveInput(r,botInput(r,course,frame*dt,racers));
    stepRacer(r,input,course,frame*dt,dt);assert.ok(r.p<course.length+.1);
  }
  assert.equal(r.respawns,0);assert.ok(r.zombie>0);assert.equal(canFinishRace(r),false);
  advanceStatuses(r,10);
  for(let frame=0;frame<60;frame++)stepRacer(r,botInput(r,course,5+frame*dt,racers),course,5+frame*dt,dt);
  assert.ok(r.p>course.length);assert.equal(canFinishRace(r),true);
});
