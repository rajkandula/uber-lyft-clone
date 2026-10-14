'use client';

import { useCallback, useEffect, useState } from 'react';
import { Inbox, CheckCircle2, RotateCcw, Mail } from 'lucide-react';
import { Avatar, Loading, Empty } from '@/components/ui/bits';
import { useToast } from '@/components/ui/Toast';
import { formatRelativeTime } from '@/lib/utils/geo';

const TOPIC_LABEL = {
  general: 'General',
  ride_issue: 'Ride issue',
  driver_support: 'Driver support',
  payments: 'Payments',
  safety: 'Safety',
  data_request: 'Data request',
};

const TOPIC_TONE = {
  safety: 'badge-danger',
  ride_issue: 'badge-warning',
  payments: 'badge-info',
  driver_support: 'badge-gold',
  data_request: 'badge-neutral',
  general: 'badge-neutral',
};

export default function AdminSupportPage() {
  const toast = useToast();
  const [status, setStatus] = useState('open');
  const [messages, setMessages] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setMessages(null);
    try {
      const res = await fetch(`/api/admin/support?status=${status}`);
      const data = await res.json();
      setMessages(res.ok ? data.messages : []);
    } catch {
      setMessages([]);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  async function setMessageStatus(id, next) {
    setBusyId(id);
    try {
      const res = await fetch('/api/admin/support', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Update failed', 'error');
      } else {
        toast(next === 'resolved' ? 'Marked resolved' : 'Reopened', 'success');
        load();
      }
    } catch {
      toast('Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="content-pad" style={{ maxWidth: 860 }}>
      <div className="flex items-center justify-between mb-6 wrap gap-3">
        <div>
          <h1 className="page-title">Support inbox</h1>
          <p className="page-sub">Messages from the contact form</p>
        </div>
        <div className="segmented">
          <button className={status === 'open' ? 'active' : ''} onClick={() => setStatus('open')}>
            Open
          </button>
          <button className={status === 'resolved' ? 'active' : ''} onClick={() => setStatus('resolved')}>
            Resolved
          </button>
        </div>
      </div>

      {messages === null && <Loading label="Loading messages…" />}
      {messages?.length === 0 && (
        <Empty
          icon={Inbox}
          title={status === 'open' ? 'Inbox zero' : 'Nothing resolved yet'}
          hint={status === 'open' ? 'New contact-form messages will appear here.' : undefined}
        />
      )}

      <div className="flex-col gap-3">
        {messages?.map((m) => (
          <div key={m._id} className="card card-pad">
            <div className="flex items-center gap-3 mb-3 wrap">
              <Avatar name={m.name} size="sm" />
              <div className="flex-1" style={{ minWidth: 140 }}>
                <div className="small" style={{ fontWeight: 700 }}>
                  {m.name}
                  {m.userId && (
                    <span className="tiny muted" style={{ fontWeight: 500 }}>
                      {' '}· @{m.userId.username} ({m.userId.role})
                    </span>
                  )}
                </div>
                <a href={`mailto:${m.email}`} className="tiny muted flex items-center gap-1">
                  <Mail size={11} /> {m.email}
                </a>
              </div>
              <span className={`badge ${TOPIC_TONE[m.topic] || 'badge-neutral'}`}>
                {TOPIC_LABEL[m.topic] || m.topic}
              </span>
              <span className="tiny muted">{formatRelativeTime(m.createdAt)}</span>
            </div>

            <p className="small" style={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
              {m.message}
            </p>

            <div className="flex justify-between items-center mt-3" style={{ borderTop: '1px solid var(--ink-100)', paddingTop: 10 }}>
              <span className="tiny muted">
                {m.status === 'resolved' && m.resolvedAt
                  ? `Resolved ${formatRelativeTime(m.resolvedAt)}`
                  : ''}
              </span>
              {m.status === 'open' ? (
                <button
                  className="btn btn-success btn-sm"
                  disabled={busyId === m._id}
                  onClick={() => setMessageStatus(m._id, 'resolved')}
                >
                  <CheckCircle2 size={14} /> Mark resolved
                </button>
              ) : (
                <button
                  className="btn btn-secondary btn-sm"
                  disabled={busyId === m._id}
                  onClick={() => setMessageStatus(m._id, 'open')}
                >
                  <RotateCcw size={14} /> Reopen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
