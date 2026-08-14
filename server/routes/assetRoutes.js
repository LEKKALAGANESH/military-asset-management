import { Router } from 'express';
import {
  getBalancesByEquipment,
  getCurrentStock,
  getDashboardMetrics,
  getMovements,
} from '../controllers/assetController.js';
import { enforceBaseScope } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

// All three roles read the dashboard; only an Admin's scope resolves to all bases.
router.use(enforceBaseScope);

router.get('/metrics', asyncHandler(getDashboardMetrics));
router.get('/balances', asyncHandler(getBalancesByEquipment));
router.get('/movements', asyncHandler(getMovements));
router.get('/stock', asyncHandler(getCurrentStock));

export default router;
