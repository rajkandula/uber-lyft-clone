import Link from 'next/link';
import {
  Zap, ShieldCheck, Wallet, Radio, Route, Car, Crown, Users,
  ArrowRight, Star, Clock, MessageCircle,
} from 'lucide-react';
import SiteHeader from '@/components/shell/SiteHeader';
import SiteFooter from '@/components/shell/SiteFooter';

export const metadata = {
  title: 'Kova — Ride with confidence',
};

const FEATURES = [
  {
    icon: Wallet,
    title: 'Drivers keep 90%+',
    text: 'We take a small single-digit cut — just enough to run the platform. The fare belongs to the person doing the driving.',
  },
  {
    icon: Zap,
    title: 'Matched in seconds',
    text: 'Hex-grid dispatch finds the closest available driver and confirms your trip fast.',
  },
  {
    icon: Radio,
    title: 'Live trip tracking',
    text: 'Watch your driver approach in real time, from accept to arrival, metre by metre.',
  },
  {
    icon: Route,
    title: 'Fares that stay low',
    text: 'Lean operations mean cheaper rides than the big apps — upfront pricing, no games.',
  },
  {
    icon: ShieldCheck,
    title: 'PIN-verified pickups',
    text: 'Every trip starts with your 4-digit PIN, so you always get in the right car.',
  },
  {
    icon: MessageCircle,
    title: 'In-ride chat',
    text: 'Coordinate the pickup without sharing your phone number.',
  },
];

const TIERS = [
  { icon: Car, name: 'Kova Go', text: 'Everyday rides, great value' },
  { icon: Car, name: 'Kova Comfort', text: 'Newer cars, extra legroom' },
  { icon: Crown, name: 'Kova Lux', text: 'Top drivers, premium cars' },
  { icon: Users, name: 'Kova XL', text: 'Room for up to six' },
];

const STEPS = [
  { n: '01', title: 'Set your destination', text: 'Type it or tap the map — fares for every tier appear instantly.' },
  { n: '02', title: 'Get matched', text: 'The nearest driver accepts and you watch them arrive live.' },
  { n: '03', title: 'Ride & go', text: 'Verify with your PIN, enjoy the trip, pay from your wallet.' },
];

export default function LandingPage() {
  return (
    <div style={{ background: 'var(--bg)' }}>
      <SiteHeader />

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '88px 24px 72px' }}>
        <div style={{ maxWidth: 640 }}>
          <span className="eyebrow">Premium ride-hailing</span>
          <h1 className="display" style={{ marginTop: 14 }}>
            Ride with
            <span style={{ color: 'var(--gold-600)' }}> confidence</span>.
          </h1>
          <p className="muted" style={{ fontSize: '1.15rem', marginTop: 18, maxWidth: 480, lineHeight: 1.6 }}>
            Upfront fares, live tracking, PIN-verified pickups and drivers who
            show up. Getting around your city, done properly.
          </p>
          <div className="flex gap-3 mt-8 wrap">
            <Link href="/signup" className="btn btn-primary btn-lg">
              Book your first ride <ArrowRight size={18} />
            </Link>
            <Link href="/signup?role=driver" className="btn btn-secondary btn-lg">
              Drive & earn
            </Link>
          </div>
        </div>

        {/* Mock trip card */}
        <div
          className="card"
          style={{
            marginTop: 64, padding: 28, maxWidth: 720,
            boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-xl)',
          }}
        >
          <div className="flex items-center justify-between wrap gap-4">
            <div className="flex items-center gap-4">
              <span className="avatar avatar-lg" style={{ background: 'var(--ink-950)' }}>
                <Car size={22} color="#fff" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span style={{ fontWeight: 700 }}>Driver on the way</span>
                  <span className="badge badge-gold badge-dot">3 min</span>
                </div>
                <span className="small muted">Silver Toyota Camry · PLT 2048</span>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <span className="flex items-center gap-2 small muted">
                <Clock size={15} /> 12 min trip
              </span>
              <span className="flex items-center gap-2 small muted">
                <Route size={15} /> 4.8 km
              </span>
              <span style={{ fontWeight: 800, fontSize: '1.2rem' }} className="mono-nums">$11.20</span>
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: 'var(--ink-100)', marginTop: 22, overflow: 'hidden' }}>
            <div style={{ width: '62%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, var(--ink-900), var(--gold-600))' }} />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section style={{ background: 'var(--surface)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 24px' }}>
          <span className="eyebrow">Why Kova</span>
          <h2 style={{ fontSize: '2rem', marginTop: 10, maxWidth: 480 }}>
            Everything a great ride should be
          </h2>
          <div className="grid-3 mt-8">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="card card-pad" style={{ background: 'var(--bg)' }}>
                <span className="avatar" style={{ background: 'var(--gold-50)', color: 'var(--gold-700)', borderRadius: 12 }}>
                  <Icon size={19} />
                </span>
                <h3 style={{ fontSize: '1.02rem', marginTop: 14 }}>{title}</h3>
                <p className="small muted mt-1" style={{ lineHeight: 1.6 }}>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 24px' }}>
        <span className="eyebrow">How it works</span>
        <h2 style={{ fontSize: '2rem', marginTop: 10 }}>Three taps to anywhere</h2>
        <div className="grid-3 mt-8">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span style={{ fontSize: '2.4rem', fontWeight: 800, color: 'var(--ink-200)', letterSpacing: '-0.03em' }}>
                {s.n}
              </span>
              <h3 style={{ fontSize: '1.05rem', marginTop: 8 }}>{s.title}</h3>
              <p className="small muted mt-1" style={{ lineHeight: 1.6, maxWidth: 280 }}>{s.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tiers ── */}
      <section style={{ background: 'var(--ink-950)', color: 'var(--text-invert)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '72px 24px' }}>
          <span className="eyebrow" style={{ color: 'var(--gold-500)' }}>Choose your ride</span>
          <h2 style={{ fontSize: '2rem', marginTop: 10 }}>A tier for every trip</h2>
          <div className="grid-4 mt-8">
            {TIERS.map(({ icon: Icon, name, text }) => (
              <div
                key={name}
                className="card-pad"
                style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <Icon size={22} style={{ color: 'var(--gold-500)' }} />
                <h3 style={{ fontSize: '1rem', marginTop: 12 }}>{name}</h3>
                <p className="small mt-1" style={{ color: 'rgba(250,250,249,0.65)' }}>{text}</p>
              </div>
            ))}
          </div>

          <div
            className="flex items-center justify-between wrap gap-4"
            style={{ marginTop: 56, padding: 28, borderRadius: 'var(--radius-xl)', background: 'linear-gradient(135deg, rgba(202,138,4,0.2), rgba(202,138,4,0.05))', border: '1px solid rgba(202,138,4,0.3)' }}
          >
            <div>
              <h3 style={{ fontSize: '1.3rem' }}>Turn your car into income</h3>
              <p className="small mt-1" style={{ color: 'rgba(250,250,249,0.7)' }}>
                Keep 90%+ of every fare — we only take what it costs to run the
                platform. Go online whenever it suits you.
              </p>
            </div>
            <Link href="/signup?role=driver" className="btn btn-gold btn-lg">
              Start driving <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
