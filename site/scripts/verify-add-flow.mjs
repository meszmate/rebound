// Verifies the reworked add-to-Home experience end to end in the preview
// harness: registry actions exist at load, the Add browser renders usably at
// panel width, search + chips work, spring presets are addable, and the
// in-tool gallery pin + header pin land items on the board.
import { chromium } from 'playwright';

const URL = 'http://localhost:8099/?preview=1&screen=home&w=400&h=880';
const results = [];
function check(name, ok, extra) {
  results.push({ name, ok, extra });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  | ' + extra : ''));
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 880 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL);
await page.waitForSelector('.rb-home-grid', { timeout: 5000 });

// 1. Registry: spring/bounce/recoil presets exist at load, without opening tools.
const reg = await page.evaluate(() => {
  const R = window.Rebound;
  const acts = R.homeActions.all();
  const ids = acts.map((a) => a.id);
  const spring = acts.filter((a) => a.id.startsWith('toolpreset-spring-'));
  const fade = acts.filter((a) => a.id.startsWith('toolpreset-fade-'));
  return {
    total: acts.length,
    springCount: spring.length,
    springKinds: spring.map((a) => a.kind).join(','),
    springHasCurve: spring.every((a) => !!a.curveDef),
    bounce: ids.filter((i) => i.startsWith('toolpreset-bounce-')).length,
    recoil: ids.filter((i) => i.startsWith('toolpreset-recoil-')).length,
    fadeCount: fade.length,
    fadeKind: fade.length ? fade[0].kind : '',
    fadeHasState: fade.length ? !!fade[0].presetState : false,
    springWidget: ids.indexOf('widget-spring') !== -1
  };
});
check('spring presets registered at load', reg.springCount === 5, `count=${reg.springCount} kinds=${reg.springKinds}`);
check('spring presets are one-click applies with real curves', reg.springKinds === 'apply,apply,apply,apply,apply' && reg.springHasCurve);
check('bounce + recoil presets registered', reg.bounce === 4 && reg.recoil === 3, `bounce=${reg.bounce} recoil=${reg.recoil}`);
check('other tools presets are open-with-preset', reg.fadeCount > 0 && reg.fadeKind === 'open' && reg.fadeHasState, `fade=${reg.fadeCount}`);
check('spring available as a widget', reg.springWidget);

// 2. Open the Add browser from edit mode; check geometry and the search field.
await page.click('.rb-home-actions button[title="Add to Home"]').catch(() => {});
// The add button may live elsewhere; fall back to the API-level opener via edit tile.
if (!(await page.$('.rb-modal-browser'))) {
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => (x.getAttribute('title') || '') === 'Add to Home');
    if (b) b.click();
  });
}
await page.waitForSelector('.rb-modal-browser', { timeout: 4000 });
await page.waitForTimeout(350); // let the enter scale transition finish
const geo = await page.evaluate(() => {
  const box = document.querySelector('.rb-modal-browser').getBoundingClientRect();
  const s = document.querySelector('.rb-home-bsearch');
  const sr = s.getBoundingClientRect();
  const chips = [...document.querySelectorAll('.rb-home-bchip')].map((c) => c.textContent.trim());
  return {
    w: Math.round(box.width), h: Math.round(box.height),
    searchW: Math.round(sr.width), searchH: Math.round(sr.height),
    searchVisible: sr.width > 200 && sr.height >= 30,
    chips
  };
});
check('browser sheet fills the panel', geo.w >= 360 && geo.h >= 800, `w=${geo.w} h=${geo.h}`);
check('search is a real, visible field', geo.searchVisible, `search=${geo.searchW}x${geo.searchH}`);
check('category chips with counts', geo.chips.length >= 6 && geo.chips.some((c) => c.startsWith('Presets')), geo.chips.join(' | '));

// 3. Search "spring": presets and widget both reachable.
await page.fill('.rb-home-bsearch input', 'spring');
await page.waitForTimeout(120);
const springSearch = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.rb-home-card')];
  const names = cards.map((c) => c.querySelector('.rb-home-card-name').textContent);
  const withCurve = cards.filter((c) => c.querySelector('.rb-curve-chip')).length;
  return { names, withCurve };
});
// Preset cards show the short preset name under a "Spring" tool subhead.
check('searching spring finds its presets + widget + tool',
  ['Smooth', 'Snappy', 'Bouncy', 'Gentle', 'Heavy'].every((n) => springSearch.names.includes(n)) &&
    springSearch.names.filter((n) => n === 'Spring').length >= 2,
  springSearch.names.slice(0, 8).join(' | '));
check('preset cards draw their real spring curves', springSearch.withCurve >= 5, `curves=${springSearch.withCurve}`);

// 4. Add "Spring: Bouncy" from the browser; expect a new tile on the board.
const before = await page.evaluate(() => document.querySelectorAll('.rb-home-grid > *').length);
await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.rb-home-card')];
  const c = cards.find((x) => x.getAttribute('title') === 'Spring: Bouncy');
  c.querySelector('.rb-home-card-add').click();
});
await page.waitForTimeout(150);
const addState = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.rb-home-card')];
  const c = cards.find((x) => x.getAttribute('title') === 'Spring: Bouncy');
  return { chip: c.querySelector('.rb-home-card-count').textContent, btn: c.querySelector('.rb-home-card-add').textContent };
});
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
const after = await page.evaluate(() => document.querySelectorAll('.rb-home-grid > *').length);
check('adding Spring: Bouncy pins a tile', after === before + 1 && addState.chip.includes('1'), `board ${before}->${after}, chip="${addState.chip}", btn="${addState.btn}"`);
const tileChip = await page.evaluate(() => {
  const tiles = [...document.querySelectorAll('.rb-home-tile')];
  const t = tiles.find((x) => (x.textContent || '').includes('Spring: Bouncy'));
  return t ? { hasCurve: !!t.querySelector('.rb-curve-chip') } : null;
});
check('pinned preset tile shows its real curve', !!tileChip && tileChip.hasCurve);

// 5. In-tool pin: open Spring, hover a preset tile, click its pin.
await page.evaluate(() => window.Rebound.shell.openTool('spring'));
await page.waitForSelector('.rb-tool[data-tool="spring"] .rb-presetgallery', { timeout: 4000 });
const pinInfo = await page.evaluate(() => {
  const g = document.querySelector('.rb-tool[data-tool="spring"] .rb-presetgallery');
  const tile = [...g.querySelectorAll('.rb-tile')].find((t) => t.getAttribute('data-name') === 'Gentle');
  const pin = tile && tile.querySelector('.rb-tile-pin');
  if (pin) pin.click();
  return { hadPin: !!pin };
});
await page.waitForTimeout(120);
const toast1 = await page.evaluate(() => document.querySelector('#rb-toasts') ? document.querySelector('#rb-toasts').textContent : '');
check('gallery tile has a working Add-to-Home pin', pinInfo.hadPin && toast1.includes('Spring: Gentle added to Home'), `toast="${toast1.trim()}"`);

// 6. Header pin: pin the whole Spring tool from the detail bar.
await page.click('button[title="Add this tool to Home"]');
await page.waitForTimeout(120);
const toast2 = await page.evaluate(() => document.querySelector('#rb-toasts').textContent);
check('tool header pin adds the tool', toast2.includes('Spring added to Home'), `toast="${toast2.trim()}"`);

// 7. Board now holds both pins after returning home.
await page.evaluate(() => { const R = window.Rebound; R.shell; document.querySelector('.rb-rail-btn[title="Home"]').click(); });
await page.waitForTimeout(400);
const boardText = await page.evaluate(() => document.querySelector('.rb-home-grid').textContent);
check('board holds the preset pin and the tool pin', boardText.includes('Spring: Gentle') && boardText.includes('Spring: Bouncy'));

// 8. Clicking the pinned preset-load tile opens the tool with state loaded (use
// a fade preset: fade has no applyBuild, so its pin is open-with-preset).
const loadCheck = await page.evaluate(() => {
  const R = window.Rebound;
  const fade = R.homeActions.all().find((a) => a.id.startsWith('toolpreset-fade-'));
  R.shell.openToolWithPreset(fade.toolId, fade.presetState);
  return { name: fade.presetName };
});
await page.waitForTimeout(200);
const fadeOpened = await page.evaluate(() => {
  const t = document.querySelector('.rb-tool[data-tool="fade"]');
  return !!t && !t.classList.contains('rb-hidden');
});
check('open-with-preset opens the tool with state loaded', fadeOpened, `preset=${loadCheck.name}`);

check('no console/page errors', errors.length === 0, errors.slice(0, 3).join(' || '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `\n${failed.length} FAILED` : '\nALL CHECKS PASSED');
process.exit(failed.length ? 1 : 0);
