'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/context/SocketProvider';

/**
 * Owns the rider's live ride state:
 *  - resumes an active ride from the server on mount / reconnect
 *  - listens to all ride socket events
 *  - exposes book/cancel/rate actions
 *
 * phase: 'idle' | 'searching' | 'active' | 'done'
 */
export default function useRiderRide({ onEvent } = {}) {
  const { socket, isConnected } = useSocket();
  const [ride, setRide] = useState(null); // serialized ride
  const [driverPosition, setDriverPosition] = useState(null);
  const [etaMinutes, setEtaMinutes] = useState(null);
  const [offersSent, setOffersSent] = useState(0);
  const [completedRide, setCompletedRide] = useState(null);
  const [loadingActive, setLoadingActive] = useState(true);
  const rideRef = useRef(null);
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    rideRef.current = ride;
    onEventRef.current = onEvent;
  });

  const notify = useCallback((type, data) => {
    onEventRef.current?.(type, data);
  }, []);

  // ── Resume active ride from the server ──
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/rides/active');
        if (res.ok) {
          const { ride: active } = await res.json();
          if (!ignore && active) {
            setRide(active);
            if (active.driver?.location) setDriverPosition(active.driver.location);
          }
        }
      } catch {
        /* server hiccup — booking still possible */
      } finally {
        if (!ignore) setLoadingActive(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  // ── Socket wiring ──
  useEffect(() => {
    if (!socket) return undefined;

    const subscribe = () => {
      const current = rideRef.current;
      if (current?.id) socket.emit('ride:subscribe', { rideId: current.id });
    };

    // (Re)subscribe on connect — covers reconnects mid-ride
    socket.on('connect', subscribe);
    if (isConnected) subscribe();

    const handlers = {
      'ride:searching-update': (data) => {
        setOffersSent(data.offersSent || 0);
      },
      'ride:accepted': (data) => {
        setRide(data.ride);
        setEtaMinutes(data.etaMinutes ?? null);
        if (data.ride?.driver?.location) setDriverPosition(data.ride.driver.location);
        socket.emit('ride:subscribe', { rideId: data.ride.id });
        notify('accepted', data);
      },
      'ride:no-drivers': (data) => {
        setRide(null);
        setOffersSent(0);
        notify('no-drivers', data);
      },
      'ride:driver-arrived': () => {
        setRide((r) => (r ? { ...r, status: 'arrived' } : r));
        notify('arrived');
      },
      'ride:started': () => {
        setRide((r) => (r ? { ...r, status: 'in_progress' } : r));
        notify('started');
      },
      'ride:completed': (data) => {
        setRide((r) => {
          if (r) {
            setCompletedRide({
              ...r,
              status: 'completed',
              fare: data.fare,
              payment: data.payment,
              shortfall: Boolean(data.shortfall),
            });
          }
          return null;
        });
        setDriverPosition(null);
        setEtaMinutes(null);
        notify('completed', data);
      },
      'ride:driver-cancelled': (data) => {
        // Ride went back to searching with a new dispatch
        setRide((r) => (r ? { ...r, status: 'searching', driver: undefined } : r));
        setDriverPosition(null);
        notify('driver-cancelled', data);
      },
      'driver:location': (data) => {
        if (data?.location) setDriverPosition(data.location);
      },
      'ride:message': (data) => {
        setRide((r) => {
          if (!r || r.id !== data.rideId) return r;
          return { ...r, messages: [...(r.messages || []), { from: data.from, text: data.text, at: data.at }] };
        });
        notify('message', data);
      },
    };

    for (const [event, fn] of Object.entries(handlers)) socket.on(event, fn);

    return () => {
      socket.off('connect', subscribe);
      for (const [event, fn] of Object.entries(handlers)) socket.off(event, fn);
    };
  }, [socket, isConnected, notify]);

  // ── Actions ──
  const book = useCallback(async ({ pickup, dropoff, vehicleType }) => {
    const res = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pickup, dropoff, vehicleType }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to book ride');
    setOffersSent(0);
    setRide(data.ride);
    return data.ride;
  }, []);

  const cancel = useCallback(async (reason) => {
    const current = rideRef.current;
    if (!current) return;
    const res = await fetch(`/api/rides/${current.id}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to cancel');
    setRide(null);
    setDriverPosition(null);
    return data.ride;
  }, []);

  const rate = useCallback(async (rideId, rating, comment) => {
    const res = await fetch(`/api/rides/${rideId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to submit rating');
    }
  }, []);

  const phase = ride
    ? ride.status === 'searching'
      ? 'searching'
      : 'active'
    : completedRide
      ? 'done'
      : 'idle';

  return {
    phase,
    ride,
    driverPosition,
    etaMinutes,
    offersSent,
    completedRide,
    clearCompleted: () => setCompletedRide(null),
    loadingActive,
    isConnected,
    book,
    cancel,
    rate,
  };
}
