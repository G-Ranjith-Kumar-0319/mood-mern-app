# TypeScript — learning guide for this project

Both the client and the server are TypeScript 6.0 in **strict** mode. This guide
lists the language features the project relies on, and why.

> Why TypeScript here: the client and server exchange JSON with a precise shape
> (`ExpressionDetectionDto`, `TrendPoint`…), the UI has 10 states, and the model
> has exactly 7 classes. Types turn "I hope this matches" into compile errors.

---

## 1. Compiler settings that matter

Set in `client/tsconfig.app.json` and `server/tsconfig.json`:

| Option                                    | Effect                                                        | Example of a bug it catches                                                |
| ----------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `strict`                                  | null checks, no implicit `any`, …                             | calling `.stop()` on a `stream` that may be `null`                         |
| `noUncheckedIndexedAccess`                | `array[i]` is `T \| undefined`                                | `results[0].expression` when the array is empty                            |
| `noUnusedLocals` / `noUnusedParameters`   | dead code is an error                                         | forgotten imports; `_req` marks an intentionally unused parameter          |
| `verbatimModuleSyntax`                    | type-only imports must say `import type`                      | ensures types are erased and never bundled                                 |
| `erasableSyntaxOnly` (client)             | forbids TS-only runtime syntax (`enum`, parameter properties) | a test used `constructor(readonly url)`, which had to become a plain field |
| `module: nodenext` (server)               | real Node ESM rules                                           | relative imports need `.js` extensions (`'./app.js'`)                      |
| `moduleResolution: bundler` (client, e2e) | Vite/Playwright resolve imports                               | no extensions needed                                                       |

**Why TypeScript is pinned to 6.0:** `typescript-eslint` does not support 7.x yet.
Tools must agree on versions, so check peer dependencies before upgrading.

---

## 2. Describing data

### `interface` vs `type`

- `interface` for object shapes that are "things": `FaceBox`, `UserDto`, props.
- `type` for unions, aliases and computed types: `CameraStatus`, `Expression`,
  `DetectorViewState`.

### Literal unions: `'off' | 'requesting' | 'active' | 'error'`

These are used instead of `enum`s (and are required by `erasableSyntaxOnly`). They
exist only at compile time, cost nothing at runtime, and autocomplete in the editor.

### Discriminated unions: the UI state machine

```ts
// client/src/utils/detectorViewState.ts
export type DetectorViewState =
  | { kind: 'idle' }
  | { kind: 'camera-error'; error: AppError }
  | { kind: 'detected'; expression: SmoothedExpression }
  | …;
```

Inside `switch (state.kind)`, TypeScript _narrows_ `state`: only in the
`'detected'` case does `state.expression` exist.
[ExpressionResult](../../client/src/components/ExpressionResult/ExpressionResult.tsx)
must handle every `kind`, or the function has a missing return.

### `as const` and types derived from values

```ts
export const SUPPORTED_EXPRESSIONS = ['neutral', 'happy', …] as const;
export type Expression = (typeof SUPPORTED_EXPRESSIONS)[number];  // 'neutral' | 'happy' | …
```

One source of truth: the list drives both runtime validation (Zod `z.enum`) and
the compile-time type. The same trick gives `TrendUnit`, `RETENTION_OPTIONS` and
`AUTH_TOKEN_TYPES`.

### `Record<K, V>`

A map where every key must be present: `Record<Expression, string>` for
`EXPRESSION_EMOJI`. Adding an 8th expression without an emoji is a compile error.

---

## 3. Utility types used

| Type                      | Meaning                           | Where                                                                          |
| ------------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `Partial<T>`              | all properties optional           | `update(changes: Partial<DetectorSettings>)`                                   |
| `Pick<T, K>`              | keep some properties              | `DetectionSettings = Pick<DetectorSettings, 'inputSize' \| …>`                 |
| `Omit<T, K>`              | drop some properties              | `findAfter(query: Omit<DetectionQuery, 'skip'> …)`                             |
| `ReturnType<F>`           | a function's return type          | `ReturnType<typeof setTimeout>` (the timer type differs in browser and Node)   |
| `Parameters<F>`           | a function's parameter types      | `Parameters<typeof faceapi.env.setEnv>[0]` (face-api doesn't export that type) |
| `InferSchemaType`         | Mongoose's inferred document type | `User`, `ExpressionDetection`                                                  |
| `z.output<typeof schema>` | the type a Zod schema produces    | `CreateExpressionInput`, `TrendsQuery`                                         |

---

## 4. Narrowing and type guards

- **`typeof` / `instanceof` / `in` checks** narrow `unknown` values, e.g. in
  [errorHandler.ts](../../server/src/middleware/errorHandler.ts):
  `error instanceof mongoose.Error.CastError`.
- **User-defined type guards** (`value is X`):

  ```ts
  export function isSupportedExpression(value: string): value is Expression { … }
  ```

  Used in `expressionDisplay.ts`, `apiClient.ts` (`isErrorBody`), `DashboardPage`
  (`isRangeKey`) and `useDetectorSettings`.

- **`unknown` over `any`**: ESLint forbids `any`. `catch (error: unknown)` then
  narrow. JSON parsed from storage is `unknown` until validated (`readSettings`).
- **Non-null assertion `!`**: only where a runtime check already guarantees a
  value, mainly in tests (`rows[1]!`). Prefer real checks in app code.

---

## 5. Generics

- `apiRequest<T>(path): Promise<ApiSuccess<T>>`. The caller states what `data` contains.
- `getValidated<S extends ZodType>(res, part, schema): z.output<S>` ties the
  controller's type to the exact schema that validated the input.
- `sendPaginated<T>(res, data: T[], …)`.
- Mongoose `.lean<ExpressionDetection[]>()` declares the plain-object result type.

## 6. `satisfies`

```ts
const baseOptions = { standardHeaders: 'draft-8', … } satisfies Partial<Options>;
```

This checks the object against a type **without widening** it, so literal types
like `'draft-8'` are kept. It's used in [rateLimit.ts](../../server/src/middleware/rateLimit.ts)
and in tests.

## 7. Declaration merging

[server/src/types/express.d.ts](../../server/src/types/express.d.ts) adds a
`user` property to Express's `Request` type:

```ts
declare global {
  namespace Express {
    interface Request {
      user?: { id: Types.ObjectId };
    }
  }
}
```

After this, `req.user` is typed everywhere in the server.

## 8. Types across a boundary (client ↔ worker ↔ server)

- [detectorProtocol.ts](../../client/src/services/detectorProtocol.ts) types every
  message between the page and the Web Worker as a discriminated union
  (`{ type: 'result'; id; analysis }`). A mismatch breaks the build, not the
  running app.
- Client DTO types (`client/src/types/api.ts`) mirror the server's DTOs. The
  expression list is duplicated on purpose, with "keep in sync" comments (see ADR 0001).

## 9. `import type`

`import type { Expression } from …` is erased at build time. This is essential in
[faceApiAnalysis.ts](../../client/src/services/faceApiAnalysis.ts):
`import type * as FaceApiModule from '@vladmandic/face-api'` gives the types of the
1.3 MB library **without** bundling it into the main chunk. The library itself is
loaded later with a dynamic `import()` in
[expressionDetector.ts](../../client/src/services/expressionDetector.ts).

## Exercises

1. Add `'contempt'` to `SUPPORTED_EXPRESSIONS` on the client and run `npm run typecheck`.
   Follow the errors: they point to every place that needs an update.
2. Change `DetectorViewState` to add `{ kind: 'paused' }` and see what
   `ExpressionResult` reports.
3. Replace a `value is X` guard with a plain `boolean` return type. What stops compiling?
