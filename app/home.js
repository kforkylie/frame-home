/* Frame Home 0.1.0 - TizenBrew app module.
   Test build: the approved design plus an on-screen Setup check that reports
   what this TV actually allows (launching apps, HDMI, volume). Nothing here
   changes TV settings; it only opens apps and sends remote-control keys. */
(function () {
  "use strict";

  /* ---------- scale the 1280 x 720 stage to the screen ---------- */
  var stage = document.getElementById("stage");
  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = "scale(" + s + ")";
  }
  window.addEventListener("resize", fit);
  fit();

  var hasTizen = typeof window.tizen !== "undefined";
  var statusEl = document.getElementById("status");
  function say(text, isErr) {
    var d = new Date();
    statusEl.textContent = text + "  ·  " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    statusEl.className = "status" + (isErr ? " err" : "");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /* ---------- icons ---------- */
  var ICON = {
    film: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>',
    note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
    tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 3l4 3 4-3M8 21h8"/></svg>',
    arrow: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  /* ---------- the apps, in row order ---------- */
  var APPS = [
    { key: "netflix", name: "Netflix", desc: "Films and series.", icon: ICON.film, match: /netflix/i },
    { key: "youtube", name: "YouTube", desc: "Ad-free through TizenTube.", icon: ICON.play, match: /^youtube$/i, tizentube: true },
    { key: "spotify", name: "Spotify", desc: "Music on the soundbar.", icon: ICON.note, match: /spotify/i },
    { key: "viu", name: "Viu", desc: "Dramas.", icon: ICON.heart, match: /^viu\b/i },
    { key: "mewatch", name: "mewatch", desc: "Local TV.", icon: ICON.tv, match: /mewatch/i }
  ];

  var row = document.getElementById("row");
  var dots = document.getElementById("dots");
  APPS.forEach(function (a, i) {
    var c = document.createElement("div");
    c.className = "card";
    c.innerHTML = '<div class="ico">' + a.icon + '</div><div class="nm">' + a.name + '</div><div class="ds">' + a.desc + '</div><div class="go">' + ICON.arrow + "</div>";
    row.appendChild(c);
    a.el = c;
    var d = document.createElement("i");
    dots.appendChild(d);
    a.dot = d;
  });
  var dotsLabel = document.createElement("span");
  dots.appendChild(dotsLabel);

  /* ---------- landscapes, one per time of day (teal to indigo ombre) ---------- */
  var SCENES = [
    { from: 6, to: 9, name: "Dawn hills", sky: ["#e7eefa", "#d9f4f6", "#ecf9f8"], body: '<circle cx="90" cy="120" r="18" fill="#ffffff"/><path d="M0 120 L60 104 L130 116 L200 94 L280 112 L360 100 L360 200 L0 200 Z" fill="#bfe9ee"/><path d="M0 150 L90 132 L190 148 L290 128 L360 140 L360 200 L0 200 Z" fill="#8fd6df"/>' },
    { from: 9, to: 12, name: "Morning lake", sky: ["#bfe9ee", "#e6f7f9", "#a7e5eb"], body: '<circle cx="260" cy="58" r="20" fill="#ffffff"/><path d="M0 112 L70 88 L140 104 L210 80 L290 100 L360 86 L360 120 L0 120 Z" fill="#5fc8d2"/><rect x="0" y="120" width="360" height="80" fill="#a7e5eb"/><path d="M0 120 L70 140 L140 128 L210 146 L290 130 L360 142 L360 120 Z" fill="#5fc8d2" fill-opacity=".5"/>' },
    { from: 12, to: 16, name: "Afternoon coast", sky: ["#d2ecf5", "#bfe3f0", "#a9dcec"], body: '<circle cx="180" cy="44" r="22" fill="#ffffff"/><path d="M0 140 C60 112 120 112 180 136 C240 158 300 118 360 126 L360 200 L0 200 Z" fill="#5cb8d6"/><path d="M0 170 C80 148 160 152 230 168 C290 182 330 162 360 162 L360 200 L0 200 Z" fill="#008db3" fill-opacity=".75"/>' },
    { from: 16, to: 19, name: "Late light ridges", sky: ["#c9eef2", "#bcd9f0", "#cfc6ee"], body: '<circle cx="250" cy="110" r="24" fill="#ffffff" fill-opacity=".9"/><path d="M0 118 L80 98 L150 114 L230 90 L300 110 L360 98 L360 200 L0 200 Z" fill="#6fc3d8"/><path d="M0 152 L100 134 L200 150 L300 130 L360 142 L360 200 L0 200 Z" fill="#5b7fc9"/>' },
    { from: 19, to: 22, name: "Evening mist", sky: ["#d9f4f6", "#d8d0f1", "#ece6f8"], body: '<circle cx="284" cy="90" r="32" fill="#ffffff" fill-opacity=".8"/><path d="M0 112 L40 100 L80 107 L118 92 L158 102 L197 88 L236 99 L276 90 L315 101 L360 94 L360 200 L0 200 Z" fill="#a7e5eb"/><path d="M0 132 L48 121 L93 128 L141 117 L191 127 L242 118 L292 127 L360 120 L360 200 L0 200 Z" fill="#8ccbe0"/><path d="M0 157 L62 148 L129 155 L197 146 L264 154 L360 149 L360 200 L0 200 Z" fill="#a99ad8"/>' },
    { from: 22, to: 30, name: "Indigo night", sky: ["#b9afe4", "#d4cdee", "#c2b6e4"], body: '<circle cx="96" cy="56" r="16" fill="#fbfaff"/><circle cx="104" cy="52" r="14" fill="#b9afe4"/><circle cx="200" cy="40" r="1.6" fill="#fff"/><circle cx="260" cy="66" r="1.4" fill="#fff"/><circle cx="310" cy="34" r="1.8" fill="#fff"/><circle cx="40" cy="30" r="1.4" fill="#fff"/><path d="M0 126 L70 106 L150 122 L230 98 L300 116 L360 104 L360 200 L0 200 Z" fill="#8a7fcf"/><path d="M0 158 L100 140 L200 156 L300 136 L360 148 L360 200 L0 200 Z" fill="#5f4bb4"/>' }
  ];
  function sceneFor(h) {
    var hh = h < 6 ? h + 24 : h;
    for (var i = 0; i < SCENES.length; i++) if (hh >= SCENES[i].from && hh < SCENES[i].to) return i;
    return SCENES.length - 1;
  }
  function sceneSvg(s, i) {
    var id = "sky" + i;
    return '<svg viewBox="0 0 360 200" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.sky[0] + '"/><stop offset=".6" stop-color="' + s.sky[1] + '"/><stop offset="1" stop-color="' + s.sky[2] + '"/></linearGradient></defs><rect width="360" height="200" fill="url(#' + id + ')"/>' + s.body + "</svg>";
  }
  var artA = document.getElementById("artA"), artB = document.getElementById("artB");
  var shown = -1, front = artA, back = artB;
  function showScene(i) {
    if (i === shown) return;
    back.innerHTML = sceneSvg(SCENES[i], i);
    back.classList.add("on");
    front.classList.remove("on");
    var t = front; front = back; back = t;
    shown = i;
    document.getElementById("artLabel").textContent = "Artwork: " + SCENES[i].name + "  ·  " + (i + 1) + " of " + SCENES.length;
  }

  /* ---------- clock, greeting, orb ---------- */
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var orb = document.getElementById("orb");
  function tick() {
    var d = new Date(), h = d.getHours(), m = d.getMinutes();
    var h12 = h % 12 === 0 ? 12 : h % 12;
    document.getElementById("time").textContent = h12 + ":" + pad(m);
    document.getElementById("date").textContent = DAYS[d.getDay()] + ", " + d.getDate() + " " + MONTHS[d.getMonth()];
    var part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    document.getElementById("part").textContent = "GOOD " + part.toUpperCase();
    document.getElementById("ask").textContent = h < 12 ? "What's on this morning?" : h < 18 ? "What's on this afternoon?" : "What's on tonight?";
    // orb travels across the top of the arch: sun 6am-6pm, moon 6pm-6am
    var mins = h * 60 + m;
    var day = mins >= 360 && mins < 1080;
    var f = day ? (mins - 360) / 720 : ((mins - 1080 + 1440) % 1440) / 720;
    var x = 8 + f * 136, y = 128 - Math.sin(f * Math.PI) * 104;
    orb.style.left = x + "px";
    orb.style.top = y + "px";
    orb.classList.toggle("moon", !day);
    showScene(sceneFor(h));
  }
  tick();
  setInterval(tick, 15000);

  /* ---------- live Singapore temperature (free government data, no key) ---------- */
  function weather() {
    var x = new XMLHttpRequest();
    x.open("GET", "https://api.data.gov.sg/v1/environment/air-temperature");
    x.timeout = 8000;
    x.onload = function () {
      try {
        var j = JSON.parse(x.responseText), r = j.items[0].readings, s = 0;
        r.forEach(function (v) { s += v.value; });
        document.getElementById("place").textContent = "Singapore · " + Math.round(s / r.length) + "°";
        checks.weather = ["ok", "Live temperature works (" + r.length + " stations)"];
      } catch (e) { checks.weather = ["no", "Temperature reply could not be read"]; }
      renderChecks();
    };
    x.onerror = x.ontimeout = function () { checks.weather = ["no", "Temperature service not reachable from the TV"]; renderChecks(); };
    x.send();
  }
  weather();
  setInterval(weather, 30 * 60 * 1000);

  /* ---------- find the installed apps ---------- */
  var checks = {
    tizen: hasTizen ? ["ok", "Running on the TV (tizen API present)"] : ["no", "Not on a TV (tizen API missing)"],
    apps: ["wait", "Looking for installed apps..."],
    tizentube: ["wait", "Looking for TizenTube in TizenBrew..."],
    remote: ["wait", "Remote-control channel not tried yet (press a volume or HDMI button)"],
    volume: ["wait", "Volume level: checking..."],
    weather: ["wait", "Temperature: checking..."]
  };
  var installed = [];
  if (hasTizen) {
    try {
      tizen.application.getAppsInfo(function (list) {
        installed = list;
        var found = [];
        APPS.forEach(function (a) {
          for (var i = 0; i < list.length; i++) {
            if (a.match.test(list[i].name)) { a.appId = list[i].id; a.iconPath = list[i].iconPath; break; }
          }
          if (a.appId) {
            found.push(a.name + " = " + a.appId);
            if (a.iconPath) {
              var img = new Image();
              img.onload = function () { a.el.querySelector(".ico").innerHTML = ""; a.el.querySelector(".ico").appendChild(img); };
              img.src = a.iconPath;
            }
          } else if (!a.tizentube) {
            a.el.classList.add("missing");
            a.el.querySelector(".ds").textContent = "Not found on this TV.";
          }
        });
        checks.apps = ["ok", found.length + " of " + APPS.length + " apps found: " + found.join("; ")];
        renderChecks();
      }, function (e) { checks.apps = ["no", "Could not list apps: " + e.message]; renderChecks(); });
    } catch (e) { checks.apps = ["no", "Could not list apps: " + e.message]; }
    try {
      var av = tizen.tvaudiocontrol.getVolume();
      checks.volume = ["ok", "Can read the volume: " + av];
    } catch (e) { checks.volume = ["no", "Cannot read the volume directly (" + (e.name || e.message) + ")"]; }
  } else {
    checks.apps = ["no", "Cannot list apps outside the TV"];
    checks.volume = ["no", "Cannot read the volume outside the TV"];
  }

  /* ---------- TizenTube lives inside TizenBrew: ask TizenBrew for it ---------- */
  var tbSocket = null, tizentube = null;
  function connectTizenBrew() {
    try {
      tbSocket = new WebSocket("ws://127.0.0.1:8081");
      tbSocket.onopen = function () { tbSocket.send(JSON.stringify({ type: 4 })); };
      tbSocket.onmessage = function (ev) {
        var d = JSON.parse(ev.data);
        if (d.type === 4 && d.payload) {
          for (var i = 0; i < d.payload.length; i++) {
            if (/tizentube/i.test(d.payload[i].fullName || "") || /tizentube/i.test(d.payload[i].appName || "")) { tizentube = d.payload[i]; break; }
          }
          checks.tizentube = tizentube ? ["ok", "TizenTube found: " + tizentube.fullName] : ["no", "TizenTube not in TizenBrew's module list"];
          renderChecks();
        } else if (d.type === 4 && d.payload === null) {
          setTimeout(function () { tbSocket.send(JSON.stringify({ type: 4 })); }, 600);
        }
      };
      tbSocket.onerror = function () { checks.tizentube = ["no", "Could not talk to TizenBrew"]; renderChecks(); };
    } catch (e) { checks.tizentube = ["no", "Could not talk to TizenBrew: " + e.message]; }
  }
  connectTizenBrew();

  function openApp(a) {
    say("Opening " + a.name + "...");
    if (a.tizentube && tizentube && tbSocket && tbSocket.readyState === 1) {
      try {
        (tizentube.keys || []).forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} });
        tbSocket.send(JSON.stringify({ type: 5, payload: tizentube }));
        setTimeout(function () { location.href = tizentube.appPath; }, 300);
        return;
      } catch (e) { say("Could not open TizenTube: " + e.message, true); }
    }
    if (!a.appId) {
      if (a.tizentube) {
        for (var i = 0; i < installed.length; i++) if (/^youtube$/i.test(installed[i].name)) { a.appId = installed[i].id; break; }
      }
      if (!a.appId) { say(a.name + " is not installed on this TV", true); return; }
    }
    tizen.application.launch(a.appId, function () { say("Opened " + a.name); }, function (e) { say("Could not open " + a.name + ": " + e.message, true); });
  }

  /* ---------- HDMI and volume through the TV's own remote-control channel ---------- */
  var remote = null, remoteQueue = [], remoteTried = "";
  function remoteUrl(port) {
    var name = btoa("Frame Home");
    return (port === 8002 ? "wss" : "ws") + "://127.0.0.1:" + port + "/api/v2/channels/samsung.remote.control?name=" + name;
  }
  function openRemote(port) {
    remoteTried += (remoteTried ? ", " : "") + port;
    var ws;
    try { ws = new WebSocket(remoteUrl(port)); } catch (e) { return fail(); }
    var settled = false;
    ws.onmessage = function (ev) {
      var d = {};
      try { d = JSON.parse(ev.data); } catch (e) {}
      if (d.event === "ms.channel.connect" && !settled) {
        settled = true; remote = ws;
        checks.remote = ["ok", "Remote-control channel connected on port " + port];
        renderChecks();
        while (remoteQueue.length) sendKeyNow(remoteQueue.shift());
      } else if (d.event === "ms.channel.unauthorized" && !settled) {
        settled = true;
        checks.remote = ["no", "TV refused the remote-control channel on port " + port + " (choose Allow if the TV asks)"];
        renderChecks(); say("TV said no to remote control. If a prompt appeared, choose Allow and try again", true);
      }
    };
    ws.onerror = ws.onclose = function () { if (!settled) { settled = true; fail(); } else if (remote === ws) { remote = null; } };
    function fail() {
      if (port === 8001) return openRemote(8002);
      checks.remote = ["no", "Remote-control channel not available (tried " + remoteTried + ")"];
      renderChecks(); say("This TV did not allow HDMI or volume from Frame Home", true);
    }
  }
  function sendKeyNow(k) {
    remote.send(JSON.stringify({ method: "ms.remote.control", params: { Cmd: "Click", DataOfCmd: k, Option: "false", TypeOfRemote: "SendRemoteKey" } }));
  }
  function sendKey(k, label) {
    say(label);
    if (remote && remote.readyState === 1) return sendKeyNow(k);
    remoteQueue.push(k);
    if (remoteQueue.length === 1) { remoteTried = ""; checks.remote = ["wait", "Connecting to the remote-control channel..."]; renderChecks(); openRemote(8001); }
  }

  /* ---------- Setup check panel ---------- */
  var panel = document.getElementById("panel");
  function renderChecks() {
    var ol = document.getElementById("checks");
    ol.innerHTML = "";
    ["tizen", "apps", "tizentube", "remote", "volume", "weather"].forEach(function (k) {
      var li = document.createElement("li");
      var c = checks[k];
      li.innerHTML = '<span class="' + c[0] + '">' + (c[0] === "ok" ? "OK" : c[0] === "no" ? "NO" : "...") + "</span> " + c[1].replace(/</g, "&lt;");
      ol.appendChild(li);
    });
    var li2 = document.createElement("li");
    li2.textContent = "Version 0.1.0. Screen " + window.innerWidth + " x " + window.innerHeight + ". " + installed.length + " apps installed in total.";
    ol.appendChild(li2);
  }
  renderChecks();

  /* ---------- remote navigation ---------- */
  var chips = Array.prototype.slice.call(document.querySelectorAll(".chip"));
  var focusRow = 0, appIdx = 0, chipIdx = 0;
  function paint() {
    APPS.forEach(function (a, i) {
      a.el.classList.toggle("focus", focusRow === 0 && i === appIdx);
      a.dot.classList.toggle("on", i === appIdx);
    });
    dotsLabel.textContent = (appIdx + 1) + " of " + APPS.length + (appIdx < APPS.length - 1 ? "  ·  " + APPS[APPS.length - 1].name + " is further right" : "");
    var shift = Math.max(0, Math.min(appIdx, APPS.length - 3)) * 240;
    row.style.transform = "translateX(" + (-shift) + "px)";
    chips.forEach(function (c, i) { c.classList.toggle("focus", focusRow === 1 && i === chipIdx); });
  }
  paint();

  function act() {
    if (focusRow === 0) return openApp(APPS[appIdx]);
    var id = chips[chipIdx].id;
    if (id === "hdmi") sendKey("KEY_HDMI1", "Switching to HDMI 1...");
    else if (id === "volup") sendKey("KEY_VOLUP", "Volume up");
    else if (id === "voldown") sendKey("KEY_VOLDOWN", "Volume down");
    else if (id === "check") { renderChecks(); panel.hidden = false; say("Setup check open"); }
  }

  document.addEventListener("keydown", function (e) {
    var k = e.keyCode;
    if (!panel.hidden) {
      if (k === 13 || k === 10009 || k === 27 || k === 8) { panel.hidden = true; say("Setup check closed"); e.preventDefault(); }
      return;
    }
    if (k === 37) { if (focusRow === 0) appIdx = Math.max(0, appIdx - 1); else chipIdx = Math.max(0, chipIdx - 1); }
    else if (k === 39) { if (focusRow === 0) appIdx = Math.min(APPS.length - 1, appIdx + 1); else chipIdx = Math.min(chips.length - 1, chipIdx + 1); }
    else if (k === 40) focusRow = 1;
    else if (k === 38) focusRow = 0;
    else if (k === 13) act();
    else if (k === 10009) { e.preventDefault(); say("This is home. Use the TV's Home button to leave"); }
    else return;
    e.preventDefault();
    paint();
  });

  say("Ready");
})();
