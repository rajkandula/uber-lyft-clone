'use client';

import { useEffect, useRef, useState } from 'react';
import { signOut, useSession } from 'next-auth/react';
import { LogOut, Pencil, Check, X, Camera } from 'lucide-react';
import { Avatar, Stars, Loading, money } from '@/components/ui/bits';
import { useToast } from '@/components/ui/Toast';

/** Shared profile editor for riders and drivers. */
export default function ProfileCard({ children }) {
  const toast = useToast();
  const { update } = useSession();
  const [user, setUser] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  async function uploadAvatar(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file || uploading) return;
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error');
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/users/me/avatar', { method: 'POST', body });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Upload failed', 'error');
      } else {
        setUser((u) => ({ ...u, avatar: data.avatar }));
        await update({ avatar: data.avatar }); // refresh sidebar avatar
        toast('Profile picture updated', 'success');
      }
    } catch {
      toast('Upload failed — check your connection', 'error');
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch('/api/users/me');
        if (res.ok) {
          const { user: u } = await res.json();
          if (!ignore) {
            setUser(u);
            setForm({ name: u.name, phone: u.phone, email: u.email });
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { ignore = true; };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Failed to save', 'error');
      } else {
        setUser((u) => ({ ...u, ...data.user }));
        setEditing(false);
        toast('Profile updated', 'success');
        // Refresh the session so the sidebar name updates
        await update({ name: data.user.name });
      }
    } catch {
      toast('Failed to save', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <Loading label="Loading profile…" />;

  return (
    <>
      <div className="card card-pad">
        <div className="flex items-center gap-4 mb-6">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Change profile picture"
            title="Change profile picture"
            style={{ position: 'relative', cursor: 'pointer', flexShrink: 0 }}
            disabled={uploading}
          >
            <Avatar name={user.name} src={user.avatar} size="lg" />
            <span
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'var(--gold-600)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--surface)',
              }}
            >
              {uploading ? (
                <span className="spinner" style={{ width: 11, height: 11, borderWidth: 2 }} />
              ) : (
                <Camera size={12} />
              )}
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={uploadAvatar}
            style={{ display: 'none' }}
          />
          <div className="flex-1">
            <h2 style={{ fontSize: '1.2rem' }}>{user.name}</h2>
            <div className="flex items-center gap-3 mt-1">
              <span className="tiny muted">@{user.username}</span>
              <Stars value={user.rating?.average ?? 5} />
            </div>
          </div>
          {!editing ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
              <Pencil size={14} /> Edit
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? <span className="spinner" /> : <><Check size={14} /> Save</>}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setEditing(false);
                  setForm({ name: user.name, phone: user.phone, email: user.email });
                }}
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <div className="flex-col gap-4">
          <FieldRow label="Full name" editing={editing}>
            {editing ? (
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            ) : (
              user.name
            )}
          </FieldRow>
          <FieldRow label="Phone" editing={editing}>
            {editing ? (
              <input className="input" value={form.phone} placeholder="+1 555 000 1234" onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            ) : (
              user.phone || <span className="muted">Not set</span>
            )}
          </FieldRow>
          <FieldRow label="Email" editing={editing}>
            {editing ? (
              <input className="input" type="email" value={form.email} placeholder="you@example.com" onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            ) : (
              user.email || <span className="muted">Not set</span>
            )}
          </FieldRow>
          <FieldRow label="Wallet">
            <span className="mono-nums" style={{ fontWeight: 700 }}>{money(user.wallet?.balance)}</span>
          </FieldRow>
          <FieldRow label="Member since">
            {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </FieldRow>
        </div>
      </div>

      {children}

      <button
        className="btn btn-danger btn-full mt-4"
        onClick={() => signOut({ callbackUrl: '/' })}
      >
        <LogOut size={17} /> Sign out
      </button>
    </>
  );
}

function FieldRow({ label, children }) {
  return (
    <div className="flex-col gap-1">
      <span className="tiny muted" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </span>
      <div className="small">{children}</div>
    </div>
  );
}
