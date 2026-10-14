'use client';

import { useState } from 'react';
import { Star } from 'lucide-react';

/** Initials avatar with optional image. */
export function Avatar({ name = '', src = '', size = 'md' }) {
  const cls = size === 'lg' ? 'avatar avatar-lg' : size === 'sm' ? 'avatar avatar-sm' : 'avatar';
  const initials = name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <span className={cls} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials || '•'}
    </span>
  );
}

/** Read-only star display, e.g. ratings on cards. */
export function Stars({ value = 5, size = 14 }) {
  return (
    <span className="flex items-center gap-1" style={{ color: 'var(--gold-600)' }}>
      <Star size={size} fill="currentColor" strokeWidth={0} />
      <span className="small mono-nums" style={{ color: 'var(--text)', fontWeight: 600 }}>
        {Number(value).toFixed(1)}
      </span>
    </span>
  );
}

/** Interactive 1-5 star picker. */
export function StarPicker({ value, onChange, size = 32 }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1 justify-center" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= (hover || value);
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(n)}
            style={{
              color: active ? 'var(--gold-500)' : 'var(--ink-300)',
              transition: 'color 120ms, transform 120ms',
              transform: hover === n ? 'scale(1.15)' : 'scale(1)',
              padding: 2,
            }}
          >
            <Star size={size} fill={active ? 'currentColor' : 'none'} />
          </button>
        );
      })}
    </div>
  );
}

/** Centered loading block. */
export function Loading({ label = 'Loading…' }) {
  return (
    <div className="empty" style={{ padding: 32 }}>
      <span className="spinner" style={{ color: 'var(--ink-500)' }} />
      <p className="small">{label}</p>
    </div>
  );
}

/** Empty state with icon + message. */
export function Empty({ icon: Icon, title, hint, action }) {
  return (
    <div className="empty">
      {Icon && <Icon size={40} strokeWidth={1.5} />}
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}

const STATUS_BADGE = {
  searching: ['badge-info', 'Finding driver'],
  accepted: ['badge-gold', 'Driver on the way'],
  arrived: ['badge-gold', 'Driver arrived'],
  in_progress: ['badge-info', 'In progress'],
  completed: ['badge-success', 'Completed'],
  cancelled: ['badge-danger', 'Cancelled'],
  no_drivers: ['badge-warning', 'No drivers'],
};

/** Consistent ride status chip. */
export function RideStatusBadge({ status }) {
  const [cls, label] = STATUS_BADGE[status] || ['badge-neutral', status];
  return <span className={`badge badge-dot ${cls}`}>{label}</span>;
}

export const VEHICLE_LABELS = {
  economy: 'Kova Go',
  comfort: 'Kova Comfort',
  premium: 'Kova Lux',
  xl: 'Kova XL',
};

export function money(n, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(n ?? 0);
}
