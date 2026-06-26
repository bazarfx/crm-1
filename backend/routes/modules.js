const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const moduleCtrl = require('../controllers/moduleController');
const recordCtrl = require('../controllers/moduleRecordController');

router.use(verifyToken);

const MANAGE = allowRoles('super_admin', 'admin', 'floor_manager', 'schema_editor');
const EDIT = allowRoles('super_admin', 'admin', 'schema_editor');

// ── Records sub-resource (custom-module data) ────────────────────────────
// Distinct path shape from the registry routes (two segments), so no shadow.
// Coarse role gate for v1 — per-module permissions are a later pass.
router.get('/:moduleKey/records', MANAGE, recordCtrl.list);
router.get('/:moduleKey/records/:id', MANAGE, recordCtrl.getOne);
router.post('/:moduleKey/records', MANAGE, recordCtrl.create);
router.patch('/:moduleKey/records/:id', MANAGE, recordCtrl.update);
router.delete('/:moduleKey/records/:id', MANAGE, recordCtrl.softDelete);

// ── Registry ─────────────────────────────────────────────────────────────
router.get('/', MANAGE, moduleCtrl.list);
router.get('/:id', MANAGE, moduleCtrl.getOne);
router.post('/', EDIT, moduleCtrl.create);
router.patch('/:id', EDIT, moduleCtrl.update);
router.delete('/:id', allowRoles('super_admin'), moduleCtrl.remove);

module.exports = router;
