import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import authRouter from './routes/auth';
import schemaRouter from './routes/schema';
import rentabilidadRouter from './routes/rentabilidad';
import estimadaRouter from './routes/rentabilidad-estimada';
import controladorRouter from './routes/controlador';
import dashboardRouter from './routes/dashboard';
import dbToggleRouter from './routes/db-toggle';
import diasNoLaboralesRouter from './routes/dias-no-laborales';
import monthlyConfigRouter from './routes/monthly-config';
import savedReportsRouter from './routes/saved-reports';
import inteligenciaPacientesRouter from './routes/inteligencia-pacientes';
import inteligenciaUsersRouter from './routes/inteligencia-users';
import { testConnection } from './config/database';
import { initAppDatabase } from './config/app-database';
import { initInteligenciaDatabase } from './config/ip-database';
import { startDailyReportsJob } from './jobs/daily-reports';
import { requireAuth, requireInteligenciaAdmin } from './middleware/auth';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ─── Public routes (no auth required) ───
app.get('/', (_req, res) => {
  res.json({ message: 'TuPiel Reporting API', version: '1.0.0' });
});

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);

// ─── Protected routes (auth required) ───
app.use('/api/schema', requireAuth, schemaRouter);
app.use('/api/reports/rentabilidad', requireAuth, rentabilidadRouter);
app.use('/api/reports/rentabilidad-estimada', requireAuth, estimadaRouter);
app.use('/api/reports/controlador', requireAuth, controladorRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/db-toggle', requireAuth, dbToggleRouter);
app.use('/api/dias-no-laborales', requireAuth, diasNoLaboralesRouter);
app.use('/api/monthly-config', requireAuth, monthlyConfigRouter);
app.use('/api/saved-reports', requireAuth, savedReportsRouter);
app.use(
  '/api/inteligencia-pacientes/users',
  requireAuth,
  requireInteligenciaAdmin,
  inteligenciaUsersRouter
);
app.use('/api/inteligencia-pacientes', requireAuth, inteligenciaPacientesRouter);

// Start server
async function start() {
  // Test production database connection (read-only, used for all reports)
  const dbOk = await testConnection();
  if (!dbOk) {
    console.warn('⚠️  WARNING: Production database connection failed. Server starting anyway.');
    console.warn('   Reports will fail until the database connection is restored.');
  } else {
    console.log('✅ Connected to PRODUCTION database (read-only)');
  }
  
  // Initialize app database (local read-write, for application data)
  // This creates tables for: dias_no_laborales, monthly_configs, saved_reports, etc.
  // Errors are logged but don't prevent server startup
  await initAppDatabase();

  // Inteligencia CRM — separate MySQL database (`tupiel_inteligencia` by default)
  await initInteligenciaDatabase();

  // Start daily reports job (runs at 11pm)
  startDailyReportsJob();

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(`Health check: http://0.0.0.0:${PORT}/api/health`);
    console.log(`Schema endpoint: http://0.0.0.0:${PORT}/api/schema`);
  });
}

start().catch((err) => {
  console.error('Fatal: server startup failed:', err);
  process.exit(1);
});
