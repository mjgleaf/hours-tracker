import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import TeamHours from './components/TeamHours';
import { authenticate, getDriverId, getDutyStatusAvailability, getDutyStatusLogs, buildWeeklyFromAvailability, buildWeeklyFromLogs, getWeekStart } from './utils/geotab';

export default function App() {
  const [settings, setSettings] = useState(null);
  const [connected, setConnected] = useState(false);
  const [credentials, setCredentials] = useState(null);
  const [driverId, setDriverId] = useState(null);
  const [weeklyData, setWeeklyData] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Load settings on mount
  useEffect(() => {
    window.api.getSettings().then(setSettings);
  }, []);

  const connectToGeotab = useCallback(async (geotabSettings) => {
    setLoading(true);
    setError(null);
    try {
      const { server, database, username, password } = geotabSettings;
      const result = await authenticate(server, database, username, password);
      setCredentials(result.credentials);
      setConnected(true);

      const dId = await getDriverId(server, result.credentials, username);
      setDriverId(dId);

      return true;
    } catch (e) {
      setError(e.message);
      setConnected(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeeklyData = useCallback(async (offset = 0) => {
    if (!connected || !credentials || !settings || !driverId) return;

    setLoading(true);
    setError(null);
    try {
      const currentWeekStart = getWeekStart();
      const weekStart = new Date(currentWeekStart);
      weekStart.setDate(weekStart.getDate() + offset * 7);

      if (offset === 0) {
        // Current week: use DutyStatusAvailability for exact Geotab numbers
        const availability = await getDutyStatusAvailability(
          settings.geotab.server,
          credentials,
          driverId
        );
        const data = buildWeeklyFromAvailability(availability, weekStart);
        if (data) setWeeklyData(data);
      } else {
        // Past weeks: use DutyStatusLog
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const logs = await getDutyStatusLogs(
          settings.geotab.server,
          credentials,
          weekStart.toISOString(),
          weekEnd.toISOString(),
          driverId
        );
        const data = buildWeeklyFromLogs(logs, weekStart);
        setWeeklyData(data);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [connected, credentials, settings, driverId]);

  // Auto-connect on settings load
  useEffect(() => {
    if (settings?.geotab?.server && settings?.geotab?.username && !connected) {
      connectToGeotab(settings.geotab);
    }
  }, [settings, connected, connectToGeotab]);

  // Fetch data when connected or week changes
  useEffect(() => {
    if (connected) {
      fetchWeeklyData(weekOffset);
      if (weekOffset === 0) {
        const interval = setInterval(() => fetchWeeklyData(0), 5 * 60 * 1000);
        return () => clearInterval(interval);
      }
    }
  }, [connected, fetchWeeklyData, weekOffset]);

  const goToPreviousWeek = () => setWeekOffset((prev) => prev - 1);
  const goToNextWeek = () => setWeekOffset((prev) => Math.min(prev + 1, 0));
  const goToCurrentWeek = () => setWeekOffset(0);

  const handleSaveSettings = async (newSettings) => {
    await window.api.saveSettings(newSettings);
    setSettings(newSettings);

    // Reconnect if geotab settings changed
    if (
      newSettings.geotab.server !== settings?.geotab?.server ||
      newSettings.geotab.username !== settings?.geotab?.username ||
      newSettings.geotab.password !== settings?.geotab?.password ||
      newSettings.geotab.database !== settings?.geotab?.database
    ) {
      setConnected(false);
      setCredentials(null);
      await connectToGeotab(newSettings.geotab);
    }
  };

  if (!settings) return <div className="loading">Loading...</div>;

  return (
    <HashRouter>
      <div className="app">
        <nav className="sidebar">
          <h1 className="logo">Hours Tracker</h1>
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Dashboard
            </NavLink>
            <NavLink to="/team" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Team Hours
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              Settings
            </NavLink>
          </div>
          <div className="connection-status">
            <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
            {connected ? 'Connected' : 'Disconnected'}
          </div>
        </nav>
        <main className="content">
          {error && (
            <div className="error-banner">
              {error}
              <button onClick={() => setError(null)}>Dismiss</button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  weeklyData={weeklyData}
                  settings={settings}
                  loading={loading}
                  connected={connected}
                  onRefresh={() => fetchWeeklyData(weekOffset)}
                  onPreviousWeek={goToPreviousWeek}
                  onNextWeek={goToNextWeek}
                  onCurrentWeek={goToCurrentWeek}
                  isCurrentWeek={weekOffset === 0}
                />
              }
            />
            <Route
              path="/team"
              element={
                <TeamHours
                  connected={connected}
                  credentials={credentials}
                  server={settings?.geotab?.server}
                />
              }
            />
            <Route
              path="/settings"
              element={
                <Settings
                  settings={settings}
                  onSave={handleSaveSettings}
                  connected={connected}
                />
              }
            />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
