/* eslint-disable no-console */
require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  try {
    console.log('Adding "custom" to the users.role enum if missing...');

    // Find the enum type Postgres assigned to users.role (Sequelize names it
    // enum_<table>_<column>). Check if 'custom' is already a member; add if not.
    const [enumRows] = await sequelize.query(`
      SELECT e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
       WHERE t.typname = 'enum_users_role'
    `);
    const labels = enumRows.map((r) => r.enumlabel);
    if (!labels.includes('custom')) {
      // ALTER TYPE ... ADD VALUE is not transactional in older Postgres, so
      // run it standalone.
      await sequelize.query(`ALTER TYPE "enum_users_role" ADD VALUE IF NOT EXISTS 'custom'`);
      console.log('✓ Added "custom" to enum_users_role');
    } else {
      console.log('✓ "custom" already present in enum_users_role');
    }

    console.log('Creating user_permissions table if missing...');
    const [tableRows] = await sequelize.query(`
      SELECT to_regclass('public.user_permissions') AS tbl
    `);
    // Drop-and-recreate when the table exists but has the wrong column names
    // (an earlier draft of this migration used camelCase). Safe because
    // user_permissions has no production data — it's seeded per custom user.
    if (tableRows[0].tbl) {
      const [colCheck] = await sequelize.query(`
        SELECT column_name FROM information_schema.columns
         WHERE table_name = 'user_permissions'
      `);
      const colNames = colCheck.map((c) => c.column_name);
      const camelCase = colNames.includes('createdAt') && !colNames.includes('created_at');
      if (camelCase) {
        console.log('Detected legacy camelCase columns — recreating user_permissions...');
        await sequelize.query('DROP TABLE "user_permissions" CASCADE');
        tableRows[0].tbl = null;
      }
    }

    if (!tableRows[0].tbl) {
      await sequelize.query(`
        CREATE TABLE "user_permissions" (
          "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          "user_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "permission_key" VARCHAR NOT NULL,
          "level"          VARCHAR NOT NULL DEFAULT 'none',
          "updated_by"     UUID REFERENCES "users"("id"),
          "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
      `);
      await sequelize.query(`
        CREATE UNIQUE INDEX idx_user_permissions_user_perm
            ON "user_permissions"("user_id", "permission_key")
      `);
      await sequelize.query(`
        CREATE INDEX idx_user_permissions_user
            ON "user_permissions"("user_id")
      `);
      console.log('✓ Created user_permissions table + indexes');
    } else {
      console.log('✓ user_permissions table already exists with correct schema');
    }

    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
