import type { CameraRole } from '../services/cameraSession.service.js';

/** The bits of a socket the registry needs (keeps it testable without Socket.IO). */
export interface PeerHandle {
  id: string;
}

interface LiveSession<P extends PeerHandle> {
  peers: Partial<Record<CameraRole, P>>;
  /** When the join tokens expire; the entry can be dropped after this once empty. */
  expiresAt: number;
  /** The laptop ended the session: nobody may join it again. */
  ended: boolean;
}

export const otherRole = (role: CameraRole): CameraRole => (role === 'host' ? 'phone' : 'host');

/**
 * In-memory presence for camera sessions on this API instance: at most one
 * laptop and one phone per session. Nginx routes both peers of a session to the
 * same instance (hash on sessionId), so no shared store is needed.
 */
export class CameraSessionRegistry<P extends PeerHandle> {
  private readonly sessions = new Map<string, LiveSession<P>>();

  isEnded(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.ended ?? false;
  }

  /**
   * Adds a peer. A newer connection for the same role replaces the older one
   * (a refreshed page reconnects before the old socket has timed out); the
   * replaced peer is returned so the caller can disconnect it.
   */
  join(sessionId: string, role: CameraRole, peer: P, expiresAt: number): { replaced: P | null } {
    const session = this.sessions.get(sessionId) ?? { peers: {}, expiresAt, ended: false };
    const previous = session.peers[role];
    session.peers[role] = peer;
    session.expiresAt = Math.max(session.expiresAt, expiresAt);
    this.sessions.set(sessionId, session);
    return { replaced: previous && previous.id !== peer.id ? previous : null };
  }

  /** Removes the peer if it is still the current one for its role. Returns true if it was. */
  leave(sessionId: string, role: CameraRole, peer: P): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || session.peers[role]?.id !== peer.id) return false;
    delete session.peers[role];
    return true;
  }

  peer(sessionId: string, role: CameraRole): P | null {
    return this.sessions.get(sessionId)?.peers[role] ?? null;
  }

  end(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) session.ended = true;
  }

  /** Drops expired sessions nobody is connected to. */
  sweep(now: number): void {
    for (const [sessionId, session] of this.sessions) {
      const empty = !session.peers.host && !session.peers.phone;
      if (empty && now >= session.expiresAt) this.sessions.delete(sessionId);
    }
  }

  get size(): number {
    return this.sessions.size;
  }
}
