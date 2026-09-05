const RADIUS=.56;
const BODY_HEIGHT=1.95;
const EPSILON=1e-5;
const previousPositions=new WeakMap();
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function platformCenter(platform,time) {
  if(!platform.amplitude)return platform.x;
  return platform.x+platform.amplitude*Math.sin(time*(platform.speed??1)+(platform.phase??0));
}

export function createCourseCovers(platforms,round=0) {
  return platforms.map((platform,index)=>({id:`wafer-${round}-${index}`,platformIndex:index,xOffset:0,p:index===0?10:platform.start+3.95,width:1.15,depth:2.1,height:3.2}));
}

export function coverBoxes(course,time=0) {
  return (course.covers||[]).flatMap(cover=>{
    const platform=course.platforms[cover.platformIndex];
    if(!platform)return [];
    return [{id:cover.id,x:platformCenter(platform,time)+(cover.xOffset||0),p:cover.p,width:cover.width??1.15,depth:cover.depth??2.1,height:cover.height??3.2,bottom:0}];
  });
}

// Slab intersections use the same world-space boxes for safety and the beam renderer.
function segmentBox(source,target,box) {
  let near=0,far=1,normal=null;
  const bounds=[['x',box.x-box.width/2,box.x+box.width/2],['p',box.p-box.depth/2,box.p+box.depth/2],['y',box.bottom||0,(box.bottom||0)+box.height]];
  for(const [axis,min,max] of bounds) {
    const origin=source[axis],delta=target[axis]-origin;
    if(Math.abs(delta)<1e-10){if(origin<min||origin>max)return null;continue;}
    let a=(min-origin)/delta,b=(max-origin)/delta;
    const sign=delta>0?-1:1;
    if(a>b)[a,b]=[b,a];
    if(a>near){near=a;normal={axis,sign};}
    far=Math.min(far,b);
    if(near>far)return null;
  }
  return far<0||near>1?null:{t:Math.max(0,near),normal};
}

export function monsterRayEnd(event,target,boxes=[]) {
  const source={x:event.monsterX-event.side*3.2,y:2.55,p:event.p};
  let t=1,blocked=false;
  for(const box of boxes) {
    const hit=segmentBox(source,target,box);
    if(hit&&hit.t<t-EPSILON){t=hit.t;blocked=true;}
  }
  return {x:source.x+(target.x-source.x)*t,y:source.y+(target.y-source.y)*t,p:source.p+(target.p-source.p)*t,blocked,t};
}

export function isSheltered(event,racer,boxes=[]) {
  if(!event||!boxes.length||racer.y<-.25)return false;
  // A ray through the centre alone would incorrectly protect exposed shoulders.
  // The capsule silhouette includes the head, feet, and both sides of the torso.
  const samples=[
    [0,.12,0],[0,BODY_HEIGHT,0],
    [-RADIUS,1.08,0],[RADIUS,1.08,0],
    [0,1.08,-RADIUS],[0,1.08,RADIUS],
    [0,1.62,-.4],[0,1.62,.4],
    [-.4,1.62,0],[.4,1.62,0],
  ];
  return samples.every(([dx,dy,dp])=>monsterRayEnd(event,{x:racer.x+dx,y:racer.y+dy,p:racer.p+dp},boxes).blocked);
}

function onSolidGround(course,x,p,time) {
  return course.platforms.some(platform=>{
    const center=platformCenter(platform,time);
    if(p-RADIUS<platform.start||p+RADIUS>platform.end||Math.abs(x-center)+RADIUS>platform.width/2)return false;
    if(platform.kind==='split'&&p+RADIUS>platform.start+5&&p-RADIUS<platform.end-3&&Math.abs(x-center)<1.2+RADIUS)return false;
    return true;
  });
}

function overlapsWall(x,p,box,radius=RADIUS) {
  const dx=x-clamp(x,box.x-box.width/2,box.x+box.width/2);
  const dp=p-clamp(p,box.p-box.depth/2,box.p+box.depth/2);
  return dx*dx+dp*dp<radius*radius-EPSILON;
}

export function shelterSpots(event,course,time=0,boxes=coverBoxes(course,time)) {
  if(!event)return [];
  const spots=[];
  for(const box of boxes) {
    const x=box.x-event.side*(box.width/2+RADIUS+.15);
    for(const offset of [0,-.28,.28]) {
      const p=box.p+offset;
      if(Math.abs(x-event.x)>event.width/2-RADIUS||Math.abs(p-event.p)>event.depth/2-RADIUS)continue;
      if(!onSolidGround(course,x,p,time)||boxes.some(other=>overlapsWall(x,p,other)))continue;
      if(isSheltered(event,{x,p,y:0},boxes))spots.push({x,p,coverId:box.id});
    }
  }
  return spots;
}

function removeInwardVelocity(racer,nx,np,wallVelocity) {
  const inward=(racer.vx-wallVelocity)*nx+racer.vp*np;
  if(inward<0){racer.vx-=inward*nx;racer.vp-=inward*np;}
}

export function resetTerrainCollisionHistory(racers) {
  for(const racer of racers)previousPositions.delete(racer);
}

export function resolveTerrainCollisions(racers,course,time=0) {
  if(!course?.covers?.length)return;
  const boxes=coverBoxes(course,time);
  for(const racer of racers) {
    if(racer.finished)continue;
    const previous=previousPositions.get(racer);
    const canSweep=previous?.course===course&&previous.respawns===racer.respawns&&time>previous.time&&time-previous.time<=.1&&Math.hypot(racer.x-previous.x,racer.p-previous.p)<20;
    for(let index=0;index<boxes.length;index++) {
      const box=boxes[index],previousP=canSweep?previous.p:racer.p;
      // Most platforms are far away: discard them before allocating sweep bounds.
      if(Math.min(racer.p,previousP)>box.p+box.depth/2+RADIUS||Math.max(racer.p,previousP)<box.p-box.depth/2-RADIUS)continue;
      const cover=course.covers.find(cover=>cover.id===box.id),platform=course.platforms[cover.platformIndex];
      const speed=platform.speed??1,phase=platform.phase??0;
      const wallVelocity=(platform.amplitude||0)*speed*Math.cos(time*speed+phase);
      if(canSweep) {
        const oldX=platformCenter(platform,previous.time)+(cover.xOffset||0);
        const source={x:previous.x-oldX,p:previous.p-box.p,y:previous.y+BODY_HEIGHT/2};
        const target={x:racer.x-box.x,p:racer.p-box.p,y:racer.y+BODY_HEIGHT/2};
        const expanded={x:0,p:0,width:box.width+RADIUS*2,depth:box.depth+RADIUS*2,bottom:-BODY_HEIGHT/2,height:box.height+BODY_HEIGHT};
        const startsOutside=Math.abs(source.x)>expanded.width/2+EPSILON||Math.abs(source.p)>expanded.depth/2+EPSILON;
        const sweep=startsOutside?segmentBox(source,target,expanded):null;
        if(sweep&&sweep.normal&&sweep.normal.axis!=='y') {
          const {axis,sign}=sweep.normal;
          if(axis==='x')racer.x=box.x+sign*(box.width/2+RADIUS+EPSILON);
          else racer.p=box.p+sign*(box.depth/2+RADIUS+EPSILON);
          removeInwardVelocity(racer,axis==='x'?sign:0,axis==='p'?sign:0,wallVelocity);
        }
      }
      if(racer.y>=box.height||racer.y+BODY_HEIGHT<=box.bottom)continue;
      const closestX=clamp(racer.x,box.x-box.width/2,box.x+box.width/2);
      const closestP=clamp(racer.p,box.p-box.depth/2,box.p+box.depth/2);
      const dx=racer.x-closestX,dp=racer.p-closestP,distance=Math.hypot(dx,dp);
      if(distance>=RADIUS)continue;
      let nx,np,penetration;
      if(distance>EPSILON){nx=dx/distance;np=dp/distance;penetration=RADIUS-distance;}
      else {
        const exits=[
          {depth:racer.x-(box.x-box.width/2),nx:-1,np:0},
          {depth:box.x+box.width/2-racer.x,nx:1,np:0},
          {depth:racer.p-(box.p-box.depth/2),nx:0,np:-1},
          {depth:box.p+box.depth/2-racer.p,nx:0,np:1},
        ].sort((a,b)=>a.depth-b.depth);
        ({nx,np}=exits[0]);penetration=RADIUS+exits[0].depth;
      }
      racer.x+=nx*(penetration+EPSILON);racer.p+=np*(penetration+EPSILON);
      removeInwardVelocity(racer,nx,np,wallVelocity);
    }
    previousPositions.set(racer,{course,time,x:racer.x,p:racer.p,y:racer.y,respawns:racer.respawns});
  }
}
