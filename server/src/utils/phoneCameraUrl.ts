import { networkInterfaces } from 'node:os';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Private (RFC 1918) ranges, most likely home/office Wi-Fi first. 172.16–31 comes
 * last because Docker, WSL and Hyper-V also hand out addresses there.
 */
const PRIVATE_IPV4_BY_PREFERENCE = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
/** Virtual adapters a phone can never reach (Docker, WSL/Hyper-V, VirtualBox, VMware). */
const VIRTUAL_INTERFACE = /docker|br-|veth|vethernet|wsl|vbox|virtualbox|vmnet|vmware/i;

export interface NetworkAddress {
  interfaceName: string;
  address: string;
}

/** Picks the address a phone on the same Wi-Fi is most likely to reach. */
export function pickLanAddress(candidates: readonly NetworkAddress[]): string | null {
  const physical = candidates.filter(({ interfaceName }) => !VIRTUAL_INTERFACE.test(interfaceName));
  for (const range of PRIVATE_IPV4_BY_PREFERENCE) {
    const match = physical.find(({ address }) => range.test(address));
    if (match) return match.address;
  }
  return null;
}

/** The laptop's LAN address, e.g. 192.168.1.100 (null when offline or not on a private network). */
export function findLanAddress(): string | null {
  const candidates = Object.entries(networkInterfaces()).flatMap(([interfaceName, infos]) =>
    (infos ?? [])
      .filter((info) => info.family === 'IPv4' && !info.internal)
      .map((info) => ({ interfaceName, address: info.address })),
  );
  return pickLanAddress(candidates);
}

export interface CameraBaseUrlInput {
  /** PHONE_CAMERA_URL: explicit override, always wins. */
  configured?: string;
  appUrl: string;
  isProduction: boolean;
  /** The laptop page's Origin header (development only). */
  requestOrigin?: string;
  lanAddress: string | null;
}

/**
 * Where the phone should open the camera page.
 *
 * Development (`npm run dev`, API on the laptop itself): the laptop page's own
 * origin, so scheme and port match what is running (e.g. https://…:5173 from
 * `npm run dev:phone`), with "localhost" replaced by the laptop's LAN address,
 * because a phone cannot reach the laptop's localhost.
 *
 * Production/Docker: PHONE_CAMERA_URL or APP_URL, unchanged. Inside a container
 * the "LAN address" would be the container's own IP, which a phone cannot reach.
 */
export function resolveCameraBaseUrl(input: CameraBaseUrlInput): string {
  const { configured, appUrl, isProduction, requestOrigin, lanAddress } = input;
  if (configured) return configured;

  const base = !isProduction && requestOrigin ? requestOrigin : appUrl;
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    url = new URL(appUrl);
  }
  if (!isProduction && LOOPBACK_HOSTS.has(url.hostname) && lanAddress) url.hostname = lanAddress;
  return url.origin;
}

export function buildCameraUrl(baseUrl: string, sessionId: string, phoneToken: string): string {
  // The token travels in the #fragment: browsers never send it to a server, so it
  // cannot end up in Nginx/Vite access logs or Referer headers.
  return `${baseUrl}/camera/${encodeURIComponent(sessionId)}#token=${encodeURIComponent(phoneToken)}`;
}
