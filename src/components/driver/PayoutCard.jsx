'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Banknote, ArrowUpRight, ShieldCheck, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { money } from '@/components/ui/bits';
import { formatRelativeTime } from '@/lib/utils/geo';

function PayoutCardInner() {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/drivers/me/payouts');
      if (res.ok) setStatus(await res.json());
    } catch {
      /* leave the card hidden if this fails */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Returning from Stripe's hosted onboarding
  useEffect(() => {
    const p = searchParams.get('payout');
    if (!p) return;
    if (p === 'done') toast('Payout details submitted — Stripe is verifying', 'success', 6000);
    if (p === 'refresh') toast('Onboarding was interrupted — you can resume any time', 'info', 5000);
    router.replace('/driver/earnings');
    load();
  }, [searchParams, router, toast, load]);

  async function act(action, amount) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/drivers/me/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(amount != null ? { action, amount } : { action }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Something went wrong', 'error', 6000);
      } else if (action === 'onboard') {
        window.location.href = data.url; // hand off to Stripe
        return;
      } else {
        toast(`${money(data.amount)} is on its way to your bank`, 'success', 6000);
        load();
      }
    } catch {
      toast('Network error — please try again', 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!status?.configured) return null;

  // ── Not connected yet ──
  if (!status.connected || !status.detailsSubmitted) {
    return (
      <div className="card card-pad mb-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="avatar" style={{ background: 'var(--gold-50)', color: 'var(--gold-700)' }}>
            <Banknote size={19} />
          </span>
          <div className="flex-1">
            <h3 style={{ fontSize: '1.05rem' }}>Get paid to your bank</h3>
            <p className="tiny muted mt-1">
              Add your bank details once — Stripe handles it securely, and Kova
              never sees your account number.
            </p>
          </div>
        </div>
        <button className="btn btn-primary btn-full" onClick={() => act('onboard')} disabled={busy}>
          {busy ? <span className="spinner" /> : <><ShieldCheck size={17} /> Set up payouts</>}
        </button>
      </div>
    );
  }

  // ── Submitted, still under review ──
  if (!status.payoutsEnabled) {
    return (
      <div className="card card-pad mb-4 flex items-center gap-3" style={{ background: 'var(--warning-bg)', borderColor: 'var(--warning)' }}>
        <Clock size={20} style={{ color: 'var(--warning)', flexShrink: 0 }} />
        <div className="flex-1">
          <div className="small" style={{ fontWeight: 700 }}>Stripe is verifying your details</div>
          <div className="tiny muted mt-1">
            This usually takes a few minutes. You keep earning meanwhile — your
            balance is {money(status.balance)}.
          </div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => act('onboard')} disabled={busy}>
          Update
        </button>
      </div>
    );
  }

  // ── Ready to cash out ──
  return (
    <div className="card card-pad mb-4">
      <div className="flex items-center justify-between wrap gap-3">
        <div>
          <div className="tiny muted">Available to withdraw</div>
          <div className="stat-value mono-nums" style={{ fontSize: '1.9rem' }}>
            {money(status.balance)}
          </div>
          <div className="tiny muted mt-1">
            {status.lastPayoutAt
              ? `Last payout ${formatRelativeTime(status.lastPayoutAt)}`
              : `Minimum payout ${money(status.minPayout)}`}
          </div>
        </div>
        <button
          className="btn btn-success"
          onClick={() => act('cashout')}
          disabled={busy || !status.canCashOut}
          title={!status.canCashOut ? `You need at least ${money(status.minPayout)}` : undefined}
        >
          {busy ? <span className="spinner" /> : <><ArrowUpRight size={17} /> Cash out</>}
        </button>
      </div>
      <p className="tiny muted mt-3">
        Paid to your bank by Stripe, usually within 1–2 business days.
      </p>
    </div>
  );
}

export default function PayoutCard() {
  return (
    <Suspense fallback={null}>
      <PayoutCardInner />
    </Suspense>
  );
}
