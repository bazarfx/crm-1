const router = require('express').Router();
const { verifyToken } = require('../middleware/auth');
const ctrl = require('../controllers/fieldDefinitionController');

router.use(verifyToken);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getOne);
router.get('/:id/usage-count', ctrl.usageCount);

router.post('/', ctrl.create);
// NOTE: /layout must be registered before /:id so the literal path isn't
// captured as an :id param by the PATCH matcher below.
router.patch('/layout', ctrl.updateLayout);
router.patch('/:id', ctrl.update);
router.delete('/:id', ctrl.hardDelete);
router.post('/:id/archive', ctrl.archive);
router.post('/:id/restore', ctrl.restore);
router.get('/:id/backfill-preview', ctrl.backfillPreview);
router.post('/:id/backfill-default', ctrl.backfillDefault);
router.get('/:id/option-usage', ctrl.getOptionUsage);
router.post('/:id/migrate-options', ctrl.migrateOptions);
router.post('/reorder', ctrl.reorder);
router.post('/test-render', ctrl.testRender);

module.exports = router;
