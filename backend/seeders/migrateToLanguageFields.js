/* eslint-disable no-console */
require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  try {
    console.log('Migrating User table to language fields...');

    const cols = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users'",
      { type: sequelize.QueryTypes.SELECT },
    );
    const names = cols.map((c) => c.column_name);

    if (names.includes('native_language') && !names.includes('primary_language')) {
      await sequelize.query('ALTER TABLE "users" RENAME COLUMN native_language TO primary_language');
      console.log('✓ Renamed native_language → primary_language');
    } else if (!names.includes('primary_language')) {
      await sequelize.query('ALTER TABLE "users" ADD COLUMN primary_language VARCHAR(32)');
      console.log('✓ Added primary_language column');
    } else {
      console.log('✓ primary_language column already exists');
    }

    if (!names.includes('additional_languages')) {
      await sequelize.query('ALTER TABLE "users" ADD COLUMN additional_languages VARCHAR[] NOT NULL DEFAULT ARRAY[]::VARCHAR[]');
      console.log('✓ Added additional_languages column');
    } else {
      console.log('✓ additional_languages column already exists');
    }

    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_primary_language ON "users"(primary_language)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_users_additional_languages ON "users" USING GIN(additional_languages)');
    console.log('✓ Indexes created');

    const result = await sequelize.query(
      "SELECT count(*) as count FROM \"users\" WHERE role IN ('tele_sales', 'senior') AND (primary_language IS NULL OR primary_language = '')",
      { type: sequelize.QueryTypes.SELECT },
    );
    console.log(`Warning: ${result[0].count} tele_sales/senior users have no primary_language. Re-run seeder.`);

    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
