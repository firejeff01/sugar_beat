import {test,expect} from '@playwright/test';

test.use({viewport:{width:1000,height:700}});
test.beforeEach(async({page})=>{
  await page.route('**/fonts.googleapis.com/**',route=>route.abort());
  await page.clock.install({time:new Date('2026-09-05T00:00:00Z')});
});

const snapshot=page=>page.evaluate(()=>window.__gameTest.snapshot());
const advance=(page,seconds)=>page.evaluate(seconds=>window.__gameTest.advance(seconds),seconds);
async function startRace(page,name='擴充糖豆'){
  await page.goto('/?test');await page.locator('#name').fill(name);
  await page.locator('#start-form button').click();await advance(page,4);
  // Stop RAF wall time; actions still use the production fixed-step simulation.
  await page.clock.pauseAt(new Date('2026-09-05T00:10:00Z'));
  await page.evaluate(()=>window.__gameTest.stopMonsters());
}
async function completeTournament(page){
  for(let round=0;round<3;round++){
    if((await snapshot(page)).state==='countdown')await advance(page,4);
    await page.evaluate(()=>window.__gameTest.arrangeZombieFinish());await advance(page,10.1);
    await expect(page.locator('#results')).toBeVisible();
    expect((await snapshot(page)).round).toBe(round);
    if(round<2){await expect(page.locator('#home')).toBeHidden();await page.locator('#next').click();}
  }
}

test('final results offer both replay and home, preserve the name, and allow another start',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await startRace(page,'記得我的糖豆');await completeTournament(page);
  await expect(page.locator('#home')).toBeVisible();await expect(page.locator('#next')).toContainText('再玩一輪');
  expect((await snapshot(page)).player.results).toHaveLength(3);
  await page.locator('#next').click();let s=await snapshot(page);
  expect(s.round).toBe(0);expect(s.state).toBe('countdown');expect(s.player.results).toEqual([]);
  await completeTournament(page);await page.locator('#home').click();
  await expect(page.locator('#lobby')).toBeVisible();await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#name')).toHaveValue('記得我的糖豆');
  s=await snapshot(page);expect(s.state).toBe('lobby');expect(s.audio.scene).toBe('lobby');
  await page.locator('#start-form button').click();await advance(page,4);
  s=await snapshot(page);expect(s.state).toBe('race');expect(s.round).toBe(0);expect(s.player.name).toBe('記得我的糖豆');
  expect(errors).toEqual([]);
});

test('physical keyboard direction responds quickly; an infected racer must recover before passing a timed gate',async({page})=>{
  await startRace(page);await page.evaluate(()=>window.__gameTest.arrangeTimedGate({seconds:20}));
  await page.keyboard.down('KeyW');await advance(page,.1);
  expect((await snapshot(page)).player.vp).toBeGreaterThan(7.5);
  await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');await advance(page,.05);
  expect((await snapshot(page)).player.vp).toBeLessThan(0);await page.keyboard.up('KeyS');
  await page.evaluate(()=>{window.__gameTest.arrangeTimedGate({seconds:20});window.__gameTest.infectPlayer();});
  await page.keyboard.down('KeyW');await advance(page,.5);await page.keyboard.up('KeyW');
  let s=await snapshot(page);expect(s.player.zombie).toBeGreaterThan(9);expect(s.player.gateBlocked).toBe(true);
  expect(s.player.gatePasses).toBe(0);expect(s.player.p).toBeLessThan(s.gates[0].p);
  await advance(page,9.3);s=await snapshot(page);expect(s.player.zombie).toBeGreaterThan(0);expect(s.player.gatePasses).toBe(0);
  await page.keyboard.down('KeyW');await advance(page,.35);await page.keyboard.up('KeyW');
  s=await snapshot(page);expect(s.player.zombie).toBe(0);expect(s.player.gatePasses).toBe(1);expect(s.player.eliminated).toBe(false);
});

test('zombie encounters emerge on the course and infection blocks finishing until the ten-second cure',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await startRace(page);await page.evaluate(()=>{window.__gameTest.arrangeZombieBite();window.__gameTest.spawnZombie();});
  await advance(page,.02);let s=await snapshot(page);expect(s.zombies).toHaveLength(1);expect(s.zombies[0].phase).toBe('emerging');
  await advance(page,.9);s=await snapshot(page);expect(s.zombies[0].phase).toBe('hunt');
  expect([s.zombies[0].x,s.zombies[0].p,s.zombies[0].facing].every(Number.isFinite)).toBe(true);
  await page.evaluate(()=>window.__gameTest.arrangeZombieFinish());
  await advance(page,9.8);s=await snapshot(page);
  expect(s.player.p).toBeGreaterThan(s.courseLength);expect(s.player.gatePasses).toBe(3);
  expect(s.player.zombie).toBeGreaterThan(0);expect(s.player.finished).toBe(false);expect(s.state).toBe('race');
  await advance(page,.3);s=await snapshot(page);
  expect(s.player.zombie).toBe(0);expect(s.player.finished).toBe(true);expect(s.state).toBe('results');
  expect(s.player.results[0].finished).toBe(true);expect(errors).toEqual([]);
});

test('real audio runs 36 distinct map tracks with separate music and effects switches',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await startRace(page);await expect.poll(async()=>(await snapshot(page)).audio.contextState).toBe('running');
  let s=await snapshot(page);expect(s.audio.musicEnabled).toBe(true);expect(s.audio.sfxEnabled).toBe(true);
  const tracks=await page.evaluate(()=>Array.from({length:36},(_,i)=>window.__gameTest.audioTrack(i+1)));
  expect(new Set(tracks.map(track=>track.profile)).size).toBe(36);expect(new Set(tracks.map(track=>track.tempo)).size).toBe(36);
  tracks.forEach((track,i)=>{expect(track.activeMap).toBe(i+1);expect(track.contextState).toBe('running');expect(track.lastError).toBeNull();expect(track.activeVoices).toBeLessThanOrEqual(64);});
  expect(tracks.at(-1).totalScheduled).toBeGreaterThan(s.audio.totalScheduled);
  await page.locator('#sound').click();s=await snapshot(page);expect(s.audio.sfxEnabled).toBe(false);expect(s.audio.musicEnabled).toBe(true);
  await page.locator('#music').click();s=await snapshot(page);expect(s.audio.musicEnabled).toBe(false);expect(s.audio.sfxEnabled).toBe(false);
  await page.locator('#sound').click();s=await snapshot(page);expect(s.audio.sfxEnabled).toBe(true);expect(s.audio.musicEnabled).toBe(false);
  for(const type of ['fire','water','ice','lightning']){
    const before=(await snapshot(page)).audio.totalScheduled;
    await page.evaluate(type=>window.__gameTest.arrangeMonster(type),type);await advance(page,2.8);
    s=await snapshot(page);expect(s.audio.totalScheduled,`${type} spawn and attack schedule sound`).toBeGreaterThan(before);expect(s.audio.lastError).toBeNull();
  }
  await page.locator('#music').click();await expect(page.locator('#music')).toHaveAttribute('aria-pressed','true');
  await page.locator('#pause').click();s=await snapshot(page);expect(s.audio.paused).toBe(true);expect(s.audio.activeVoices).toBe(0);
  await page.locator('#resume').click();s=await snapshot(page);expect(s.audio.paused).toBe(false);expect(s.audio.contextState).toBe('running');
  expect(errors).toEqual([]);
});

test.describe('expanded controls on a real touch context',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  test('short joystick movement, touch infection and recovery work; phone layouts keep audio and home reachable',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await startRace(page,'手機殭屍');await page.evaluate(()=>window.__gameTest.arrangeZombieBite());
    const client=await page.context().newCDPSession(page),points=new Map();
    const touch=async(type,id,point)=>{
      if(type==='touchEnd'){const ended=points.get(id);points.delete(id);await client.send('Input.dispatchTouchEvent',{type,touchPoints:[ended]});return;}
      points.set(id,{id,x:point.x,y:point.y,radiusX:2,radiusY:2,force:1});
      await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...points.values()]});
    };
    const center=async selector=>{const box=await page.locator(selector).boundingBox();expect(box).not.toBeNull();return{x:box.x+box.width/2,y:box.y+box.height/2};};
    const stick=await center('#touch-stick');
    // 11% stick travel was inside the previous 14% dead zone.
    const travel=await page.evaluate(()=>{const stick=document.querySelector('#touch-stick').getBoundingClientRect(),thumb=document.querySelector('.stick-thumb').getBoundingClientRect();return (Math.min(stick.width,stick.height)-thumb.width)/2;});
    await touch('touchStart',1,stick);await touch('touchMove',1,{x:stick.x,y:stick.y-travel*.11});
    expect((await snapshot(page)).input.forward).toBeGreaterThan(.05);
    await advance(page,.12);expect((await snapshot(page)).player.vp).toBeGreaterThan(.4);await touch('touchEnd',1);
    await page.evaluate(()=>window.__gameTest.arrangeZombieBite());
    await expect(page.locator('[data-key="KeyE"] [data-label]')).toHaveText('咬人');
    await touch('touchStart',2,await center('[data-key="KeyE"]'));await advance(page,.04);await touch('touchEnd',2);
    let s=await snapshot(page);expect(s.racers[1].zombie).toBeGreaterThan(9);expect(s.racers[1].zombieInfections).toBe(1);
    await advance(page,10.1);s=await snapshot(page);expect(s.player.zombie).toBe(0);expect(s.racers[1].zombie).toBe(0);
    await expect(page.locator('[data-key="KeyE"] [data-label]')).toHaveText('抓拉');
    await page.evaluate(()=>window.__gameTest.infectPlayer());await touch('touchStart',3,await center('[data-key="KeyE"]'));
    await advance(page,.04);await touch('touchEnd',3);s=await snapshot(page);
    expect(s.racers[1].zombieInfections).toBe(2);expect(s.racers[1].zombie).toBeGreaterThan(9);
    for(const [width,height] of [[320,568],[390,844],[844,390]]){
      await page.setViewportSize({width,height});await page.clock.runFor(50);
      const bounds=await page.evaluate(()=>({width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
        controls:['#music','#sound','#pause'].map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height};})}));
      expect(bounds.overflow).toBe(false);
      for(const box of bounds.controls){expect(box.width).toBeGreaterThanOrEqual(48);expect(box.height).toBeGreaterThanOrEqual(48);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(bounds.width+1);expect(box.y+box.height).toBeLessThanOrEqual(bounds.height+1);}
      for(let i=0;i<bounds.controls.length;i++)for(let j=i+1;j<bounds.controls.length;j++){
        const a=bounds.controls[i],b=bounds.controls[j];expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,`${width}×${height}: ${a.selector} overlaps ${b.selector}`).toBe(false);
      }
      const old=(await snapshot(page)).audio.musicEnabled;await page.locator('#music').tap();expect((await snapshot(page)).audio.musicEnabled).toBe(!old);
      await page.screenshot({path:`test-results/expansion-mobile-${width}x${height}.png`});
    }
    await page.setViewportSize({width:320,height:568});await page.clock.runFor(50);
    await completeTournament(page);await expect(page.locator('#home')).toBeVisible();await page.locator('#home').tap();
    await expect(page.locator('#lobby')).toBeVisible();await expect(page.locator('#name')).toHaveValue('手機殭屍');expect(errors).toEqual([]);
  });
});
