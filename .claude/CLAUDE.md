# CLAUDE.md — AI MERN Facial Expression Detector

## 1. Project Mission

Build a production-quality, easy-to-understand MERN application that uses the user's webcam to detect **visible facial expressions** in the browser and displays a corresponding emoji.

Important product wording:

- Say **"Detected expression"**, not "true mood" or "mental state".
- The AI estimates visible facial-expression patterns; it cannot reliably determine a person's internal emotional state.
- Prefer browser-side inference so camera frames do not need to leave the device.
- Do not store raw face images/video unless the user explicitly enables a future feature requiring it.

Example:

```text
Camera → Face Detection → Expression Classification
       → Confidence → Temporal Smoothing → Emoji
       → Optional API persistence → MongoDB
```

The project is primarily a learning/portfolio application demonstrating:

- React + TypeScript
- Computer vision / browser ML
- Node.js + Express
- MongoDB + Mongoose
- REST API design
- Authentication
- Validation and error handling
- MongoDB indexing and aggregation
- Docker
- Nginx reverse proxy/load balancing
- Production architecture
- Testing
- CI/CD
- Observability and security

---

## 2. Core Engineering Principles

Follow these principles throughout the project:

1. **Keep the architecture simple before making it scalable.**
2. **Do not over-engineer the MVP.**
3. **Use TypeScript end-to-end.**
4. **Prefer small, focused modules.**
5. **Use reusable React components and custom hooks.**
6. **Never put business logic directly into UI components.**
7. **Never put database logic directly inside route definitions.**
8. **Use Controller → Service → Repository/Data Access separation where useful.**
9. **Validate all external input.**
10. **Centralize error handling.**
11. **Use environment variables for secrets/configuration.**
12. **Never commit secrets.**
13. **Use structured logging.**
14. **Write tests for important business logic.**
15. **Optimize only after identifying a real bottleneck.**
16. **Prefer privacy-preserving browser inference.**
17. **Do not persist every camera frame or AI prediction.**
18. **Use indexes based on actual query patterns.**
19. **Design APIs to be horizontally scalable/stateless.**
20. **Document architectural decisions and trade-offs.**

---

# 3. Required Technology Stack

## Frontend

- React
- TypeScript
- Vite
- React Router
- Material UI
- React Testing Library
- Vitest
- ESLint
- Prettier

Use a browser-compatible computer-vision/expression-recognition solution such as MediaPipe and/or TensorFlow.js where appropriate.

Do not invent an AI model or pretend a library provides functionality it does not actually provide. Verify package APIs before implementation.

## Backend

- Node.js
- Express
- TypeScript
- Mongoose
- MongoDB
- Zod or an equivalent validation library
- Helmet
- CORS
- Rate limiting
- Structured logging

## Infrastructure

- Docker
- Docker Compose for local development
- Nginx
- MongoDB Replica Set for production-style database deployment
- GitHub Actions or equivalent CI/CD

Optional later additions:

- Redis
- WebSocket
- Queue/worker
- AWS
- CloudWatch/OpenTelemetry

Do not add optional infrastructure until the core application works.

---

# 4. Recommended Repository Structure

Use a clean monorepo:

```text
ai-expression-detector/
├── CLAUDE.md
├── README.md
├── .env.example
├── .gitignore
├── docker-compose.yml
├── package.json
├── client/
│   ├── src/
│   │   ├── app/
│   │   ├── components/
│   │   │   ├── Camera/
│   │   │   ├── FaceOverlay/
│   │   │   ├── ExpressionResult/
│   │   │   ├── ConfidenceIndicator/
│   │   │   └── ErrorState/
│   │   ├── pages/
│   │   │   ├── Home/
│   │   │   ├── History/
│   │   │   └── Dashboard/
│   │   ├── hooks/
│   │   │   ├── useCamera.ts
│   │   │   ├── useExpressionDetection.ts
│   │   │   └── useExpressionHistory.ts
│   │   ├── services/
│   │   ├── utils/
│   │   ├── types/
│   │   ├── constants/
│   │   └── main.tsx
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── repositories/
│   │   ├── schemas/
│   │   ├── utils/
│   │   ├── types/
│   │   ├── app.ts
│   │   └── server.ts
│   └── package.json
│
├── nginx/
│   └── nginx.conf
│
├── scripts/
└── docs/
    ├── architecture.md
    ├── api.md
    ├── database.md
    ├── deployment.md
    ├── security.md
    └── decisions/
```

---

# 5. Product Requirements

## MVP

The first version MUST support:

1. Start webcam.
2. Stop webcam.
3. Handle camera permission denial.
4. Detect a face.
5. Detect supported visible facial expressions.
6. Show confidence.
7. Display an emoji.
8. Display "No face detected" when appropriate.
9. Avoid rapid expression flickering.
10. Save selected detection events to MongoDB.
11. Display detection history.
12. Display basic expression statistics.
13. Work responsively on desktop and mobile where browser capabilities permit.
14. Never require raw camera frames to be uploaded for the MVP.

Supported expression categories should be determined by the actual model/library used. Do not hard-code unsupported categories.

---

# 6. Expression Detection Pipeline

Implement this pipeline:

```text
Webcam
  ↓
Video Element
  ↓
Frame Sampling
  ↓
Face Detection
  ↓
Expression Classification
  ↓
Confidence Threshold
  ↓
Temporal Smoothing / Debouncing
  ↓
Stable Expression
  ↓
Emoji Mapping
  ↓
Optional Persistence
```

## Performance rules

Do NOT run expensive inference unnecessarily at maximum camera FPS.

For example:

```text
Camera: 30 FPS
Inference: approximately 5–15 FPS depending on device
UI rendering: independent from inference
Persistence: only meaningful/stable events
```

Use requestAnimationFrame, throttling, or an equivalent strategy carefully.

Do not run inference if:

- Camera is stopped.
- Video is not ready.
- No face exists.
- Model is not loaded.
- Browser does not support required APIs.

---

# 7. Temporal Smoothing

Do not immediately change the UI from every individual prediction.

Example:

```text
Frame 1: happy 0.92
Frame 2: happy 0.89
Frame 3: neutral 0.55
Frame 4: happy 0.91
Frame 5: happy 0.93
```

A smoothing/debouncing strategy should keep the UI stable.

Implement a reusable utility such as:

```ts
type ExpressionPrediction = {
  expression: string;
  confidence: number;
  timestamp: number;
};
```

The final expression should be based on recent predictions rather than a single noisy frame.

Document the chosen smoothing strategy.

---

# 8. Emoji Mapping

Keep mapping isolated:

```ts
const EXPRESSION_EMOJI = {
  happy: "😊",
  sad: "😢",
  angry: "😡",
  surprised: "😮",
  fearful: "😨",
  disgusted: "🤢",
  neutral: "😐",
};
```

Only expose expressions supported by the actual inference model.

Do not call these emojis a medical or psychological diagnosis.

---

# 9. Camera Security and Privacy

Camera access:

```ts
navigator.mediaDevices.getUserMedia({
  video: true,
  audio: false,
});
```

Requirements:

- Never request microphone access.
- Stop all MediaStream tracks when the camera is disabled/unmounted.
- Clearly explain camera permission requirements.
- Use HTTPS in production.
- Do not store camera frames by default.
- Do not upload face images by default.
- Do not log images or video.
- Do not place sensitive camera data into analytics.
- Add a visible camera-active indicator.
- Handle permission errors gracefully.

Privacy should be documented in `docs/security.md`.

---

# 10. MongoDB Data Model

Use an `ExpressionDetection` collection.

Suggested schema:

```ts
{
  userId?: ObjectId,
  expression: string,
  confidence: number,
  detectedAt: Date,
  durationMs?: number,
  source: "camera",
  createdAt: Date,
  updatedAt: Date
}
```

Do not store raw images in this collection.

Validation:

- confidence must be between 0 and 1.
- expression must belong to supported values.
- timestamps must be valid.
- userId must be validated when authentication is enabled.

---

# 11. MongoDB Indexing

Design indexes from query patterns.

Expected queries:

```text
Latest detections
User history
Expression history
Daily statistics
Date-range statistics
```

Possible indexes:

```js
{ detectedAt: -1 }
{ userId: 1, detectedAt: -1 }
{ expression: 1, detectedAt: -1 }
{ userId: 1, expression: 1, detectedAt: -1 }
```

Do not blindly create every index.

For every production index, document:

- Query it supports
- Why it is needed
- Expected selectivity
- Write overhead
- Whether a compound index makes another index redundant

Use `explain("executionStats")` when evaluating performance.

---

# 12. API Design

Use:

```text
/api/v1/health
/api/v1/expressions
/api/v1/expressions/history
/api/v1/expressions/stats
```

Recommended endpoints:

```text
POST   /api/v1/expressions
GET    /api/v1/expressions
GET    /api/v1/expressions/stats
GET    /api/v1/expressions/:id
DELETE /api/v1/expressions/:id
```

Do not create unnecessary CRUD endpoints.

Use pagination for history.

Example:

```http
GET /api/v1/expressions?page=1&limit=20
```

Response format:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

Error format:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid expression"
  }
}
```

Never expose stack traces in production responses.

---

# 13. Backend Architecture

Use:

```text
Route
  ↓
Validation Middleware
  ↓
Controller
  ↓
Service
  ↓
Repository/Data Access
  ↓
Mongoose
  ↓
MongoDB
```

Example:

```text
expression.routes.ts
        ↓
expression.schema.ts
        ↓
expression.controller.ts
        ↓
expression.service.ts
        ↓
expression.repository.ts
        ↓
Expression model
        ↓
MongoDB
```

Controllers should be thin.

Business logic belongs in services.

Database operations belong in repositories/data-access modules when the abstraction provides real value.

---

# 14. Authentication

Authentication is optional for the first MVP.

When implemented:

```text
Register
Login
Access Token
Refresh Token
Protected Routes
User-specific History
```

Requirements:

- Never store plain-text passwords.
- Hash passwords with a suitable password hashing algorithm.
- Use secure token handling.
- Validate authorization on the server.
- Never trust `userId` supplied by the client.
- Prefer HttpOnly secure cookies where appropriate.
- Implement rate limiting for login endpoints.

---

# 15. React Architecture

Avoid one giant `App.tsx`.

Use:

```text
App
 ├── Router
 ├── HomePage
 │    ├── Camera
 │    ├── DetectionOverlay
 │    ├── ExpressionResult
 │    └── ConfidenceIndicator
 │
 ├── HistoryPage
 │    └── HistoryTable
 │
 └── DashboardPage
      ├── ExpressionSummary
      └── ExpressionChart
```

Use custom hooks:

```text
useCamera()
useExpressionDetection()
useExpressionHistory()
```

The camera hook manages:

- MediaStream
- Permission
- Start/stop
- Cleanup
- Camera errors

The expression hook manages:

- Model loading
- Detection
- Frame scheduling
- Smoothing
- Confidence
- Detection state

---

# 16. State Management

Do not introduce Redux unless global application state actually requires it.

For the MVP:

- React state
- Context where appropriate
- React Query/TanStack Query for server state

Prefer server-state caching tools for:

- History
- Statistics
- API mutations

Do not duplicate server state unnecessarily in local state.

---

# 17. UI/UX

The home page should clearly communicate:

```text
AI Facial Expression Detector

[ Start Camera ]

Camera status: Off

Detected expression:
😐 Neutral

Confidence:
92%

[ Stop Camera ]
```

States:

1. Initial
2. Loading model
3. Requesting camera permission
4. Camera active
5. Detecting face
6. No face detected
7. Expression detected
8. Low confidence
9. Camera error
10. Model loading error

Use accessible labels and keyboard navigation.

Do not rely on emoji/color alone to communicate status.

---

# 18. Error Handling

Frontend errors:

```text
CameraPermissionError
CameraNotSupportedError
ModelLoadError
NoFaceDetected
InferenceError
NetworkError
```

Backend:

- Central error middleware
- Typed/application errors
- Validation errors
- Authentication errors
- Authorization errors
- Not found
- Rate limit
- Database errors
- Unknown errors

Production response should never expose internal stack traces.

---

# 19. Rate Limiting and Persistence Strategy

Never send every prediction to the API.

Bad:

```text
30 predictions/sec
↓
30 HTTP requests/sec
↓
MongoDB
```

Good:

```text
30 camera FPS
↓
5–15 AI predictions/sec
↓
Temporal smoothing
↓
Stable expression
↓
Persist only periodically / on meaningful change
```

For example, persistence can occur when:

- Expression changes and remains stable.
- A configured interval has elapsed.
- A user explicitly requests saving a detection.

Make the interval configurable.

---

# 20. API Performance

Implement:

- Pagination
- Projection
- Lean Mongoose queries where appropriate
- Proper indexes
- Avoid N+1 database queries
- Aggregation pipelines for statistics
- Request validation
- Rate limiting
- Compression where appropriate
- HTTP keep-alive
- Connection pooling through the MongoDB driver/Mongoose

Do not optimize prematurely.

Measure first.

---

# 21. Statistics

Implement:

```text
GET /api/v1/expressions/stats
```

Example aggregation:

```text
Match date range
    ↓
Group by expression
    ↓
Count
    ↓
Sort
```

Later support:

```text
Daily
Weekly
Monthly
Date range
```

Use MongoDB aggregation rather than loading every document into Node.js.

---

# 22. Nginx Production Architecture

Use:

```text
Internet
   ↓
HTTPS
   ↓
Nginx
   ↓
Node API instances
   ├── API #1
   ├── API #2
   └── API #3
          ↓
      MongoDB
```

Nginx responsibilities:

- Reverse proxy
- Load balancing
- TLS termination
- Static frontend delivery if appropriate
- Security headers where appropriate
- Request size limits
- Connection handling

Keep Node API instances stateless.

Do not store sessions only in local memory when horizontally scaling.

---

# 23. MongoDB Production Architecture

For a production-style environment:

```text
MongoDB Replica Set

Primary
  ├── Secondary
  └── Secondary
```

Understand the difference between:

- Replication
- High availability
- Horizontal scaling
- Sharding

Do NOT add sharding merely because the project uses MongoDB.

Start with a Replica Set.

Only introduce sharding if scale/query/data-volume requirements justify it.

If sharding is later added, document:

```text
mongos
  ↓
Config Servers
  ↓
Shard 1 Replica Set
Shard 2 Replica Set
Shard 3 Replica Set
```

Choose shard keys based on actual access patterns.

---

# 24. Docker

Provide:

```text
Dockerfile
docker-compose.yml
.dockerignore
```

Local services:

```text
frontend
backend
mongodb
nginx
```

Production should use environment-specific configuration.

Do not put secrets directly in Dockerfiles or compose files.

---

# 25. Environment Variables

Provide:

```text
.env.example
```

Example:

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://localhost:27017/expression_detector
CLIENT_URL=http://localhost:5173
JWT_SECRET=replace_me
LOG_LEVEL=info
```

Never commit `.env`.

---

# 26. Testing Strategy

## Frontend

Test:

- Camera permission states
- UI state transitions
- Expression display
- Emoji mapping
- Confidence rendering
- Error states
- History rendering

## Unit tests

Test:

- Expression smoothing
- Confidence threshold
- Emoji mapping
- Validation
- Statistics transformation

## Backend

Test:

- Controllers
- Services
- Validation
- Authentication
- Authorization
- API errors
- Pagination

## Integration

Test:

```text
HTTP API
  ↓
Service
  ↓
MongoDB test database
```

Do not make tests depend on a developer's local MongoDB.

---

# 27. Security Checklist

Implement:

- Helmet
- CORS allowlist
- Rate limiting
- Input validation
- Output sanitization where relevant
- Secure headers
- HTTPS in production
- Secret management
- Password hashing
- Authorization checks
- MongoDB query validation
- Request body size limits
- No sensitive logs
- No camera frame logging
- No raw biometric storage by default

---

# 28. Observability

Add:

```text
Health endpoint
Structured logs
Request IDs
Error logging
Latency measurements
MongoDB connection monitoring
```

Health:

```http
GET /api/v1/health
```

Response:

```json
{
  "status": "ok",
  "service": "expression-api"
}
```

Later support readiness/liveness separately:

```text
/health/live
/health/ready
```

---

# 29. Development Workflow

Use:

```text
feature branch
   ↓
lint
   ↓
typecheck
   ↓
unit tests
   ↓
integration tests
   ↓
build
   ↓
Docker build
   ↓
deploy
```

CI must fail on:

- Type errors
- Lint errors
- Failed tests
- Failed production build

---

# 30. Documentation Requirements

Maintain:

```text
README.md
docs/architecture.md
docs/api.md
docs/database.md
docs/security.md
docs/deployment.md
docs/decisions/
```

README must explain:

1. What the application does
2. Architecture
3. Technology stack
4. Project structure
5. Local setup
6. Environment variables
7. Running frontend
8. Running backend
9. Running MongoDB
10. Running Docker
11. Testing
12. Production deployment
13. Privacy considerations
14. Known limitations

---

# 31. Implementation Order

Implement in this exact sequence.

## Phase 1 — Repository

Create:

```text
client
server
docs
nginx
```

Set up TypeScript, ESLint, Prettier.

## Phase 2 — Camera

Implement:

```text
Start camera
Stop camera
Permission handling
Cleanup
```

## Phase 3 — AI

Implement:

```text
Model loading
Face detection
Expression detection
Confidence
Temporal smoothing
```

## Phase 4 — UI

Implement:

```text
Expression result
Emoji
Confidence
Error states
Responsive UI
```

## Phase 5 — Backend

Implement:

```text
Express
MongoDB
Mongoose
Validation
REST API
Error middleware
```

## Phase 6 — Persistence

Implement:

```text
Stable detection persistence
History
Pagination
Statistics
Indexes
```

## Phase 7 — Authentication

Implement only after the core flow works.

## Phase 8 — Tests

Add unit, integration, and frontend tests.

## Phase 9 — Docker

Containerize:

```text
client
server
mongodb
nginx
```

## Phase 10 — Production architecture

Add:

```text
Nginx
multiple Node instances
MongoDB Replica Set
CI/CD
observability
security hardening
```

Do not add MongoDB sharding unless a documented requirement justifies it.

---

# 32. Code Quality Rules

Always:

- Use meaningful names.
- Avoid `any`.
- Prefer explicit types.
- Keep functions small.
- Keep components focused.
- Avoid deeply nested conditionals.
- Avoid duplicated logic.
- Avoid magic numbers.
- Centralize constants.
- Add comments only when they explain WHY.
- Prefer readable code over clever code.
- Do not generate placeholder implementations and claim they are production-ready.
- Do not leave TODOs for core functionality.
- If a dependency API is uncertain, verify it before coding.

---

# 33. AI Coding Instructions

When modifying this repository:

1. First inspect the existing project structure.
2. Read relevant files before changing them.
3. Do not overwrite working code unnecessarily.
4. Make the smallest coherent change.
5. Preserve existing conventions.
6. Run relevant tests after changes.
7. Run type checking.
8. Run linting.
9. Build affected applications.
10. Explain important architectural decisions.
11. Never silently change public API contracts.
12. Update documentation when architecture changes.
13. Do not add dependencies unless they provide clear value.
14. Prefer maintained, actively supported packages.
15. Avoid deprecated APIs.
16. Do not invent package names, functions, or configuration options.
17. If a library API has changed, verify its current API before implementation.

---

# 34. Definition of Done

A feature is not complete until:

- Code compiles.
- TypeScript passes.
- Lint passes.
- Tests pass.
- Error states are handled.
- Loading states are handled.
- Security implications are considered.
- Performance implications are considered.
- Documentation is updated when necessary.
- No secrets are committed.
- No unnecessary dependencies are introduced.

---

# 35. Expected Final User Experience

The final application should provide:

```text
┌──────────────────────────────────────────┐
│       AI Facial Expression Detector      │
├──────────────────────────────────────────┤
│                                          │
│          ┌───────────────────┐           │
│          │                   │           │
│          │      CAMERA       │           │
│          │                   │           │
│          └───────────────────┘           │
│                                          │
│                 😊                       │
│                                          │
│              Happy                       │
│                                          │
│         Confidence: 94%                  │
│                                          │
│       [ Start Detection ]                │
│                                          │
├──────────────────────────────────────────┤
│              History                     │
│                                          │
│  😊 Happy       10:35 AM                 │
│  😐 Neutral      10:31 AM                │
│  😮 Surprised    10:28 AM                │
│                                          │
└──────────────────────────────────────────┘
```

---

# 36. Important Privacy/Product Disclaimer

Use wording such as:

> "This application estimates visible facial expressions using an AI model. It does not determine or diagnose a person's actual emotional or mental state."

Do not market the application as a medical, psychological, or diagnostic system.

---

# 37. Primary Goal for Claude Code

Build this application incrementally.

Do NOT generate the entire repository blindly in one step.

At each phase:

1. Inspect the repository.
2. Explain the plan briefly.
3. Implement the phase.
4. Run validation/tests.
5. Fix errors.
6. Update documentation.
7. Summarize what changed.
8. Move to the next phase only after the current phase is working.

Start with **Phase 1: repository setup and architecture**, then proceed sequentially.

The final result should be understandable to a senior MERN developer learning production system design, while remaining simple enough for a developer to run locally with:

```bash
npm install
npm run dev
```

and Docker with:

```bash
docker compose up --build
```
