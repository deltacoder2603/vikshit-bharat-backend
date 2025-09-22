const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Configure CORS - Allow all origins
const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200
};

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Neon PostgreSQL client
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Connect to database
async function connectDatabase() {
  try {
    await client.connect();
    console.log('Connected to Neon database');
  } catch (error) {
    console.error('Database connection error:', error);
    throw error;
  }
}

// JWT Middleware for authentication
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'default_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Initialize database tables (same as before)
async function initializeDatabase() {
  try {
    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone_number VARCHAR(20) UNIQUE NOT NULL,
        aadhar VARCHAR(12) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        address TEXT,
        role VARCHAR(50) DEFAULT 'citizen',
        department VARCHAR(255),
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Problems table
    await client.query(`
      CREATE TABLE IF NOT EXISTS problems (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        problem_categories TEXT[] NOT NULL,
        others_text TEXT,
        user_image_base64 TEXT NOT NULL,
        user_image_mimetype VARCHAR(100) NOT NULL,
        admin_image_base64 TEXT,
        admin_image_mimetype VARCHAR(100),
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        status VARCHAR(50) DEFAULT 'not completed',
        priority VARCHAR(20) DEFAULT 'medium',
        assigned_worker_id INTEGER REFERENCES users(id),
        assigned_department VARCHAR(255),
        estimated_completion DATE,
        completion_notes TEXT,
        citizen_rating INTEGER CHECK (citizen_rating >= 1 AND citizen_rating <= 5),
        citizen_feedback TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Workers table (extended user information for field workers)
    await client.query(`
      CREATE TABLE IF NOT EXISTS workers (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) UNIQUE,
        specializations TEXT[],
        efficiency_rating DECIMAL(3, 2) DEFAULT 0.0,
        total_assigned INTEGER DEFAULT 0,
        total_completed INTEGER DEFAULT 0,
        avg_completion_time DECIMAL(5, 2), -- in hours
        current_status VARCHAR(50) DEFAULT 'available',
        last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        location_lat DECIMAL(10, 8),
        location_lng DECIMAL(11, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Departments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        name_en VARCHAR(255) NOT NULL,
        head_id INTEGER REFERENCES users(id),
        description TEXT,
        phone VARCHAR(20),
        email VARCHAR(255),
        location TEXT,
        budget DECIMAL(15, 2),
        established_year INTEGER,
        status VARCHAR(50) DEFAULT 'active',
        total_workers INTEGER DEFAULT 0,
        total_complaints INTEGER DEFAULT 0,
        resolved_complaints INTEGER DEFAULT 0,
        avg_resolution_time DECIMAL(5, 2), -- in days
        rating DECIMAL(3, 2) DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications table
    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) NOT NULL, -- urgent, info, success, warning
        priority VARCHAR(20) DEFAULT 'medium', -- high, medium, low
        sender_id INTEGER REFERENCES users(id),
        recipient_ids INTEGER[],
        department VARCHAR(255),
        category VARCHAR(50) NOT NULL, -- system, complaint, worker, citizen, department, emergency
        related_problem_id INTEGER REFERENCES problems(id),
        action_required BOOLEAN DEFAULT false,
        expires_at TIMESTAMP,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Problem status history table
    await client.query(`
      CREATE TABLE IF NOT EXISTS problem_status_history (
        id SERIAL PRIMARY KEY,
        problem_id INTEGER REFERENCES problems(id),
        status VARCHAR(50) NOT NULL,
        updated_by_id INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Analytics table for storing computed metrics
    await client.query(`
      CREATE TABLE IF NOT EXISTS analytics (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DECIMAL(15, 2),
        metric_data JSONB,
        department VARCHAR(255),
        date_range_start DATE,
        date_range_end DATE,
        computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('All database tables initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Utility function to convert image buffer to base64
function convertImageToBase64(fileBuffer, mimeType) {
  try {
    const base64String = fileBuffer.toString('base64');
    return {
      base64: base64String,
      mimeType: mimeType
    };
  } catch (error) {
    console.error('Base64 conversion error:', error);
    throw new Error('Failed to convert image to base64');
  }
}

// Generate JWT token
function generateToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role 
    },
    process.env.JWT_SECRET || 'default_secret',
    { expiresIn: '7d' }
  );
}

// ==================== USER AUTHENTICATION ROUTES ====================

// User Registration
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, phone_number, aadhar, password, address, role = 'citizen', department } = req.body;

    // Validate required fields
    if (!name || !email || !phone_number || !aadhar || !password) {
      return res.status(400).json({ 
        error: 'All fields are required: name, email, phone_number, aadhar, password' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Validate phone number (10 digits)
    const phoneRegex = /^\d{10}$/;
    if (!phoneRegex.test(phone_number)) {
      return res.status(400).json({ error: 'Phone number must be exactly 10 digits' });
    }

    // Validate Aadhar (12 digits)
    const aadharRegex = /^\d{12}$/;
    if (!aadharRegex.test(aadhar)) {
      return res.status(400).json({ error: 'Aadhar must be exactly 12 digits' });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Check if user already exists
    const existingUser = await client.query(`
      SELECT id FROM users 
      WHERE email = $1 OR phone_number = $2 OR aadhar = $3
    `, [email, phone_number, aadhar]);

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists with this email, phone, or aadhar' });
    }

    // Create new user
    const result = await client.query(`
      INSERT INTO users (name, email, phone_number, aadhar, password, address, role, department)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, name, email, phone_number, aadhar, role, department, created_at
    `, [name, email, phone_number, aadhar, hashedPassword, address, role, department]);

    const user = result.rows[0];
    const token = generateToken(user);

    res.status(201).json({ 
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        aadhar: user.aadhar,
        role: user.role,
        department: user.department,
        created_at: user.created_at
      },
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// User Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await client.query(`
      SELECT id, name, email, phone_number, aadhar, password, role, department, avatar_url 
      FROM users 
      WHERE email = $1 AND is_active = true
    `, [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await client.query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    const token = generateToken(user);

    res.json({ 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone_number: user.phone_number,
        aadhar: user.aadhar,
        role: user.role,
        department: user.department,
        avatar_url: user.avatar_url
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Get User Details
app.get('/api/users/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await client.query(`
      SELECT id, name, email, phone_number, aadhar, address, role, department, avatar_url, created_at, updated_at 
      FROM users WHERE id = $1 AND is_active = true
    `, [user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
});

// Update User Profile
app.put('/api/users/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;
    const { name, phone_number, address, avatar_url } = req.body;

    // Verify user can only update their own profile (unless admin)
    if (req.user.id !== parseInt(user_id) && req.user.role !== 'district-magistrate') {
      return res.status(403).json({ error: 'Unauthorized to update this profile' });
    }

    const result = await client.query(`
      UPDATE users 
      SET name = COALESCE($1, name), 
          phone_number = COALESCE($2, phone_number),
          address = COALESCE($3, address),
          avatar_url = COALESCE($4, avatar_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5 AND is_active = true
      RETURNING id, name, email, phone_number, aadhar, address, role, department, avatar_url
    `, [name, phone_number, address, avatar_url, user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ 
      message: 'Profile updated successfully',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user', details: error.message });
  }
});

// Get All Users (Admin only)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    // Only admin roles can access all users
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await client.query(`
      SELECT id, name, email, phone_number, role, department, is_active, last_login, created_at
      FROM users 
      ORDER BY created_at DESC
    `);

    res.json({ users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to get users', details: error.message });
  }
});

// ==================== PROBLEM/COMPLAINT ROUTES ====================

// Image Analysis using AI
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    
    const prompt = `You are analyzing civic issue images. Identify if the photo shows any of the following problems:
• Garbage & Waste (roadside dumps, no dustbins, poor segregation)
• Traffic & Roads (encroachments, potholes, heavy congestion)
• Pollution (dirty Ganga, factory emissions, open garbage burning)
• Drainage & Sewage (open drains, choked sewers, waterlogging)
• Public Spaces (poor toilets, park encroachment, less greenery)
• Housing & Slums (unplanned colonies, lack of sanitation & housing)
• Other Issues (broken streetlights, stray animals, no parking)

Return your answer ONLY as a JSON array of category names that apply, exactly matching the wording above.
If no categories apply, return [].
Be specific: include only the categories clearly visible in the photo, not all of them.`;

    const imagePart = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
      }
    };

    const result = await model.generateContent([prompt, imagePart]);
    const response = await result.response;
    const text = response.text();
    
    // Parse JSON response from Gemini
    let categories;
    try {
      categories = JSON.parse(text.trim());
    } catch (parseError) {
      // Fallback: extract JSON array from response
      const jsonMatch = text.match(/\[.*\]/);
      if (jsonMatch) {
        categories = JSON.parse(jsonMatch[0]);
      } else {
        categories = [];
      }
    }

    res.json({ categories });
  } catch (error) {
    console.error('Image analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze image', details: error.message });
  }
});

// Submit Problem
app.post('/api/problems', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const { problem_categories, others_text, latitude, longitude, priority = 'medium' } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    if (!problem_categories || !latitude || !longitude) {
      return res.status(400).json({ error: 'problem_categories, latitude, and longitude are required' });
    }

    // Validate location data
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'Invalid latitude or longitude format' });
    }
    
    if (lat < -90 || lat > 90) {
      return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
    }
    
    if (lng < -180 || lng > 180) {
      return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
    }

    // Parse problem_categories if it's a string
    let categoriesArray;
    try {
      categoriesArray = typeof problem_categories === 'string' 
        ? JSON.parse(problem_categories) 
        : problem_categories;
    } catch (error) {
      return res.status(400).json({ error: 'Invalid problem_categories format' });
    }

    // Convert image to base64
    const imageData = convertImageToBase64(req.file.buffer, req.file.mimetype);

    // Insert into database
    const result = await client.query(`
      INSERT INTO problems (user_id, problem_categories, others_text, user_image_base64, user_image_mimetype, latitude, longitude, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [req.user.id, categoriesArray, others_text || null, imageData.base64, imageData.mimeType, lat, lng, priority, 'not completed']);

    const problem = result.rows[0];

    // Add initial status history
    await client.query(`
      INSERT INTO problem_status_history (problem_id, status, updated_by_id, notes)
      VALUES ($1, $2, $3, $4)
    `, [problem.id, 'not completed', req.user.id, 'Problem submitted']);

    res.json({ 
      message: 'Problem created successfully', 
      problem: problem
    });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ error: 'Failed to create problem entry', details: error.message });
  }
});

// Get User's Problems
app.get('/api/problems/user/:user_id', authenticateToken, async (req, res) => {
  try {
    const { user_id } = req.params;

    // Users can only see their own problems unless they're admin
    if (req.user.id !== parseInt(user_id) && !['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await client.query(`
      SELECT p.*, u.name as user_name, u.email as user_email
      FROM problems p
      JOIN users u ON p.user_id = u.id
      WHERE p.user_id = $1 
      ORDER BY p.created_at DESC
    `, [user_id]);

    const problems = result.rows.map(problem => ({
      ...problem,
      user_image_status: problem.user_image_base64 ? 'image_available' : null,
      admin_image_status: problem.admin_image_base64 ? 'image_available' : null
    }));

    res.json({ problems });
  } catch (error) {
    console.error('Fetch user problems error:', error);
    res.status(500).json({ error: 'Failed to fetch user problems', details: error.message });
  }
});

// Get All Problems (Admin)
app.get('/api/admin/problems', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head', 'field-worker'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let query = `
      SELECT p.*, u.name as user_name, u.email as user_email,
             w.name as assigned_worker_name, d.name as department_name
      FROM problems p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN users w ON p.assigned_worker_id = w.id
      LEFT JOIN departments d ON p.assigned_department = d.name
    `;

    let queryParams = [];

    // Filter by department for department heads
    if (req.user.role === 'department-head') {
      const categoryMapping = {
        'सफाई विभाग': ['Garbage & Waste Management', 'सफाई और कचरा प्रबंधन', 'Garbage & Waste', 'Garbage & Waste (roadside dumps, no dustbins, poor segregation)', 'Pollution (open garbage burning)'],
        'जल विभाग': ['Water Supply', 'जल आपूर्ति', 'Water & Sanitation'],
        'सड़क विभाग': ['Roads & Transportation', 'सड़क और परिवहन', 'Roads & Infrastructure'],
        'विद्युत विभाग': ['Electricity', 'बिजली', 'Power & Utilities']
      };
      const categories = categoryMapping[req.user.department] || [req.user.department];
      // Use string matching to check categories  
      query += ` WHERE (p.assigned_department = $1 OR 
        p.problem_categories::text LIKE '%Garbage%' OR 
        p.problem_categories::text LIKE '%सफाई%' OR
        p.problem_categories::text LIKE '%Waste%')`;
      queryParams.push(req.user.department);
    }

    // Filter by assigned worker for field workers
    if (req.user.role === 'field-worker') {
      query += ` WHERE p.assigned_worker_id = $1`;
      queryParams.push(req.user.id);
    }

    query += ` ORDER BY p.created_at DESC`;

    const result = await client.query(query, queryParams);

    const problems = result.rows.map(problem => ({
      ...problem,
      user_image_status: problem.user_image_base64 ? 'image_available' : null,
      admin_image_status: problem.admin_image_base64 ? 'image_available' : null
    }));

    res.json({ problems });
  } catch (error) {
    console.error('Admin fetch problems error:', error);
    res.status(500).json({ error: 'Failed to fetch all problems', details: error.message });
  }
});

// Mark Problem as Completed
app.post('/api/admin/problems/:problem_id/complete', authenticateToken, upload.single('completed_image'), async (req, res) => {
  try {
    const { problem_id } = req.params;
    const { completion_notes } = req.body;

    if (!['district-magistrate', 'department-head', 'field-worker'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Completed image file is required' });
    }

    // Convert completed image to base64
    const imageData = convertImageToBase64(req.file.buffer, req.file.mimetype);

    // Update problem status and admin image
    const result = await client.query(`
      UPDATE problems 
      SET status = $1, admin_image_base64 = $2, admin_image_mimetype = $3, 
          completion_notes = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, ['completed', imageData.base64, imageData.mimeType, completion_notes, problem_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const problem = result.rows[0];

    // Add status history
    await client.query(`
      INSERT INTO problem_status_history (problem_id, status, updated_by_id, notes)
      VALUES ($1, $2, $3, $4)
    `, [problem_id, 'completed', req.user.id, completion_notes || 'Problem marked as completed']);

    res.json({ 
      message: 'Problem marked as completed successfully', 
      problem: problem
    });
  } catch (error) {
    console.error('Mark problem completed error:', error);
    res.status(500).json({ error: 'Failed to mark problem as completed', details: error.message });
  }
});

// Assign Worker to Problem
app.post('/api/admin/problems/:problem_id/assign', authenticateToken, async (req, res) => {
  try {
    const { problem_id } = req.params;
    const { worker_id, department, estimated_completion } = req.body;

    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await client.query(`
      UPDATE problems 
      SET assigned_worker_id = $1, assigned_department = $2, 
          estimated_completion = $3, status = 'in-progress',
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, [worker_id, department, estimated_completion, problem_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Add status history
    await client.query(`
      INSERT INTO problem_status_history (problem_id, status, updated_by_id, notes)
      VALUES ($1, $2, $3, $4)
    `, [problem_id, 'in-progress', req.user.id, `Worker assigned: ${worker_id}`]);

    // Update worker statistics
    await client.query(`
      UPDATE workers 
      SET total_assigned = total_assigned + 1
      WHERE user_id = $1
    `, [worker_id]);

    res.json({ 
      message: 'Worker assigned successfully', 
      problem: result.rows[0]
    });
  } catch (error) {
    console.error('Assign worker error:', error);
    res.status(500).json({ error: 'Failed to assign worker', details: error.message });
  }
});

// Update Problem Priority/Status
app.patch('/api/admin/problems/:problem_id', authenticateToken, async (req, res) => {
  try {
    const { problem_id } = req.params;
    const { status, priority, notes } = req.body;

    if (!['district-magistrate', 'department-head', 'field-worker'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const updates = [];
    const values = [];
    let paramCount = 1;

    if (status) {
      updates.push(`status = $${paramCount++}`);
      values.push(status);
    }

    if (priority) {
      updates.push(`priority = $${paramCount++}`);
      values.push(priority);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(problem_id);

    const result = await client.query(`
      UPDATE problems 
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    // Add status history if status changed
    if (status) {
      await client.query(`
        INSERT INTO problem_status_history (problem_id, status, updated_by_id, notes)
        VALUES ($1, $2, $3, $4)
      `, [problem_id, status, req.user.id, notes || `Status updated to ${status}`]);
    }

    res.json({ 
      message: 'Problem updated successfully', 
      problem: result.rows[0]
    });
  } catch (error) {
    console.error('Update problem error:', error);
    res.status(500).json({ error: 'Failed to update problem', details: error.message });
  }
});

// Get Problem Status History
app.get('/api/problems/:problem_id/history', authenticateToken, async (req, res) => {
  try {
    const { problem_id } = req.params;

    const result = await client.query(`
      SELECT psh.*, u.name as updated_by_name
      FROM problem_status_history psh
      JOIN users u ON psh.updated_by_id = u.id
      WHERE psh.problem_id = $1
      ORDER BY psh.created_at ASC
    `, [problem_id]);

    res.json({ history: result.rows });
  } catch (error) {
    console.error('Get problem history error:', error);
    res.status(500).json({ error: 'Failed to get problem history', details: error.message });
  }
});

// ==================== WORKER MANAGEMENT ROUTES ====================

// Get All Workers
app.get('/api/admin/workers', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let query = `
      SELECT u.*, w.specializations, w.efficiency_rating, w.total_assigned, 
             w.total_completed, w.avg_completion_time, w.current_status, 
             w.last_active, w.location_lat, w.location_lng
      FROM users u
      LEFT JOIN workers w ON u.id = w.user_id
      WHERE u.role = 'field-worker' AND u.is_active = true
    `;

    if (req.user.role === 'department-head') {
      query += ` AND u.department = $1`;
      const result = await client.query(query, [req.user.department]);
      res.json({ workers: result.rows });
    } else {
      const result = await client.query(query);
      res.json({ workers: result.rows });
    }
  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({ error: 'Failed to get workers', details: error.message });
  }
});

// Create Worker Profile
app.post('/api/admin/workers', authenticateToken, async (req, res) => {
  try {
    const { user_id, specializations, current_status } = req.body;

    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    // Check if user exists and is a field worker
    const userResult = await client.query(`
      SELECT * FROM users WHERE id = $1 AND role = 'field-worker' AND is_active = true
    `, [user_id]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Field worker not found' });
    }

    const result = await client.query(`
      INSERT INTO workers (user_id, specializations, current_status)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        specializations = $2, 
        current_status = $3,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `, [user_id, specializations, current_status || 'available']);

    res.json({ 
      message: 'Worker profile created/updated successfully',
      worker: result.rows[0]
    });
  } catch (error) {
    console.error('Create worker error:', error);
    res.status(500).json({ error: 'Failed to create worker profile', details: error.message });
  }
});

// Update Worker Status/Location
app.patch('/api/workers/:worker_id/status', authenticateToken, async (req, res) => {
  try {
    const { worker_id } = req.params;
    const { current_status, location_lat, location_lng } = req.body;

    // Workers can update their own status, admins can update any
    if (req.user.id !== parseInt(worker_id) && !['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await client.query(`
      UPDATE workers 
      SET current_status = COALESCE($1, current_status),
          location_lat = COALESCE($2, location_lat),
          location_lng = COALESCE($3, location_lng),
          last_active = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $4
      RETURNING *
    `, [current_status, location_lat, location_lng, worker_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Worker not found' });
    }

    res.json({ 
      message: 'Worker status updated successfully',
      worker: result.rows[0]
    });
  } catch (error) {
    console.error('Update worker status error:', error);
    res.status(500).json({ error: 'Failed to update worker status', details: error.message });
  }
});

// ==================== DEPARTMENT MANAGEMENT ROUTES ====================

// Get All Departments
app.get('/api/admin/departments', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const result = await client.query(`
      SELECT d.*, u.name as head_name, u.email as head_email
      FROM departments d
      LEFT JOIN users u ON d.head_id = u.id
      ORDER BY d.name
    `);

    res.json({ departments: result.rows });
  } catch (error) {
    console.error('Get departments error:', error);
    res.status(500).json({ error: 'Failed to get departments', details: error.message });
  }
});

// Create Department
app.post('/api/admin/departments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'district-magistrate') {
      return res.status(403).json({ error: 'Only District Magistrate can create departments' });
    }

    const { 
      name, name_en, head_id, description, phone, email, location, 
      budget, established_year 
    } = req.body;

    if (!name || !name_en) {
      return res.status(400).json({ error: 'Department name (both Hindi and English) is required' });
    }

    const result = await client.query(`
      INSERT INTO departments (name, name_en, head_id, description, phone, email, location, budget, established_year)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [name, name_en, head_id, description, phone, email, location, budget, established_year]);

    res.json({ 
      message: 'Department created successfully',
      department: result.rows[0]
    });
  } catch (error) {
    console.error('Create department error:', error);
    res.status(500).json({ error: 'Failed to create department', details: error.message });
  }
});

// Update Department
app.put('/api/admin/departments/:dept_id', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'district-magistrate') {
      return res.status(403).json({ error: 'Only District Magistrate can update departments' });
    }

    const { dept_id } = req.params;
    const { 
      name, name_en, head_id, description, phone, email, location, 
      budget, status 
    } = req.body;

    const result = await client.query(`
      UPDATE departments 
      SET name = COALESCE($1, name),
          name_en = COALESCE($2, name_en),
          head_id = COALESCE($3, head_id),
          description = COALESCE($4, description),
          phone = COALESCE($5, phone),
          email = COALESCE($6, email),
          location = COALESCE($7, location),
          budget = COALESCE($8, budget),
          status = COALESCE($9, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $10
      RETURNING *
    `, [name, name_en, head_id, description, phone, email, location, budget, status, dept_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Department not found' });
    }

    res.json({ 
      message: 'Department updated successfully',
      department: result.rows[0]
    });
  } catch (error) {
    console.error('Update department error:', error);
    res.status(500).json({ error: 'Failed to update department', details: error.message });
  }
});

// ==================== NOTIFICATIONS ROUTES ====================

// Get Notifications
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, offset = 0, category, type } = req.query;

    let query = `
      SELECT n.*, u.name as sender_name
      FROM notifications n
      LEFT JOIN users u ON n.sender_id = u.id
      WHERE ($1 = ANY(n.recipient_ids) OR n.recipient_ids IS NULL)
    `;
    
    const queryParams = [req.user.id];
    let paramCount = 2;

    if (category) {
      query += ` AND n.category = $${paramCount++}`;
      queryParams.push(category);
    }

    if (type) {
      query += ` AND n.type = $${paramCount++}`;
      queryParams.push(type);
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${paramCount++} OFFSET $${paramCount}`;
    queryParams.push(parseInt(limit.toString()), parseInt(offset.toString()));

    const result = await client.query(query, queryParams);

    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to get notifications', details: error.message });
  }
});

// Create Notification
app.post('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { 
      title, message, type, priority = 'medium', recipient_ids, department, 
      category, related_problem_id, action_required = false, expires_at 
    } = req.body;

    if (!title || !message || !type || !category) {
      return res.status(400).json({ error: 'Title, message, type, and category are required' });
    }

    const result = await client.query(`
      INSERT INTO notifications (
        title, message, type, priority, sender_id, recipient_ids, department,
        category, related_problem_id, action_required, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *
    `, [
      title, message, type, priority, req.user.id, recipient_ids, department,
      category, related_problem_id, action_required, expires_at
    ]);

    res.json({ 
      message: 'Notification created successfully',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({ error: 'Failed to create notification', details: error.message });
  }
});

// Mark Notification as Read
app.patch('/api/notifications/:notification_id/read', authenticateToken, async (req, res) => {
  try {
    const { notification_id } = req.params;

    const result = await client.query(`
      UPDATE notifications 
      SET is_read = true
      WHERE id = $1 AND ($2 = ANY(recipient_ids) OR recipient_ids IS NULL)
      RETURNING *
    `, [notification_id, req.user.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ 
      message: 'Notification marked as read',
      notification: result.rows[0]
    });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read', details: error.message });
  }
});


// ==================== ANALYTICS ROUTES (ENHANCED) ====================

// Get Dashboard Analytics (Enhanced with better error handling)
app.get('/api/analytics/dashboard', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let departmentFilter = '';
    let queryParams = [];
    
    if (req.user.role === 'department-head') {
      // For department heads, show problems assigned to their department OR problems in their category
      const categoryMapping = {
        'सफाई विभाग': ['Garbage & Waste Management', 'सफाई और कचरा प्रबंधन', 'Garbage & Waste', 'Garbage & Waste (roadside dumps, no dustbins, poor segregation)', 'Pollution (open garbage burning)'],
        'जल विभाग': ['Water Supply', 'जल आपूर्ति', 'Water & Sanitation'],
        'सड़क विभाग': ['Roads & Transportation', 'सड़क और परिवहन', 'Roads & Infrastructure'],
        'विद्युत विभाग': ['Electricity', 'बिजली', 'Power & Utilities']
      };
      const categories = categoryMapping[req.user.department] || [req.user.department];
      // Use string matching to check categories
      departmentFilter = `WHERE (p.assigned_department = $1 OR 
        p.problem_categories::text LIKE '%Garbage%' OR 
        p.problem_categories::text LIKE '%सफाई%' OR
        p.problem_categories::text LIKE '%Waste%')`;
      queryParams.push(req.user.department);
    }

    // Get basic statistics with better error handling
    const statsQuery = `
      SELECT 
        COUNT(*) as total_complaints,
        COUNT(*) FILTER (WHERE status = 'not completed') as pending_complaints,
        COUNT(*) FILTER (WHERE status = 'in-progress') as in_progress_complaints,
        COUNT(*) FILTER (WHERE status = 'completed') as completed_complaints,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN EXTRACT(DAY FROM (updated_at - created_at)) END), 0) as avg_resolution_days
      FROM problems p
      ${departmentFilter}
    `;

    const statsResult = await client.query(statsQuery, queryParams);
    const stats = statsResult.rows[0];

    // Get category breakdown with safe handling
    const categoryQuery = `
      SELECT 
        unnest(problem_categories) as category,
        COUNT(*) as count
      FROM problems p
      ${departmentFilter}
      GROUP BY category
      ORDER BY count DESC
    `;

    const categoryResult = await client.query(categoryQuery, queryParams);

    // Get recent complaints with safe data handling
    const recentQuery = `
      SELECT p.*, u.name as user_name
      FROM problems p
      JOIN users u ON p.user_id = u.id
      ${departmentFilter}
      ORDER BY p.created_at DESC
      LIMIT 10
    `;

    const recentResult = await client.query(recentQuery, queryParams);

    // Build category breakdown object safely
    const categoryBreakdown = {};
    categoryResult.rows.forEach(row => {
      if (row.category && row.count) {
        categoryBreakdown[row.category] = parseInt(row.count) || 0;
      }
    });

    const analytics = {
      totalComplaints: parseInt(stats.total_complaints) || 0,
      pendingComplaints: parseInt(stats.pending_complaints) || 0,
      inProgressComplaints: parseInt(stats.in_progress_complaints) || 0,
      completedComplaints: parseInt(stats.completed_complaints) || 0,
      avgResolutionDays: parseFloat(stats.avg_resolution_days) || 0,
      categoryBreakdown: categoryBreakdown,
      recentComplaints: recentResult.rows || []
    };

    res.json(analytics);
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to get analytics', 
      details: error.message,
      // Return minimal fallback data
      totalComplaints: 0,
      pendingComplaints: 0,
      inProgressComplaints: 0,
      completedComplaints: 0,
      avgResolutionDays: 0,
      categoryBreakdown: {},
      recentComplaints: []
    });
  }
});

// Get Department Performance Analytics (Enhanced)
app.get('/api/analytics/departments', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'district-magistrate') {
      return res.status(403).json({ error: 'Only District Magistrate can access department analytics' });
    }

    const result = await client.query(`
      SELECT 
        d.name,
        d.name_en,
        COALESCE(COUNT(p.id), 0) as total_complaints,
        COALESCE(COUNT(p.id) FILTER (WHERE p.status = 'completed'), 0) as resolved_complaints,
        COALESCE(COUNT(p.id) FILTER (WHERE p.status = 'not completed'), 0) as pending_complaints,
        COALESCE(AVG(CASE WHEN p.status = 'completed' THEN EXTRACT(DAY FROM (p.updated_at - p.created_at)) END), 0) as avg_resolution_days,
        COALESCE(d.rating, 0) as rating,
        COALESCE(d.total_workers, 0) as total_workers
      FROM departments d
      LEFT JOIN problems p ON d.name = p.assigned_department
      GROUP BY d.id, d.name, d.name_en, d.rating, d.total_workers
      ORDER BY resolved_complaints DESC
    `);

    // Ensure all numeric values are properly formatted
    const departments = result.rows.map(dept => ({
      ...dept,
      total_complaints: parseInt(dept.total_complaints) || 0,
      resolved_complaints: parseInt(dept.resolved_complaints) || 0,
      pending_complaints: parseInt(dept.pending_complaints) || 0,
      avg_resolution_days: parseFloat(dept.avg_resolution_days) || 0,
      rating: parseFloat(dept.rating) || 0,
      total_workers: parseInt(dept.total_workers) || 0
    }));

    res.json({ departments });
  } catch (error) {
    console.error('Get department analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to get department analytics', 
      details: error.message,
      departments: [] // Return empty array as fallback
    });
  }
});

// Get Worker Performance Analytics (Enhanced)
app.get('/api/analytics/workers', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let query = `
      SELECT 
        u.id, u.name, u.department,
        COALESCE(w.total_assigned, 0) as total_assigned, 
        COALESCE(w.total_completed, 0) as total_completed, 
        COALESCE(w.efficiency_rating, 0) as efficiency_rating,
        COALESCE(w.avg_completion_time, 0) as avg_completion_time, 
        COALESCE(w.current_status, 'available') as current_status,
        COALESCE(COUNT(p.id), 0) as active_assignments
      FROM users u
      LEFT JOIN workers w ON u.id = w.user_id
      LEFT JOIN problems p ON u.id = p.assigned_worker_id AND p.status = 'in-progress'
      WHERE u.role = 'field-worker' AND u.is_active = true
    `;

    let queryParams = [];

    if (req.user.role === 'department-head') {
      query += ` AND u.department = $1`;
      queryParams.push(req.user.department);
    }

    query += ` GROUP BY u.id, u.name, u.department, w.total_assigned, w.total_completed, w.efficiency_rating, w.avg_completion_time, w.current_status ORDER BY w.efficiency_rating DESC NULLS LAST`;

    const result = await client.query(query, queryParams);

    // Ensure all numeric values are properly formatted
    const workers = result.rows.map(worker => ({
      ...worker,
      total_assigned: parseInt(worker.total_assigned) || 0,
      total_completed: parseInt(worker.total_completed) || 0,
      efficiency_rating: parseFloat(worker.efficiency_rating) || 0,
      avg_completion_time: parseFloat(worker.avg_completion_time) || 0,
      active_assignments: parseInt(worker.active_assignments) || 0
    }));

    res.json({ workers });
  } catch (error) {
    console.error('Get worker analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to get worker analytics', 
      details: error.message,
      workers: [] // Return empty array as fallback
    });
  }
});

// Get Ward-wise Analytics (Enhanced)
app.get('/api/analytics/wards', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let departmentFilter = '';
    let queryParams = [];
    
    if (req.user.role === 'department-head') {
      // For department heads, filter by their department
      const categoryMapping = {
        'सफाई विभाग': ['Garbage & Waste Management', 'सफाई और कचरा प्रबंधन', 'Garbage & Waste', 'Garbage & Waste (roadside dumps, no dustbins, poor segregation)', 'Pollution (open garbage burning)'],
        'जल विभाग': ['Water Supply', 'जल आपूर्ति', 'Water & Sanitation'],
        'सड़क विभाग': ['Roads & Transportation', 'सड़क और परिवहन', 'Roads & Infrastructure'],
        'विद्युत विभाग': ['Electricity', 'बिजली', 'Power & Utilities']
      };
      const categories = categoryMapping[req.user.department] || [req.user.department];
      departmentFilter = 'WHERE (assigned_department = $1 OR problem_categories && $2)';
      queryParams.push(req.user.department, categories);
    }

    // Ward data based on geographic location with department filtering
    const result = await client.query(`
      SELECT 
        CASE 
          WHEN latitude BETWEEN 26.44 AND 26.46 THEN 'Ward 1 - Civil Lines'
          WHEN latitude BETWEEN 26.46 AND 26.48 THEN 'Ward 2 - Mall Road'
          WHEN latitude BETWEEN 26.48 AND 26.50 THEN 'Ward 3 - Swaroop Nagar'
          WHEN latitude BETWEEN 26.50 AND 26.52 THEN 'Ward 4 - Kidwai Nagar'
          ELSE 'Ward 5 - Other Areas'
        END as name,
        COUNT(*) as total_complaints,
        COUNT(*) FILTER (WHERE status = 'completed') as resolved_complaints,
        COUNT(*) FILTER (WHERE status = 'not completed') as pending_complaints,
        CASE 
          WHEN latitude BETWEEN 26.44 AND 26.46 THEN 75000
          WHEN latitude BETWEEN 26.46 AND 26.48 THEN 85000
          WHEN latitude BETWEEN 26.48 AND 26.50 THEN 65000
          WHEN latitude BETWEEN 26.50 AND 26.52 THEN 90000
          ELSE 55000
        END as population
      FROM problems p
      ${departmentFilter}
      GROUP BY name, population
      ORDER BY name
    `, queryParams);

    // Ensure all numeric values are properly formatted
    const wards = result.rows.map(ward => ({
      ...ward,
      name_en: ward.name, // Add English name
      total_complaints: parseInt(ward.total_complaints) || 0,
      resolved_complaints: parseInt(ward.resolved_complaints) || 0,
      pending_complaints: parseInt(ward.pending_complaints) || 0,
      population: parseInt(ward.population) || 50000
    }));

    res.json({ wards });
  } catch (error) {
    console.error('Get ward analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to get ward analytics', 
      details: error.message,
      wards: [] // Return empty array as fallback
    });
  }
});

// Get Real-time Activity Data (Enhanced)
app.get('/api/analytics/activity', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    let departmentFilter = 'WHERE DATE(created_at) = CURRENT_DATE';
    let queryParams = [];
    
    if (req.user.role === 'department-head') {
      // For department heads, filter by their department
      const categoryMapping = {
        'सफाई विभाग': ['Garbage & Waste Management', 'सफाई और कचरा प्रबंधन', 'Garbage & Waste', 'Garbage & Waste (roadside dumps, no dustbins, poor segregation)', 'Pollution (open garbage burning)'],
        'जल विभाग': ['Water Supply', 'जल आपूर्ति', 'Water & Sanitation'],
        'सड़क विभाग': ['Roads & Transportation', 'सड़क और परिवहन', 'Roads & Infrastructure'],
        'विद्युत विभाग': ['Electricity', 'बिजली', 'Power & Utilities']
      };
      const categories = categoryMapping[req.user.department] || [req.user.department];
      // Use string matching to check categories
      departmentFilter = `WHERE DATE(created_at) = CURRENT_DATE AND (assigned_department = $1 OR 
        problem_categories::text LIKE '%Garbage%' OR 
        problem_categories::text LIKE '%सफाई%' OR
        problem_categories::text LIKE '%Waste%')`;
      queryParams.push(req.user.department);
    }

    const result = await client.query(`
      SELECT 
        EXTRACT(HOUR FROM created_at) as hour,
        COUNT(*) as complaints,
        COUNT(*) FILTER (WHERE status = 'completed') as resolved
      FROM problems 
      ${departmentFilter}
      GROUP BY EXTRACT(HOUR FROM created_at)
      ORDER BY hour
    `, queryParams);

    // Fill in missing hours with 0 values
    const activityData = [];
    for (let hour = 0; hour < 24; hour++) {
      const hourData = result.rows.find(row => parseInt(row.hour) === hour);
      activityData.push({
        time: `${hour.toString().padStart(2, '0')}:00`,
        complaints: hourData ? parseInt(hourData.complaints) || 0 : 0,
        resolved: hourData ? parseInt(hourData.resolved) || 0 : 0
      });
    }

    res.json({ activity: activityData });
  } catch (error) {
    console.error('Get activity analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to get activity analytics', 
      details: error.message,
      activity: [] // Return empty array as fallback
    });
  }
});

// Get Recent Activity Feed (Enhanced)
app.get('/api/analytics/recent-activity', authenticateToken, async (req, res) => {
  try {
    if (!['district-magistrate', 'department-head'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Unauthorized access' });
    }

    const { limit = 20 } = req.query;

    let departmentFilter = '';
    let queryParams = [parseInt(limit.toString())];
    
    if (req.user.role === 'department-head') {
      // For department heads, filter by their department
      const categoryMapping = {
        'सफाई विभाग': ['Garbage & Waste Management', 'सफाई और कचरा प्रबंधन', 'Garbage & Waste', 'Garbage & Waste (roadside dumps, no dustbins, poor segregation)', 'Pollution (open garbage burning)'],
        'जल विभाग': ['Water Supply', 'जल आपूर्ति', 'Water & Sanitation'],
        'सड़क विभाग': ['Roads & Transportation', 'सड़क और परिवहन', 'Roads & Infrastructure'],
        'विद्युत विभाग': ['Electricity', 'बिजली', 'Power & Utilities']
      };
      const categories = categoryMapping[req.user.department] || [req.user.department];
      // Use string matching to check categories
      departmentFilter = `WHERE (p.assigned_department = $2 OR 
        p.problem_categories::text LIKE '%Garbage%' OR 
        p.problem_categories::text LIKE '%सफाई%' OR
        p.problem_categories::text LIKE '%Waste%')`;
      queryParams.push(req.user.department);
    }

    const result = await client.query(`
      SELECT 
        psh.problem_id,
        psh.status,
        psh.notes,
        psh.created_at,
        u.name as updated_by_name,
        p.problem_categories,
        p.others_text
      FROM problem_status_history psh
      JOIN users u ON psh.updated_by_id = u.id
      JOIN problems p ON psh.problem_id = p.id
      ${departmentFilter}
      ORDER BY psh.created_at DESC
      LIMIT $1
    `, queryParams);

    const activities = result.rows.map(row => ({
      id: row.problem_id,
      action: row.status,
      description: row.notes || `Status changed to ${row.status}`,
      user: row.updated_by_name,
      timestamp: row.created_at,
      category: (row.problem_categories && row.problem_categories.length > 0) ? row.problem_categories[0] : 'Other'
    }));

    res.json({ activities });
  } catch (error) {
    console.error('Get recent activity error:', error);
    res.status(500).json({ 
      error: 'Failed to get recent activity', 
      details: error.message,
      activities: [] // Return empty array as fallback
    });
  }
});

// ==================== HEALTH CHECK ROUTE ====================

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ==================== ERROR HANDLING MIDDLEWARE ====================

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== SERVER INITIALIZATION ====================

async function startServer() {
  try {
    await connectDatabase();
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('📋 Available routes:');
      console.log('  🔐 Authentication:');
      console.log('    POST /api/users/register - User registration');
      console.log('    POST /api/users/login - User login');
      console.log('    GET /api/users/:user_id - Get user details');
      console.log('    PUT /api/users/:user_id - Update user profile');
      console.log('    GET /api/users - Get all users (admin)');
      console.log('  🚨 Problem Management:');
      console.log('    POST /api/analyze-image - AI image analysis');
      console.log('    POST /api/problems - Submit problem');
      console.log('    GET /api/problems/user/:user_id - Get user problems');
      console.log('    GET /api/admin/problems - Get all problems (admin)');
      console.log('    POST /api/admin/problems/:id/complete - Mark completed');
      console.log('    POST /api/admin/problems/:id/assign - Assign worker');
      console.log('    PATCH /api/admin/problems/:id - Update problem');
      console.log('    GET /api/problems/:id/history - Get problem history');
      console.log('  👷 Worker Management:');
      console.log('    GET /api/admin/workers - Get all workers');
      console.log('    POST /api/admin/workers - Create worker profile');
      console.log('    PATCH /api/workers/:id/status - Update worker status');
      console.log('  🏢 Department Management:');
      console.log('    GET /api/admin/departments - Get all departments');
      console.log('    POST /api/admin/departments - Create department');
      console.log('    PUT /api/admin/departments/:id - Update department');
      console.log('  🔔 Notifications:');
      console.log('    GET /api/notifications - Get notifications');
      console.log('    POST /api/notifications - Create notification');
      console.log('    PATCH /api/notifications/:id/read - Mark as read');
      console.log('  📊 Analytics (Enhanced):');
      console.log('    GET /api/analytics/dashboard - Dashboard analytics');
      console.log('    GET /api/analytics/departments - Department performance');
      console.log('    GET /api/analytics/workers - Worker performance');
      console.log('    GET /api/analytics/wards - Ward analytics');
      console.log('    GET /api/analytics/activity - Real-time activity');
      console.log('    GET /api/analytics/recent-activity - Recent activity feed');
      console.log('  🏥 Health:');
      console.log('    GET /health - Health check');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  await client.end();
  process.exit(0);
});

startServer();
