function success(res, data = null, message = 'OK', status = 200) {
  return res.status(status).json({ success: true, message, data });
}

function error(res, message = 'Error', status = 500, extra = null) {
  const body = { success: false, message, data: null };
  if (extra !== null && extra !== undefined) {
    if (Array.isArray(extra)) body.errors = extra;
    else if (typeof extra === 'object') Object.assign(body, extra);
  }
  return res.status(status).json(body);
}

function paginated(res, rows, { total, page, limit }, message = 'OK') {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return res.status(200).json({
    success: true,
    message,
    data: rows,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages,
    },
  });
}

module.exports = { success, error, paginated };
