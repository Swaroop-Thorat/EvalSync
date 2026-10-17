const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@evalsync.in').toLowerCase().trim();
  const password = process.env.ADMIN_INITIAL_PASSWORD || 'evalsync@admin';

  let adminUser = await User.findOne({ email });
  if (!adminUser) {
    const hashedPassword = await bcrypt.hash(password, 10);
    adminUser = await User.create({
      name: 'System Administrator',
      email,
      password: hashedPassword,
      role: 'admin'
    });
  }

  await User.deleteOne({ email: 'admin@college.edu' });

  return adminUser;
}

if (require.main === module) {
  require('dotenv').config();
  const connectDB = require('../config/db');
  (async () => {
    try {
      await connectDB();
      await seedAdmin();
      process.exit(0);
    } catch (err) {
      process.exit(1);
    }
  })();
}

module.exports = seedAdmin;
