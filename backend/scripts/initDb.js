const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
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

    process.exit(0);
  } catch (err) {
    console.error('❌ Database initialization error:', err);
    process.exit(1);
  }
}

init();
