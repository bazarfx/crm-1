const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/rolePermissionController');

// Hardcoded super_admin gate — never DB-checked, can never be revoked
const SA = allowRoles('super_admin');

router.get('/',                          verifyToken, SA, ctrl.getMatrix);
router.patch('/:role/:permission_key',   verifyToken, SA, ctrl.updateOne);
router.post('/bulk',                     verifyToken, SA, ctrl.bulkUpdate);
router.post('/copy',                     verifyToken, SA, ctrl.copyRole);
router.post('/reset',                    verifyToken, SA, ctrl.resetDefaults);
router.post('/disable-category',         verifyToken, SA, ctrl.disableCategory);

module.exports = router;
