import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,createRacers,resetRacers,stepRacer,stepGrabs,resolveRacerCollisions,GRAB} from '../src/game.js';
import {ATTACKS,createMonsterDirector,beginMonsterEvent,eventPhase,insideMonsterAttack,applyMonsterHit,stepMonsterEvents,advanceStatuses,effectiveInput} from '../src/monster.js';
const idle={x:0,forward:0,jump:false,dive:false,grab:false};
function setup(){const course=generateCourse(100,0,1),racers=createRacers('Player',100);resetRacers(racers);return {course,racers,director:createMonsterDirector(100,0)};}
function shelterEncounter(type,side=1){
  const {course,racers,director}=setup();
  course.platforms=[{...course.platforms[0],start:-10,end:30}];course.obstacles=[];course.length=26;
  course.covers=[{id:'test-wall',platformIndex:0,xOffset:0,p:10}];
  const event=beginMonsterEvent(director,course,racers,0,type);
  Object.assign(event,{side,monsterX:side*11.6,x:0,p:10});
  for(const r of racers){r.x=-side*1.4;r.p=10;r.y=0;}
  return {course,racers,director,event};
}

test('every map has a reproducible encounter sequence; all four attacks occur each cycle',()=>{
  for(let id=1;id<=36;id++){
    const {racers}=setup(),course=generateCourse(42,0,id),a=createMonsterDirector(id,0),b=createMonsterDirector(id,0),types=[];
    for(let i=0;i<8;i++){
      const event=beginMonsterEvent(a,course,racers,i*8);assert.deepEqual(event,beginMonsterEvent(b,course,racers,i*8));types.push(event.type);
      assert.ok(Math.abs(event.monsterX-event.x)>event.width/2+3,'monster must remain outside the race track');
      assert.ok(course.covers.some(c=>c.p===event.p),'each event must aim at a terrain shelter');
      assert.ok(event.shelters.length>0,'each warning must identify a usable hiding position');
      assert.equal(eventPhase(event,event.startAt+.5),'warning');assert.equal(eventPhase(event,event.attackAt+.1),'attack');
    }
    assert.equal(new Set(types.slice(0,4)).size,4);assert.equal(new Set(types.slice(4)).size,4);
  }
});
test('warnings do no damage; attacks affect only unfinished racers in their visible zone',()=>{
  const {course,racers,director}=setup();course.covers=[];
  const event=beginMonsterEvent(director,course,racers,0,'fire');
  for(const r of racers){r.x=event.x;r.p=event.p;r.y=0;}
  racers[1].x=event.x+event.width;racers[2].p=event.p+event.depth;racers[3].finished=true;racers[4].y=-3;
  stepMonsterEvents(director,course,racers,event.attackAt-.01,1/60);assert.ok(racers.every(r=>r.monsterHits===0));
  stepMonsterEvents(director,course,racers,event.attackAt+.01,1/60);assert.equal(racers[0].monsterHits,1);assert.equal(racers[5].monsterHits,1);
  for(const id of [1,2,3,4])assert.equal(racers[id].monsterHits,0);
  stepMonsterEvents(director,course,racers,event.attackAt+.2,1/60);assert.equal(racers[0].monsterHits,1,'one breath must not repeatedly reset the same debuff');
  stepMonsterEvents(director,course,racers,event.despawnAt+.1,1/60);assert.equal(director.event,null);assert.ok(director.nextAt>event.despawnAt);
});
test('wafer terrain shelters all four attacks from either side, but leaving cover exposes racers immediately',()=>{
  for(const type of Object.keys(ATTACKS))for(const side of [-1,1]){
    const {course,racers,director,event}=shelterEncounter(type,side),[hidden,exposed,leaving,jumping,finished]=racers;
    exposed.x=side*1.4;jumping.y=1.8;finished.finished=true;
    stepMonsterEvents(director,course,racers,event.attackAt-.01,1/60);
    assert.equal(hidden.sheltered,true,`${type}: warning shows the protected side`);
    assert.equal(exposed.sheltered,false,`${type}: the monster-facing side is unsafe`);
    assert.ok(racers.every(r=>r.monsterHits===0));
    stepMonsterEvents(director,course,racers,event.attackAt+.01,1/60);
    assert.equal(hidden.monsterHits,0,`${type}: cover blocks the attack`);
    assert.equal(exposed.monsterHits,1,`${type}: exposed racer is hit`);
    assert.equal(jumping.monsterHits,1,`${type}: jumping above cover exposes the body`);
    assert.equal(finished.sheltered,false);assert.equal(finished.monsterHits,0);
    leaving.p+=1.5;
    stepMonsterEvents(director,course,racers,event.attackAt+.1,1/60);
    assert.equal(leaving.sheltered,false);assert.equal(leaving.monsterHits,1,`${type}: walking or being dragged out of cover causes a hit`);
    assert.equal(hidden.monsterHits,0);
    hidden.p=event.p+event.depth;
    stepMonsterEvents(director,course,racers,event.attackAt+.2,1/60);assert.equal(hidden.sheltered,false,'outside the attack is not presented as terrain cover');
  }
});
test('returning to cover stops continuous water pressure without clearing existing effects or momentum',()=>{
  const {course,racers,director,event}=shelterEncounter('water'),r=racers[0];
  r.x=1.4;stepMonsterEvents(director,course,racers,event.attackAt+.01,1/60);
  assert.equal(r.monsterHits,1);const initialVelocity=r.vx;assert.ok(initialVelocity<-14);
  stepMonsterEvents(director,course,racers,event.attackAt+.02,1/60);assert.ok(r.vx<initialVelocity,'exposure sustains the water push');
  r.x=-1.4;r.y=0;const carriedVelocity=r.vx,remainingSoaked=r.soaked;
  stepMonsterEvents(director,course,racers,event.attackAt+.03,1/60);
  assert.equal(r.sheltered,true);assert.equal(r.vx,carriedVelocity,'cover stops new water force while preserving existing inertia');
  assert.equal(r.soaked,remainingSoaked,'terrain does not cure an existing status');assert.equal(r.monsterHits,1);
  stepMonsterEvents(director,course,racers,event.endAt+.1,1/60);assert.equal(r.sheltered,false);
  director.event=null;director.nextAt=Infinity;r.sheltered=true;
  stepMonsterEvents(director,course,racers,event.endAt+.2,1/60);assert.equal(r.sheltered,false,'no stale shelter indicator between events');
});
test('a real grab can drag a sheltered rival into a monster attack while the solid wall blocks sideways motion',()=>{
  function simulate(grab){
    const {course,racers,director,event}=shelterEncounter('ice'),[holder,victim]=racers;racers.splice(2);
    Object.assign(holder,{x:-.65,p:12.6,grabImmune:0});
    Object.assign(victim,{x:-1.14,p:10.64,grabImmune:0});
    const initialP=victim.p,dt=1/60,inputs=new Map([[holder.id,{...idle,forward:1,grab}],[victim.id,idle]]);
    stepMonsterEvents(director,course,racers,event.attackAt,dt);
    assert.equal(victim.sheltered,true);assert.equal(victim.monsterHits,0);
    assert.equal(insideMonsterAttack(event,holder),false,'the rival pulls from just beyond the attack zone');
    let wallContact=false,elapsed=0;
    for(let frame=0;frame<50;frame++){
      const time=event.attackAt+frame*dt;elapsed=frame*dt;
      for(const r of racers)advanceStatuses(r,dt);
      stepMonsterEvents(director,course,racers,time,dt);
      if(victim.monsterHits)break;
      stepGrabs(racers,inputs,dt);
      for(const r of racers)stepRacer(r,effectiveInput(r,inputs.get(r.id)),course,time,dt);
      resolveRacerCollisions(racers,course,time);
      // Distance from each capsule centre to the rectangular wall must remain >= its radius.
      for(const r of racers){
        const dx=Math.max(Math.abs(r.x)-.575,0),dp=Math.max(Math.abs(r.p-10)-1.05,0);
        assert.ok(Math.hypot(dx,dp)>=.56-1e-6,'grabbing must not pull either body through the wall');
      }
      wallContact ||= Math.abs(victim.x+1.13501)<1e-5;
    }
    return {holder,victim,elapsed,wallContact,initialP};
  }
  const dragged=simulate(true),undisturbed=simulate(false);
  assert.equal(dragged.holder.grabs,1);assert.equal(dragged.victim.grabbedBy,dragged.holder.id);
  assert.ok(dragged.elapsed<GRAB.duration,'the exposure happens during one legal grab');
  assert.ok(dragged.victim.p>dragged.initialP+.05,'tether forces move the victim along the wall and out of cover');
  assert.equal(dragged.wallContact,true,'the diagonal pull actually contacts the solid wall');
  assert.equal(dragged.victim.sheltered,false);assert.equal(dragged.victim.monsterHits,1);
  assert.equal(dragged.victim.lastMonsterHit,'ice');assert.ok(dragged.victim.frozen>0);
  assert.equal(undisturbed.victim.monsterHits,0);assert.equal(undisturbed.victim.sheltered,true);
  assert.equal(undisturbed.victim.p,undisturbed.initialP,'without the grab the idle rival stays protected');
});
test('moving terrain changes shelter positions and occlusion during an active attack',()=>{
  const {course,racers,director,event}=shelterEncounter('fire'),r=racers[0];
  Object.assign(course.platforms[0],{kind:'moving',amplitude:3,speed:1,phase:Math.PI-event.attackAt});
  stepMonsterEvents(director,course,racers,event.attackAt,1/60);
  assert.equal(r.sheltered,true);assert.equal(r.monsterHits,0);
  const previousShelterX=event.shelters[0].x;
  stepMonsterEvents(director,course,racers,event.attackAt+.9,1/60);
  assert.ok(event.shelters[0].x<previousShelterX-1,'safe positions track the drifting terrain');
  assert.equal(r.sheltered,false,'a wall which moved behind the racer no longer blocks the attack');
  assert.equal(r.monsterHits,1);
});
test('fire chars and slows, water ejects, and ice blocks every gameplay action',()=>{
  const {course,racers}=setup(),[fire,water,ice,normal]=racers;for(const r of racers){r.x=0;r.p=0;}
  normal.id=fire.id; // Compare equal manual steering; AI intentionally retains its route tuning.
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
