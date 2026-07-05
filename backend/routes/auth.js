const router = require('express').Router();
const ctl = require('../controllers/authController');
const twoFactor = require('../controllers/twoFactorController');
const { verifyToken } = require('../middleware/auth');

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email: { type: string }
 *               password: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Invalid credentials }
 */
router.post('/login', ctl.login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Rotate refresh token, issue new access token
 */
router.post('/refresh', ctl.refresh);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Revoke refresh token
 */
router.post('/logout', ctl.logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Current user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', verifyToken, ctl.me);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     tags: [Auth]
 *     summary: Change own password (supports first-login forced reset)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/change-password', verifyToken, ctl.changeOwnPassword);

// ── Two-factor auth (opt-in TOTP) ─────────────────────────────────────────────

/**
 * @swagger
 * /auth/2fa/verify:
 *   post:
 *     tags: [Auth]
 *     summary: Complete login's second factor (challenge + TOTP or backup code) → real session
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               challenge: { type: string }
 *               token: { type: string }
 *     responses:
 *       200: { description: OK — returns { user, accessToken, refreshToken } }
 *       401: { description: Invalid challenge or code }
 */
router.post('/2fa/verify', twoFactor.verify); // PUBLIC — no verifyToken

/**
 * @swagger
 * /auth/2fa/setup:
 *   post:
 *     tags: [Auth]
 *     summary: Begin 2FA setup — returns { secret, otpauth_url }
 *     security: [{ bearerAuth: [] }]
 */
router.post('/2fa/setup', verifyToken, twoFactor.setup);

/**
 * @swagger
 * /auth/2fa/enable:
 *   post:
 *     tags: [Auth]
 *     summary: Confirm 2FA with a TOTP code — returns { backup_codes } once
 *     security: [{ bearerAuth: [] }]
 */
router.post('/2fa/enable', verifyToken, twoFactor.enable);

/**
 * @swagger
 * /auth/2fa/disable:
 *   post:
 *     tags: [Auth]
 *     summary: Disable 2FA (verify with a TOTP or backup code)
 *     security: [{ bearerAuth: [] }]
 */
router.post('/2fa/disable', verifyToken, twoFactor.disable);

/**
 * @swagger
 * /auth/2fa/status:
 *   get:
 *     tags: [Auth]
 *     summary: Whether 2FA is enabled for the current user
 *     security: [{ bearerAuth: [] }]
 */
router.get('/2fa/status', verifyToken, twoFactor.status);

module.exports = router;
