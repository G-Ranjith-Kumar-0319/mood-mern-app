# Zod — learning guide for this project

Zod 4 validates **everything that comes from outside the process**: request
bodies, query strings, route params, and environment variables. A schema both
_checks_ input and _converts_ it (strings → numbers/dates), and its TypeScript
type is inferred, so validation and types can't drift apart.

Schemas: [server/src/schemas/](../../server/src/schemas/) · environment:
[server/src/config/env.ts](../../server/src/config/env.ts) · middleware:
[middleware/validate.ts](../../server/src/middleware/validate.ts)

---

## Building blocks used

| API                                                        | Example in this project                                                                              |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `z.strictObject({...})`                                    | Every request schema. **Unknown keys are rejected**, so a client can't sneak in `userId` or `image`. |
| `z.string().min().max().regex()`                           | passwords, token format `^[\w-]{20,100}$`, ObjectId format                                           |
| `z.email()` / `z.url()`                                    | email addresses; `APP_URL`                                                                           |
| `z.number().min(0).max(1)`                                 | confidence                                                                                           |
| `z.coerce.number().int()`                                  | query strings (`?page=2` arrives as the string `"2"`) and env vars                                   |
| `z.enum(SUPPORTED_EXPRESSIONS)`                            | only the 7 model classes                                                                             |
| `z.literal([7, 30, 90, 365])` + `z.union([..., z.null()])` | retention options                                                                                    |
| `z.iso.datetime({ offset: true })`                         | ISO timestamps with a time zone                                                                      |
| `.optional()` / `.default(x)`                              | optional fields, defaults (`page` = 1)                                                               |
| `.transform(fn)`                                           | ISO string → `Date`; opaque cursor → `{ detectedAt, id }`                                            |
| `ctx.addIssue(...)` + `z.NEVER`                            | report a custom error from inside a transform (invalid cursor)                                       |
| `.refine(fn, { message, path })`                           | cross-field rules: `from ≤ to`; not `page` _and_ `cursor`; new password ≠ current                    |
| `.superRefine((env, ctx) => …)`                            | several production-only checks at once (secrets present, long, distinct)                             |
| `z.preprocess(emptyToUndefined, …)`                        | treat `MONGO_URI=` (empty) as "not set"                                                              |
| `schema.safeParse(value)`                                  | returns `{ success, data \| error }` instead of throwing                                             |
| `error.issues`                                             | turned into the API's `details: [{ path, message }]`                                                 |
| `z.output<typeof schema>`                                  | the type _after_ transforms (e.g. `Date`, not string)                                                |

## How validation flows through a request

```ts
router.get('/', validate({ query: listExpressionsQuerySchema }), controller.list);
// controller
const query = getValidated(res, 'query', listExpressionsQuerySchema); // fully typed
```

`validate()` stores parsed values in `res.locals.validated` (Express 5 makes
`req.query` read-only). `getValidated()` reads them back with the exact type of the
schema that validated them.

## Validating configuration

`env.ts` parses `process.env` once at startup. In production it _refuses to start_
with a missing `MONGO_URI`, placeholder secrets, secrets under 32 characters, or
identical access/refresh secrets. It's better to crash at deploy time than to run insecurely.

## Examples of rules worth studying

- **bcrypt's 72-byte limit** ([auth.schema.ts](../../server/src/schemas/auth.schema.ts)):
  `.refine((v) => new TextEncoder().encode(v).length <= 72)` counts _bytes_, not
  characters (é is 2 bytes). Longer passwords are rejected instead of silently truncated.
- **Future timestamps:** `detectedAt` may be at most 5 minutes ahead (clock skew).
- **Time zones:** `.refine(isValidTimeZone)` uses `Intl` to accept only real IANA zones.

## Exercises

1. Send `POST /api/v1/expressions` with `{ "expression": "happy", "confidence": "0.9" }`
   (a string). Why is it rejected while `?page="2"` is accepted?
2. Add an optional `note` (max 200 chars) to detections, from schema to model to DTO.
