
// ===============================================================
// CAL-DETAIL.JS — Event Detail Panel
// ===============================================================

function _calRenderDetail(ev) {
  if (!ev) return '';
  var html = '<div class="cal-detail">';

  // Title
  html += '<h3 class="cal-det-title">' + _calEnc(ev.subject) + '</h3>';

  // Date/time range with duration
  var dtRange = '';
  if (ev.isAllDay) {
    dtRange = 'All day \u2014 ' + _calEnc(ev.startDate);
  } else {
    var d = _calParseDate(ev.startDate);
    dtRange = _calDayName(d) + ', ' + d.getDate() + ' ' + _calMonthName(d) + ' ' + d.getFullYear();
    if (ev.startTime) dtRange += ' \u00b7 ' + ev.startTime;
    if (ev.endTime) dtRange += ' \u2013 ' + ev.endTime;
    // Duration
    var dur = _calCalcDuration(ev.startTime, ev.endTime);
    if (dur) dtRange += ' (' + dur + ')';
  }
  html += '<div class="cal-det-datetime">' + dtRange + '</div>';

  // Badges
  html += '<div class="cal-det-badges">';
  if (ev.isRecurring) html += '<span class="tag" style="background:var(--s2);color:var(--tx2)">Recurring</span>';
  if (ev.showAs === 'tentative') html += '<span class="tag" style="background:var(--orbg);color:var(--or)">Tentative</span>';
  if (ev.importance === 'high') html += '<span class="tag" style="background:var(--rdbg);color:var(--rd)">High Importance</span>';
  if (ev.categories && ev.categories.length > 0) {
    for (var ci = 0; ci < ev.categories.length; ci++) {
      html += '<span class="tag" style="background:var(--pubg);color:var(--pu)">' + _calEnc(ev.categories[ci]) + '</span>';
    }
  }
  html += '</div>';

  // Join Meeting button (PROMINENT)
  var meetUrl = _calDetectMeetingUrl(ev);
  if (meetUrl) {
    var isTeams = meetUrl.url.indexOf('teams.microsoft') >= 0;
    var btnLabel = isTeams ? 'Join Teams Meeting' : 'Join Zoom Meeting';
    var btnColor = isTeams ? '#5b5fc7' : '#2d8cff';
    html += '<a href="' + _calEnc(meetUrl.url) + '" target="_blank" class="cal-join-btn" style="background:' + btnColor + '">';
    html += '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg> ';
    html += btnLabel + '</a>';
  }

  // Organizer
  if (ev.organizer) {
    html += '<div class="cal-det-section">';
    html += '<div class="cal-det-label">Organizer</div>';
    html += '<div class="cal-det-value">' + _calEnc(ev.organizer);
    if (ev.organizerEmail) html += ' <span style="color:var(--tx3)">&lt;' + _calEnc(ev.organizerEmail) + '&gt;</span>';
    html += '</div></div>';
  }

  // Location
  if (ev.location) {
    html += '<div class="cal-det-section">';
    html += '<div class="cal-det-label">Location</div>';
    html += '<div class="cal-det-value">' + _calEnc(ev.location) + '</div>';
    html += '</div>';
  }

  // Attendees with RSVP status
  if (ev.attendees && ev.attendees.length > 0) {
    html += '<div class="cal-det-section">';
    html += '<div class="cal-det-label">Attendees (' + ev.attendees.length + ')</div>';
    html += '<div class="cal-attendee-list">';
    for (var a = 0; a < ev.attendees.length; a++) {
      var att = ev.attendees[a];
      if (!att.name) continue;
      var statusIcon = '';
      var statusColor = 'var(--tx3)';
      var statusTitle = att.status || 'none';
      if (att.status === 'accepted') { statusIcon = '\u2713'; statusColor = 'var(--gn)'; }
      else if (att.status === 'tentativelyAccepted' || att.status === 'tentative') { statusIcon = '?'; statusColor = 'var(--or)'; }
      else if (att.status === 'declined') { statusIcon = '\u2717'; statusColor = 'var(--rd)'; }
      else { statusIcon = '\u2014'; statusColor = 'var(--tx3)'; }

      html += '<div class="cal-attendee">';
      html += '<span class="cal-att-status" style="color:' + statusColor + '" title="' + _calEnc(statusTitle) + '">' + statusIcon + '</span>';
      html += '<span class="cal-att-name">' + _calEnc(att.name) + '</span>';
      if (att.email) html += '<span class="cal-att-email">' + _calEnc(att.email) + '</span>';
      html += '</div>';
    }
    html += '</div></div>';
  }

  // Body / description
  if (ev.bodyPreview || ev.body) {
    html += '<div class="cal-det-section">';
    html += '<div class="cal-det-label">Description</div>';
    html += '<div class="cal-det-body">' + _calEnc(ev.bodyPreview || ev.body) + '</div>';
    html += '</div>';
  }

  // Attachments
  if (ev.hasAttachments && ev.id) {
    html += '<div class="cal-det-section" id="calAttachments">';
    html += '<div class="cal-det-label">Attachments</div>';
    html += '<div style="color:var(--tx3);font-size:var(--f-sm)">Loading...</div>';
    html += '</div>';
    // Async load attachments
    setTimeout(function() { _calLoadAttachments(ev.id); }, 100);
  }

  // RSVP buttons
  if (ev.id) {
    html += '<div class="cal-det-section">';
    html += '<div class="cal-det-label">Your Response</div>';
    html += '<div class="cal-rsvp-bar">';
    html += '<button class="cal-rsvp-btn accept" onclick="_calRespond(\'' + _calEnc(ev.id) + '\',\'accept\')">Accept</button>';
    html += '<button class="cal-rsvp-btn tentative" onclick="_calRespond(\'' + _calEnc(ev.id) + '\',\'tentativelyAccept\')">Tentative</button>';
    html += '<button class="cal-rsvp-btn decline" onclick="_calRespond(\'' + _calEnc(ev.id) + '\',\'decline\')">Decline</button>';
    html += '</div></div>';
  }

  // Open in Outlook
  if (ev.webLink) {
    html += '<div style="margin-top:var(--sp3)"><a href="' + _calEnc(ev.webLink) + '" target="_blank" class="btn sm" style="font-size:11px">Open in Outlook \u2197</a></div>';
  }

  // Delete
  if (ev.id) {
    html += '<div style="margin-top:var(--sp3)">';
    html += '<button class="btn sm" style="color:var(--rd);border-color:var(--rd)" onclick="_calDeleteEvent(\'' + _calEnc(ev.id) + '\')">Delete Event</button>';
    html += '</div>';
  }

  // Close button
  html += '<div style="margin-top:var(--sp4);text-align:center"><button class="btn sm" onclick="state.calSelectedEvent=null;closePanel();renderAll()">Close</button></div>';

  html += '</div>';
  return html;
}

// ── Helpers ─────────────────────────────────────────────────
function _calCalcDuration(start, end) {
  if (!start || !end) return '';
  var sp = start.split(':');
  var ep = end.split(':');
  var sm = parseInt(sp[0], 10) * 60 + parseInt(sp[1] || '0', 10);
  var em = parseInt(ep[0], 10) * 60 + parseInt(ep[1] || '0', 10);
  var diff = em - sm;
  if (diff <= 0) return '';
  if (diff < 60) return diff + 'min';
  var h = Math.floor(diff / 60);
  var m = diff % 60;
  return h + 'h' + (m > 0 ? ' ' + m + 'm' : '');
}

function _calDetectMeetingUrl(ev) {
  if (ev.onlineMeetingUrl) return { url: ev.onlineMeetingUrl };
  // Check body for Teams/Zoom links
  var body = ev.body || ev.bodyPreview || '';
  var teamsMatch = body.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<)]+/);
  if (teamsMatch) return { url: teamsMatch[0] };
  var zoomMatch = body.match(/https:\/\/[a-z0-9]+\.zoom\.us\/j\/[^\s"<)]+/);
  if (zoomMatch) return { url: zoomMatch[0] };
  return null;
}

function _calLoadAttachments(eventId) {
  fetch('/api/calendar/events/' + encodeURIComponent(eventId) + '/attachments')
    .then(function(r) { return r.json(); })
    .then(function(data) {
      var el = document.getElementById('calAttachments');
      if (!el) return;
      var atts = data.attachments || [];
      if (atts.length === 0) {
        el.innerHTML = '<div class="cal-det-label">Attachments</div><div style="color:var(--tx3);font-size:var(--f-sm)">None</div>';
        return;
      }
      var html = '<div class="cal-det-label">Attachments (' + atts.length + ')</div>';
      for (var i = 0; i < atts.length; i++) {
        var att = atts[i];
        var size = att.size ? ' (' + _calFmtSize(att.size) + ')' : '';
        html += '<div class="cal-att-file">';
        html += '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ';
        html += _calEnc(att.name || 'Attachment') + '<span style="color:var(--tx3)">' + size + '</span>';
        html += '</div>';
      }
      el.innerHTML = html;
    })
    .catch(function() {});
}

function _calFmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function _calRespond(eventId, response) {
  fetch('/api/calendar/events/' + encodeURIComponent(eventId) + '/respond', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response: response })
  })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      if (typeof showToast === 'function') showToast('Response sent: ' + response);
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('Failed to respond: ' + e.message, 'warn');
    });
}

function _calDeleteEvent(eventId) {
  if (!confirm('Delete this event? This cannot be undone.')) return;
  fetch('/api/calendar/events/' + encodeURIComponent(eventId), { method: 'DELETE' })
    .then(function(r) { return r.json(); })
    .then(function(d) {
      state.calSelectedEvent = null;
      closePanel();
      loadCalendarData();
      if (typeof showToast === 'function') showToast('Event deleted');
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('Failed to delete: ' + e.message, 'warn');
    });
}
