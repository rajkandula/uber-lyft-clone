'use client';

import { useEffect, useState } from 'react';
import { Car, Check } from 'lucide-react';
import ProfileCard from '@/components/profile/ProfileCard';
import { useToast } from '@/components/ui/Toast';
import { VEHICLE_LABELS } from '@/components/ui/bits';

const EMPTY_VEHICLE = { make: '', model: '', year: '', color: '', plate: '', type: 'economy' };

export default function DriverProfilePage() {
  const toast = useToast();
  const [driver, setDriver] = useState(null);
  const [vehicle, setVehicle] = useState(EMPTY_VEHICLE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/drivers/me');
        if (res.ok) {
          const { driver: d } = await res.json();
          if (!ignore) {
            setDriver(d);
            if (d.vehicle?.plate) {
              setVehicle({ ...d.vehicle, year: String(d.vehicle.year || '') });
            }
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { ignore = true; };
  }, []);

  const set = (key) => (e) => setVehicle((v) => ({ ...v, [key]: e.target.value }));

  async function saveVehicle(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/drivers/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle: { ...vehicle, year: parseInt(vehicle.year, 10) },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Failed to save vehicle', 'error', 5000);
      } else {
        setDriver(data.driver);
        toast('Vehicle saved — you can go online now', 'success');
      }
    } catch {
      toast('Failed to save vehicle', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-pad" style={{ maxWidth: 640 }}>
      <h1 className="page-title">Profile</h1>
      <p className="page-sub mb-6">Your account and vehicle</p>

      <ProfileCard>
        <div className="card card-pad mt-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="flex items-center gap-2" style={{ fontSize: '1.05rem' }}>
              <Car size={19} /> Vehicle
            </h3>
            {driver?.isApproved ? (
              <span className="badge badge-success badge-dot">Approved</span>
            ) : driver ? (
              <span className="badge badge-warning badge-dot">Pending approval</span>
            ) : null}
          </div>

          <form onSubmit={saveVehicle} className="flex-col gap-4">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-make">Make</label>
                <input id="v-make" className="input" value={vehicle.make} onChange={set('make')} placeholder="Toyota" required />
              </div>
              <div className="field">
                <label htmlFor="v-model">Model</label>
                <input id="v-model" className="input" value={vehicle.model} onChange={set('model')} placeholder="Camry" required />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-year">Year</label>
                <input id="v-year" className="input" type="number" min={1990} max={2030} value={vehicle.year} onChange={set('year')} placeholder="2022" required />
              </div>
              <div className="field">
                <label htmlFor="v-color">Color</label>
                <input id="v-color" className="input" value={vehicle.color} onChange={set('color')} placeholder="Silver" required />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="v-plate">License plate</label>
                <input id="v-plate" className="input" value={vehicle.plate} onChange={(e) => setVehicle((v) => ({ ...v, plate: e.target.value.toUpperCase() }))} placeholder="ABC 1234" required />
              </div>
              <div className="field">
                <label htmlFor="v-type">Service tier</label>
                <select id="v-type" className="input" value={vehicle.type} onChange={set('type')}>
                  {Object.entries(VEHICLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" /> : <><Check size={17} /> Save vehicle</>}
            </button>
          </form>
        </div>
      </ProfileCard>
    </div>
  );
}
