import { Router } from 'express';
import {
  createAssignment,
  createExpenditure,
  listAssignments,
  listExpenditures,
} from '../controllers/assignmentController.js';
import { authorizeRoles, enforceBaseScope, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

// Issuing kit and writing off stock are command decisions, not logistics ones.
const commandRoles = [ROLES.ADMIN, ROLES.BASE_COMMANDER];

export const assignmentRouter = Router();
assignmentRouter.get('/', enforceBaseScope, asyncHandler(listAssignments));
assignmentRouter.post('/', authorizeRoles(...commandRoles), asyncHandler(createAssignment));

export const expenditureRouter = Router();
expenditureRouter.get('/', enforceBaseScope, asyncHandler(listExpenditures));
expenditureRouter.post('/', authorizeRoles(...commandRoles), asyncHandler(createExpenditure));
