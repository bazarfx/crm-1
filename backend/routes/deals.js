const router = require('express').Router();
const ctl = require('../controllers/dealController');
const undoCtl = require('../controllers/dealUndoController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

router.use(verifyToken);

// Read access: same shape as /leads — management + read-only + the assigned-
// to-me roles. Tele_sales / senior get scoped down to their own deals inside
// the controller via buildScope().
const READERS = [...STAFF_ADMIN, 'senior', 'tele_sales', 'back_office', 'auditor', 'archive'];

router.get('/', allowRoles(...READERS), ctl.list);
router.get('/stats', allowRoles(...READERS), ctl.stats);

// ─── Undo-request flow ────────────────────────────────────────────────────
// Static routes BEFORE :id/undo-request so they don't get swallowed by the
// param matcher.
router.get(
  '/undo-requests',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales', 'back_office', 'auditor'),
  undoCtl.list,
);
router.get(
  '/undo-requests/pending-count',
  allowRoles(...STAFF_ADMIN),
  undoCtl.pendingCount,
);
router.post(
  '/undo-requests/:requestId/approve',
  allowRoles('super_admin', 'admin'),
  undoCtl.approve,
);
router.post(
  '/undo-requests/:requestId/reject',
  allowRoles('super_admin', 'admin'),
  undoCtl.reject,
);
router.post(
  '/undo-requests/:requestId/cancel',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  undoCtl.cancel,
);

// Submit a new undo request for a specific deal/lead.
router.post(
  '/:id/undo-request',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  undoCtl.create,
);

module.exports = router;
