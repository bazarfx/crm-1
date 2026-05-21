const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');
const ctrl = require('../controllers/trialLeadController');

const SA = allowRoles('super_admin');

router.use(verifyToken);
router.use(SA);

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/batch', ctrl.createBatch);
router.delete('/all', ctrl.deleteAll);
router.delete('/:id', ctrl.deleteOne);

module.exports = router;
