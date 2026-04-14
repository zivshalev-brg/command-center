'use strict';

const path = require('path');
const fs = require('fs');
const { jsonReply, readBody } = require('../lib/helpers');
const outlook = require('../lib/outlook-api');

/**
 * Calendar route handler — multi-endpoint.
 *
 * GET  /api/calendar/calendars              — list user's calendars
 * GET  /api/calendar                        — list events (?start=&end=)
 * GET  /api/calendar/events/:id             — single event detail
 * GET  /api/calendar/events/:id/attachments — event attachments
 * GET  /api/calendar/other/:userId          — other user's events (?start=&end=)
 * POST /api/calendar/events                 — create event
 * PATCH /api/calendar/events/:id            — update event
 * DELETE /api/calendar/events/:id           — delete event
 * POST /api/calendar/events/:id/respond     — accept/tentative/decline
 * POST /api/calendar/online-meeting         — create Teams meeting
 */
module.exports = async function handleCalendar(req, res, parts, url, ctx) {
  const method = req.method;

  // ─── GET /api/calendar/calendars ──────────────────────────
  if (parts[1] === 'calendars' && method === 'GET') {
    try {
      const calendars = await outlook.listCalendars(ctx.msGraph);
      return jsonReply(res, 200, { calendars });
    } catch (e) {
      // Fallback: return a default calendar entry when Graph is unavailable
      return jsonReply(res, 200, { calendars: [{ id: 'default', name: 'My Calendar', color: 'auto', canEdit: true, isDefaultCalendar: true }], fallback: true });
    }
  }

  // ─── GET /api/calendar/other/:userId ──────────────────────
  if (parts[1] === 'other' && parts[2] && method === 'GET') {
    const userId = decodeURIComponent(parts[2]);
    const { startDate, endDate } = getDateRange(url);
    try {
      const events = await outlook.getOtherCalendarEvents(ctx.msGraph, userId, startDate, endDate);
      return jsonReply(res, 200, { events, start: startDate, end: endDate, source: 'graph' });
    } catch (e) {
      console.error('[Calendar] getOtherCalendarEvents failed:', e.message);
      return jsonReply(res, 500, { error: 'Failed to fetch other calendar: ' + e.message });
    }
  }

  // ─── POST /api/calendar/online-meeting ────────────────────
  if (parts[1] === 'online-meeting' && method === 'POST') {
    if (!hasGraphAuth(ctx)) return jsonReply(res, 400, { error: 'Outlook not connected' });
    try {
      const body = await readBody(req);
      const meeting = await outlook.createOnlineMeeting(ctx.msGraph, body);
      return jsonReply(res, 201, { ok: true, meeting });
    } catch (e) {
      console.error('[Calendar] createOnlineMeeting failed:', e.message);
      return jsonReply(res, 500, { error: 'Failed to create online meeting: ' + e.message });
    }
  }

  // ─── /api/calendar/events/* routes ────────────────────────
  if (parts[1] === 'events') {
    const eventId = parts[2] ? decodeURIComponent(parts[2]) : null;

    // POST /api/calendar/events — create event
    if (!eventId && method === 'POST') {
      if (!hasGraphAuth(ctx)) return jsonReply(res, 400, { error: 'Outlook not connected' });
      try {
        const body = await readBody(req);
        const event = await outlook.createCalendarEvent(ctx.msGraph, body);
        return jsonReply(res, 201, { ok: true, event });
      } catch (e) {
        console.error('[Calendar] createCalendarEvent failed:', e.message);
        return jsonReply(res, 500, { error: 'Failed to create event: ' + e.message });
      }
    }

    if (eventId) {
      // POST /api/calendar/events/:id/respond
      if (parts[3] === 'respond' && method === 'POST') {
        if (!hasGraphAuth(ctx)) return jsonReply(res, 400, { error: 'Outlook not connected' });
        try {
          const body = await readBody(req);
          const response = body.response; // 'accept' | 'tentative' | 'decline'
          const comment = body.comment || '';
          await outlook.respondToCalendarEvent(ctx.msGraph, eventId, response, comment);
          return jsonReply(res, 200, { ok: true });
        } catch (e) {
          console.error('[Calendar] respondToCalendarEvent failed:', e.message);
          return jsonReply(res, 500, { error: 'Failed to respond to event: ' + e.message });
        }
      }

      // GET /api/calendar/events/:id/attachments
      if (parts[3] === 'attachments' && method === 'GET') {
        try {
          const attachments = await outlook.getCalendarEventAttachments(ctx.msGraph, eventId);
          return jsonReply(res, 200, { attachments });
        } catch (e) {
          console.error('[Calendar] getCalendarEventAttachments failed:', e.message);
          return jsonReply(res, 500, { error: 'Failed to fetch attachments: ' + e.message });
        }
      }

      // GET /api/calendar/events/:id — single event detail
      if (method === 'GET') {
        try {
          const event = await outlook.getCalendarEvent(ctx.msGraph, eventId);
          return jsonReply(res, 200, { event });
        } catch (e) {
          console.error('[Calendar] getCalendarEvent failed:', e.message);
          return jsonReply(res, 500, { error: 'Failed to fetch event: ' + e.message });
        }
      }

      // PATCH /api/calendar/events/:id — update event
      if (method === 'PATCH') {
        if (!hasGraphAuth(ctx)) return jsonReply(res, 400, { error: 'Outlook not connected' });
        try {
          const body = await readBody(req);
          const event = await outlook.updateCalendarEvent(ctx.msGraph, eventId, body);
          return jsonReply(res, 200, { ok: true, event });
        } catch (e) {
          console.error('[Calendar] updateCalendarEvent failed:', e.message);
          return jsonReply(res, 500, { error: 'Failed to update event: ' + e.message });
        }
      }

      // DELETE /api/calendar/events/:id — delete event
      if (method === 'DELETE') {
        if (!hasGraphAuth(ctx)) return jsonReply(res, 400, { error: 'Outlook not connected' });
        try {
          await outlook.deleteCalendarEvent(ctx.msGraph, eventId);
          return jsonReply(res, 200, { ok: true });
        } catch (e) {
          console.error('[Calendar] deleteCalendarEvent failed:', e.message);
          return jsonReply(res, 500, { error: 'Failed to delete event: ' + e.message });
        }
      }
    }
  }

  // ─── GET /api/calendar — list events (default, backward-compatible) ───
  if (method === 'GET' && !parts[1]) {
    // Try cached calendar-live.json first (same pattern as email-live.json)
    const calPath = path.join(ctx.dir, 'kb-data', 'intelligence', 'calendar-live.json');
    const hasDateParams = url.searchParams.has('start') || url.searchParams.has('end');

    // Only use cache for default (no params) requests
    if (!hasDateParams) {
      try {
        if (fs.existsSync(calPath)) {
          const raw = fs.readFileSync(calPath, 'utf8');
          const data = JSON.parse(raw);
          return jsonReply(res, 200, data);
        }
      } catch (e) {
        console.error('[Calendar] Failed to read calendar-live.json:', e.message);
      }
    }

    // Fallback: try Graph API if token available
    try {
      const { startDate, endDate } = getDateRange(url);
      const events = await outlook.getCalendarEvents(ctx.msGraph, startDate, endDate);

      // Group by AEST date (backward-compatible shape for Daily Summary)
      const byDate = {};
      for (const ev of events) {
        if (!ev.start) continue;
        const startLocal = new Date(ev.start);
        const dateKey = startLocal.toLocaleDateString('en-CA', { timeZone: 'Australia/Sydney' });
        if (!byDate[dateKey]) byDate[dateKey] = [];

        const timeStr = ev.isAllDay ? 'All day' : startLocal.toLocaleTimeString('en-AU', {
          timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true
        });
        const endLocal = ev.end ? new Date(ev.end) : null;
        const endTimeStr = endLocal ? endLocal.toLocaleTimeString('en-AU', {
          timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true
        }) : '';

        byDate[dateKey].push({
          id: ev.id,
          subject: ev.subject,
          time: timeStr,
          endTime: endTimeStr,
          location: ev.location,
          isAllDay: ev.isAllDay,
          organizer: ev.organizer,
          organizerEmail: ev.organizerEmail,
          attendees: ev.attendees,
          importance: ev.importance,
          showAs: ev.showAs,
          webLink: ev.webLink,
          categories: ev.categories,
          isRecurring: ev.isRecurring,
          onlineMeetingUrl: ev.onlineMeetingUrl,
          hasAttachments: ev.hasAttachments,
          bodyPreview: ev.bodyPreview,
          zoomUrl: ev.zoomUrl
        });
      }

      // Cache the result (only for default date range)
      const result = {
        events: byDate,
        startDate,
        endDate,
        count: events.length,
        refreshedAt: new Date().toISOString(),
        source: 'graph'
      };

      if (!hasDateParams) {
        try {
          fs.mkdirSync(path.dirname(calPath), { recursive: true });
          fs.writeFileSync(calPath, JSON.stringify(result, null, 2));
        } catch (_) { /* cache write failure is non-fatal */ }
      }

      return jsonReply(res, 200, result);
    } catch (err) {
      console.error('[Calendar] API fallback failed:', err.message);
      return jsonReply(res, 200, {
        events: {},
        count: 0,
        error: 'No calendar data available. Cache missing and API unavailable.'
      });
    }
  }

  // ─── Fallback: method not allowed / unknown sub-route ─────
  return jsonReply(res, 404, { error: 'Unknown calendar endpoint' });
};

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Check that Graph auth is configured and tokens exist.
 */
function hasGraphAuth(ctx) {
  if (!ctx.msGraph || !ctx.msGraph.clientId || !ctx.msGraph.tenantId) return false;
  const tokenStore = require('../lib/ms-token-store');
  return tokenStore.isAuthenticated() || Boolean(ctx.msGraph.accessToken);
}

/**
 * Extract start/end date range from URL params, defaulting to current week (Mon-Sun).
 */
function getDateRange(url) {
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((dow + 6) % 7));
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);

  const startDate = url.searchParams.get('start') || mon.toISOString().split('T')[0];
  const endDate = url.searchParams.get('end') || sun.toISOString().split('T')[0];
  return { startDate, endDate };
}
