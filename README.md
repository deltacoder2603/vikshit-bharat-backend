# Civic Issue Reporting Backend API

A Node.js backend service for reporting and managing civic issues with AI-powered image analysis and PostgreSQL storage.

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
  "timestamp": "2025-09-02T11:03:12.396Z"
}
```

---

### 2. User Login
**POST** `/api/users/login`

Authenticate a user.

**Request:**
```bash
curl -X POST http://localhost:3000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "example",
    "password": "example"
  }'
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "name": "Example User",
    "email": "example@example.com",
    "username": "example"
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

### 3. Get User Details
**GET** `/api/users/:user_id`

Get details of a specific user.

**Request:**
```bash
curl -X GET http://localhost:3000/api/users/1
```

**Response:**
```json
{
  "user": {
    "id": 1,
    "name": "Example User",
    "email": "example@example.com",
    "username": "example",
    "address": "123 Main St",
    "phone_number": "+1234567890",
    "created_at": "2025-09-02T10:00:00.000Z",
    "updated_at": "2025-09-02T10:00:00.000Z"
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

### 4. Image Analysis (Route A)
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

### 5. Create Problem Entry (Route B)
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

### 6. Get User's Problems (Route C)
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

### 7. Admin: Get All Problems
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

### 8. Admin: Mark Problem Completed
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
  "id": 1,
  "name": "Example User",
  "email": "example@example.com",
  "username": "example",
  "address": "123 Main St",
  "phone_number": "+1234567890",
  "created_at": "2025-09-02T10:00:00.000Z",
  "updated_at": "2025-09-02T10:00:00.000Z"
}
```

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

The system recognizes the following civic issue categories:
- `Garbage & Waste`
- `Traffic & Roads`
- `Drainage & Sewage`
- `Street Lighting`
- `Water Supply`
- `Electricity`
- `Public Transport`
- `Parks & Recreation`
- `Healthcare`
- `Education`

## 🔧 Technical Details

### Image Storage
- Images are stored as base64 strings in PostgreSQL
- Supported formats: JPEG, PNG, GIF, WebP
- Maximum file size: 10MB

### AI Analysis
- Uses Google Generative AI (Gemini) for image analysis
- Automatically detects civic issues in uploaded images
- Returns relevant problem categories

### Database Schema
- **Users Table**: Stores user information
- **Problems Table**: Stores civic issue reports with base64 image data
- Automatic migration from Google Drive to base64 storage

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

1. **Health Check**: Verify server is running
2. **User Login**: Authenticate user
3. **Image Analysis**: Analyze image for civic issues
4. **Create Problem**: Submit problem report with image
5. **View Problems**: Check user's submitted problems
6. **Admin Review**: Admin views all problems
7. **Mark Complete**: Admin marks problem as resolved

## 🔒 Security Notes

- Images are stored as base64 in the database (consider file size limits)
- No authentication middleware implemented (add as needed)
- Input validation should be enhanced for production use
- Consider rate limiting for image uploads

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
