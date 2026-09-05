import {test,expect} from '@playwright/test';

const snapshot=page=>page.evaluate(()=>window.__gameTest.snapshot());
const advance=(page,seconds)=>page.evaluate(seconds=>window.__gameTest.advance(seconds),seconds);

for(const [key,otherKey] of [['ShiftLeft','ShiftRight'],['ShiftRight','ShiftLeft']]){
  test(`${key} dives and escapes a grab; releasing it keeps ${otherKey} active`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/?test');await page.locator('#start-form button').click();await advance(page,4);
    await page.evaluate(()=>{window.__gameTest.stopMonsters();window.__gameTest.arrangeGrab(true);});

    // Use physical key codes: Playwright's generic "Shift" only covers the left key.
    await page.keyboard.down(key);await advance(page,.05);
    let s=await snapshot(page);
    expect(s.input.dive).toBe(true);
    expect(s.player.diveCooldown).toBeGreaterThan(.5);
    expect(s.player.dive).toBeGreaterThan(0);
    expect(s.player.grabbedBy).toBeNull();expect(s.player.escapes).toBe(1);
    await page.keyboard.up(key);await advance(page,1/60);
    expect((await snapshot(page)).input.dive).toBe(false);

    // Park the other racers and cancel the fixture's attack before testing held keys.
    await page.evaluate(()=>{
      window.__gameTest.arrangeMonster('fire');window.__gameTest.stopMonsters();
    });
    await page.keyboard.down(key);await page.keyboard.down(otherKey);
    expect((await snapshot(page)).input.dive).toBe(true);
    await page.keyboard.up(key);await advance(page,1/60);
    s=await snapshot(page);expect(s.input.dive).toBe(true);expect(s.player.diveHeld).toBe(true);
    await page.keyboard.up(otherKey);await advance(page,1/60);
    s=await snapshot(page);expect(s.input.dive).toBe(false);expect(s.player.diveHeld).toBe(false);
    expect(errors).toEqual([]);
  });
}
