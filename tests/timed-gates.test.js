import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTimedGates,stepTimedGates} from '../src/timed-gates.js';
import {generateCourse,createRacers,resetRacers,stepRacer,stepGrabs,botInput,resolveRacerCollisions,raceOrder,awardRound,roundPoints,THEMES,platformX} from '../src/game.js';
import {createMonsterDirector,beginMonsterEvent,stepMonsterEvents,advanceStatuses,applyMonsterHit,effectiveInput} from '../src/monster.js';
import {resolveTerrainCollisions} from '../src/cover.js';

const dt=1/60,idle={x:0,forward:0,jump:false,dive:false,grab:false};
const previousPositions=racers=>new Map(racers.map(r=>[r.id,{x:r.x,p:r.p,y:r.y,respawns:r.respawns}]));
function setup(count=3) {
  const racers=createRacers('Gate test',42).slice(0,count);resetRacers(racers);
  racers.forEach(r=>Object.assign(r,{x:0,p:0}));
  const platforms=[{x:0,start:-10,end:90,width:10,kind:'plain',amplitude:0,beltX:0,beltP:0}];
  const course={platforms,length:85,width:10,round:0,obstacles:[],covers:[],map:{id:1},gates:[{id:1,platformIndex:0,p:10,deadline:10},{id:2,platformIndex:0,p:30,deadline:20},{id:3,platformIndex:0,p:60,deadline:30}]};
  return {racers,course};
}
function cross(racers,course,racer,elapsed,overrides={}) {
  Object.assign(racer,{p:9,x:0,y:0},overrides);
  const previous=previousPositions(racers);racer.p=11;
  return stepTimedGates(racers,course,elapsed,elapsed+3.4,1,previous);
}

test('all 36 maps place three ordered timed gates on solid platform exits',()=>{
  for(let mapId=1;mapId<=36;mapId++)for(let round=0;round<3;round++) {
    const course=generateCourse(600+mapId,round,mapId),gates=course.gates;
    assert.equal(gates.length,3);assert.equal(new Set(gates.map(g=>g.platformIndex)).size,3);
    assert.deepEqual(gates,generateTimedGates(course.platforms,course.length,THEMES[round].time,round));
    for(const [index,gate] of gates.entries()) {
      const platform=course.platforms[gate.platformIndex];
      assert.equal(gate.id,index+1);assert.ok(gate.platformIndex>0&&gate.platformIndex<course.platforms.length-1);
      assert.equal(gate.p,platform.end-2);assert.ok(gate.p>platform.start+5,'gate is beyond the initial shelter');
      assert.ok(gate.deadline<THEMES[round].time&&gate.deadline>0);
      if(index){assert.ok(gate.p>gates[index-1].p);assert.ok(gate.deadline>gates[index-1].deadline);}
    }
  }
});
test('forward gate crossings before and exactly at the deadline pass; late crossings are eliminated',()=>{
  for(const [elapsed,passes] of [[9,1],[10.5,1],[10.5001,0]]) {
    const {racers,course}=setup(1),r=racers[0];
    cross(racers,course,r,elapsed);
    assert.equal(r.gatePasses,passes);
    assert.equal(r.eliminated,!passes);
    if(passes){assert.ok(r.gateTimes[0]<=10);assert.ok(Math.abs(r.gateTimes[0]-(elapsed-.5))<1e-9);}
    else {assert.equal(r.eliminationGate,1);assert.equal(r.eliminatedAt,10);assert.equal(r.finished,false);}
  }
});
test('crossing outside the track, below the floor, above the gate or by respawn cannot qualify',()=>{
  for(const overrides of [{x:5.1},{y:-.151},{y:3.001}]) {
    const {racers,course}=setup(1),r=racers[0];cross(racers,course,r,9,overrides);
    assert.equal(r.gatePasses,0);stepTimedGates(racers,course,10,13.4,dt);assert.equal(r.eliminated,true);
  }
  const {racers,course}=setup(1),r=racers[0];r.p=9;const previous=previousPositions(racers);
  r.p=11;r.respawns++;
  stepTimedGates(racers,course,9,12.4,dt,previous);assert.equal(r.gatePasses,0);
  // Neither spawning beyond a line nor crossing it backwards awards a pass.
  const afterRespawn=previousPositions(racers);r.p=9;
  stepTimedGates(racers,course,9.1,12.5,.1,afterRespawn);assert.equal(r.gatePasses,0);
  r.p=11;stepTimedGates(racers,course,9.2,12.6,.1);assert.equal(r.gatePasses,0);
});
test('gate crossing uses the interpolated moving platform position and retains earlier passes after a fall',()=>{
  const {racers,course}=setup(1),r=racers[0],platform=course.platforms[0];
  Object.assign(platform,{kind:'moving',width:2,amplitude:3,speed:1,phase:0});
  const elapsed=4,time=4,crossTime=3.5;
  r.x=platformX(platform,crossTime);r.p=9;
  const previous=previousPositions(racers);r.p=11;
  stepTimedGates(racers,course,elapsed,time,1,previous);assert.equal(r.gatePasses,1);
  r.respawns++;r.p=0;stepTimedGates(racers,course,10,10,dt,previousPositions(racers));
  assert.equal(r.eliminated,false);assert.equal(r.gatePasses,1);assert.deepEqual(r.gateTimes,[3.5]);
});
test('deadline batches lock rankings by progress then ID and later eliminations never rewrite them',()=>{
  const {racers,course}=setup(6),[finished,leader,later,a,b,c]=racers;
  Object.assign(finished,{finished:true,place:1,finishTime:8,p:85,gatePasses:3});
  for(const r of [leader,later])Object.assign(r,{gatePasses:1,p:15});
  a.p=8;b.p=8;c.p=3;
  const first=stepTimedGates(racers,course,10,13.4,dt);
  assert.deepEqual(first.map(r=>r.id),[3,4,5]);assert.deepEqual(first.map(r=>r.eliminationPlace),[4,5,6]);
  assert.ok(first.every(r=>!r.finished&&r.points===0&&r.results.length===0));
  a.p=999;b.p=999;c.p=999;leader.gatePasses=3;leader.p=80;later.p=20;
  const second=stepTimedGates(racers,course,20,23.4,dt);assert.deepEqual(second.map(r=>r.id),[2]);assert.equal(later.eliminationPlace,3);
  assert.deepEqual(raceOrder(racers).map(r=>r.id),[0,1,2,3,4,5]);
  assert.deepEqual([a.eliminationPlace,b.eliminationPlace,c.eliminationPlace],[4,5,6]);
  const order=awardRound(racers,1,90);
  assert.deepEqual(order.map(r=>r.results[0].place),[1,2,3,4,5,6]);
  assert.equal(a.results[0].status,'eliminated');assert.equal(a.results[0].points,roundPoints(4,1,false));
  assert.equal(a.results[0].time,90);assert.equal(a.results[0].eliminatedAt,10);assert.equal(a.results[0].eliminationGate,1);
  assert.equal(leader.results[0].status,'timeout');assert.equal(finished.results[0].status,'finished');
});
test('eliminating either participant immediately releases both sides of a grab',()=>{
  for(const victimEliminates of [true,false]) {
    const {racers,course}=setup(2),[holder,victim]=racers;
    holder.grabTarget=victim.id;victim.grabbedBy=holder.id;
    const eliminated=victimEliminates?victim:holder,alive=victimEliminates?holder:victim;
    Object.assign(eliminated,{vx:5,vp:6,vy:3,grabHeld:true,pushHeld:true,jumpHeld:true,diveHeld:true,dive:.3});alive.gatePasses=1;
    stepTimedGates(racers,course,10,13.4,dt);
    assert.equal(holder.grabTarget,null);assert.equal(victim.grabbedBy,null);
    for(const key of ['vx','vp','vy','dive'])assert.equal(eliminated[key],0);
    for(const key of ['grabHeld','pushHeld','jumpHeld','diveHeld'])assert.equal(eliminated[key],false);
  }
});
test('eliminated racers cannot move, collide, grab, be grabbed, get targeted or suffer monster attacks',()=>{
  const {racers,course}=setup(2),[dead,alive]=racers;alive.gatePasses=1;
  stepTimedGates(racers,course,10,13.4,dt);
  Object.assign(dead,{x:0,p:10,y:0,grabImmune:0});Object.assign(alive,{x:1,p:10,y:0,grabImmune:0});
  const raw={x:1,forward:1,jump:true,dive:true,grab:true,push:true};
  assert.deepEqual(botInput(dead,course,14,racers),idle);
  assert.equal(effectiveInput(dead,raw).forward,0);
  stepRacer(dead,raw,course,14,dt);assert.equal(dead.x,0);assert.equal(dead.p,10);assert.equal(dead.y,0);
  resolveRacerCollisions(racers);assert.equal(dead.x,0);assert.equal(alive.x,1);
  course.covers=[{id:'wall',platformIndex:0,xOffset:0,p:10,width:2,depth:2,height:3}];
  resolveTerrainCollisions([dead],course,14);assert.equal(dead.x,0);assert.equal(dead.p,10);
  stepGrabs(racers,new Map([[0,{grab:true,push:true}],[1,{grab:true}]]),dt);
  assert.equal(dead.grabTarget,null);assert.equal(dead.grabbedBy,null);assert.equal(alive.grabTarget,null);assert.equal(alive.vx,0);
  const director=createMonsterDirector(1,0);alive.finished=true;
  assert.equal(beginMonsterEvent(director,course,racers,14,'water'),null);
  director.event={id:1,type:'water',x:0,p:10,width:10,depth:8,side:1,monsterX:11,startAt:0,attackAt:1,endAt:20,despawnAt:21,hitIds:[]};
  course.covers=[];stepMonsterEvents(director,course,racers,14,dt);applyMonsterHit(dead,'fire',1);
  assert.equal(dead.monsterHits,0);assert.equal(dead.vx,0);assert.equal(dead.charred,0);
});
test('next-round reset restores eliminated racers and keeps cumulative scores',()=>{
  const {racers,course}=setup(2);stepTimedGates(racers,course,10,13.4,dt);awardRound(racers,0,80);
  const scores=racers.map(r=>r.points);resetRacers(racers);
  racers.forEach((r,index)=>{
    assert.equal(r.eliminated,false);assert.equal(r.eliminationPlace,null);assert.equal(r.eliminatedAt,null);assert.equal(r.eliminationGate,null);assert.equal(r.eliminationProgress,null);
    assert.equal(r.gatePasses,0);assert.deepEqual(r.gateTimes,[]);assert.equal(r.points,scores[index]);assert.equal(r.results.length,1);assert.equal(r.finished,false);
  });
});
test('all 36 maps remain finishable with real AI, monsters and timed eliminations',()=>{
  const failures=[];let finishers=0,eliminated=0;
  for(let mapId=1;mapId<=36;mapId++) {
    const seed=1234+mapId*199,round=(mapId-1)%3,course=generateCourse(seed,round,mapId),racers=createRacers('AI gate test',seed),director=createMonsterDirector(seed^mapId,round);
    resetRacers(racers);director.nextAt+=3.4;
    for(let frame=0;frame<THEMES[round].time*60;frame++) {
      const elapsed=(frame+1)*dt,time=elapsed+3.4,previous=previousPositions(racers);
      for(const r of racers)advanceStatuses(r,dt);
      stepMonsterEvents(director,course,racers,time,dt);
      const inputs=new Map(racers.map(r=>[r.id,effectiveInput(r,botInput(r,course,time,racers,director.event))]));
      stepGrabs(racers,inputs,dt);
      for(const r of racers)stepRacer(r,inputs.get(r.id),course,time,dt);
      resolveRacerCollisions(racers,course,time);
      stepTimedGates(racers,course,elapsed,time,dt,previous);
      for(const r of racers)if(!r.finished&&!r.eliminated&&r.gatePasses===course.gates.length&&r.p>=course.length&&r.y>=-.1&&Math.abs(r.x-course.platforms.at(-1).x)<course.width/2){r.finished=true;r.finishTime=elapsed;r.place=racers.filter(other=>other.finished).length;}
      if(racers.every(r=>r.finished||r.eliminated))break;
    }
    const count=racers.filter(r=>r.finished).length;finishers+=count;eliminated+=racers.filter(r=>r.eliminated).length;
    if(count<1)failures.push({mapId,round,eliminated:racers.filter(r=>r.eliminated).length,gates:course.gates});
    assert.ok(racers.every(r=>Number.isFinite(r.x+r.y+r.p+r.vx+r.vy+r.vp)));
    for(const r of racers.filter(r=>r.finished))assert.ok(r.gateTimes.every((time,index)=>time<=course.gates[index].deadline));
    const order=awardRound(racers,round,THEMES[round].time);
    assert.equal(new Set(order.map(r=>r.results[0].place)).size,12);
    for(const r of racers.filter(r=>r.eliminated))assert.equal(r.results[0].place,r.eliminationPlace);
  }
  assert.deepEqual(failures,[]);assert.ok(finishers>36,`Only ${finishers} racers finished`);assert.ok(eliminated>36,`Only ${eliminated} racers were eliminated`);
});
