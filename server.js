require('dotenv').config();

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const morgan   = require('morgan');

const connectDB          = require('./config/db');
const { registerCronJobs } = require('./utils/cronJobs');

const schoolsRouter   = require('./routes/schools');
const studentsRouter  = require('./routes/students');
const dashboardRouter = require('./routes/dashboard');

// ── Connect DB ────────────────────────────────────────────────────────────
connectDB();

// ── App setup ─────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ── Routes ────────────────────────────────────────────────────────────────
app.use('/api/schools',   schoolsRouter);
app.use('/api/students',  studentsRouter);
app.use('/api/dashboard', dashboardRouter);

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'School Van Fee Tracker', time: new Date() });
});

// ── 404 handler ───────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Global error handler ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
});

// ── Register cron jobs ────────────────────────────────────────────────────
registerCronJobs();

// ── Start server ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Fee Tracker API running on port ${PORT}`);
  console.log(` http://localhost:${PORT}`);
});
