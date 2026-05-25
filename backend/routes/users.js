const router = require('express').Router();
const ctl = require('../controllers/userController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

const adminPlus = allowRoles('super_admin', 'admin');
const SA = allowRoles('super_admin');

router.use(verifyToken);

// /me must precede /:id
router.post('/me/password', ctl.changePassword);

// /deleted must precede /:id
router.get('/deleted', adminPlus, ctl.listDeleted);

// Language-aware listings must precede /:id
router.get('/by-language', allowRoles('super_admin', 'admin', 'floor_manager'), ctl.byLanguage);
router.get('/language-stats', allowRoles('super_admin', 'admin', 'floor_manager'), ctl.languageStats);
router.get('/workload', allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'), ctl.workload);

// Lifecycle actions must precede /:id PATCH/GET.
router.patch('/:id/deactivate', adminPlus, ctl.deactivate);
router.patch('/:id/activate', adminPlus, ctl.activate);
router.patch('/:id/reset-password', adminPlus, ctl.resetPassword);
router.patch('/:id/language', adminPlus, ctl.changeLanguage);
router.get('/:id/with-fields', allowRoles(...STAFF_ADMIN, 'auditor', 'back_office'), ctl.getWithFieldDefs);
router.get('/:id/stats', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.userStats);
router.get('/:id/permissions', allowRoles(...STAFF_ADMIN), ctl.getPermissions);
router.patch('/:id/permissions', adminPlus, ctl.setPermissions);
router.post('/:id/restore', adminPlus, ctl.restoreUser);
router.post('/:id/impersonate', SA, ctl.impersonate);

// Generic CRUD
router.get('/', allowRoles(...STAFF_ADMIN, 'auditor', 'back_office'), ctl.list);
router.get('/:id', allowRoles(...STAFF_ADMIN, 'auditor', 'back_office'), ctl.getOne);
router.post('/', allowRoles(...STAFF_ADMIN), ctl.create);
router.patch('/:id', allowRoles(...STAFF_ADMIN), ctl.update);
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.remove);

module.exports = router;
