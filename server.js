require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const passport = require('passport');
const path = require('path');
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/company');
const projectRoutes = require('./routes/project');
require('./config/passport');

const app = express();

// Middleware
app.use(express.json());
app.use(passport.initialize());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/project', projectRoutes);

// Catch unhandled API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ message: 'API endpoint not found' });
});

// Static Files (only for non-API routes)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  express.static(path.join(__dirname, 'public'))(req, res, next);
});

// Catch-all for frontend (only for non-API routes)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));