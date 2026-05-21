const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/settingController');

const admins = allowRoles('super_admin', 'admin');

router.use(verifyToken);

router.get('/', admins, ctrl.getAll);
router.get('/:key', admins, ctrl.getOne);
router.patch('/:key', admins, ctrl.update);
router.post('/reset', allowRoles('super_admin'), ctrl.reset);

module.exports = router;
