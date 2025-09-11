const express = require('express');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const { Client } = require('pg');
require('dotenv').config();
const cors = require('cors');

// Configure CORS
const corsOptions = {
  origin: [
    'http://localhost:3000',        // Your local development server
    'http://localhost:5173',        // Vite default port (backup)
    'https://your-frontend-domain.com', // Your production frontend domain
    'https://vikshit-kanpur.vercel.app', // If you deploy frontend to Vercel
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  optionsSuccessStatus: 200
};

const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors(corsOptions));

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

// Image storage configuration - using base64 in PostgreSQL
// No Google Drive dependency needed

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

// Create dummy data
async function createDummyData() {
  try {
    // Clear existing data
    await client.query('DELETE FROM problems');
    await client.query('DELETE FROM users');
    
    // Create 10 dummy users
    const users = [
      ['John Doe', 'john@example.com', '1234567890', '123456789012', 'password123', '123 Main St, City'],
      ['Jane Smith', 'jane@example.com', '2345678901', '234567890123', 'password123', '456 Oak Ave, City'],
      ['Mike Johnson', 'mike@example.com', '3456789012', '345678901234', 'password123', '789 Pine Rd, City'],
      ['Sarah Wilson', 'sarah@example.com', '4567890123', '456789012345', 'password123', '321 Elm St, City'],
      ['David Brown', 'david@example.com', '5678901234', '567890123456', 'password123', '654 Maple Dr, City'],
      ['Lisa Davis', 'lisa@example.com', '6789012345', '678901234567', 'password123', '987 Cedar Ln, City'],
      ['Tom Miller', 'tom@example.com', '7890123456', '789012345678', 'password123', '147 Birch St, City'],
      ['Amy Garcia', 'amy@example.com', '8901234567', '890123456789', 'password123', '258 Spruce Ave, City'],
      ['Chris Martinez', 'chris@example.com', '9012345678', '901234567890', 'password123', '369 Willow Rd, City'],
      ['Emma Rodriguez', 'emma@example.com', '0123456789', '012345678901', 'password123', '741 Ash Blvd, City']
    ];
    
    for (const user of users) {
      await client.query(`
        INSERT INTO users (name, email, phone_number, aadhar, password, address)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, user);
    }
    
    // Get user IDs
    const userResult = await client.query('SELECT id FROM users ORDER BY id');
    const userIds = userResult.rows.map(row => row.id);
    
    // Create 10 dummy problems with location data
    const problems = [
      [userIds[0], ['Garbage & Waste'], 'Pile of garbage on street corner', 26.4499, 80.3319, 'not completed'],
      [userIds[1], ['Traffic & Roads'], 'Pothole on main road causing traffic', 26.4501, 80.3321, 'not completed'],
      [userIds[2], ['Water & Sanitation'], 'Water leak from broken pipe', 26.4503, 80.3323, 'completed'],
      [userIds[3], ['Drainage & Sewage'], 'Blocked drain causing water logging', 26.4505, 80.3325, 'not completed'],
      [userIds[4], ['Street Lighting'], 'Street light not working at night', 26.4507, 80.3327, 'not completed'],
      [userIds[5], ['Garbage & Waste', 'Traffic & Roads'], 'Garbage truck blocking traffic', 26.4509, 80.3329, 'not completed'],
      [userIds[6], ['Water & Sanitation'], 'No water supply for 2 days', 26.4511, 80.3331, 'completed'],
      [userIds[7], ['Drainage & Sewage'], 'Sewage overflow near residential area', 26.4513, 80.3333, 'not completed'],
      [userIds[8], ['Street Lighting'], 'Multiple street lights not working', 26.4515, 80.3335, 'not completed'],
      [userIds[9], ['Garbage & Waste'], 'Garbage collection not happening regularly', 26.4517, 80.3337, 'not completed']
    ];
    
    // Create a simple base64 image for all problems
    const dummyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    for (const problem of problems) {
      await client.query(`
        INSERT INTO problems (user_id, problem_categories, others_text, user_image_base64, user_image_mimetype, latitude, longitude, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [problem[0], problem[1], problem[2], dummyImageBase64, 'image/png', problem[3], problem[4], problem[5]]);
    }
    
    console.log('Dummy data created successfully');
  } catch (error) {
    console.error('Error creating dummy data:', error);
    throw error;
  }
}

// Initialize database tables
async function initializeDatabase() {
  try {
    // Check if users table exists and its structure
    const usersTableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'users'
      );
    `);

    if (usersTableExists.rows[0].exists) {
      // Table exists, check if it has aadhar column
      const columns = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'users' AND table_schema = 'public';
      `);
      
      const columnNames = columns.rows.map(row => row.column_name);
      
      if (!columnNames.includes('aadhar')) {
        // Add aadhar column and update constraints
        console.log('Adding aadhar column to existing users table...');
        await client.query(`ALTER TABLE users ADD COLUMN aadhar VARCHAR(12)`);
        await client.query(`ALTER TABLE users ADD CONSTRAINT users_aadhar_unique UNIQUE (aadhar)`);
        await client.query(`ALTER TABLE users ALTER COLUMN phone_number SET NOT NULL`);
        await client.query(`ALTER TABLE users ALTER COLUMN aadhar SET NOT NULL`);
        
        // Remove username column if it exists
        if (columnNames.includes('username')) {
          await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS username`);
        }
        
        console.log('Users table migration completed successfully');
      } else {
        console.log('Users table already has aadhar column');
      }
    } else {
      // Create new Users table
      await client.query(`
        CREATE TABLE users (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          phone_number VARCHAR(20) UNIQUE NOT NULL,
          aadhar VARCHAR(12) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          address TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created new users table with aadhar column');
    }

    // Check if problems table exists and its structure
    const tableExists = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'problems'
      );
    `);

    if (tableExists.rows[0].exists) {
      // Table exists, check if it has old columns
      const columns = await client.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'problems' AND table_schema = 'public';
      `);
      
      const columnNames = columns.rows.map(row => row.column_name);
      
      if (columnNames.includes('user_image_drive_url')) {
        // Old schema exists, migrate it
        console.log('Migrating from old schema to new base64 schema...');
        
        // Drop and recreate the problems table with mandatory location
        await client.query(`DROP TABLE IF EXISTS problems CASCADE`);
        
        await client.query(`
          CREATE TABLE problems (
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
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        
        console.log('Database migration completed successfully');
      } else {
        // New schema already exists
        console.log('Database already has new schema');
      }
    } else {
      // Create new table with base64 schema and mandatory location
      await client.query(`
        CREATE TABLE problems (
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
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('Created new problems table with base64 schema');
    }

    // Create initial users and dummy data
    await createDummyData();

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// Convert image buffer to base64 for PostgreSQL storage
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

// Route A: Image Analysis
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
    
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

// Route B: Create Problem Entry
app.post('/api/problems', upload.single('image'), async (req, res) => {
  try {
    const { user_id, problem_categories, others_text, latitude, longitude } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    if (!user_id || !problem_categories || !latitude || !longitude) {
      return res.status(400).json({ error: 'user_id, problem_categories, latitude, and longitude are required' });
    }

    // Validate location data (now mandatory)
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

    // Convert image to base64 for database storage
    const imageData = convertImageToBase64(req.file.buffer, req.file.mimetype);

    // Insert into database
    const result = await client.query(`
      INSERT INTO problems (user_id, problem_categories, others_text, user_image_base64, user_image_mimetype, latitude, longitude, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [user_id, categoriesArray, others_text || null, imageData.base64, imageData.mimeType, lat, lng, 'not completed']);

    res.json({ 
      message: 'Problem created successfully', 
      problem: result.rows[0] 
    });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ error: 'Failed to create problem entry', details: error.message });
  }
});

// Route C: Fetch User's Problems
app.get('/api/problems/user/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await client.query(`
      SELECT id, user_id, problem_categories, others_text, latitude, longitude, status, created_at, updated_at,
             CASE WHEN user_image_base64 IS NOT NULL THEN 'image_available' ELSE NULL END as user_image_status,
             CASE WHEN admin_image_base64 IS NOT NULL THEN 'image_available' ELSE NULL END as admin_image_status
      FROM problems 
      WHERE user_id = $1 
      ORDER BY created_at DESC
    `, [user_id]);

    res.json({ problems: result.rows });
  } catch (error) {
    console.error('Fetch user problems error:', error);
    res.status(500).json({ error: 'Failed to fetch user problems', details: error.message });
  }
});

// Admin Route 1: Get All Problems
app.get('/api/admin/problems', async (req, res) => {
  try {
    const result = await client.query(`
      SELECT p.id, p.user_id, p.problem_categories, p.others_text, p.latitude, p.longitude, 
             p.status, p.created_at, p.updated_at,
             CASE WHEN p.user_image_base64 IS NOT NULL THEN 'image_available' ELSE NULL END as user_image_status,
             CASE WHEN p.admin_image_base64 IS NOT NULL THEN 'image_available' ELSE NULL END as admin_image_status,
             u.name as user_name, u.email as user_email
      FROM problems p
      JOIN users u ON p.user_id = u.id
      ORDER BY p.created_at DESC
    `);

    res.json({ problems: result.rows });
  } catch (error) {
    console.error('Admin fetch problems error:', error);
    res.status(500).json({ error: 'Failed to fetch all problems', details: error.message });
  }
});

// Admin Route 2: Mark Problem Completed & Upload Image
app.post('/api/admin/problems/:problem_id/complete', upload.single('completed_image'), async (req, res) => {
  try {
    const { problem_id } = req.params;

    if (!req.file) {
      return res.status(400).json({ error: 'Completed image file is required' });
    }

    // Convert completed image to base64 for database storage
    const imageData = convertImageToBase64(req.file.buffer, req.file.mimetype);

    // Update problem status and admin image
    const result = await client.query(`
      UPDATE problems 
      SET status = $1, admin_image_base64 = $2, admin_image_mimetype = $3, updated_at = CURRENT_TIMESTAMP
      WHERE id = $4
      RETURNING *
    `, ['completed', imageData.base64, imageData.mimeType, problem_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json({ 
      message: 'Problem marked as completed successfully', 
      problem: result.rows[0] 
    });
  } catch (error) {
    console.error('Mark problem completed error:', error);
    res.status(500).json({ error: 'Failed to mark problem as completed', details: error.message });
  }
});

// User Registration Route
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, phone_number, aadhar, password } = req.body;

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

    // Validate password length
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

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
      INSERT INTO users (name, email, phone_number, aadhar, password)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, name, email, phone_number, aadhar, created_at
    `, [name, email, phone_number, aadhar, password]);

    res.status(201).json({ 
      message: 'User registered successfully', 
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// User Authentication Routes
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const result = await client.query(`
      SELECT id, name, email, phone_number, aadhar FROM users 
      WHERE email = $1 AND password = $2
    `, [email, password]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

app.get('/api/users/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    const result = await client.query(`
      SELECT id, name, email, phone_number, aadhar, address, created_at, updated_at 
      FROM users WHERE id = $1
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

// Health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize database and start server
async function startServer() {
  try {
    await connectDatabase();
    await initializeDatabase();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('📋 Available routes:');
      console.log('  POST /api/analyze-image - Analyze civic issues in image');
      console.log('  POST /api/problems - Create new problem entry');
      console.log('  GET /api/problems/user/:user_id - Get user\'s problems');
      console.log('  GET /api/admin/problems - Get all problems (admin)');
      console.log('  POST /api/admin/problems/:problem_id/complete - Mark problem completed (admin)');
      console.log('  POST /api/users/register - User registration');
      console.log('  POST /api/users/login - User login');
      console.log('  GET /api/users/:user_id - Get user details');
      console.log('  GET /health - Health check');
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