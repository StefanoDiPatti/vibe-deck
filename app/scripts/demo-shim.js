(function () {
  'use strict';
  var data = window.DEMO_DATA || {};
  var RealXhr = window.XMLHttpRequest;

  try {
    window.localStorage.setItem('dock:token', JSON.stringify('DEMO1234'));
  } catch (e) { }

  function answer(method, url) {
    var path = String(url).split('?')[0];
    if (path.indexOf('/api/') !== 0) return null;
    if (path === '/api/health') return { ok: true, data: { name: 'vibe-deck', version: 'demo', platform: 'demo', paired: true } };
    if (method === 'GET' && data[path]) return data[path];
    if (method === 'GET' && path.indexOf('/api/shapes/') === 0) return { ok: false, error: { code: 'UNAVAILABLE', message: 'Not in the online demo' } };
    if (method === 'POST') return { ok: true, data: { message: 'Demo: nothing runs on a real PC here' } };
    return { ok: false, error: { code: 'UNAVAILABLE', message: 'Not in the online demo' } };
  }

  function FakeXhr() {
    this.readyState = 0;
    this.status = 0;
    this.responseText = '';
    this.onreadystatechange = null;
    this.real = null;
  }
  FakeXhr.prototype.open = function (method, url) {
    this.method = method;
    this.url = url;
    if (String(url).split('?')[0].indexOf('/api/') !== 0) {
      this.real = new RealXhr();
      this.real.open.apply(this.real, arguments);
    }
  };
  FakeXhr.prototype.setRequestHeader = function (k, v) { if (this.real) this.real.setRequestHeader(k, v); };
  FakeXhr.prototype.abort = function () { if (this.real) this.real.abort(); };
  FakeXhr.prototype.send = function (body) {
    var self = this;
    if (this.real) {
      this.real.onreadystatechange = function () {
        self.readyState = self.real.readyState;
        self.status = self.real.status;
        self.responseText = self.real.responseText;
        if (self.onreadystatechange) self.onreadystatechange();
      };
      return this.real.send(body);
    }
    var res = answer(this.method, this.url);
    setTimeout(function () {
      self.readyState = 4;
      self.status = res ? 200 : 404;
      self.responseText = JSON.stringify(res || { ok: false });
      if (self.onreadystatechange) self.onreadystatechange();
    }, 20);
  };
  window.XMLHttpRequest = FakeXhr;
})();
