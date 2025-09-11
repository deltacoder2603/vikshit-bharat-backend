# Vikshit Bharat - Civic Issue Reporting Backend API

A comprehensive Node.js backend service for reporting and managing civic issues with AI-powered image analysis, user registration/authentication, and PostgreSQL storage. Built for the Vikshit Bharat initiative to improve civic infrastructure through citizen reporting.

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- PostgreSQL database (Neon recommended)
- Google Generative AI API key

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env` file with the following variables:
```env
PORT=3000
DATABASE_URL=your_postgresql_connection_string
GEMINI_API_KEY=your_google_generative_ai_api_key
```

### Start Server
```bash
npm start
# or for development
npm run dev
```

The server will start on `http://localhost:3000`

## ✨ New Features (Latest Update)

### 🔐 User Registration & Authentication
- **Complete Registration System**: Register with name, email, phone, Aadhar, and password
- **Comprehensive Validation**: All fields validated with proper error messages
- **Email-based Login**: Simplified authentication using email instead of username
- **Unique Constraints**: Prevents duplicate registrations across email, phone, and Aadhar

### 🗄️ Database Improvements
- **Aadhar Integration**: 12-digit Aadhar number support for Indian citizens
- **Schema Migration**: Automatic database migration from old to new schema
- **Enhanced User Model**: Updated user table with all required fields
- **Location Tracking**: Mandatory GPS coordinates for all problem reports

### 🚀 API Enhancements
- **New Registration Endpoint**: `POST /api/users/register`
- **Updated Login**: Now uses email instead of username
- **Enhanced Validation**: Better error messages and field validation
- **Improved Documentation**: Comprehensive API documentation with examples

## 📋 API Endpoints

### 1. Health Check
**GET** `/health`

Check if the server is running.

**Request:**
```bash
curl -X GET http://localhost:3000/health
```

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-09-11T03:16:03.122Z"
}
```

---

### 2. User Registration
**POST** `/api/users/register`

Register a new user with comprehensive validation.

**Request:**
```bash
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "9876543210",
    "aadhar": "123456789012",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": 144,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "9876543210",
    "aadhar": "123456789012",
    "created_at": "2025-09-11T03:16:03.122Z"
  }
}
```

**Validation Rules:**
- **name**: Required string
- **email**: Required, valid email format, unique
- **phone_number**: Required, exactly 10 digits, unique
- **aadhar**: Required, exactly 12 digits, unique
- **password**: Required, minimum 6 characters

**Error Responses:**
```json
{
  "error": "All fields are required: name, email, phone_number, aadhar, password"
}
```
```json
{
  "error": "Invalid email format"
}
```
```json
{
  "error": "Phone number must be exactly 10 digits"
}
```
```json
{
  "error": "Aadhar must be exactly 12 digits"
}
```
```json
{
  "error": "Password must be at least 6 characters long"
}
```
```json
{
  "error": "User already exists with this email, phone, or aadhar"
}
```

---

### 3. User Login
**POST** `/api/users/login`

Authenticate a user using email and password.

**Request:**
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

**Response:**
```json
{
  "user": {
    "id": 144,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "9876543210",
    "aadhar": "123456789012"
  }
}
```

**Error Response:**
```json
{
  "error": "Invalid credentials"
}
```

---

### 4. Get User Details
**GET** `/api/users/:user_id`

Get details of a specific user.

**Request:**
```bash
curl -X GET http://localhost:3000/api/users/144
```

**Response:**
```json
{
  "user": {
    "id": 144,
    "name": "John Doe",
    "email": "john@example.com",
    "phone_number": "9876543210",
    "aadhar": "123456789012",
    "address": "123 Main St, City",
    "created_at": "2025-09-11T03:16:03.122Z",
    "updated_at": "2025-09-11T03:16:03.122Z"
  }
}
```

**Error Response:**
```json
{
  "error": "User not found"
}
```

---

### 5. Image Analysis (Route A)
**POST** `/api/analyze-image`

Analyze an image to detect civic issues using AI.

**Request:**
```bash
curl -X POST http://localhost:3000/api/analyze-image \
  -F "image=@image.png"
```

**Response:**
```json
{
  "categories": ["Garbage & Waste", "Drainage & Sewage"]
}
```

**Error Response:**
```json
{
  "error": "No image provided"
}
```

---

### 6. Create Problem Entry (Route B)
**POST** `/api/problems`

Create a new civic issue report with image.

**Request:**
```bash
curl -X POST http://localhost:3000/api/problems \
  -F "image=@image.png" \
  -F "user_id=1" \
  -F 'problem_categories=["Garbage & Waste", "Traffic & Roads"]' \
  -F "others_text=Garbage pile near main road - urgent attention needed"
```

**Response:**
```json
{
  "message": "Problem created successfully",
  "problem": {
    "id": 2,
    "user_id": 1,
    "problem_categories": ["Garbage & Waste", "Traffic & Roads"],
    "others_text": "Garbage pile near main road - urgent attention needed",
    "user_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "user_image_mimetype": "image/png",
    "admin_image_base64": null,
    "admin_image_mimetype": null,
    "status": "not completed",
    "created_at": "2025-09-02T11:03:12.396Z",
    "updated_at": "2025-09-02T11:03:12.396Z"
  }
}
```

**Error Response:**
```json
{
  "error": "Missing required fields: user_id, problem_categories"
}
```

---

### 7. Get User's Problems (Route C)
**GET** `/api/problems/user/:user_id`

Retrieve all problems reported by a specific user.

**Request:**
```bash
curl -X GET http://localhost:3000/api/problems/user/1
```

**Response:**
```json
{
  "problems": [
    {
      "id": 2,
      "user_id": 1,
      "problem_categories": ["Garbage & Waste", "Traffic & Roads"],
      "others_text": "Garbage pile near main road - urgent attention needed",
      "user_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "user_image_mimetype": "image/png",
      "admin_image_base64": null,
      "admin_image_mimetype": null,
      "status": "not completed",
      "created_at": "2025-09-02T11:03:12.396Z",
      "updated_at": "2025-09-02T11:03:12.396Z"
    }
  ]
}
```

**Error Response:**
```json
{
  "error": "User not found"
}
```

---

### 8. Admin: Get All Problems
**GET** `/api/admin/problems`

Retrieve all problems in the system (admin only).

**Request:**
```bash
curl -X GET http://localhost:3000/api/admin/problems
```

**Response:**
```json
{
  "problems": [
    {
      "id": 2,
      "user_id": 1,
      "problem_categories": ["Garbage & Waste", "Traffic & Roads"],
      "others_text": "Garbage pile near main road - urgent attention needed",
      "user_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
      "user_image_mimetype": "image/png",
      "admin_image_base64": null,
      "admin_image_mimetype": null,
      "status": "not completed",
      "created_at": "2025-09-02T11:03:12.396Z",
      "updated_at": "2025-09-02T11:03:12.396Z"
    }
  ]
}
```

---

### 9. Admin: Mark Problem Completed
**POST** `/api/admin/problems/:problem_id/complete`

Mark a problem as completed with a completion image.

**Request:**
```bash
curl -X POST http://localhost:3000/api/admin/problems/2/complete \
  -F "completed_image=@completion_image.png"
```

**Response:**
```json
{
  "message": "Problem marked as completed",
  "problem": {
    "id": 2,
    "user_id": 1,
    "problem_categories": ["Garbage & Waste", "Traffic & Roads"],
    "others_text": "Garbage pile near main road - urgent attention needed",
    "user_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "user_image_mimetype": "image/png",
    "admin_image_base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "admin_image_mimetype": "image/png",
    "status": "completed",
    "created_at": "2025-09-02T11:03:12.396Z",
    "updated_at": "2025-09-02T11:03:12.396Z"
  }
}
```

**Error Response:**
```json
{
  "error": "Problem not found"
}
```

## 📊 Data Models

### User
```json
{
  "id": 144,
  "name": "John Doe",
  "email": "john@example.com",
  "phone_number": "9876543210",
  "aadhar": "123456789012",
  "password": "hashed_password",
  "address": "123 Main St, City",
  "created_at": "2025-09-11T03:16:03.122Z",
  "updated_at": "2025-09-11T03:16:03.122Z"
}
```

**User Schema:**
- `id`: Auto-incrementing primary key
- `name`: Full name (required)
- `email`: Email address (required, unique, validated)
- `phone_number`: 10-digit phone number (required, unique)
- `aadhar`: 12-digit Aadhar number (required, unique)
- `password`: Hashed password (required, min 6 characters)
- `address`: Optional address field
- `created_at`: Timestamp of creation
- `updated_at`: Timestamp of last update

### Problem
```json
{
  "id": 2,
  "user_id": 1,
  "problem_categories": ["Garbage & Waste", "Traffic & Roads"],
  "others_text": "Additional details about the issue",
  "user_image_base64": "base64_encoded_image_string",
  "user_image_mimetype": "image/png",
  "admin_image_base64": "base64_encoded_completion_image",
  "admin_image_mimetype": "image/png",
  "status": "completed",
  "created_at": "2025-09-02T11:03:12.396Z",
  "updated_at": "2025-09-02T11:03:12.396Z"
}
```

## 🏷️ Problem Categories

The AI system automatically detects the following civic issue categories:
- `Garbage & Waste` - Roadside dumps, no dustbins, poor segregation
- `Traffic & Roads` - Encroachments, potholes, heavy congestion
- `Pollution` - Dirty water bodies, factory emissions, open garbage burning
- `Drainage & Sewage` - Open drains, choked sewers, waterlogging
- `Public Spaces` - Poor toilets, park encroachment, less greenery
- `Housing & Slums` - Unplanned colonies, lack of sanitation & housing
- `Street Lighting` - Broken streetlights, dark areas
- `Other Issues` - Stray animals, no parking, general infrastructure

**Note:** The AI analyzes uploaded images and returns only the categories that are clearly visible in the photo.

## 🔧 Technical Details

### User Authentication & Registration
- **Registration**: Comprehensive validation for all user fields
- **Login**: Email-based authentication (no username required)
- **Validation**: Email format, phone number (10 digits), Aadhar (12 digits)
- **Security**: Password minimum 6 characters, unique constraints on email/phone/aadhar

### Image Storage
- Images are stored as base64 strings in PostgreSQL
- Supported formats: JPEG, PNG, GIF, WebP
- Maximum file size: 50MB (increased from 10MB)
- No external storage dependencies (Google Drive removed)

### AI Analysis
- Uses Google Generative AI (Gemini 2.0 Flash) for image analysis
- Automatically detects civic issues in uploaded images
- Returns relevant problem categories with high accuracy
- Handles various image formats and sizes

### Database Schema
- **Users Table**: Stores user information with Aadhar integration
- **Problems Table**: Stores civic issue reports with base64 image data and GPS coordinates
- **Automatic Migration**: Handles schema updates seamlessly
- **Location Tracking**: Mandatory latitude/longitude for all problem reports

## 🚨 Error Handling

All endpoints return appropriate HTTP status codes:
- `200` - Success
- `400` - Bad Request (missing/invalid parameters)
- `404` - Not Found
- `500` - Internal Server Error

Error responses follow this format:
```json
{
  "error": "Error message description"
}
```

## 📝 Example Workflow

### For Citizens:
1. **Health Check**: Verify server is running
2. **User Registration**: Register with name, email, phone, Aadhar, password
3. **User Login**: Authenticate with email and password
4. **Image Analysis**: Upload image to get AI-detected problem categories
5. **Create Problem**: Submit problem report with image and GPS location
6. **View Problems**: Check your submitted problems and their status

### For Administrators:
1. **Admin Review**: View all problems reported by citizens
2. **Mark Complete**: Upload completion image and mark problem as resolved
3. **Track Progress**: Monitor problem resolution status

### Complete API Flow:
```bash
# 1. Register a new user
curl -X POST http://localhost:3000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com", "phone_number": "9876543210", "aadhar": "123456789012", "password": "password123"}'

# 2. Login
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com", "password": "password123"}'

# 3. Analyze image
curl -X POST http://localhost:3000/api/analyze-image \
  -F "image=@problem_image.jpg"

# 4. Create problem report
curl -X POST http://localhost:3000/api/problems \
  -F "image=@problem_image.jpg" \
  -F "user_id=144" \
  -F 'problem_categories=["Garbage & Waste"]' \
  -F "others_text=Garbage pile blocking the road" \
  -F "latitude=26.4499" \
  -F "longitude=80.3319"

# 5. View user's problems
curl -X GET http://localhost:3000/api/problems/user/144
```

## 🔒 Security Notes

- **Data Validation**: Comprehensive input validation for all user fields
- **Unique Constraints**: Email, phone number, and Aadhar are unique across the system
- **Password Security**: Minimum 6 characters (consider implementing hashing for production)
- **Image Storage**: Images stored as base64 in database (consider file size limits)
- **Location Privacy**: GPS coordinates are mandatory for problem reports
- **Authentication**: Email-based login system (add JWT tokens for production)
- **Rate Limiting**: Consider implementing rate limiting for image uploads and API calls

## 🛠️ Development

### Testing with cURL
All endpoints can be tested using the cURL examples provided above. Make sure to:
- Replace `image.png` with your actual image file
- Use correct user IDs and problem IDs
- Ensure the server is running on the correct port

### Database Migration
The system automatically migrates from Google Drive URLs to base64 storage on startup.

---

**Note**: This API is designed for civic issue reporting and management. Ensure proper authentication and authorization are implemented for production use.
