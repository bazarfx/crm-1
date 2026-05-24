/* eslint-disable no-console */
require('dotenv').config();
const { FieldDefinition } = require('../models');

const FIELDS = [
  {
    entity_type: 'lead', field_key: 'risk_tolerance', label: 'Risk Tolerance',
    field_type: 'dropdown', section: 'Trading Profile', display_order: 10,
    options: [
      { value: 'conservative', label: 'Conservative' },
      { value: 'moderate',     label: 'Moderate' },
      { value: 'aggressive',   label: 'Aggressive' },
    ],
    helper_text: 'Self-reported risk appetite',
    is_filterable: true,
    is_visible_in_list: true,
  },
  {
    entity_type: 'lead', field_key: 'preferred_call_time', label: 'Preferred Call Time',
    field_type: 'dropdown', section: 'Contact Preferences', display_order: 20,
    options: [
      { value: 'morning',   label: 'Morning (9-12)' },
      { value: 'afternoon', label: 'Afternoon (12-5)' },
      { value: 'evening',   label: 'Evening (5-9)' },
    ],
    is_filterable: true,
  },
  {
    entity_type: 'lead', field_key: 'referral_source', label: 'Referral Source',
    field_type: 'text', section: 'Source', display_order: 30,
    helper_text: 'Who referred this lead?',
  },
  {
    entity_type: 'lead', field_key: 'follow_up_priority', label: 'Follow-up Priority',
    field_type: 'dropdown', section: 'Sales Process', display_order: 40,
    options: [
      { value: 'low',    label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high',   label: 'High' },
      { value: 'urgent', label: 'Urgent' },
    ],
    default_value: 'medium',
    is_filterable: true,
    is_visible_in_list: true,
  },
  {
    entity_type: 'user', field_key: 'emergency_contact', label: 'Emergency Contact',
    field_type: 'phone', section: 'HR', display_order: 10,
    visible_to_roles: ['super_admin', 'admin', 'schema_editor', 'floor_manager'],
  },
  {
    entity_type: 'user', field_key: 'date_of_joining', label: 'Date of Joining',
    field_type: 'date', section: 'HR', display_order: 20,
    is_filterable: true,
    visible_to_roles: ['super_admin', 'admin', 'schema_editor', 'floor_manager'],
  },
  {
    entity_type: 'campaign', field_key: 'budget', label: 'Campaign Budget',
    field_type: 'currency', section: 'Financials', display_order: 10,
    is_filterable: true,
  },
];

async function seedDemoFields() {
  let created = 0;
  let existed = 0;
  for (const f of FIELDS) {
    const [, wasCreated] = await FieldDefinition.findOrCreate({
      where: { entity_type: f.entity_type, field_key: f.field_key },
      defaults: f,
    });
    if (wasCreated) created += 1; else existed += 1;
  }
  console.log(`✓ Demo fields: ${created} created, ${existed} already present (total ${FIELDS.length})`);
}

module.exports = { seedDemoFields, FIELDS };

if (require.main === module) {
  seedDemoFields().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
