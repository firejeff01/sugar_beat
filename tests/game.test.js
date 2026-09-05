import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,createRacers,resetRacers,stepRacer,botInput,resolveRacerCollisions,awardRound,finalOrder,THEMES} from '../src/game.js';

test('same seed reproduces courses; new seeds change them; rounds get harder',()=>{
  assert.deepEqual(generateCourse(42,0),generateCourse(42,0));
  assert.notDeepEqual(generateCourse(42,0).platforms,generateCourse(43,0).platforms);
  const courses=[0,1,2].map(r=>generateCourse(42,r));
  for(let r=1;r<3;r++){assert.ok(courses[r].length>courses[r-1].length);assert.ok(courses[r].width<courses[r-1].width);assert.ok(courses[r].obstacles.length>courses[r-1].obstacles.length);}
  for(let seed=0;seed<100;seed++)for(let r=0;r<3;r++) {
    const c=generateCourse(seed,r);
    for(let i=1;i<c.platforms.length;i++){const a=c.platforms[i-1],b=c.platforms[i];assert.ok(b.start-a.end<3);assert.ok(Math.abs(a.x-b.x)<1.6);assert.ok(b.width>=10);}
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
test('AI completes varied generated courses using the same movement and collision simulation',()=>{
  const failures=[];let finishedTotal=0,total=0;
  for(let seed=1;seed<=12;seed++) for(let round=0;round<3;round++) {
    const course=generateCourse(seed,round),racers=createRacers('AI test',seed);resetRacers(racers);
    for(let step=0;step<THEMES[round].time*60;step++) {
      const time=step/60;
      for(const r of racers) stepRacer(r,botInput(r,course,time),course,time,1/60);
      resolveRacerCollisions(racers);
      for(const r of racers)if(!r.finished&&r.p>=course.length&&r.y>=-.1&&Math.abs(r.x-course.platforms.at(-1).x)<course.width/2){r.finished=true;r.finishTime=time;}
      if(racers.every(r=>r.finished))break;
    }
    const count=racers.filter(r=>r.finished).length;finishedTotal+=count;total+=12;
    if(count<9)failures.push({seed,round,count,positions:racers.filter(r=>!r.finished).map(r=>({p:r.p,falls:r.respawns}))});
  }
  assert.deepEqual(failures,[],JSON.stringify(failures));
  assert.ok(finishedTotal/total>.96,`Only ${finishedTotal}/${total} finished`);
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
