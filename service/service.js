// Frame Home helper service. Runs inside TizenBrew's service (Node 4, ES5 only).
// The home screen page cannot use the TV's app API, so it asks this helper on
// http://127.0.0.1:38085 to list apps, hand over their icons, open apps and
// send remote-control keys (volume, HDMI). After it opens an app it watches
// it, and when that app is left it brings Frame Home (TizenBrew) back to the
// front. Only the TV itself may use the helper; other devices on the network
// get /ping (alive or not) and nothing else. A newer helper asks an older one
// to step aside (/quit), so updates do not need a TV restart.
var http = require('http');
var net = require('net');
var tls = require('tls');
var os = require('os');
var fs = require('fs');
var crypto = require('crypto');
var urlmod = require('url');

var VERSION = '0.2.4';
var PORT = 38085;
var NAME = 'Frame Home';
var ALLOWED_KEYS = ['KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE', 'KEY_SOURCE', 'KEY_HDMI', 'KEY_HDMI1', 'KEY_HDMI2', 'KEY_HDMI3', 'KEY_HDMI4'];
var SOURCE_NAMES = /source|hdmi|input|tv viewer|live tv|tvplus|channel/i;

function lanIp() {
  var n = os.networkInterfaces();
  for (var k in n) {
    for (var i = 0; i < n[k].length; i++) {
      var a = n[k][i];
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return '127.0.0.1';
}

var state = { ip: lanIp(), remote: 'not tried yet', token: null, started: new Date().toISOString(), homeId: null, listener: 'not set up', returns: 0, sources: [] };
var tokenFile = (os.tmpdir ? os.tmpdir() : '/tmp') + '/frame-home-token.txt';
try { state.token = fs.readFileSync(tokenFile, 'utf8').trim() || null; } catch (e) {}

var events = [];
function log(text) {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  events.push(p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + ' ' + text);
  if (events.length > 30) events.shift();
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function hasTizenApp() { return typeof tizen !== 'undefined' && tizen && tizen.application; }

// ---- which app Frame Home itself runs in (the TizenBrew app) ----
function findHome(list) {
  var pkg = null;
  try { pkg = tizen.application.getCurrentApplication().appInfo.packageId; } catch (e) {}
  for (var i = 0; i < list.length; i++) {
    var id = list[i].id || '';
    if (pkg && id.indexOf(pkg + '.') === 0 && !/service/i.test(id)) return id;
  }
  for (var j = 0; j < list.length; j++) if (/tizenbrew/i.test(list[j].name || '') && !/service/i.test(list[j].id || '')) return list[j].id;
  return null;
}

var appCache = null;
function listApps(cb) {
  if (!hasTizenApp()) return cb('The TV app list is not available to the helper', []);
  try {
    tizen.application.getAppsInfo(function (list) {
      var out = [], src = [];
      for (var i = 0; i < list.length; i++) {
        out.push({ id: list[i].id, name: list[i].name, icon: list[i].iconPath || '' });
        if (SOURCE_NAMES.test(list[i].name || '') || SOURCE_NAMES.test(list[i].id || '')) src.push(list[i].name + '=' + list[i].id);
      }
      appCache = out;
      state.sources = src.slice(0, 12);
      if (!state.homeId) state.homeId = findHome(out);
      cb(null, out);
    }, function (e) { cb((e && e.message) || String(e), []); });
  } catch (e) { cb(e.message, []); }
}
listApps(function () {});

function restGet(id, cb) {
  var req = http.request({ host: state.ip, port: 8001, path: '/api/v2/applications/' + encodeURIComponent(id), method: 'GET' }, function (r) {
    var d = '';
    r.on('data', function (c) { d += c; });
    r.on('end', function () { var j = null; try { j = JSON.parse(d); } catch (e) {} cb(j); });
  });
  req.on('error', function () { cb(null); });
  req.setTimeout(4000, function () { req.abort(); });
  req.end();
}

function restLaunch(id, cb) {
  var req = http.request({ host: state.ip, port: 8001, path: '/api/v2/applications/' + encodeURIComponent(id), method: 'POST', headers: { 'Content-Length': 0 } }, function (r) {
    var d = '';
    r.on('data', function (c) { d += c; });
    r.on('end', function () { cb(r.statusCode >= 200 && r.statusCode < 300 ? null : 'TV answered ' + r.statusCode + ' ' + d.slice(0, 120)); });
  });
  req.on('error', function (e) { cb(e.message); });
  req.setTimeout(6000, function () { req.abort(); });
  req.end();
}

function launch(id, cb) {
  if (!id) return cb('No app id', '');
  if (hasTizenApp()) {
    try {
      tizen.application.launch(id, function () { cb(null, 'tizen'); }, function () {
        restLaunch(id, function (err) { cb(err, 'rest'); });
      });
      return;
    } catch (e) {}
  }
  restLaunch(id, function (err) { cb(err, 'rest'); });
}

// ---- bring Frame Home back when the opened app is left ----
var watch = null; // { id, rid, name, at, wasRunning, pending }
var lastActive = { id: null, at: 0 };

function bringHomeBack(why) {
  watch = null;
  if (!state.homeId) { log('cannot return: Frame Home app id unknown'); return; }
  state.returns++;
  log('returning to Frame Home (' + why + ')');
  try {
    tizen.application.launch(state.homeId, function () {}, function (e) {
      log('return via app API failed: ' + (e && e.message) + ', trying the network API');
      restLaunch(state.homeId, function () {});
    });
  } catch (e) { restLaunch(state.homeId, function () {}); }
}

function isUserApp(id) {
  if (!appCache) return true;
  for (var i = 0; i < appCache.length; i++) if (appCache[i].id === id) return !!appCache[i].icon;
  return false;
}

function onLeft(why) {
  if (!watch || watch.pending) return;
  watch.pending = true;
  var leftAt = Date.now(), from = watch.name, fromId = watch.id;
  setTimeout(function () {
    if (!watch) return;
    if (lastActive.at > leftAt && lastActive.id && lastActive.id !== fromId && lastActive.id !== state.homeId && isUserApp(lastActive.id)) {
      log('left ' + from + ' for ' + lastActive.id + ', staying there');
      watch = null;
      return;
    }
    bringHomeBack('left ' + from + ': ' + why);
  }, 1500);
}

var listenerFn = null;
function setupListener() {
  if (!hasTizenApp() || typeof tizen.application.addAppStatusChangeListener !== 'function') { state.listener = 'not available on this TV'; return; }
  try {
    listenerFn = tizen.application.addAppStatusChangeListener(function (appId, status) {
      if (status === 'ACTIVE') lastActive = { id: appId, at: Date.now() };
      log(appId + ' ' + status);
      if (watch && appId === watch.id && status === 'INACTIVE') onLeft('it went to the background');
    });
    state.listener = 'listening for app changes';
  } catch (e) { state.listener = 'could not listen: ' + e.message; }
}
setupListener();

var pollTimer = setInterval(function () {
  if (!watch || watch.pending) return;
  if (Date.now() - watch.at > 6 * 3600 * 1000) { watch = null; return; }
  restGet(watch.rid, function (j) {
    if (!watch || !j || typeof j.running === 'undefined') return;
    if (j.running) watch.wasRunning = true;
    else if (watch.wasRunning) onLeft('it closed');
  });
}, 2000);

// ---- a very small WebSocket client for the TV's own remote-control channel ----
var remote = null;
var TARGETS = function () {
  return [
    { host: state.ip, port: 8002, secure: true },
    { host: '127.0.0.1', port: 8002, secure: true },
    { host: state.ip, port: 8001, secure: false },
    { host: '127.0.0.1', port: 8001, secure: false }
  ];
};

function wsConnect(t, cb) {
  var key = crypto.randomBytes(16).toString('base64');
  var label = t.host + ':' + t.port;
  var path = '/api/v2/channels/samsung.remote.control?name=' + new Buffer(NAME).toString('base64') + (state.token ? '&token=' + state.token : '');
  var sock;
  try {
    sock = t.secure ? tls.connect({ host: t.host, port: t.port, rejectUnauthorized: false }) : net.connect({ host: t.host, port: t.port });
  } catch (e) { return cb(label + ' could not start: ' + e.message); }
  var buf = new Buffer(0), upgraded = false, done = false, seen = '';
  function finish(err) { if (done) return; done = true; cb(err ? label + ' ' + err + (seen ? ' [got: ' + seen.slice(0, 90) + ']' : '') : null, err ? null : sock); }
  sock.setTimeout(30000, function () { if (!done) { finish('no answer (was an Allow box shown on the TV?)'); sock.destroy(); } });
  sock.on(t.secure ? 'secureConnect' : 'connect', function () {
    sock.write('GET ' + path + ' HTTP/1.1\r\nHost: ' + t.host + ':' + t.port + '\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n');
  });
  sock.on('data', function (chunk) {
    buf = Buffer.concat([buf, chunk]);
    if (!upgraded) {
      var i = buf.toString('binary').indexOf('\r\n\r\n');
      if (i < 0) return;
      var first = buf.slice(0, i).toString().split('\r\n')[0];
      seen += first + ' ';
      if (first.indexOf(' 101') < 0) { finish('said: ' + first); sock.destroy(); return; }
      upgraded = true;
      buf = buf.slice(i + 4);
    }
    while (buf.length >= 2) {
      var len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
      if (buf.length < off + len) return;
      var op = buf[0] & 15, text = buf.slice(off, off + len).toString();
      buf = buf.slice(off + len);
      if (op === 1) {
        seen += text + ' ';
        var m = {};
        try { m = JSON.parse(text); } catch (e) {}
        if (m.event === 'ms.channel.connect') {
          if (m.data && m.data.token) {
            state.token = String(m.data.token);
            try { fs.writeFileSync(tokenFile, state.token); } catch (e) {}
          }
          finish(null);
        } else if (m.event === 'ms.channel.unauthorized') {
          finish('refused (unauthorized)');
          sock.destroy();
        } else if (m.event === 'ms.channel.timeOut') {
          finish('the Allow box timed out');
          sock.destroy();
        }
      } else if (op === 8) { seen += '[close frame] '; sock.destroy(); }
    }
  });
  sock.on('error', function (e) { finish('error: ' + e.message); });
  sock.on('close', function () { if (remote && remote.sock === sock) remote = null; finish('closed'); });
}

function wsSendText(sock, text) {
  var data = new Buffer(text), len = data.length, mask = crypto.randomBytes(4), head;
  if (len < 126) { head = new Buffer(2); head[1] = 0x80 | len; }
  else { head = new Buffer(4); head[1] = 0x80 | 126; head.writeUInt16BE(len, 2); }
  head[0] = 0x81;
  var masked = new Buffer(len);
  for (var i = 0; i < len; i++) masked[i] = data[i] ^ mask[i % 4];
  sock.write(Buffer.concat([head, mask, masked]));
}

function sendKey(k, cb) {
  if (ALLOWED_KEYS.indexOf(k) < 0) return cb('That key is not allowed');
  var msg = JSON.stringify({ method: 'ms.remote.control', params: { Cmd: 'Click', DataOfCmd: k, Option: 'false', TypeOfRemote: 'SendRemoteKey' } });
  if (remote) { wsSendText(remote.sock, msg); return cb(null, remote.label); }
  var targets = TARGETS(), errors = [];
  (function next(i) {
    if (i >= targets.length) {
      state.remote = errors.join(' | ');
      log('remote channel failed: ' + state.remote);
      return cb(state.remote + (state.sources.length ? ' || input apps: ' + state.sources.join(', ') : ''));
    }
    wsConnect(targets[i], function (err, sock) {
      if (!err) {
        var label = targets[i].host + ':' + targets[i].port;
        remote = { sock: sock, label: label };
        state.remote = 'connected on ' + label;
        log('remote channel ' + state.remote);
        wsSendText(sock, msg);
        return cb(null, label);
      }
      errors.push(err);
      next(i + 1);
    });
  })(0);
}

function sendIcon(res, p) {
  if (!p || p.charAt(0) !== '/' || p.indexOf('..') >= 0 || !/\.(png|jpg|jpeg)$/i.test(p)) return sendJson(res, 400, { error: 'bad icon path' });
  fs.readFile(p, function (err, data) {
    if (err) return sendJson(res, 404, { error: 'icon not found' });
    res.writeHead(200, { 'Content-Type': /\.png$/i.test(p) ? 'image/png' : 'image/jpeg', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'max-age=86400' });
    res.end(data);
  });
}

// ---- step aside for a newer helper ----
function shutdown() {
  log('stepping aside for a newer helper');
  try { clearInterval(pollTimer); } catch (e) {}
  try { if (listenerFn !== null) tizen.application.removeAppStatusChangeListener(listenerFn); } catch (e) {}
  try { if (remote) remote.sock.destroy(); } catch (e) {}
  try { server.close(); } catch (e) {}
}

var server = http.createServer(function (req, res) {
  var u = urlmod.parse(req.url, true), q = u.query;
  var addr = (req.socket && req.socket.remoteAddress) || '';
  var local = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1' || addr === state.ip || addr === '::ffff:' + state.ip;
  if (!local && u.pathname !== '/ping') return sendJson(res, 403, { error: 'only the TV itself may use this' });
  if (u.pathname === '/ping') return sendJson(res, 200, { ok: true, version: VERSION, appApi: !!hasTizenApp(), remote: state.remote, listener: state.listener, homeKnown: !!state.homeId, returns: state.returns, started: state.started });
  if (u.pathname === '/apps') return listApps(function (err, list) { sendJson(res, 200, { error: err, apps: list, homeId: state.homeId, sources: state.sources }); });
  if (u.pathname === '/launch') {
    return launch(q.id, function (err, how) {
      if (!err) { watch = { id: q.id, rid: q.rid || q.id, name: q.name || q.id, at: Date.now(), wasRunning: false, pending: false }; log('opened ' + watch.name + ' via ' + how); }
      sendJson(res, 200, { error: err || null, how: how });
    });
  }
  if (u.pathname === '/key') return sendKey(q.k, function (err, label) { sendJson(res, 200, { error: err || null, port: label || null }); });
  if (u.pathname === '/events') return sendJson(res, 200, { events: events, watching: watch ? watch.name : null, listener: state.listener, homeId: state.homeId, sources: state.sources });
  if (u.pathname === '/icon') return sendIcon(res, q.p);
  if (u.pathname === '/quit') { sendJson(res, 200, { ok: true, version: VERSION }); setTimeout(shutdown, 100); return; }
  sendJson(res, 404, { error: 'not found' });
});

var listenTries = 0;
server.on('error', function (e) {
  if (e && e.code === 'EADDRINUSE' && listenTries < 6) {
    listenTries++;
    // an older helper holds the port: ask it to step aside, then try again
    var r = http.request({ host: '127.0.0.1', port: PORT, path: '/quit', method: 'GET' }, function (res) { res.resume(); });
    r.on('error', function () {});
    r.end();
    setTimeout(function () { try { server.listen(PORT, '0.0.0.0'); } catch (x) {} }, 800);
  }
});
server.listen(PORT, '0.0.0.0');
