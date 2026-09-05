import * as THREE from 'three';

// Gates are attached to the same group as their platform, including moving floors.
export class TimedGateView {
  constructor(){this.gates=[];}
  clear(){
    for(const view of this.gates){view.texture.dispose();view.label.material.dispose();view.material.dispose();}
    this.gates=[];
  }
  build(course,platformMeshes){
    for(const gate of course.gates){
      const {p,g}=platformMeshes[gate.platformIndex],group=new THREE.Group();
      group.position.set(p.x,0,-gate.p);g.add(group);
      const material=new THREE.MeshStandardMaterial({color:0xffc64a,roughness:.55});
      const bar=(w,h,d,x,y,z)=>{
        const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;group.add(m);return m;
      };
      for(const side of [-1,1])bar(.22,4.4,.26,side*(p.width/2+.12),2.2,0);
      bar(p.width+.46,.3,.32,0,4.35,0);
      bar(p.width,.045,.45,0,.045,0);
      for(let x=-p.width/2+.3;x<p.width/2;x+=.65)bar(.28,.045,.45,x,.05,-.6);
      const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
      const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthWrite:false}));
      label.position.set(0,5.45,0);label.scale.set(5.5,1.375,1);group.add(label);
      this.gates.push({gate,material,canvas,texture,label,key:null});
    }
    this.update(0,null);
  }
  update(elapsed,racer){
    for(const view of this.gates){
      const {gate}=view,passed=(racer?.gatePasses??0)>=gate.id,left=Math.max(0,Math.ceil(gate.deadline-elapsed));
      const status=passed?'passed':left===0?'closed':left<=10?'urgent':'open',key=`${status}-${left}`;
      if(view.key===key)continue;view.key=key;
      const color={passed:0x39d4a3,closed:0xf15c79,urgent:0xff8645,open:0xffc64a}[status];view.material.color.setHex(color);
      const ctx=view.canvas.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle='#292142';ctx.beginPath();ctx.roundRect(4,4,504,120,24);ctx.fill();
      ctx.strokeStyle=`#${color.toString(16).padStart(6,'0')}`;ctx.lineWidth=6;ctx.stroke();
      ctx.fillStyle='#fff';ctx.font='800 54px Outfit, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText(`${String(gate.id).padStart(2,'0')}  /  ${passed?'OK':left===0?'CLOSED':`${left}s`}`,256,66);
      view.texture.needsUpdate=true;
    }
  }
}
