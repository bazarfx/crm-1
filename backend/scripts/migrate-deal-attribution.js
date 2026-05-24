/* eslint-disable no-console */
/**
 * One-shot migration: add deal-attribution columns to leads + backfill them
 * from each existing FTD lead's current assignee.
 *
 * Idempotent — safe to run multiple times. Run from the backend/ dir:
 *
 *   node scripts/migrate-deal-attribution.js
 *
 * What it does:
 *   1. ALTER TABLE leads ADD COLUMN closed_by_user_id UUID, closed_by_name VARCHAR(128), closed_at TIMESTAMPTZ
 *      (each guarded by `IF NOT EXISTS`)
 *   2. CREATE INDEX on closed_by_user_id
 *   3. UPDATE leads SET closed_by_user_id = assigned_to_id, closed_by_name = "First Last",
 *      closed_at = ftd_at WHERE ftd_at IS NOT NULL AND closed_by_user_id IS NULL
 */

require('dotenv').config();
const { sequelize, Lead, User } = require('../models');

async function main() {
  console.log('▶ Connecting to database…');
  await sequelize.authenticate();
  console.log('  ✓ connected');

  // ── 1. Add columns (idempotent) ────────────────────────────────────────
  console.log('▶ Adding closed_by_* columns to leads…');
  await sequelize.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS closed_by_user_id UUID REFERENCES users(id),
      ADD COLUMN IF NOT EXISTS closed_by_name VARCHAR(128),
      ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ
  `);
  console.log('  ✓ columns ensured');

  console.log('▶ Adding index on closed_by_user_id…');
  await sequelize.query(`
    CREATE INDEX IF NOT EXISTS leads_closed_by_user_id_idx
      ON leads (closed_by_user_id)
  `);
  console.log('  ✓ index ensured');

  // ── 2. Backfill ────────────────────────────────────────────────────────
  console.log('▶ Looking up existing FTD leads with no closer recorded…');
  const ftdLeads = await Lead.findAll({
    where: { ftd_at: { [require('sequelize').Op.ne]: null }, closed_by_user_id: null },
    attributes: ['id', 'assigned_to_id', 'ftd_at'],
    raw: true,
  });
  console.log(`  · found ${ftdLeads.length} FTD lead(s) needing backfill`);

  if (ftdLeads.length === 0) {
    console.log('  ✓ nothing to backfill');
    await sequelize.close();
    return;
  }

  // Batch user lookups by id.
  const userIds = [...new Set(ftdLeads.map((l) => l.assigned_to_id).filter(Boolean))];
  const users = userIds.length
    ? await User.findAll({
        where: { id: userIds },
        attributes: ['id', 'first_name', 'last_name'],
        paranoid: false, // include soft-deleted users so attribution survives
        raw: true,
      })
    : [];
  const userMap = Object.fromEntries(
    users.map((u) => [u.id, `${u.first_name || ''} ${u.last_name || ''}`.trim() || null]),
  );

  let updated = 0;
  let unattributed = 0;
  for (const l of ftdLeads) {
    const name = l.assigned_to_id ? userMap[l.assigned_to_id] : null;
    if (!l.assigned_to_id) unattributed += 1;
    await Lead.update(
      {
        closed_by_user_id: l.assigned_to_id || null,
        closed_by_name: name,
        closed_at: l.ftd_at,
      },
      { where: { id: l.id }, hooks: false, silent: true },
    );
    updated += 1;
  }

  console.log(`  ✓ backfilled ${updated} deal(s)`);
  if (unattributed > 0) {
    console.log(`  ⚠ ${unattributed} had no assigned_to_id at FTD — closer left null`);
  }

  await sequelize.close();
  console.log('▶ Done.');
}

main().catch(async (err) => {
  console.error('✗ migration failed:', err);
  try { await sequelize.close(); } catch { /* ignore */ }
  process.exit(1);
});
