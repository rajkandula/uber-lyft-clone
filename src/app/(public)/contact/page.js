import { Mail, MessageSquare, LifeBuoy } from 'lucide-react';
import ContactForm from './ContactForm';

export const metadata = {
  title: 'Contact',
  description: 'Get in touch with the Kova team.',
};

const CHANNELS = [
  {
    icon: LifeBuoy,
    title: 'Ride & trip support',
    text: 'Problems with a trip, a fare or a driver — include the trip date so we can find it fast.',
  },
  {
    icon: Mail,
    title: 'Driver support',
    text: 'Onboarding, approval, earnings and payout questions from our driver partners.',
  },
  {
    icon: MessageSquare,
    title: 'Everything else',
    text: 'Press, partnerships, data requests, or just feedback — we read all of it.',
  },
];

export default function ContactPage() {
  return (
    <div className="prose-page" style={{ maxWidth: 920 }}>
      <h1>Contact us</h1>
      <p className="updated" id="support">
        We usually reply within one business day.
      </p>

      <div className="grid-3 mb-6">
        {CHANNELS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="card card-pad">
            <Icon size={20} style={{ color: 'var(--gold-700)' }} />
            <h3 style={{ fontSize: '0.98rem', marginTop: 10 }}>{title}</h3>
            <p className="tiny muted mt-1" style={{ lineHeight: 1.6 }}>{text}</p>
          </div>
        ))}
      </div>

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: 16 }}>Send us a message</h2>
        <ContactForm />
      </div>
    </div>
  );
}
