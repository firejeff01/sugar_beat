import * as THREE from 'three';

// A small pooled renderer: every NPC shares geometry/materials and disappears
// when its simulation entry is removed. Facing 0 looks along +p (world -z).
export class ZombieView {
  constructor(scene){
    this.root=new THREE.Group();scene.add(this.root);this.pool=new Map();this.spares=[];
    this.geometry={
      torso:new THREE.BoxGeometry(.94,.93,.59),head:new THREE.IcosahedronGeometry(.51,1),
      limb:new THREE.BoxGeometry(.25,.69,.27),hand:new THREE.BoxGeometry(.3,.26,.22),
      foot:new THREE.BoxGeometry(.32,.2,.51),eye:new THREE.BoxGeometry(.14,.055,.025),
      socket:new THREE.BoxGeometry(.25,.17,.06),mouth:new THREE.BoxGeometry(.36,.16,.035),
      tooth:new THREE.ConeGeometry(.052,.16,4),rag:new THREE.ConeGeometry(.18,.36,3),
      stitch:new THREE.BoxGeometry(.038,.16,.025),aura:new THREE.SphereGeometry(.1,6,5),
      ring:new THREE.TorusGeometry(.73,.025,5,20),
    };
    const material=color=>new THREE.MeshStandardMaterial({color,roughness:.95,flatShading:true});
    this.material={skin:material(0x72856a),dark:material(0x22272b),shirt:material(0x423750),pants:material(0x323b40),tooth:material(0xd1c9a6),
      eye:new THREE.MeshBasicMaterial({color:0xff4c36,toneMapped:false}),
      gas:new THREE.MeshBasicMaterial({color:0x8eaf52,transparent:true,opacity:.28,depthWrite:false}),
      ring:new THREE.MeshBasicMaterial({color:0x729b45,transparent:true,opacity:.55,depthWrite:false}),
    };
    this.root.visible=false;
  }
  create(){
    const g=new THREE.Group(),body=new THREE.Group();g.add(body);
    const add=(geometry,material,parent,x=0,y=0,z=0)=>{const mesh=new THREE.Mesh(this.geometry[geometry],this.material[material]);mesh.position.set(x,y,z);mesh.castShadow=material!=='eye'&&material!=='gas'&&material!=='ring';parent.add(mesh);return mesh;};
    add('torso','shirt',body,0,1.24,.05).rotation.x=.13;
    const head=new THREE.Group();head.position.set(0,2.03,-.14);head.rotation.z=.1;body.add(head);
    add('head','skin',head).scale.set(1,.95,.85);
    const jaw=new THREE.Group();jaw.position.set(0,-.19,-.26);head.add(jaw);
    add('mouth','dark',jaw,0,0,-.15);
    for(const side of [-1,1]){
      add('socket','dark',head,side*.18,.055,-.415).rotation.z=-side*.16;
      add('eye','eye',head,side*.18,.048,-.453).rotation.z=-side*.16;
      const tooth=add('tooth','tooth',jaw,side*.105,-.01,-.185);tooth.rotation.z=Math.PI;
      for(let i=0;i<2;i++)add('stitch','dark',head,side*(.29+i*.075),-.14+i*.1,-.34).rotation.z=side*.6;
      for(let i=0;i<2;i++){const rag=add('rag','shirt',body,side*(.15+i*.26),.72,-.06);rag.rotation.z=Math.PI;rag.rotation.y=i*.8;}
    }
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const arm=new THREE.Group();arm.position.set(side*.61,1.63,0);arm.rotation.x=1.15;body.add(arm);arms.push(arm);
      add('limb','skin',arm,0,-.29,0);add('hand','skin',arm,0,-.74,0);
      const sleeve=add('limb','shirt',arm,0,-.08,0);sleeve.scale.set(1.17,.44,1.17);
      const leg=new THREE.Group();leg.position.set(side*.25,.72,.05);body.add(leg);legs.push(leg);
      add('limb','pants',leg,0,-.28,0);add('foot','dark',leg,0,-.59,-.13);
    }
    const ring=add('ring','ring',g,0,.08,0);ring.rotation.x=Math.PI/2;
    const gas=new THREE.Group();g.add(gas);for(let i=0;i<3;i++)add('aura','gas',gas);
    this.root.add(g);return {g,body,head,jaw,arms,legs,ring,gas,lastX:null,lastP:null,heading:0};
  }
  update(zombies,time,visible=true){
    this.root.visible=visible;
    // Recycle inactive groups before allocating; repeated encounters do not grow
    // the scene or retain per-spawn GPU resources.
    const ids=new Set((zombies??[]).map(z=>z.id)),spares=this.spares;
    for(const [id,entry] of this.pool)if(!ids.has(id)){this.pool.delete(id);entry.g.visible=false;entry.lastX=entry.lastP=null;spares.push(entry);}
    for(const z of zombies??[]){
      let entry=this.pool.get(z.id);
      if(!entry){entry=spares.pop()??this.create();entry.phase=[...String(z.id)].reduce((n,c)=>n+c.charCodeAt(0),0)*1.7;this.pool.set(z.id,entry);}
      const {g,body,head,jaw,arms,legs,ring,gas}=entry;
      const remaining=Number.isFinite(z.expiresAt)?z.expiresAt-time:1;
      g.visible=remaining>0&&!z.eliminated;if(!g.visible)continue;
      const dx=entry.lastX===null?0:z.x-entry.lastX,dp=entry.lastP===null?0:z.p-entry.lastP;
      if(Number.isFinite(z.facing))entry.heading=-z.facing;
      else if(Math.abs(dx)+Math.abs(dp)>.0001)entry.heading=Math.atan2(-dx,dp);
      const phase=Number.isFinite(z.phase)?z.phase:entry.phase,walk=Math.sin(time*8+phase),biting=(z.attackUntil??0)>time||(z.biteCooldown??0)>.55;
      g.position.set(z.x,z.y??0,-z.p);g.rotation.y=entry.heading;
      // Entry/exit stay visual: simulation controls collisions and exact lifetime.
      const scale=Math.min(1,Math.max(.05,remaining/.35));g.scale.setScalar(scale);
      const emergence=z.phase==='emerging'?Math.min(1,Math.max(0,(time-(z.spawnedAt??time))/.85)):1;
      body.position.y=Math.abs(walk)*.035-2.5*(1-emergence);body.rotation.z=Math.sin(time*4+phase)*.045;
      head.rotation.x=biting?.18:Math.sin(time*2.4+phase)*.045;
      jaw.rotation.x=biting?-.48:Math.sin(time*3+phase)*.08;
      arms.forEach((arm,i)=>{arm.rotation.x=biting?1.5:1.1+Math.sin(time*8+phase+i)*.09;arm.rotation.z=(i?1:-1)*.08;});
      legs.forEach((leg,i)=>{leg.rotation.x=walk*(i?1:-1)*.21;});
      ring.scale.setScalar(1+Math.sin(time*4)*.045);
      gas.children.forEach((particle,i)=>{const u=(time*.6+i/3)%1;particle.position.set(Math.sin(i*2+time)*.55,.3+u*1.5,Math.cos(i*2+time)*.55);particle.scale.setScalar(.6+u);});
      entry.lastX=z.x;entry.lastP=z.p;
    }
  }
  dispose(){
    for(const geometry of Object.values(this.geometry))geometry.dispose();
    for(const material of Object.values(this.material))material.dispose();
    this.root.removeFromParent();this.root.clear();this.pool.clear();this.spares=[];
  }
}
