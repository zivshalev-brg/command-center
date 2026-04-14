
// ===============================================================
// CALENDAR MODULE — Full Outlook Integration
// Day / Week / Month views, Event Detail, Event Creation
// ===============================================================

// ── State defaults ──────────────────────────────────────────
if (!state.calView) state.calView = 'week';
if (!state.calDate) state.calDate = new Date().toISOString().split('T')[0];
if (!state.calSelectedEvent) state.calSelectedEvent = null;
if (!state.calCreateOpen) state.calCreateOpen = false;
if (!state.calOtherCalendars) state.calOtherCalendars = [];

// ── Data model ──────────────────────────────────────────────
if (!DATA.calendar) DATA.calendar = { events: [], calendars: [], loading: false, error: null };

// ── Encoding helper (mirrors _nEnc pattern) ─────────────────
function _calEnc(s) { return typeof s !== 'string' ? '' : s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Date helpers ────────────────────────────────────────────
function _calParseDate(str) { var p = str.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
function _calFmt(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _calDayName(d) { return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()]; }
function _calDayShort(d) { return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]; }
function _calMonthName(d) { return ['January','February','March','April','May','June','July','August','September','October','November','December'][d.getMonth()]; }
function _calIsToday(d) { var t = new Date(); return d.getFullYear()===t.getFullYear() && d.getMonth()===t.getMonth() && d.getDate()===t.getDate(); }
function _calSameDay(a, b) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }

function _calGetRange() {
  var d = _calParseDate(state.calDate);
  var start, end;
  if (state.calView === 'day') {
    start = new Date(d); end = new Date(d);
    end.setDate(end.getDate() + 1);
  } else if (state.calView === 'week') {
    start = new Date(d);
    var dow = start.getDay();
    var diff = (dow === 0) ? 6 : dow - 1; // Monday start
    start.setDate(start.getDate() - diff);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
  } else { // month
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    var startDow = start.getDay();
    var pad = (startDow === 0) ? 6 : startDow - 1;
    start.setDate(start.getDate() - pad);
    end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    var endDow = end.getDay();
    var padEnd = (endDow === 0) ? 0 : 7 - endDow;
    end.setDate(end.getDate() + padEnd + 1);
  }
  return { start: start, end: end };
}

// ── Navigation ──────────────────────────────────────────────
function _calPrev() {
  var d = _calParseDate(state.calDate);
  if (state.calView === 'day') d.setDate(d.getDate() - 1);
  else if (state.calView === 'week') d.setDate(d.getDate() - 7);
  else d.setMonth(d.getMonth() - 1);
  state.calDate = _calFmt(d);
  state.calSelectedEvent = null;
  loadCalendarData();
  renderAll();
}

function _calNext() {
  var d = _calParseDate(state.calDate);
  if (state.calView === 'day') d.setDate(d.getDate() + 1);
  else if (state.calView === 'week') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  state.calDate = _calFmt(d);
  state.calSelectedEvent = null;
  loadCalendarData();
  renderAll();
}

function _calToday() {
  state.calDate = new Date().toISOString().split('T')[0];
  state.calSelectedEvent = null;
  loadCalendarData();
  renderAll();
}

function _calSetView(v) {
  state.calView = v;
  state.calSelectedEvent = null;
  loadCalendarData();
  renderAll();
}

function _calSelectDate(dateStr) {
  state.calDate = dateStr;
  state.calSelectedEvent = null;
  loadCalendarData();
  renderAll();
}

function _calSelectEvent(ev) {
  state.calSelectedEvent = ev;
  renderAll();
}

function _calOpenCreate(dateStr, timeStr) {
  state.calCreateOpen = true;
  state._calCreateDate = dateStr || state.calDate;
  state._calCreateTime = timeStr || '09:00';
  renderAll();
}

function _calCloseCreate() {
  state.calCreateOpen = false;
  renderAll();
}

// ── Data loading ────────────────────────────────────────────
function loadCalendarData(start, end) {
  var range = _calGetRange();
  var s = start || _calFmt(range.start);
  var e = end || _calFmt(range.end);
  DATA.calendar.loading = true;
  DATA.calendar.error = null;
  if (state.module === 'calendar') renderAll();

  fetch('/api/calendar?start=' + encodeURIComponent(s) + '&end=' + encodeURIComponent(e))
    .then(function(r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function(data) {
      if (data.error && !data.events) throw new Error(data.error);
      var events = [];
      var evMap = data.events || {};
      for (var dateKey in evMap) {
        if (!evMap.hasOwnProperty(dateKey)) continue;
        var dayEvs = evMap[dateKey];
        for (var i = 0; i < dayEvs.length; i++) {
          var ev = dayEvs[i];
          events.push({
            id: ev.id || '',
            subject: ev.subject || '(No title)',
            start: dateKey + 'T' + (ev.time || '00:00'),
            end: dateKey + 'T' + (ev.endTime || '00:00'),
            startDate: dateKey,
            startTime: ev.time || '',
            endTime: ev.endTime || '',
            isAllDay: ev.isAllDay || false,
            location: ev.location || '',
            organizer: ev.organizer || '',
            organizerEmail: ev.organizerEmail || '',
            attendees: ev.attendees || [],
            categories: ev.categories || [],
            showAs: ev.showAs || 'busy',
            importance: ev.importance || 'normal',
            isRecurring: ev.isRecurring || false,
            webLink: ev.webLink || '',
            onlineMeetingUrl: ev.onlineMeetingUrl || '',
            bodyPreview: ev.bodyPreview || '',
            body: ev.body || '',
            hasAttachments: ev.hasAttachments || false
          });
        }
      }
      DATA.calendar = { events: events, calendars: DATA.calendar.calendars, loading: false, error: null };
      // Also update legacy DATA.comms.days for summary tab compatibility
      _calUpdateLegacyDays(evMap);
      if (state.module === 'calendar' || state.module === 'summary') renderAll();
    })
    .catch(function(err) {
      DATA.calendar.loading = false;
      DATA.calendar.error = err.message;
      if (state.module === 'calendar') renderAll();
    });
}

function _calUpdateLegacyDays(evMap) {
  var days = DATA.comms.days;
  for (var i = 0; i < days.length; i++) {
    var dateKey = days[i].date;
    var dayEvents = evMap[dateKey] || [];
    if (dayEvents.length === 0) {
      days[i].events = [{ t: '', title: 'No events', meta: '', hl: false, live: true }];
    } else {
      days[i].events = dayEvents.map(function(ev) {
        var isKey = ev.importance === 'high' || (ev.attendees && ev.attendees.length > 8);
        var meta = '';
        if (ev.organizer) meta += ev.organizer;
        if (ev.location) meta += (meta ? ' \u2014 ' : '') + ev.location;
        if (ev.attendees && ev.attendees.length > 1) meta += (meta ? ' \u00b7 ' : '') + ev.attendees.length + ' attendees';
        return { t: ev.time || '', endTime: ev.endTime || '', title: ev.subject || '(No title)', meta: meta, hl: isKey, live: true, id: ev.id,
          location: ev.location, organizer: ev.organizer, organizerEmail: ev.organizerEmail, attendees: ev.attendees,
          isAllDay: ev.isAllDay, showAs: ev.showAs, webLink: ev.webLink, categories: ev.categories, isRecurring: ev.isRecurring };
      });
    }
  }
}

function loadCalendarList() {
  fetch('/api/calendar/calendars')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      DATA.calendar.calendars = data.calendars || [];
      if (state.module === 'calendar') renderAll();
    })
    .catch(function() {});
}

function loadOtherCalendar(userId, start, end) {
  var range = _calGetRange();
  var s = start || _calFmt(range.start);
  var e = end || _calFmt(range.end);
  fetch('/api/calendar/other/' + encodeURIComponent(userId) + '?start=' + encodeURIComponent(s) + '&end=' + encodeURIComponent(e))
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var found = false;
      for (var i = 0; i < state.calOtherCalendars.length; i++) {
        if (state.calOtherCalendars[i].userId === userId) { state.calOtherCalendars[i].events = data.events || {}; found = true; break; }
      }
      if (!found) state.calOtherCalendars.push({ userId: userId, events: data.events || {} });
      if (state.module === 'calendar') renderAll();
    })
    .catch(function() {});
}

// ── Events for a date ───────────────────────────────────────
function _calEventsForDate(dateStr) {
  var evs = DATA.calendar.events || [];
  var result = [];
  for (var i = 0; i < evs.length; i++) {
    if (evs[i].startDate === dateStr) result.push(evs[i]);
  }
  result.sort(function(a, b) {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });
  return result;
}

// ── Sidebar ─────────────────────────────────────────────────
function renderCalendarSidebar() {
  var sb = $('sidebar');
  if (!DATA.calendar.events.length && !DATA.calendar.loading) loadCalendarData();
  if (!DATA.calendar.calendars.length) loadCalendarList();

  var html = '<div class="cal-sb">';

  // Mini month
  html += _calRenderMiniMonth();

  // View toggle
  html += '<div class="cal-view-toggle">';
  var views = ['day', 'week', 'month'];
  for (var i = 0; i < views.length; i++) {
    var v = views[i];
    html += '<button class="cal-view-btn' + (state.calView === v ? ' active' : '') + '" onclick="_calSetView(\'' + v + '\')">' + v.charAt(0).toUpperCase() + v.slice(1) + '</button>';
  }
  html += '</div>';

  // Today button
  html += '<button class="cal-today-btn" onclick="_calToday()">Today</button>';

  // New Event button
  html += '<button class="cal-new-btn" onclick="_calOpenCreate()">+ New Event</button>';

  // My Calendars
  var cals = DATA.calendar.calendars || [];
  if (cals.length > 0) {
    html += '<div class="sb-section"><div class="sb-section-title">My Calendars</div>';
    for (var c = 0; c < cals.length; c++) {
      var cal = cals[c];
      var color = cal.color || 'var(--ac)';
      html += '<div class="cal-cal-item"><span class="cal-cal-dot" style="background:' + color + '"></span><span class="sb-label">' + _calEnc(cal.name || cal.id) + '</span></div>';
    }
    html += '</div>';
  }

  // Other Calendars
  html += '<div class="sb-section"><div class="sb-section-title">Other Calendars</div>';
  for (var o = 0; o < state.calOtherCalendars.length; o++) {
    html += '<div class="cal-cal-item"><span class="cal-cal-dot" style="background:var(--cy)"></span><span class="sb-label">' + _calEnc(state.calOtherCalendars[o].userId) + '</span></div>';
  }
  html += '<div style="padding:var(--sp1) 0"><input class="cal-add-input" placeholder="Add by email..." onkeydown="if(event.key===\'Enter\'){_calAddOtherCal(this.value);this.value=\'\';}" /></div>';
  html += '</div>';

  // Refresh
  html += '<button class="cal-today-btn" style="margin-top:auto" onclick="loadCalendarData()">' + (DATA.calendar.loading ? 'Refreshing...' : 'Refresh Calendar') + '</button>';

  html += '</div>';
  sb.innerHTML = html;
}

function _calAddOtherCal(email) {
  if (!email || email.indexOf('@') < 0) return;
  loadOtherCalendar(email);
}

function _calRenderMiniMonth() {
  var cur = _calParseDate(state.calDate);
  var year = cur.getFullYear();
  var month = cur.getMonth();
  var first = new Date(year, month, 1);
  var startDow = first.getDay();
  var pad = (startDow === 0) ? 6 : startDow - 1;
  var daysInMonth = new Date(year, month + 1, 0).getDate();
  var today = new Date();

  var html = '<div class="cal-mini-month">';
  html += '<div class="cal-mini-header">';
  html += '<span class="cal-mini-nav" onclick="var d=_calParseDate(state.calDate);d.setMonth(d.getMonth()-1);state.calDate=_calFmt(d);renderCalendarSidebar()">&lt;</span>';
  html += '<span class="cal-mini-title">' + _calMonthName(cur) + ' ' + year + '</span>';
  html += '<span class="cal-mini-nav" onclick="var d=_calParseDate(state.calDate);d.setMonth(d.getMonth()+1);state.calDate=_calFmt(d);renderCalendarSidebar()">&gt;</span>';
  html += '</div>';

  html += '<div class="cal-mini-grid">';
  var dayHeaders = ['Mo','Tu','We','Th','Fr','Sa','Su'];
  for (var h = 0; h < 7; h++) {
    html += '<span class="cal-mini-dh">' + dayHeaders[h] + '</span>';
  }

  // Blank cells
  for (var b = 0; b < pad; b++) html += '<span class="cal-mini-blank"></span>';

  for (var d = 1; d <= daysInMonth; d++) {
    var dt = new Date(year, month, d);
    var iso = _calFmt(dt);
    var cls = 'cal-mini-day';
    if (iso === state.calDate) cls += ' selected';
    if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) cls += ' today';
    // Check if has events
    var hasEvs = false;
    for (var e = 0; e < DATA.calendar.events.length; e++) {
      if (DATA.calendar.events[e].startDate === iso) { hasEvs = true; break; }
    }
    if (hasEvs) cls += ' has-events';
    html += '<span class="' + cls + '" onclick="_calSelectDate(\'' + iso + '\')">' + d + '</span>';
  }

  html += '</div></div>';
  return html;
}

// ── Main ────────────────────────────────────────────────────
function renderCalendarMain() {
  var el = $('main');

  if (DATA.calendar.loading && DATA.calendar.events.length === 0) {
    el.innerHTML = '<div style="padding:var(--sp8);text-align:center;color:var(--tx3)">Loading calendar...</div>';
    return;
  }

  var html = '';

  if (DATA.calendar.error) {
    html += '<div class="toast warn" style="margin-bottom:var(--sp4)">Calendar sync error: ' + _calEnc(DATA.calendar.error) + '</div>';
  }

  // Dispatch to view
  if (state.calView === 'day') html += _calRenderDay();
  else if (state.calView === 'week') html += _calRenderWeek();
  else html += _calRenderMonth();

  el.innerHTML = html;

  // Detail panel overlay
  if (state.calSelectedEvent) {
    var ev = state.calSelectedEvent;
    var detailHtml = _calRenderDetail(ev);
    openPanel(_calEnc(ev.subject).slice(0, 50), detailHtml);
  }

  // Create form overlay
  if (state.calCreateOpen) {
    var createHtml = _calRenderCreateForm();
    openPanel('New Event', createHtml);
  }
}
