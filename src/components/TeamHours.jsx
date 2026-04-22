import React, { useState, useEffect, useCallback } from 'react';
import {
  getAllDrivers,
  getAddresses,
  getLogRecords,
  getDutyStatusAvailability,
  getDutyStatusLogs,
  buildWeeklyFromAvailability,
  buildWeeklyFromLogs,
  getWeekStart,
} from '../utils/geotab';
import MapView from './MapView';

function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

const ON_DUTY = new Set(['D', 'ON', 'INT_D']);
const DUTY_CHANGE = new Set(['D', 'ON', 'INT_D', 'OFF', 'SB', 'Logoff']);

const STATUS_LABELS = {
  D: 'Driving',
  ON: 'On Duty',
  INT_D: 'On Duty',
  OFF: 'Off Duty',
  SB: 'Sleeper Berth',
  Logoff: 'Logged Off',
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s;
}

// Geotab DutyStatusLog stores coords at log.location.location.{x,y};
// LogRecord uses top-level latitude/longitude. Normalize to { x: lng, y: lat }.
function extractCoords(loc) {
  if (!loc) return null;
  if (loc.location && typeof loc.location.x === 'number' && typeof loc.location.y === 'number') {
    return { x: loc.location.x, y: loc.location.y };
  }
  if (typeof loc.x === 'number' && typeof loc.y === 'number') {
    return { x: loc.x, y: loc.y };
  }
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return { x: loc.longitude, y: loc.latitude };
  }
  return null;
}

function hasCoords(coords) {
  return coords && typeof coords.x === 'number' && typeof coords.y === 'number';
}

function coordKey(coords) {
  return `${coords.x.toFixed(5)},${coords.y.toFixed(5)}`;
}

function getDeviceId(device) {
  if (!device) return null;
  if (typeof device === 'string') return device === 'NoDeviceId' ? null : device;
  return device.id && device.id !== 'NoDeviceId' ? device.id : null;
}

function formatAddress(addr) {
  if (!addr) return '';
  if (addr.formattedAddress) return addr.formattedAddress;
  const parts = [addr.street, addr.city, addr.state, addr.country].filter(Boolean);
  return parts.join(', ');
}

function formatEventTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function describeCurrentStatus(logs) {
  if (!logs || logs.length === 0) return { label: 'Unknown', onDuty: false, since: null };
  const sorted = [...logs].sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));
  const latest = sorted[0];
  const onDuty = ON_DUTY.has(latest.status);
  const labelMap = {
    D: 'Driving',
    ON: 'On Duty',
    INT_D: 'On Duty',
    OFF: 'Off Duty',
    SB: 'Sleeper Berth',
    Logoff: 'Logged Off',
  };
  return {
    label: labelMap[latest.status] || latest.status,
    onDuty,
    since: latest.dateTime,
  };
}

function formatSince(iso) {
  if (!iso) return '';
  const then = new Date(iso);
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return `${hrs}h ${rem}m ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function TeamHours({ connected, credentials, server }) {
  const [drivers, setDrivers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [weeklyData, setWeeklyData] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [currentStatus, setCurrentStatus] = useState(null);
  const [events, setEvents] = useState([]);
  const [showMap, setShowMap] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!connected || !credentials || !server) return;
    setLoading(true);
    getAllDrivers(server, credentials)
      .then((list) => {
        setDrivers(list);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [connected, credentials, server]);

  const fetchForUser = useCallback(
    async (userId, offset) => {
      if (!userId) return;
      setLoading(true);
      setError(null);
      try {
        const currentWeekStart = getWeekStart();
        const weekStart = new Date(currentWeekStart);
        weekStart.setDate(weekStart.getDate() + offset * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);

        // Always fetch raw logs for the event list
        const weekLogs = await getDutyStatusLogs(
          server,
          credentials,
          weekStart.toISOString(),
          weekEnd.toISOString(),
          userId
        );

        // Weekly totals: recap for current week (matches Geotab exactly), logs for past
        if (offset === 0) {
          const availability = await getDutyStatusAvailability(server, credentials, userId);
          const data = buildWeeklyFromAvailability(availability, weekStart);
          setWeeklyData(data);
        } else {
          const data = buildWeeklyFromLogs(weekLogs, weekStart);
          setWeeklyData(data);
        }

        // Duty-status change events — attach locations
        const rawEvents = (weekLogs || [])
          .filter((l) => DUTY_CHANGE.has(l.status))
          .sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime));

        // Attach normalized coords to each event (from log.location.location, or LogRecord fallback)
        const withCoords = rawEvents.map((ev) => ({
          raw: ev,
          coords: extractCoords(ev.location),
        }));

        // For events still missing GPS, try LogRecord for their device
        const WINDOW_MS = 5 * 60 * 1000;
        const needsLookup = withCoords.filter(
          (x) => !hasCoords(x.coords) && getDeviceId(x.raw.device)
        );

        const lookups = await Promise.all(
          needsLookup.map(async ({ raw }) => {
            const deviceId = getDeviceId(raw.device);
            const t = new Date(raw.dateTime).getTime();
            try {
              const records = await getLogRecords(
                server,
                credentials,
                deviceId,
                new Date(t - WINDOW_MS).toISOString(),
                new Date(t + WINDOW_MS).toISOString()
              );
              let best = null;
              let bestDiff = Infinity;
              for (const r of records) {
                const c = extractCoords(r);
                if (!c) continue;
                const diff = Math.abs(new Date(r.dateTime).getTime() - t);
                if (diff < bestDiff) {
                  best = c;
                  bestDiff = diff;
                }
              }
              return best ? { evId: raw.id, coords: best } : null;
            } catch {
              return null;
            }
          })
        );

        const resolvedById = {};
        for (const l of lookups) if (l) resolvedById[l.evId] = l.coords;

        const changeEvents = withCoords.map(({ raw, coords }) => ({
          ...raw,
          coords: hasCoords(coords) ? coords : resolvedById[raw.id] || null,
        }));

        const uniqueCoords = [];
        const seen = new Set();
        for (const ev of changeEvents) {
          if (hasCoords(ev.coords)) {
            const key = coordKey(ev.coords);
            if (!seen.has(key)) {
              seen.add(key);
              uniqueCoords.push(ev.coords);
            }
          }
        }

        const addressByKey = {};
        if (uniqueCoords.length > 0) {
          try {
            const addrs = await getAddresses(server, credentials, uniqueCoords);
            uniqueCoords.forEach((c, i) => {
              addressByKey[coordKey(c)] = addrs[i];
            });
          } catch {
            // geocode failure — fall back to lat/lng below
          }
        }

        setEvents(
          changeEvents.map((ev) => ({
            id: ev.id,
            time: ev.dateTime,
            status: ev.status,
            coords: ev.coords,
            address: hasCoords(ev.coords) ? addressByKey[coordKey(ev.coords)] : null,
          }))
        );

        // Latest duty status (past 7 days, independent of viewed week)
        const statusFrom = new Date();
        statusFrom.setDate(statusFrom.getDate() - 7);
        const recentLogs = await getDutyStatusLogs(
          server,
          credentials,
          statusFrom.toISOString(),
          new Date().toISOString(),
          userId
        );
        setCurrentStatus(describeCurrentStatus(recentLogs));
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    },
    [server, credentials]
  );

  useEffect(() => {
    if (selectedId) fetchForUser(selectedId, weekOffset);
  }, [selectedId, weekOffset, fetchForUser]);

  if (!connected) {
    return (
      <div className="dashboard">
        <h2>Team Hours</h2>
        <div className="card connect-prompt">
          <p>Connect to Geotab to view team hours.</p>
          <p>Go to <strong>Settings</strong> to enter your Geotab credentials.</p>
        </div>
      </div>
    );
  }

  const totalHours = weeklyData?.totalHours || 0;
  const dailyBreakdown = weeklyData?.dailyBreakdown || [];
  const maxDailyHours = Math.max(...dailyBreakdown.map((d) => d.hours), 1);

  const weekStartLabel = weeklyData?.weekStart
    ? new Date(weeklyData.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const weekEndDate = weeklyData?.weekStart ? new Date(weeklyData.weekStart) : new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEndLabel = weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Team Hours</h2>
        {selectedId && (
          <div className="week-nav">
            <button className="week-nav-btn" onClick={() => setWeekOffset((p) => p - 1)} disabled={loading}>&#9664;</button>
            <div className="week-label">Week of {weekStartLabel} – {weekEndLabel}</div>
            <button className="week-nav-btn" onClick={() => setWeekOffset((p) => Math.min(p + 1, 0))} disabled={loading || weekOffset === 0}>&#9654;</button>
            {weekOffset !== 0 && (
              <button className="today-btn" onClick={() => setWeekOffset(0)} disabled={loading}>Today</button>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="card">
        <h3>Select Driver</h3>
        <div className="form-group">
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setWeekOffset(0);
              setWeeklyData(null);
              setCurrentStatus(null);
              setEvents([]);
            }}
            disabled={loading && drivers.length === 0}
          >
            <option value="">-- Choose a driver --</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>{d.displayName}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedId && (
        <>
          {currentStatus && (
            <div className="card">
              <h3>Current Status</h3>
              <div className="status-row">
                <span className={`status-dot ${currentStatus.onDuty ? 'connected' : 'disconnected'}`}></span>
                <span className="status-text">{currentStatus.label}</span>
                {currentStatus.since && (
                  <span className="status-since">since {formatSince(currentStatus.since)}</span>
                )}
              </div>
            </div>
          )}

          <div className="summary-cards single">
            <div className="card highlight">
              <div className="card-label">Total Hours</div>
              <div className="card-value">{formatHours(totalHours)}</div>
              <div className="card-detail">On-duty this week</div>
            </div>
          </div>

          <div className="card daily-chart">
            <h3>Daily Breakdown</h3>
            {loading && !weeklyData ? (
              <p className="help-text">Loading…</p>
            ) : (
              <div className="chart">
                {dailyBreakdown.map((day, i) => {
                  const isZeroDay = day.hours < 0.1;
                  return (
                    <div className="chart-bar-group" key={i}>
                      <div className="chart-bar-label">
                        {isZeroDay ? '—' : formatHours(day.hours)}
                      </div>
                      <div className="chart-bar-container">
                        <div
                          className="chart-bar"
                          style={{ height: `${(day.hours / maxDailyHours) * 100}%` }}
                        ></div>
                      </div>
                      <div className="chart-day-label">{day.dayName}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <div className="punch-header">
              <h3>Punch Events</h3>
              {events.some((e) => e.coords) && (
                <button className="map-toggle-btn" onClick={() => setShowMap((s) => !s)}>
                  {showMap ? 'Hide Map' : 'Show Map'}
                </button>
              )}
            </div>
            {showMap && events.some((e) => e.coords) && (
              <MapView events={events} />
            )}
            {loading && events.length === 0 ? (
              <p className="help-text">Loading…</p>
            ) : events.length === 0 ? (
              <p className="help-text">No duty-status changes this week.</p>
            ) : (
              <ul className="event-list">
                {events.map((ev) => {
                  const onDuty = ON_DUTY.has(ev.status);
                  const addressText = formatAddress(ev.address);
                  const gps = hasCoords(ev.coords);
                  return (
                    <li key={ev.id || ev.time} className="event-row">
                      <span className={`status-dot ${onDuty ? 'connected' : 'disconnected'}`}></span>
                      <div className="event-body">
                        <div className="event-title">
                          <strong>{statusLabel(ev.status)}</strong>
                          <span className="event-time">{formatEventTime(ev.time)}</span>
                        </div>
                        <div className="event-location">
                          {addressText ||
                            (gps
                              ? `${ev.coords.y.toFixed(5)}, ${ev.coords.x.toFixed(5)}`
                              : 'No location recorded')}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
