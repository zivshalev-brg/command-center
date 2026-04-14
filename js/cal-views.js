
// ===============================================================
// CAL-VIEWS.JS — Day / Week / Month Rendering
// ===============================================================

var _calHourStart = 7;
var _calHourEnd = 21;
var _calHourH = 60; // px per hour

// ── Shared: Event Block ─────────────────────────────────────
function _calEventBlock(ev, opts) {
  opts = opts || {};
  var w = opts.width || '100%';
  var compact = opts.compact || false;
  var catColor = 'var(--ac)';
  if (ev.categories && ev.categories.length > 0) {
    var cat = ev.categories[0].toLowerCase();
    if (cat.indexOf('red') >= 0) catColor = 'var(--rd)';
    else if (cat.indexOf('orange') >= 0) catColor = 'var(--or)';
    else if (cat.indexOf('green') >= 0) catColor = 'var(--gn)';
    else if (cat.indexOf('purple') >= 0) catColor = 'var(--pu)';
    else if (cat.indexOf('blue') >= 0) catColor = 'var(--cy)';
  }
  if (ev.showAs === 'tentative') catColor = 'var(--or)';
  if (ev.importance === 'high') catColor = 'var(--rd)';

  var timeStr = '';
  if (!ev.isAllDay && ev.startTime) {
    timeStr = ev.startTime;
    if (ev.endTime) timeStr += ' \u2013 ' + ev.endTime;
  }
  if (ev.isAllDay) timeStr = 'All day';

  var meetIcon = '';
  if (ev.onlineMeetingUrl) meetIcon = ' <span title="Online meeting" style="opacity:.7">&#128247;</span>';
  var attBadge = '';
  if (ev.attendees && ev.attendees.length > 1) attBadge = ' <span class="cal-att-badge">' + ev.attendees.length + '</span>';

  var title = _calEnc(ev.subject);
  if (compact && title.length > 28) title = title.slice(0, 26) + '...';

  var html = '<div class="cal-event-block" style="border-left-color:' + catColor + ';width:' + w + '"' +
    ' onclick="event.stopPropagation();_calSelectEvent(DATA.calendar.events.filter(function(e){return e.id===\'' + _calEnc(ev.id) + '\';})[0] || null)">';
  if (!compact) {
    html += '<div class="cal-ev-time">' + timeStr + meetIcon + attBadge + '</div>';
  }
  html += '<div class="cal-ev-title">' + title + '</div>';
  if (compact && timeStr) html += '<div class="cal-ev-time">' + timeStr + '</div>';
  html += '</div>';
  return html;
}

// ── Time Grid (shared by day & week) ────────────────────────
function _calTimeLabels() {
  var html = '';
  for (var h = _calHourStart; h <= _calHourEnd; h++) {
    var label = h < 10 ? '0' + h + ':00' : h + ':00';
    html += '<div class="cal-time-label" style="height:' + _calHourH + 'px">' + label + '</div>';
  }
  return html;
}

function _calHourRows() {
  var html = '';
  for (var h = _calHourStart; h <= _calHourEnd; h++) {
    html += '<div class="cal-hour-row" style="height:' + _calHourH + 'px"></div>';
  }
  return html;
}

function _calNowLine() {
  var now = new Date();
  var h = now.getHours();
  var m = now.getMinutes();
  if (h < _calHourStart || h > _calHourEnd) return '';
  var top = (h - _calHourStart) * _calHourH + (m / 60) * _calHourH;
  return '<div class="cal-now-line" style="top:' + top + 'px"></div>';
}

function _calPositionEvent(ev, dateStr) {
  if (ev.isAllDay) return null;
  var parts = (ev.startTime || '00:00').split(':');
  var sh = parseInt(parts[0], 10);
  var sm = parseInt(parts[1] || '0', 10);
  var eParts = (ev.endTime || ev.startTime || '00:00').split(':');
  var eh = parseInt(eParts[0], 10);
  var em = parseInt(eParts[1] || '0', 10);
  if (sh < _calHourStart) { sh = _calHourStart; sm = 0; }
  if (eh > _calHourEnd + 1) { eh = _calHourEnd + 1; em = 0; }
  var top = (sh - _calHourStart) * _calHourH + (sm / 60) * _calHourH;
  var durMin = (eh * 60 + em) - (sh * 60 + sm);
  if (durMin < 15) durMin = 15;
  var height = (durMin / 60) * _calHourH;
  return { top: top, height: height };
}

// ── DAY VIEW ────────────────────────────────────────────────
function _calRenderDay() {
  var d = _calParseDate(state.calDate);
  var dateStr = state.calDate;
  var evs = _calEventsForDate(dateStr);
  var allDay = evs.filter(function(e) { return e.isAllDay; });
  var timed = evs.filter(function(e) { return !e.isAllDay; });
  var todayTag = _calIsToday(d) ? ' <span class="tag act" style="font-size:11px;vertical-align:middle">Today</span>' : '';

  var html = '<div class="cal-view-header">';
  html += '<button class="cal-nav-btn" onclick="_calPrev()">&lt;</button>';
  html += '<h2 class="cal-view-title">' + _calDayName(d) + ', ' + d.getDate() + ' ' + _calMonthName(d) + ' ' + d.getFullYear() + todayTag + '</h2>';
  html += '<button class="cal-nav-btn" onclick="_calNext()">&gt;</button>';
  html += '</div>';

  // All-day bar
  if (allDay.length > 0) {
    html += '<div class="cal-allday-bar">';
    html += '<span class="cal-allday-label">All day</span>';
    for (var a = 0; a < allDay.length; a++) html += _calEventBlock(allDay[a], { compact: true });
    html += '</div>';
  }

  // Time grid
  var gridH = (_calHourEnd - _calHourStart + 1) * _calHourH;
  html += '<div class="cal-day-grid">';
  html += '<div class="cal-time-col">' + _calTimeLabels() + '</div>';
  html += '<div class="cal-day-col" style="height:' + gridH + 'px" onclick="_calDaySlotClick(event, \'' + dateStr + '\')">';
  html += _calHourRows();

  // Now line
  if (_calIsToday(d)) html += _calNowLine();

  // Positioned events
  for (var t = 0; t < timed.length; t++) {
    var pos = _calPositionEvent(timed[t], dateStr);
    if (!pos) continue;
    html += '<div class="cal-ev-positioned" style="top:' + pos.top + 'px;height:' + pos.height + 'px">';
    html += _calEventBlock(timed[t]);
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}

function _calDaySlotClick(evt, dateStr) {
  // Calculate hour from click position
  var rect = evt.currentTarget.getBoundingClientRect();
  var y = evt.clientY - rect.top;
  var hour = Math.floor(y / _calHourH) + _calHourStart;
  if (hour < _calHourStart) hour = _calHourStart;
  if (hour > _calHourEnd) hour = _calHourEnd;
  var timeStr = (hour < 10 ? '0' + hour : '' + hour) + ':00';
  _calOpenCreate(dateStr, timeStr);
}

// ── WEEK VIEW ───────────────────────────────────────────────
function _calRenderWeek() {
  var d = _calParseDate(state.calDate);
  var dow = d.getDay();
  var mondayDiff = (dow === 0) ? 6 : dow - 1;
  var mon = new Date(d);
  mon.setDate(d.getDate() - mondayDiff);
  var sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  var html = '<div class="cal-view-header">';
  html += '<button class="cal-nav-btn" onclick="_calPrev()">&lt;</button>';
  html += '<h2 class="cal-view-title">Week of ' + mon.getDate() + ' ' + _calMonthName(mon).slice(0, 3) + ' \u2014 ' + sun.getDate() + ' ' + _calMonthName(sun).slice(0, 3) + ' ' + sun.getFullYear() + '</h2>';
  html += '<button class="cal-nav-btn" onclick="_calNext()">&gt;</button>';
  html += '</div>';

  // Column headers
  html += '<div class="cal-week-header"><div class="cal-time-col-h"></div>';
  var weekDates = [];
  for (var i = 0; i < 7; i++) {
    var wd = new Date(mon);
    wd.setDate(mon.getDate() + i);
    weekDates.push(wd);
    var isToday = _calIsToday(wd);
    html += '<div class="cal-week-col-h' + (isToday ? ' today' : '') + '">';
    html += '<span class="cal-wch-day">' + _calDayShort(wd) + '</span>';
    html += '<span class="cal-wch-num' + (isToday ? ' today' : '') + '">' + wd.getDate() + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // All-day row
  var hasAllDay = false;
  for (var ai = 0; ai < 7; ai++) {
    var aEvs = _calEventsForDate(_calFmt(weekDates[ai])).filter(function(e) { return e.isAllDay; });
    if (aEvs.length > 0) { hasAllDay = true; break; }
  }
  if (hasAllDay) {
    html += '<div class="cal-week-allday"><div class="cal-time-col-h"><span class="cal-allday-label">All day</span></div>';
    for (var ad = 0; ad < 7; ad++) {
      var adEvs = _calEventsForDate(_calFmt(weekDates[ad])).filter(function(e) { return e.isAllDay; });
      html += '<div class="cal-week-allday-cell">';
      for (var ae = 0; ae < adEvs.length; ae++) html += _calEventBlock(adEvs[ae], { compact: true });
      html += '</div>';
    }
    html += '</div>';
  }

  // Time grid
  var gridH = (_calHourEnd - _calHourStart + 1) * _calHourH;
  html += '<div class="cal-week-grid" style="height:' + (gridH + 2) + 'px">';
  html += '<div class="cal-time-col">' + _calTimeLabels() + '</div>';

  for (var c = 0; c < 7; c++) {
    var colDate = _calFmt(weekDates[c]);
    var colEvs = _calEventsForDate(colDate).filter(function(e) { return !e.isAllDay; });
    var isColToday = _calIsToday(weekDates[c]);

    html += '<div class="cal-week-col' + (isColToday ? ' today' : '') + '" onclick="_calDaySlotClick(event, \'' + colDate + '\')">';
    html += _calHourRows();
    if (isColToday) html += _calNowLine();

    for (var ce = 0; ce < colEvs.length; ce++) {
      var cPos = _calPositionEvent(colEvs[ce], colDate);
      if (!cPos) continue;
      html += '<div class="cal-ev-positioned" style="top:' + cPos.top + 'px;height:' + cPos.height + 'px">';
      html += _calEventBlock(colEvs[ce], { compact: true });
      html += '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── MONTH VIEW ──────────────────────────────────────────────
function _calRenderMonth() {
  var d = _calParseDate(state.calDate);
  var year = d.getFullYear();
  var month = d.getMonth();

  var html = '<div class="cal-view-header">';
  html += '<button class="cal-nav-btn" onclick="_calPrev()">&lt;</button>';
  html += '<h2 class="cal-view-title">' + _calMonthName(d) + ' ' + year + '</h2>';
  html += '<button class="cal-nav-btn" onclick="_calNext()">&gt;</button>';
  html += '</div>';

  // Day headers
  html += '<div class="cal-month-grid">';
  var dayHeaders = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  for (var h = 0; h < 7; h++) {
    html += '<div class="cal-month-dh">' + dayHeaders[h] + '</div>';
  }

  // Compute grid start (Monday before month start)
  var first = new Date(year, month, 1);
  var startDow = first.getDay();
  var pad = (startDow === 0) ? 6 : startDow - 1;
  var gridStart = new Date(first);
  gridStart.setDate(first.getDate() - pad);

  // Render 6 weeks (42 cells)
  var today = new Date();
  for (var c = 0; c < 42; c++) {
    var cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + c);
    var cellStr = _calFmt(cellDate);
    var isOtherMonth = cellDate.getMonth() !== month;
    var isToday = _calIsToday(cellDate);
    var isSelected = cellStr === state.calDate;

    var cls = 'cal-month-cell';
    if (isOtherMonth) cls += ' other';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';

    var cellEvs = _calEventsForDate(cellStr);
    html += '<div class="' + cls + '" onclick="_calSelectDate(\'' + cellStr + '\');_calSetView(\'day\')">';
    html += '<div class="cal-mc-num">' + cellDate.getDate() + '</div>';

    var maxShow = 3;
    for (var e = 0; e < Math.min(cellEvs.length, maxShow); e++) {
      var ev = cellEvs[e];
      var catColor = 'var(--ac)';
      if (ev.showAs === 'tentative') catColor = 'var(--or)';
      if (ev.importance === 'high') catColor = 'var(--rd)';
      var tTitle = _calEnc(ev.subject);
      if (tTitle.length > 18) tTitle = tTitle.slice(0, 16) + '...';
      html += '<div class="cal-mc-ev" style="border-left-color:' + catColor + '" onclick="event.stopPropagation();_calSelectEvent(DATA.calendar.events.filter(function(x){return x.id===\'' + _calEnc(ev.id) + '\';})[0])">' + tTitle + '</div>';
    }
    if (cellEvs.length > maxShow) {
      html += '<div class="cal-mc-more" onclick="event.stopPropagation();_calSelectDate(\'' + cellStr + '\');_calSetView(\'day\')">+' + (cellEvs.length - maxShow) + ' more</div>';
    }

    html += '</div>';
  }

  html += '</div>';
  return html;
}
