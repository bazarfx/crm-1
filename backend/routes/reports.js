const router = require('express').Router();
const ctl = require('../controllers/reportController');
const { verifyToken } = require('../middleware/auth');
const { allowRoles, STAFF_ADMIN } = require('../middleware/roleGuard');

// All report routes require auth.
router.use(verifyToken);

// Dashboard summary is role-aware inside the controller — every authenticated
// role (incl. tele_sales / archive) needs it to render their dashboard.
router.get('/dashboard-summary', ctl.dashboardSummary);

// Daily pipeline is a thin operational view — allow any signed-in user.
router.get('/daily-pipeline', ctl.dailyPipeline);

// Teleseller personal dashboard — every authenticated user gets their own view.
router.get('/my-dashboard', ctl.myDashboard);

// Everything below is admin/manager/audit only.
const REPORT_VIEWERS = [...STAFF_ADMIN, 'senior', 'auditor', 'back_office'];
router.use(allowRoles(...REPORT_VIEWERS));

// Existing endpoints (kept for compatibility with the reports page).
router.get('/lead-funnel', ctl.leadFunnel);
router.get('/conversion-by-language', ctl.conversionByLanguage);
router.get('/teller-performance', ctl.tellerPerformance);
router.get('/campaign-roi', ctl.campaignROI);
router.get('/daily-volume', ctl.dailyVolume);
router.get('/call-activity', ctl.callActivity);
router.get('/group-summary', ctl.groupSummary);

// New endpoints from the dashboard spec.
router.get('/ftd-report', ctl.ftdReport);
router.get('/leads-by-source', ctl.leadsBySource);
router.get('/ark-conversion', ctl.arkConversion);

module.exports = router;
