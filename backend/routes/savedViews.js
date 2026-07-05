const router = require('express').Router();
const ctl = require('../controllers/savedViewController');
const { verifyToken } = require('../middleware/auth');

// Every authenticated user manages their OWN saved views (Zoho "Saved
// Filters"). Ownership + sharing rules are enforced per-view in the
// controller — sharing a view to everyone is restricted to admin-tier roles
// there, not at the router level.
router.use(verifyToken);

router.get('/', ctl.list);
router.post('/', ctl.create);
router.get('/:id', ctl.getOne);
router.patch('/:id', ctl.update);
router.delete('/:id', ctl.remove);

module.exports = router;
