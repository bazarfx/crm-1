const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/roleController');

router.use(verifyToken);

// Read access for management roles; mutations for admins; delete super-admin only.
const MANAGE = allowRoles('super_admin', 'admin', 'floor_manager');
const EDIT = allowRoles('super_admin', 'admin');

router.get('/',        MANAGE, ctrl.list);
router.get('/tree',    MANAGE, ctrl.tree);
router.get('/:id',     MANAGE, ctrl.getOne);
router.post('/',       EDIT,   ctrl.create);
router.patch('/:id',   EDIT,   ctrl.update);
router.delete('/:id',  allowRoles('super_admin'), ctrl.remove);

module.exports = router;
