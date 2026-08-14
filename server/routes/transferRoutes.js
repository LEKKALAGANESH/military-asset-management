import { Router } from 'express';
import { createTransfer, getTransfer, listTransfers } from '../controllers/transferController.js';
import { authorizeRoles, enforceBaseScope, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

router.get('/', enforceBaseScope, asyncHandler(listTransfers));
router.get('/:id', enforceBaseScope, asyncHandler(getTransfer));

// A Commander sees every transfer touching their base but cannot initiate one.
router.post('/', authorizeRoles(ROLES.ADMIN, ROLES.LOGISTICS_OFFICER), asyncHandler(createTransfer));

export default router;
