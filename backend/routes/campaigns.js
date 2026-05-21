const router = require('express').Router();
const ctl = require('../controllers/campaignController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

router.use(verifyToken);

router.get('/', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.list);
router.get('/:id', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.getOne);
router.post('/', allowRoles(...STAFF_ADMIN), ctl.create);
router.patch('/:id', allowRoles(...STAFF_ADMIN), ctl.update);
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.remove);

router.post('/:id/groups', allowRoles(...STAFF_ADMIN), ctl.assignGroup);
router.delete('/:id/groups/:groupId', allowRoles(...STAFF_ADMIN), ctl.unassignGroup);

module.exports = router;
