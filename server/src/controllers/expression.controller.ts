import type { Request, Response } from 'express';
import { getValidated } from '../middleware/validate.js';
import type { OwnerId } from '../repositories/expression.repository.js';
import {
  createExpressionSchema,
  listExpressionsQuerySchema,
  objectIdParamSchema,
  statsQuerySchema,
  trendsQuerySchema,
} from '../schemas/expression.schema.js';
import { expressionService } from '../services/expression.service.js';
import { sendPaginated, sendSuccess } from '../utils/apiResponse.js';

/** Ownership comes only from the verified session — never from client input. */
const ownerOf = (req: Request): OwnerId => req.user?.id ?? null;

/** Thin HTTP adapters: read validated input → call the service → send the response. */
export const expressionController = {
  async create(req: Request, res: Response) {
    const body = getValidated(res, 'body', createExpressionSchema);
    const detection = await expressionService.record(ownerOf(req), body);
    sendSuccess(res, detection, 201);
  },

  async list(req: Request, res: Response) {
    const query = getValidated(res, 'query', listExpressionsQuerySchema);
    const { items, pagination } = await expressionService.list(ownerOf(req), query);
    sendPaginated(res, items, pagination);
  },

  async stats(req: Request, res: Response) {
    const query = getValidated(res, 'query', statsQuerySchema);
    sendSuccess(res, await expressionService.stats(ownerOf(req), query));
  },

  async trends(req: Request, res: Response) {
    const query = getValidated(res, 'query', trendsQuerySchema);
    sendSuccess(res, await expressionService.trends(ownerOf(req), query));
  },

  async getById(req: Request, res: Response) {
    const { id } = getValidated(res, 'params', objectIdParamSchema);
    sendSuccess(res, await expressionService.getById(ownerOf(req), id));
  },

  async remove(req: Request, res: Response) {
    const { id } = getValidated(res, 'params', objectIdParamSchema);
    await expressionService.remove(ownerOf(req), id);
    sendSuccess(res, { id });
  },
};
