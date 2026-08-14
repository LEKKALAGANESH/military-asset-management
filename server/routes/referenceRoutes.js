import { Router } from 'express';
import {
  createBase,
  createEquipmentType,
  getMetadata,
  listBases,
  listEquipmentTypes,
} from '../controllers/referenceController.js';
import { authorizeRoles, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

export const baseRouter = Router();
baseRouter.get('/', asyncHandler(listBases));
baseRouter.post('/', authorizeRoles(ROLES.ADMIN), asyncHandler(createBase));

export const equipmentRouter = Router();
equipmentRouter.get('/', asyncHandler(listEquipmentTypes));
equipmentRouter.post('/', authorizeRoles(ROLES.ADMIN), asyncHandler(createEquipmentType));

export const metaRouter = Router();
metaRouter.get('/', asyncHandler(getMetadata));
