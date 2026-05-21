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

// Lifecycle actions must precede /:id PATCH/GET.
router.patch('/:id/deactivate', adminPlus, ctl.deactivate);
router.patch('/:id/activate', adminPlus, ctl.activate);
router.patch('/:id/reset-password', adminPlus, ctl.resetPassword);
router.post('/:id/restore', adminPlus, ctl.restoreUser);
router.post('/:id/impersonate', SA, ctl.impersonate);

// Generic CRUD
router.get('/', allowRoles(...STAFF_ADMIN, 'auditor', 'back_office'), ctl.list);
router.get('/:id', allowRoles(...STAFF_ADMIN, 'auditor', 'back_office'), ctl.getOne);
router.post('/', allowRoles(...STAFF_ADMIN), ctl.create);
router.patch('/:id', allowRoles(...STAFF_ADMIN), ctl.update);
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.remove);

module.exports = router;
