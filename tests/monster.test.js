import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,createRacers,resetRacers,stepRacer,stepGrabs} from '../src/game.js';
import {ATTACKS,createMonsterDirector,beginMonsterEvent,eventPhase,insideMonsterAttack,applyMonsterHit,stepMonsterEvents,advanceStatuses,effectiveInput} from '../src/monster.js';
const idle={x:0,forward:0,jump:false,dive:false,grab:false};
function setup(){const course=generateCourse(100,0,1),racers=createRacers('Player',100);resetRacers(racers);return {course,racers,director:createMonsterDirector(100,0)};}

test('every map has a reproducible encounter sequence; all four attacks occur each cycle',()=>{
  for(let id=1;id<=36;id++){
    const {racers}=setup(),course=generateCourse(42,0,id),a=createMonsterDirector(id,0),b=createMonsterDirector(id,0),types=[];
    for(let i=0;i<8;i++){
      const event=beginMonsterEvent(a,course,racers,i*8);assert.deepEqual(event,beginMonsterEvent(b,course,racers,i*8));types.push(event.type);
      assert.ok(Math.abs(event.monsterX-event.x)>event.width/2+3,'monster must remain outside the race track');
      assert.equal(eventPhase(event,event.startAt+.5),'warning');assert.equal(eventPhase(event,event.attackAt+.1),'attack');
    }
    assert.equal(new Set(types.slice(0,4)).size,4);assert.equal(new Set(types.slice(4)).size,4);
  }
});
test('warnings do no damage; attacks affect only unfinished racers in their visible zone',()=>{
  const {course,racers,director}=setup(),event=beginMonsterEvent(director,course,racers,0,'fire');
  for(const r of racers){r.x=event.x;r.p=event.p;r.y=0;}
  racers[1].x=event.x+event.width;racers[2].p=event.p+event.depth;racers[3].finished=true;racers[4].y=-3;
  stepMonsterEvents(director,course,racers,event.attackAt-.01,1/60);assert.ok(racers.every(r=>r.monsterHits===0));
  stepMonsterEvents(director,course,racers,event.attackAt+.01,1/60);assert.equal(racers[0].monsterHits,1);assert.equal(racers[5].monsterHits,1);
  for(const id of [1,2,3,4])assert.equal(racers[id].monsterHits,0);
  stepMonsterEvents(director,course,racers,event.attackAt+.2,1/60);assert.equal(racers[0].monsterHits,1,'one breath must not repeatedly reset the same debuff');
  stepMonsterEvents(director,course,racers,event.despawnAt+.1,1/60);assert.equal(director.event,null);assert.ok(director.nextAt>event.despawnAt);
});
test('fire chars and slows, water ejects, and ice blocks every gameplay action',()=>{
  const {course,racers}=setup(),[fire,water,ice,normal]=racers;for(const r of racers){r.x=0;r.p=0;}
  applyMonsterHit(fire,'fire',1);assert.equal(fire.charred,3.5);assert.equal(fire.burning,2.5);fire.stun=0;fire.y=0;fire.ground=true;fire.vy=0;
  for(let i=0;i<15;i++){stepRacer(fire,{...idle,forward:1},course,i/60,1/60);stepRacer(normal,{...idle,forward:1},course,i/60,1/60);}assert.ok(fire.p<normal.p*.8);
  water.x=course.platforms[0].width/2-.5;applyMonsterHit(water,'water',1);
  for(let i=0;i<120;i++){advanceStatuses(water,1/60);stepRacer(water,idle,course,i/60,1/60);}assert.equal(water.respawns,1);
  applyMonsterHit(ice,'ice',1);const input=effectiveInput(ice,{x:1,forward:1,jump:true,dive:true,grab:true});assert.equal(input.jump,false);assert.equal(input.dive,false);assert.equal(input.grab,false);
  stepRacer(ice,input,course,0,1/60);assert.equal(ice.x,0);assert.equal(ice.p,0);assert.equal(ice.y,0);
  advanceStatuses(ice,1.8);assert.equal(ice.frozen,0);assert.equal(effectiveInput(ice,{...idle,jump:true}).jump,true);
});
test('lightning paralyzes, then inverts movement and all action buttons for exactly five seconds',()=>{
  const {racers}=setup(),r=racers[0];applyMonsterHit(r,'lightning',1);
  const raw={x:1,forward:1,jump:true,dive:false,grab:true};assert.deepEqual(effectiveInput(r,raw),{x:0,forward:0,jump:false,dive:false,grab:false,push:false,backDive:false});
  for(let i=0;i<39;i++)advanceStatuses(r,1/60);assert.equal(r.paralyzed,0);assert.ok(Math.abs(r.reversed-5)<1e-9);
  const reversed=effectiveInput(r,raw);assert.equal(reversed.x,-1);assert.equal(reversed.forward,-1);assert.equal(reversed.jump,false);assert.equal(reversed.dive,true);assert.equal(reversed.grab,false);assert.equal(reversed.push,true);assert.equal(reversed.backDive,true);
  assert.equal(effectiveInput(r,{...idle,dive:true}).jump,true);
  for(let i=0;i<299;i++)advanceStatuses(r,1/60);assert.ok(r.reversed>0);advanceStatuses(r,1/60);assert.equal(r.reversed,0);
  assert.deepEqual(effectiveInput(r,raw),{...raw,push:false,backDive:false});
});
test('reversed E pushes away, reversed space dives backward, and neutral controls stay idle',()=>{
  const {racers,course}=setup(),[a,b]=racers;racers.splice(2);a.x=0;b.x=1.5;a.p=b.p=0;a.reversed=5;
  const mapped=effectiveInput(a,{...idle,grab:true});stepGrabs(racers,new Map([[a.id,mapped],[b.id,idle]]),1/60);assert.ok(b.vx>0);assert.equal(a.grabTarget,null);
  assert.equal(effectiveInput(a,idle).push,false);assert.equal(effectiveInput(a,idle).dive,false);
  stepRacer(a,effectiveInput(a,{...idle,jump:true}),course,0,1/60);assert.ok(a.vp<0);assert.ok(a.dive>0);
});
test('effects reset between rounds, and a lightning curse survives falling within its duration',()=>{
  const {racers,course}=setup(),r=racers[0];applyMonsterHit(r,'lightning',1);advanceStatuses(r,.65);r.y=-9;stepRacer(r,effectiveInput(r,idle),course,0,1/60);assert.ok(r.reversed>0);
  resetRacers(racers);assert.equal(r.reversed,0);assert.equal(r.frozen,0);assert.equal(r.charred,0);assert.equal(r.monsterHits,0);
});
