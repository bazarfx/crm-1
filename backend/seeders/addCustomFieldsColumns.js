/* eslint-disable no-console */
require('dotenv').config();
const { sequelize } = require('../models');

// Real table names (snake_case in this project, not the PascalCase the prompt
// template assumed). LeadActivity rows are touched the least but custom_fields
// is harmless there — keeps the registry uniform across entities.
const TABLES = [
  'leads',
  'users',
  'campaigns',
  'groups',
  'lead_activities',
];

(async () => {
  try {
    // 1) Ensure the role ENUM accepts schema_editor before any sync runs.
    //    PostgreSQL ENUMs can't change inside a transaction-bound DDL, so we
    //    run it standalone, guarded by IF NOT EXISTS.
    try {
      await sequelize.query(`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'schema_editor'`);
      console.log('✓ enum_users_role includes schema_editor');
    } catch (e) {
      // Older PG (<9.6) won't have IF NOT EXISTS. Fall back to ignoring the
      // duplicate-value error so re-runs are idempotent.
      if (!/already exists|duplicate/i.test(e.message)) throw e;
      console.log('• enum_users_role already includes schema_editor');
    }

    // 2) Add JSONB custom_fields + GIN index to every entity table.
    for (const table of TABLES) {
      const existsTable = await sequelize.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = :t`,
        { replacements: { t: table }, type: sequelize.QueryTypes.SELECT },
      );
      if (existsTable.length === 0) {
        console.log(`⚠️  Table "${table}" does not exist yet — skipping (sync will add it)`);
        continue;
      }

      const existsCol = await sequelize.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name = :t AND column_name = 'custom_fields'`,
        { replacements: { t: table }, type: sequelize.QueryTypes.SELECT },
      );
      if (existsCol.length === 0) {
        await sequelize.query(
          `ALTER TABLE "${table}" ADD COLUMN custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb`,
        );
        console.log(`✓ Added custom_fields to ${table}`);
      } else {
        console.log(`• ${table}.custom_fields already exists`);
      }

      const idxName = `idx_${table}_custom_fields`;
      await sequelize.query(
        `CREATE INDEX IF NOT EXISTS "${idxName}" ON "${table}" USING GIN(custom_fields)`,
      );
    }

    console.log('Migration complete.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
