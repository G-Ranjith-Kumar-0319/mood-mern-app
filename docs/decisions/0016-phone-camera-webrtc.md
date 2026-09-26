# 0016 — Phone camera over WebRTC with Socket.IO signaling

**Status:** accepted

## Context

Users want to point a phone camera at themselves (or at someone else) and run detection on the
laptop. Video must not be uploaded or stored (CLAUDE.md §9), and the API runs as several stateless
instances behind Nginx (ADR 0006).

## Decision

- **WebRTC for media, Socket.IO for signaling only.** The phone streams straight to the laptop
  browser (DTLS-SRTP), and the API relays offer/answer/ICE messages. The phone always offers (it owns
  the track) and the laptop answers. The server enforces the direction.
- **Pairing = signed tokens, not stored rows.** `POST /api/v1/camera/sessions` returns a session id,
  a host token (laptop) and a phone token (QR code), valid 10 minutes for _joining_. Any instance can
  verify them, so no shared session store is needed.
- **Presence in memory, co-located by Nginx.** `/socket.io/` is routed by `hash $arg_sessionId`, so
  both peers of a session reach the same instance, which keeps a `Map` of at most one laptop and one
  phone per session (newest connection wins, so refreshes just work).
- **Token in the URL fragment** (`#token=`) so it never reaches access logs; in the Socket.IO
  handshake body, never the URL.
- **ICE servers from the API**, not `VITE_` variables: TURN credentials stay out of the public bundle
  and can be short-lived (coturn shared secret).
- **One detector.** Remote and local streams go into the same `<video>`, and the phone status is
  mapped onto the local camera's status, so detection, smoothing, persistence and the UI states are
  reused unchanged. The phone page reuses `useCamera` (rear camera first) and the camera components.
- **Development HTTPS** via `@vitejs/plugin-basic-ssl` in `vite --mode phone`: phones refuse camera
  access over `http://<LAN-IP>`. In development the QR code swaps `localhost` for the LAN IP.

## Alternatives considered

- **Media through the server** (upload frames/WebSocket video): violates the privacy goal, costs
  bandwidth and latency.
- **Plain WebSocket (`ws`) or SSE + POST for signaling**: fewer dependencies, but reconnection,
  acknowledgements and long-polling fallback would be hand-written. Socket.IO was explicitly requested.
- **Redis adapter + Redis presence**: works without sticky routing, but adds moving parts. Hash
  routing achieves the same for a two-peer session with none.
- **One shared token**: whoever scans the QR could impersonate the laptop.

## Consequences

- Dependencies: `socket.io`, `socket.io-client`, `qrcode.react` (no dependencies of its own),
  `@vitejs/plugin-basic-ssl` (dev only).
- Nginx must use plain `hash` (not `consistent`): with a `zone` (needed for `resolve`), Nginx 1.29
  silently uses round-robin for consistent hashing. This was found by testing against the running stack. Scaling the
  API can reshuffle pairings in progress.
- Production needs TURN for users on different/restrictive networks.
- A real two-page Chromium test covers the full path, including detection on the remote stream.
