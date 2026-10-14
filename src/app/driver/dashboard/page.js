'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Power, Navigation, MapPin, Circle, MessageCircle, X, Car,
  TrendingUp, CheckCircle2, KeyRound, Flag,
} from 'lucide-react';
import MapView from '@/components/maps/MapView';
import ChatSheet from '@/components/ride/ChatSheet';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/components/ui/bits';
import useDriverState from '@/hooks/useDriverState';
import { formatDistance, formatDuration, roadDistanceMeters, etaMinutes as etaFor } from '@/lib/utils/geo';

export default function DriverDashboard() {
  const toast = useToast();
  const [chatOpen, setChatOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [unread, setUnread] = useState(0);

  const onEvent = useCallback((type, data) => {
    if (type === 'offer-expired') toast('Request expired', 'info', 2500);
    if (type === 'offer-withdrawn') toast('Request was cancelled', 'info', 2500);
    if (type === 'rider-cancelled') {
      toast(
        data?.compensation
          ? `Rider cancelled — ${money(data.compensation)} compensation added`
          : 'Rider cancelled the trip',
        'info',
        5000
      );
    }
    if (type === 'message' && data?.from === 'rider') setUnread((u) => u + 1);
  }, [toast]);

  const {
    loading, profile, online, position, offer, ride, busy, isConnected,
    goOnline, goOffline, accept, decline, arrive, start, complete, cancelTrip,
  } = useDriverState({ onEvent });

  // Offer countdown
  useEffect(() => {
    if (!offer) { setCountdown(0); return undefined; }
    const expires = offer.receivedAt + (offer.expiresInSeconds || 15) * 1000;
    const tick = () => setCountdown(Math.max(0, Math.ceil((expires - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [offer]);

  async function handleToggle() {
    try {
      if (online) await goOffline();
      else {
        await goOnline();
        toast('You’re online — requests will come to you', 'success');
      }
    } catch (err) {
      if (err.code === 'NO_VEHICLE') {
        toast('Add your vehicle details first', 'error', 5000);
      } else {
        toast(err.message, 'error', 5000);
      }
    }
  }

  async function handleAccept() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await accept();
      setUnread(0);
      toast('Trip accepted — head to the pickup', 'success');
    } catch (err) {
      toast(err.message, 'error', 4000);
    } finally {
      setActionBusy(false);
    }
  }

  async function run(fn, success) {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await fn();
      if (success) toast(success, 'success');
    } catch (err) {
      toast(err.message, 'error', 4000);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleStart() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await start(pinValue);
      setPinOpen(false);
      setPinValue('');
      toast('Trip started', 'success');
    } catch (err) {
      toast(err.message, 'error', 4000);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleComplete() {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      const finished = await complete();
      setReceipt(finished);
    } catch (err) {
      toast(err.message, 'error', 4000);
    } finally {
      setActionBusy(false);
    }
  }

  // Live navigation readout — distance/ETA from the driver's own GPS to
  // whichever leg they're on right now.
  const liveLeg = useMemo(() => {
    if (!ride || !position) return null;
    const target =
      ride.status === 'in_progress'
        ? { lat: ride.dropoff.lat, lng: ride.dropoff.lng }
        : { lat: ride.pickup.lat, lng: ride.pickup.lng };
    const meters = roadDistanceMeters(position, target);
    return {
      meters,
      minutes: etaFor(meters),
      label: ride.status === 'in_progress' ? 'to destination' : 'to pickup',
    };
  }, [ride, position]);

  const needsVehicle = profile && !profile.vehicle?.plate;
  const center = position || { lat: 40.7128, lng: -74.006 };

  return (
    <div className="ride-page">
      <div className="map-fill">
        <MapView
          center={center}
          zoom={14}
          userPosition={position || undefined}
          pickup={ride ? { lat: ride.pickup.lat, lng: ride.pickup.lng } : undefined}
          dropoff={ride && ride.status === 'in_progress' ? { lat: ride.dropoff.lat, lng: ride.dropoff.lng } : undefined}
          routeGeometry={ride?.status === 'in_progress' ? ride.route?.geometry : undefined}
          fit={Boolean(ride)}
        />
      </div>

      <div className="ride-panel">
        {/* ── Online toggle / status card ── */}
        {!ride && (
          <div className="card card-pad animate-in">
            {loading ? (
              <div className="skeleton" style={{ height: 52 }} />
            ) : needsVehicle ? (
              <>
                <h3 style={{ fontSize: '1.1rem' }}>Almost there</h3>
                <p className="small muted mt-1 mb-4">
                  Add your vehicle details to start accepting trips.
                </p>
                <Link href="/driver/profile" className="btn btn-primary btn-full">
                  <Car size={17} /> Add my vehicle
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 style={{ fontSize: '1.1rem' }}>
                      {online ? 'You’re online' : 'You’re offline'}
                    </h3>
                    <p className="tiny muted mt-1">
                      {online
                        ? isConnected
                          ? 'Waiting for ride requests…'
                          : 'Reconnecting…'
                        : 'Go online to receive requests'}
                    </p>
                  </div>
                  <button
                    onClick={handleToggle}
                    disabled={busy}
                    aria-pressed={online}
                    aria-label={online ? 'Go offline' : 'Go online'}
                    className="btn-icon"
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: online ? 'var(--success)' : 'var(--ink-100)',
                      color: online ? '#fff' : 'var(--ink-500)',
                      boxShadow: online ? '0 4px 16px rgba(5,150,105,.35)' : 'none',
                      transition: 'background 250ms, box-shadow 250ms',
                      cursor: 'pointer',
                    }}
                  >
                    {busy ? <span className="spinner" /> : <Power size={24} />}
                  </button>
                </div>
                {online && (
                  <div className="flex items-center gap-2 mt-4 tiny muted">
                    <span className="badge badge-success badge-dot">Live</span>
                    Your location updates automatically while online
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Active trip card ── */}
        {ride && (
          <div className="card card-pad animate-in">
            <div className="flex items-center justify-between mb-3">
              <span className={`badge badge-dot ${ride.status === 'in_progress' ? 'badge-info' : 'badge-gold'}`}>
                {ride.status === 'accepted' && 'Head to pickup'}
                {ride.status === 'arrived' && 'Waiting for rider'}
                {ride.status === 'in_progress' && 'Trip in progress'}
              </span>
              <span className="small mono-nums" style={{ fontWeight: 700 }}>
                {money(ride.fare?.driverEarnings)}
              </span>
            </div>

            {liveLeg && (
              <div
                className="flex items-center justify-between mb-3"
                style={{ background: 'var(--ink-50)', borderRadius: 12, padding: '10px 14px' }}
              >
                <span className="small" style={{ fontWeight: 700 }}>
                  {formatDistance(liveLeg.meters)} {liveLeg.label}
                </span>
                <span className="small mono-nums" style={{ fontWeight: 700, color: 'var(--gold-700)' }}>
                  ~{liveLeg.minutes} min
                </span>
              </div>
            )}

            <div className="flex-col gap-2 small mb-4">
              <div className="flex gap-2">
                <Circle size={14} style={{ marginTop: 4, color: 'var(--ink-950)', flexShrink: 0 }} />
                <span className="muted">{ride.pickup.address}</span>
              </div>
              <div className="flex gap-2">
                <MapPin size={14} style={{ marginTop: 4, color: 'var(--gold-600)', flexShrink: 0 }} />
                <span className="muted">{ride.dropoff.address}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="muted">Trip</span>
                <span className="mono-nums">
                  {formatDistance(ride.route?.distanceMeters || 0)} ·{' '}
                  {formatDuration(ride.route?.durationSeconds || 0)}
                </span>
              </div>
            </div>

            {ride.status === 'accepted' && (
              <button className="btn btn-primary btn-lg btn-full" onClick={() => run(arrive, 'Rider notified that you arrived')} disabled={actionBusy}>
                {actionBusy ? <span className="spinner" /> : <><Flag size={18} /> I’ve arrived</>}
              </button>
            )}
            {ride.status === 'arrived' && (
              <button className="btn btn-primary btn-lg btn-full" onClick={() => setPinOpen(true)} disabled={actionBusy}>
                <KeyRound size={18} /> Enter PIN to start
              </button>
            )}
            {ride.status === 'in_progress' && (
              <button className="btn btn-success btn-lg btn-full" onClick={handleComplete} disabled={actionBusy}>
                {actionBusy ? <span className="spinner" /> : <><CheckCircle2 size={18} /> Complete trip</>}
              </button>
            )}

            <div className="flex gap-2 mt-3">
              <button className="btn btn-secondary flex-1" onClick={() => { setChatOpen(true); setUnread(0); }} style={{ position: 'relative' }}>
                <MessageCircle size={16} /> Chat
                {unread > 0 && (
                  <span className="badge badge-danger" style={{ position: 'absolute', top: -6, right: -4, minWidth: 20, justifyContent: 'center', padding: '1px 6px' }}>
                    {unread}
                  </span>
                )}
              </button>
              {ride.status !== 'in_progress' && (
                <button className="btn btn-danger flex-1" onClick={() => setCancelOpen(true)}>
                  <X size={16} /> Cancel
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Incoming offer ── */}
      <Modal open={Boolean(offer)} onClose={() => {}} closable={false} title="">
        {offer && (
          <div className="text-center">
            <div
              className="mono-nums"
              style={{
                width: 64, height: 64, margin: '0 auto 12px', borderRadius: '50%',
                border: '3px solid var(--gold-600)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '1.5rem', fontWeight: 800,
                color: countdown <= 5 ? 'var(--danger)' : 'var(--text)',
              }}
              aria-live="polite"
            >
              {countdown}
            </div>
            <h3 style={{ fontSize: '1.2rem' }}>New ride request</h3>
            <p className="small muted mt-1 mb-4">
              {offer.rider?.name || 'A rider'} · {formatDistance(offer.distanceToPickupMeters)} away · ~{offer.etaMinutes} min to pickup
            </p>

            <div className="card card-pad text-left mb-4" style={{ background: 'var(--ink-50)', border: 'none' }}>
              <div className="flex gap-2 small mb-2">
                <Circle size={13} style={{ marginTop: 4, flexShrink: 0 }} />
                <span className="truncate">{offer.pickup.address}</span>
              </div>
              <div className="flex gap-2 small">
                <MapPin size={13} style={{ marginTop: 4, color: 'var(--gold-600)', flexShrink: 0 }} />
                <span className="truncate">{offer.dropoff.address}</span>
              </div>
              <div className="flex items-center justify-between mt-3" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                <span className="tiny muted">
                  {formatDistance(offer.distanceMeters)} · {formatDuration(offer.durationSeconds)}
                  {offer.surgeMultiplier > 1 && (
                    <span className="badge badge-warning" style={{ marginLeft: 8 }}>
                      <TrendingUp size={11} /> {offer.surgeMultiplier}×
                    </span>
                  )}
                </span>
                <span style={{ fontWeight: 800, fontSize: '1.15rem' }} className="mono-nums">
                  {money(offer.earnings)}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button className="btn btn-secondary flex-1" onClick={decline} disabled={actionBusy}>
                Decline
              </button>
              <button className="btn btn-success btn-lg flex-1" onClick={handleAccept} disabled={actionBusy || countdown === 0}>
                {actionBusy ? <span className="spinner" /> : 'Accept'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── PIN entry ── */}
      <Modal open={pinOpen} onClose={() => setPinOpen(false)} title="Rider PIN">
        <p className="small muted mb-4">Ask the rider for their 4-digit PIN to start the trip.</p>
        <input
          className="input text-center mono-nums"
          style={{ fontSize: '1.6rem', letterSpacing: '0.4em', fontWeight: 700 }}
          value={pinValue}
          onChange={(e) => setPinValue(e.target.value.replace(/\D/g, '').slice(0, 4))}
          inputMode="numeric"
          maxLength={4}
          placeholder="0000"
          autoFocus
          aria-label="Rider PIN"
        />
        <button
          className="btn btn-primary btn-full mt-4"
          onClick={handleStart}
          disabled={pinValue.length !== 4 || actionBusy}
        >
          {actionBusy ? <span className="spinner" /> : <><Navigation size={17} /> Start trip</>}
        </button>
      </Modal>

      {/* ── Cancel trip ── */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this trip?">
        <p className="small muted mb-4">
          The rider will be matched with another driver. Frequent cancellations lower your match priority.
        </p>
        <div className="flex-col gap-2">
          <button className="btn btn-danger btn-full" disabled={actionBusy} onClick={() => run(async () => { await cancelTrip('Driver cancelled'); setCancelOpen(false); }, 'Trip cancelled')}>
            {actionBusy ? <span className="spinner" /> : 'Yes, cancel trip'}
          </button>
          <button className="btn btn-ghost btn-full" onClick={() => setCancelOpen(false)}>
            Keep trip
          </button>
        </div>
      </Modal>

      {/* ── Completion receipt ── */}
      <Modal open={Boolean(receipt)} onClose={() => setReceipt(null)} title="Trip complete 🎉">
        {receipt && (
          <div className="text-center">
            <div style={{ fontSize: '2.4rem', fontWeight: 800 }} className="mono-nums">
              {money(receipt.fare?.driverEarnings)}
            </div>
            <p className="small muted mt-1 mb-4">
              earned this trip · paid to your wallet
            </p>
            <button className="btn btn-primary btn-full" onClick={() => setReceipt(null)}>
              Back to driving
            </button>
          </div>
        )}
      </Modal>

      {/* Chat */}
      {ride && (
        <ChatSheet
          rideId={ride.id}
          role="driver"
          messages={ride.messages || []}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          counterpartName="Rider"
        />
      )}
    </div>
  );
}
