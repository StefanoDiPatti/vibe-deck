var I18n = (function () {
  'use strict';

  var lang = 'it';
  try { lang = JSON.parse(window.localStorage.getItem('dock:lang') || '"it"') === 'en' ? 'en' : 'it'; } catch (e) { lang = 'it'; }
  var dict = {};
  var rules = [];

  function add(map) {
    for (var k in map) if (map.hasOwnProperty(k)) dict[String(k).toLowerCase()] = map[k];
  }
  function addRules(list) { for (var i = 0; i < list.length; i++) rules.push(list[i]); }

  function cased(src, out) {
    if (src === src.toUpperCase() && src !== src.toLowerCase()) return out.toUpperCase();
    var a = src.charAt(0);
    if (a !== a.toLowerCase() && out.charAt(0) === out.charAt(0).toLowerCase()) return out.charAt(0).toUpperCase() + out.slice(1);
    return out;
  }
  function one(s) {
    var k = s.toLowerCase();
    if (dict.hasOwnProperty(k)) return cased(s, dict[k]);
    for (var i = 0; i < rules.length; i++) {
      if (rules[i][0].test(s)) return s.replace(rules[i][0], rules[i][1]);
    }
    return null;
  }
  function t(s) {
    if (lang !== 'en' || s === null || s === undefined) return s;
    var str = String(s), core = str.replace(/^\s+|\s+$/g, '');
    if (!core || core.length > 400) return str;
    var out = one(core);
    if (out === null && core.indexOf('· ') === 0) { var rest = t(core.slice(2)); if (rest !== core.slice(2)) out = '· ' + rest; }
    if (out === null && /\S\s+·\s+\S/.test(core)) {
      var parts = core.split(/(\s+·\s+)/), changed = false;
      for (var i = 0; i < parts.length; i += 2) { var p = one(parts[i]); if (p !== null) { parts[i] = p; changed = true; } }
      if (changed) out = parts.join('');
    }
    if (out === null) return str;
    return str.replace(core, out);
  }

  var ATTRS = ['placeholder', 'title'];
  var NOTR_DEPTH = 4;
  function keptAsIs(n) {
    for (var p = n.parentNode, i = 0; p && p.nodeType === 1 && i < NOTR_DEPTH; p = p.parentNode, i++) {
      if (typeof p.className === 'string' && (' ' + p.className + ' ').indexOf(' notr ') >= 0) return true;
    }
    return false;
  }
  function node(n) {
    if (n.nodeType === 3) {
      if (keptAsIs(n)) return;
      var v = n.nodeValue;
      if (v && /[A-Za-zÀ-ú]/.test(v)) { var x = t(v); if (x !== v) n.nodeValue = x; }
      return;
    }
    if (n.nodeType !== 1 || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'TEXTAREA') return;
    if (typeof n.className === 'string' && (' ' + n.className + ' ').indexOf(' notr ') >= 0) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var val = n.getAttribute && n.getAttribute(ATTRS[a]);
      if (val) { var y = t(val); if (y !== val) n.setAttribute(ATTRS[a], y); }
    }
    if (n.tagName === 'INPUT') return;
    for (var c = n.firstChild; c; c = c.nextSibling) node(c);
  }
  function translate(root) { if (lang === 'en' && root) node(root); }

  function watch() {
    if (lang !== 'en') return;
    translate(document.body);
    var MO = window.MutationObserver || window.WebKitMutationObserver;
    if (MO) {
      new MO(function (list) {
        for (var i = 0; i < list.length; i++) {
          var m = list[i];
          if (m.type === 'characterData') node(m.target);
          else for (var j = 0; j < m.addedNodes.length; j++) node(m.addedNodes[j]);
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    } else {
      setInterval(function () { translate(document.body); }, 2000);
    }
  }

  function set(l) {
    try { window.localStorage.setItem('dock:lang', JSON.stringify(l === 'en' ? 'en' : 'it')); } catch (e) { }
    window.location.reload();
  }

  return { lang: function () { return lang; }, t: t, add: add, rules: addRules, translate: translate, watch: watch, set: set };
})();
