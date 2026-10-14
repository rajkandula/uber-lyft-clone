/**
 * Socket.IO emit helpers for API routes and services.
 *
 * server.js stores the Server instance on `global.io`, which is shared
 * across Next.js route bundles because everything runs in one process.
 * Every helper is a safe no-op when the socket server isn't up
 * (e.g. during `next build` or unit scripts).
 */

const NS_RIDER = '/rider';
const NS_DRIVER = '/driver';
const NS_ADMIN = '/admin';

function ns(name) {
  return global.io ? global.io.of(name) : null;
}

/** Emit to one user's sockets in a namespace (room `user:{id}`). */
export function emitToUser(namespace, userId, event, data) {
  const n = ns(namespace);
  if (!n || !userId) return;
  n.to(`user:${userId}`).emit(event, data);
}

export function emitToRider(userId, event, data) {
  emitToUser(NS_RIDER, userId, event, data);
}

export function emitToDriver(userId, event, data) {
  emitToUser(NS_DRIVER, userId, event, data);
}

/** Emit to everyone in a ride room, in both rider and driver namespaces. */
export function emitToRide(rideId, event, data) {
  const room = `ride:${rideId}`;
  ns(NS_RIDER)?.to(room).emit(event, data);
  ns(NS_DRIVER)?.to(room).emit(event, data);
}

/** Emit to the admin live feed. */
export function emitToAdmin(event, data) {
  ns(NS_ADMIN)?.emit(event, data);
}

/** Join all of a user's sockets in a namespace to a ride room. */
export function joinUserToRide(namespace, userId, rideId) {
  const n = ns(namespace);
  if (!n || !userId) return;
  n.in(`user:${userId}`).socketsJoin(`ride:${rideId}`);
}

/** Remove all of a user's sockets in a namespace from a ride room. */
export function leaveRideRoom(namespace, userId, rideId) {
  const n = ns(namespace);
  if (!n || !userId) return;
  n.in(`user:${userId}`).socketsLeave(`ride:${rideId}`);
}

export function joinRiderToRide(userId, rideId) {
  joinUserToRide(NS_RIDER, userId, rideId);
}

export function joinDriverToRide(userId, rideId) {
  joinUserToRide(NS_DRIVER, userId, rideId);
}

/**
 * Cross-bundle event bus. Next.js may instantiate this module more than
 * once (separate route bundles), so the bus lives on `global`.
 * Used by the dispatch loop to hear accept/decline/cancel signals that
 * arrive through API routes.
 */
export function rideBus() {
  if (!global.__rideBus) {
    const { EventEmitter } = require('events');
    const bus = new EventEmitter();
    bus.setMaxListeners(1000);
    global.__rideBus = bus;
  }
  return global.__rideBus;
}
