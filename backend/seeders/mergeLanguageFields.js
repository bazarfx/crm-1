/* eslint-disable no-console */
require('dotenv').config();
const { sequelize } = require('../models');

(async () => {
  try {
    console.log('Merging primary_language + additional_languages → languages...');

    const cols = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='users'",
      { type: sequelize.QueryTypes.SELECT }
    );
    const names = cols.map((c) => c.column_name);
    const hasPrimary = names.includes('primary_language');
    const hasAdditional = names.includes('additional_languages');
    const hasLanguages = names.includes('languages');
    const hasNative = names.includes('native_language');

    if (!hasLanguages) {
      await sequelize.query(
        `ALTER TABLE "users" ADD COLUMN languages VARCHAR[] DEFAULT ARRAY[]::VARCHAR[] NOT NULL`
      );
      console.log('✓ Added languages column');
    } else {
      console.log('✓ languages column already exists');
    }

    if (hasPrimary || hasAdditional) {
      const primaryPart = hasPrimary
        ? "CASE WHEN primary_language IS NULL OR primary_language = '' THEN ARRAY[]::varchar[] ELSE ARRAY[primary_language]::varchar[] END"
        : 'ARRAY[]::varchar[]';
      const additionalPart = hasAdditional
        ? 'COALESCE(additional_languages, ARRAY[]::varchar[])'
        : 'ARRAY[]::varchar[]';
      const sql = `
        UPDATE "users"
        SET languages = ARRAY(
          SELECT DISTINCT lang
          FROM unnest(${primaryPart} || ${additionalPart}) AS lang
          WHERE lang IS NOT NULL AND lang != ''
        )
        WHERE languages = ARRAY[]::varchar[] OR languages IS NULL
      `;
      await sequelize.query(sql);
      console.log('✓ Merged primary + additional → languages');
    }

    if (hasPrimary) {
      try {
        await sequelize.query('DROP INDEX IF EXISTS idx_users_primary_language');
      } catch (_) { /* ignore */ }
      await sequelize.query('ALTER TABLE "users" DROP COLUMN primary_language');
      console.log('✓ Dropped primary_language');
    }
    if (hasAdditional) {
      try {
        await sequelize.query('DROP INDEX IF EXISTS idx_users_additional_languages');
      } catch (_) { /* ignore */ }
      await sequelize.query('ALTER TABLE "users" DROP COLUMN additional_languages');
      console.log('✓ Dropped additional_languages');
    }

    if (hasNative) {
      await sequelize.query(`
        UPDATE "users"
        SET languages = ARRAY[native_language]::varchar[]
        WHERE (languages = ARRAY[]::varchar[] OR languages IS NULL)
          AND native_language IS NOT NULL AND native_language != ''
      `);
      await sequelize.query('ALTER TABLE "users" DROP COLUMN native_language');
      console.log('✓ Migrated native_language and dropped it');
    }

    await sequelize.query(
      'CREATE INDEX IF NOT EXISTS idx_users_languages ON "users" USING GIN(languages)'
    );
    console.log('✓ GIN index on languages');

    const orphans = await sequelize.query(
      `SELECT id, first_name, last_name, role FROM "users"
       WHERE role IN ('tele_sales', 'senior')
         AND (languages IS NULL OR cardinality(languages) = 0)`,
      { type: sequelize.QueryTypes.SELECT }
    );

    if (orphans.length) {
      console.log(`⚠️  ${orphans.length} tele_sales/senior users have NO languages — re-seed the database.`);
      orphans.forEach((u) => console.log(`   - ${u.first_name} ${u.last_name} (${u.role})`));
    }

    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
