/* eslint-disable no-console */
require('dotenv').config();
const { faker } = require('@faker-js/faker');
const dayjs = require('dayjs');

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
  ArkWebhookLog,
  IngestLog,
  RoundRobinState,
} = require('../models');

faker.seed(20260521); // deterministic across runs

const LANGUAGES = ['English', 'Tamil', 'Telugu', 'Hindi', 'Kannada', 'Malayalam', 'Marathi'];
const LANG_CODES = { English: 'EN', Tamil: 'TM', Telugu: 'TL', Hindi: 'HI', Kannada: 'KN', Malayalam: 'ML', Marathi: 'MR' };

const STATUS_WEIGHTS = [
  ['new', 25],
  ['contacted', 20],
  ['interested', 12],
  ['call_back', 10],
  ['not_interested', 8],
  ['account_opened', 10],
  ['ftd_done', 6],
  ['cold', 5],
  ['dnd', 2],
  ['inactive', 1],
  ['reactive', 1],
];

const STATUS_CONFIG = [
  { key: 'new', label: 'New', color: '#6366F1' },
  { key: 'contacted', label: 'Contacted', color: '#3B82F6' },
  { key: 'interested', label: 'Interested', color: '#8B5CF6' },
  { key: 'not_interested', label: 'Not Interested', color: '#EF4444' },
  { key: 'call_back', label: 'Call Back', color: '#F59E0B' },
  { key: 'account_opened', label: 'Account Opened', color: '#14B8A6' },
  { key: 'ftd_done', label: 'FTD Done', color: '#10B981' },
  { key: 'cold', label: 'Cold', color: '#6B7280' },
  { key: 'dnd', label: 'DND', color: '#DC2626' },
  { key: 'inactive', label: 'Inactive', color: '#9CA3AF' },
  { key: 'reactive', label: 'Reactive', color: '#F97316' },
];

const PASSWORD = 'Test@1234';
const INDIAN_CITIES = [
  ['Mumbai', 'Maharashtra'], ['Delhi', 'Delhi'], ['Bengaluru', 'Karnataka'],
  ['Hyderabad', 'Telangana'], ['Chennai', 'Tamil Nadu'], ['Kolkata', 'West Bengal'],
  ['Pune', 'Maharashtra'], ['Ahmedabad', 'Gujarat'], ['Jaipur', 'Rajasthan'],
  ['Lucknow', 'Uttar Pradesh'], ['Kochi', 'Kerala'], ['Coimbatore', 'Tamil Nadu'],
  ['Indore', 'Madhya Pradesh'], ['Chandigarh', 'Chandigarh'], ['Bhopal', 'Madhya Pradesh'],
];

function indianPhone() {
  const prefix = faker.helpers.arrayElement(['6', '7', '8', '9']);
  return prefix + faker.string.numeric(9);
}

function weighted(weights) {
  const total = weights.reduce((s, [, w]) => s + w, 0);
  let r = faker.number.int({ min: 1, max: total });
  for (const [v, w] of weights) {
    r -= w;
    if (r <= 0) return v;
  }
  return weights[0][0];
}

async function seedConfig() {
  console.log('▶ Seeding Config (status, language, source, market) ...');
  const rows = [];
  STATUS_CONFIG.forEach((s, i) =>
    rows.push({ category: 'lead_status', key: s.key, label: s.label, color: s.color, sort_order: i }),
  );
  LANGUAGES.forEach((l, i) =>
    rows.push({ category: 'language', key: l.toLowerCase(), label: l, sort_order: i }),
  );
  ['facebook_ads', 'instagram_ads', 'google_ads', 'website', 'referral', 'manual'].forEach((s, i) =>
    rows.push({ category: 'lead_source', key: s, label: s.replace(/_/g, ' '), sort_order: i }),
  );
  ['equity', 'commodity', 'forex', 'crypto', 'derivatives'].forEach((m, i) =>
    rows.push({ category: 'preferred_market', key: m, label: m, sort_order: i }),
  );
  ['none', 'beginner', 'intermediate', 'experienced'].forEach((t, i) =>
    rows.push({ category: 'trading_experience', key: t, label: t, sort_order: i }),
  );

  await Config.bulkCreate(rows, { ignoreDuplicates: true });
  console.log(`  ✓ ${rows.length} config rows`);
}

async function seedUsers() {
  console.log('▶ Seeding Users ...');
  const users = [];

  users.push({
    first_name: 'Super', last_name: 'Admin', email: 'superadmin@thework.ltd',
    password: PASSWORD, role: 'super_admin', is_active: true,
  });
  users.push({
    first_name: 'Admin', last_name: 'One', email: 'admin1@thework.ltd',
    password: PASSWORD, role: 'admin', is_active: true,
  });
  for (const lang of LANGUAGES) {
    users.push({
      first_name: 'FloorMgr', last_name: lang, email: `fm_${lang.toLowerCase()}@thework.ltd`,
      password: PASSWORD, role: 'floor_manager', native_language: lang, is_active: true,
    });
  }
  for (const lang of LANGUAGES) {
    for (let i = 1; i <= 2; i++) {
      users.push({
        first_name: 'Senior', last_name: `${lang}${i}`,
        email: `senior_${lang.toLowerCase()}${i}@thework.ltd`,
        password: PASSWORD, role: 'senior', native_language: lang, is_active: true,
      });
    }
  }
  // Telesales agents: ~12 per language => 84 agents
  for (const lang of LANGUAGES) {
    for (let i = 1; i <= 12; i++) {
      const fn = faker.person.firstName();
      const ln = faker.person.lastName();
      users.push({
        first_name: fn, last_name: ln,
        email: `agent_${fn.toLowerCase()}_${i}_${faker.string.alphanumeric(4).toLowerCase()}@thework.ltd`,
        password: PASSWORD, role: 'tele_sales', native_language: lang, alias: `${fn} ${ln[0]}.`,
        is_active: true,
      });
    }
  }
  for (let i = 1; i <= 3; i++) {
    users.push({
      first_name: 'Auditor', last_name: String(i),
      email: `auditor${i}@thework.ltd`, password: PASSWORD, role: 'auditor', is_active: true,
    });
  }
  for (let i = 1; i <= 2; i++) {
    users.push({
      first_name: 'BackOffice', last_name: String(i),
      email: `backoffice${i}@thework.ltd`, password: PASSWORD, role: 'back_office', is_active: true,
    });
  }
  users.push({
    first_name: 'Archive', last_name: 'User', email: 'archive@thework.ltd',
    password: PASSWORD, role: 'archive', is_active: true,
  });

  // Create one at a time so the bcrypt hook runs on each row.
  const created = [];
  for (const u of users) {
    created.push(await User.create(u));
  }
  console.log(`  ✓ ${created.length} users`);
  return created;
}

async function seedGroups(users) {
  console.log('▶ Seeding Groups ...');
  const superAdmin = users.find((u) => u.role === 'super_admin');
  const groups = [];
  for (const lang of LANGUAGES) {
    groups.push({ name: `${lang} Telesales`, type: 'telesales', language: lang, created_by: superAdmin.id });
  }
  for (const lang of LANGUAGES) {
    groups.push({ name: `${lang} Seniors`, type: 'senior', language: lang, created_by: superAdmin.id });
  }
  const created = await Group.bulkCreate(groups, { returning: true });
  console.log(`  ✓ ${created.length} groups`);
  return created;
}

async function seedGroupMembers(users, groups) {
  console.log('▶ Seeding GroupMembers ...');
  const memberships = [];
  for (const group of groups) {
    const role = group.type === 'telesales' ? 'tele_sales' : 'senior';
    const matches = users.filter((u) => u.role === role && u.native_language === group.language);
    matches.forEach((u, idx) => {
      memberships.push({ group_id: group.id, user_id: u.id, rr_index: idx, is_active: true });
    });
  }
  await GroupMember.bulkCreate(memberships, { ignoreDuplicates: true });
  console.log(`  ✓ ${memberships.length} memberships`);
}

async function seedCampaigns(users, groups) {
  console.log('▶ Seeding Campaigns ...');
  const admin = users.find((u) => u.role === 'admin');
  const campaigns = [];
  const today = dayjs();
  // 12 campaigns: roughly one per non-Marathi language pair
  const presets = [
    ['TK', 'English-L.F-Post', 'English'],
    ['TK', 'Tamil-L.F-Post', 'Tamil'],
    ['TK', 'Telugu-L.F-Post', 'Telugu'],
    ['TK', 'Hindi-L.F-Post', 'Hindi'],
    ['TK', 'Kannada-L.F-Post', 'Kannada'],
    ['TK', 'Malayalam-L.F-Post', 'Malayalam'],
    ['TK', 'Marathi-L.F-Post', 'Marathi'],
    ['TK', 'English-Video', 'English'],
    ['TK', 'Tamil-Video', 'Tamil'],
    ['TK', 'Hindi-Reels', 'Hindi'],
    ['TK', 'English-Carousel', 'English'],
    ['TK', 'Hindi-Story', 'Hindi'],
  ];
  for (let i = 0; i < presets.length; i++) {
    const [prefix, mid, lang] = presets[i];
    const start = today.subtract(faker.number.int({ min: 5, max: 60 }), 'day');
    campaigns.push({
      name: `${prefix} | ${mid} | ${start.format('DD MMM').toUpperCase()}`,
      ad_set_name: `${mid} AdSet`,
      ad_name: `${mid} Ad ${faker.string.alpha(2).toUpperCase()}`,
      platform: 'facebook',
      language: lang,
      is_active: true,
      start_date: start.toDate(),
      budget: faker.number.int({ min: 50000, max: 500000 }),
      created_by: admin.id,
    });
  }
  const created = await Campaign.bulkCreate(campaigns, { returning: true });

  // CampaignGroupAssignment — campaign goes to telesales group of its language
  const assignments = [];
  for (const c of created) {
    const group = groups.find((g) => g.language === c.language && g.type === 'telesales');
    if (group) assignments.push({ campaign_id: c.id, group_id: group.id, assigned_by: admin.id });
  }
  await CampaignGroupAssignment.bulkCreate(assignments, { ignoreDuplicates: true });

  // RoundRobinState seeds
  const rrStates = [];
  for (const c of created) {
    const group = groups.find((g) => g.language === c.language && g.type === 'telesales');
    if (group) rrStates.push({ group_id: group.id, campaign_id: c.id, current_index: 0, total_assigned: 0 });
  }
  await RoundRobinState.bulkCreate(rrStates, { ignoreDuplicates: true });

  console.log(`  ✓ ${created.length} campaigns, ${assignments.length} assignments`);
  return created;
}

async function seedLeads(users, groups, campaigns) {
  console.log('▶ Seeding 500 Leads ...');
  const telesales = users.filter((u) => u.role === 'tele_sales');
  const leads = [];
  const N = 500;

  for (let i = 0; i < N; i++) {
    const lang = faker.helpers.arrayElement(LANGUAGES);
    const langTelesales = telesales.filter((t) => t.native_language === lang);
    const owner = faker.helpers.arrayElement(langTelesales);
    const campaign = faker.helpers.arrayElement(campaigns.filter((c) => c.language === lang)) ||
      faker.helpers.arrayElement(campaigns);
    const group = groups.find((g) => g.language === lang && g.type === 'telesales');

    const status = weighted(STATUS_WEIGHTS);
    const [city, state] = faker.helpers.arrayElement(INDIAN_CITIES);
    const createdAt = faker.date.recent({ days: 60 });

    const hasArk = ['account_opened', 'ftd_done'].includes(status) ||
      faker.helpers.maybe(() => true, { probability: 0.15 });
    const phone = indianPhone();

    leads.push({
      first_name: faker.person.firstName(),
      last_name: faker.person.lastName(),
      email: faker.internet.email().toLowerCase(),
      phone,
      mobile: phone,
      whatsapp_number: phone,
      date_of_birth: faker.date.birthdate({ min: 22, max: 60, mode: 'age' }),
      city, state, country: 'India',
      lead_status: status,
      lead_source: 'facebook_ads',
      language: lang,
      preferred_language: lang,
      industry: faker.helpers.arrayElement(['IT', 'Finance', 'Manufacturing', 'Retail', 'Healthcare']),
      trading_experience: faker.helpers.arrayElement(['none', 'beginner', 'intermediate', 'experienced']),
      preferred_market: faker.helpers.arrayElement(['equity', 'commodity', 'forex', 'crypto']),
      total_messages: faker.number.int({ min: 0, max: 30 }),
      messages_sent: faker.number.int({ min: 0, max: 15 }),
      messages_received: faker.number.int({ min: 0, max: 15 }),
      total_attempted_call_count: faker.number.int({ min: 0, max: 12 }),
      total_call_duration: faker.number.int({ min: 0, max: 4500 }),
      ark_username: hasArk ? phone : null,
      ark_account_number: hasArk ? `ARK${faker.string.numeric(7)}` : null,
      ark_uid: hasArk ? faker.string.alphanumeric(10).toUpperCase() : null,
      account_opened_at: ['account_opened', 'ftd_done'].includes(status) ? faker.date.recent({ days: 30, refDate: createdAt }) : null,
      account_opened_date: ['account_opened', 'ftd_done'].includes(status) ? faker.date.recent({ days: 30, refDate: createdAt }) : null,
      ftd_at: status === 'ftd_done' ? faker.date.recent({ days: 20, refDate: createdAt }) : null,
      deposited_amount: status === 'ftd_done' ? faker.number.int({ min: 5000, max: 500000 }) : null,
      campaign_name: campaign.name,
      ad_set_name: campaign.ad_set_name,
      ad_name: campaign.ad_name,
      ad_platform: 'facebook',
      facebook_lead_id: faker.string.numeric(15) + '_' + i,
      is_dnd: status === 'dnd',
      dnd_at: status === 'dnd' ? createdAt : null,
      is_inactive: status === 'inactive',
      cold_date: status === 'cold' ? createdAt : null,
      is_reactive: status === 'reactive',
      source_raw: { campaign: campaign.name, ad: campaign.ad_name, lang_code: LANG_CODES[lang] },
      lead_owner_id: owner?.id || null,
      group_id: group?.id || null,
      campaign_id: campaign.id,
      created_at: createdAt,
      updated_at: createdAt,
    });
  }

  const created = await Lead.bulkCreate(leads, { returning: true });
  console.log(`  ✓ ${created.length} leads`);
  return created;
}

async function seedActivities(leads, users) {
  console.log('▶ Seeding LeadActivities (~1500) ...');
  const activities = [];
  for (const lead of leads) {
    const owner = users.find((u) => u.id === lead.lead_owner_id);
    if (!owner) continue;
    const count = faker.number.int({ min: 1, max: 5 });
    for (let i = 0; i < count; i++) {
      const type = faker.helpers.weightedArrayElement([
        { weight: 50, value: 'call' },
        { weight: 25, value: 'note' },
        { weight: 10, value: 'status_change' },
        { weight: 10, value: 'whatsapp' },
        { weight: 5, value: 'email' },
      ]);
      activities.push({
        lead_id: lead.id,
        user_id: owner.id,
        activity_type: type,
        title: type === 'call'
          ? `Call: ${faker.helpers.arrayElement(['Answered', 'No answer', 'Busy', 'Voicemail'])}`
          : `${type[0].toUpperCase()}${type.slice(1)}`,
        description: faker.lorem.sentence(),
        call_duration: type === 'call' ? faker.number.int({ min: 0, max: 600 }) : null,
        call_outcome: type === 'call'
          ? faker.helpers.arrayElement(['answered', 'no_answer', 'busy', 'voicemail', 'interested', 'not_interested'])
          : null,
        completed_at: faker.date.recent({ days: 30 }),
      });
    }
  }
  await LeadActivity.bulkCreate(activities);
  console.log(`  ✓ ${activities.length} activities`);
}

async function seedArkLogs(leads) {
  console.log('▶ Seeding ARK webhook logs ...');
  const matchedLeads = leads.filter((l) => l.ark_username).slice(0, 35);
  const logs = [];
  for (const lead of matchedLeads) {
    const evt = faker.helpers.arrayElement(['account_opened', 'ftd', 'activity']);
    logs.push({
      raw_payload: { ARK_Username: lead.phone, ARK_AccountNumber: lead.ark_account_number, event_type: evt },
      ark_username: lead.phone,
      ark_account_number: lead.ark_account_number,
      event_type: evt,
      matched_lead_id: lead.id,
      match_status: 'matched',
      processed_at: faker.date.recent({ days: 15 }),
      ip_address: faker.internet.ipv4(),
    });
  }
  for (let i = 0; i < 10; i++) {
    logs.push({
      raw_payload: { ARK_Username: indianPhone(), event_type: 'activity' },
      ark_username: indianPhone(),
      event_type: 'activity',
      match_status: 'unmatched',
      processed_at: faker.date.recent({ days: 10 }),
      ip_address: faker.internet.ipv4(),
    });
  }
  for (let i = 0; i < 5; i++) {
    logs.push({
      raw_payload: { malformed: true },
      match_status: 'error',
      error_message: faker.helpers.arrayElement(['Missing ARK_Username', 'Invalid payload shape', 'DB write failed']),
      ip_address: faker.internet.ipv4(),
    });
  }
  await ArkWebhookLog.bulkCreate(logs);
  console.log(`  ✓ ${logs.length} ARK webhook logs`);
}

async function seedIngestLogs(leads) {
  console.log('▶ Seeding Ingest logs (sample) ...');
  const rows = leads.slice(0, 50).map((l) => ({
    raw_payload: { phone: l.phone, campaign_name: l.campaign_name, ad_name: l.ad_name },
    source: 'integrately',
    facebook_lead_id: l.facebook_lead_id,
    phone: l.phone,
    matched_lead_id: l.id,
    status: 'created',
    assigned_to_user_id: l.lead_owner_id,
    assigned_to_group_id: l.group_id,
    ip_address: faker.internet.ipv4(),
  }));
  await IngestLog.bulkCreate(rows);
  console.log(`  ✓ ${rows.length} ingest logs`);
}

async function main() {
  const force = process.argv.includes('--force');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  CRM 1 Master Seeder  (force=${force})`);
  console.log('═══════════════════════════════════════════════════════════');

  await syncDatabase({ force, alter: !force });
  console.log('✓ DB synced');

  await seedConfig();
  const users = await seedUsers();
  const groups = await seedGroups(users);
  await seedGroupMembers(users, groups);
  const campaigns = await seedCampaigns(users, groups);
  const leads = await seedLeads(users, groups, campaigns);
  await seedActivities(leads, users);
  await seedArkLogs(leads);
  await seedIngestLogs(leads);

  // Last step — populate role_permissions table for the dynamic
  // permissions system (force re-seed on --force runs).
  const { seedRolePermissions } = require('./seedRolePermissions');
  await seedRolePermissions({ force });

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Seeding complete.');
  console.log('  Login with any email below + password: Test@1234');
  console.log('    superadmin@thework.ltd      → super_admin');
  console.log('    admin1@thework.ltd          → admin');
  console.log('    fm_english@thework.ltd      → floor_manager');
  console.log('    senior_english1@thework.ltd → senior');
  console.log('    auditor1@thework.ltd        → auditor');
  console.log('═══════════════════════════════════════════════════════════');
  await sequelize.close();
}

main().catch(async (e) => {
  console.error('Seeder failed:', e);
  try { await sequelize.close(); } catch {}
  process.exit(1);
});
