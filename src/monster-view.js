import * as THREE from 'three';
import {ATTACKS,eventPhase} from './monster.js';
import {coverBoxes,isSheltered,monsterRayEnd} from './cover.js';
import {platformAt} from './game.js';

export class MonsterView {
  constructor(scene){
    this.root=new THREE.Group();scene.add(this.root);
    this.monster=new THREE.Group();this.root.add(this.monster);
    const material=color=>new THREE.MeshStandardMaterial({color,roughness:.65});
    this.skin=material(0x7460b7);this.belly=material(0xded2ff);this.glow=new THREE.MeshBasicMaterial({color:0xffa244});
    const add=(geometry,mat,parent,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;};
    const ball=(size,mat,parent,x,y,z,sx=1,sy=1,sz=1)=>add(new THREE.SphereGeometry(size,20,14),mat,parent,x,y,z,sx,sy,sz);
    ball(3.1,this.skin,this.monster,0,-1,0,1,1.3,.88);ball(2.1,this.belly,this.monster,0,-.6,1.8,1,1.3,.3);
    const head=new THREE.Group();this.monster.add(head);this.head=head;
    ball(2.25,this.skin,head,0,3,.55,1,.88,1);ball(1.45,this.skin,head,0,2.65,2,1,.75,.8);
    this.mouth=ball(1,new THREE.MeshBasicMaterial({color:0x281936}),head,0,2.55,3,.95,.6,.16);
    ball(.5,this.glow,head,0,2.55,3.16,1,.7,.08);
    const white=material(0xfff6da),dark=material(0x252035);
    for(const side of [-1,1]){
      ball(.6,white,head,side*.9,3.8,2.1,1,1,.55);ball(.27,dark,head,side*.82,3.8,2.43,.7,1,.4);
      const horn=add(new THREE.ConeGeometry(.45,1.8,12),white,head,side*1.7,5,.35);horn.rotation.z=-side*.32;
      ball(.82,this.skin,this.monster,side*2.9,.35,1,.7,1.5,.7);ball(.7,this.belly,this.monster,side*2.8,-.5,2);
      const tooth=add(new THREE.ConeGeometry(.18,.5,8),white,head,side*.63,2.93,3.02);tooth.rotation.z=Math.PI;
      for(let j=0;j<3;j++)add(new THREE.ConeGeometry(.17,.45,8),white,this.monster,side*2.8+(j-1)*.3,-.85,2.2).rotation.x=-.5;
    }
    for(let i=0;i<4;i++)add(new THREE.ConeGeometry(.65,1.2,4),this.belly,this.monster,0,1.7-i*1.2,-2.2);
    this.zoneMaterial=new THREE.MeshBasicMaterial({color:0xff6333,transparent:true,opacity:.25,depthWrite:false});
    this.zone=new THREE.Mesh(new THREE.BoxGeometry(1,.035,1),this.zoneMaterial);this.root.add(this.zone);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,.04,1)),new THREE.LineBasicMaterial({color:0xff6333}));this.root.add(this.outline);
    this.beamMaterial=new THREE.MeshBasicMaterial({color:0xff8833,transparent:true,opacity:.24,depthWrite:false});
    this.beams=new THREE.InstancedMesh(new THREE.CylinderGeometry(.16,.025,1,8,1,true),this.beamMaterial,25);this.beams.frustumCulled=false;this.root.add(this.beams);
    this.safeTiles=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.035,1),new THREE.MeshBasicMaterial({color:0x39edab,transparent:true,opacity:.78,depthWrite:false,toneMapped:false}),32*16);this.safeTiles.frustumCulled=false;this.safeTiles.renderOrder=2;this.root.add(this.safeTiles);
    this.scratch=new THREE.Object3D();
    this.particles=[];
    for(let i=0;i<44;i++){
      const m=new THREE.Mesh(i%3===0?new THREE.OctahedronGeometry(.42):new THREE.SphereGeometry(.32,8,6),new THREE.MeshBasicMaterial({color:0xffb64f,transparent:true,opacity:.8,depthWrite:false}));this.root.add(m);this.particles.push(m);
    }
    this.boltGeometry=new THREE.BufferGeometry();this.boltGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(3*3*12*2),3));
    this.bolt=new THREE.LineSegments(this.boltGeometry,new THREE.LineBasicMaterial({color:0xefc3ff}));this.root.add(this.bolt);
    this.root.visible=false;
  }
  update(event,time,visible=true,course){
    const phase=eventPhase(event,time);this.root.visible=visible&&phase!=='idle';if(!this.root.visible)return;
    const spec=ATTACKS[event.type],active=phase==='attack',rise=Math.min(1,(time-event.startAt)/.5),sink=phase==='retreat'?(time-event.endAt)/.7:0;
    this.monster.position.set(event.monsterX,-8*(1-rise)-8*sink,-event.p);this.monster.rotation.y=-event.side*Math.PI/2;
    this.head.rotation.z=Math.sin(time*3)*.035;this.mouth.scale.y=active?.9:.5+Math.sin(time*10)*.04;
    this.skin.color.setHex({fire:0xad4d69,water:0x4267ac,ice:0x618eae,lightning:0x7950aa}[event.type]);this.glow.color.setHex(spec.color);
    for(const m of [this.zone,this.outline]){m.position.set(event.x,.07,-event.p);m.scale.set(event.width,1,event.depth);}
    this.zoneMaterial.color.setHex(spec.color);this.outline.material.color.setHex(spec.color);this.zoneMaterial.opacity=active?.35:.13+(Math.sin(time*12)+1)*.08;
    const walls=course?coverBoxes(course,time).filter(b=>Math.abs(b.p-event.p)<event.depth/2+b.depth/2):[];
    const start=new THREE.Vector3(event.monsterX-event.side*3.2,2.55,-event.p),end=new THREE.Vector3(event.x-event.side*event.width/2,1.2,-event.p);
    const clip=point=>{const hit=monsterRayEnd(event,{x:point.x,y:point.y,p:-point.z},walls);point.set(hit.x,hit.y,-hit.p);return hit;};
    // Each stream terminates on terrain; no translucent cone leaking through cover.
    this.beams.visible=active&&event.type!=='lightning';this.beamMaterial.color.setHex(spec.color);
    if(this.beams.visible)for(let i=0;i<25;i++){
      const target=end.clone();target.z+=(i/24-.5)*event.depth;clip(target);
      const delta=target.clone().sub(start),dummy=this.scratch;
      dummy.position.copy(start).add(target).multiplyScalar(.5);dummy.scale.set(1,delta.length(),1);dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());dummy.updateMatrix();this.beams.setMatrixAt(i,dummy.matrix);
    }
    this.beams.instanceMatrix.needsUpdate=true;
    // Green marks safe standing centers, using the same whole-body occlusion as hits.
    let safeCount=0;const tileX=event.width/32,tileP=event.depth/16,dummy=this.scratch;
    if(course&&phase!=='retreat')for(let ix=0;ix<32;ix++)for(let ip=0;ip<16;ip++){
      const x=event.x-event.width/2+(ix+.5)*tileX,p=event.p-event.depth/2+(ip+.5)*tileP;
      if(!platformAt(course,x,p,-.65,time)||![-.56,.56].every(dx=>[-.56,.56].every(dp=>platformAt(course,x+dx,p+dp,0,time)))||!isSheltered(event,{x,p,y:0},walls))continue;
      if(walls.some(b=>Math.abs(x-b.x)<b.width/2+.6&&Math.abs(p-b.p)<b.depth/2+.6))continue;
      dummy.position.set(x,.105,-p);dummy.rotation.set(0,0,0);dummy.scale.set(tileX*.94,1,tileP*.94);dummy.updateMatrix();this.safeTiles.setMatrixAt(safeCount++,dummy.matrix);
    }
    this.safeTiles.count=safeCount;this.safeTiles.instanceMatrix.needsUpdate=true;
    this.particles.forEach((m,i)=>{m.visible=active;if(!active)return;const u=(time*(event.type==='water'?2.4:1.6)+i/44)%1;
      m.position.copy(start).lerp(end,u);m.position.z+=Math.sin(i*7.1+time*9)*event.depth*.43*u;m.position.y+=Math.cos(i*2.8+time*8)*1.15*u;
      const hit=clip(m.position);if(hit.blocked)m.position.x+=event.side*.08;
      m.material.color.setHex(event.type==='fire'?(i%2?0xffc34c:0xff5733):spec.color);m.material.opacity=.8*(1-u*.6);m.scale.setScalar(.45+u*1.8);m.rotation.set(time+i,time*2+i,0);
    });
    this.bolt.visible=active&&event.type==='lightning';
    if(this.bolt.visible){const positions=this.boltGeometry.attributes.position;let n=0;
      for(let branch=0;branch<3;branch++){
        const target=end.clone();target.z+=(branch-1)*1.6;clip(target);
        for(let j=0;j<12;j++)for(let edge=0;edge<2;edge++){
          const u=(j+edge)/12,point=start.clone().lerp(target,u);point.y+=Math.sin((j+edge)*3+Math.floor(time*18))*u*.8;point.z+=Math.sin((j+edge)*8+Math.floor(time*18))*.3*u;clip(point);positions.setXYZ(n++,point.x,point.y,point.z);
        }
      }positions.needsUpdate=true;this.boltGeometry.computeBoundingSphere();
    }
  }
}

export function addStatusVisuals(bean){
  const ice=new THREE.Mesh(new THREE.BoxGeometry(1.55,2.25,1.5),new THREE.MeshPhysicalMaterial({color:0x8de9ff,transparent:true,opacity:.45,roughness:.12,metalness:.12,depthWrite:false}));ice.position.y=1.05;bean.add(ice);
  const halo=new THREE.Mesh(new THREE.TorusGeometry(.8,.055,8,24),new THREE.MeshBasicMaterial({color:0xd283ff}));halo.position.y=2.25;halo.rotation.x=Math.PI/2;bean.add(halo);
  const smoke=new THREE.Group();bean.add(smoke);for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(.14,7,6),new THREE.MeshBasicMaterial({color:0x625b69,transparent:true,opacity:.6}));smoke.add(m);}
  ice.visible=halo.visible=smoke.visible=false;bean.userData.status={ice,halo,smoke};
}
export function updateStatusVisuals(bean,r,time,charcoal){
  const {ice,halo,smoke}=bean.userData.status;ice.visible=r.frozen>0;halo.visible=r.reversed>0||r.paralyzed>0;smoke.visible=r.charred>0;
  halo.rotation.z=time*5;halo.scale.setScalar(1+Math.sin(time*15)*.1);
  smoke.children.forEach((m,i)=>{const t=(time*.7+i*.25)%1;m.position.set(Math.sin(i*2+t)*.4,1.8+t*1.2,Math.cos(i*2+t)*.35);m.scale.setScalar(1+t);});
  for(const m of bean.userData.coloredMeshes)m.material=r.charred>0?charcoal:m.userData.cleanMaterial;
}
