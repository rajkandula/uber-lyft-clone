'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/**
 * Browser geolocation with optional watch mode.
 * @param {Object} options
 * @param {boolean} options.watch - If true, continuously track position
 * @param {boolean} options.highAccuracy - Use high accuracy GPS
 * @param {number} options.maxAge - Max cached position age in ms
 * @param {number} options.timeout - Timeout for position request in ms
 */
export function useGeolocation({
  watch = false,
  highAccuracy = true,
  maxAge = 10000,
  timeout = 15000,
} = {}) {
  const [position, setPosition] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const watchRef = useRef(null);

  const options = useMemo(
    () => ({
      enableHighAccuracy: highAccuracy,
      maximumAge: maxAge,
      timeout,
    }),
    [highAccuracy, maxAge, timeout]
  );

  const handleSuccess = useCallback((pos) => {
    setPosition({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      accuracy: pos.coords.accuracy,
      heading: pos.coords.heading,
      speed: pos.coords.speed,
      timestamp: pos.timestamp,
    });
    setError(null);
    setLoading(false);
  }, []);

  const handleError = useCallback((err) => {
    setError(err.message);
    setLoading(false);
  }, []);

  const getCurrentPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported');
      setLoading(false);
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);
  }, [handleSuccess, handleError, options]);

  useEffect(() => {
    if (!navigator.geolocation) {
      // Defer so we don't set state synchronously inside the effect body
      const t = setTimeout(() => {
        setError('Geolocation is not supported');
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }

    if (watch) {
      watchRef.current = navigator.geolocation.watchPosition(
        handleSuccess,
        handleError,
        options
      );
    } else {
      navigator.geolocation.getCurrentPosition(handleSuccess, handleError, options);
    }

    return () => {
      if (watchRef.current !== null) {
        navigator.geolocation.clearWatch(watchRef.current);
        watchRef.current = null;
      }
    };
  }, [watch, handleSuccess, handleError, options]);

  return { position, error, loading, getCurrentPosition };
}

export default useGeolocation;
