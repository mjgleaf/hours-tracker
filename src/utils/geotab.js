export async function authenticate(server, database, username, password) {
  return window.api.geotabAuthenticate({ server, database, username, password });
}

export async function getDutyStatusAvailability(server, credentials, userId) {
  const search = {};
  if (userId) {
    search.userSearch = { id: userId };
  }
  const result = await window.api.geotabCall({
    server,
    method: 'Get',
    params: {
      typeName: 'DutyStatusAvailability',
      credentials,
      search,
    },
  });
  return result || [];
}

export async function getDutyStatusLogs(server, credentials, fromDate, toDate, userId) {
  const search = { fromDate, toDate };
  if (userId) {
    search.userSearch = { id: userId };
  }
  const result = await window.api.geotabCall({
    server,
    method: 'Get',
    params: {
      typeName: 'DutyStatusLog',
      credentials,
      search,
    },
  });
  return result || [];
}

export async function getDriverId(server, credentials, username) {
  const users = await window.api.geotabCall({
    server,
    method: 'Get',
    params: {
      typeName: 'User',
      credentials,
      search: { name: username },
    },
  });
  if (users && users.length > 0) {
    return users[0].id;
  }
  return null;
}

export async function getLogRecords(server, credentials, deviceId, fromDate, toDate) {
  const result = await window.api.geotabCall({
    server,
    method: 'Get',
    params: {
      typeName: 'LogRecord',
      credentials,
      search: {
        deviceSearch: { id: deviceId },
        fromDate,
        toDate,
      },
    },
  });
  return result || [];
}

export async function getAddresses(server, credentials, coordinates) {
  if (!coordinates || coordinates.length === 0) return [];
  const result = await window.api.geotabCall({
    server,
    method: 'GetAddresses',
    params: { credentials, coordinates },
  });
  return result || [];
}

export async function getAllDrivers(server, credentials) {
  const users = await window.api.geotabCall({
    server,
    method: 'Get',
    params: {
      typeName: 'User',
      credentials,
      search: { isDriver: true },
    },
  });
  return (users || [])
    .map((u) => ({
      id: u.id,
      name: u.name,
      displayName:
        [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

// Parse .NET TimeSpan format: "HH:MM:SS.fffffff" or "D.HH:MM:SS.fffffff"
function parseTimeSpanToHours(timeSpan) {
  if (!timeSpan) return 0;
  let days = 0;
  let timePart = timeSpan;

  // Check for days portion (e.g., "1.07:34:51.8290000")
  const dotIndex = timeSpan.indexOf('.');
  const colonIndex = timeSpan.indexOf(':');
  if (dotIndex !== -1 && dotIndex < colonIndex) {
    days = parseInt(timeSpan.substring(0, dotIndex), 10);
    timePart = timeSpan.substring(dotIndex + 1);
  }

  const parts = timePart.split(':');
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseFloat(parts[2]) || 0;

  return days * 24 + hours + minutes / 60 + seconds / 3600;
}

// Build weekly data from Geotab's pre-calculated DutyStatusAvailability recap
export function buildWeeklyFromAvailability(availability, weekStart) {
  if (!availability || availability.length === 0) return null;

  const avail = availability[0];
  const recap = avail.recap || [];

  const days = [];
  let totalHours = 0;

  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + i);
    dayStart.setHours(0, 0, 0, 0);

    const dayName = dayStart.toLocaleDateString('en-US', { weekday: 'short' });

    // Find matching recap entry for this day
    // Geotab recap dateTime is in UTC (e.g., "2026-04-06T05:00:00.000Z" = midnight local)
    // Compare using UTC date of the recap against local date
    const recapEntry = recap.find((r) => {
      const recapDate = new Date(r.dateTime);
      return (
        recapDate.getUTCFullYear() === dayStart.getFullYear() &&
        recapDate.getUTCMonth() === dayStart.getMonth() &&
        recapDate.getUTCDate() === dayStart.getDate()
      );
    });

    let hours = 0;
    if (recapEntry) {
      hours = parseTimeSpanToHours(recapEntry.duration);
    }

    totalHours += hours;
    days.push({ date: dayStart, dayName, hours });
  }

  return { totalHours, dailyBreakdown: days, weekStart };
}

// On-duty statuses for DutyStatusLog-based calculation (past weeks)
const ON_DUTY_STATUSES = new Set(['D', 'ON', 'INT_D']);
const OFF_DUTY_STATUSES = new Set(['OFF', 'SB', 'Logoff']);

function isDutyStatusChange(status) {
  return ON_DUTY_STATUSES.has(status) || OFF_DUTY_STATUSES.has(status);
}

function isOnDuty(status) {
  return ON_DUTY_STATUSES.has(status);
}

// Build weekly data from raw DutyStatusLog entries (used for past weeks)
export function buildWeeklyFromLogs(logs, weekStart) {
  const sorted = [...(logs || [])]
    .filter((l) => isDutyStatusChange(l.status))
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

  const days = [];
  let totalHours = 0;

  for (let i = 0; i < 7; i++) {
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + i);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const dayLogs = sorted.filter((log) => {
      const t = new Date(log.dateTime);
      return t >= dayStart && t < dayEnd;
    });

    // Check if on-duty carried over from previous day
    let carriedOnDuty = false;
    const priorLogs = sorted.filter((log) => new Date(log.dateTime) < dayStart);
    if (priorLogs.length > 0) {
      carriedOnDuty = isOnDuty(priorLogs[priorLogs.length - 1].status);
    }

    let totalMs = 0;
    let onDutyStart = carriedOnDuty ? dayStart : null;

    for (const log of dayLogs) {
      const time = new Date(log.dateTime);
      if (isOnDuty(log.status)) {
        if (!onDutyStart) onDutyStart = time;
      } else {
        if (onDutyStart) {
          totalMs += time - onDutyStart;
          onDutyStart = null;
        }
      }
    }

    if (onDutyStart) {
      const cap = dayEnd < new Date() ? dayEnd : new Date();
      totalMs += cap - onDutyStart;
    }

    const hours = totalMs / (1000 * 60 * 60);
    totalHours += hours;
    days.push({
      date: dayStart,
      dayName: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      hours,
    });
  }

  return { totalHours, dailyBreakdown: days, weekStart };
}

export function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
