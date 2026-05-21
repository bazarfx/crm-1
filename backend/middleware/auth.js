const { verifyAccessToken } = require('../utils/jwtUtils');
const { error } = require('../utils/responseHelper');
const { User } = require('../models');

async function verifyToken(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return error(res, 'Missing or malformed Authorization header', 401);
    }

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (e) {
      if (e.name === 'TokenExpiredError') {
        return error(res, 'Access token expired', 401, { code: 'TOKEN_EXPIRED' });
      }
      return error(res, 'Invalid access token', 401, { code: 'INVALID_TOKEN' });
    }

    // Refetch on every request so deactivated / soft-deleted users get
    // booted on their next call rather than living to token expiry.
    // paranoid:false includes soft-deleted rows so we can distinguish
    // USER_DELETED from a missing user.
    const user = await User.findByPk(payload.sub, { paranoid: false });
    if (!user) {
      return error(res, 'User not found', 401);
    }
    if (user.deletedAt) {
      return error(res, 'Account has been deleted. Contact your administrator.', 401, {
        code: 'USER_DELETED',
      });
    }
    if (!user.is_active) {
      return error(res, 'Account is deactivated. Contact your administrator.', 401, {
        code: 'USER_DEACTIVATED',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name,
      must_change_password: user.must_change_password,
      impersonated_by: payload.impersonated_by || null,
    };
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { verifyToken };
