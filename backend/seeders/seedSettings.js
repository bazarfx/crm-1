/* eslint-disable no-console */
require('dotenv').config();
const { Setting, sequelize } = require('../models');

const DEFAULT_SETTINGS = [
  // ─── Assignment rules ─────────────────────────────────────────
  {
    key: 'assignment.mode',
    value: { mode: 'round_robin' }, // round_robin | manual | language_first
    label: 'Lead assignment mode',
    description: 'How leads are assigned to telesellers when they come in',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  {
    key: 'assignment.language_strict',
    value: { enabled: true },
    label: 'Strict language matching',
    description: 'Only assign leads to telesellers whose native language matches the lead language',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  {
    key: 'assignment.fallback_group',
    value: { enabled: true, group_id: null },
    label: 'Fallback group',
    description: 'If no language-matched group found, assign to this group',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  {
    key: 'assignment.skip_inactive',
    value: { enabled: true },
    label: 'Skip inactive telesellers',
    description: 'Automatically skip users who are marked inactive in round robin',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  {
    key: 'assignment.daily_limit',
    value: { enabled: false, limit: 50 },
    label: 'Daily lead limit per teleseller',
    description: 'Maximum leads that can be assigned to a single teleseller per day',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  {
    key: 'assignment.duplicate_action',
    value: { action: 'skip' }, // skip | reassign_to_owner | create_new
    label: 'Duplicate lead action',
    description: 'What to do when a lead with same phone/facebook_id already exists',
    category: 'assignment',
    is_editable_by_admin: true,
  },
  // ─── Display ──────────────────────────────────────────────────
  {
    key: 'display.leads_per_page',
    value: { count: 25 },
    label: 'Leads per page',
    description: 'Default number of leads shown in table view',
    category: 'display',
    is_editable_by_admin: true,
  },
  {
    key: 'display.dashboard_refresh',
    value: { seconds: 60 },
    label: 'Dashboard auto-refresh',
    description: 'How often the dashboard refreshes metrics automatically',
    category: 'display',
    is_editable_by_admin: true,
  },
  // ─── System (super_admin only) ────────────────────────────────
  {
    key: 'system.ark_webhook_active',
    value: { enabled: true },
    label: 'ARK webhook active',
    description: 'Enable or disable incoming ARK terminal webhooks',
    category: 'system',
    is_editable_by_admin: false,
  },
  {
    key: 'system.ingest_active',
    value: { enabled: true },
    label: 'Lead ingest active',
    description: 'Enable or disable the Integrately ingest endpoint',
    category: 'system',
    is_editable_by_admin: false,
  },
  {
    key: 'system.trial_mode',
    value: { enabled: false },
    label: 'Trial/demo mode',
    description: 'When enabled, shows trial leads on dashboards to demonstrate the system',
    category: 'system',
    is_editable_by_admin: false,
  },
];

(async () => {
  try {
    await sequelize.authenticate();
    let inserted = 0;
    let skipped = 0;
    for (const def of DEFAULT_SETTINGS) {
      const [, created] = await Setting.findOrCreate({
        where: { key: def.key },
        defaults: def,
      });
      if (created) inserted++;
      else skipped++;
    }
    console.log(`✅ Settings: ${inserted} inserted, ${skipped} already present (${DEFAULT_SETTINGS.length} total)`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Settings seed failed:', e);
    process.exit(1);
  }
})();
