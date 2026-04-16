import React, { useState } from 'react';

const TAX_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married_jointly', label: 'Married Filing Jointly' },
  { value: 'married_separately', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
];

export default function Settings({ settings, onSave, connected }) {
  const [form, setForm] = useState({ ...settings });
  const [saved, setSaved] = useState(false);

  const updateField = (section, field, value) => {
    if (section) {
      setForm((prev) => ({
        ...prev,
        [section]: { ...prev[section], [field]: value },
      }));
    } else {
      setForm((prev) => ({ ...prev, [field]: value }));
    }
    setSaved(false);
  };

  const addDeduction = () => {
    setForm((prev) => ({
      ...prev,
      deductions: [...(prev.deductions || []), { name: '', type: 'flat', value: 0, preTax: true }],
    }));
    setSaved(false);
  };

  const updateDeduction = (index, field, value) => {
    setForm((prev) => {
      const deductions = [...prev.deductions];
      deductions[index] = { ...deductions[index], [field]: value };
      return { ...prev, deductions };
    });
    setSaved(false);
  };

  const removeDeduction = (index) => {
    setForm((prev) => ({
      ...prev,
      deductions: prev.deductions.filter((_, i) => i !== index),
    }));
    setSaved(false);
  };

  const handleSave = async () => {
    await onSave(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="settings">
      <h2>Settings</h2>

      <div className="card">
        <h3>Geotab Connection</h3>
        <div className="status-badge">
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Not connected'}
        </div>
        <div className="form-grid">
          <div className="form-group">
            <label>Server</label>
            <input
              type="text"
              value={form.geotab?.server || ''}
              onChange={(e) => updateField('geotab', 'server', e.target.value)}
              placeholder="my.geotab.com"
            />
          </div>
          <div className="form-group">
            <label>Database</label>
            <input
              type="text"
              value={form.geotab?.database || ''}
              onChange={(e) => updateField('geotab', 'database', e.target.value)}
              placeholder="Your database name"
            />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={form.geotab?.username || ''}
              onChange={(e) => updateField('geotab', 'username', e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={form.geotab?.password || ''}
              onChange={(e) => updateField('geotab', 'password', e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Pay Configuration</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Hourly Rate ($)</label>
            <input
              type="number"
              step="0.01"
              value={form.payRate}
              onChange={(e) => updateField(null, 'payRate', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className="form-group">
            <label>Overtime After (hours)</label>
            <input
              type="number"
              value={form.overtimeThreshold}
              onChange={(e) => updateField(null, 'overtimeThreshold', parseFloat(e.target.value) || 40)}
            />
          </div>
          <div className="form-group">
            <label>Overtime Multiplier</label>
            <input
              type="number"
              step="0.1"
              value={form.overtimeMultiplier}
              onChange={(e) => updateField(null, 'overtimeMultiplier', parseFloat(e.target.value) || 1.5)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Tax Status</h3>
        <div className="form-grid">
          <div className="form-group">
            <label>Filing Status</label>
            <select
              value={form.taxStatus}
              onChange={(e) => updateField(null, 'taxStatus', e.target.value)}
            >
              {TAX_STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>W-4 Step 3 Credits ($/year)</label>
            <input
              type="number"
              step="1"
              value={form.w4Credits ?? 0}
              onChange={(e) => updateField(null, 'w4Credits', parseFloat(e.target.value) || 0)}
              placeholder="e.g. 2000 per child under 17"
            />
          </div>
        </div>
        <p className="help-text" style={{ marginTop: '8px' }}>
          W-4 Step 3: $2,000 per child under 17, $500 per other dependent. Check your W-4 form.
        </p>
      </div>

      <div className="card">
        <h3>Paycheck Deductions</h3>
        <p className="help-text">Add recurring deductions like insurance, 401k, union dues, etc.</p>
        {(form.deductions || []).map((d, i) => (
          <div className="deduction-row" key={i}>
            <input
              type="text"
              placeholder="Name (e.g., Health Insurance)"
              value={d.name}
              onChange={(e) => updateDeduction(i, 'name', e.target.value)}
            />
            <select
              value={d.type}
              onChange={(e) => updateDeduction(i, 'type', e.target.value)}
            >
              <option value="flat">$ Flat</option>
              <option value="percentage">% of Gross</option>
            </select>
            <input
              type="number"
              step="0.01"
              value={d.value}
              onChange={(e) => updateDeduction(i, 'value', parseFloat(e.target.value) || 0)}
              placeholder={d.type === 'percentage' ? '%' : '$'}
            />
            <label className="pretax-toggle">
              <input
                type="checkbox"
                checked={d.preTax ?? true}
                onChange={(e) => updateDeduction(i, 'preTax', e.target.checked)}
              />
              Pre-tax
            </label>
            <button className="remove-btn" onClick={() => removeDeduction(i)}>Remove</button>
          </div>
        ))}
        <button className="add-btn" onClick={addDeduction}>+ Add Deduction</button>
      </div>

      <div className="save-bar">
        <button className="save-btn" onClick={handleSave}>
          Save Settings
        </button>
        {saved && <span className="save-confirm">Settings saved!</span>}
      </div>
    </div>
  );
}
