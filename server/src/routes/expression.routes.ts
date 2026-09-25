import { Router } from 'express';
import { streamEvents } from '../controllers/events.controller.js';
import { expressionController } from '../controllers/expression.controller.js';
import { validate } from '../middleware/validate.js';
import {
  createExpressionSchema,
  listExpressionsQuerySchema,
  objectIdParamSchema,
  statsQuerySchema,
  trendsQuerySchema,
} from '../schemas/expression.schema.js';

// Express 5 forwards rejected promises from async handlers to the error middleware automatically.
export const expressionRouter = Router();

expressionRouter.post('/', validate({ body: createExpressionSchema }), expressionController.create);
expressionRouter.get(
  '/',
  validate({ query: listExpressionsQuerySchema }),
  expressionController.list,
);
// Live updates (Server-Sent Events). Declared before '/:id' like the other fixed paths.
expressionRouter.get('/events', streamEvents);
// Declared before '/:id' so "stats" is not treated as an id.
expressionRouter.get('/stats', validate({ query: statsQuerySchema }), expressionController.stats);
expressionRouter.get(
  '/trends',
  validate({ query: trendsQuerySchema }),
  expressionController.trends,
);
expressionRouter.get(
  '/:id',
  validate({ params: objectIdParamSchema }),
  expressionController.getById,
);
expressionRouter.delete(
  '/:id',
  validate({ params: objectIdParamSchema }),
  expressionController.remove,
);
