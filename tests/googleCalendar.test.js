const request = require("supertest");
const app = require("../index");

describe("Google Calendar Integration", () => {
  const testUserId = "test-user-id";

  describe("Authentication", () => {
    test("GET /api/auth/google/url should return OAuth URL", async () => {
      const response = await request(app)
        .get("/api/auth/google/url")
        .expect(200);

      expect(response.body).toHaveProperty("authUrl");
      expect(response.body.authUrl).toContain("accounts.google.com");
    });

    test("GET /api/auth/google/callback should handle OAuth callback", async () => {
      const response = await request(app)
        .get("/api/auth/google/callback?code=test-code&state=" + testUserId)
        .expect(500); // Should fail with invalid code

      expect(response.body).toHaveProperty("error");
    });

    test("GET /api/auth/google/tokens/:userId should return tokens from database", async () => {
      const response = await request(app)
        .get(`/api/auth/google/tokens/${testUserId}`)
        .expect(404); // No tokens in database

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("No tokens found");
    });
  });

  describe("Calendar Management", () => {
    test("GET /api/google-calendar/connection-status/:userId should return connection status", async () => {
      const response = await request(app)
        .get(`/api/google-calendar/connection-status/${testUserId}`)
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("connected");
    });

    test("GET /api/google-calendar/calendars/:userId should require authentication", async () => {
      const response = await request(app)
        .get(`/api/google-calendar/calendars/${testUserId}`)
        .expect(500); // Should fail without tokens in database

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Failed to fetch calendars");
    });
  });

  describe("Event Management", () => {
    test("POST /api/google-calendar/add-to-google-calendar/:userId should require authentication", async () => {
      const response = await request(app)
        .post(`/api/google-calendar/add-to-google-calendar/${testUserId}`)
        .send({
          eventData: {
            title: "Test Event",
            due_date: "2024-01-01",
          },
        })
        .expect(500); // Should fail without tokens in database

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe(
        "Failed to add event to Google Calendar"
      );
    });

    test("POST /api/google-calendar/add-to-google-calendar/:userId should require eventData", async () => {
      const response = await request(app)
        .post(`/api/google-calendar/add-to-google-calendar/${testUserId}`)
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty("error");
    });
  });

  describe("Synchronization", () => {
    test("POST /api/google-calendar/sync-events/:userId should require authentication", async () => {
      const response = await request(app)
        .post(`/api/google-calendar/sync-events/${testUserId}`)
        .send({
          calendarId: "primary",
        })
        .expect(500); // Should fail without tokens in database

      expect(response.body).toHaveProperty("error");
      expect(response.body.error).toBe("Failed to sync events");
    });

    test("GET /api/google-calendar/synced-events/:userId should require userId", async () => {
      const response = await request(app)
        .get(`/api/google-calendar/synced-events/${testUserId}`)
        .expect(200);

      expect(response.body).toHaveProperty("success");
      expect(response.body).toHaveProperty("events");
    });
  });

  describe("Health Check", () => {
    test("GET /health should return server status", async () => {
      const response = await request(app).get("/health").expect(200);

      expect(response.body).toHaveProperty("status");
      expect(response.body).toHaveProperty("timestamp");
      expect(response.body.status).toBe("OK");
    });
  });

  describe("Database-based Authentication Flow", () => {
    test("Should handle complete OAuth flow with database storage", async () => {
      // Test OAuth URL generation
      const urlResponse = await request(app)
        .get("/api/auth/google/url")
        .expect(200);

      expect(urlResponse.body).toHaveProperty("authUrl");

      // Test token refresh endpoint
      const refreshResponse = await request(app)
        .post(`/api/auth/google/refresh/${testUserId}`)
        .expect(404); // No refresh token in database

      expect(refreshResponse.body).toHaveProperty("error");

      // Test disconnect endpoint
      const disconnectResponse = await request(app)
        .delete(`/api/auth/google/disconnect/${testUserId}`)
        .expect(200);

      expect(disconnectResponse.body).toHaveProperty("success");
      expect(disconnectResponse.body.success).toBe(true);
    });
  });
});
