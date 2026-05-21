function requestLogger(req, res, next) {
  if (req.path === '/health') return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const who = req.user?.email || '-';
    // eslint-disable-next-line no-console
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms ${who}`,
    );
  });
  next();
}

module.exports = requestLogger;
