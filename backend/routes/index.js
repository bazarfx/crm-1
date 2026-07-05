const router = require('express').Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/leads/ingest', require('./ingest')); // PUBLIC — must precede /leads
router.use('/trial-leads', require('./trialLeads'));
router.use('/leads', require('./leads'));
router.use('/deals', require('./deals'));
router.use('/webhooks', require('./webhooks'));
router.use('/groups', require('./groups'));
router.use('/campaigns', require('./campaigns'));
router.use('/reports', require('./reports'));
router.use('/config', require('./config'));
router.use('/settings', require('./settings'));
router.use('/audit-logs', require('./auditLogs'));
router.use('/permissions', require('./permissions'));
router.use('/roles', require('./roles'));
router.use('/role-permissions', require('./rolePermissions'));
router.use('/routing-rules', require('./routingRules'));
router.use('/assignment-rules', require('./assignmentRules'));
router.use('/field-definitions', require('./fieldDefinitions'));
router.use('/modules', require('./modules'));
router.use('/dashboard', require('./dashboard'));

router.get('/ping', (req, res) => res.json({ success: true, message: 'pong', data: { time: new Date().toISOString() } }));

module.exports = router;
