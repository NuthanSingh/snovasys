import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAuthRateLimiter } from './middleware/auth-rate-limit.js';
import { createAdminRouter } from './routes/admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createOnboardingRouter } from './routes/onboarding.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createUsersRouter } from './routes/users.js';
import { createAccountsRouter } from './routes/accounts.js';
import { createHealthRouter } from './routes/health.js';

export function createApp({
	prisma = null,
	redisClient = null,
	configuration = env,
	authRateLimiter,
	passwordHasher,
	serveWeb = process.env.SERVE_WEB === 'true',
} = {}) {
	const app = express();
	const rateLimiter = authRateLimiter ?? createAuthRateLimiter(redisClient, {
		windowMs: configuration.rateLimitWindowMs,
		max: configuration.rateLimitMax,
	});

	app.disable('x-powered-by');
	app.use(helmet());
	app.use(cors({ origin: configuration.webOrigin, credentials: true }));
	app.use(express.json({ limit: '10kb' }));
	app.use(cookieParser());
	app.use(createHealthRouter({ prisma, redisClient }));
	app.use('/api/auth', createAuthRouter({
		prisma,
		redisClient,
		configuration,
		rateLimiter,
		passwordHasher,
	}));
	app.use('/api/onboarding', createOnboardingRouter({ prisma, redisClient, configuration }));
	app.use('/api/dashboard', createDashboardRouter({ prisma, redisClient, configuration }));
	app.use('/api/users', createUsersRouter({ prisma, redisClient, configuration }));
	app.use('/api/accounts', createAccountsRouter({ prisma, redisClient, configuration }));
	app.use('/api/admin', createAdminRouter({ prisma, redisClient, configuration }));

	// Single-service deployment: serve the built React app from the same origin as the API,
	// so the HttpOnly session cookie stays first-party. Enabled only with SERVE_WEB=true.
	const webDist = fileURLToPath(new URL('../../web/dist/', import.meta.url));
	if (serveWeb && existsSync(webDist)) {
		app.use(express.static(webDist, { index: false }));
		app.get(/^(?!\/api(?:\/|$)).*/, (_request, response) => {
			response.sendFile('index.html', { root: webDist });
		});
	}
	app.use(notFoundHandler);
	app.use(errorHandler);

	return app;
}

const app = createApp();

export default app;