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
router.delete('/:id', allowRoles('super_admin', 'admin'), ctl.remove);

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

module.exports = router;
