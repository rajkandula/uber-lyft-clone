'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Car, CheckCircle2, Ban } from 'lucide-react';
import { Avatar, Loading, Empty, VEHICLE_LABELS, money } from '@/components/ui/bits';
import { useToast } from '@/components/ui/Toast';

function DriversAdmin() {
  const toast = useToast();
  const searchParams = useSearchParams();
  const [pendingOnly, setPendingOnly] = useState(searchParams.get('pending') === '1');
  const [drivers, setDrivers] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setDrivers(null);
    try {
      const res = await fetch(`/api/admin/drivers${pendingOnly ? '?pending=1' : ''}`);
      const data = await res.json();
      if (res.ok) setDrivers(data.drivers);
      else setDrivers([]);
    } catch {
      setDrivers([]);
    }
  }, [pendingOnly]);

  useEffect(() => { load(); }, [load]);

  async function setApproval(driverId, isApproved) {
    setBusyId(driverId);
    try {
      const res = await fetch('/api/admin/drivers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ driverId, isApproved }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Update failed', 'error');
      } else {
        toast(isApproved ? 'Driver approved' : 'Driver suspended', 'success');
        load();
      }
    } catch {
      toast('Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="content-pad">
      <div className="flex items-center justify-between mb-6 wrap gap-3">
        <div>
          <h1 className="page-title">Drivers</h1>
          <p className="page-sub">Approve, monitor and manage your fleet</p>
        </div>
        <div className="segmented">
          <button className={!pendingOnly ? 'active' : ''} onClick={() => setPendingOnly(false)}>All</button>
          <button className={pendingOnly ? 'active' : ''} onClick={() => setPendingOnly(true)}>Pending</button>
        </div>
      </div>

      {drivers === null && <Loading label="Loading drivers…" />}
      {drivers?.length === 0 && (
        <Empty icon={Car} title={pendingOnly ? 'No pending applications' : 'No drivers yet'} hint={pendingOnly ? 'New driver signups awaiting approval will appear here.' : 'Drivers who sign up will appear here.'} />
      )}

      {drivers?.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Tier</th>
                <th>Trips</th>
                <th>Rating</th>
                <th>Earnings</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d._id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={d.userId?.name || '?'} src={d.userId?.avatar} size="sm" />
                      <div>
                        <div className="small" style={{ fontWeight: 600 }}>{d.userId?.name || '—'}</div>
                        <div className="tiny muted">@{d.userId?.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small">
                    {d.vehicle?.plate
                      ? `${d.vehicle.color} ${d.vehicle.make} ${d.vehicle.model} · ${d.vehicle.plate}`
                      : <span className="muted tiny">No vehicle yet</span>}
                  </td>
                  <td className="tiny">{VEHICLE_LABELS[d.vehicle?.type] || '—'}</td>
                  <td className="small mono-nums">{d.stats?.totalTrips || 0}</td>
                  <td className="small mono-nums">{(d.stats?.averageRating ?? 5).toFixed(1)}</td>
                  <td className="small mono-nums">{money(d.stats?.totalEarnings || 0)}</td>
                  <td>
                    {d.isApproved ? (
                      d.isOnline
                        ? <span className="badge badge-success badge-dot">Online</span>
                        : <span className="badge badge-neutral badge-dot">Offline</span>
                    ) : (
                      <span className="badge badge-warning badge-dot">Pending</span>
                    )}
                  </td>
                  <td className="text-right">
                    {d.isApproved ? (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={busyId === d._id}
                        onClick={() => setApproval(d._id, false)}
                      >
                        <Ban size={14} /> Suspend
                      </button>
                    ) : (
                      <button
                        className="btn btn-success btn-sm"
                        disabled={busyId === d._id}
                        onClick={() => setApproval(d._id, true)}
                      >
                        <CheckCircle2 size={14} /> Approve
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminDriversPage() {
  return (
    <Suspense fallback={null}>
      <DriversAdmin />
    </Suspense>
  );
}
