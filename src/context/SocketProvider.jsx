'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { io } from 'socket.io-client';

const SocketContext = createContext({ socket: null, isConnected: false });

/**
 * Connects to the Socket.IO namespace matching the session role
 * (/rider, /driver or /admin) using a server-issued JWT.
 * Renders children immediately; the socket attaches when ready.
 */
export function SocketProvider({ children }) {
  const { data: session, status } = useSession();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef(null);

  const userId = session?.user?.id;
  const role = session?.user?.role;

  useEffect(() => {
    if (status !== 'authenticated' || !userId || !role) return undefined;

    let cancelled = false;

    async function connect() {
      let token = null;
      try {
        const res = await fetch('/api/auth/socket-token');
        if (res.ok) ({ token } = await res.json());
      } catch {
        /* server not ready — socket.io will retry via reconnect below */
      }
      if (cancelled || !token) return;

      const base = process.env.NEXT_PUBLIC_SOCKET_URL || '';
      const instance = io(`${base}/${role}`, {
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 8000,
      });

      instance.on('connect', () => setIsConnected(true));
      instance.on('disconnect', () => setIsConnected(false));
      instance.on('connect_error', async (err) => {
        setIsConnected(false);
        // Token likely expired — refresh it for the next retry
        if (/token|auth/i.test(err?.message || '')) {
          try {
            const res = await fetch('/api/auth/socket-token');
            if (res.ok) {
              const { token: fresh } = await res.json();
              instance.auth = { token: fresh };
            }
          } catch {
            /* retry keeps old token */
          }
        }
      });

      socketRef.current = instance;
      setSocket(instance);
    }

    connect();

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setSocket(null);
      setIsConnected(false);
    };
  }, [status, userId, role]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

export default SocketContext;
