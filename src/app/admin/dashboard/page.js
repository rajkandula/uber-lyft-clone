'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Route, DollarSign, Car, Users, ArrowRight, Inbox } from 'lucide-react';
import MapView from '@/components/maps/MapView';
import { useSocket } from '@/context/SocketProvider';
import { RideStatusBadge, Loading, money } from '@/components/ui/bits';
import { formatRelativeTime } from '@/lib/utils/geo';

export default function AdminDashboard() {
  const { socket } = useSocket();
  const [data, setData] = useState(null);
  const [liveDrivers, setLiveDrivers] = useState([]);
  const driversRef = useRef(new Map());

  async function load() {
    try {
      const res = await fetch('/api/admin/overview');
      if (res.ok) setData(await res.json());
    } catch { /* retry on next refresh */ }
  }

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, []);

  // Live driver positions + ride updates over the admin socket
  useEffect(() => {
    if (!socket) return undefined;

    const onLocation = (d) => {
      if (!d?.location) return;
      driversRef.current.set(d.driverProfileId, {
        id: d.driverProfileId,
        location: d.location,
      });
      setLiveDrivers([...driversRef.current.values()]);
    };
    const onRideUpdated = () => load();
    const onDriverStatus = (d) => {
      if (d.online === false) {
        driversRef.current.delete(d.driverProfileId);
        setLiveDrivers([...driversRef.current.values()]);
      }
      load();
    };

    socket.on('driver:location', onLocation);
    socket.on('ride:updated', onRideUpdated);
    socket.on('driver:status-changed', onDriverStatus);
    return () => {
      socket.off('driver:location', onLocation);
      socket.off('ride:updated', onRideUpdated);
      socket.off('driver:status-changed', onDriverStatus);
    };
  }, [socket]);

  if (!data) return <div className="content-pad"><Loading label="Loading overview…" /></div>;

  // Build the 7-day revenue series (fill missing days with zero)
  const byDay = new Map((data.revenue7d || []).map((d) => [d._id, d]));
  const weekBars = [];
  let maxDayRevenue = 0;
  const week = { driverEarnings: 0, platformFees: 0, trips: 0 };
  const todayKey = new Date().toISOString().slice(0, 10);
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const day = byDay.get(key);
    const revenue = day?.revenue || 0;
    maxDayRevenue = Math.max(maxDayRevenue, revenue);
    week.driverEarnings += day?.driverEarnings || 0;
    week.platformFees += day?.platformFees || 0;
    week.trips += day?.trips || 0;
    weekBars.push({
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      revenue,
      isToday: key === todayKey,
    });
  }

  const stats = [
    { label: 'Rides today', value: data.ridesToday, icon: Route, tone: 'var(--info)' },
    { label: 'Active now', value: data.activeRides, icon: Car, tone: 'var(--gold-600)' },
    { label: 'Gross bookings today', value: money(data.revenueToday), icon: DollarSign, tone: 'var(--success)' },
    { label: 'Online drivers', value: data.onlineDrivers, icon: Users, tone: 'var(--ink-700)' },
  ];

  return (
    <div className="content-pad">
      <div className="flex items-center justify-between mb-6 wrap gap-3">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">Platform health in real time</p>
        </div>
        <div className="flex gap-2 wrap">
          {data.pendingDrivers > 0 && (
            <Link href="/admin/drivers?pending=1" className="btn btn-gold btn-sm">
              {data.pendingDrivers} driver{data.pendingDrivers > 1 ? 's' : ''} awaiting approval
              <ArrowRight size={15} />
            </Link>
          )}
          {data.openSupport > 0 && (
            <Link href="/admin/support" className="btn btn-secondary btn-sm">
              <Inbox size={15} /> {data.openSupport} open support message{data.openSupport > 1 ? 's' : ''}
            </Link>
          )}
        </div>
      </div>

      <div className="grid-4">
        {stats.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card card-pad flex items-center gap-3">
            <span className="avatar" style={{ background: 'var(--ink-50)', color: tone }}>
              <Icon size={19} />
            </span>
            <div className="stat">
              <span className="stat-label">{label}</span>
              <span className="stat-value" style={{ fontSize: '1.4rem' }}>{value}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="admin-split mt-4">
        <div className="card" style={{ height: 380, overflow: 'hidden', position: 'relative' }}>
          <MapView center={{ lat: 40.7128, lng: -74.006 }} zoom={12} drivers={liveDrivers} />
          <span
            className="badge badge-success badge-dot"
            style={{ position: 'absolute', top: 12, left: 12, zIndex: 5, background: '#fff', boxShadow: 'var(--shadow-sm)' }}
          >
            {liveDrivers.length} live driver{liveDrivers.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="card card-pad" style={{ overflowY: 'auto', maxHeight: 380 }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="small" style={{ fontWeight: 700 }}>Recent rides</h3>
            <Link href="/admin/rides" className="tiny" style={{ fontWeight: 600, color: 'var(--gold-700)' }}>
              View all
            </Link>
          </div>
          <div className="flex-col gap-3">
            {data.recentRides.length === 0 && <p className="small muted">No rides yet.</p>}
            {data.recentRides.map((r) => (
              <div key={r._id} className="flex items-center gap-3" style={{ borderBottom: '1px solid var(--ink-100)', paddingBottom: 10 }}>
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div className="tiny truncate" style={{ fontWeight: 600 }}>
                    {r.riderId?.name || '—'} → {r.dropoff?.address}
                  </div>
                  <div className="tiny muted">{formatRelativeTime(r.createdAt)}</div>
                </div>
                <RideStatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7-day money flow: revenue split between drivers and platform */}
      <div className="card card-pad mt-4">
        <div className="flex items-center justify-between mb-4 wrap gap-2">
          <h3 className="small" style={{ fontWeight: 700 }}>Last 7 days</h3>
          <span className="tiny muted">
            {money(week.driverEarnings)} to drivers · {money(week.platformFees)} platform fees ·{' '}
            {week.trips} trips
          </span>
        </div>
        <div className="flex gap-2" style={{ height: 110, alignItems: 'flex-end' }}>
          {weekBars.map((bar) => (
            <div key={bar.key} className="flex-col items-center gap-2 flex-1">
              <div
                title={`${bar.label}: ${money(bar.revenue)}`}
                style={{
                  width: '100%',
                  maxWidth: 56,
                  height: Math.max(4, maxDayRevenue ? (bar.revenue / maxDayRevenue) * 84 : 4),
                  borderRadius: 6,
                  background: bar.isToday ? 'var(--gold-600)' : 'var(--ink-900)',
                  opacity: bar.revenue === 0 ? 0.15 : 1,
                  transition: 'height 400ms var(--ease)',
                }}
              />
              <span className="tiny muted">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-4 mt-4">
        <div className="card card-pad stat">
          <span className="stat-label">Total riders</span>
          <span className="stat-value">{data.totalUsers}</span>
        </div>
        <div className="card card-pad stat">
          <span className="stat-label">Total drivers</span>
          <span className="stat-value">{data.totalDrivers}</span>
        </div>
        <div className="card card-pad stat">
          <span className="stat-label">Platform fees today</span>
          <span className="stat-value">{money(data.platformFeesToday)}</span>
                  </div>
        <div className="card card-pad stat">
          <span className="stat-label">Completed this week</span>
          <span className="stat-value">{data.statusBreakdown?.completed || 0}</span>
          <span className="tiny muted">
            {data.statusBreakdown?.cancelled || 0} cancelled · {data.statusBreakdown?.no_drivers || 0} unfilled
          </span>
        </div>
      </div>
    </div>
  );
}
