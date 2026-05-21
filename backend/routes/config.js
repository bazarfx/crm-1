const router = require('express').Router();
const ctl = require('../controllers/configController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles } = require('../middleware/roleGuard');

// GET is PUBLIC (frontend loads dropdown values before login)
router.get('/', ctl.list);

// Writes require admin
router.post('/', verifyToken, allowRoles('super_admin', 'admin'), ctl.create);
router.patch('/:id', verifyToken, allowRoles('super_admin', 'admin'), ctl.update);
router.delete('/:id', verifyToken, allowRoles('super_admin', 'admin'), ctl.remove);

module.exports = router;
