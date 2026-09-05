import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,MAP_CATALOG,selectMapIds,platformAt,platformX,obstaclePose,createRacers,resetRacers,stepRacer,stepGrabs,GRAB,botInput,resolveRacerCollisions,awardRound,finalOrder,THEMES} from '../src/game.js';
import {createMonsterDirector,advanceStatuses,stepMonsterEvents,effectiveInput} from '../src/monster.js';
import {coverBoxes,isSheltered,shelterSpots} from '../src/cover.js';

test('same seed reproduces courses; new seeds change them; rounds get harder',()=>{
  assert.deepEqual(generateCourse(42,0),generateCourse(42,0));
  assert.notDeepEqual(generateCourse(42,0).platforms,generateCourse(43,0).platforms);
  assert.equal(MAP_CATALOG.length,36);assert.equal(new Set(MAP_CATALOG.map(m=>m.name)).size,36);
  const courses=[0,1,2].map(r=>generateCourse(42,r));
  for(let r=1;r<3;r++){assert.ok(courses[r].length>courses[r-1].length);assert.ok(courses[r].width<courses[r-1].width);assert.ok(courses[r].obstacles.length>courses[r-1].obstacles.length);}
  for(let seed=0;seed<100;seed++)for(let r=0;r<3;r++) {
    const c=generateCourse(seed,r);
    assert.equal(new Set(selectMapIds(seed)).size,3);assert.ok(new Set(c.platforms.map(p=>p.kind)).size>=6);
    assert.ok(c.width<=9.2&&c.platforms.length>=12&&c.obstacles.length>=16);assert.equal(c.map.difficulty,'極難');
    for(let i=1;i<c.platforms.length;i++){const a=c.platforms[i-1],b=c.platforms[i];assert.ok(b.start-a.end<3);assert.ok(Math.abs(a.x-b.x)<1.8);assert.ok(b.width>=4.59);for(const time of [0,1,3,5]){assert.ok(Math.abs(platformX(a,time)-platformX(b,time+.6))<(a.width+b.width)/2-2,'landing zones must overlap');}}
  }
});
test('keyboard motion, jump, dive cooldown, and fall recovery are simulated',()=>{
  const c=generateCourse(1,0),[r]=createRacers('Player',1);resetRacers([r]);
  const input={x:0,forward:1,jump:false,dive:false};
  for(let i=0;i<60;i++)stepRacer(r,input,c,i/60,1/60);assert.ok(r.p>7);
  stepRacer(r,{...input,jump:true},c,1,1/60);assert.ok(r.y>0);assert.ok(r.vy>0);
  stepRacer(r,{...input,dive:true},c,1.1,1/60);assert.ok(r.dive>0);assert.ok(r.diveCooldown>1);
  r.x=100;r.y=-9;stepRacer(r,input,c,2,1/60);assert.equal(r.respawns,1);assert.equal(r.x,r.checkpoint.x);
});
test('AI reaches terrain shelter, holds behind the wall, and resumes after the attack',()=>{
  const course=generateCourse(11,0),[r]=createRacers('Shelter test',11);resetRacers([r]);
  Object.assign(r,{x:-2.5,p:6,lane:-2.5,skill:1});
  const event={side:1,monsterX:11.6,x:0,p:10,width:13.8,depth:5,startAt:0,attackAt:1.65,endAt:3.1};
  event.shelters=shelterSpots(event,course,0);
  for(let step=0;step<150;step++){
    const time=step/60,input=botInput(r,course,time,[r],event);
    stepRacer(r,input,course,time,1/60);resolveRacerCollisions([r],course,time);
  }
  assert.ok(isSheltered(event,r,coverBoxes(course,2.5)),'AI must physically enter the protected side');
  assert.ok(Math.abs(r.p-event.p)<.4);assert.equal(r.respawns,0);
  for(let step=150;step<300;step++){
    const time=step/60,input=botInput(r,course,time,[r],event);
    stepRacer(r,input,course,time,1/60);resolveRacerCollisions([r],course,time);
  }
  assert.ok(r.p>14,'AI must leave shelter and continue racing after the attack');
});
test('AI already leaving an attack keeps its gap jump instead of returning to shelter',()=>{
  const generated=generateCourse(11,0),first=generated.platforms[0];
  const second={...first,start:18.6,end:40,width:10};
  const course={...generated,platforms:[first,second],covers:[generated.covers[0]],obstacles:[],length:36};
  const [r]=createRacers('Gap test',11);resetRacers([r]);Object.assign(r,{x:-1.5,p:14.5,vp:8.8,lane:-1.5,skill:1});
  const event={side:1,monsterX:11.6,x:0,p:10,width:13.8,depth:5,startAt:0,attackAt:1.65,endAt:4};
  event.shelters=shelterSpots(event,course,1);
  let jumped=false;
  for(let step=0;step<60;step++){
    const time=1+step/60,input=botInput(r,course,time,[r],event);
    stepRacer(r,input,course,time,1/60);resolveRacerCollisions([r],course,time);jumped||=r.y>.5;
  }
  assert.ok(jumped);assert.ok(r.p>second.start&&r.ground,'AI must land across the real gap');assert.equal(r.respawns,0);
});
test('all 36 extreme maps run with AI, collision, grabbing and random monster attacks',()=>{
  const failures=[];let finishedTotal=0,total=0,grabs=0,escapes=0,hits=0;
  for(let mapId=1;mapId<=36;mapId++) {
    const seed=1234+mapId*199,round=(mapId-1)%3,course=generateCourse(seed,round,mapId),racers=createRacers('AI test',seed),director=createMonsterDirector(seed^mapId,round);resetRacers(racers);director.nextAt+=3.4;
    for(let step=0;step<THEMES[round].time*60;step++) {
      const time=step/60+3.4;
      for(const r of racers)advanceStatuses(r,1/60);
      stepMonsterEvents(director,course,racers,time,1/60);
      const inputs=new Map(racers.map(r=>[r.id,effectiveInput(r,botInput(r,course,time,racers,director.event))]));
      stepGrabs(racers,inputs,1/60);
      for(const r of racers) stepRacer(r,inputs.get(r.id),course,time,1/60);
      resolveRacerCollisions(racers,course,time);
      for(const r of racers)if(!r.finished&&r.p>=course.length&&r.y>=-.1&&Math.abs(r.x-course.platforms.at(-1).x)<course.width/2){r.finished=true;r.finishTime=time;}
      if(racers.every(r=>r.finished))break;
    }
    const count=racers.filter(r=>r.finished).length;finishedTotal+=count;total+=12;
    grabs+=racers.reduce((n,r)=>n+r.grabs,0);escapes+=racers.reduce((n,r)=>n+r.escapes,0);
    hits+=racers.reduce((n,r)=>n+r.monsterHits,0);assert.equal(new Set(director.history.map(e=>e.type)).size,4);
    assert.ok(racers.every(r=>Number.isFinite(r.x+r.y+r.p+r.vx+r.vy+r.vp)));
    // Every map is now extreme. Timeouts are expected, but each must be finishable.
    if(count<1)failures.push({mapId,round,count});
  }
  assert.ok(failures.length===0,JSON.stringify(failures));
  assert.ok(finishedTotal/total>.4,`Only ${finishedTotal}/${total} finished`);
  assert.ok(grabs>30&&escapes>10&&hits>100,'AI must grab, escape and suffer real monster effects');
});

function collisionPair() {
  const racers=createRacers('Player',1).slice(0,2);resetRacers(racers);
  Object.assign(racers[0],{x:0,p:0});Object.assign(racers[1],{x:1,p:0});return racers;
}
test('head-on player / AI collisions exchange momentum and rebound without adding energy',()=>{
  const [a,b]=collisionPair();a.vx=8;b.vx=-6;a.vp=2;b.vp=2;
  const energy=a.vx*a.vx+b.vx*b.vx;
  resolveRacerCollisions([a,b]);
  assert.ok(a.vx<0 && b.vx>0);assert.ok(Math.abs(a.vx+b.vx-2)<1e-9);
  assert.ok(a.vx*a.vx+b.vx*b.vx<=energy);assert.equal(a.vp,2);assert.equal(b.vp,2);
  assert.ok(a.impact>0 && b.impact>0);assert.ok(b.x-a.x>=1.117);
});
test('rear impacts slow the attacker and push the target; faster dives hit harder',()=>{
  function collide(speed,dive) {const [a,b]=collisionPair();a.x=b.x=0;b.p=1;a.vp=speed;a.dive=dive;resolveRacerCollisions([a,b]);return [a,b];}
  const [runner,target]=collide(8.8,0),[diver,divedTarget]=collide(14,.4);
  assert.ok(target.vp>4);assert.ok(runner.vp<8.8);
  assert.ok(divedTarget.vp>target.vp);assert.equal(diver.dive,0);
  const speed=divedTarget.vp;
  stepRacer(divedTarget,{x:0,forward:0,jump:false,dive:false},generateCourse(1,0),0,1/60);
  assert.ok(divedTarget.vp>speed*.9,'movement input must not immediately erase a shove');
});
test('body shoves can push another racer off a platform and trigger checkpoint recovery',()=>{
  const [a,b]=collisionPair(),course=generateCourse(1,0);
  a.x=5.1;b.x=6.1;a.vx=14;resolveRacerCollisions([a,b]);
  const input={x:0,forward:0,jump:false,dive:false};
  for(let i=0;i<120;i++)stepRacer(b,input,course,i/60,1/60);
  assert.equal(b.respawns,1);assert.equal(b.x,b.checkpoint.x);
});
test('capsule height allows clear jumps; completed racers do not block the finish',()=>{
  const [a,b]=collisionPair();a.vx=8;b.y=2;
  resolveRacerCollisions([a,b]);assert.equal(a.vx,8);assert.equal(b.vx,0);
  b.y=0;b.finished=true;resolveRacerCollisions([a,b]);assert.equal(a.vx,8);assert.equal(b.vx,0);
  b.finished=false;b.y=.9;resolveRacerCollisions([a,b]);assert.ok(b.vx>0,'low jumps still contact the other body');
});
test('overlap correction is finite and separating bodies receive no extra impulse',()=>{
  const [a,b]=collisionPair();b.x=0;resolveRacerCollisions([a,b]);
  assert.ok(Number.isFinite(a.x+a.p+b.x+b.p));assert.ok(Math.hypot(a.x-b.x,a.p-b.p)>1.11);
  a.x=0;a.p=0;b.x=1;b.p=0;a.vx=-4;b.vx=4;
  resolveRacerCollisions([a,b]);assert.equal(a.vx,-4);assert.equal(b.vx,4);
});
test('packed AI crowds transmit impulses without invalid or explosive velocities',()=>{
  const racers=createRacers('Player',3);resetRacers(racers);
  racers.forEach((r,i)=>Object.assign(r,{x:i*1.05,p:0,vx:i===0?14:0}));
  resolveRacerCollisions(racers);
  assert.ok(racers[2].vx>0);assert.ok(Math.abs(racers.reduce((sum,r)=>sum+r.vx,0)-14)<1e-9);
  assert.ok(racers.every(r=>Number.isFinite(r.x+r.p+r.vx+r.vp)));
  assert.ok(racers.reduce((sum,r)=>sum+r.vx*r.vx+r.vp*r.vp,0)<=196);
});

const grabInputs=(grab=true,dive=false)=>new Map([[0,{grab}],[1,{dive,grab:false}]]);
function grabPair(){const racers=collisionPair();racers.forEach(r=>r.grabImmune=0);racers[1].x=1.7;return racers;}
test('holding grab catches the nearest eligible racer and transfers a pulling impulse',()=>{
  const racers=grabPair(),[a,b]=racers;stepGrabs(racers,grabInputs(),1/60);
  assert.equal(a.grabTarget,b.id);assert.equal(b.grabbedBy,a.id);assert.equal(a.grabs,1);
  assert.ok(b.vx<0&&a.vx>0);assert.ok(Math.abs(a.vx+b.vx)<1e-9);
  stepGrabs(racers,grabInputs(false),1/60);assert.equal(a.grabTarget,null);assert.equal(b.grabbedBy,null);assert.ok(a.grabCooldown>2);assert.ok(b.grabImmune>1);
  stepGrabs(racers,grabInputs(),1/60);assert.equal(a.grabTarget,null,'cooldown prevents immediate regrabbing');
});
test('grab range, height, protection and completed racers are respected',()=>{
  for(const overrides of [{x:3},{y:2},{grabImmune:1},{finished:true}]){
    const racers=grabPair();Object.assign(racers[1],overrides);stepGrabs(racers,grabInputs(),1/60);assert.equal(racers[0].grabTarget,null);
  }
  const rs=grabPair();rs[1].x=4;stepGrabs(rs,grabInputs(),1/60);rs[1].x=1.7;
  for(let i=0;i<20;i++)stepGrabs(rs,grabInputs(),1/60);
  assert.equal(rs[0].grabTarget,1,'holding E must catch a racer that comes into range');
});
test('grabs time out without auto-repeating while E stays held; Shift escapes when ready',()=>{
  const racers=grabPair(),[a,b]=racers;stepGrabs(racers,grabInputs(),1/60);
  for(let i=0;i<60;i++)stepGrabs(racers,grabInputs(),1/60);
  assert.equal(a.grabTarget,null);assert.equal(a.grabs,1);assert.equal(b.grabbedBy,null);
  const second=grabPair();stepGrabs(second,grabInputs(),1/60);stepGrabs(second,grabInputs(true,true),1/60);
  assert.equal(second[0].grabTarget,null);assert.equal(second[1].escapes,1);assert.ok(second[1].grabImmune>1);
  const third=grabPair();stepGrabs(third,grabInputs(),1/60);third[1].diveCooldown=.5;stepGrabs(third,grabInputs(true,true),1/60);assert.equal(third[0].grabTarget,1);
});
test('falls and finishes release a grab; three racers cannot form a grab chain',()=>{
  for(const overrides of [{y:-1},{finished:true},{x:5}]){const rs=grabPair();stepGrabs(rs,grabInputs(),1/60);Object.assign(rs[1],overrides);stepGrabs(rs,grabInputs(),1/60);assert.equal(rs[0].grabTarget,null);assert.equal(rs[1].grabbedBy,null);}
  const rs=createRacers('Player',1).slice(0,3);resetRacers(rs);rs.forEach((r,i)=>Object.assign(r,{x:i*1.2,p:0,grabImmune:0}));
  stepGrabs(rs,new Map(rs.map(r=>[r.id,{grab:true}])),1/60);
  assert.equal(rs.filter(r=>r.grabTarget!==null).length,1);assert.equal(rs[1].grabTarget,null);assert.equal(rs[2].grabTarget,null);
});
test('split paths have real holes and safe aprons; moving platforms carry grounded racers',()=>{
  const c=generateCourse(3,2),split=c.platforms.find(p=>p.kind==='split'),moving=c.platforms.find(p=>p.kind==='moving');
  assert.equal(platformAt(c,split.x,split.start+8),undefined);assert.equal(platformAt(c,split.x+3,split.start+8),split);assert.equal(platformAt(c,split.x,split.start+2),split);
  const [r]=createRacers('test',1);resetRacers([r]);r.x=platformX(moving,1);r.p=moving.start+4;
  stepRacer(r,{x:0,forward:0},c,1.1,.1);assert.ok(Math.abs(r.x-platformX(moving,1.1))<1e-8);assert.equal(r.y,0);
});
test('ice retains lateral inertia; conveyor belts move idle racers',()=>{
  const c=generateCourse(3,2);c.obstacles=[];
  const [iceR,plainR,beltR]=createRacers('test',1);resetRacers([iceR,plainR,beltR]);
  const ice=c.platforms.find(s=>s.kind==='ice'),belt=c.platforms.find(s=>s.kind==='conveyor');
  Object.assign(iceR,{x:ice.x,p:ice.start+3,vx:6});Object.assign(plainR,{x:0,p:0,vx:6});
  const idle={x:0,forward:0};stepRacer(iceR,idle,c,.1,.1);stepRacer(plainR,idle,c,.1,.1);assert.ok(iceR.vx>plainR.vx*2);
  Object.assign(beltR,{x:belt.x,p:belt.start+3});stepRacer(beltR,idle,c,.1,.1);assert.ok(Math.abs(beltR.x-belt.x-belt.beltX*.1)<1e-8);assert.ok(beltR.p<belt.start+3);
});
test('pistons, swinging hammers and gusts affect actual physics',()=>{
  const course=generateCourse(1,0),ob={x:0,p:0,offset:0,radius:3,phase:0,speed:1,direction:1};
  const make=()=>{const [r]=createRacers('test',1);resetRacers([r]);r.x=0;r.p=0;return r;};
  const piston=make();course.obstacles=[{...ob,kind:'piston'}];stepRacer(piston,{x:0,forward:0},course,Math.PI/2,1/60);assert.ok(piston.stun>0);
  const hammer=make();course.obstacles=[{...ob,kind:'hammer'}];stepRacer(hammer,{x:0,forward:0},course,0,1/60);assert.ok(hammer.vx>0&&hammer.stun>0);
  const wind=make();course.obstacles=[{...ob,kind:'fan'}];stepRacer(wind,{x:0,forward:0},course,0,1/60);assert.ok(wind.vx>0);
  assert.notEqual(obstaclePose({...ob,kind:'piston'},0).height,obstaclePose({...ob,kind:'piston'},Math.PI/2).height);
});
test('all 12 racers receive three scores; DNF half points; ties resolved by elapsed time',()=>{
  const racers=createRacers('<script>name</script>',99);resetRacers(racers);
  for(let round=0;round<3;round++) {
    racers.forEach((r,i)=>{r.finished=i!==11;r.place=i+1;r.finishTime=i!==11?20+i:null;r.p=100-i;});
    awardRound(racers,round,80);
  }
  assert.equal(racers[0].points,540);assert.equal(racers[11].points,23);
  assert.ok(racers.every(r=>r.results.length===3));assert.equal(finalOrder(racers)[0].id,0);
  racers[1].points=racers[0].points;racers[1].totalTime=1;assert.equal(finalOrder(racers)[0].id,1);
});
