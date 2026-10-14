'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Circle, MapPin } from 'lucide-react';
import MapView from '@/components/maps/MapView';
import { RideStatusBadge, Avatar, Stars, Loading, VEHICLE_LABELS, money } from '@/components/ui/bits';
import { formatDate, formatDistance, formatDuration } from '@/lib/utils/geo';

export default function RideDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/rides/${id}`);
        if (!res.ok) { if (!ignore) setNotFound(true); return; }
        const payload = await res.json();
        if (!ignore) setData(payload);
      } catch {
        if (!ignore) setNotFound(true);
      }
    })();
    return () => { ignore = true; };
  }, [id]);

  if (notFound) {
    return (
      <div className="content-pad">
        <p className="muted">Ride not found.</p>
      </div>
    );
  }

  if (!data) return <div className="content-pad"><Loading /></div>;

  const { ride } = data;

  return (
    <div className="content-pad" style={{ maxWidth: 760 }}>
      <button className="btn btn-ghost btn-sm mb-4" onClick={() => router.back()}>
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">{VEHICLE_LABELS[ride.vehicleType]}</h1>
          <p className="page-sub">{formatDate(ride.createdAt)}</p>
        </div>
        <RideStatusBadge status={ride.status} />
      </div>

      <div className="card" style={{ height: 260, overflow: 'hidden', position: 'relative' }}>
        <MapView
          center={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
          pickup={{ lat: ride.pickup.lat, lng: ride.pickup.lng }}
          dropoff={{ lat: ride.dropoff.lat, lng: ride.dropoff.lng }}
          routeGeometry={ride.route?.geometry}
          fit
        />
      </div>

      <div className="card card-pad mt-4">
        <div className="flex-col gap-2 small">
          <div className="flex gap-2">
            <Circle size={14} style={{ marginTop: 3, color: 'var(--ink-950)', flexShrink: 0 }} />
            <span>{ride.pickup.address}</span>
          </div>
          <div className="flex gap-2">
            <MapPin size={14} style={{ marginTop: 3, color: 'var(--gold-600)', flexShrink: 0 }} />
            <span>{ride.dropoff.address}</span>
          </div>
        </div>
        <div className="flex gap-4 mt-3 tiny muted">
          <span>{formatDistance(ride.route?.distanceMeters || 0)}</span>
          <span>{formatDuration(ride.route?.durationSeconds || 0)}</span>
        </div>
      </div>

      {ride.driver && (
        <div className="card card-pad mt-4 flex items-center gap-3">
          <Avatar name={ride.driver.name} src={ride.driver.avatar} />
          <div className="flex-1">
            <div style={{ fontWeight: 700 }}>{ride.driver.name}</div>
            <Stars value={ride.driver.rating} />
          </div>
          <div className="text-right small muted">
            {ride.driver.vehicle?.color} {ride.driver.vehicle?.make} {ride.driver.vehicle?.model}
            <div className="badge badge-neutral mt-1">{ride.driver.vehicle?.plate}</div>
          </div>
        </div>
      )}

      {(ride.status === 'completed' || ride.fare?.cancellationFee > 0) && (
        <div className="card card-pad mt-4">
          <h3 className="small mb-3" style={{ fontWeight: 700 }}>Receipt</h3>
          <div className="flex-col gap-1 small">
            {ride.status === 'completed' ? (
              <>
                <Row label="Base fare" value={money(ride.fare.baseFare)} />
                <Row label="Distance" value={money(ride.fare.distanceFare)} />
                <Row label="Time" value={money(ride.fare.timeFare)} />
                {ride.fare.surgeFare > 0 && <Row label={`Surge ${ride.fare.surgeMultiplier}×`} value={money(ride.fare.surgeFare)} />}
                <Row label="Booking fee" value={money(ride.fare.bookingFee)} />
                <div style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8 }}>
                  <Row label={<b>Total ({ride.payment?.method})</b>} value={<b>{money(ride.fare.total)}</b>} />
                </div>
              </>
            ) : (
              <Row label="Cancellation fee" value={money(ride.fare.cancellationFee)} />
            )}
          </div>
        </div>
      )}

      {ride.rating?.byRider && (
        <div className="card card-pad mt-4">
          <h3 className="small mb-2" style={{ fontWeight: 700 }}>Your rating</h3>
          <Stars value={ride.rating.byRider} />
          {ride.rating.riderComment && <p className="small muted mt-2">“{ride.rating.riderComment}”</p>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <span className="muted">{label}</span>
      <span className="mono-nums">{value}</span>
    </div>
  );
}
