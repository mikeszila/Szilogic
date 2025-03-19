const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const bcryptjs = require('bcryptjs');
const User = require('../models/User');

const transporter = nodemailer.createTransport({
  service: 'Fastmail',
  auth: { user: process.env.FASTMAIL_USER, pass: process.env.FASTMAIL_PASS }
});

// Register
router.post('/register', async (req, res) => {
  const { firstName, lastName, email, username, password } = req.body;
  try {
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) return res.status(400).json({ message: 'Email or username already exists' });

    user = new User({ firstName, lastName, email, username, password });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
    const url = `http://localhost:3000/verify/${token}`;
    await transporter.sendMail({
      to: email,
      subject: 'Verify Your Szilogic Account',
      html: `Click <a href="${url}">here</a> to verify your email.`
    });

    res.status(201).json({ message: 'User registered, check email to verify' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Verify Email
router.get('/verify/:token', async (req, res) => {
  try {
    const { id } = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const user = await User.findOne({ _id: id });
    if (!user) return res.status(400).json({ message: 'Invalid token' });
    user.verified = true;
    await user.save();
    res.redirect('/login.html');
  } catch (err) {
    res.status(400).json({ message: 'Invalid or expired token' });
  }
});

// Login
router.post('/login', (req, res, next) => {
  console.log('Login attempt:', req.body);
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) return res.status(500).json({ message: err.message });
    if (!user) return res.status(401).json({ message: info.message || 'Login failed' });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '30m' });
    res.setHeader('Content-Type', 'application/json'); // Explicitly set header
    res.json({ token, user: { id: user._id, username: user.username, role: user.role } });
  })(req, res, next);
});

// Get Current User
router.get('/me', passport.authenticate('jwt', { session: false }), (req, res) => {
  console.log('Fetching /me for user:', req.user);
  res.setHeader('Content-Type', 'application/json'); // Explicitly set header
  res.json({ id: req.user._id, username: req.user.username, role: req.user.role });
});

// Test Password
router.post('/test-password', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });
  const isMatch = await bcryptjs.compare(password, user.password);
  res.setHeader('Content-Type', 'application/json'); // Explicitly set header
  res.json({ email, isMatch });
});

module.exports = router;