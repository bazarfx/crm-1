const router = require('express').Router();
const ctl = require('../controllers/assignmentRuleController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');

router.use(verifyToken);

// Admin + super_admin + floor_manager manage assignment rules (same tier as
// routing rules / roles administration).
const MANAGERS = ['super_admin', 'admin', 'floor_manager'];
router.use(allowRoles(...MANAGERS));

router.get('/', ctl.list);
router.post('/preview', ctl.preview);
router.post('/reorder', ctl.reorder);
router.post('/', ctl.create);
router.get('/:id', ctl.getOne);
router.patch('/:id', ctl.update);
router.delete('/:id', ctl.remove);

module.exports = router;
