import { Router } from 'express';
import { createPurchase, listPurchases } from '../controllers/purchaseController.js';
import { authorizeRoles, enforceBaseScope, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

router.get('/', enforceBaseScope, asyncHandler(listPurchases));

// Logistics owns procurement; a Commander may buy for their own base (assertBaseAccess).
router.post(
  '/',
  authorizeRoles(ROLES.ADMIN, ROLES.LOGISTICS_OFFICER, ROLES.BASE_COMMANDER),
  asyncHandler(createPurchase),
);

export default router;
