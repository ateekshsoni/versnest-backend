# Backend Overview

This backend is built with Node.js, Express, and MongoDB (via Mongoose). It provides RESTful API endpoints for registering, logging in, fetching profiles, and logging out for both readers and writers. Passwords are securely hashed, and JWT tokens are used for authentication. Input validation is handled using express-validator.

**Main folders:**
- `controllers/`: Handle request logic for each route.
- `models/`: Define Mongoose schemas for Reader and Writer.
- `routes/`: Define API endpoints and validation rules.
- `services/`: Contain business logic for creating users.
- `db/`: Database connection setup.

---

# API Documentation: Reader & Writer Registration

## Reader Registration

- **Endpoint:** `POST /reader/register`
- **Description:** Register a new reader account.

### Request Body
| Field            | Type     | Required | Description                                                      |
|------------------|----------|----------|------------------------------------------------------------------|
| fullName         | String   | Yes      | Full name of the reader.                                         |
| email            | String   | Yes      | Email address (must be valid and unique).                        |
| password         | String   | Yes      | Password (minimum 6 characters).                                 |
| genreFocus       | String   | Yes      | One of: Lyrical, Narrative, Sonnet, Haiku, Fantasy, Free Verse, Other |
| moodPreferences  | String[] | No       | Array of mood preferences: Reflective, Uplifting, Melancholic, Romantic |

#### Example Request
```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "password": "securePass123",
  "genreFocus": "Lyrical",
  "moodPreferences": ["Reflective", "Uplifting"]
}
```

### Validation Rules
- `fullName`: Required, not empty
- `email`: Required, must be valid email
- `password`: Required, min 6 chars
- `genreFocus`: Required, must be one of allowed values
- `moodPreferences`: Optional, if present must be array of allowed strings

### Success Response
- **Status:** 201 Created
- **Body:**
```json
{
  "message": "Reader registered successfully",
  "reader": { /* Reader object */ },
  "token": "<JWT Token>"
}
```

---

## Reader Logout

- **Endpoint:** `GET /reader/logout`
- **Description:** Log out the authenticated reader.
- **Authentication:** Required (JWT token in `Authorization` header or `token` cookie)

### Behavior
- The endpoint blacklists the current token and clears the authentication cookie.
- If you try to log out again with the same token, you will receive a 401 Unauthorized response (token is already blacklisted).
- You must send the token with the logout request, either as a cookie or in the Authorization header.

### Success Response
- **Status:** 200 OK
- **Body:**
```json
{
  "message": "Reader logged out successfully"
}
```

---

## Writer Registration

- **Endpoint:** `POST /writer/register`
- **Description:** Register a new writer account.

### Request Body
| Field      | Type     | Required | Description                                                      |
|------------|----------|----------|------------------------------------------------------------------|
| fullName   | String   | Yes      | Full name of the writer.                                         |
| email      | String   | Yes      | Email address (must be valid and unique).                        |
| password   | String   | Yes      | Password (minimum 6 characters).                                 |
| genreFocus | String[] | Yes      | Array of genres: Lyrical, Narrative, Sonnet, Haiku, Fantasy, Free Verse, Other |
| penName    | String   | No       | Optional pen name.                                               |
| shortBio   | String   | No       | Optional bio (10-500 characters).                                |

#### Example Request
```json
{
  "fullName": "John Smith",
  "email": "john@example.com",
  "password": "writerPass456",
  "genreFocus": ["Fantasy", "Narrative"],
  "penName": "J.S. Writer",
  "shortBio": "Award-winning author of fantasy and narrative poetry."
}
```

### Validation Rules
- `fullName`: Required, not empty
- `email`: Required, must be valid email
- `password`: Required, min 6 chars
- `genreFocus`: Required, must be array of allowed values
- `penName`: Optional, string
- `shortBio`: Optional, string (10-500 chars)

### Success Response
- **Status:** 201 Created
- **Body:**
```json
{
  "message": "Writer registered successfully",
  "writer": { /* Writer object */ },
  "token": "<JWT Token>"
}
```

---

## Writer Logout

- **Endpoint:** `GET /writer/logout`
- **Description:** Log out the authenticated writer.
- **Authentication:** Required (JWT token in `Authorization` header or `token` cookie)

### Behavior
- The endpoint blacklists the current token and clears the authentication cookie.
- If you try to log out again with the same token, you will receive a 401 Unauthorized response (token is already blacklisted).
- You must send the token with the logout request, either as a cookie or in the Authorization header.

### Success Response
- **Status:** 200 OK
- **Body:**
```json
{
  "message": "Writer logged out successfully"
}
```

---

## Notes
- Passwords are securely hashed before storage.
- JWT token is returned for authentication after successful registration and login.
- All endpoints expect and return JSON.
- Logout endpoints require the token to be sent with the request and will return 401 if the token is missing, invalid, or already blacklisted.
