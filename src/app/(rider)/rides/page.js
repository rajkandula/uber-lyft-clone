'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Circle, MapPin, ChevronRight, Car } from 'lucide-react';
import { RideStatusBadge, Empty, Loading, VEHICLE_LABELS, money } from '@/components/ui/bits';
import { formatDate } from '@/lib/utils/geo';

const FILTERS = [
  { key: '', label: 'All' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export default function RidesPage() {
  const [rides, setRides] = useState(null);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    let ignore = false;
    setRides(null);
    (async () => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: '15' });
        if (filter) params.set('status', filter);
        const res = await fetch(`/api/rides?${params}`);
        const data = await res.json();
        if (!ignore && res.ok) {
          setRides(data.rides);
          setPagination(data.pagination);
        }
      } catch {
        if (!ignore) setRides([]);
      }
    })();
    return () => { ignore = true; };
  }, [filter, page]);

  return (
    <div className="content-pad">
      <h1 className="page-title">My rides</h1>
      <p className="page-sub mb-6">Every trip you’ve taken with Kova</p>

      <div className="segmented mb-6" role="tablist">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={filter === f.key}
            className={filter === f.key ? 'active' : ''}
            onClick={() => { setFilter(f.key); setPage(1); }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {rides === null && <Loading label="Loading your rides…" />}

      {rides?.length === 0 && (
        <Empty
          icon={Car}
          title="No rides yet"
          hint="Your trips will appear here after you book your first ride."
          action={<Link href="/dashboard" className="btn btn-primary mt-2">Book a ride</Link>}
        />
      )}

      <div className="flex-col gap-3">
        {rides?.map((ride) => (
          <Link key={ride._id} href={`/rides/${ride._id}`} className="card card-pad card-hover">
            <div className="flex items-center justify-between mb-3">
              <span className="tiny muted">{formatDate(ride.createdAt)}</span>
              <RideStatusBadge status={ride.status} />
            </div>
            <div className="flex-col gap-1 small">
              <div className="flex gap-2 items-center">
                <Circle size={12} style={{ color: 'var(--ink-950)', flexShrink: 0 }} />
                <span className="truncate">{ride.pickup?.address}</span>
              </div>
              <div className="flex gap-2 items-center">
                <MapPin size={12} style={{ color: 'var(--gold-600)', flexShrink: 0 }} />
                <span className="truncate">{ride.dropoff?.address}</span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3" style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 10 }}>
              <span className="tiny muted">{VEHICLE_LABELS[ride.vehicleType] || ride.vehicleType}</span>
              <span className="flex items-center gap-1 small" style={{ fontWeight: 700 }}>
                {ride.status === 'completed' ? money(ride.fare?.total) : ride.status === 'cancelled' && ride.fare?.cancellationFee > 0 ? money(ride.fare.cancellationFee) : '—'}
                <ChevronRight size={15} style={{ color: 'var(--ink-400)' }} />
              </span>
            </div>
          </Link>
        ))}
      </div>

      {pagination && pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </button>
          <span className="small muted" style={{ alignSelf: 'center' }}>
            {page} / {pagination.pages}
          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= pagination.pages} onClick={() => setPage((p) => p + 1)}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
