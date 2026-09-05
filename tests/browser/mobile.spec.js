import {test,expect} from '@playwright/test';

// hasTouch + isMobile exercises browser gesture handling and pointer capture.
// Resizing a desktop page alone would miss multi-touch cancellation bugs.
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});

const snapshot=page=>page.evaluate(()=>window.__gameTest.snapshot());
const advance=(page,seconds)=>page.evaluate(seconds=>window.__gameTest.advance(seconds),seconds);
async function center(page,selector){
  const box=await page.locator(selector).boundingBox();
  expect(box,`${selector} should be visible`).not.toBeNull();
  return{x:box.x+box.width/2,y:box.y+box.height/2,r:Math.min(box.width,box.height)/2};
}
async function touchController(page){
  const client=await page.context().newCDPSession(page),points=new Map();
  const send=type=>client.send('Input.dispatchTouchEvent',{type,touchPoints:[...points.values()]});
  return{
    async down(id,point){points.set(id,{id,x:point.x,y:point.y,radiusX:3,radiusY:3,force:1});await send('touchStart');},
    async move(id,point){points.set(id,{...points.get(id),x:point.x,y:point.y});await send('touchMove');},
    async up(id){const point=points.get(id);points.delete(id);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[point]});},
    async cancel(){points.clear();await send('touchCancel');},
  };
}
async function startRace(page){
  await page.goto('/?test');
  await page.locator('#name').fill('手機糖豆');
  await page.locator('#start-form button').tap();
  await advance(page,4);
  await page.evaluate(()=>{window.__gameTest.stopMonsters();window.__gameTest.arrangeGrab();});
  await expect(page.locator('#touch-stick')).toBeVisible();
}
function expectNeutral(input){
  expect(input.x).toBeCloseTo(0,8);expect(input.forward).toBeCloseTo(0,8);
  expect(input.jump).toBe(false);expect(input.dive).toBe(false);expect(input.grab).toBe(false);
}

test('real multi-touch steers diagonally, jumps and dives; cancellation and pause release every input',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await startRace(page);
  const touch=await touchController(page),stick=await center(page,'#touch-stick');
  const jump=await center(page,'[data-key="Space"]'),dive=await center(page,'[data-key="ShiftLeft"]');
  await touch.down(1,stick);await touch.move(1,{x:stick.x+stick.r*.55,y:stick.y-stick.r*.65});
  let s=await snapshot(page);expect(s.input.x).toBeGreaterThan(.2);expect(s.input.forward).toBeGreaterThan(.2);
  expect(Math.hypot(s.input.x,s.input.forward)).toBeLessThanOrEqual(1.001);
  await touch.down(2,jump);s=await snapshot(page);expect(s.input.jump).toBe(true);expect(s.input.forward).toBeGreaterThan(.2);
  await advance(page,.12);expect((await snapshot(page)).player.y).toBeGreaterThan(.2);
  await touch.up(2);expect((await snapshot(page)).input.jump).toBe(false);
  await touch.down(3,dive);await advance(page,.08);
  s=await snapshot(page);expect(s.input.dive).toBe(true);expect(s.player.diveCooldown).toBeGreaterThan(.5);
  await touch.cancel();expectNeutral((await snapshot(page)).input);
  await expect(page.locator('#touch-stick')).not.toHaveClass(/active/);
  await expect(page.locator('.touch-actions .pressed')).toHaveCount(0);

  await touch.down(4,stick);await touch.move(4,{x:stick.x,y:stick.y-stick.r*.8});
  await touch.down(5,await center(page,'#pause'));await touch.up(5);
  await expect(page.locator('#pause-panel')).toBeVisible();
  s=await snapshot(page);expect(s.state).toBe('paused');expectNeutral(s.input);
  const elapsed=s.elapsed;await advance(page,1);expect((await snapshot(page)).elapsed).toBe(elapsed);
  await touch.up(4);await page.locator('#resume').tap();
  expectNeutral((await snapshot(page)).input);expect(errors).toEqual([]);
});

test('holding touch grab allows steering, releasing lets go, and touch dive escapes an AI grip',async({page})=>{
  await startRace(page);
  const touch=await touchController(page),stick=await center(page,'#touch-stick');
  await touch.down(1,await center(page,'[data-key="KeyE"]'));
  await advance(page,.04);let s=await snapshot(page);expect(s.player.grabTarget).toBe(1);expect(s.input.grab).toBe(true);
  await touch.down(2,stick);await touch.move(2,{x:stick.x,y:stick.y-stick.r*.8});
  s=await snapshot(page);expect(s.input.grab).toBe(true);expect(s.input.forward).toBeGreaterThan(.5);
  // The AI may escape the short grip while the real browser processes gestures.
  await advance(page,.05);expect((await snapshot(page)).player.grabs).toBe(1);
  await touch.up(1);await advance(page,.02);s=await snapshot(page);expect(s.input.grab).toBe(false);expect(s.player.grabTarget).toBeNull();
  await touch.up(2);await page.evaluate(()=>window.__gameTest.arrangeGrab(true));
  await touch.down(3,await center(page,'[data-key="ShiftLeft"]'));await advance(page,.04);await touch.up(3);
  s=await snapshot(page);expect(s.player.grabbedBy).toBeNull();expect(s.player.escapes).toBe(1);expectNeutral(s.input);
});

test('lightning reverses touch movement and swaps jump for a backward dive',async({page})=>{
  await startRace(page);
  await page.evaluate(()=>window.__gameTest.arrangeMonster('lightning'));await advance(page,1.75);
  let s=await snapshot(page);expect(s.player.reversed).toBe(5);
  await page.evaluate(()=>window.__gameTest.stopMonsters());await advance(page,.7);
  await expect(page.locator('#reverse-keys')).toBeVisible();
  const touch=await touchController(page),stick=await center(page,'#touch-stick'),before=(await snapshot(page)).player.p;
  await touch.down(1,stick);await touch.move(1,{x:stick.x,y:stick.y-stick.r*.8});await advance(page,.18);
  s=await snapshot(page);expect(s.input.forward).toBeGreaterThan(.5);expect(s.player.p).toBeLessThan(before);
  await touch.down(2,await center(page,'[data-key="Space"]'));await advance(page,.05);
  s=await snapshot(page);expect(s.input.jump).toBe(true);expect(s.player.diveCooldown).toBeGreaterThan(.5);expect(s.player.vp).toBeLessThan(0);
  await page.screenshot({path:'test-results/mobile-lightning-touch.png'});
  await touch.cancel();expectNeutral((await snapshot(page)).input);
});

test('phone rotation, narrow screens and touch tablets keep reachable controls without overlap',async({page})=>{
  await startRace(page);
  const touch=await touchController(page);let stick=await center(page,'#touch-stick');
  await touch.down(1,stick);await touch.move(1,{x:stick.x,y:stick.y-stick.r*.8});
  await page.setViewportSize({width:844,height:390});
  await expect.poll(async()=>Math.abs((await snapshot(page)).input.forward)).toBe(0);
  await touch.cancel();
  for(const [width,height] of [[844,390],[1024,768],[320,568],[390,844]]){
    await page.setViewportSize({width,height});
    await expect(page.locator('.touch-controls')).toBeVisible();
    const bounds=await page.evaluate(()=>{
      const selectors=['#touch-stick','[data-key="Space"]','[data-key="ShiftLeft"]','[data-key="KeyE"]','#pause'];
      return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
        controls:selectors.map(selector=>{const r=document.querySelector(selector).getBoundingClientRect();return{selector,x:r.x,y:r.y,width:r.width,height:r.height};})};
    });
    expect(bounds.overflow).toBe(false);
    for(const box of bounds.controls){
      expect(box.width,`${width}×${height} ${box.selector} touch width`).toBeGreaterThanOrEqual(48);
      expect(box.height,`${width}×${height} ${box.selector} touch height`).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(bounds.width+1);expect(box.y+box.height).toBeLessThanOrEqual(bounds.height+1);
    }
    for(let a=0;a<bounds.controls.length;a++)for(let b=a+1;b<bounds.controls.length;b++){
      const first=bounds.controls[a],second=bounds.controls[b];
      const overlapping=first.x<second.x+second.width&&first.x+first.width>second.x&&first.y<second.y+second.height&&first.y+first.height>second.y;
      expect(overlapping,`${width}×${height} ${first.selector} overlaps ${second.selector}`).toBe(false);
    }
    stick=await center(page,'#touch-stick');await touch.down(2,stick);await touch.move(2,{x:stick.x,y:stick.y-stick.r*.8});
    expect((await snapshot(page)).input.forward).toBeGreaterThan(.5);await touch.up(2);
    await page.screenshot({path:`test-results/mobile-${width}x${height}.png`});
  }
});
