/* Rendered evidence for human review. These captures do not score design quality. */
const {chromium} = require('C:/Users/Mick/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const out = process.env.QA_OUTPUT_DIR || 'artifacts/editorial-review';
const root = (process.env.TEST_BASE_URL || 'http://127.0.0.1:4322'+require('../deployment.config.mjs').siteBase).replace(/\/$/,'');
const pages = ['','topics/representing-molecules/','topics/screening-molecules/','topics/binding-affinity/'];
(async () => {
  fs.mkdirSync(out, {recursive:true});
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const page = await browser.newPage();
  const measurements = [];
  try {
    for (const [layout, width, height] of [['desktop',1440,1000],['mobile',390,844]]) {
      await page.setViewportSize({width,height});
      for (const path of pages) {
        const name = path.split('/').filter(Boolean).pop() || 'home';
        await page.goto(root+'/'+path, {waitUntil:'networkidle'});
        await page.screenshot({path:`${out}/${layout}-${name}-opening.png`});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        for (const [i, figure] of (await page.locator('.paper-figure,.teaching-figure').all()).entries()) {
          await figure.scrollIntoViewIfNeeded();
          await figure.locator('img').evaluateAll(imgs => Promise.all(imgs.map(img => img.decode())));
          await figure.screenshot({path:`${out}/${layout}-${name}-figure-${i+1}.png`});
          measurements.push({layout,page:name,figure:i+1,...await figure.evaluate(el => ({
            width:el.getBoundingClientRect().width,
            height:el.getBoundingClientRect().height,
            caption:el.querySelector('figcaption')?.textContent,
            labels:Array.from(el.querySelectorAll('h4,h5')).map(e => ({text:e.textContent,font:getComputedStyle(e).fontSize})),
            images:Array.from(el.querySelectorAll('img')).map(e => ({src:e.getAttribute('src'),width:e.getBoundingClientRect().width}))
          }))});
        }
        if (layout === 'mobile' && path.includes('binding-affinity')) {
          const button = page.getByRole('button',{name:'Enlarge AGIMA-Score architecture'});
          await button.focus();
          await page.keyboard.press('Enter');
          await page.locator('dialog[open]').screenshot({path:`${out}/mobile-enlargement.png`});
          await page.keyboard.press('Escape');
          assert.equal(await button.evaluate(e => e === document.activeElement), true);
        }
      }
    }
    fs.writeFileSync(`${out}/measurements.json`,JSON.stringify({date:new Date().toISOString(),browser:browser.version(),measurements},null,2));
    console.log('Captured desktop and mobile openings, every paper/teaching figure, and mobile keyboard enlargement.');
  } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
