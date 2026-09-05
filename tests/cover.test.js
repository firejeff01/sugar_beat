import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourseCovers,coverBoxes,monsterRayEnd,isSheltered,shelterSpots,resolveTerrainCollisions} from '../src/cover.js';
import {generateCourse,MAP_CATALOG,platformAt,platformX} from '../src/game.js';

function fixture({moving=false}={}) {
  const platforms=[{start:-7,end:25,x:0,width:12.8,kind:moving?'moving':'plain',amplitude:moving?1.4:0,speed:1,phase:0}];
  const course={platforms,covers:createCourseCovers(platforms,0)};
  return course;
}
function event(side=1){return {side,monsterX:side*11.6,x:0,p:10,width:13.8,depth:5};}
function racer(values={}){return {x:-1.3,p:10,y:0,vx:0,vp:0,vy:0,finished:false,...values};}

test('solid wafer terrain shields complete bodies from either monster side',()=>{
  const boxes=coverBoxes(fixture());
  for(const side of [-1,1]) {
    assert.equal(isSheltered(event(side),racer({x:-side*1.3}),boxes),true);
    assert.equal(isSheltered(event(side),racer({x:side*1.3}),boxes),false,'the side facing the monster is exposed');
    assert.equal(isSheltered(event(side),racer({x:-side*1.3,p:11.3}),boxes),false,'a shoulder extending beyond the wall is exposed');
    assert.equal(isSheltered(event(side),racer({x:-side*1.3,y:1.8}),boxes),false,'a normal jump exposes the head above the wall');
    assert.equal(isSheltered(event(side),racer({x:-side*1.3,y:-1}),boxes),false);
  }
});

test('beam clipping finds the nearest actual wall and ignores boxes behind the target',()=>{
  const eventData=event(),target={x:-3,y:1,p:10};
  const boxes=coverBoxes(fixture());
  const blocked=monsterRayEnd(eventData,target,boxes);
  assert.equal(blocked.blocked,true);assert.ok(Math.abs(blocked.x-.575)<1e-8);assert.ok(blocked.t>0&&blocked.t<1);
  const nearer={...boxes[0],id:'closer',x:3};
  assert.ok(Math.abs(monsterRayEnd(eventData,target,[...boxes,nearer]).x-3.575)<1e-8);
  const clear=monsterRayEnd(eventData,{x:2,y:1,p:10},boxes);
  assert.equal(clear.blocked,false);assert.equal(clear.t,1);assert.equal(clear.x,2);
  assert.equal(monsterRayEnd(eventData,{x:-3,y:1,p:15},boxes).blocked,false,'rays outside wall depth stay visible');
});

test('shelter positions follow moving platforms and remain inside solid footing',()=>{
  const course=fixture({moving:true});
  for(const time of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const side of [-1,1]) {
    const boxes=coverBoxes(course,time),x=platformX(course.platforms[0],time);
    assert.equal(boxes[0].x,x);
    const eventData={...event(side),x,monsterX:x+side*11.6};
    const spots=shelterSpots(eventData,course,time,boxes);
    assert.ok(spots.length>=1&&spots.length<=3);
    for(const spot of spots){assert.ok(isSheltered(eventData,{...spot,y:0},boxes));assert.ok(platformAt(course,spot.x,spot.p,-.56,time));assert.equal(spot.coverId,boxes[0].id);}
  }
  const noFooting={...course,platforms:[{...course.platforms[0],width:2.4}]};
  assert.deepEqual(shelterSpots(event(),noFooting),[],'no safe marker may hang over a platform edge');
});

test('terrain collision stops penetration while preserving motion along the wall',()=>{
  const course=fixture(),r=racer({x:-.8,vx:8,vp:3});
  resolveTerrainCollisions([r],course,0);
  assert.ok(r.x<=-1.135);assert.equal(r.vx,0);assert.equal(r.vp,3);assert.equal(r.vy,0);
  r.x=-.9;r.vx=-4;resolveTerrainCollisions([r],course,0);
  assert.equal(r.vx,-4,'leaving the wall does not create an impulse');
  const above=racer({x:0,y:3.3,vx:8});resolveTerrainCollisions([above],course,0);assert.equal(above.x,0);assert.equal(above.vx,8);
});

test('fast movement cannot tunnel through a wall and repeated passes add no impulse',()=>{
  const course=fixture(),r=racer({x:-2,vx:120,vp:1});
  resolveTerrainCollisions([r],course,0);
  r.x=2;r.p=10.02;resolveTerrainCollisions([r],course,1/60);
  assert.ok(r.x<=-1.135);assert.equal(r.vx,0);assert.equal(r.vp,1);
  const after={...r};resolveTerrainCollisions([r],course,1/60);resolveTerrainCollisions([r],course,1/60);assert.deepEqual(r,after);
});

test('moving walls push with their platform velocity without launching racers',()=>{
  const course=fixture({moving:true}),r=racer({x:1.14});
  resolveTerrainCollisions([r],course,0);
  resolveTerrainCollisions([r],course,.1);
  const wall=coverBoxes(course,.1)[0];
  assert.ok(r.x>=wall.x+wall.width/2+.56);assert.ok(Math.abs(r.vx-1.4*Math.cos(.1))<1e-8);assert.equal(r.vp,0);assert.equal(r.vy,0);
});

test('every one of the 36 maps provides supported cover and usable hiding spots',()=>{
  for(const map of MAP_CATALOG)for(const round of [0,1,2]) {
    const course=generateCourse(1234+map.id*199,round,map.id);
    course.covers=createCourseCovers(course.platforms,round);
    assert.equal(course.covers.length,course.platforms.length);
    for(const time of [0,1.4,4.2])for(const box of coverBoxes(course,time)) {
      const cover=course.covers.find(c=>c.id===box.id),platform=course.platforms[cover.platformIndex];
      for(const dx of [-box.width/2,box.width/2])for(const dp of [-box.depth/2+1e-8,box.depth/2-1e-8])assert.ok(platformAt(course,box.x+dx,box.p+dp,0,time),`${map.name} cover must sit on a solid platform`);
      if(cover.platformIndex>0)assert.ok(box.p-box.depth/2>platform.start+2+.56,'checkpoint stays outside the wall');
      for(const side of [-1,1]) {
        const eventData={...event(side),x:box.x,p:box.p,width:platform.width+1,monsterX:box.x+side*(platform.width/2+5.2)};
        const spots=shelterSpots(eventData,course,time);
        assert.ok(spots.some(spot=>spot.coverId===box.id),`${map.name} platform ${cover.platformIndex} needs a reachable shelter on either side`);
      }
    }
  }
});
