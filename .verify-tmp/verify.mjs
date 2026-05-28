// End-to-end verification of the field-editor changes.
// Drives the real Next.js app at http://localhost:3002 as super_admin.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'D:\\CoreCoders\\Zoho\\crm-1\\.verify-tmp';
mkdirSync(OUT, { recursive: true });

const shot = async (page, name) => {
  const p = join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log('SCREENSHOT', p);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.on('console', (m) => {
  if (m.type() === 'error') console.log('PAGE_ERR', m.text().slice(0, 400));
  if (m.type() === 'warning') console.log('PAGE_WARN', m.text().slice(0, 200));
});
page.on('pageerror', (e) => console.log('PAGE_EXC', e.message));

const log = (...args) => console.log('>>', ...args);

try {
  // --- LOGIN ---
  log('goto /login');
  await page.goto('http://localhost:3002/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'superadmin@thework.ltd');
  await page.fill('input[type="password"]', 'Test@1234');
  await shot(page, '01-login-filled');
  await Promise.all([
    page.waitForURL(/\/dashboard/, { timeout: 15000 }),
    page.click('button[type="submit"]'),
  ]);
  log('logged in, url=', page.url());

  // --- NAV to /settings/fields ---
  await page.goto('http://localhost:3002/settings/fields', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Custom fields', { timeout: 10000 });
  await shot(page, '02-fields-list');

  // Confirm the new "Delete" button is in the table actions row.
  const deleteButtons = await page.locator('button:has-text("Delete")').count();
  log('Delete buttons visible in list:', deleteButtons);
  if (deleteButtons === 0) throw new Error('No Delete buttons found in field list');

  // --- OPEN NEW-FIELD DIALOG ---
  // Click the first "New field" we can see. Each tab has its own.
  await page.locator('button:has-text("New field")').first().click();
  await page.waitForSelector('text=New custom field', { timeout: 5000 });
  // Let the dialog animation settle before capturing the polished layout.
  await page.waitForTimeout(450);
  await shot(page, '03-new-field-dialog');

  // Verify the dialog body scrolls as one unit — find the body's scroll
  // container and confirm scrollHeight > clientHeight, then scroll it.
  const scrollInfo = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('[role="dialog"] div.overflow-y-auto'));
    const body = candidates.find((el) => el.scrollHeight > el.clientHeight);
    if (!body) return { scrollable: false };
    const before = body.scrollTop;
    body.scrollTop = 9999;
    const after = body.scrollTop;
    return { scrollable: true, before, after, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight };
  });
  log('Dialog body scroll:', JSON.stringify(scrollInfo));
  if (!scrollInfo.scrollable || scrollInfo.after === scrollInfo.before) {
    throw new Error('Dialog body is not scrollable');
  }
  await page.waitForTimeout(200);
  await shot(page, '03a-dialog-scrolled');

  // Restore scroll position to the top for the remainder of the suite.
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"] div.overflow-y-auto').forEach((el) => {
      if (el.scrollHeight > el.clientHeight) el.scrollTop = 0;
    });
  });
  await page.waitForTimeout(150);

  // --- (1) field_key auto-populates as label is typed ---
  const labelInput = page.locator('input[placeholder^="e.g. Risk Tolerance"]');
  const keyInput = page.locator('input[placeholder="risk_tolerance"]');

  await labelInput.fill('Verify Risk Tolerance Test');
  await page.waitForTimeout(150);
  const keyAfterLabel = await keyInput.inputValue();
  log('label="Verify Risk Tolerance Test" → key=', keyAfterLabel);

  // Now change the label again and verify the key keeps tracking.
  await labelInput.fill('Verify Risk Tolerance Test Two');
  await page.waitForTimeout(150);
  const keyAfterLabel2 = await keyInput.inputValue();
  log('label changed → key=', keyAfterLabel2);
  await shot(page, '04-key-auto');

  // Now manually edit the key, then change the label again — key should NOT change.
  await keyInput.fill('manual_key_override');
  await page.waitForTimeout(50);
  await labelInput.fill('Some Different Label Now');
  await page.waitForTimeout(150);
  const keyAfterManual = await keyInput.inputValue();
  log('after manual key edit + label change → key=', keyAfterManual);
  if (keyAfterManual !== 'manual_key_override') {
    throw new Error(`Key auto-overwrote after manual edit. got "${keyAfterManual}"`);
  }
  await shot(page, '05-key-manual-locked');

  // --- (4) "Helper text (Optional)" label ---
  const helperLabel = await page.locator('label:has-text("Helper text")').first().innerText();
  log('Helper label text:', JSON.stringify(helperLabel));
  if (!/Optional/i.test(helperLabel)) {
    throw new Error(`Helper label missing (Optional): ${helperLabel}`);
  }

  // --- (3) Live preview is interactive — type into it, value should stick ---
  // The preview's text input shares no special test id; locate it by being inside
  // a card after the Live preview heading. Use the field-name pattern: the preview
  // DynamicField rendered for the current label/key uses id="cf_<field_key>".
  const previewInput = page.locator('input[id^="cf_"]').first();
  await previewInput.fill('hello-from-preview');
  await page.waitForTimeout(80);
  const previewValue = await previewInput.inputValue();
  log('preview input value after typing:', previewValue);
  if (previewValue !== 'hello-from-preview') {
    throw new Error(`Preview input lost value (got "${previewValue}")`);
  }
  await shot(page, '06-preview-interactive');

  // --- (5) Visible-to-roles / Editable-by-roles → dropdown with checkboxes ---
  // Scope: walk up to the Field wrapper (2 div ancestors above the label),
  // then grab the first button — that's the popover trigger.
  const visibleTrigger = page
    .locator('label:has-text("Visible to roles")')
    .locator('xpath=ancestor::div[2]//button[1]')
    .first();
  await visibleTrigger.scrollIntoViewIfNeeded();
  const triggerStart = await visibleTrigger.innerText();
  log('Visible-roles trigger before opening:', triggerStart);
  await visibleTrigger.click();
  // The popover panel renders to body via portal.
  const panel = page.locator('[role="dialog"]').filter({ hasText: 'super admin' }).last();
  await panel.waitFor({ timeout: 3000 });
  await shot(page, '07-roles-dropdown-open');

  // Click "None" inside the panel.
  await panel.locator('button', { hasText: /^None$/ }).click();
  await page.waitForTimeout(120);
  const triggerNone = await visibleTrigger.innerText();
  log('After None:', triggerNone);
  if (!/none|0 of/i.test(triggerNone)) {
    throw new Error(`Trigger did not show none-selected: ${triggerNone}`);
  }
  await shot(page, '08-roles-none-selected');

  // Pick super_admin inside the same panel.
  await panel.locator('button', { hasText: /^super admin$/ }).click();
  await page.waitForTimeout(150);
  const triggerOne = await visibleTrigger.innerText();
  log('After picking super_admin:', triggerOne);
  if (!/super admin/i.test(triggerOne)) {
    throw new Error(`Trigger did not show super_admin: ${triggerOne}`);
  }

  // Test the search box: type "admin" — should narrow visible options.
  await panel.locator('input[placeholder*="Search roles"]').fill('admin');
  await page.waitForTimeout(200);
  const visibleRoles = await panel.locator('button:has(span:has-text("admin"))').count();
  log('After typing "admin", admin-matching rows visible:', visibleRoles);
  await shot(page, '09a-roles-search-admin');

  // Clear search, then close popover via Escape (should not close Dialog
  // because of the capture-phase fix).
  await panel.locator('input[placeholder*="Search roles"]').fill('');
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  // The field-editor Dialog should still be open.
  const dialogStillThere = await page.locator('text=New custom field').count();
  log('Dialog still open after Escape inside popover:', dialogStillThere);
  if (dialogStillThere === 0) {
    throw new Error('Escape inside popover closed the parent dialog — regression');
  }
  await shot(page, '09-roles-after-pick-one');

  // Cancel the dialog — we don't want to create a junk field.
  await page.locator('button:has-text("Cancel")').first().click();
  await page.waitForTimeout(300);

  // --- (2) Hard Delete behavior ---
  // (2a) Find a field that has data — picking the first row in Leads. Its
  // Delete should toast-error because records hold a value.
  // We'll find the row's Delete button by table position.
  const firstRowDelete = page.locator('tbody tr').first().locator('button:has-text("Delete")');
  // Set up dialog auto-accept just in case
  page.on('dialog', async (d) => { log('dialog:', d.message().slice(0, 120)); await d.dismiss(); });
  await firstRowDelete.scrollIntoViewIfNeeded();
  await firstRowDelete.click();
  // Wait for the toast (react-hot-toast renders into the body).
  await page.waitForTimeout(1500);
  const toastTextAttempt = await page.locator('[role="status"], div:has-text("still hold a value")').first().innerText().catch(() => '');
  log('Delete-with-data toast:', toastTextAttempt.slice(0, 200));
  await shot(page, '10-delete-blocked-toast');

  // (2b) Now create a brand-new field with no data and delete it from
  // inside the EDITOR (testing the new footer Archive + Delete buttons).
  await page.locator('button:has-text("New field")').first().click();
  await page.waitForSelector('text=New custom field');
  const newLabel = 'Verify Delete Target ' + Date.now();
  await page.locator('input[placeholder^="e.g. Risk Tolerance"]').fill(newLabel);
  await page.locator('button:has-text("Create field")').click();
  await page.waitForSelector('text=New custom field', { state: 'detached', timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);

  // Open Edit on the newly created row → confirm Archive + Delete are
  // visible in the dialog footer for an existing field.
  const targetRow = page.locator('tbody tr', { hasText: 'Verify Delete Target' }).first();
  await targetRow.waitFor({ timeout: 8000 });
  await targetRow.locator('button:has-text("Edit")').click();
  await page.waitForSelector('text=Edit field', { timeout: 5000 });
  await page.waitForTimeout(400);

  const editorFooterArchive = await page.locator('button:has-text("Archive")').count();
  const editorFooterDelete = await page.locator('button:has-text("Delete")').count();
  log('Editor footer — Archive buttons:', editorFooterArchive, 'Delete buttons:', editorFooterDelete);
  if (editorFooterArchive === 0 || editorFooterDelete === 0) {
    throw new Error('Archive or Delete missing from editor footer');
  }
  await shot(page, '11a-editor-with-archive-delete');

  // Auto-accept the confirm dialog and click Delete inside the editor.
  page.removeAllListeners('dialog');
  page.on('dialog', async (d) => { log('confirm dialog (accept):', d.message().slice(0, 120)); await d.accept(); });
  await page.locator('button:has-text("Delete")').last().click();
  // Wait for the editor dialog to close and the row to disappear.
  await page.waitForTimeout(2000);
  await shot(page, '11-after-hard-delete');

  const stillThere = await page.locator('tbody tr', { hasText: 'Verify Delete Target' }).count();
  log('Rows with "Verify Delete Target" after editor-delete:', stillThere);
  if (stillThere > 0) throw new Error('Field row still present after hard delete via editor');

  console.log('ALL_CHECKS_PASSED');
} catch (e) {
  console.log('FAIL:', e.message);
  await shot(page, '99-error');
  process.exit(1);
} finally {
  await browser.close();
}
