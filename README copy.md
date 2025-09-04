# Google Calendar Integration for Law Bandit Backend

This backend provides comprehensive Google Calendar integration for the Law Bandit application, allowing users to sync their calendars, manage events, and maintain seamless calendar synchronization.

## Features

- **OAuth 2.0 Authentication**: Secure Google Calendar access using OAuth 2.0 with cookie-based token storage
- **Calendar Management**: List, create, and delete calendars
- **Event Management**: Add, update, delete, and sync events
- **Automatic Token Refresh**: Handles token expiration automatically using cookies
- **Database Synchronization**: Sync events to local database for offline access
- **Connection Status**: Check and manage calendar connection status
- **Secure Cookie Storage**: Tokens stored in HTTP-only cookies for enhanced security

## Setup

### 1. Environment Variables

Add the following environment variables to your `.env` file:

```env
# Google OAuth 2.0 Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Supabase Configuration
SUPABASE_URL=your-supabase-project-url
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

# Server Configuration
PORT=3001
FRONTEND_URL=http://localhost:3000
```

### 2. Google Cloud Console Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth 2.0 Client IDs"
   - Set application type to "Web application"
   - Add authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Copy the Client ID and Client Secret to your environment variables

### 3. Database Setup

Run the migration to create the necessary tables:

```sql
-- Run the migration file: migrations/001_google_calendar_tables.sql
```

## API Endpoints

### Authentication

#### GET `/api/auth/google/url`

Generate OAuth URL for Google Calendar authentication.

**Response:**

```json
{
  "authUrl": "https://accounts.google.com/oauth/authorize?..."
}
```

#### GET `/api/auth/google/callback`

Handle OAuth callback and store tokens.

**Query Parameters:**

- `code`: Authorization code from Google
- `state`: User ID

**Response:**

```json
{
  "success": true,
  "message": "Google Calendar connected successfully",
  "redirectUrl": "/projects"
}
```

#### GET `/api/auth/google/tokens`

Get user's Google tokens from cookies.

**Response:**

```json
{
  "tokens": {
    "access_token": "...",
    "refresh_token": "...",
    "expiry_date": "2024-01-01T00:00:00Z",
    "user_id": "user-id"
  }
}
```

#### POST `/api/auth/google/refresh`

Refresh user's access token from cookies.

**Response:**

```json
{
  "success": true,
  "message": "Tokens refreshed successfully",
  "tokens": {
    "access_token": "...",
    "expiry_date": "2024-01-01T00:00:00Z"
  }
}
```

#### DELETE `/api/auth/google/disconnect`

Disconnect Google Calendar by clearing cookies.

**Response:**

```json
{
  "success": true,
  "message": "Google Calendar disconnected successfully"
}
```

### Calendar Management

#### GET `/api/google-calendar/connection-status`

Check user's Google Calendar connection status from cookies.

**Response:**

```json
{
  "success": true,
  "connected": true,
  "lastSync": "2024-01-01T00:00:00Z",
  "needsRefresh": false
}
```

#### GET `/api/google-calendar/calendars`

Get user's calendars.

**Response:**

```json
{
  "success": true,
  "calendars": [
    {
      "id": "primary",
      "summary": "My Calendar",
      "description": "My primary calendar",
      "primary": true,
      "accessRole": "owner"
    }
  ]
}
```

#### POST `/api/google-calendar/create-calendar`

Create a new calendar.

**Body:**

```json
{
  "summary": "New Calendar",
  "description": "Calendar description",
  "timeZone": "America/New_York"
}
```

#### DELETE `/api/google-calendar/delete-calendar/:calendarId`

Delete a calendar.

### Event Management

#### GET `/api/google-calendar/events`

Get events from a calendar.

**Query Parameters:**

- `calendarId`: Calendar ID (default: "primary")
- `startDate`: Start date (ISO string)
- `endDate`: End date (ISO string)
- `maxResults`: Maximum number of events (default: 50)

**Response:**

```json
{
  "success": true,
  "events": [
    {
      "id": "event-id",
      "summary": "Meeting",
      "description": "Team meeting",
      "start": {
        "dateTime": "2024-01-01T10:00:00Z"
      },
      "end": {
        "dateTime": "2024-01-01T11:00:00Z"
      }
    }
  ]
}
```

#### POST `/api/google-calendar/add-to-google-calendar`

Add event to Google Calendar.

**Body:**

```json
{
  "eventData": {
    "title": "Meeting",
    "description": "Team meeting",
    "due_date": "2024-01-01",
    "due_time": "10:00",
    "location": "Conference Room"
  },
  "calendarId": "primary"
}
```

#### PUT `/api/google-calendar/update-event/:eventId`

Update an existing event.

**Body:**

```json
{
  "eventData": {
    "title": "Updated Meeting",
    "description": "Updated description",
    "due_date": "2024-01-01",
    "due_time": "11:00"
  },
  "calendarId": "primary"
}
```

#### DELETE `/api/google-calendar/delete-event/:eventId`

Delete an event.

**Query Parameters:**

- `calendarId`: Calendar ID (default: "primary")

### Synchronization

#### POST `/api/google-calendar/sync-events`

Sync events from Google Calendar to local database.

**Body:**

```json
{
  "calendarId": "primary",
  "startDate": "2024-01-01",
  "endDate": "2024-12-31"
}
```

#### GET `/api/google-calendar/synced-events`

Get synced events from local database.

**Query Parameters:**

- `startDate`: Start date (optional)
- `endDate`: End date (optional)

## Usage Examples

### Frontend Integration

```javascript
// Get OAuth URL
const response = await fetch("/api/auth/google/url");
const { authUrl } = await response.json();
window.location.href = authUrl;

// Add event to calendar
const eventData = {
  title: "Law Class",
  description: "Constitutional Law",
  due_date: "2024-01-15",
  due_time: "14:00",
  location: "Room 101",
};

const result = await fetch("/api/google-calendar/add-to-google-calendar", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // Important for cookies
  body: JSON.stringify({
    eventData,
    calendarId: "primary",
  }),
});

// Sync events
const syncResult = await fetch("/api/google-calendar/sync-events", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include", // Important for cookies
  body: JSON.stringify({
    calendarId: "primary",
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }),
});
```

## Error Handling

The API returns consistent error responses:

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

Common error scenarios:

- **401 Unauthorized**: User not authenticated
- **400 Bad Request**: Missing required parameters
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server error

## Security

- All endpoints require user authentication via cookies
- Row Level Security (RLS) policies ensure users can only access their own data
- OAuth tokens are securely stored in HTTP-only cookies
- Automatic token refresh prevents expired token issues
- Cookies are configured with secure flags in production

## Development

### Running the Server

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

### Testing

```bash
# Run tests
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
