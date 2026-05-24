/* eslint-disable no-console */
require('dotenv').config();
const { faker } = require('@faker-js/faker');
const {
  sequelize,
  syncDatabase,
  Config,
  User,
  Group,
  GroupMember,
  Campaign,
  CampaignGroupAssignment,
  Lead,
  LeadActivity,
  RoundRobinState,
  RefreshToken,
  AuditLog,
  IngestLog,
  ArkWebhookLog,
} = require('../models');
const { seedRolePermissions } = require('./seedRolePermissions');
const { assignToTeleseller, assignToSenior } = require('../utils/leadAssignment');
const {
  RRPointer,
  RolePermission,
  UserPermission,
  RoutingRule,
  DealUndoRequest,
  Setting,
} = require('../models');

faker.seed(20260521);

const PASSWORD = 'Test@1234';

async function run() {
  console.log('🌱 LEAN seed (assignment terminology)...');
  await sequelize.authenticate();
  await syncDatabase({ force: false });

  console.log('Clearing existing data...');
  // Order matters — child tables first.
  await LeadActivity.destroy({ where: {}, force: true });
  await AuditLog.destroy({ where: {}, force: true });
  await IngestLog.destroy({ where: {}, force: true });
  await ArkWebhookLog.destroy({ where: {}, force: true });
  await DealUndoRequest.destroy({ where: {}, force: true, paranoid: false });
  await Lead.destroy({ where: {}, force: true, paranoid: false });
  await CampaignGroupAssignment.destroy({ where: {}, force: true });
  await Campaign.destroy({ where: {}, force: true, paranoid: false });
  await RoundRobinState.destroy({ where: {}, force: true });
  await RRPointer.destroy({ where: {}, force: true });
  await GroupMember.destroy({ where: {}, force: true, paranoid: false });
  await Group.destroy({ where: {}, force: true, paranoid: false });
  await RefreshToken.destroy({ where: {}, force: true, paranoid: false });
  await UserPermission.destroy({ where: {}, force: true });
  await RoutingRule.destroy({ where: {}, force: true, paranoid: false });
  // RolePermission rows reference users via updated_by — clear before users.
  await RolePermission.destroy({ where: {}, force: true });
  // Setting also references users via updated_by — clear before users.
  await Setting.destroy({ where: {}, force: true });
  await User.destroy({ where: {}, force: true, paranoid: false });
  await Config.destroy({ where: {}, force: true, paranoid: false });

  console.log('Seeding config (category/key schema)...');
  await Config.bulkCreate([
    { category: 'language', key: 'english',  label: 'English',  sort_order: 1 },
    { category: 'language', key: 'tamil',    label: 'Tamil',    sort_order: 2 },
    { category: 'language', key: 'telugu',   label: 'Telugu',   sort_order: 3 },
    { category: 'language', key: 'hindi',    label: 'Hindi',    sort_order: 4 },
    { category: 'language', key: 'marathi',  label: 'Marathi',  sort_order: 5 },
    { category: 'lead_source', key: 'facebook_ads',  label: 'Facebook Ads',       sort_order: 1 },
    { category: 'lead_source', key: 'instagram_ads', label: 'Instagram Ads',      sort_order: 2 },
    { category: 'lead_source', key: 'direct_ark',    label: 'Direct ARK Signup',  sort_order: 99 },
    { category: 'lead_status', key: 'unassigned',     label: 'Unassigned',     sort_order: 0, color: '#F59E0B' },
    { category: 'lead_status', key: 'new',            label: 'New',            sort_order: 1, color: '#6366F1' },
    { category: 'lead_status', key: 'contacted',      label: 'Contacted',      sort_order: 2, color: '#3B82F6' },
    { category: 'lead_status', key: 'interested',     label: 'Interested',     sort_order: 3, color: '#8B5CF6' },
    { category: 'lead_status', key: 'not_interested', label: 'Not Interested', sort_order: 4, color: '#EF4444' },
    { category: 'lead_status', key: 'call_back',      label: 'Call Back',      sort_order: 5, color: '#F59E0B' },
    { category: 'lead_status', key: 'account_opened', label: 'Account Opened', sort_order: 6, color: '#14B8A6' },
    { category: 'lead_status', key: 'ftd_done',       label: 'FTD Done',       sort_order: 7, color: '#10B981' },
    { category: 'lead_status', key: 'cold',           label: 'Cold',           sort_order: 8, color: '#6B7280' },
    { category: 'trading_experience', key: 'beginner',     label: 'Beginner',     sort_order: 1 },
    { category: 'trading_experience', key: 'intermediate', label: 'Intermediate', sort_order: 2 },
    { category: 'preferred_market',   key: 'NSE Options',  label: 'NSE Options',  sort_order: 1 },
    { category: 'preferred_market',   key: 'NSE Futures',  label: 'NSE Futures',  sort_order: 2 },
  ]);

  console.log('Seeding users...');
  const userDefs = [
    { first_name: 'Super',   last_name: 'Admin',       email: 'superadmin@thework.ltd', role: 'super_admin',   languages: ['english'],                 department: 'management' },
    { first_name: 'Admin',   last_name: 'One',         email: 'admin@thework.ltd',      role: 'admin',         languages: ['english'],                 department: 'management' },
    { first_name: 'Floor',   last_name: 'Manager',     email: 'fm@thework.ltd',         role: 'floor_manager', languages: ['english', 'tamil', 'hindi'], department: 'tele_sales' },
    { first_name: 'Senior',  last_name: 'Tamil',       email: 'senior1@thework.ltd',    role: 'senior',        languages: ['tamil'],                   department: 'tele_sales' },
    { first_name: 'Senior',  last_name: 'English',     email: 'senior2@thework.ltd',    role: 'senior',        languages: ['english', 'hindi'],        department: 'tele_sales' },
    { first_name: 'Back',    last_name: 'Office',      email: 'backoffice@thework.ltd', role: 'back_office',   languages: ['english'],                 department: 'operations' },
    { first_name: 'Audit',   last_name: 'User',        email: 'auditor@thework.ltd',    role: 'auditor',       languages: ['english'],                 department: 'operations' },
    { first_name: 'Priya',   last_name: 'Krishnan',    email: 'priya@thework.ltd',      role: 'tele_sales',    languages: ['tamil'],                   department: 'tele_sales' },
    { first_name: 'Karthik', last_name: 'Subramanian', email: 'karthik@thework.ltd',    role: 'tele_sales',    languages: ['tamil', 'english'],        department: 'tele_sales' },
    { first_name: 'Raj',     last_name: 'Sharma',      email: 'raj@thework.ltd',        role: 'tele_sales',    languages: ['hindi'],                   department: 'tele_sales' },
    { first_name: 'Amit',    last_name: 'Patel',       email: 'amit@thework.ltd',       role: 'tele_sales',    languages: ['english', 'hindi'],        department: 'tele_sales' },
    { first_name: 'Lakshmi', last_name: 'Reddy',       email: 'lakshmi@thework.ltd',    role: 'tele_sales',    languages: ['telugu'],                  department: 'tele_sales' },
  ];

  const users = {};
  for (const def of userDefs) {
    const u = await User.create({
      ...def,
      password: PASSWORD,
      is_active: true,
    });
    users[def.email] = u;
  }

  console.log('Seeding groups + round-robin state...');
  const groups = {};
  for (const lang of ['english', 'tamil', 'hindi', 'telugu']) {
    const label = lang[0].toUpperCase() + lang.slice(1);
    const g = await Group.create({
      name: `${label} Team`,
      language: lang,
      type: 'telesales',
      is_active: true,
      created_by: users['superadmin@thework.ltd'].id,
    });
    groups[lang] = g;
    await RoundRobinState.create({
      group_id: g.id,
      campaign_id: null,
      current_index: 0,
      total_assigned: 0,
    });
  }

  console.log('Adding members...');
  await GroupMember.bulkCreate([
    { user_id: users['priya@thework.ltd'].id,   group_id: groups.tamil.id,   is_active: true },
    { user_id: users['karthik@thework.ltd'].id, group_id: groups.tamil.id,   is_active: true },
    { user_id: users['karthik@thework.ltd'].id, group_id: groups.english.id, is_active: true },
    { user_id: users['raj@thework.ltd'].id,     group_id: groups.hindi.id,   is_active: true },
    { user_id: users['amit@thework.ltd'].id,    group_id: groups.english.id, is_active: true },
    { user_id: users['lakshmi@thework.ltd'].id, group_id: groups.telugu.id,  is_active: true },
    { user_id: users['senior1@thework.ltd'].id, group_id: groups.tamil.id,   is_active: true },
    { user_id: users['senior2@thework.ltd'].id, group_id: groups.english.id, is_active: true },
  ]);

  console.log('Seeding campaigns...');
  const c1 = await Campaign.create({
    name: 'TK | Tamil-L.F-Post | 20 MAY',
    language: 'tamil',
    platform: 'facebook',
    is_active: true,
  });
  const c2 = await Campaign.create({
    name: 'TK | English-L.F-Post | 20 MAY',
    language: 'english',
    platform: 'facebook',
    is_active: true,
  });
  await CampaignGroupAssignment.bulkCreate([
    { campaign_id: c1.id, group_id: groups.tamil.id,   is_active: true },
    { campaign_id: c2.id, group_id: groups.english.id, is_active: true },
  ]);

  console.log('Seeding 8 campaign leads via round robin...');
  const statuses = ['new', 'contacted', 'interested', 'call_back', 'account_opened', 'ftd_done', 'cold', 'not_interested'];
  const langs    = ['tamil', 'tamil', 'english', 'hindi', 'telugu', 'tamil', 'english', 'hindi'];

  for (let i = 0; i < 8; i++) {
    const lang = langs[i];
    const status = statuses[i];
    const groupKey = lang in groups ? lang : 'english';
    const campaign = lang === 'tamil' ? c1 : c2;

    const { assignee, candidates } = await assignToTeleseller(lang, groups[groupKey].id);

    await Lead.create({
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      phone: `91${faker.string.numeric(10)}`,
      whatsapp_number: `91${faker.string.numeric(10)}`,
      email: faker.internet.email().toLowerCase(),
      language: lang,
      preferred_language: lang,
      lead_status: assignee ? status : 'unassigned',
      lead_source: 'facebook_ads',
      department: 'tele_sales',
      trading_experience: 'beginner',
      preferred_market: 'NSE Options',
      assigned_to_id: assignee?.id || null,
      group_id: groups[groupKey].id,
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      account_opened_at: ['account_opened', 'ftd_done'].includes(status) ? new Date() : null,
      ftd_at: status === 'ftd_done' ? new Date() : null,
      deposited_amount: status === 'ftd_done' ? faker.number.int({ min: 5000, max: 100000 }) : null,
      ark_account_number: ['account_opened', 'ftd_done'].includes(status)
        ? `120${i.toString().padStart(3, '0')}`
        : null,
      facebook_lead_id: `lean_${Date.now()}_${i}`,
      total_attempted_call_count: status === 'new' ? 0 : faker.number.int({ min: 1, max: 5 }),
    });

    console.log(
      `  Lead ${i + 1}: ${lang} → ${assignee
        ? `${assignee.first_name} ${assignee.last_name}`
        : 'UNASSIGNED'} (${candidates} candidates)`,
    );
  }

  console.log('Seeding 2 direct ARK leads via senior round robin...');
  const arkLangs = ['tamil', 'english'];
  for (let i = 0; i < 2; i++) {
    const lang = arkLangs[i];
    const { assignee: senior, candidates } = await assignToSenior(lang);

    await Lead.create({
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      phone: `91${faker.string.numeric(10)}`,
      email: faker.internet.email().toLowerCase(),
      language: lang,
      preferred_language: lang,
      lead_status: senior ? (i === 1 ? 'ftd_done' : 'account_opened') : 'unassigned',
      lead_source: 'direct_ark',
      department: 'tele_sales',
      assigned_to_id: senior?.id || null,
      group_id: null,
      campaign_id: null,
      campaign_name: 'Direct ARK Signup',
      ark_account_number: `120${1000 + i}`,
      ark_username: `91${faker.string.numeric(10)}`,
      ark_uid: faker.string.alphanumeric(12).toUpperCase(),
      account_opened_at: new Date(),
      ftd_at: i === 1 ? new Date() : null,
      deposited_amount: i === 1 ? faker.number.int({ min: 10000, max: 200000 }) : null,
      total_attempted_call_count: 0,
    });

    console.log(
      `  Direct ARK ${i + 1}: ${lang} → senior ${senior
        ? `${senior.first_name} ${senior.last_name}`
        : 'UNASSIGNED'} (${candidates} candidates)`,
    );
  }

  console.log('Seeding role permissions...');
  await seedRolePermissions({ force: true });

  console.log('');
  console.log('✅ LEAN SEED COMPLETE');
  console.log('=================================');
  console.log('Password for all accounts: Test@1234');
  console.log('');
  console.log('  superadmin@thework.ltd  super_admin');
  console.log('  admin@thework.ltd       admin');
  console.log('  fm@thework.ltd          floor_manager');
  console.log('  senior1@thework.ltd     senior (Tamil)');
  console.log('  senior2@thework.ltd     senior (English)');
  console.log('  backoffice@thework.ltd  back_office');
  console.log('  auditor@thework.ltd     auditor');
  console.log('  priya@thework.ltd       tele_sales (Tamil)');
  console.log('  karthik@thework.ltd     tele_sales (Tamil + English)');
  console.log('  raj@thework.ltd         tele_sales (Hindi)');
  console.log('  amit@thework.ltd        tele_sales (English)');
  console.log('  lakshmi@thework.ltd     tele_sales (Telugu)');
  console.log('=================================');
  console.log('12 users · 4 groups · 2 campaigns · 8 campaign leads + 2 direct ARK leads = 10 leads');
  process.exit(0);
}

run().catch((e) => {
  console.error('Lean seeder failed:', e);
  process.exit(1);
});
