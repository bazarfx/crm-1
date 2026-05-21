import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'scripts', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const FAKE_USER = {
  id: 'u-admin-demo',
  first_name: 'Aparna',
  last_name: 'Rao',
  name: 'Aparna Rao',
  email: 'admin1@thework.ltd',
  role: 'admin',
};

const PAGES = [
  { name: 'dashboard',  url: 'http://localhost:3000/dashboard' },
  { name: 'leads',      url: 'http://localhost:3000/leads' },
  { name: 'leads-detail', url: 'http://localhost:3000/leads/demo-lead-uuid' },
  { name: 'reports',    url: 'http://localhost:3000/reports' },
  { name: 'settings',   url: 'http://localhost:3000/settings' },
  { name: 'groups',     url: 'http://localhost:3000/groups' },
  { name: 'campaigns',  url: 'http://localhost:3000/campaigns' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile',  width: 375,  height: 812, deviceScaleFactor: 2 },
];

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor });

    // Seed localStorage so auth gate passes
    await ctx.addInitScript(({ user }) => {
      window.localStorage.setItem('crm1_access_token', 'fake-access-token');
      window.localStorage.setItem('crm1_refresh_token', 'fake-refresh-token');
      window.localStorage.setItem(
        'crm1-store',
        JSON.stringify({ state: { user }, version: 0 })
      );
    }, { user: FAKE_USER });

    const page = await ctx.newPage();
    for (const p of PAGES) {
      try {
        await page.goto(p.url, { waitUntil: 'load', timeout: 30000 });
        // Wait for likely content
        await page.waitForTimeout(2000);
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
