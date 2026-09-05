import * as THREE from 'three';
import {ATTACKS,eventPhase} from './monster.js';
import {coverBoxes,isSheltered,monsterRayEnd} from './cover.js';
import {platformAt} from './game.js';

export class MonsterView {
  constructor(scene){
    this.root=new THREE.Group();scene.add(this.root);
    this.monster=new THREE.Group();this.root.add(this.monster);
    const material=color=>new THREE.MeshStandardMaterial({color,roughness:.92,flatShading:true});
    this.skin=material(0x382e39);this.belly=material(0x55515a);this.glow=new THREE.MeshBasicMaterial({color:0xffa244,toneMapped:false});
    const add=(geometry,mat,parent,x,y,z,sx=1,sy=1,sz=1)=>{const m=new THREE.Mesh(geometry,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=true;parent.add(m);return m;};
    const ball=(size,mat,parent,x,y,z,sx=1,sy=1,sz=1)=>add(new THREE.IcosahedronGeometry(size,1),mat,parent,x,y,z,sx,sy,sz);
    const ivory=material(0xd6cca9),dark=material(0x151723),armor=material(0x282b37);
    const spike=(radius,height,mat,parent,x,y,z,rz=0,rx=0)=>{const m=add(new THREE.ConeGeometry(radius,height,5),mat,parent,x,y,z);m.rotation.set(rx,0,rz);return m;};
    ball(3.05,this.skin,this.monster,0,-1.2,-.25,1.1,1.35,.86);
    // Overlapping angular plates replace the smooth belly and toy-like silhouette.
    for(let row=0;row<4;row++)ball(.94,this.belly,this.monster,0,.6-row*.93,2.1,1.75,.5,.32);
    for(const side of [-1,1])for(let row=0;row<3;row++)ball(.82,armor,this.monster,side*(1.65-row*.12),.85-row*1.05,1.65,.9,.62,.4);
    const head=new THREE.Group();this.monster.add(head);this.head=head;
    ball(2.12,this.skin,head,0,3.2,.55,1.05,.81,1);
    ball(1.36,this.skin,head,0,2.9,1.97,1.05,.68,.83);
    // The throat stays at local (0, 2.55, 3.2), exactly the collision ray origin.
    this.mouth=ball(1,dark,head,0,2.55,3.1,1.13,.62,.12);
    this.throat=ball(.44,this.glow,head,0,2.55,3.19,1,.68,.06);
    this.jaw=new THREE.Group();this.jaw.position.set(0,2.06,2.35);head.add(this.jaw);
    ball(.94,this.belly,this.jaw,0,0,.23,1.35,.34,.9);
    this.eyes=[];this.arms=[];
    for(const side of [-1,1]){
      const socket=ball(.63,dark,head,side*.98,3.76,2.05,1.06,.6,.48);socket.rotation.z=side*.22;
      const eye=add(new THREE.BoxGeometry(.62,.14,.08),this.glow,head,side*.95,3.69,2.4);eye.rotation.z=side*.28;this.eyes.push(eye);
      const brow=ball(.65,armor,head,side*.98,4.02,2.16,1.18,.37,.44);brow.rotation.z=side*.28;
      spike(.38,1.8,ivory,head,side*1.77,4.65,.15,-side*.48,-.3);
      spike(.3,1.2,armor,head,side*2,3.21,.2,-side*1.12,-.15);
      const arm=new THREE.Group();arm.position.set(side*2.55,.9,.65);this.monster.add(arm);this.arms.push(arm);
      ball(.88,this.skin,arm,side*.2,-.58,.35,.8,1.3,.85);ball(.73,armor,arm,side*.2,-1.43,1,.93,.53,1);
      for(let j=0;j<3;j++)spike(.16,.9,ivory,arm,side*.2+(j-1)*.36,-1.77,1.35,0,2.05);
      for(let j=0;j<2;j++)spike(.3,1.03,armor,arm,side*(.45+j*.3),.35-j*.37,.22,-side*.75,-.3);
      for(let j=0;j<3;j++){
        spike(j===0?.18:.12,j===0?.65:.42,ivory,head,side*(.82-j*.31),2.99,3.05,Math.PI);
        spike(.1,.3,ivory,this.jaw,side*(.68-j*.27),.25,.77);
      }
    }
    for(let i=0;i<5;i++)spike(.57,1.5-i*.1,armor,this.monster,0,2.1-i*1.13,-1.6-i*.12,0,-.85);
    // Only one compact accessory set is rendered per encounter. Each element has
    // a different silhouette, so recognizing it does not rely on its color alone.
    this.variants={};
    for(const type of ['fire','water','ice','lightning']){const g=new THREE.Group();head.add(g);this.variants[type]=g;}
    const ember=material(0x9b3d16),fin=material(0x226e7a),frost=material(0xa2dfdc),charged=material(0x7355a1);
    for(const side of [-1,1]){
      for(let i=0;i<3;i++){
        spike(.31,.9+i*.38,ember,this.variants.fire,side*(.55+i*.46),4.62,.05-i*.32,-side*.15,-.24);
        spike(.27,1.18+i*.17,fin,this.variants.water,side*(1.77+i*.27),3.75-i*.47,.4,-side*(.78+i*.2));
        spike(.24,1.6+i*.31,frost,this.variants.ice,side*(.46+i*.57),4.55,.32-i*.32,-side*(.06+i*.24),-.2);
      }
      for(let i=0;i<2;i++){
        const horn=add(new THREE.BoxGeometry(.27,1.25,.3),charged,this.variants.lightning,side*(1.1+i*.49),4.86+i*.82,.22);horn.rotation.z=side*(i===0?-.55:.45);
        const stripe=add(new THREE.BoxGeometry(.085,1.2,.32),this.glow,this.variants.lightning,horn.position.x,horn.position.y,.23);stripe.rotation.z=horn.rotation.z;
      }
      for(let i=0;i<3;i++){
        const scar=add(new THREE.BoxGeometry(.06,.65,.08),this.glow,this.variants.fire,side*(1.36+i*.16),3.22-i*.24,2.1-i*.15);scar.rotation.z=side*.38;
        const gill=add(new THREE.BoxGeometry(.09,.65,.16),dark,this.variants.water,side*(1.65+i*.14),3.15-i*.23,1.55-i*.12);gill.rotation.z=side*.38;
      }
      spike(.14,.88,frost,this.variants.ice,side*1.15,2.06,2.7,Math.PI);
    }
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
    this.jaw.rotation.x=active?.2:.02+Math.sin(time*5)*.025;
    this.mouth.scale.y=active?.76:.49;this.throat.scale.set(1,active?.86:.42,.06);
    this.arms.forEach((arm,i)=>{arm.rotation.x=active?-.2:Math.sin(time*2.8+i)*.065;});
    this.skin.color.setHex({fire:0x3b2729,water:0x253749,ice:0x394e58,lightning:0x382746}[event.type]);
    this.belly.color.setHex({fire:0x77513e,water:0x447079,ice:0x799b9e,lightning:0x61506f}[event.type]);
    this.glow.color.setHex(spec.color);
    for(const [type,group] of Object.entries(this.variants))group.visible=type===event.type;
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
  const zombie=new THREE.Group();(bean.userData.body??bean).add(zombie);
  const zombieSkin=new THREE.MeshStandardMaterial({color:0x65815e,roughness:.94}),zombieFace=new THREE.MeshStandardMaterial({color:0x9ca991,roughness:.92});
  const socketMaterial=new THREE.MeshBasicMaterial({color:0x252a28}),eyeMaterial=new THREE.MeshBasicMaterial({color:0xff4937,toneMapped:false}),toothMaterial=new THREE.MeshStandardMaterial({color:0xd3cba8,roughness:.8});
  const add=(geometry,material,x,y,z)=>{const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);zombie.add(mesh);return mesh;};
  for(const side of [-1,1]){
    const socket=add(new THREE.SphereGeometry(.12,8,6),socketMaterial,side*.16,1.29,-.595);socket.scale.set(1,1.2,.26);
    const eye=add(new THREE.BoxGeometry(.12,.055,.02),eyeMaterial,side*.16,1.29,-.638);eye.rotation.z=-side*.18;
    const tooth=add(new THREE.ConeGeometry(.04,.13,4),toothMaterial,side*.12,.985,-.601);tooth.rotation.z=Math.PI;
  }
  add(new THREE.BoxGeometry(.36,.12,.024),socketMaterial,0,1.03,-.602);
  if(bean.userData.face)bean.userData.face.userData.cleanMaterial=bean.userData.face.material;
  ice.visible=halo.visible=smoke.visible=zombie.visible=false;
  const ownedMaterials=new Set([ice.material,halo.material,...smoke.children.map(m=>m.material),zombieSkin,zombieFace,socketMaterial,eyeMaterial,toothMaterial]);
  // The parent already disposes geometries while rebuilding racers. Material
  // ownership stays here; never dispose the game's shared clean skin materials.
  bean.userData.status={ice,halo,smoke,zombie,zombieSkin,zombieFace,dispose(){ownedMaterials.forEach(material=>material.dispose());}};
}
export function updateStatusVisuals(bean,r,time,charcoal){
  const {ice,halo,smoke,zombie,zombieSkin,zombieFace}=bean.userData.status;const infected=r.zombie>0;
  ice.visible=r.frozen>0;halo.visible=r.reversed>0||r.paralyzed>0;smoke.visible=r.charred>0||infected;zombie.visible=infected;
  halo.rotation.z=time*5;halo.scale.setScalar(1+Math.sin(time*15)*.1);
  smoke.children.forEach((m,i)=>{const t=(time*.7+i*.25)%1;m.position.set(Math.sin(i*2+t)*.4,1.8+t*1.2,Math.cos(i*2+t)*.35);m.scale.setScalar(1+t);m.material.color.setHex(r.charred>0?0x625b69:0x7d9d4a);m.material.opacity=infected&&r.charred<=0?.36:.6;});
  for(const m of bean.userData.coloredMeshes)m.material=r.charred>0?charcoal:infected?zombieSkin:m.userData.cleanMaterial;
  if(bean.userData.face)bean.userData.face.material=infected?zombieFace:bean.userData.face.userData.cleanMaterial;
}
