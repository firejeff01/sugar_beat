export const COLORS = [0xff508d,0x33dbce,0xffc64b,0x9e83ff,0x57aaff,0xff865c,0x91d957,0xf775d2,0x5dd9ff,0xc7a3ff,0xffda82,0x55c7a2];
export const BOT_NAMES = ['麻糬隊長','布丁暴走','薄荷閃電','芋泥球','檸檬蹦蹦','奶油小偷','泡泡糖','藍莓火箭','焦糖旋風','桃子汽水','棉花糖'];
export const THEMES = [
  { name:'糖霜起跑線', tag:'SUGAR SPRINT', hint:'繞過軟糖路障，跳過旋轉棒與平台間隙。', color:0x39d4c5, sky:0xbbeefe, time:80 },
  { name:'果凍搖擺橋', tag:'JELLY JUNCTION', hint:'路面變窄！觀察移動路障，找準跳躍時機。', color:0xa58aff, sky:0xd7ceff, time:90 },
  { name:'皇冠狂想曲', tag:'CROWN CHAOS', hint:'更快的旋轉棒、更長的賽道。衝向最後的皇冠！', color:0xffbd4a, sky:0xffdfc3, time:100 },
];
export function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function generateCourse(seed, round) {
  const random = rng(seed + round * 123457), platforms=[], obstacles=[];
  const count=8+round*2, width=13-round*1.45;
  let start=-7, center=0;
  for(let i=0;i<count;i++) {
    const length=i===0?23:15+random()*4;
    if(i>0) center=clamp(center+(random()-.5)*3,-3,3);
    platforms.push({start,end:start+length,x:center,width});
    if(i>0 && i<count-1) {
      const kind=(i+round)%3===0?'sweeper':(round>0 && i%2===0?'slider':'bumpers');
      obstacles.push({kind,p:start+length*.53,x:center,phase:random()*Math.PI*2,speed:(.8+random()*.35)*(1+round*.4),radius:width*.42,offset:(random()-.5)*3});
    }
    start+=length+(i===0?0:1.6+round*.4+random()*.45);
  }
  return {seed,round,platforms,obstacles,length:platforms.at(-1).end-4,width};
}
export function obstaclePose(ob,time) {
  return { x:ob.kind==='slider'?ob.x+Math.sin(time*ob.speed+ob.phase)*ob.radius*.8:ob.x+ob.offset, angle:time*ob.speed+ob.phase };
}
export function platformAt(course,x,p,margin=0) { return course.platforms.find(s=>p>=s.start && p<=s.end && Math.abs(x-s.x)<=s.width/2+margin); }
export function createRacers(name,seed) {
  const random=rng(seed);
  return [name,...BOT_NAMES].map((name,id)=>({id,name,color:COLORS[id],skill:.87+random()*.2,lane:(random()-.5)*5,points:0,results:[],totalTime:0}));
}
export function resetRacers(racers) {
  racers.forEach((r,i)=>Object.assign(r,{x:(i%4-1.5)*2,p:-Math.floor(i/4)*2,y:0,vx:0,vp:0,vy:0,ground:true,checkpoint:{x:0,p:0},finished:false,finishTime:null,place:0,stun:0,dive:0,diveCooldown:0,respawns:0,jumpHeld:false,diveHeld:false,maxP:0}));
}
export function botInput(r,course,time) {
  const segment=course.platforms.find(s=>s.end>r.p+2) || course.platforms.at(-1);
  let target=segment.x+clamp(r.lane,-segment.width/2+1.4,segment.width/2-1.4);
  let jump=false;
  const current=course.platforms.find(s=>r.p>=s.start && r.p<=s.end);
  if(current && current.end-r.p<2.1 && current.end<course.length) {
    jump=true;
    const next=course.platforms[course.platforms.indexOf(current)+1];
    if(next) target=next.x+clamp(r.lane,-next.width/2+1.5,next.width/2-1.5);
  }
  for(const ob of course.obstacles) {
    if(ob.p-r.p > -1.7 && ob.p-r.p<10) {
      if(ob.kind==='sweeper') { if(Math.abs(ob.p-r.p)<4) jump=true; }
      else if(ob.kind==='slider') {
        const pose=obstaclePose(ob,time+.3);
        target=segment.x+(pose.x>segment.x?-1:1)*(segment.width/2-1.8);
      } else {
        target=segment.x;
      }
    }
  }
  return {x:clamp((target-r.x)*1.5,-1,1),forward:1,jump,dive:false};
}
function hit(r,dx,dp,strength=7) {
  if(r.stun>0 || r.y>2) return;
  const length=Math.hypot(dx,dp)||1;
  r.vx=dx/length*strength;r.vp=dp/length*strength;r.vy=5;r.ground=false;r.stun=.5;
}
export function stepRacer(r,input,course,time,dt) {
  if(r.finished) return;
  r.stun=Math.max(0,r.stun-dt);r.dive=Math.max(0,r.dive-dt);r.diveCooldown=Math.max(0,r.diveCooldown-dt);
  const speed=8.8*(r.id===0?1:r.skill), norm=Math.max(1,Math.hypot(input.x,input.forward));
  if(r.stun<=0) {
    const lerp=1-Math.exp(-dt*(r.ground?14:5));
    const boost=r.dive>0?1.65:1;
    r.vx+=(input.x/norm*speed*boost-r.vx)*lerp;
    r.vp+=(input.forward/norm*speed*boost-r.vp)*lerp;
  }
  if(input.jump && !r.jumpHeld && r.ground && r.stun<=0) {r.vy=9.7;r.ground=false;}
  if(input.dive && !r.diveHeld && r.diveCooldown<=0 && r.stun<=0) {
    r.dive=.42;r.diveCooldown=1.15;
    if(r.ground) {r.vy=4.8;r.ground=false;}
    r.vp=Math.max(r.vp,12);r.vy=Math.min(r.vy,4.8);
  }
  r.jumpHeld=input.jump;r.diveHeld=input.dive;
  const oldY=r.y;
  r.vy-=24*dt;r.x+=r.vx*dt;r.p+=r.vp*dt;r.y+=r.vy*dt;
  const floor=platformAt(course,r.x,r.p);
  if(floor && r.y<=0 && oldY>=-.15 && r.vy<=0) {
    r.y=0;r.vy=0;r.ground=true;
    if(r.p>floor.start+1.4 && r.p<floor.end-1 && floor.start>r.checkpoint.p) r.checkpoint={x:floor.x,p:floor.start+2};
  } else r.ground=false;
  if(r.y < -8) {r.x=r.checkpoint.x;r.p=r.checkpoint.p;r.y=2;r.vy=0;r.vx=0;r.vp=0;r.stun=.25;r.respawns++;}
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
    } else {
      for(const side of [-1,1]) {const dx=r.x-(ob.x+side*ob.radius*.65),dp=r.p-ob.p;if(Math.hypot(dx,dp)<1.45 && r.y<1.8 && r.y>-.5) hit(r,dx,dp,9);}
    }
  }
}
export function separateRacers(racers) {
  for(let i=0;i<racers.length;i++) for(let j=i+1;j<racers.length;j++) {
    const a=racers[i],b=racers[j];if(a.finished||b.finished||Math.abs(a.y-b.y)>1.3)continue;
    const dx=b.x-a.x,dp=b.p-a.p,d=Math.hypot(dx,dp);
    if(d>0 && d<.85) {const force=(.85-d)*.22;a.x-=dx/d*force;b.x+=dx/d*force;a.p-=dp/d*force;b.p+=dp/d*force;}
  }
}
export function raceOrder(racers) {return [...racers].sort((a,b)=> a.finished!==b.finished?(a.finished?-1:1):a.finished?a.place-b.place:b.p-a.p||a.id-b.id);}
export function awardRound(racers,round,timeLimit) {
  const order=raceOrder(racers);
  order.forEach((r,i)=>{const points=Math.round((12-i)*10*(1+round*.5)*(r.finished?1:.5));const time=r.finishTime??timeLimit;r.points+=points;r.totalTime+=time;r.results.push({place:i+1,points,time,finished:r.finished});});
  return order;
}
export function finalOrder(racers) {return [...racers].sort((a,b)=>b.points-a.points||a.totalTime-b.totalTime||a.id-b.id);}
