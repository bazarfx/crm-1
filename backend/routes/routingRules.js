const router = require('express').Router();
const ctl = require('../controllers/routingRuleController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');

router.use(verifyToken);

// Admin + super_admin manage routing; floor_manager can view.
const VIEWERS = ['super_admin', 'admin', 'floor_manager'];
const WRITERS = ['super_admin', 'admin'];

router.get('/', allowRoles(...VIEWERS), ctl.list);
router.get('/target-options', allowRoles(...VIEWERS), ctl.targetOptions);
router.post('/', allowRoles(...WRITERS), ctl.create);
router.patch('/:id', allowRoles(...WRITERS), ctl.update);
router.post('/:id/move', allowRoles(...WRITERS), ctl.move);
router.delete('/:id', allowRoles(...WRITERS), ctl.remove);

module.exports = router;
