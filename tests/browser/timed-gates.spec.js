import {test,expect} from '@playwright/test';

test.use({viewport:{width:1000,height:700}});

const snapshot=page=>page.evaluate(()=>window.__gameTest.snapshot());
const advance=(page,seconds)=>page.evaluate(seconds=>window.__gameTest.advance(seconds),seconds);

async function startRace(page){
  await page.goto('/?test');
  await page.locator('#name').fill('限時糖豆');
  await page.locator('#start-form button').click();
  await advance(page,4);
}

test('walking through a timed gate before its deadline preserves the pass and keeps the racer alive',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await startRace(page);
  await page.evaluate(()=>window.__gameTest.arrangeTimedGate({seconds:4}));
  let s=await snapshot(page);
  expect(s.gates).toHaveLength(3);expect(s.player.gatePasses).toBe(0);
  expect(s.player.p).toBeLessThan(s.gates[0].p);
  await expect(page.locator('#gate-status')).toBeVisible();
  await page.keyboard.down('w');await advance(page,.35);await page.keyboard.up('w');
  s=await snapshot(page);
  expect(s.player.gatePasses).toBe(1);expect(s.player.eliminated).toBe(false);
  await advance(page,Math.max(0,s.gates[0].deadline-s.elapsed)+.1);
  s=await snapshot(page);
  expect(s.player.gatePasses).toBe(1);expect(s.player.eliminated).toBe(false);expect(s.state).toBe('race');
  await expect(page.locator('#gate-label')).toContainText('2');
  expect(errors).toEqual([]);
});

test('an overdue racer is immediately ranked, stops accepting controls, scores once and rejoins the next round',async({page})=>{
  await startRace(page);
  await page.evaluate(()=>window.__gameTest.arrangeTimedGate({seconds:2}));
  await advance(page,2.1);
  let s=await snapshot(page);
  expect(s.state).toBe('race');expect(s.player.eliminated).toBe(true);
  expect(s.player.eliminationGate).toBe(1);expect(s.player.eliminationPlace).toBe(12);
  expect(s.racers.find(r=>r.id===1).eliminated).toBe(false);
  await expect(page.locator('#gate-status')).toHaveAttribute('data-state','eliminated');
  await expect(page.locator('#gate-status')).toContainText('本關淘汰');
  await expect(page.locator('#gate-status')).toContainText('12');
  await expect(page.locator('#gate-status')).toContainText('下一關重新上場');
  await expect(page.locator('#live-list')).toContainText('限時糖豆');
  await expect(page.locator('#live-list')).toContainText('12');
  const stopped={x:s.player.x,p:s.player.p,y:s.player.y};
  await page.keyboard.down('w');await page.keyboard.down('Space');await page.keyboard.down('ShiftRight');await page.keyboard.down('e');
  await advance(page,.5);
  s=await snapshot(page);
  expect({x:s.player.x,p:s.player.p,y:s.player.y}).toEqual(stopped);
  expect(s.input).toMatchObject({x:0,forward:0,jump:false,dive:false,grab:false});
  expect(s.player.grabTarget).toBeNull();expect(s.player.grabbedBy).toBeNull();
  await page.keyboard.up('w');await page.keyboard.up('Space');await page.keyboard.up('ShiftRight');await page.keyboard.up('e');
  await page.screenshot({path:'test-results/timed-gate-eliminated.png'});
  await advance(page,105);
  await expect(page.locator('#results')).toBeVisible();await expect(page.locator('#result-body tr')).toHaveCount(12);
  await expect(page.locator('.you-row')).toContainText('淘汰');
  s=await snapshot(page);
  expect(s.player.results).toHaveLength(1);
  expect(s.player.results[0]).toMatchObject({place:12,points:5,eliminated:true,eliminationGate:1,status:'eliminated'});
  expect(s.player.points).toBe(5);
  await advance(page,10);expect((await snapshot(page)).player.points).toBe(5);
  await page.locator('#next').click();
  s=await snapshot(page);expect(s.round).toBe(1);
  for(const racer of s.racers){expect(racer.eliminated).toBe(false);expect(racer.gatePasses).toBe(0);expect(racer.eliminationPlace).toBeNull();}
  expect(s.player.points).toBe(5);expect(s.player.results).toHaveLength(1);
});

test('pause freezes the timed gate countdown until the race resumes',async({page})=>{
  await startRace(page);
  await page.evaluate(()=>window.__gameTest.arrangeTimedGate({seconds:3}));
  await page.keyboard.press('Escape');
  const paused=await snapshot(page),display=await page.locator('#gate-timer').textContent();
  expect(paused.state).toBe('paused');
  await advance(page,10);
  let s=await snapshot(page);expect(s.elapsed).toBe(paused.elapsed);expect(s.player.eliminated).toBe(false);
  await expect(page.locator('#gate-timer')).toHaveText(display);
  await page.locator('#resume').click();await advance(page,3.1);
  s=await snapshot(page);expect(s.player.eliminated).toBe(true);expect(s.player.eliminationGate).toBe(1);
});

test.describe('timed gate HUD on touch screens',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
  test('portrait and landscape keep the timer and elimination notice clear of touch controls',async({page})=>{
    // Screenshot latency must not advance a live race into its result screen.
    // Keep layout time fixed; the same real physics tick still drives elimination.
    await page.clock.install({time:new Date('2026-09-05T00:00:00Z')});
    await startRace(page);
    await page.clock.pauseAt(new Date('2026-09-05T00:10:00Z'));
    for(const [width,height] of [[390,844],[844,390]]){
      await page.setViewportSize({width,height});
      await page.evaluate(()=>window.__gameTest.arrangeTimedGate({seconds:3}));
      for(const eliminated of [false,true]){
        if(eliminated)await advance(page,3.1);
        await page.clock.runFor(50);
        await expect(page.locator('#gate-status')).toBeVisible();
        if(eliminated){
          await expect(page.locator('#gate-status')).toHaveAttribute('data-state','eliminated');
          await expect(page.locator('.touch-controls')).toBeHidden();
          expect((await snapshot(page)).input).toMatchObject({x:0,forward:0,jump:false,dive:false,grab:false});
        }else await expect(page.locator('.touch-controls')).toBeVisible();
        const bounds=await page.evaluate(()=>{
          const box=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height};};
          return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
            gate:box('#gate-status'),controls:['#touch-stick','[data-key="Space"]','[data-key="ShiftLeft"]','[data-key="KeyE"]','#pause'].map(box)};
        });
        expect(bounds.overflow).toBe(false);
        const gate=bounds.gate;
        expect(gate.width).toBeGreaterThan(0);expect(gate.height).toBeGreaterThan(0);
        expect(gate.x).toBeGreaterThanOrEqual(0);expect(gate.y).toBeGreaterThanOrEqual(0);
        expect(gate.x+gate.width).toBeLessThanOrEqual(bounds.width+1);expect(gate.y+gate.height).toBeLessThanOrEqual(bounds.height+1);
        for(const control of bounds.controls.filter(box=>!eliminated||box.selector==='#pause')){
          const overlaps=gate.x<control.x+control.width&&gate.x+gate.width>control.x&&gate.y<control.y+control.height&&gate.y+gate.height>control.y;
          expect(overlaps,`${width}×${height}: gate notice overlaps ${control.selector}`).toBe(false);
        }
        await page.screenshot({path:`test-results/timed-gate-${width}x${height}-${eliminated?'eliminated':'countdown'}.png`});
      }
    }
  });
});
