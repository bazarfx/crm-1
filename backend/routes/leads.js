const router = require('express').Router();
const ctl = require('../controllers/leadController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

router.use(verifyToken);

router.get(
  '/',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales', 'back_office', 'auditor', 'archive'),
  ctl.list,
);
router.get(
  '/export.csv',
  allowRoles(...STAFF_ADMIN, 'back_office', 'auditor'),
  ctl.exportCsv,
);
// MUST precede `/:id` — otherwise Express matches "reassignments" as a lead id.
router.get(
  '/reassignments/from-me',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.reassignmentsFromMe,
);
router.get(
  '/:id',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales', 'back_office', 'auditor', 'archive'),
  ctl.getOne,
);
router.post('/', allowRoles(...STAFF_ADMIN), ctl.create);
router.patch(
  '/:id',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.update,
);
// Explicit per-action routes — admin / super_admin / floor_manager / senior / tele_sales
router.patch(
  '/:id/status',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.updateStatus,
);
router.patch(
  '/:id/assign',
  allowRoles(...STAFF_ADMIN),
  ctl.assign,
);
router.patch(
  '/:id/reassign',
  allowRoles(...STAFF_ADMIN, 'senior'),
  ctl.reassign,
);
router.patch(
  '/:id/owner',
  allowRoles(...STAFF_ADMIN, 'senior'),
  ctl.reassign,
);
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.softDelete);

// Legacy / aliases — kept for back-compat with code that hasn't migrated yet
router.post(
  '/:id/assign',
  allowRoles(...STAFF_ADMIN, 'senior'),
  ctl.assign,
);
router.post(
  '/:id/notes',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.addNote,
);
router.post(
  '/:id/calls',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.logCall,
);

// Activity timeline
router.get(
  '/:id/activities',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales', 'back_office', 'auditor'),
  ctl.getActivities,
);
router.post(
  '/:id/activities',
  allowRoles(...STAFF_ADMIN, 'senior', 'tele_sales'),
  ctl.addActivity,
);

module.exports = router;
