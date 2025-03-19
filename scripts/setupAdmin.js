require('dotenv').config(); // Load environment variables from .env
const mongoose = require('mongoose');
const User = require('../models/User');

async function setupAdmin() {
  // Verify MONGO_URI is loaded
  if (!process.env.MONGO_URI) {
    throw new Error('MONGO_URI is not defined in .env file');
  }

  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const user = new User({
    firstName: 'Michael',
    lastName: 'Szilagyi',
    email: 'michael@honestcontrols.com',
    username: 'mikeszila',
    password: 'hchello1!',
    role: 'Super Admin',
    verified: true
  });
  await user.save();
  console.log('Super Admin created');
  process.exit();
}

setupAdmin().catch(err => {
  console.error(err);
  process.exit(1);
});