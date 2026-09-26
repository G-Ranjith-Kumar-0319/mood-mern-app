# Architecture Decision Records

Short records of significant decisions: the context, the choice, and its consequences.

| #                                                      | Decision                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------ |
| [0001](0001-monorepo-with-npm-workspaces.md)           | Monorepo with npm workspaces, TypeScript everywhere                      |
| [0002](0002-browser-inference-with-face-api.md)        | Browser-side inference with `@vladmandic/face-api`                       |
| [0003](0003-temporal-smoothing.md)                     | Sliding-window weighted vote with hysteresis (adaptive for slow devices) |
| [0004](0004-persist-stable-segments.md)                | Persist stable expression segments, opt-in                               |
| [0005](0005-optional-auth-with-jwt-cookies.md)         | Optional auth with JWTs in HttpOnly cookies                              |
| [0006](0006-nginx-serves-frontend-and-balances-api.md) | One Nginx serves the frontend and load-balances the API                  |
| [0007](0007-replica-set-without-sharding.md)           | MongoDB replica set, no sharding                                         |
| [0008](0008-web-worker-inference.md)                   | Inference in a Web Worker with a main-thread fallback                    |
| [0009](0009-live-updates-sse-change-streams.md)        | Live updates: Server-Sent Events + MongoDB change streams                |
| [0010](0010-cursor-pagination.md)                      | Cursor (keyset) pagination for the history feed                          |
| [0011](0011-optional-redis-rate-limits.md)             | Optional Redis for shared rate-limit counters                            |
| [0012](0012-observability-metrics-and-tracing.md)      | Prometheus metrics and opt-in OpenTelemetry tracing                      |
| [0013](0013-email-one-time-tokens.md)                  | Email verification and password reset with hashed one-time tokens        |
| [0014](0014-hand-written-service-worker.md)            | A small hand-written service worker for offline use                      |
| [0015](0015-camera-source-selection.md)                | Camera source selection and front/rear switching                         |
| [0016](0016-phone-camera-webrtc.md)                    | Phone camera over WebRTC with Socket.IO signaling                        |
