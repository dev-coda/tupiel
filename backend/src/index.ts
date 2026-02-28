import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health';
import schemaRouter from './routes/schema';
import rentabilidadRouter from './routes/rentabilidad';
import estimadaRouter from './routes/rentabilidad-estimada';
import controladorRouter from './routes/controlador';
import dashboardRouter from './routes/dashboard';
import dbToggleRouter from './routes/db-toggle';
import diasNoLaboralesRouter from './routes/dias-no-laborales';
import { testConnection } from './config/database';
import { initAppDatabase } from './config/app-database';

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

// Routes
app.get('/', (_req, res) => {
  res.json({ message: 'TuPiel Reporting API', version: '1.0.0' });
});

app.use('/api/health', healthRouter);
app.use('/api/schema', schemaRouter);
app.use('/api/reports/rentabilidad', rentabilidadRouter);
app.use('/api/reports/rentabilidad-estimada', estimadaRouter);
app.use('/api/reports/controlador', controladorRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/db-toggle', dbToggleRouter);
app.use('/api/dias-no-laborales', diasNoLaboralesRouter);

// Start server
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.warn('WARNING: Database connection failed. Server starting anyway.');
  }
  
  // Initialize app database (for local CRUD operations)
  try {
    await initAppDatabase();
  } catch (err) {
    console.warn('WARNING: App database initialization failed:', err);
    console.warn('CRUD features may not work. Make sure local MySQL is running.');
  }

      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://0.0.0.0:${PORT}`);
        console.log(`Health check: http://0.0.0.0:${PORT}/api/health`);
        console.log(`Schema endpoint: http://0.0.0.0:${PORT}/api/schema`);
      });
}

start();
