# Learning guides

One guide per technology. Each explains **every API this project actually uses**:
what it does, **why** it's used here, and **where** in the code, plus real bugs we
hit and short exercises. Read a guide with the linked source files open.

## Suggested reading order

1. [TypeScript-docs.md](TypeScript-docs.md): the language used everywhere
2. **Frontend:** [React-docs.md](React-docs.md) → [ReactRouter-docs.md](ReactRouter-docs.md) →
   [TanStackQuery-docs.md](TanStackQuery-docs.md) → [MaterialUI-docs.md](MaterialUI-docs.md) →
   [Vite-docs.md](Vite-docs.md)
3. **In the browser:** [BrowserAPIs-docs.md](BrowserAPIs-docs.md) (camera, workers,
   service worker, SSE…) → [FaceAPI-TensorFlowJS-docs.md](FaceAPI-TensorFlowJS-docs.md)
4. **Backend:** [NodeJS-docs.md](NodeJS-docs.md) → [Express-docs.md](Express-docs.md) →
   [Zod-docs.md](Zod-docs.md) → [ExpressSecurity-docs.md](ExpressSecurity-docs.md) →
   [JWT-Auth-docs.md](JWT-Auth-docs.md)
5. **Data:** [MongoDB-docs.md](MongoDB-docs.md) → [Mongoose-docs.md](Mongoose-docs.md) →
   [Redis-docs.md](Redis-docs.md) → [Nodemailer-Mailpit-docs.md](Nodemailer-Mailpit-docs.md)
6. **Testing:** [Vitest-docs.md](Vitest-docs.md) → [ReactTestingLibrary-docs.md](ReactTestingLibrary-docs.md) →
   [Supertest-docs.md](Supertest-docs.md) → [Playwright-docs.md](Playwright-docs.md)
7. **Operations:** [Docker-docs.md](Docker-docs.md) → [Nginx-docs.md](Nginx-docs.md) →
   [GitHubActions-docs.md](GitHubActions-docs.md) → [Pino-docs.md](Pino-docs.md) →
   [Prometheus-Grafana-docs.md](Prometheus-Grafana-docs.md) →
   [OpenTelemetry-Jaeger-docs.md](OpenTelemetry-Jaeger-docs.md)

## All guides

| Area          | Guide                                                    | Library versions in this repo                     |
| ------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Language      | [TypeScript](TypeScript-docs.md)                         | TypeScript 6.0                                    |
| UI            | [React](React-docs.md)                                   | React 19                                          |
| UI            | [React Router](ReactRouter-docs.md)                      | react-router 8                                    |
| UI            | [TanStack Query](TanStackQuery-docs.md)                  | @tanstack/react-query 5                           |
| UI            | [Material UI](MaterialUI-docs.md)                        | @mui/material 9                                   |
| Build         | [Vite](Vite-docs.md)                                     | Vite 8                                            |
| Browser       | [Web platform APIs](BrowserAPIs-docs.md)                 | —                                                 |
| AI            | [face-api & TensorFlow.js](FaceAPI-TensorFlowJS-docs.md) | @vladmandic/face-api 1.7                          |
| Server        | [Node.js](NodeJS-docs.md)                                | Node 24                                           |
| Server        | [Express](Express-docs.md)                               | Express 5                                         |
| Server        | [Zod](Zod-docs.md)                                       | Zod 4                                             |
| Server        | [Security middleware](ExpressSecurity-docs.md)           | helmet 8, cors, express-rate-limit 8, compression |
| Server        | [Authentication](JWT-Auth-docs.md)                       | jsonwebtoken 9, bcryptjs 3                        |
| Data          | [MongoDB](MongoDB-docs.md)                               | MongoDB 8                                         |
| Data          | [Mongoose](Mongoose-docs.md)                             | Mongoose 9                                        |
| Data          | [Redis](Redis-docs.md)                                   | redis (node-redis) 6, rate-limit-redis 6          |
| Email         | [Nodemailer & Mailpit](Nodemailer-Mailpit-docs.md)       | nodemailer 10                                     |
| Tests         | [Vitest](Vitest-docs.md)                                 | Vitest 5                                          |
| Tests         | [React Testing Library](ReactTestingLibrary-docs.md)     | RTL 16, user-event 14                             |
| Tests         | [Supertest & mongodb-memory-server](Supertest-docs.md)   | supertest 7, mongodb-memory-server 11             |
| Tests         | [Playwright](Playwright-docs.md)                         | @playwright/test 1.63                             |
| Ops           | [Docker & Compose](Docker-docs.md)                       | Docker 29, Compose v5                             |
| Ops           | [Nginx](Nginx-docs.md)                                   | nginx 1.29 (unprivileged)                         |
| Ops           | [GitHub Actions](GitHubActions-docs.md)                  | —                                                 |
| Observability | [Pino](Pino-docs.md)                                     | pino 10, pino-http 11                             |
| Observability | [Prometheus & Grafana](Prometheus-Grafana-docs.md)       | prom-client 15                                    |
| Observability | [OpenTelemetry & Jaeger](OpenTelemetry-Jaeger-docs.md)   | @opentelemetry/sdk-node 0.222                     |

For the _why_ behind the architecture, see [../architecture.md](../architecture.md) and
the [decision records](../decisions/).
