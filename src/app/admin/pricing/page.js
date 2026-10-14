'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Loading, VEHICLE_LABELS } from '@/components/ui/bits';
import { useToast } from '@/components/ui/Toast';

// Driver-first defaults: single-digit commission, low rider rates
const DEFAULTS = {
  economy: { baseFare: 2.0, perKmRate: 1.0, perMinRate: 0.15, minimumFare: 4, bookingFee: 0.5, platformCommission: 8, surgeMultiplierCap: 3 },
  comfort: { baseFare: 3.0, perKmRate: 1.5, perMinRate: 0.25, minimumFare: 6.5, bookingFee: 0.75, platformCommission: 8, surgeMultiplierCap: 3 },
  premium: { baseFare: 5.0, perKmRate: 2.5, perMinRate: 0.4, minimumFare: 12, bookingFee: 1.0, platformCommission: 10, surgeMultiplierCap: 3 },
  xl: { baseFare: 4.0, perKmRate: 1.8, perMinRate: 0.3, minimumFare: 8, bookingFee: 0.75, platformCommission: 8, surgeMultiplierCap: 3 },
};

const FIELDS = [
  ['baseFare', 'Base fare ($)'],
  ['perKmRate', 'Per km ($)'],
  ['perMinRate', 'Per minute ($)'],
  ['minimumFare', 'Minimum fare ($)'],
  ['bookingFee', 'Booking fee ($)'],
  ['platformCommission', 'Commission (%)'],
  ['surgeMultiplierCap', 'Surge cap (×)'],
];

export default function AdminPricingPage() {
  const toast = useToast();
  const [rules, setRules] = useState(null);
  const [savingType, setSavingType] = useState(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/pricing');
        const data = await res.json();
        if (ignore || !res.ok) return;

        // Merge DB rules over defaults for the 'default' city
        const merged = {};
        for (const type of Object.keys(DEFAULTS)) {
          const dbRule = data.rules.find((r) => r.vehicleType === type && r.city === 'default');
          merged[type] = dbRule
            ? { ...DEFAULTS[type], ...dbRule }
            : { ...DEFAULTS[type], _unsaved: true };
        }
        setRules(merged);
      } catch {
        if (!ignore) setRules(null);
      }
    })();
    return () => { ignore = true; };
  }, []);

  const setField = (type, field) => (e) =>
    setRules((r) => ({ ...r, [type]: { ...r[type], [field]: e.target.value } }));

  async function save(type) {
    setSavingType(type);
    try {
      const rule = rules[type];
      const payload = { vehicleType: type, city: 'default', isActive: true };
      for (const [field] of FIELDS) payload[field] = parseFloat(rule[field]);

      const res = await fetch('/api/admin/pricing', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Failed to save', 'error', 5000);
      } else {
        setRules((r) => ({ ...r, [type]: { ...r[type], ...data.rule, _unsaved: false } }));
        toast(`${VEHICLE_LABELS[type]} pricing saved`, 'success');
      }
    } catch {
      toast('Failed to save', 'error');
    } finally {
      setSavingType(null);
    }
  }

  if (!rules) return <div className="content-pad"><Loading label="Loading pricing…" /></div>;

  return (
    <div className="content-pad" style={{ maxWidth: 900 }}>
      <h1 className="page-title">Pricing</h1>
      <p className="page-sub mb-6">
        Fare rules per service tier. Riders always see the final price up front.
      </p>

      <div className="grid-2">
        {Object.keys(DEFAULTS).map((type) => (
          <div key={type} className="card card-pad">
            <div className="flex items-center justify-between mb-4">
              <h3 style={{ fontSize: '1.05rem' }}>{VEHICLE_LABELS[type]}</h3>
              {rules[type]._unsaved && <span className="badge badge-warning">Using defaults</span>}
            </div>
            <div className="grid-2" style={{ gap: 12 }}>
              {FIELDS.map(([field, label]) => (
                <div key={field} className="field">
                  <label htmlFor={`${type}-${field}`} className="tiny">{label}</label>
                  <input
                    id={`${type}-${field}`}
                    className="input"
                    style={{ minHeight: 40 }}
                    type="number"
                    step="0.05"
                    min="0"
                    value={rules[type][field]}
                    onChange={setField(type, field)}
                  />
                </div>
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm mt-4"
              onClick={() => save(type)}
              disabled={savingType === type}
            >
              {savingType === type ? <span className="spinner" /> : <><Check size={14} /> Save</>}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
