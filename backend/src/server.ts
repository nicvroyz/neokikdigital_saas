import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { validateConfig } from './config/configValidator';
import authRoutes from './routes/authRoutes';
import clientRoutes from './routes/clientRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import hostingRoutes from './routes/hostingRoutes';

// Operations Module Routes
import projectRoutes from './routes/projectRoutes';
import taskRoutes from './routes/taskRoutes';
import workLogRoutes from './routes/workLogRoutes';

// Communications Module Routes
import communicationsRoutes from './routes/communicationsRoutes';

// Infrastructure & Migration Engine Routes
import infrastructureRoutes from './routes/infrastructureRoutes';
import healthRoutes from './routes/healthRoutes';

import { cronService } from './services/cronService';
import { whatsappService } from './services/whatsappService';
import { queueService } from './services/queueService';
import { schedulerService } from './services/schedulerService';
import { workerProcessor } from './services/workerProcessor';
import { rateLimiter } from './middleware/rateLimiter';

// Validate configuration environment variables before server initialization
validateConfig();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Apply Rate Limiters on sensitive routes
app.use('/api/auth/login', rateLimiter(5, 60 * 1000)); // Max 5 logins per minute
app.use('/api/infrastructure/migrations/upload', rateLimiter(3, 60 * 1000)); // Max 3 uploads per minute
app.use('/api/infrastructure/migrations/:id/execute', rateLimiter(3, 60 * 1000)); // Max 3 executions per minute

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/hosting', hostingRoutes);

// Operations Module API Endpoints
app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/work-logs', workLogRoutes);

// Communications Module API Endpoints
app.use('/api/communications', communicationsRoutes);

// Health check endpoint (public simplified status)
app.use('/api', healthRoutes);

// Infrastructure & Migration Engine API Endpoints
app.use('/api/infrastructure', infrastructureRoutes);

// Initialize background services
cronService.init();
whatsappService.initializeSession();
workerProcessor.start();
schedulerService.init();

// Server listener
app.listen(config.port, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Neokik Digital SaaS Backend + Infrastructure Engine running on port ${config.port}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);
});
