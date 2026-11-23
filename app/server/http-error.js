const STATUS = { UNAUTHORIZED: 409, BAD_REQUEST: 400, BAD_CONFIG: 400, UNKNOWN_ACTION: 400, NOT_FOUND: 404, CONFIG_CHANGED: 409, BUSY: 409, TOO_LONG: 409, UNAVAILABLE: 503, UNSUPPORTED: 501 };

function sendError(res, e) {
  const code = e.code && STATUS[e.code] ? e.code : 'ACTION_FAILED';
  res.status(STATUS[code] || e.status || 500).json({ ok: false, error: { code: code, message: e.message || 'Errore' } });
}

module.exports = { STATUS: STATUS, sendError: sendError };
