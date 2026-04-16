import React, { useState } from 'react';
import { calculateWeeklyGross, calculateDeductions } from '../utils/payCalculator';

function formatMoney(amount) {
  return '$' + amount.toFixed(2);
}

function formatHours(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

export default function Dashboard({ weeklyData, settings, loading, connected, onRefresh, onPreviousWeek, onNextWeek, onCurrentWeek, isCurrentWeek }) {
  const [additionalPay, setAdditionalPay] = useState({ holidayPay: 0, ptoPay: 0, travelPay: 0 });

  if (!connected) {
    return (
      <div className="dashboard">
        <h2>Dashboard</h2>
        <div className="card connect-prompt">
          <p>Connect to Geotab to start tracking your hours.</p>
          <p>Go to <strong>Settings</strong> to enter your Geotab credentials.</p>
        </div>
      </div>
    );
  }

  if (loading && !weeklyData) {
    return (
      <div className="dashboard">
        <h2>Dashboard</h2>
        <div className="card">
          <p>Loading your hours...</p>
        </div>
      </div>
    );
  }

  const totalHours = weeklyData?.totalHours || 0;
  const dailyBreakdown = weeklyData?.dailyBreakdown || [];

  const { regularHours, overtimeHours, regularPay, overtimePay, holidayPay, ptoPay, travelPay, grossPay } =
    calculateWeeklyGross(totalHours, settings.payRate, settings.overtimeThreshold, settings.overtimeMultiplier, additionalPay);

  const deductionResult = calculateDeductions(grossPay, settings.taxStatus, settings.deductions, settings.w4Credits || 0);

  const weekStart = weeklyData?.weekStart
    ? new Date(weeklyData.weekStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  const weekEndDate = weeklyData?.weekStart ? new Date(weeklyData.weekStart) : new Date();
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const maxDailyHours = Math.max(...dailyBreakdown.map((d) => d.hours), 1);

  const hasAdditionalPay = holidayPay > 0 || ptoPay > 0 || travelPay > 0;

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h2>Dashboard</h2>
        <div className="week-nav">
          <button className="week-nav-btn" onClick={onPreviousWeek} disabled={loading}>&#9664;</button>
          <div className="week-label">Week of {weekStart} – {weekEnd}</div>
          <button className="week-nav-btn" onClick={onNextWeek} disabled={loading || isCurrentWeek}>&#9654;</button>
          {!isCurrentWeek && (
            <button className="today-btn" onClick={onCurrentWeek} disabled={loading}>Today</button>
          )}
        </div>
        <button className="refresh-btn" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="summary-cards">
        <div className="card highlight">
          <div className="card-label">Total Hours</div>
          <div className="card-value">{formatHours(totalHours)}</div>
          <div className="card-detail">
            {formatHours(regularHours)} regular
            {overtimeHours > 0 && <> + {formatHours(overtimeHours)} OT</>}
          </div>
        </div>

        <div className="card highlight">
          <div className="card-label">Gross Pay</div>
          <div className="card-value">{formatMoney(grossPay)}</div>
          <div className="card-detail">
            {formatMoney(regularPay)} regular
            {overtimePay > 0 && <> + {formatMoney(overtimePay)} OT</>}
            {hasAdditionalPay && <> + {formatMoney(holidayPay + ptoPay + travelPay)} other</>}
          </div>
        </div>

        <div className="card highlight net-pay">
          <div className="card-label">Net Pay (Est.)</div>
          <div className="card-value">{formatMoney(deductionResult.netPay)}</div>
          <div className="card-detail">
            After {formatMoney(deductionResult.totalDeductions)} deductions
          </div>
        </div>
      </div>

      <div className="card daily-chart">
        <h3>Daily Breakdown</h3>
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
                {isZeroDay && day.dayName !== 'Sat' && day.dayName !== 'Sun' && (
                  <div className="day-tag pto-tag">PTO/Holiday?</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card additional-pay-section">
        <h3>Additional Pay (This Week)</h3>
        <p className="help-text">Add holiday, PTO, or travel pay not tracked by Geotab.</p>
        <div className="additional-pay-grid">
          <div className="additional-pay-item">
            <label>Holiday Pay ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={additionalPay.holidayPay || ''}
              placeholder="0.00"
              onChange={(e) => setAdditionalPay((prev) => ({ ...prev, holidayPay: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="additional-pay-item">
            <label>PTO Pay ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={additionalPay.ptoPay || ''}
              placeholder="0.00"
              onChange={(e) => setAdditionalPay((prev) => ({ ...prev, ptoPay: parseFloat(e.target.value) || 0 }))}
            />
          </div>
          <div className="additional-pay-item">
            <label>Travel Pay ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={additionalPay.travelPay || ''}
              placeholder="0.00"
              onChange={(e) => setAdditionalPay((prev) => ({ ...prev, travelPay: parseFloat(e.target.value) || 0 }))}
            />
          </div>
        </div>
      </div>

      <div className="card deductions-breakdown">
        <h3>Deductions Breakdown</h3>
        <table>
          <tbody>
            <tr>
              <td>Federal Income Tax</td>
              <td className="amount">{formatMoney(deductionResult.federalTax)}</td>
            </tr>
            <tr>
              <td>Social Security (6.2%)</td>
              <td className="amount">{formatMoney(deductionResult.socialSecurity)}</td>
            </tr>
            <tr>
              <td>Medicare (1.45%)</td>
              <td className="amount">{formatMoney(deductionResult.medicare)}</td>
            </tr>
            {deductionResult.customDeductions.filter(d => d.preTax).length > 0 && (
              <tr className="section-label">
                <td colSpan="2">Pre-Tax Deductions</td>
              </tr>
            )}
            {deductionResult.customDeductions.filter(d => d.preTax).map((d, i) => (
              <tr key={`pre-${i}`}>
                <td>{d.name}</td>
                <td className="amount">{formatMoney(d.amount)}</td>
              </tr>
            ))}
            {deductionResult.customDeductions.filter(d => !d.preTax).length > 0 && (
              <tr className="section-label">
                <td colSpan="2">Post-Tax Deductions</td>
              </tr>
            )}
            {deductionResult.customDeductions.filter(d => !d.preTax).map((d, i) => (
              <tr key={`post-${i}`}>
                <td>{d.name}</td>
                <td className="amount">{formatMoney(d.amount)}</td>
              </tr>
            ))}
            <tr className="total-row">
              <td><strong>Total Deductions</strong></td>
              <td className="amount"><strong>{formatMoney(deductionResult.totalDeductions)}</strong></td>
            </tr>
          </tbody>
        </table>
      </div>

      {hasAdditionalPay && (
        <div className="card earnings-breakdown">
          <h3>Earnings Breakdown</h3>
          <table>
            <tbody>
              <tr>
                <td>Regular Pay ({formatHours(regularHours)})</td>
                <td className="amount">{formatMoney(regularPay)}</td>
              </tr>
              {overtimePay > 0 && (
                <tr>
                  <td>Overtime Pay ({formatHours(overtimeHours)})</td>
                  <td className="amount">{formatMoney(overtimePay)}</td>
                </tr>
              )}
              {holidayPay > 0 && (
                <tr>
                  <td>Holiday Pay</td>
                  <td className="amount">{formatMoney(holidayPay)}</td>
                </tr>
              )}
              {ptoPay > 0 && (
                <tr>
                  <td>PTO Pay</td>
                  <td className="amount">{formatMoney(ptoPay)}</td>
                </tr>
              )}
              {travelPay > 0 && (
                <tr>
                  <td>Travel Pay</td>
                  <td className="amount">{formatMoney(travelPay)}</td>
                </tr>
              )}
              <tr className="total-row">
                <td><strong>Gross Pay</strong></td>
                <td className="amount"><strong>{formatMoney(grossPay)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
