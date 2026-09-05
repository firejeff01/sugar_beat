import test from 'node:test';
import assert from 'node:assert/strict';
import {generateCourse,createRacers,resetRacers,stepRacer,botInput,separateRacers,awardRound,finalOrder,THEMES} from '../src/game.js';

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
      for(const r of racers) {stepRacer(r,botInput(r,course,time),course,time,1/60);if(!r.finished&&r.p>=course.length&&r.y>=-.1&&Math.abs(r.x-course.platforms.at(-1).x)<course.width/2){r.finished=true;r.finishTime=time;}}
      separateRacers(racers);if(racers.every(r=>r.finished))break;
    }
    const count=racers.filter(r=>r.finished).length;finishedTotal+=count;total+=12;
    if(count<9)failures.push({seed,round,count,positions:racers.filter(r=>!r.finished).map(r=>({p:r.p,falls:r.respawns}))});
  }
  assert.deepEqual(failures,[],JSON.stringify(failures));
  assert.ok(finishedTotal/total>.96,`Only ${finishedTotal}/${total} finished`);
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
