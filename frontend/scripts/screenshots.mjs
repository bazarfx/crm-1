import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'scripts', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'login',            url: 'http://localhost:3000/login',        waitFor: 'h1' },
  { name: 'dashboard-redirect', url: 'http://localhost:3000/dashboard', waitFor: null },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile',  width: 375,  height: 812, deviceScaleFactor: 2 },
];

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      try {
        await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
        if (p.waitFor) await page.waitForSelector(p.waitFor, { timeout: 8000 }).catch(() => {});
        // Give fonts/animations a beat
        await page.waitForTimeout(800);
        const file = path.join(OUT, `${p.name}-${vp.name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        const url = page.url();
        const title = await page.title();
        console.log(`OK  ${p.name}-${vp.name}.png  url=${url}  title="${title}"`);
      } catch (err) {
        console.log(`ERR ${p.name}-${vp.name}: ${err.message}`);
      }
    }
    await ctx.close();
  }
  await browser.close();
})();
