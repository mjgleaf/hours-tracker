#!/usr/bin/env node
// Prints each driver's last clock-out (first OFF/SB/Logoff after their final
// on-duty status) for a given day, using the Geotab credentials saved by the
// Hours Tracker app. Usage:
//   node scripts/clockouts.js            # last Thursday
//   node scripts/clockouts.js 2026-11-13 # a specific date (local time)

const fs = require('fs');
const path = require('path');
const os = require('os');

function settingsPath() {
  const name = 'hours-tracker';
  if (process.platform === 'win32') return path.join(process.env.APPDATA, name, 'settings.json');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name, 'settings.json');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name, 'settings.json');
}

function lastThursday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const back = (d.getDay() - 4 + 7) % 7 || 7; // 4 = Thursday; today counts as "last week"
  d.setDate(d.getDate() - back);
  return d;
}

async function call(server, method, params) {
  const res = await fetch(`https://${server}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || `${method} failed`);
  return data.result;
}

const ON_DUTY = new Set(['D', 'ON', 'INT_D']);
const OFF_DUTY = new Set(['OFF', 'SB', 'Logoff']);
const LABEL = { OFF: 'Off Duty', SB: 'Sleeper Berth', Logoff: 'Logged Off' };

async function main() {
  const settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf-8'));
  const { server, database, username, password } = settings.geotab;

  const auth = await call(server, 'Authenticate', { userName: username, password, database });
  const credentials = auth.credentials;
  const apiServer = auth.path && auth.path !== 'ThisServer' ? auth.path : server;

  const day = process.argv[2] ? new Date(`${process.argv[2]}T00:00:00`) : lastThursday();
  const dayEnd = new Date(day);
  dayEnd.setDate(dayEnd.getDate() + 1);
  // Pull a little before/after so carried-over shifts and late punches are seen.
  const from = new Date(day); from.setHours(-12);
  const to = new Date(dayEnd); to.setHours(12);

  const users = await call(apiServer, 'Get', {
    typeName: 'User', credentials, search: { isDriver: true },
  });
  const drivers = (users || [])
    .map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const logs = await call(apiServer, 'Get', {
    typeName: 'DutyStatusLog', credentials,
    search: { fromDate: from.toISOString(), toDate: to.toISOString() },
  });

  const byDriver = new Map();
  for (const l of logs || []) {
    const id = l.driver && (l.driver.id || l.driver);
    if (!id) continue;
    if (!byDriver.has(id)) byDriver.set(id, []);
    byDriver.get(id).push(l);
  }

  const dateLabel = day.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
  console.log(`Clock-outs for ${dateLabel}\n`);

  const rows = [];
  for (const d of drivers) {
    const entries = (byDriver.get(d.id) || [])
      .filter((l) => ON_DUTY.has(l.status) || OFF_DUTY.has(l.status))
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));

    const onDutyThatDay = entries.some((l) => {
      const t = new Date(l.dateTime);
      return ON_DUTY.has(l.status) && t >= day && t < dayEnd;
    });
    const carriedIn = entries.filter((l) => new Date(l.dateTime) < day).slice(-1)[0];
    const worked = onDutyThatDay || (carriedIn && ON_DUTY.has(carriedIn.status));
    if (!worked) continue;

    // Last off-duty transition at or after the day's start that follows an on-duty status.
    let clockOut = null;
    let prev = carriedIn ? carriedIn.status : null;
    for (const l of entries) {
      const t = new Date(l.dateTime);
      if (t < day) continue;
      if (OFF_DUTY.has(l.status) && prev && ON_DUTY.has(prev)) clockOut = l;
      if (ON_DUTY.has(l.status) && t >= dayEnd) break; // next day's shift started
      prev = l.status;
    }

    rows.push({
      Driver: d.name,
      'Clock out': clockOut
        ? new Date(clockOut.dateTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        : 'still on duty / no clock-out logged',
      Status: clockOut ? LABEL[clockOut.status] || clockOut.status : '',
    });
  }

  if (rows.length === 0) console.log('No drivers were on duty that day.');
  else console.table(rows);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
