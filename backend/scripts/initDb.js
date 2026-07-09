const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'neokik_admin',
  password: process.env.DB_PASSWORD || 'StrongPassword123!',
  database: process.env.DB_NAME || 'neokik_saas',
});

async function init() {
  try {
    console.log('⚡ Initializing Neokik Digital Database...');
    const schemaSql = fs.readFileSync(path.join(__dirname, '../src/db/schema.sql'), 'utf-8');
    const seedSql = fs.readFileSync(path.join(__dirname, '../src/db/seed.sql'), 'utf-8');

    await pool.query(schemaSql);
    console.log('✅ Schema created successfully.');

    await pool.query(seedSql);
    console.log('✅ Seed data inserted successfully.');

    // Securely seed the initial admin account
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@neokikdigital.com';
    let adminPass = process.env.ADMIN_PASSWORD;
    let isRandom = false;

    if (!adminPass) {
      const crypto = require('crypto');
      adminPass = crypto.randomBytes(8).toString('hex'); // 16 char random password
      isRandom = true;
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(adminPass, saltRounds);

    await pool.query(
      `INSERT INTO admins (id, email, password_hash, name)
       VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`,
      [`admin-${Date.now()}`, adminEmail, passwordHash, 'Neokik Admin']
    );

    console.log('================================================================');
    console.log('✅ DATABASE INITIALIZATION COMPLETED SUCCESSFULLY!');
    console.log('   Initial Admin Account:');
    console.log(`   - Email:    ${adminEmail}`);
    if (isRandom) {
      console.log(`   - Password: ${adminPass} (GENERATED SECURELY — SAVE IT!)`);
    } else {
      console.log('   - Password: [CONFIGURED VIA ENV VARIABLES]');
    }
    console.log('================================================================');

    process.exit(0);
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    process.exit(1);
  }
}

init();
