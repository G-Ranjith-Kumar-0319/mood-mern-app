# 0001 — Monorepo with npm workspaces, TypeScript everywhere

**Status:** accepted

## Context

The client and server are developed together, and the project should start with `npm install && npm run dev`.

## Decision

- A single repository with npm workspaces (`client`, `server`) and one lockfile.
- Root scripts orchestrate both (`dev`, `lint`, `typecheck`, `test`, `build`, `validate`).
- TypeScript in strict mode (`noUncheckedIndexedAccess` included) on both sides. ESLint forbids `any`.
- TypeScript is pinned to 6.0.x because `typescript-eslint` does not support 7.x yet.
- No shared package for the handful of types that cross the wire (the expression list, DTO shapes).
  They are duplicated with "keep in sync" comments. A shared workspace package would add build
  plumbing that is not worth it for ~20 lines.

## Consequences

- One install, one CI job, consistent tooling.
- If the API contract grows, extract a `shared/` workspace or generate types from an OpenAPI spec.
