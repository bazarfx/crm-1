const router = require('express').Router();
const ctl = require('../controllers/groupController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

router.use(verifyToken);

router.get('/', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.list);
router.get('/:id/with-fields', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.getWithFieldDefs);
router.get('/:id', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.getOne);
router.post('/', allowRoles(...STAFF_ADMIN), ctl.create);
router.patch('/:id', allowRoles(...STAFF_ADMIN), ctl.update);
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.remove);

router.get('/:id/members', allowRoles(...STAFF_ADMIN, 'senior', 'auditor', 'back_office'), ctl.listMembers);
router.get('/:id/candidates', allowRoles(...STAFF_ADMIN), ctl.candidateMembers);
router.post('/:id/members', allowRoles(...STAFF_ADMIN), ctl.addMember);
// Controller reads both `req.params.user_id` and `req.params.userId` so any
// existing caller still works regardless of which casing they used.
router.delete('/:id/members/:user_id', allowRoles(...STAFF_ADMIN), ctl.removeMember);

// Atomic move between groups — admin / super_admin only (enforced in controller).
router.post('/move-member', allowRoles('super_admin', 'admin'), ctl.moveMember);

module.exports = router;
