import { createHmac } from 'node:crypto';
import { config } from './env.js';

/** The shape browsers accept in `new RTCPeerConnection({ iceServers })`. */
export interface IceServer {
  urls: string[];
  username?: string;
  credential?: string;
}

export type RtcConfig = typeof config.rtc;

/** Short-lived TURN credentials: long enough for a session, useless soon after. */
const TURN_CREDENTIAL_TTL_SECONDS = 12 * 60 * 60;

/**
 * coturn "use-auth-secret" (TURN REST API): the username is the expiry time and the
 * password is an HMAC of it, so TURN never needs a user database and a leaked
 * credential stops working on its own.
 */
function ephemeralTurnCredential(secret: string, nowMs: number) {
  const expiresAt = Math.floor(nowMs / 1000) + TURN_CREDENTIAL_TTL_SECONDS;
  const username = `${expiresAt}:camera`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential };
}

/**
 * ICE servers are handed to browsers by the API (never baked into the client
 * bundle), so TURN credentials stay out of public JavaScript and can be changed
 * without rebuilding the frontend.
 */
export function buildIceServers(rtc: RtcConfig = config.rtc, nowMs = Date.now()): IceServer[] {
  const servers: IceServer[] = [];
  if (rtc.stunUrls.length > 0) servers.push({ urls: [...rtc.stunUrls] });

  if (rtc.turnUrls.length > 0) {
    if (rtc.turnSharedSecret) {
      servers.push({
        urls: [...rtc.turnUrls],
        ...ephemeralTurnCredential(rtc.turnSharedSecret, nowMs),
      });
    } else if (rtc.turnUsername && rtc.turnCredential) {
      servers.push({
        urls: [...rtc.turnUrls],
        username: rtc.turnUsername,
        credential: rtc.turnCredential,
      });
    }
  }
  return servers;
}
