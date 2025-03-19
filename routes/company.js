const express = require('express');
const router = express.Router();
const passport = require('passport');
const Company = require('../models/Company');
const User = require('../models/User');

router.use(passport.authenticate('jwt', { session: false }));

// Create Company
router.post('/', async (req, res) => {
  const { name } = req.body;
  try {
    if (await Company.findOne({ name })) return res.status(400).json({ message: 'Company name taken' });
    const company = new Company({ name, users: [{ user: req.user._id, role: 'Admin' }] });
    await company.save();
    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get Companies (for user)
router.get('/', async (req, res) => {
  const companies = await Company.find({ 'users.user': req.user._id, isActive: true });
  res.json(companies);
});

// Invite User
router.post('/:id/invite', async (req, res) => {
  const { email } = req.body;
  const company = await Company.findById(req.params.id);
  if (!company || !company.users.some(u => u.user.equals(req.user._id) && u.role === 'Admin')) {
    return res.status(403).json({ message: 'Unauthorized' });
  }
  const user = await User.findOne({ email });
  if (!user) return res.status(404).json({ message: 'User not found' });
  company.users.push({ user: user._id, role: 'User' });
  await company.save();
  // TODO: Send email invite (simplified for now)
  res.json({ message: 'User invited' });
});

module.exports = router;