const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.connect((err, client, release) => {
  if (err) {
    console.error('Error acquiring client', err.stack);
  } else {
    console.log('Database connected successfully');
    release();
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'GD Farms API is running',
    timestamp: new Date().toISOString()
  });
});

// Initialize user
app.post('/api/user/init', async (req, res) => {
  try {
    const { userId } = req.body;

    if (userId) {
      // Check if user exists in settings
      const settingsResult = await pool.query(
        'SELECT * FROM user_settings WHERE user_id = $1',
        [userId]
      );

      if (settingsResult.rows.length > 0) {
        return res.json({ 
          success: true, 
          userId,
          message: 'User validated successfully'
        });
      }
    }

    // Create new user
    const newUserId = uuidv4();

    // Initialize user settings
    await pool.query(
      'INSERT INTO user_settings (user_id) VALUES ($1)',
      [newUserId]
    );

    res.json({
      success: true,
      userId: newUserId,
      message: 'New user created successfully'
    });

  } catch (error) {
    console.error('User init error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during user initialization'
    });
  }
});

// Get all items for a user
app.get('/api/items/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT * FROM items WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    res.json({
      success: true,
      items: result.rows
    });

  } catch (error) {
    console.error('Get items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch items'
    });
  }
});

// Add new item
app.post('/api/items', async (req, res) => {
  try {
    const { userId, name, category, quantity_value, quantity_unit, buying_price, selling_price, description } = req.body;

    const result = await pool.query(
      `INSERT INTO items (user_id, name, category, quantity_value, quantity_unit, buying_price, selling_price, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [userId, name, category, quantity_value, quantity_unit, buying_price, selling_price, description]
    );

    res.json({
      success: true,
      item: result.rows[0],
      message: 'Item added successfully'
    });

  } catch (error) {
    console.error('Add item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add item'
    });
  }
});

// Update item
app.put('/api/items/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, name, category, quantity_value, quantity_unit, buying_price, selling_price, description } = req.body;

    const result = await pool.query(
      `UPDATE items SET name = $1, category = $2, quantity_value = $3, quantity_unit = $4, 
       buying_price = $5, selling_price = $6, description = $7, updated_at = NOW() 
       WHERE id = $8 AND user_id = $9 RETURNING *`,
      [name, category, quantity_value, quantity_unit, buying_price, selling_price, description, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      item: result.rows[0],
      message: 'Item updated successfully'
    });

  } catch (error) {
    console.error('Update item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update item'
    });
  }
});

// Delete item
app.delete('/api/items/:id/:userId', async (req, res) => {
  try {
    const { id, userId } = req.params;

    const result = await pool.query(
      'DELETE FROM items WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    res.json({
      success: true,
      message: 'Item deleted successfully'
    });

  } catch (error) {
    console.error('Delete item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete item'
    });
  }
});

// Get analytics
app.get('/api/analytics/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const itemsResult = await pool.query(
      'SELECT * FROM items WHERE user_id = $1',
      [userId]
    );

    const items = itemsResult.rows;

    // Calculate analytics
    const totalInvestment = items.reduce((sum, item) => 
      sum + (item.buying_price * item.quantity_value), 0);
    
    const totalRevenue = items.reduce((sum, item) => 
      sum + (item.selling_price * item.quantity_value), 0);
    
    const totalProfit = totalRevenue - totalInvestment;
    const profitMargin = totalInvestment > 0 ? (totalProfit / totalInvestment) * 100 : 0;

    // Get top performing items
    const topItems = items
      .map(item => ({
        ...item,
        profit: (item.selling_price - item.buying_price) * item.quantity_value
      }))
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5);

    res.json({
      success: true,
      analytics: {
        totalInvestment,
        totalRevenue,
        totalProfit,
        profitMargin: parseFloat(profitMargin.toFixed(2)),
        totalItems: items.length,
        topItems
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate analytics'
    });
  }
});

// Get user settings
app.get('/api/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT * FROM user_settings WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User settings not found'
      });
    }

    res.json({
      success: true,
      settings: result.rows[0]
    });

  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch settings'
    });
  }
});

// Update user settings
app.put('/api/settings/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { currency, app_name, unit_preferences } = req.body;

    const result = await pool.query(
      `UPDATE user_settings SET currency = $1, app_name = $2, 
       unit_preferences = $3, updated_at = NOW() 
       WHERE user_id = $4 RETURNING *`,
      [currency, app_name, unit_preferences, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User settings not found'
      });
    }

    res.json({
      success: true,
      settings: result.rows[0],
      message: 'Settings updated successfully'
    });

  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update settings'
    });
  }
});

// Set goal
app.post('/api/goals', async (req, res) => {
  try {
    const { userId, name, target_revenue, target_profit, target_items, deadline, description } = req.body;

    // Delete existing goal for this user
    await pool.query(
      'DELETE FROM goals WHERE user_id = $1',
      [userId]
    );

    const result = await pool.query(
      `INSERT INTO goals (user_id, name, target_revenue, target_profit, target_items, deadline, description) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [userId, name, target_revenue, target_profit, target_items, deadline, description]
    );

    res.json({
      success: true,
      goal: result.rows[0],
      message: 'Goal set successfully'
    });

  } catch (error) {
    console.error('Set goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set goal'
    });
  }
});

// Get current goal
app.get('/api/goals/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      'SELECT * FROM goals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    res.json({
      success: true,
      goal: result.rows[0] || null
    });

  } catch (error) {
    console.error('Get goal error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch goal'
    });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!'
  });
});

app.listen(PORT, () => {
  console.log(`GD Farms backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
