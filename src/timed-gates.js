// Course deadlines use race time from GO; moving gate positions use simulation time.
const EPSILON=1e-8;
const platformCenter=(platform,time)=>platform.x+(platform.amplitude||0)*Math.sin(time*(platform.speed??1)+(platform.phase??0));

export function generateTimedGates(platforms,length,timeLimit,round=0) {
  const candidates=platforms.map((platform,platformIndex)=>({platformIndex,p:platform.end-2})).slice(1,-1);
  const selected=[];
  for(const fraction of [.25,.5,.75]) {
    const nearest=candidates.filter(candidate=>!selected.some(g=>g.platformIndex===candidate.platformIndex))
      .sort((a,b)=>Math.abs(a.p-length*fraction)-Math.abs(b.p-length*fraction)||a.p-b.p)[0];
    if(nearest)selected.push(nearest);
  }
  return selected.sort((a,b)=>a.p-b.p).map((gate,index)=>({
    id:index+1,...gate,
    // Reserve one short recovery window for a monster attack or a crowd shove.
    deadline:Math.min(timeLimit-5,Math.round(timeLimit*(.30+.70*gate.p/length)-round)+4),
  }));
}

function releaseInteractions(racer,racers) {
  for(const other of racers) {
    if(other.grabTarget===racer.id){other.grabTarget=null;other.grabTime=0;}
    if(other.grabbedBy===racer.id){other.grabbedBy=null;other.grabbedTime=0;}
  }
  Object.assign(racer,{grabTarget:null,grabbedBy:null,grabTime:0,grabbedTime:0,grabHeld:false,pushHeld:false,jumpHeld:false,diveHeld:false,dive:0,vx:0,vp:0,vy:0,sheltered:false});
}

export function stepTimedGates(racers,course,elapsed,time,dt,previousPositions) {
  const gates=course.gates??[],expired=[];
  for(const racer of racers) {
    if(racer.finished||racer.eliminated)continue;
    const previous=previousPositions?.get(racer.id);
    let gate=gates[racer.gatePasses??0];
    while(gate&&previous&&previous.respawns===racer.respawns&&previous.p<gate.p&&racer.p>=gate.p) {
      const fraction=(gate.p-previous.p)/(racer.p-previous.p);
      const crossingTime=elapsed-dt+dt*fraction;
      const x=previous.x+(racer.x-previous.x)*fraction,y=previous.y+(racer.y-previous.y)*fraction;
      const platform=course.platforms[gate.platformIndex];
      const center=platformCenter(platform,time-dt+dt*fraction);
      // Flying around the gate, falling under it and checkpoint teleports are not passes.
      if(crossingTime>gate.deadline+EPSILON||Math.abs(x-center)>platform.width/2+EPSILON||y<-.15-EPSILON||y>3+EPSILON)break;
      racer.gateTimes??=[];racer.gateTimes.push(Math.min(crossingTime,gate.deadline));
      racer.gatePasses=(racer.gatePasses??0)+1;
      gate=gates[racer.gatePasses];
    }
    if(gate&&elapsed+EPSILON>=gate.deadline)expired.push({racer,gate});
  }
  const newlyEliminated=[];
  // Usually just one gate expires in a fixed tick. Grouping also keeps locked
  // places correct if a test or a catch-up frame crosses several deadlines.
  for(const deadline of [...new Set(expired.map(({gate})=>gate.deadline))].sort((a,b)=>a-b)) {
    const batch=expired.filter(({gate})=>gate.deadline===deadline)
      .sort((a,b)=>b.racer.p-a.racer.p||a.racer.id-b.racer.id);
    const firstPlace=racers.filter(r=>!r.eliminated).length-batch.length+1;
    batch.forEach(({racer,gate},index)=>{
      Object.assign(racer,{eliminated:true,eliminationPlace:firstPlace+index,eliminatedAt:gate.deadline,eliminationGate:gate.id,eliminationProgress:racer.p});
      releaseInteractions(racer,racers);newlyEliminated.push(racer);
    });
  }
  return newlyEliminated;
}
