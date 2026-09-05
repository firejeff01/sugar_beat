import {test,expect} from '@playwright/test';
test('name → controls → pause → three rounds → all scores → fresh seed',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test');await expect(page.locator('#world canvas')).toBeVisible();
  await page.screenshot({path:'test-results/lobby.png'});
  await page.locator('#name').fill('測試糖豆 <b>');await page.locator('.play-button').first().click();
  await page.evaluate(()=>window.__gameTest.advance(4));
  const seed=(await page.evaluate(()=>window.__gameTest.snapshot())).seed;
  await page.keyboard.down('w');await page.evaluate(()=>window.__gameTest.advance(.5));await page.keyboard.up('w');
  let s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.p).toBeGreaterThan(1);
  await page.keyboard.press('Escape');s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.state).toBe('paused');const time=s.elapsed;
  await page.evaluate(()=>window.__gameTest.advance(10));expect((await page.evaluate(()=>window.__gameTest.snapshot())).elapsed).toBe(time);
  await page.locator('#resume').click();await page.keyboard.down('Space');await page.evaluate(()=>window.__gameTest.advance(.1));await page.keyboard.up('Space');
  expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.y).toBeGreaterThan(.3);
  await page.keyboard.down('Shift');await page.evaluate(()=>window.__gameTest.advance(.1));await page.keyboard.up('Shift');
  expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.diveCooldown).toBeGreaterThan(.7);
  await page.screenshot({path:'test-results/race.png'});
  for(let round=0;round<3;round++) {
    await page.evaluate(()=>window.__gameTest.advance(105));await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#result-body tr')).toHaveCount(12);
    await expect(page.locator('.you-row')).toContainText('測試糖豆 <b>');
    if(round<2){await page.locator('#next').click();await page.evaluate(()=>window.__gameTest.advance(4));}
  }
  await expect(page.locator('#result-title')).toContainText('最終排名');s=await page.evaluate(()=>window.__gameTest.snapshot());
  for(const r of s.racers){expect(r.results).toHaveLength(3);expect(r.points).toBe(r.results.reduce((sum,result)=>sum+result.points,0));}
  await page.screenshot({path:'test-results/results.png'});
  await page.locator('#next').click();s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.round).toBe(0);expect(s.seed).not.toBe(seed);expect(s.player.points).toBe(0);expect(errors).toEqual([]);
});
test('compact lobby and touch control layout fit the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?test');
  await page.screenshot({path:'test-results/mobile-lobby.png'});
  await page.locator('.play-button').first().click();await page.evaluate(()=>window.__gameTest.advance(4));
  await expect(page.locator('.touch-controls')).toBeVisible();
  await expect(page.locator('#touch-stick')).toBeVisible();
  await expect(page.locator('.touch-actions [data-key]')).toHaveCount(3);
  await page.screenshot({path:'test-results/mobile-race.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('E grabs a nearby AI, release starts cooldown, and Shift escapes an AI grab',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Screenshot latency must not consume the .85-second grip or its cooldown.
  await page.clock.install({time:new Date('2026-09-05T00:00:00Z')});
  await page.goto('/?test');await page.locator('#start-form button').click();await page.evaluate(()=>window.__gameTest.advance(4));
  await page.clock.pauseAt(new Date('2026-09-05T00:10:00Z'));
  await page.evaluate(()=>window.__gameTest.arrangeGrab());
  await page.keyboard.down('e');await page.evaluate(()=>window.__gameTest.advance(.05));
  let s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.grabs).toBe(1);expect(s.player.grabTarget).toBe(1);
  await expect(page.locator('#grab-label')).toContainText('抓到了');await page.clock.runFor(17);await page.screenshot({path:'test-results/grab.png'});
  await page.keyboard.up('e');await page.evaluate(()=>window.__gameTest.advance(.05));s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.grabTarget).toBeNull();expect(s.player.grabCooldown).toBeGreaterThan(2);
  await page.evaluate(()=>window.__gameTest.arrangeGrab(true));await page.keyboard.down('Shift');await page.evaluate(()=>window.__gameTest.advance(.05));await page.keyboard.up('Shift');
  s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.grabbedBy).toBeNull();expect(s.player.escapes).toBe(1);expect(errors).toEqual([]);
});

test('monster warning, fire/water/ice visuals, lightning inversion and paused status timers',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test');await page.locator('#start-form button').click();await page.evaluate(()=>window.__gameTest.advance(4));
  await expect(page.locator('#round-label')).toContainText('/ 36 · 極難');
  for(const type of ['fire','water','ice']){
    await page.evaluate(type=>window.__gameTest.arrangeMonster(type),type);await expect(page.locator('#monster-warning')).toBeVisible();
    const before=(await page.evaluate(()=>window.__gameTest.snapshot())).player.monsterHits;
    await page.evaluate(()=>window.__gameTest.advance(1.8));const s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.monsterHits).toBe(before+1);expect(s.player.lastMonsterHit).toBe(type);
    await expect(page.locator('#status-panel')).toBeVisible();await page.screenshot({path:`test-results/monster-${type}.png`});
  }
  await page.evaluate(()=>window.__gameTest.arrangeMonster('lightning'));await page.evaluate(()=>window.__gameTest.advance(1.75));
  let s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.paralyzed).toBeGreaterThan(0);expect(s.player.reversed).toBe(5);
  await page.keyboard.press('Escape');s=await page.evaluate(()=>window.__gameTest.snapshot());await page.evaluate(()=>window.__gameTest.advance(4));expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.paralyzed).toBe(s.player.paralyzed);
  await page.locator('#resume').click();await page.evaluate(()=>window.__gameTest.advance(.65));await expect(page.locator('#reverse-keys')).toContainText('W ⇄ S');
  const start=(await page.evaluate(()=>window.__gameTest.snapshot())).player.p;await page.keyboard.down('w');await page.evaluate(()=>window.__gameTest.advance(.2));await page.keyboard.up('w');
  expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.p).toBeLessThan(start);
  await page.screenshot({path:'test-results/monster-lightning.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/monster-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.evaluate(()=>window.__gameTest.stopMonsters());await page.evaluate(()=>window.__gameTest.advance(5));expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.reversed).toBe(0);
  expect(errors).toEqual([]);
});

test('terrain shelters all monster types; leaving the green zone exposes the player',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Keep each forced attack active while inspecting the shelter and screenshot.
  await page.clock.install({time:new Date('2026-09-05T00:00:00Z')});
  await page.goto('/?test');await page.locator('#start-form button').click();await page.evaluate(()=>window.__gameTest.advance(4));
  await page.clock.pauseAt(new Date('2026-09-05T00:10:00Z'));
  for(const [index,type] of ['fire','water','ice','lightning'].entries()){
    const side=index%2?-1:1;
    await page.evaluate(({type,side})=>window.__gameTest.arrangeShelter(type,side),{type,side});
    await expect(page.locator('#monster-warning')).toContainText('掩體保護中');
    await page.evaluate(()=>window.__gameTest.advance(1.8));
    let s=await page.evaluate(()=>window.__gameTest.snapshot());
    expect(s.player.monsterHits).toBe(0);expect(s.player.sheltered).toBe(true);
    if(type==='fire'){await page.clock.runFor(17);await page.screenshot({path:'test-results/terrain-shelter.png'});}
    // S walks out around the end of the wall while still inside the attack stripe.
    await page.keyboard.down('s');await page.evaluate(()=>window.__gameTest.advance(.3));await page.keyboard.up('s');
    s=await page.evaluate(()=>window.__gameTest.snapshot());expect(s.player.monsterHits).toBe(1);expect(s.player.lastMonsterHit).toBe(type);
  }
  await page.evaluate(()=>window.__gameTest.arrangeShelter('ice',1,true));
  await expect(page.locator('#monster-warning')).not.toContainText('掩體保護中');
  await page.evaluate(()=>window.__gameTest.advance(1.8));expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.frozen).toBeGreaterThan(0);
  await page.evaluate(()=>window.__gameTest.arrangeShelter('water',-1));await page.setViewportSize({width:390,height:844});
  await page.clock.runFor(50);await page.screenshot({path:'test-results/terrain-shelter-mobile.png'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
