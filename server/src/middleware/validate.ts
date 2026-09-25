import type { NextFunction, Request, Response } from 'express';
import type { z, ZodType } from 'zod';
import { AppError } from '../utils/AppError.js';

type RequestPart = 'body' | 'query' | 'params';
type RequestSchemas = Partial<Record<RequestPart, ZodType>>;

function toDetails(error: z.ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Validates and parses request input before the controller runs.
 *
 * Parsed values (with defaults applied and strings coerced to numbers/dates)
 * are stored in `res.locals.validated`, because Express 5 makes `req.query`
 * read-only. Controllers read them with `getValidated()`.
 */
export function validate(schemas: RequestSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    const validated: Partial<Record<RequestPart, unknown>> = {};

    for (const part of Object.keys(schemas) as RequestPart[]) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        const [first] = result.error.issues;
        const summary = first
          ? `${first.path.join('.') || part}: ${first.message}`
          : 'Invalid input';
        return next(
          AppError.validation(`Invalid request ${part} (${summary})`, toDetails(result.error)),
        );
      }
      validated[part] = result.data;
    }

    res.locals.validated = validated;
    next();
  };
}

/** Typed access to input already parsed by `validate()` with the same schema. */
export function getValidated<S extends ZodType>(
  res: Response,
  part: RequestPart,
  _schema: S,
): z.output<S> {
  const validated = res.locals.validated as Partial<Record<RequestPart, unknown>> | undefined;
  if (!validated || !(part in validated)) {
    throw new Error(`Route is missing validate({ ${part} }) middleware`);
  }
  return validated[part] as z.output<S>;
}
