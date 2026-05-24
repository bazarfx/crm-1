const { AuditLog } = require('../models');

/**
 * Generic soft-delete helper.
 *
 * - Captures the pre-delete row snapshot
 * - Calls .destroy() (Sequelize handles `deletedAt` because the model is paranoid)
 * - Writes a SOFT_DELETE row to AuditLog so the recycle-bin UI can show who/when
 *
 * Usage:
 *   await softDelete(lead, req.user, 'Lead', req.ip);
 */
async function softDelete(instance, user, resourceName, ipAddress) {
  if (!instance) throw new Error('softDelete: instance is required');
  const snapshot = typeof instance.toJSON === 'function' ? instance.toJSON() : { ...instance };

  await instance.destroy();

  try {
    await AuditLog.create({
      user_id: user?.id || null,
      action: 'SOFT_DELETE',
      resource: resourceName,
      resource_id: instance.id,
      old_data: snapshot,
      new_data: null,
      ip_address: ipAddress || null,
    });
  } catch (e) {
    // AuditLog failure shouldn't block the delete itself; log and continue.
    // eslint-disable-next-line no-console
    console.error('softDelete: failed to write AuditLog row:', e.message);
  }

  return instance;
}

module.exports = { softDelete };
