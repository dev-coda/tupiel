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
import { testConnection } from './config/database';

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

// Start server
async function start() {
  const dbOk = await testConnection();
  if (!dbOk) {
    console.warn('WARNING: Database connection failed. Server starting anyway.');
  }

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Schema endpoint: http://localhost:${PORT}/api/schema`);
  });
}

start();
