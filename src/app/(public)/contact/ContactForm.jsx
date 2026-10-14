'use client';

import { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';

const TOPICS = [
  ['general', 'General question'],
  ['ride_issue', 'Problem with a ride'],
  ['driver_support', 'Driver support'],
  ['payments', 'Payments & wallet'],
  ['safety', 'Safety concern'],
  ['data_request', 'Privacy / data request'],
];

export default function ContactForm() {
  const [form, setForm] = useState({ name: '', email: '', topic: 'general', message: '', company: '' });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    if (sending) return;
    setError('');
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send — please try again');
      } else {
        setSent(true);
      }
    } catch {
      setError('Failed to send — check your connection');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="empty" style={{ padding: 24 }}>
        <CheckCircle2 size={36} style={{ color: 'var(--success)' }} />
        <h3>Message sent</h3>
        <p>Thanks for reaching out — we’ll get back to you at {form.email}.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex-col gap-4">
      <div className="grid-2">
        <div className="field">
          <label htmlFor="c-name">Your name</label>
          <input id="c-name" className="input" value={form.name} onChange={set('name')} required minLength={2} maxLength={100} />
        </div>
        <div className="field">
          <label htmlFor="c-email">Email</label>
          <input id="c-email" className="input" type="email" value={form.email} onChange={set('email')} required maxLength={200} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="c-topic">Topic</label>
        <select id="c-topic" className="input" value={form.topic} onChange={set('topic')}>
          {TOPICS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="c-message">Message</label>
        <textarea
          id="c-message"
          className="input"
          rows={5}
          value={form.message}
          onChange={set('message')}
          required
          minLength={10}
          maxLength={2000}
          placeholder="How can we help?"
        />
      </div>

      {/* Honeypot — hidden from real users */}
      <input
        type="text"
        value={form.company}
        onChange={set('company')}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -9999, height: 0, width: 0, opacity: 0 }}
      />

      {error && <p className="input-error-msg">{error}</p>}

      <button type="submit" className="btn btn-primary" disabled={sending}>
        {sending ? <span className="spinner" /> : <><Send size={16} /> Send message</>}
      </button>
    </form>
  );
}
