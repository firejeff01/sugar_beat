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
test('mobile start and touch controls fit the viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/?test');
  await page.screenshot({path:'test-results/mobile-lobby.png'});
  await page.locator('.play-button').first().click();await page.evaluate(()=>window.__gameTest.advance(4));
  await expect(page.locator('.touch-controls')).toBeVisible();
  await page.locator('[data-key="KeyW"]').dispatchEvent('pointerdown',{pointerId:1});await page.evaluate(()=>window.__gameTest.advance(.5));await page.locator('[data-key="KeyW"]').dispatchEvent('pointerup',{pointerId:1});
  expect((await page.evaluate(()=>window.__gameTest.snapshot())).player.p).toBeGreaterThan(1);
  await page.screenshot({path:'test-results/mobile-race.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
