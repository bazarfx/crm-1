const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/auditLogController');

router.use(verifyToken);

router.get('/all', allowRoles('super_admin', 'admin'), ctrl.allActivity);
router.get('/admin-actions', allowRoles('super_admin'), ctrl.adminActions);
router.get('/sales-activity', allowRoles('super_admin', 'admin'), ctrl.salesActivity);
router.get('/lead/:leadId', allowRoles('super_admin', 'admin'), ctrl.leadHistory);

module.exports = router;
