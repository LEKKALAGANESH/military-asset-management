import { Router } from 'express';
import { listAuditActions, listAuditLogs } from '../controllers/auditController.js';
import { authorizeRoles, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

// The trail records every role, Commanders included, so only an Admin may read it.
router.use(authorizeRoles(ROLES.ADMIN));

router.get('/', asyncHandler(listAuditLogs));
router.get('/actions', asyncHandler(listAuditActions));

export default router;
