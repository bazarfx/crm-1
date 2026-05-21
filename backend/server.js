require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const models = require('./models');
const routes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const swaggerSpec = require('./config/swagger');
const { setupAdminJS } = require('./config/adminjs');
const { error } = require('./utils/responseHelper');

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const API_VERSION = process.env.API_VERSION || 'v1';

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false, // AdminJS + Swagger need relaxed CSP
  }),
);
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));
app.use(requestLogger);

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), time: new Date().toISOString() });
});

// ─── Swagger UI ──────────────────────────────────────────────────────────────
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

// ─── API routes ──────────────────────────────────────────────────────────────
app.use(`/api/${API_VERSION}`, routes);

// ─── 404 handler (after all routes, before error handler) ────────────────────
app.use((req, res, next) => {
  // Skip 404 for /admin which is mounted async later
  if (req.path.startsWith('/admin')) return next();
  return error(res, `Not found: ${req.method} ${req.originalUrl}`, 404);
});

// ─── Error handler ───────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return error(res, err.message, 400, err.errors?.map((e) => ({ path: e.path, message: e.message })));
  }
  return error(res, err.message || 'Internal server error', err.status || 500);
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function start() {
  try {
    await models.testConnection();
    console.log('✓ Database connection OK');
  } catch (e) {
    console.error('✗ Database connection failed:', e.message);
    process.exit(1);
  }

  if (process.env.AUTO_SYNC === 'true') {
    await models.syncDatabase({ alter: true });
    console.log('✓ Models synced (alter:true)');
  }

  try {
    await setupAdminJS(app, models);
    console.log('✓ AdminJS mounted at /admin');
  } catch (e) {
    console.warn('⚠ AdminJS failed to start:', e.message);
  }

  app.listen(PORT, () => {
    console.log(`▶ CRM 1 backend listening on http://localhost:${PORT}`);
    console.log(`  API:     http://localhost:${PORT}/api/${API_VERSION}`);
    console.log(`  Swagger: http://localhost:${PORT}/api-docs`);
    console.log(`  AdminJS: http://localhost:${PORT}/admin`);
    console.log(`  Health:  http://localhost:${PORT}/health`);
  });
}

if (require.main === module) start();

module.exports = app;
