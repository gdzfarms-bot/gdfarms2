// server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';

dotenv.config();
const { Pool } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Test DB connection
(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Connected to Neon PostgreSQL:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Database connection failed:', err.message);
  }
})();

// --------------------- Routes ---------------------
app.get('/', (req, res) => {
  res.json({ success: true, message: '✅ GD Farms backend is running with NeonDB' });
});

// Create user
app.post('/api/user/init', async (req, res) => {
  try {
    const userId = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, created_at) VALUES ($1, NOW())', [userId]);
    res.json({ success: true, userId });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add item
app.post('/api/items', async (req, res) => {
  try {
    const { userId, name, unit, cost, price, quantity } = req.body;
    await pool.query(
      'INSERT INTO items (user_id, name, unit, cost, price, quantity, created_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())',
      [userId, name, unit, cost, price, quantity]
    );
    res.json({ success: true, message: 'Item added successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get all items
app.get('/api/items/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query('SELECT * FROM items WHERE user_id = $1', [userId]);
    res.json({ success: true, items: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Revenue and profit analytics
app.get('/api/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { rows } = await pool.query(
      `SELECT
        SUM(price * quantity) AS revenue,
        SUM(cost * quantity) AS cost,
        SUM(price * quantity) - SUM(cost * quantity) AS profit
       FROM items WHERE user_id = $1`,
      [userId]
    );
    res.json({ success: true, analytics: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Catch-all
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Endpoint not found' });
});

// --------------------- Start Server ---------------------
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

