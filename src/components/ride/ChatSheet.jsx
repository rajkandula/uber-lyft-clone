'use client';

import { useEffect, useRef, useState } from 'react';
import { Send, X, MessageCircle } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

/**
 * In-ride chat panel. Messages arrive via the socket (parent owns the
 * list); sending goes through the REST API so it's persisted.
 */
export default function ChatSheet({ rideId, role, messages, open, onClose, counterpartName }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function send(e) {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/rides/${rideId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || 'Message failed to send', 'error');
      } else {
        setText('');
      }
    } catch {
      toast('Message failed to send', 'error');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="card animate-in"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: 'min(360px, calc(100% - 32px))',
        height: 420,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-lg)',
        zIndex: 25,
        overflow: 'hidden',
      }}
      role="dialog"
      aria-label="Chat"
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={17} style={{ color: 'var(--gold-600)' }} />
          <span className="small" style={{ fontWeight: 700 }}>
            {counterpartName || 'Chat'}
          </span>
        </div>
        <button className="btn btn-ghost btn-icon" style={{ minHeight: 32, width: 32 }} onClick={onClose} aria-label="Close chat">
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} className="flex-1" style={{ overflowY: 'auto', padding: 14 }}>
        {messages.length === 0 && (
          <p className="tiny muted text-center" style={{ paddingTop: 40 }}>
            Say hi — messages stay in this trip.
          </p>
        )}
        <div className="flex-col gap-2">
          {messages.map((m, i) => {
            const mine = m.from === role;
            return (
              <div
                key={i}
                style={{
                  alignSelf: mine ? 'flex-end' : 'flex-start',
                  maxWidth: '80%',
                  padding: '8px 13px',
                  borderRadius: 16,
                  borderBottomRightRadius: mine ? 4 : 16,
                  borderBottomLeftRadius: mine ? 16 : 4,
                  background: mine ? 'var(--ink-950)' : 'var(--ink-100)',
                  color: mine ? 'var(--text-invert)' : 'var(--text)',
                  fontSize: '0.88rem',
                }}
              >
                {m.text}
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={send}
        className="flex gap-2"
        style={{ padding: 12, borderTop: '1px solid var(--border)' }}
      >
        <input
          className="input flex-1"
          style={{ minHeight: 42 }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={500}
          aria-label="Message"
        />
        <button
          type="submit"
          className="btn btn-primary btn-icon"
          disabled={!text.trim() || sending}
          aria-label="Send message"
        >
          <Send size={17} />
        </button>
      </form>
    </div>
  );
}
