import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { liveness, readiness, version } from './health.controller';

/**
 * Health/version routes are mounted at the app root (NOT under the API
 * prefix) so load balancers and container healthchecks have stable paths.
 */
export const healthRouter = Router();

healthRouter.get('/health', liveness);
healthRouter.get('/ready', asyncHandler(readiness));
healthRouter.get('/version', version);
