const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold() {
  return LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info;
}

function stamp() {
  const d = new Date();
  const pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function make(level) {
  return function (tag) {
    if (LEVELS[level] < threshold()) return;
    const args = Array.prototype.slice.call(arguments, 1);
    const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    fn.apply(console, [stamp() + ' [' + tag + ']'].concat(args));
  };
}

module.exports = {
  debug: make('debug'),
  info: make('info'),
  warn: make('warn'),
  error: make('error')
};
