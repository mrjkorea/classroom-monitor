/**
 * MRJ Classroom Monitor web app — 2026-10-23a
 * Sheet: "MRJ Classroom Monitor" (separate from MRJ Student Progress; never touches it).
 * Seats POST {type:"hb"|"alert"|"batch", secret, ...}. Teacher page POSTs
 * {action:"teacher_view", id, token, date} and is verified against mrj-signin (role teacher).
 * Script Properties: MONITOR_SHEET_ID, MRJ_MONITOR_SEAT_SECRET.
 */
var MON_VERSION = "2026-10-23a";
var SIGNIN_ENDPOINT = "https://script.google.com/macros/s/AKfycbwtJTUO3gbcMrlAwsn1feWxyp7Rw2cxpfe1bOT9v2rxmQHa2Tlc6pFNWAjU6ZAdlD6kFQ/exec";
var DEFAULT_SHEET_ID = "1iVyJVOAbNKSgz_v9yJPnIFgpCZ9Owl4I2YzhMnrHhZo";
var TZ = "Asia/Seoul";
var SEAT_H = ["seat","last_iso","status","reason","student","url","title","ver","last_alert_iso","last_alert_kind","last_alert_url","last_ts"];
var ALERT_H = ["iso","date","seat","student","kind","status","reason","url","title","ver"];
var DAILY_H = ["date","student","seat","off_min","alerts","first_iso","last_iso","sites"];

function props_() { return PropertiesService.getScriptProperties(); }
function ss_() { return SpreadsheetApp.openById(props_().getProperty("MONITOR_SHEET_ID") || DEFAULT_SHEET_ID); }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function tab_(name, header) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); }
  return sh;
}
function nowIso_(ts) { return Utilities.formatDate(ts ? new Date(ts * 1000) : new Date(), TZ, "yyyy-MM-dd'T'HH:mm:ss"); }
function day_(ts) { return Utilities.formatDate(ts ? new Date(ts * 1000) : new Date(), TZ, "yyyy-MM-dd"); }
function s_(v, n) { v = v == null ? "" : String(v); v = v.replace(/^[=+\-@]/, "'$&"); return v.slice(0, n || 300); }
function host_(u) { var m = String(u || "").match(/^https?:\/\/([^\/?#]+)/i); return m ? m[1].toLowerCase() : ""; }

/** Run once from the editor: makes tabs and stores the sheet id. */
function setup() {
  props_().setProperty("MONITOR_SHEET_ID", props_().getProperty("MONITOR_SHEET_ID") || DEFAULT_SHEET_ID);
  var ss = ss_();
  var first = ss.getSheets()[0];
  if (first.getName() !== "Seats") first.setName("Seats");
  var sh = tab_("Seats", SEAT_H);
  sh.getRange(1, 1, 1, SEAT_H.length).setValues([SEAT_H]);
  tab_("Alerts", ALERT_H); tab_("Daily", DAILY_H);
  if (!props_().getProperty("MRJ_MONITOR_SEAT_SECRET")) Logger.log("Set Script Property MRJ_MONITOR_SEAT_SECRET");
  Logger.log("ok " + ss.getUrl());
}

function doGet() { return json_({ status: "ok", app: "mrj-classroom-monitor", version: MON_VERSION }); }

function doPost(e) {
  try {
    var b = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (b.action === "teacher_view") return json_(teacherView_(b));
    var sec = props_().getProperty("MRJ_MONITOR_SEAT_SECRET");
    if (!sec || b.secret !== sec) return json_({ ok: false, error: "bad_secret" });
    var items = b.type === "batch" ? (b.items || []) : [b];
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { items.forEach(ingest_); } finally { lock.releaseLock(); }
    return json_({ ok: true, n: items.length });
  } catch (err) {
    return json_({ ok: false, error: "server", message: String(err).slice(0, 120) });
  }
}

function ingest_(r) {
  var seat = s_(r.seat, 20); if (!/^[\w-]+$/.test(seat)) return;
  var ts = Number(r.ts) || Date.now() / 1000;
  var iso = nowIso_(ts), date = day_(ts), student = s_(r.student, 60);
  var seats = tab_("Seats", SEAT_H), vals = seats.getDataRange().getValues(), row = -1;
  for (var i = 1; i < vals.length; i++) if (String(vals[i][0]) === seat) { row = i + 1; break; }
  var cur = row > 0 ? vals[row - 1] : [seat, "", "", "", "", "", "", "", "", "", "", 0];
  if (r.type === "hb") {
    if (Number(cur[11]) > ts) return; // older queued beat
    cur = [seat, iso, s_(r.status, 10), s_(r.reason, 120), student, s_(r.url, 300), s_(r.title, 180), s_(r.ver, 20), cur[8], cur[9], cur[10], ts];
    if (Number(r.off_s) > 0 || student) daily_(date, student, seat, Number(r.off_s) || 0, 0, iso, "");
  } else if (r.type === "alert") {
    tab_("Alerts", ALERT_H).appendRow([iso, date, seat, student, s_(r.kind, 30), s_(r.status, 10), s_(r.reason, 120), s_(r.url, 300), s_(r.title, 180), s_(r.ver, 20)]);
    if (ts >= Number(cur[11] || 0) - 600) { cur[8] = iso; cur[9] = s_(r.kind, 30); cur[10] = s_(r.url, 300); }
    if (Date.now() / 1000 - ts < 180) { cur[2] = "red"; cur[3] = "alert:" + s_(r.kind, 30); }
    daily_(date, student, seat, 0, 1, iso, host_(r.url) || s_(r.title, 40));
  } else return;
  if (row > 0) seats.getRange(row, 1, 1, SEAT_H.length).setValues([cur]);
  else seats.appendRow(cur);
}

function daily_(date, student, seat, offS, alerts, iso, site) {
  var sh = tab_("Daily", DAILY_H), v = sh.getDataRange().getValues(), key = student || "(not signed in)";
  for (var i = v.length - 1; i >= 1 && i >= v.length - 400; i--) {
    var d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], TZ, "yyyy-MM-dd") : String(v[i][0]);
    if (d === date && String(v[i][1]) === key && String(v[i][2]) === seat) {
      var sites = String(v[i][7] || ""); if (site && sites.split(", ").indexOf(site) < 0) sites = (sites ? sites + ", " : "") + site;
      sh.getRange(i + 1, 4, 1, 5).setValues([[Math.round((Number(v[i][3]) + offS / 60) * 10) / 10, Number(v[i][4]) + alerts, v[i][5], iso, sites.slice(0, 400)]]);
      return;
    }
  }
  if (!offS && !alerts) { sh.appendRow(["'" + date, key, seat, 0, 0, iso, iso, ""]); return; }
  sh.appendRow(["'" + date, key, seat, Math.round(offS / 6) / 10, alerts, iso, iso, site || ""]);
}

function isTeacher_(id, token) {
  if (!id || !token) return false;
  var key = "t_" + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, id + "|" + token));
  var c = CacheService.getScriptCache(); if (c.get(key) === "1") return true;
  var res = UrlFetchApp.fetch(SIGNIN_ENDPOINT, { method: "post", contentType: "text/plain;charset=utf-8", muteHttpExceptions: true,
    payload: JSON.stringify({ action: "progress", id: id, token: token, program: "classroom-monitor", limit: 1 }) });
  var d = {}; try { d = JSON.parse(res.getContentText()); } catch (e) {}
  var ok = !!(d && d.ok && d.role === "teacher");
  if (ok) c.put(key, "1", 900); else Utilities.sleep(800);
  return ok;
}

function rows_(name) {
  var sh = ss_().getSheetByName(name); if (!sh || sh.getLastRow() < 2) return [];
  var v = sh.getDataRange().getDisplayValues(), h = v[0];
  return v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
}

function teacherView_(b) {
  if (!isTeacher_(String(b.id || ""), String(b.token || ""))) return { ok: false, error: "not_teacher" };
  var date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : day_();
  var now = Date.now() / 1000;
  var seats = rows_("Seats").map(function (s) { s.age_s = Math.round(now - Number(s.last_ts || 0)); delete s.last_ts; return s; });
  var alerts = rows_("Alerts").filter(function (a) { return a.date === date; }).slice(-200).reverse();
  var daily = rows_("Daily").filter(function (d) { return d.date === date; });
  return { ok: true, version: MON_VERSION, date: date, now: nowIso_(), seats: seats, alerts: alerts, daily: daily };
}

/** Optional editor test: writes a zz_test heartbeat for seat zz_test. */
function testHeartbeat() {
  ingest_({ type: "hb", seat: "zz_test", ts: Date.now() / 1000, status: "green", reason: "editor test", student: "zz_test_monitor", url: "https://mrjkorea.github.io/", title: "test", ver: MON_VERSION });
}
