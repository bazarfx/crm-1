const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/dashboardController');

router.get('/summary', verifyToken, ctrl.summary);
router.get('/top-performers', verifyToken, ctrl.topPerformers);
router.get('/top-campaigns', verifyToken, ctrl.topCampaigns);

module.exports = router;
