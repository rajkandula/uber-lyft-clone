'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Navigation, MapPin, Circle, Car, Crown, Users, Zap, Wallet,
  MessageCircle, X, ShieldCheck, Copy, TrendingUp,
} from 'lucide-react';
import Link from 'next/link';
import MapView from '@/components/maps/MapView';
import PlaceSearch from '@/components/maps/PlaceSearch';
import ChatSheet from '@/components/ride/ChatSheet';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { Avatar, Stars, StarPicker, VEHICLE_LABELS, money } from '@/components/ui/bits';
import useRiderRide from '@/hooks/useRiderRide';
import useGeolocation from '@/hooks/useGeolocation';
import { formatDistance, formatDuration, roadDistanceMeters, etaMinutes as etaFor } from '@/lib/utils/geo';

const VEHICLE_META = {
  economy: { icon: Car, blurb: 'Everyday rides, great value' },
  comfort: { icon: Car, blurb: 'Newer cars, extra legroom' },
  premium: { icon: Crown, blurb: 'Top-rated drivers, luxury cars' },
  xl: { icon: Users, blurb: 'Up to 6 seats' },
};

const CANCEL_REASONS = [
  'Driver is taking too long',
  'Booked by mistake',
  'Changed my plans',
  'Found another ride',
];

export default function RiderDashboard() {
  const toast = useToast();
  const { position: geo, error: geoError } = useGeolocation({ watch: false });

  // Booking form state
  const [pickup, setPickup] = useState(null); // {address, lat, lng}
  const [dropoff, setDropoff] = useState(null);
  const [pickupText, setPickupText] = useState('');
  const [dropoffText, setDropoffText] = useState('');
  const [estimate, setEstimate] = useState(null); // {route, estimates}
  const [estimating, setEstimating] = useState(false);
  const [vehicleType, setVehicleType] = useState('economy');
  const [walletBalance, setWalletBalance] = useState(null);
  const [booking, setBooking] = useState(false);
  const [nearby, setNearby] = useState([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [rating, setRating] = useState(0);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(false);
  useEffect(() => {
    chatOpenRef.current = chatOpen;
  }, [chatOpen]);

  const onRideEvent = useCallback((type, data) => {
    if (type === 'accepted') toast('Driver found — they’re on the way!', 'success');
    if (type === 'arrived') toast('Your driver has arrived', 'success', 5000);
    if (type === 'started') toast('Trip started — enjoy the ride', 'info');
    if (type === 'no-drivers') toast('No drivers available right now. Please try again shortly.', 'error', 5000);
    if (type === 'driver-cancelled') toast('Driver cancelled — finding you a new one…', 'info', 5000);
    if (type === 'completed' && data?.shortfall) {
      toast('Your wallet went negative — top up to book your next ride', 'info', 8000);
    }
    if (type === 'message' && data?.from === 'driver' && !chatOpenRef.current) {
      setUnread((u) => u + 1);
    }
  }, [toast]);

  const {
    phase, ride, driverPosition, etaMinutes, offersSent,
    completedRide, clearCompleted, loadingActive, book, cancel, rate,
  } = useRiderRide({ onEvent: onRideEvent });

  // ── Wallet balance ──
  const refreshWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me');
      if (res.ok) {
        const { user } = await res.json();
        setWalletBalance(user.wallet?.balance ?? 0);
      }
    } catch { /* non-blocking */ }
  }, []);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);

  // ── Default pickup = current location (reverse geocoded) ──
  useEffect(() => {
    if (!geo || pickup) return;
    let ignore = false;
    (async () => {
      try {
        const res = await fetch(`/api/geo/search?reverse=1&lat=${geo.lat}&lng=${geo.lng}`);
        const data = await res.json();
        const place = data.results?.[0];
        if (!ignore) {
          const address = place?.address || 'Current location';
          setPickup({ address, lat: geo.lat, lng: geo.lng });
          setPickupText(address);
        }
      } catch {
        if (!ignore) {
          setPickup({ address: 'Current location', lat: geo.lat, lng: geo.lng });
          setPickupText('Current location');
        }
      }
    })();
    return () => { ignore = true; };
  }, [geo, pickup]);

  // ── Nearby drivers (idle only, 10s poll) ──
  useEffect(() => {
    if (phase !== 'idle' || !pickup) { setNearby([]); return undefined; }
    let timer;
    let stopped = false;
    async function load() {
      try {
        const res = await fetch(`/api/drivers/nearby?lat=${pickup.lat}&lng=${pickup.lng}`);
        if (res.ok) {
          const data = await res.json();
          if (!stopped) setNearby(data.drivers || []);
        }
      } catch { /* ignore */ }
      timer = setTimeout(load, 10000);
    }
    load();
    return () => { stopped = true; clearTimeout(timer); };
  }, [phase, pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fare estimate when both points set ──
  useEffect(() => {
    if (!pickup || !dropoff) { setEstimate(null); return undefined; }
    let ignore = false;
    setEstimating(true);
    (async () => {
      try {
        const res = await fetch('/api/rides/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pickup: { lat: pickup.lat, lng: pickup.lng },
            dropoff: { lat: dropoff.lat, lng: dropoff.lng },
          }),
        });
        const data = await res.json();
        if (!ignore && res.ok) setEstimate(data);
      } catch {
        if (!ignore) toast('Could not estimate fare — check your connection', 'error');
      } finally {
        if (!ignore) setEstimating(false);
      }
    })();
    return () => { ignore = true; };
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Book ──
  async function handleBook() {
    if (!pickup || !dropoff || booking) return;
    setBooking(true);
    try {
      await book({ pickup, dropoff, vehicleType });
      setUnread(0);
    } catch (err) {
      toast(err.message, 'error', 5000);
    } finally {
      setBooking(false);
    }
  }

  async function handleCancel(reason) {
    setCancelling(true);
    try {
      await cancel(reason);
      setCancelOpen(false);
      toast('Ride cancelled', 'info');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCancelling(false);
    }
  }

  async function handleRate() {
    if (!completedRide || !rating || submittingRating) return;
    setSubmittingRating(true);
    try {
      await rate(completedRide.id, rating, ratingComment);
      toast('Thanks for your feedback!', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSubmittingRating(false);
      clearCompleted();
      setRating(0);
      setRatingComment('');
      refreshWallet();
    }
  }

  // Live distance + ETA, recomputed from the driver's streamed GPS position.
  // Before pickup it tracks driver→pickup; during the trip, driver→dropoff.
  const liveTrip = useMemo(() => {
    if (phase !== 'active' || !ride || !driverPosition) return null;
    const target =
      ride.status === 'in_progress'
        ? { lat: ride.dropoff.lat, lng: ride.dropoff.lng }
        : { lat: ride.pickup.lat, lng: ride.pickup.lng };
    const meters = roadDistanceMeters(driverPosition, target);
    return {
      meters,
      minutes: etaFor(meters),
      toDestination: ride.status === 'in_progress',
    };
  }, [phase, ride, driverPosition]);

  const selectedFare = estimate?.estimates?.[vehicleType];
  const surge = selectedFare?.surgeMultiplier > 1;
  const insufficientWallet =
    walletBalance != null && selectedFare && walletBalance < selectedFare.total;

  const mapProps = useMemo(() => {
    if (phase === 'active' && ride) {
      return {
        pickup: { lat: ride.pickup.lat, lng: ride.pickup.lng },
        dropoff: { lat: ride.dropoff.lat, lng: ride.dropoff.lng },
        routeGeometry: ride.status === 'in_progress' ? ride.route?.geometry : undefined,
        driverPosition,
        fit: true,
      };
    }
    return {
      pickup: pickup ? { lat: pickup.lat, lng: pickup.lng } : undefined,
      dropoff: dropoff ? { lat: dropoff.lat, lng: dropoff.lng } : undefined,
      routeGeometry: estimate?.route?.geometry,
      drivers: nearby,
      userPosition: geo || undefined,
      fit: Boolean(pickup && dropoff),
    };
  }, [phase, ride, driverPosition, pickup, dropoff, estimate, nearby, geo]);

  const center = geo || { lat: 40.7128, lng: -74.006 };

  return (
    <div className="ride-page">
      <div className="map-fill">
        <MapView center={center} zoom={13} {...mapProps} />
      </div>

      <div className="ride-panel">
        {/* ── IDLE: booking form ── */}
        {phase === 'idle' && !loadingActive && (
          <div className="card card-pad animate-in">
            <h2 style={{ fontSize: '1.25rem', marginBottom: 14 }}>Where to?</h2>

            {geoError && !pickup && (
              <p className="tiny muted mb-3">
                Location access is off — search for your pickup point instead.
              </p>
            )}

            <div className="flex-col gap-3">
              <PlaceSearch
                value={pickupText}
                onChangeText={(t) => { setPickupText(t); if (pickup) setPickup(null); }}
                onSelect={(r) => { setPickup(r); setPickupText(r.address); }}
                committedValue={pickup?.address}
                placeholder="Pickup location"
                icon={Circle}
                bias={geo || undefined}
              />
              <PlaceSearch
                value={dropoffText}
                onChangeText={(t) => { setDropoffText(t); if (dropoff) setDropoff(null); }}
                onSelect={(r) => { setDropoff(r); setDropoffText(r.address); }}
                committedValue={dropoff?.address}
                placeholder="Where are you going?"
                icon={MapPin}
                bias={geo || undefined}
                autoFocus={Boolean(pickup)}
              />
            </div>

            {estimating && (
              <div className="flex items-center gap-2 mt-4 muted small">
                <span className="spinner" /> Calculating fares…
              </div>
            )}

            {estimate && !estimating && (
              <>
                <div className="flex items-center justify-between mt-4 mb-2">
                  <span className="tiny muted">
                    {formatDistance(estimate.route.distanceMeters)} · {formatDuration(estimate.route.durationSeconds)}
                  </span>
                  {surge && (
                    <span className="badge badge-warning">
                      <TrendingUp size={12} /> {selectedFare.surgeMultiplier}× demand
                    </span>
                  )}
                </div>

                <div className="flex-col gap-2">
                  {Object.entries(estimate.estimates).map(([type, fare]) => {
                    const Meta = VEHICLE_META[type];
                    return (
                      <button
                        key={type}
                        className={`vehicle-row ${vehicleType === type ? 'selected' : ''}`}
                        onClick={() => setVehicleType(type)}
                        aria-pressed={vehicleType === type}
                      >
                        <Meta.icon size={22} style={{ color: vehicleType === type ? 'var(--gold-600)' : 'var(--ink-400)', flexShrink: 0 }} />
                        <span className="flex-1" style={{ minWidth: 0 }}>
                          <span className="small" style={{ display: 'block', fontWeight: 700 }}>
                            {VEHICLE_LABELS[type]}
                          </span>
                          <span className="tiny muted truncate" style={{ display: 'block' }}>{Meta.blurb}</span>
                        </span>
                        <span className="small mono-nums" style={{ fontWeight: 700 }}>{money(fare.total)}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Payment — wallet only */}
                <div
                  className="flex items-center justify-between mt-4"
                  style={{ padding: '10px 14px', background: 'var(--ink-50)', borderRadius: 12 }}
                >
                  <span className="flex items-center gap-2 tiny" style={{ fontWeight: 600 }}>
                    <Wallet size={16} /> Paying with wallet
                  </span>
                  <span className="tiny mono-nums muted">
                    {walletBalance != null ? money(walletBalance) : '—'}
                  </span>
                </div>

                {insufficientWallet && (
                  <p className="tiny mt-2" style={{ color: 'var(--danger)' }}>
                    Wallet balance too low —{' '}
                    <Link href="/wallet" style={{ fontWeight: 700, textDecoration: 'underline' }}>
                      add funds
                    </Link>{' '}
                    to book this ride.
                  </p>
                )}

                <button
                  className="btn btn-primary btn-lg btn-full mt-4"
                  onClick={handleBook}
                  disabled={booking || insufficientWallet}
                >
                  {booking ? <span className="spinner" /> : (
                    <>Book {VEHICLE_LABELS[vehicleType]} · {money(selectedFare?.total || 0)}</>
                  )}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── SEARCHING ── */}
        {phase === 'searching' && (
          <div className="card card-pad animate-in text-center">
            <div className="pulse-ring" style={{ width: 64, height: 64, margin: '12px auto 20px', borderRadius: '50%', background: 'var(--ink-950)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Car size={26} color="#fff" />
            </div>
            <h3 style={{ fontSize: '1.15rem' }}>Finding your driver…</h3>
            <p className="small muted mt-1">
              {offersSent > 0
                ? `Contacting nearby drivers (${offersSent} reached)`
                : 'Reaching out to drivers near your pickup'}
            </p>
            <button
              className="btn btn-secondary btn-full mt-6"
              onClick={() => setCancelOpen(true)}
            >
              Cancel request
            </button>
          </div>
        )}

        {/* ── ACTIVE ── */}
        {phase === 'active' && ride && (
          <div className="card card-pad animate-in">
            <div className="flex items-center justify-between mb-3 wrap gap-2">
              <span className={`badge badge-dot ${ride.status === 'in_progress' ? 'badge-info' : 'badge-gold'}`}>
                {ride.status === 'accepted' &&
                  (liveTrip
                    ? `Driver ${liveTrip.minutes} min away`
                    : etaMinutes
                      ? `Driver arriving in ~${etaMinutes} min`
                      : 'Driver on the way')}
                {ride.status === 'arrived' && 'Your driver is here'}
                {ride.status === 'in_progress' &&
                  (liveTrip ? `${liveTrip.minutes} min to destination` : 'Heading to destination')}
              </span>
              {liveTrip && (
                <span className="tiny muted mono-nums">
                  {formatDistance(liveTrip.meters)} {liveTrip.toDestination ? 'remaining' : 'away'}
                </span>
              )}
            </div>

            {/* Live trip progress */}
            {liveTrip && (
              <div
                style={{
                  height: 4,
                  borderRadius: 2,
                  background: 'var(--ink-100)',
                  overflow: 'hidden',
                  marginBottom: 14,
                }}
                aria-hidden="true"
              >
                <div
                  style={{
                    height: '100%',
                    borderRadius: 2,
                    background: 'linear-gradient(90deg, var(--ink-900), var(--gold-600))',
                    width: `${Math.max(
                      4,
                      Math.min(
                        96,
                        liveTrip.toDestination
                          ? 100 - (liveTrip.meters / Math.max(1, ride.route?.distanceMeters || 1)) * 100
                          : 100 - Math.min(100, (liveTrip.meters / 3000) * 100)
                      )
                    )}%`,
                    transition: 'width 900ms var(--ease)',
                  }}
                />
              </div>
            )}

            {ride.driver && (
              <div className="flex items-center gap-3 mb-4">
                <Avatar name={ride.driver.name} src={ride.driver.avatar} size="lg" />
                <div className="flex-1" style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }} className="truncate">{ride.driver.name}</div>
                  <div className="flex items-center gap-2">
                    <Stars value={ride.driver.rating} />
                    <span className="tiny muted">{ride.driver.totalTrips} trips</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="small" style={{ fontWeight: 700 }}>
                    {ride.driver.vehicle?.color} {ride.driver.vehicle?.make} {ride.driver.vehicle?.model}
                  </div>
                  <div className="badge badge-neutral mono-nums" style={{ marginTop: 4 }}>
                    {ride.driver.vehicle?.plate}
                  </div>
                </div>
              </div>
            )}

            {(ride.status === 'accepted' || ride.status === 'arrived') && ride.pin && (
              <div
                className="flex items-center justify-between card-pad mb-4"
                style={{ background: 'var(--gold-50)', borderRadius: 12, padding: '12px 16px' }}
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} style={{ color: 'var(--gold-700)' }} />
                  <span className="small" style={{ fontWeight: 600 }}>Your PIN</span>
                </div>
                <button
                  className="flex items-center gap-2"
                  onClick={() => { navigator.clipboard?.writeText(ride.pin); toast('PIN copied', 'info', 1500); }}
                  aria-label="Copy PIN"
                  style={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '0.25em', color: 'var(--gold-700)' }}
                >
                  {ride.pin} <Copy size={14} />
                </button>
              </div>
            )}

            <div className="flex-col gap-2 small" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <div className="flex gap-2">
                <Circle size={14} style={{ marginTop: 4, color: 'var(--ink-950)', flexShrink: 0 }} />
                <span className="truncate muted">{ride.pickup.address}</span>
              </div>
              <div className="flex gap-2">
                <MapPin size={14} style={{ marginTop: 4, color: 'var(--gold-600)', flexShrink: 0 }} />
                <span className="truncate muted">{ride.dropoff.address}</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="muted">Trip</span>
                <span className="mono-nums">
                  {formatDistance(ride.route?.distanceMeters || 0)} ·{' '}
                  {formatDuration(ride.route?.durationSeconds || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="muted">Fare (wallet)</span>
                <span className="mono-nums" style={{ fontWeight: 700 }}>{money(ride.fare?.total)}</span>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                className="btn btn-secondary flex-1"
                onClick={() => { setChatOpen(true); setUnread(0); }}
                style={{ position: 'relative' }}
              >
                <MessageCircle size={17} /> Chat
                {unread > 0 && (
                  <span
                    className="badge badge-danger"
                    style={{ position: 'absolute', top: -6, right: -4, minWidth: 20, justifyContent: 'center', padding: '1px 6px' }}
                  >
                    {unread}
                  </span>
                )}
              </button>
              {ride.status !== 'in_progress' && (
                <button className="btn btn-danger flex-1" onClick={() => setCancelOpen(true)}>
                  <X size={17} /> Cancel
                </button>
              )}
            </div>

            {ride.status === 'arrived' && (
              <p className="tiny muted mt-3 text-center">
                Cancelling now includes a $3.00 late-cancel fee
              </p>
            )}
          </div>
        )}

        {loadingActive && (
          <div className="card card-pad">
            <div className="skeleton" style={{ height: 22, width: '55%', marginBottom: 12 }} />
            <div className="skeleton" style={{ height: 46, marginBottom: 10 }} />
            <div className="skeleton" style={{ height: 46 }} />
          </div>
        )}
      </div>

      {/* Chat */}
      {phase === 'active' && ride && (
        <ChatSheet
          rideId={ride.id}
          role="rider"
          messages={ride.messages || []}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          counterpartName={ride.driver?.name}
        />
      )}

      {/* Cancel confirm */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this ride?">
        <div className="flex-col gap-2">
          {CANCEL_REASONS.map((r) => (
            <button
              key={r}
              className="vehicle-row"
              onClick={() => handleCancel(r)}
              disabled={cancelling}
            >
              <span className="small">{r}</span>
            </button>
          ))}
          <button className="btn btn-danger btn-full mt-2" onClick={() => handleCancel('')} disabled={cancelling}>
            {cancelling ? <span className="spinner" /> : 'Cancel without a reason'}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setCancelOpen(false)}>
            Keep my ride
          </button>
        </div>
      </Modal>

      {/* Receipt + rating */}
      <Modal
        open={Boolean(completedRide)}
        onClose={() => { clearCompleted(); refreshWallet(); }}
        title="Trip complete"
      >
        {completedRide && (
          <div className="flex-col gap-4">
            <div className="card card-pad" style={{ background: 'var(--ink-50)', border: 'none' }}>
              <div className="flex items-center justify-between small">
                <span className="muted">Base + distance + time</span>
                <span className="mono-nums">
                  {money((completedRide.fare?.baseFare || 0) + (completedRide.fare?.distanceFare || 0) + (completedRide.fare?.timeFare || 0))}
                </span>
              </div>
              {completedRide.fare?.surgeFare > 0 && (
                <div className="flex items-center justify-between small mt-1">
                  <span className="muted">Surge ({completedRide.fare.surgeMultiplier}×)</span>
                  <span className="mono-nums">{money(completedRide.fare.surgeFare)}</span>
                </div>
              )}
              <div className="flex items-center justify-between small mt-1">
                <span className="muted">Booking fee</span>
                <span className="mono-nums">{money(completedRide.fare?.bookingFee)}</span>
              </div>
              <div
                className="flex items-center justify-between mt-2"
                style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontWeight: 700 }}
              >
                <span>Total ({completedRide.payment?.method})</span>
                <span className="mono-nums">{money(completedRide.fare?.total)}</span>
              </div>
            </div>

            {completedRide.shortfall && (
              <p className="small" style={{ color: 'var(--warning)', fontWeight: 600 }}>
                This fare exceeded your wallet balance. Top up to clear the
                outstanding amount before your next ride.
              </p>
            )}

            <div className="text-center">
              <p className="small muted mb-2">How was your trip{completedRide.driver ? ` with ${completedRide.driver.name}` : ''}?</p>
              <StarPicker value={rating} onChange={setRating} />
              {rating > 0 && (
                <textarea
                  className="input mt-3"
                  placeholder="Leave a comment (optional)"
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  maxLength={500}
                  rows={2}
                />
              )}
            </div>

            <button
              className="btn btn-primary btn-full"
              onClick={rating > 0 ? handleRate : () => { clearCompleted(); refreshWallet(); }}
              disabled={submittingRating}
            >
              {submittingRating ? <span className="spinner" /> : rating > 0 ? 'Submit rating' : 'Done'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
