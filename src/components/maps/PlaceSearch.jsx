'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Loader2, SearchX, WifiOff } from 'lucide-react';

/**
 * Debounced place autocomplete backed by /api/geo/search (Photon/OSM).
 *
 * The dropdown renders in a body portal so it can never be clipped by
 * scrollable/overflow containers (panels, modals, sheets). Empty results
 * and network errors render explanatory rows — no silent failures.
 *
 * Props:
 *  - value: current text
 *  - onChangeText(text)
 *  - onSelect({name, address, lat, lng})
 *  - committedValue: the currently selected address — typing it back
 *    (or programmatic prefills) won't re-trigger a search
 *  - placeholder, icon, bias {lat,lng}, autoFocus
 */
export default function PlaceSearch({
  value,
  onChangeText,
  onSelect,
  committedValue,
  placeholder = 'Search a place…',
  icon: Icon = MapPin,
  bias,
  autoFocus = false,
}) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // 'idle' | 'ok' | 'empty' | 'error' — what the last completed search found
  const [outcome, setOutcome] = useState('idle');
  const [highlight, setHighlight] = useState(-1);
  const [anchor, setAnchor] = useState(null); // {top,left,width} viewport coords
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const timerRef = useRef(null);
  const selectedRef = useRef(false);

  // Close on click outside both the input and the portaled list
  useEffect(() => {
    const onDocClick = (e) => {
      if (!wrapRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Keep the portaled dropdown glued to the input
  useLayoutEffect(() => {
    if (!open) return undefined;

    const update = () => {
      const rect = wrapRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ top: rect.bottom + 6, left: rect.left, width: rect.width });
    };
    update();

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true); // capture: any scroll container
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current = false;
      return undefined;
    }
    // Programmatic prefill or retyping the chosen address — nothing to search
    if (committedValue && value === committedValue) {
      return undefined;
    }
    if (!value || value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setOutcome('idle');
      return undefined;
    }

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        let url = `/api/geo/search?q=${encodeURIComponent(value)}`;
        if (bias) url += `&lat=${bias.lat}&lng=${bias.lng}`;
        const res = await fetch(url);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setResults([]);
          setOutcome('error');
        } else {
          setResults(data.results || []);
          setOutcome((data.results || []).length > 0 ? 'ok' : 'empty');
        }
        setOpen(true);
        setHighlight(-1);
      } catch {
        setResults([]);
        setOutcome('error');
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => clearTimeout(timerRef.current);
  }, [value, bias?.lat, bias?.lng, committedValue]); // eslint-disable-line react-hooks/exhaustive-deps

  function choose(r) {
    selectedRef.current = true;
    onSelect(r);
    setOpen(false);
    setResults([]);
    setOutcome('idle');
  }

  function onKeyDown(e) {
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown =
    open && anchor && (results.length > 0 || outcome === 'empty' || outcome === 'error');

  const dropdown = showDropdown ? (
    <div
      ref={listRef}
      role="listbox"
      id="place-search-listbox"
      className="card"
      style={{
        position: 'fixed',
        top: anchor.top,
        left: anchor.left,
        width: anchor.width,
        zIndex: 70, // above panels, modals and toasts — never clipped
        boxShadow: 'var(--shadow-lg)',
        overflow: 'hidden',
        maxHeight: Math.min(280, window.innerHeight - anchor.top - 16),
        overflowY: 'auto',
      }}
    >
      {results.map((r, i) => (
        <button
          key={`${r.lat}-${r.lng}-${i}`}
          role="option"
          aria-selected={i === highlight}
          onClick={() => choose(r)}
          onMouseEnter={() => setHighlight(i)}
          className="w-full"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '11px 14px',
            textAlign: 'left',
            background: i === highlight ? 'var(--ink-100)' : 'transparent',
            transition: 'background 120ms',
            borderBottom: '1px solid var(--ink-100)',
          }}
        >
          <MapPin size={15} style={{ marginTop: 3, color: 'var(--ink-400)', flexShrink: 0 }} />
          <span className="flex-1" style={{ minWidth: 0 }}>
            <span className="small truncate" style={{ display: 'block', fontWeight: 600 }}>
              {r.name}
            </span>
            <span className="tiny muted truncate" style={{ display: 'block' }}>
              {r.address}
            </span>
          </span>
        </button>
      ))}

      {results.length === 0 && outcome === 'empty' && (
        <div className="flex items-center gap-2" style={{ padding: '13px 14px' }}>
          <SearchX size={15} style={{ color: 'var(--ink-400)', flexShrink: 0 }} />
          <span className="tiny muted">
            No places found — try adding the street or city name
          </span>
        </div>
      )}

      {results.length === 0 && outcome === 'error' && (
        <div className="flex items-center gap-2" style={{ padding: '13px 14px' }}>
          <WifiOff size={15} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span className="tiny" style={{ color: 'var(--danger)' }}>
            Can’t reach the server — check your connection and refresh the page
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <div className="input-wrap">
        {loading ? (
          <Loader2 size={17} style={{ animation: 'spin 700ms linear infinite' }} />
        ) : (
          <Icon size={17} />
        )}
        <input
          className="input"
          value={value}
          onChange={(e) => onChangeText(e.target.value)}
          onFocus={() => (results.length > 0 || outcome !== 'idle') && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          role="combobox"
          aria-expanded={Boolean(showDropdown)}
          aria-controls="place-search-listbox"
          aria-autocomplete="list"
        />
      </div>

      {dropdown && createPortal(dropdown, document.body)}
    </div>
  );
}
