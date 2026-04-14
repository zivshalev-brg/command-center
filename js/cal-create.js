
// ===============================================================
// CAL-CREATE.JS — Event Creation Form
// ===============================================================

var _calCreateAttendees = [];

function _calRenderCreateForm() {
  var dateVal = state._calCreateDate || state.calDate;
  var timeVal = state._calCreateTime || '09:00';
  // Default end = start + 30min
  var sp = timeVal.split(':');
  var endH = parseInt(sp[0], 10);
  var endM = parseInt(sp[1] || '0', 10) + 30;
  if (endM >= 60) { endH += 1; endM -= 60; }
  var endTimeVal = (endH < 10 ? '0' + endH : '' + endH) + ':' + (endM < 10 ? '0' + endM : '' + endM);

  var html = '<div class="cal-create-form">';

  // Subject
  html += '<div class="cal-cf-field">';
  html += '<label class="cal-cf-label">Subject</label>';
  html += '<input type="text" class="cal-cf-input" id="calCreateSubject" placeholder="Add a title" />';
  html += '</div>';

  // All-day toggle
  html += '<div class="cal-cf-field cal-cf-row">';
  html += '<label class="cal-cf-label">All day</label>';
  html += '<label class="cal-cf-toggle"><input type="checkbox" id="calCreateAllDay" onchange="_calToggleAllDay()" /><span class="cal-cf-slider"></span></label>';
  html += '</div>';

  // Start date + time
  html += '<div class="cal-cf-field cal-cf-row" id="calCreateDateTimeRow">';
  html += '<div><label class="cal-cf-label">Start</label>';
  html += '<input type="date" class="cal-cf-input sm" id="calCreateStartDate" value="' + dateVal + '" /></div>';
  html += '<div class="cal-cf-time-wrap"><input type="time" class="cal-cf-input sm" id="calCreateStartTime" value="' + timeVal + '" /></div>';
  html += '</div>';

  // End date + time
  html += '<div class="cal-cf-field cal-cf-row" id="calCreateEndRow">';
  html += '<div><label class="cal-cf-label">End</label>';
  html += '<input type="date" class="cal-cf-input sm" id="calCreateEndDate" value="' + dateVal + '" /></div>';
  html += '<div class="cal-cf-time-wrap"><input type="time" class="cal-cf-input sm" id="calCreateEndTime" value="' + endTimeVal + '" /></div>';
  html += '</div>';

  // Location
  html += '<div class="cal-cf-field">';
  html += '<label class="cal-cf-label">Location</label>';
  html += '<input type="text" class="cal-cf-input" id="calCreateLocation" placeholder="Add a location" />';
  html += '</div>';

  // Attendees
  html += '<div class="cal-cf-field">';
  html += '<label class="cal-cf-label">Attendees</label>';
  html += '<div class="cal-cf-att-pills" id="calCreateAttPills"></div>';
  html += '<input type="email" class="cal-cf-input" id="calCreateAttInput" placeholder="Type email and press Enter" onkeydown="_calAttKeydown(event)" />';
  html += '</div>';

  // Body
  html += '<div class="cal-cf-field">';
  html += '<label class="cal-cf-label">Description</label>';
  html += '<textarea class="cal-cf-textarea" id="calCreateBody" rows="4" placeholder="Add details..."></textarea>';
  html += '</div>';

  // Online meeting
  html += '<div class="cal-cf-field">';
  html += '<label class="cal-cf-label">Online Meeting</label>';
  html += '<select class="cal-cf-input" id="calCreateMeeting">';
  html += '<option value="none">None</option>';
  html += '<option value="teams">Teams Meeting</option>';
  html += '<option value="zoom">Zoom (manual link)</option>';
  html += '</select>';
  html += '<input type="url" class="cal-cf-input" id="calCreateZoomLink" placeholder="Paste Zoom link..." style="display:none;margin-top:var(--sp2)" />';
  html += '</div>';

  // Buttons
  html += '<div class="cal-cf-actions">';
  html += '<button class="cal-cf-btn primary" onclick="_calSubmitEvent()">Create Event</button>';
  html += '<button class="cal-cf-btn" onclick="_calCloseCreate();closePanel()">Cancel</button>';
  html += '</div>';

  html += '</div>';

  // Reset attendees list
  _calCreateAttendees = [];

  return html;
}

function _calToggleAllDay() {
  var allDay = document.getElementById('calCreateAllDay');
  var startTime = document.getElementById('calCreateStartTime');
  var endTime = document.getElementById('calCreateEndTime');
  if (!allDay || !startTime || !endTime) return;
  startTime.style.display = allDay.checked ? 'none' : '';
  endTime.style.display = allDay.checked ? 'none' : '';
}

function _calAttKeydown(evt) {
  if (evt.key !== 'Enter') return;
  evt.preventDefault();
  var input = evt.target;
  var email = (input.value || '').trim();
  if (!email || email.indexOf('@') < 0) return;
  _calCreateAttendees.push(email);
  input.value = '';
  _calRenderAttPills();
}

function _calRenderAttPills() {
  var el = document.getElementById('calCreateAttPills');
  if (!el) return;
  var html = '';
  for (var i = 0; i < _calCreateAttendees.length; i++) {
    html += '<span class="cal-att-pill" onclick="_calRemoveAtt(' + i + ')">' + _calEnc(_calCreateAttendees[i]) + ' &times;</span>';
  }
  el.innerHTML = html;
}

function _calRemoveAtt(idx) {
  _calCreateAttendees.splice(idx, 1);
  _calRenderAttPills();
}

function _calSubmitEvent() {
  var subject = (document.getElementById('calCreateSubject') || {}).value || '';
  if (!subject.trim()) {
    if (typeof showToast === 'function') showToast('Subject is required', 'warn');
    return;
  }

  var isAllDay = document.getElementById('calCreateAllDay') ? document.getElementById('calCreateAllDay').checked : false;
  var startDate = (document.getElementById('calCreateStartDate') || {}).value || state.calDate;
  var endDate = (document.getElementById('calCreateEndDate') || {}).value || startDate;
  var startTime = isAllDay ? '00:00' : ((document.getElementById('calCreateStartTime') || {}).value || '09:00');
  var endTime = isAllDay ? '23:59' : ((document.getElementById('calCreateEndTime') || {}).value || '09:30');
  var location = (document.getElementById('calCreateLocation') || {}).value || '';
  var body = (document.getElementById('calCreateBody') || {}).value || '';
  var meetingType = (document.getElementById('calCreateMeeting') || {}).value || 'none';
  var zoomLink = (document.getElementById('calCreateZoomLink') || {}).value || '';

  var payload = {
    subject: subject.trim(),
    startDate: startDate,
    endDate: endDate,
    startTime: startTime,
    endTime: endTime,
    isAllDay: isAllDay,
    location: location,
    body: body,
    attendees: _calCreateAttendees.map(function(e) { return { email: e }; }),
    onlineMeeting: meetingType === 'teams',
    zoomLink: meetingType === 'zoom' ? zoomLink : ''
  };

  fetch('/api/calendar/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
    .then(function(r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    })
    .then(function(d) {
      state.calCreateOpen = false;
      _calCreateAttendees = [];
      closePanel();
      loadCalendarData();
      if (typeof showToast === 'function') showToast('Event created');
    })
    .catch(function(e) {
      if (typeof showToast === 'function') showToast('Failed to create event: ' + e.message, 'warn');
    });
}
