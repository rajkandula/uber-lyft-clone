/**
 * Kova seed script — creates an admin, demo riders/drivers and pricing rules.
 *
 *   node scripts/seed.js
 *
 * Idempotent: safe to run repeatedly (upserts by username).
 * Demo credentials (password for every account: "kovademo1"):
 *   admin      → admin
 *   rider      → rider1
 *   drivers    → driver1 … driver5 (approved, with vehicles, offline)
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Minimal .env.local loader (no dotenv dependency) ──
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kova';
const PASSWORD = 'kovademo1';

// Manhattan-ish demo coordinates
const DRIVER_SPOTS = [
  { lat: 40.7484, lng: -73.9857 }, // Midtown
  { lat: 40.7527, lng: -73.9772 }, // Grand Central
  { lat: 40.7589, lng: -73.9851 }, // Times Square
  { lat: 40.7411, lng: -73.9897 }, // Flatiron
  { lat: 40.7295, lng: -73.9965 }, // Washington Sq
];

const VEHICLES = [
  { make: 'Toyota', model: 'Camry', year: 2022, color: 'Silver', plate: 'KVA 1001', type: 'economy' },
  { make: 'Honda', model: 'Accord', year: 2023, color: 'Black', plate: 'KVA 1002', type: 'economy' },
  { make: 'BMW', model: '530i', year: 2023, color: 'White', plate: 'KVA 2001', type: 'comfort' },
  { make: 'Mercedes', model: 'E-Class', year: 2024, color: 'Black', plate: 'KVA 3001', type: 'premium' },
  { make: 'Toyota', model: 'Sienna', year: 2022, color: 'Gray', plate: 'KVA 4001', type: 'xl' },
];

// Driver-first economics: small platform commission, low rider rates
const PRICING = [
  { vehicleType: 'economy', baseFare: 2.0, perKmRate: 1.0, perMinRate: 0.15, minimumFare: 4, bookingFee: 0.5, platformCommission: 8, surgeMultiplierCap: 3 },
  { vehicleType: 'comfort', baseFare: 3.0, perKmRate: 1.5, perMinRate: 0.25, minimumFare: 6.5, bookingFee: 0.75, platformCommission: 8, surgeMultiplierCap: 3 },
  { vehicleType: 'premium', baseFare: 5.0, perKmRate: 2.5, perMinRate: 0.4, minimumFare: 12, bookingFee: 1.0, platformCommission: 10, surgeMultiplierCap: 3 },
  { vehicleType: 'xl', baseFare: 4.0, perKmRate: 1.8, perMinRate: 0.3, minimumFare: 8, bookingFee: 0.75, platformCommission: 8, surgeMultiplierCap: 3 },
];

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected: ${MONGODB_URI}`);

  const db = mongoose.connection.db;
  const users = db.collection('users');
  const drivers = db.collection('drivers');
  const pricing = db.collection('pricingrules');

  const passwordHash = await bcrypt.hash(PASSWORD, 12);
  const now = new Date();

  const baseUser = (username, name, role) => ({
    $setOnInsert: {
      username,
      name,
      role,
      passwordHash,
      avatar: '',
      wallet: { balance: role === 'rider' ? 100 : 0, currency: 'USD' },
      rating: { average: 5, count: 0 },
      isActive: true,
      savedPlaces: [],
      createdAt: now,
      updatedAt: now,
    },
  });

  // Admin + demo rider
  await users.updateOne({ username: 'admin' }, baseUser('admin', 'Kova Admin', 'admin'), { upsert: true });
  await users.updateOne({ username: 'rider1' }, baseUser('rider1', 'Riley Carter', 'rider'), { upsert: true });
  console.log('✓ admin (admin) & rider (rider1) ready — password:', PASSWORD);

  // Demo drivers
  const names = ['Marcus Chen', 'Aisha Patel', 'Diego Ramos', 'Nina Kowalski', 'Sam Okafor'];
  for (let i = 0; i < 5; i++) {
    const username = `driver${i + 1}`;
    await users.updateOne({ username }, baseUser(username, names[i], 'driver'), { upsert: true });
    const user = await users.findOne({ username });

    await drivers.updateOne(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          vehicle: { ...VEHICLES[i], imageUrl: '' },
          license: { number: `DL-99${i}00${i}`, verified: true },
          documents: [],
          isOnline: false,
          isApproved: true,
          location: { type: 'Point', coordinates: [DRIVER_SPOTS[i].lng, DRIVER_SPOTS[i].lat] },
          currentRideId: null,
          stats: {
            totalTrips: 0, totalEarnings: 0, totalOnlineHours: 0,
            acceptanceRate: 100, cancellationRate: 0, averageRating: 5,
            totalOffers: 0, acceptedOffers: 0,
          },
          h3Cell: null,
          h3Resolution: 9,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );
  }
  console.log('✓ 5 approved demo drivers (driver1…driver5) with vehicles');

  // Pricing rules
  for (const rule of PRICING) {
    await pricing.updateOne(
      { vehicleType: rule.vehicleType, city: 'default' },
      { $set: { ...rule, city: 'default', isActive: true, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
  }
  console.log('✓ pricing rules for all 4 tiers');

  await mongoose.disconnect();
  console.log('\nSeed complete. Sign in with e.g. rider1 / kovademo1');
  console.log(
    'Note: existing accounts are never overwritten (passwords, balances and\n' +
    'stats are preserved), so re-running this is safe in production.'
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
