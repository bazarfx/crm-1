const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctl = require('../controllers/ingestController');

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300, // generous — Integrately bursts allowed
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @swagger
 * /leads/ingest:
 *   post:
 *     tags: [Ingest]
 *     summary: Public webhook for Integrately (PUBLIC — uses X-Ingest-Token)
 */
router.post('/', limiter, ctl.ingest);

module.exports = router;
