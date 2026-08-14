import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { listUsers, login, me, register } from '../controllers/authController.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { authorizeRoles, ROLES } from '../middlewares/rbacMiddleware.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

// The brute-force target, so tighter than the global limiter. Successes don't count.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT ?? 10),
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});

router.post('/login', authLimiter, asyncHandler(login));
router.get('/me', authenticateToken, asyncHandler(me));

// Admin action, not open self-service registration.
router.post('/register', authLimiter, authenticateToken, authorizeRoles(ROLES.ADMIN), asyncHandler(register));
router.get('/users', authenticateToken, authorizeRoles(ROLES.ADMIN), asyncHandler(listUsers));

export default router;
