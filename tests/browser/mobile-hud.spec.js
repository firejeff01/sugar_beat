import {test,expect} from '@playwright/test';

const snapshot=page=>page.evaluate(()=>window.__gameTest.snapshot());
const advance=(page,seconds)=>page.evaluate(seconds=>window.__gameTest.advance(seconds),seconds);
const controlSelectors=['#touch-stick','[data-key="KeyE"]','[data-key="ShiftLeft"]','[data-key="Space"]','#music','#sound','#pause'];
const noticeSelectors=['#gate-status','#monster-warning','#status-panel','#zombie-warning','#toast','#race-hint'];

test.beforeEach(async({page})=>{
  await page.route('**/fonts.googleapis.com/**',route=>route.abort());
  await page.clock.install({time:new Date('2026-09-05T00:00:00Z')});
});

async function startRace(page){
  await page.goto('/?test');
  await page.locator('#name').fill('看得見賽道的糖豆');
  await page.locator('#start-form button').click();
  await advance(page,4);
  // Freeze wall time so taking a screenshot cannot expire a status or a gate.
  // The fixtures below still exercise the real fixed-step simulation and HUD.
  await page.clock.pauseAt(new Date('2026-09-05T00:10:00Z'));
  await page.evaluate(()=>window.__gameTest.stopMonsters());
}

async function showCombinedWarnings(page){
  // Trigger an actual grab toast before arranging the simultaneous race notices.
  await page.evaluate(()=>window.__gameTest.arrangeGrab());
  await page.keyboard.down('KeyE');await advance(page,.04);await page.keyboard.up('KeyE');
  await page.evaluate(()=>{
    window.__gameTest.arrangeTimedGate({seconds:8});
    window.__gameTest.arrangeMonster('lightning');
  });
  await advance(page,1.75);
  await page.evaluate(()=>window.__gameTest.infectPlayer());
  await page.clock.runFor(50);
  const state=await snapshot(page);
  expect(state.state).toBe('race');
  expect(state.player.paralyzed).toBeGreaterThan(0);
  expect(state.player.reversed).toBeGreaterThan(4);
  expect(state.player.zombie).toBeGreaterThan(9);
  await expect(page.locator('#gate-status')).toHaveAttribute('data-state','urgent');
  await expect(page.locator('#monster-warning')).toBeVisible();
  await expect(page.locator('#monster-warning')).toContainText('雷');
  await expect(page.locator('#status-panel')).toBeVisible();
  await expect(page.locator('#status-panel')).toContainText('殭屍');
  await expect(page.locator('#status-panel')).toContainText(/反轉|反向|相反/);
  await expect(page.locator('#reverse-keys')).toBeVisible();
  await expect(page.locator('#gate-timer')).toBeVisible();
  await expect(page.locator('#gate-timer')).toContainText(/\d/);
  await expect(page.locator('#pause-panel')).toBeHidden();
}

const overlaps=(a,b)=>a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;

async function measurePhoneHUD(page){
  return page.evaluate(({controlSelectors,noticeSelectors})=>{
    const visible=element=>{
      const style=getComputedStyle(element);
      return element.getClientRects().length>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0;
    };
    const box=selector=>{
      const element=document.querySelector(selector),rect=element.getBoundingClientRect();
      return{selector,x:rect.x,y:rect.y,width:rect.width,height:rect.height,pointerEvents:getComputedStyle(element).pointerEvents};
    };
    const notices=noticeSelectors.filter(selector=>visible(document.querySelector(selector))).map(box);
    const information=['.race-stats','.round-info','.race-progress'].filter(selector=>visible(document.querySelector(selector))).map(box);
    const controls=controlSelectors.map(selector=>{
      const element=document.querySelector(selector),bounds=box(selector);
      const hit=document.elementFromPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2);
      return{...bounds,receivesTouch:hit===element||element.contains(hit)};
    });
    const timer=document.querySelector('#gate-timer');
    return{
      width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth,
      notices,information,controls,dashboard:box('.race-dashboard'),
      // Reserve the middle of the race view, where approaching terrain must remain visible.
      clearView:{x:innerWidth*.2,y:innerHeight*.4,width:innerWidth*.6,height:innerHeight*.32},
      timer:{fontSize:parseFloat(getComputedStyle(timer).fontSize),clipped:timer.scrollWidth>timer.clientWidth+1||timer.scrollHeight>timer.clientHeight+1},
    };
  },{controlSelectors,noticeSelectors});
}

test.describe('compact phone race information',()=>{
  test.use({viewport:{width:390,height:664},hasTouch:true,isMobile:true,deviceScaleFactor:1});

  test('simultaneous gate, monster and infection notices leave the course and touch controls clear',async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await startRace(page);
    const cases=[
      {width:320,height:568,name:'320x568'},
      // A reduced content viewport approximates browser bars; this is not a real iPhone test.
      {width:390,height:664,name:'390x664-browser-bars'},
      {width:844,height:390,name:'844x390-landscape'},
      // Explicit CSS insets exercise safe-area layout without claiming to emulate device hardware.
      {width:390,height:664,name:'390x664-safe-area',safeTop:24,safeBottom:20},
    ];
    for(const size of cases){
      await page.setViewportSize({width:size.width,height:size.height});
      await page.evaluate(({safeTop=0,safeBottom=0})=>{
        document.documentElement.style.setProperty('--safe-top',`${safeTop}px`);
        document.documentElement.style.setProperty('--safe-bottom',`${safeBottom}px`);
      },size);
      await showCombinedWarnings(page);
      const layout=await measurePhoneHUD(page);
      expect(layout.overflow,`${size.name}: page overflows horizontally`).toBe(false);
      expect(layout.timer.fontSize,`${size.name}: gate countdown remains readable`).toBeGreaterThanOrEqual(12);
      expect(layout.timer.clipped,`${size.name}: gate countdown is clipped`).toBe(false);
      for(const box of [layout.dashboard,...layout.information,...layout.notices,...layout.controls]){
        expect(box.width,`${size.name}: ${box.selector} width`).toBeGreaterThan(0);
        expect(box.height,`${size.name}: ${box.selector} height`).toBeGreaterThan(0);
        expect(box.x,`${size.name}: ${box.selector} left`).toBeGreaterThanOrEqual(-1);
        expect(box.y,`${size.name}: ${box.selector} top`).toBeGreaterThanOrEqual(-1);
        expect(box.x+box.width,`${size.name}: ${box.selector} right`).toBeLessThanOrEqual(layout.width+1);
        expect(box.y+box.height,`${size.name}: ${box.selector} bottom`).toBeLessThanOrEqual(layout.height+1);
      }
      for(const box of [layout.dashboard,...layout.information,...layout.notices]){
        expect(overlaps(box,layout.clearView),`${size.name}: ${box.selector} covers the central course`).toBe(false);
        expect(box.pointerEvents,`${size.name}: ${box.selector} intercepts input`).toBe('none');
      }
      // The transparent dashboard may span empty space beside the header buttons.
      // Only painted information elements and notices must avoid the controls.
      for(const box of [...layout.information,...layout.notices]){
        for(const control of layout.controls)expect(overlaps(box,control),`${size.name}: ${box.selector} covers ${control.selector}`).toBe(false);
      }
      for(let i=0;i<layout.notices.length;i++)for(let j=i+1;j<layout.notices.length;j++){
        expect(overlaps(layout.notices[i],layout.notices[j]),`${size.name}: ${layout.notices[i].selector} overlaps ${layout.notices[j].selector}`).toBe(false);
      }
      for(const control of layout.controls){
        expect(control.width,`${size.name}: ${control.selector} touch width`).toBeGreaterThanOrEqual(48);
        expect(control.height,`${size.name}: ${control.selector} touch height`).toBeGreaterThanOrEqual(48);
        expect(control.receivesTouch,`${size.name}: ${control.selector} is covered by another element`).toBe(true);
      }
      await page.screenshot({path:`test-results/mobile-hud-${size.name}.png`});
    }
    expect(errors).toEqual([]);
  });
});

test('desktop keeps the full race information and shelter instructions',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await startRace(page);
  await showCombinedWarnings(page);
  await expect(page.locator('body')).not.toHaveClass(/touch-mode/);
  await expect(page.locator('.race-dashboard')).toHaveCSS('display','contents');
  await expect(page.locator('#round-label')).toContainText('/ 36 · 極難');
  await expect(page.locator('.leaderboard')).toBeVisible();
  await expect(page.locator('.bottom-hud')).toBeVisible();
  await expect(page.locator('#reverse-keys')).toContainText('W ⇄ S');
  await expect(page.locator('#gate-detail')).toContainText('感染中不能通關');
  await page.screenshot({path:'test-results/mobile-hud-desktop-regression.png'});
  await page.evaluate(()=>window.__gameTest.arrangeShelter('fire'));
  await page.clock.runFor(50);
  await expect(page.locator('#monster-warning')).toContainText('掩體保護中');
  await expect(page.locator('#monster-warning')).toContainText('威化牆');
});
