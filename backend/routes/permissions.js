const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/permissionController');

router.get('/me', verifyToken, ctrl.myPermissions);

module.exports = router;
