(function () {
  "use strict";
  var SEATS = ["mrj1","mrj2","mrj3","mrj4","mrj5","mrj6","mrj7","mrj8"];
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); };
  var today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  $("date").value = today;
  var timer = null, view = "live";
  function api() { return window.MRJSignin || window.MRJ_AUTH; }
  function sid() { var a = api(); try { var s = a.student && a.student(); return s && (s.id || s) || ""; } catch (e) { return ""; } }
  function teacher() { var a = api(); return !!(a && a.isTeacher && a.isTeacher()); }
  function call(date) {
    if (!window.MRJ_MONITOR_ENDPOINT) return Promise.resolve({ ok: false, error: "endpoint_not_set" });
    return fetch(window.MRJ_MONITOR_ENDPOINT, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "teacher_view", id: String(sid()), token: api().token(), date: date }) }).then(function (r) { return r.json(); });
  }
  function ago(s) { s = Number(s); if (!isFinite(s)) return "?"; return s < 90 ? s + "s" : s < 5400 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h"; }
  function renderLive(d) {
    var by = {}; (d.seats || []).forEach(function (s) { by[s.seat] = s; });
    $("grid").innerHTML = SEATS.map(function (n) {
      var s = by[n], cls = !s ? "grey" : (Number(s.age_s) > 180 ? "grey" : (s.status || "grey"));
      var host = s && s.url ? s.url.replace(/^https?:\/\//, "").split("/")[0] : "";
      return '<div class="seat ' + esc(cls) + '"><b>' + n.replace("mrj", "PC ") + '</b> <span class="s">' + esc(s && s.student || "—") + "</span>" +
        "<small>" + (s ? (cls === "grey" ? "offline " + ago(s.age_s) : esc(s.reason || "ok") + " · " + esc(host)) : "no data") + "</small>" +
        (s && s.last_alert_iso ? "<small>last alert: " + esc(s.last_alert_kind) + " " + esc(s.last_alert_iso.slice(11, 16)) + "</small>" : "") + "</div>";
    }).join("");
  }
  function renderDay(d) {
    var rows = (d.daily || []).slice().sort(function (a, b) { return Number(b.off_min) - Number(a.off_min); });
    $("dtab").innerHTML = "<tr><th>Student</th><th>PC</th><th>Off-task min</th><th>Alerts</th><th>Time</th><th>Sites</th></tr>" + rows.map(function (r) {
      return "<tr><td>" + esc(r.student) + "</td><td>" + esc(r.seat) + "</td><td>" + esc(r.off_min) + "</td><td>" + esc(r.alerts) + "</td><td>" +
        esc(String(r.first_iso).slice(11, 16)) + "–" + esc(String(r.last_iso).slice(11, 16)) + "</td><td>" + esc(r.sites) + "</td></tr>";
    }).join("");
    $("atab").innerHTML = "<tr><th>Time</th><th>PC</th><th>Student</th><th>Kind</th><th>Site</th></tr>" + (d.alerts || []).map(function (a) {
      return "<tr><td>" + esc(String(a.iso).slice(11, 16)) + "</td><td>" + esc(a.seat) + "</td><td>" + esc(a.student) + "</td><td>" + esc(a.kind) + "</td><td>" + esc(a.url || a.title) + "</td></tr>";
    }).join("");
  }
  function tick() {
    if (!teacher()) { $("app").className = "hide"; $("gate").className = ""; return; }
    $("gate").className = "hide"; $("app").className = "";
    var date = view === "day" ? $("date").value : today;
    call(date).then(function (d) {
      if (!d.ok) { $("meta").textContent = "error: " + (d.error || "?"); return; }
      $("meta").textContent = "updated " + String(d.now).slice(11, 19);
      renderLive(d); renderDay(d);
    }).catch(function () { $("meta").textContent = "network error"; });
  }
  $("tLive").onclick = function () { view = "live"; $("tLive").className = "on"; $("tDay").className = ""; $("live").className = ""; $("day").className = "hide"; tick(); };
  $("tDay").onclick = function () { view = "day"; $("tDay").className = "on"; $("tLive").className = ""; $("day").className = ""; $("live").className = "hide"; tick(); };
  $("date").onchange = tick;
  document.addEventListener("mrj-teacher", tick);
  setInterval(tick, 15000); setTimeout(tick, 1500); setTimeout(tick, 5000);
})();
