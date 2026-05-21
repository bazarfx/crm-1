import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(process.cwd(), 'scripts', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const FAKE_USER = {
  id: 'u-admin-demo', first_name: 'Aparna', last_name: 'Rao',
  name: 'Aparna Rao', email: 'admin1@thework.ltd', role: 'admin',
};

(async () => {
  const browser = await chromium.launch();
  for (const vp of [
    { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
    { name: 'mobile',  width: 375,  height: 812, deviceScaleFactor: 2 },
  ]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.deviceScaleFactor });
    await ctx.addInitScript(({ user }) => {
      window.localStorage.setItem('crm1_access_token', 'fake-access-token');
      window.localStorage.setItem('crm1_refresh_token', 'fake-refresh-token');
      window.localStorage.setItem('crm1-store', JSON.stringify({ state: { user }, version: 0 }));
    }, { user: FAKE_USER });

    const page = await ctx.newPage();
    await page.goto('http://localhost:3000/leads/demo-lead-uuid', { waitUntil: 'load', timeout: 30000 });
    // Wait for axios timeout to elapse so loader → empty state
    await page.waitForTimeout(17000);
    const file = path.join(OUT, `leads-detail-empty-${vp.name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    console.log(`OK  leads-detail-empty-${vp.name}.png`);
    await ctx.close();
  }
  await browser.close();
})();
