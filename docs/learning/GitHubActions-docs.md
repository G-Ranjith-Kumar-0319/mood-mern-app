# GitHub Actions (CI) — learning guide for this project

GitHub Actions runs the pipeline in [.github/workflows/ci.yml](../../.github/workflows/ci.yml)
on every push to `main` and every pull request. **Any failure fails the build.**

---

## Workflow structure

```text
quality ──┬──► e2e      (Playwright, fake camera)
          └──► docker   (compose up --wait + smoke tests)
```

| Key                                                                      | Meaning                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `on: push (main), pull_request`                                          | Triggers                                                                             |
| `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }` | A newer push cancels the older run on the same branch                                |
| `permissions: contents: read`                                            | Least privilege for the workflow token                                               |
| `jobs.<id>.needs`                                                        | `e2e` and `docker` run only after `quality` passes (and in parallel with each other) |
| `runs-on: ubuntu-latest`                                                 | A fresh VM per job                                                                   |
| `env:`                                                                   | `MONGOMS_DOWNLOAD_DIR` tells mongodb-memory-server where to cache MongoDB            |
| `if: failure()` / `if: always()`                                         | Upload reports only on failure; always tear down Docker                              |

## Actions used

| Action                                    | Why                                                |
| ----------------------------------------- | -------------------------------------------------- |
| `actions/checkout@v7`                     | Get the code                                       |
| `actions/setup-node@v7` with `cache: npm` | Node 24 plus a cached npm download store           |
| `actions/cache@v6`                        | Cache the ~100 MB MongoDB test binary between runs |
| `actions/upload-artifact@v7`              | Keep the Playwright HTML report when E2E fails     |

(Major versions were checked against the actions' real tags before use.)

## What each job runs

1. **quality:** `npm ci` → `format:check` → `lint` → `typecheck` → `npm test`
   (unit + integration, in-memory MongoDB) → `npm run build`
2. **e2e:** `npm ci` → `playwright install --with-deps chromium` → `npm run test:e2e`
3. **docker:** `npm run setup:env` (random secrets) → `docker compose up --build --detach --wait`
   → curl readiness, the SPA, a model file and a POST through Nginx → logs on failure
   → `docker compose down --volumes`

Locally, `npm run validate` runs the same checks as the quality job.

## Extending to deployment (CD)

Add a job on `main` that logs in to a registry and pushes the two images with
`docker/build-push-action`, then triggers your platform's rollout (see
[deployment.md](../deployment.md)).

## Exercises

1. Push a branch with a lint error and open a pull request. Which job fails, and do
   `e2e`/`docker` still run?
2. Add a `coverage` step that runs `vitest run --coverage` and uploads the report.
