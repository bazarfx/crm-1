const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctl = require('../controllers/webhookController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /webhooks/ark:
 *   post:
 *     tags: [Webhooks]
 *     summary: Public ARK terminal webhook (X-ARK-Secret header or IP allowlist)
 */
router.post('/ark', limiter, ctl.ark);

// Authenticated read endpoints for the ark-logs page
router.get(
  '/ark/logs',
  verifyToken,
  allowRoles(...STAFF_ADMIN, 'back_office', 'auditor'),
  ctl.listArkLogs,
);

module.exports = router;
