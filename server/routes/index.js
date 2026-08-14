import { Router } from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';
import assetRoutes from './assetRoutes.js';
import auditRoutes from './auditRoutes.js';
import authRoutes from './authRoutes.js';
import { assignmentRouter, expenditureRouter } from './assignmentRoutes.js';
import purchaseRoutes from './purchaseRoutes.js';
import { baseRouter, equipmentRouter, metaRouter } from './referenceRoutes.js';
import transferRoutes from './transferRoutes.js';

const router = Router();

/**
 * Readiness, not just liveness. `SELECT 1` succeeds against a completely empty database, so
 * a health check built on it reports "connected" while every real endpoint 500s — which is
 * exactly the state a deploy lands in before the schema is applied.
 */
router.get('/health', asyncHandler(async (_req, res) => {
  const { rows } = await query(
    `SELECT to_regclass('public.users')        IS NOT NULL AS has_users,
            to_regclass('public.asset_ledger') IS NOT NULL AS has_ledger`,
  );
  const ready = rows[0].has_users && rows[0].has_ledger;

  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'not_ready',
    database: 'connected',
    schema: ready ? 'ready' : 'missing — run the schema and seed scripts against DATABASE_URL',
    timestamp: new Date().toISOString(),
  });
}));

router.use('/auth', authRoutes);

// Mounted once, so a new router can never be added without authentication by accident.
router.use(authenticateToken);

router.use('/assets', assetRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/transfers', transferRoutes);
router.use('/assignments', assignmentRouter);
router.use('/expenditures', expenditureRouter);
router.use('/bases', baseRouter);
router.use('/equipment-types', equipmentRouter);
router.use('/meta', metaRouter);
router.use('/audit-logs', auditRoutes);

export default router;
