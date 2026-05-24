const { getAllForRole } = require('../utils/permissions');
const { success } = require('../utils/responseHelper');

/**
 * GET /api/v1/permissions/me
 * Returns the calling user's full permission map for the current role.
 * Super admin gets the synthetic 'all' map (Layer 2).
 */
exports.myPermissions = async (req, res) => {
  const { role, id } = req.user;
  const permissions = await getAllForRole(role, id);
  return success(res, {
    role,
    user_id: id,
    permissions,
    is_super_admin: role === 'super_admin',
    is_custom: role === 'custom',
  });
};
