/* eslint-disable no-console */
require('dotenv').config();

const { RolePermission, sequelize, syncDatabase } = require('../models');
const { PERMISSION_DEFINITIONS, ALL_ROLES } = require('../utils/permissionDefaults');

/**
 * Seed (or re-seed with --force) the role_permissions table.
 * - super_admin gets 'all' for every permission (display only — Layer 2
 *   short-circuit in utils/permissions.js makes this row decorative).
 * - All other roles get the level defined in PERMISSION_DEFINITIONS, or
 *   'none' if unspecified.
 */
async function seedRolePermissions(opts = { force: false }) {
  const existing = await RolePermission.count();
  if (existing > 0 && !opts.force) {
    console.log(
      `✓ role_permissions already has ${existing} rows. Skipping seed (use force: true to reseed).`
    );
    return existing;
  }

  if (opts.force) {
    console.log('⚠️  Force reseed: clearing role_permissions table…');
    // Bypass the beforeBulkUpdate / beforeDestroy super_admin guard hooks
    // for the seeder by using a raw delete with hooks disabled.
    await RolePermission.destroy({
      where: {},
      force: true,
      individualHooks: false,
      hooks: false,
    });
  }

  const rows = [];
  for (const [key, category, description, defaults] of PERMISSION_DEFINITIONS) {
    for (const role of ALL_ROLES) {
      const level = role === 'super_admin' ? 'all' : defaults[role] || 'none';
      rows.push({ role, permission_key: key, level, category, description });
    }
  }

  await RolePermission.bulkCreate(rows, { ignoreDuplicates: true });
  console.log(`✓ Seeded ${rows.length} role_permission rows`);
  return rows.length;
}

module.exports = { seedRolePermissions };

if (require.main === module) {
  const force = process.argv.includes('--force');
  (async () => {
    try {
      // Make sure the RolePermissions table exists before inserting into it.
      await syncDatabase({ alter: true });
      console.log('✓ Schema synced (alter:true)');
      await seedRolePermissions({ force });
      try { await sequelize.close(); } catch {}
      process.exit(0);
    } catch (e) {
      console.error('seedRolePermissions failed:', e);
      try { await sequelize.close(); } catch {}
      process.exit(1);
    }
  })();
}
