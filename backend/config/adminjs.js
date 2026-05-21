/**
 * AdminJS v7 is ESM-only; this project is CommonJS, so we mount it via
 * dynamic import inside an async setup function.
 */

const bcrypt = require('bcrypt');

async function setupAdminJS(app, models) {
  const { default: AdminJS, ComponentLoader } = await import('adminjs');
  const AdminJSExpress = (await import('@adminjs/express')).default;
  const AdminJSSequelize = await import('@adminjs/sequelize');

  AdminJS.registerAdapter({
    Database: AdminJSSequelize.Database,
    Resource: AdminJSSequelize.Resource,
  });

  const passwordEdit = {
    isVisible: { list: false, filter: false, show: false, edit: true, new: true },
  };

  const adminJs = new AdminJS({
    rootPath: '/admin',
    branding: {
      companyName: 'CRM 1 — Trading Telesales',
      withMadeWithLove: false,
    },
    resources: [
      {
        resource: models.User,
        options: {
          properties: {
            password: passwordEdit,
            id: { isVisible: { list: false, filter: true, show: true, edit: false } },
          },
        },
      },
      { resource: models.Config },
      { resource: models.Group },
      { resource: models.GroupMember },
      { resource: models.Campaign },
      { resource: models.CampaignGroupAssignment },
      {
        resource: models.Lead,
        options: {
          listProperties: [
            'id', 'first_name', 'last_name', 'phone', 'lead_status',
            'language', 'lead_owner_id', 'created_at',
          ],
        },
      },
      { resource: models.LeadActivity },
      { resource: models.ArkWebhookLog },
      { resource: models.IngestLog },
      { resource: models.RoundRobinState },
      { resource: models.AuditLog },
      { resource: models.RefreshToken },
    ],
  });

  const adminEmail = process.env.ADMIN_EMAIL || 'superadmin@thework.ltd';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Test@1234';

  const authenticate = async (email, password) => {
    if (!email || !password) return null;
    // First: env-pinned superadmin (works even if no users exist yet)
    if (email === adminEmail && password === adminPassword) {
      return { email, role: 'super_admin' };
    }
    // Then: real users with super_admin/admin role
    const user = await models.User.scope('withPassword').findOne({ where: { email } });
    if (!user || !user.is_active) return null;
    if (!['super_admin', 'admin'].includes(user.role)) return null;
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return null;
    return { email: user.email, role: user.role, id: user.id };
  };

  const router = AdminJSExpress.buildAuthenticatedRouter(
    adminJs,
    {
      authenticate,
      cookieName: process.env.ADMIN_COOKIE_NAME || 'adminjs',
      cookiePassword: process.env.ADMIN_COOKIE_SECRET || 'change-me-admin-cookie',
    },
    null,
    {
      resave: false,
      saveUninitialized: false,
      secret: process.env.ADMIN_COOKIE_SECRET || 'change-me-admin-cookie',
    },
  );

  app.use(adminJs.options.rootPath, router);
  return adminJs;
}

module.exports = { setupAdminJS };
