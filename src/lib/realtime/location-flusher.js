import connectDB from '@/lib/db/mongodb';
import redis from '@/lib/db/redis';
import Driver from '@/lib/db/models/Driver';

/**
 * Driver GPS pings arrive over Socket.IO at high frequency. server.js
 * writes them to Redis only (`driver:loc:{driverProfileId}` hashes plus
 * the H3 index). This worker flushes those positions to MongoDB every
 * few seconds so `$geoNear` fallbacks and admin views stay fresh
 * without a Mongo write per ping.
 */
const FLUSH_INTERVAL_MS = 10 * 1000;

export function startLocationFlusher() {
  if (global.__locationFlusher) return;
  global.__locationFlusher = setInterval(flushLocations, FLUSH_INTERVAL_MS);
}

async function flushLocations() {
  try {
    const keys = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'driver:loc:*', 'COUNT', 200);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0' && keys.length < 2000);

    if (keys.length === 0) return;

    await connectDB();

    const ops = [];
    for (const key of keys) {
      const data = await redis.hgetall(key);
      if (!data?.lat || !data?.lng || data.flushed === '1') continue;

      const driverProfileId = key.slice('driver:loc:'.length);
      ops.push({
        updateOne: {
          filter: { _id: driverProfileId },
          update: {
            location: {
              type: 'Point',
              coordinates: [parseFloat(data.lng), parseFloat(data.lat)],
            },
            lastLocationUpdate: new Date(parseInt(data.ts, 10) || Date.now()),
            ...(data.h3 ? { h3Cell: data.h3 } : {}),
          },
        },
      });
      // Mark flushed so unchanged positions aren't rewritten
      await redis.hset(key, 'flushed', '1');
    }

    if (ops.length > 0) {
      await Driver.bulkWrite(ops, { ordered: false });
    }
  } catch (err) {
    // Redis or Mongo down — the next tick will retry
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[LocationFlusher]', err.message);
    }
  }
}
