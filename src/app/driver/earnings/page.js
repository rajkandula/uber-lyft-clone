'use client';

import Link from 'next/link';
import PayoutCard from '@/components/driver/PayoutCard';

import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Star, CheckCircle2 } from 'lucide-react';
import { Loading, Empty, money } from '@/components/ui/bits';
import { formatRelativeTime, formatDistance } from '@/lib/utils/geo';

export default function EarningsPage() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/drivers/me/earnings');
        if (!res.ok) throw new Error();
        const payload = await res.json();
        if (!ignore) setData(payload);
      } catch {
        if (!ignore) setFailed(true);
      }
    })();
    return () => { ignore = true; };
  }, []);

  if (failed) {
    return (
      <div className="content-pad">
        <Empty icon={DollarSign} title="Couldn’t load earnings" hint="Check your connection and refresh." />
      </div>
    );
  }
  if (!data) return <div className="content-pad"><Loading label="Loading earnings…" /></div>;

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const byDay = new Map((data.week.byDay || []).map((d) => [d._id, d]));
  const weekBars = [];
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  let maxDay = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const earnings = byDay.get(key)?.earnings || 0;
    maxDay = Math.max(maxDay, earnings);
    weekBars.push({ label: days[i], earnings, isToday: key === new Date().toISOString().slice(0, 10) });
  }

  return (
    <div className="content-pad" style={{ maxWidth: 860 }}>
      <h1 className="page-title">Earnings</h1>
      <p className="page-sub mb-6">Your money at a glance</p>

      <PayoutCard />

      {data.wallet?.balance < 0 && (
        <div
          className="card card-pad mb-4 flex items-center justify-between wrap gap-3"
          style={{ borderColor: 'var(--danger)', background: 'var(--danger-bg)' }}
        >
          <div>
            <div className="small" style={{ fontWeight: 700, color: 'var(--danger)' }}>
              Outstanding balance: {money(Math.abs(data.wallet.balance))}
            </div>
            <div className="tiny muted mt-1">
              Top up to clear it — driving is paused below $25 owed.
            </div>
          </div>
          <Link href="/driver/wallet" className="btn btn-primary btn-sm">Settle up</Link>
        </div>
      )}

      <div className="grid-3">
        <div className="card card-pad stat">
          <span className="stat-label">Today</span>
          <span className="stat-value">{money(data.today.earnings)}</span>
          <span className="tiny muted">{data.today.trips} trip{data.today.trips === 1 ? '' : 's'}</span>
        </div>
        <div className="card card-pad stat">
          <span className="stat-label">This week</span>
          <span className="stat-value">{money(data.week.total)}</span>
          <span className="tiny muted">{data.week.trips} trip{data.week.trips === 1 ? '' : 's'}</span>
        </div>
        <div className="card card-pad stat">
          <span className="stat-label">All time</span>
          <span className="stat-value">{money(data.stats.totalEarnings || 0)}</span>
          <span className="tiny muted">{data.stats.totalTrips || 0} trips</span>
        </div>
      </div>

      {/* Week chart */}
      <div className="card card-pad mt-4">
        <h3 className="small mb-4" style={{ fontWeight: 700 }}>This week</h3>
        <div className="flex items-center gap-2" style={{ height: 120, alignItems: 'flex-end' }}>
          {weekBars.map((bar) => (
            <div key={bar.label} className="flex-col items-center gap-2 flex-1">
              <div
                title={money(bar.earnings)}
                style={{
                  width: '100%',
                  maxWidth: 44,
                  height: Math.max(4, maxDay ? (bar.earnings / maxDay) * 90 : 4),
                  borderRadius: 6,
                  background: bar.isToday ? 'var(--gold-600)' : 'var(--ink-900)',
                  opacity: bar.earnings === 0 ? 0.15 : 1,
                  transition: 'height 400ms var(--ease)',
                }}
              />
              <span className="tiny muted">{bar.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Performance */}
      <div className="grid-3 mt-4">
        <div className="card card-pad flex items-center gap-3">
          <Star size={20} style={{ color: 'var(--gold-600)' }} />
          <div>
            <div style={{ fontWeight: 700 }} className="mono-nums">{(data.stats.averageRating ?? 5).toFixed(1)}</div>
            <div className="tiny muted">Rating</div>
          </div>
        </div>
        <div className="card card-pad flex items-center gap-3">
          <CheckCircle2 size={20} style={{ color: 'var(--success)' }} />
          <div>
            <div style={{ fontWeight: 700 }} className="mono-nums">{data.stats.acceptanceRate ?? 100}%</div>
            <div className="tiny muted">Acceptance</div>
          </div>
        </div>
        <div className="card card-pad flex items-center gap-3">
          <TrendingUp size={20} style={{ color: 'var(--info)' }} />
          <div>
            <div style={{ fontWeight: 700 }} className="mono-nums">{data.stats.totalTrips || 0}</div>
            <div className="tiny muted">Total trips</div>
          </div>
        </div>
      </div>

      {/* Recent trips */}
      <h2 className="small mt-8 mb-3" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
        Recent trips
      </h2>
      {data.recentRides.length === 0 ? (
        <Empty icon={DollarSign} title="No trips yet" hint="Go online to start earning." />
      ) : (
        <div className="card">
          {data.recentRides.map((r, i) => (
            <div
              key={r._id}
              className="flex items-center gap-3"
              style={{ padding: '14px 18px', borderBottom: i < data.recentRides.length - 1 ? '1px solid var(--ink-100)' : 'none' }}
            >
              <div className="flex-1" style={{ minWidth: 0 }}>
                <div className="small truncate" style={{ fontWeight: 600 }}>
                  {r.dropoff?.address}
                </div>
                <div className="tiny muted">
                  {formatRelativeTime(r.completedAt)} · {formatDistance(r.route?.distanceMeters || 0)}
                </div>
              </div>
              <span className="small mono-nums" style={{ fontWeight: 700, color: 'var(--success)' }}>
                +{money(r.fare?.driverEarnings)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
