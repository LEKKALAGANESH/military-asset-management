import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';
import { requestLogger } from './middlewares/loggerMiddleware.js';
import apiRoutes from './routes/index.js';

/**
 * Exported, not started. An Express app is already a `(req, res)` function, the signature
 * Vercel's Node runtime invokes. Nothing here holds process state: an instance can be frozen
 * or discarded between any two requests, so whatever outlives one is either stateless or
 * pinned to `globalThis` (config/db.js).
 */
const app = express();

// Without this the rate limiter sees one client IP for the whole internet. `1`, not `true`,
// so a spoofed X-Forwarded-For chain cannot be used to evade it.
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

/**
 * Deployed, the SPA and API share one origin, so the browser sends no Origin header and CORS
 * never engages. The allowlist stays for the split-deployment case, empty by default.
 */
app.use(cors({
  origin(origin, callback) {
    // No Origin = same-origin or a non-browser client (curl, Postman).
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`Origin ${origin} is not allowed by CORS policy.`));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// A 100 KB ceiling: no endpoint in this API accepts anything close to that.
app.use(express.json({ limit: '100kb' }));
app.use(requestLogger);

/**
 * The counter lives in one instance's memory, so traffic spread across instances gets
 * `limit x instances`. It still throttles an attacker hitting a warm instance, which is why
 * it stays — but the real control here is Vercel's Firewall, configured on the project.
 */
app.use(rateLimit({
  windowMs: 60 * 1000,
  limit: env.rateLimit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
}));

app.use('/api', apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
