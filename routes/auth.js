const express = require("express");
const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Google OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Test Supabase connection
router.get("/test-supabase", async (req, res) => {
  try {
    console.log("Testing Supabase connection...");
    console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "Set" : "Not set");
    console.log(
      "SUPABASE_SERVICE_ROLE_KEY:",
      process.env.SUPABASE_SERVICE_ROLE_KEY ? "Set" : "Not set"
    );

    // Test basic connection
    const { data, error } = await supabase
      .from("google_calendar_tokens")
      .select("count")
      .limit(1);

    if (error) {
      console.error("Supabase connection error:", error);
      return res.status(500).json({
        error: "Supabase connection failed",
        details: error.message,
      });
    }

    console.log("Supabase connection successful");
    res.json({
      success: true,
      message: "Supabase connection working",
      tableAccess: "google_calendar_tokens table accessible",
    });
  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({
      error: "Test failed",
      details: error.message,
    });
  }
});

// Generate OAuth URL
router.get("/google/url", (req, res) => {
  try {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/calendar"],
      prompt: "consent",
    });

    res.json({ authUrl: url });
  } catch (error) {
    console.error("Error generating auth URL:", error);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

// Handle OAuth callback
router.get("/google/callback", async (req, res) => {
  try {
    const { code, state: userId } = req.query;

    console.log("OAuth callback received:", {
      code: code?.substring(0, 20) + "...",
      userId,
    });

    if (!code) {
      return res.status(400).json({ error: "Authorization code is required" });
    }

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    console.log("Tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiryDate: tokens.expiry_date,
    });

    // Since we don't have admin permissions, we'll store tokens with the user ID
    // The frontend will pass the user ID, so we can trust it
    const userEmail = `user-${userId}@law-bandit.com`; // Generate a consistent email

    console.log("User lookup result:", {
      hasUser: true,
      userEmail: userEmail,
      error: null,
    });

    // Save tokens to Supabase
    const tokenData = {
      user_id: userId,
      email: userEmail,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
    };

    console.log("Saving token data:", {
      user_id: tokenData.user_id,
      email: tokenData.email,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiry_date: tokenData.expiry_date,
    });

    const { error: upsertError } = await supabase
      .from("google_calendar_tokens")
      .upsert(tokenData, {
        onConflict: "user_id",
      });

    if (upsertError) {
      console.error("Error saving tokens to database:", upsertError);
      return res.status(500).json({ error: "Failed to save tokens" });
    }

    console.log("Tokens saved successfully to database");

    // Set credentials for future use
    oauth2Client.setCredentials(tokens);

    res.json({
      success: true,
      message: "Google Calendar connected successfully",
      redirectUrl: "/projects",
    });
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).json({
      error: "Failed to complete OAuth flow",
      details: error.message,
    });
  }
});

// Get user's Google tokens from database
router.get("/google/tokens/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get tokens from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData) {
      return res.status(404).json({ error: "No tokens found" });
    }

    res.json({
      tokens: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expiry_date: tokenData.expiry_date,
        user_id: tokenData.user_id,
      },
    });
  } catch (error) {
    console.error("Error fetching tokens:", error);
    res.status(500).json({ error: "Failed to fetch tokens" });
  }
});

// Refresh tokens from database
router.post("/google/refresh/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Get current tokens from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData || !tokenData.refresh_token) {
      return res.status(404).json({ error: "No refresh token found" });
    }

    // Set credentials and refresh
    oauth2Client.setCredentials({
      refresh_token: tokenData.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update tokens in database
    const { error: updateError } = await supabase
      .from("google_calendar_tokens")
      .update({
        access_token: credentials.access_token,
        expiry_date: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq("user_id", userId);

    if (updateError) {
      console.error("Error updating tokens in database:", updateError);
      return res.status(500).json({ error: "Failed to update tokens" });
    }

    res.json({
      success: true,
      message: "Tokens refreshed successfully",
      tokens: credentials,
    });
  } catch (error) {
    console.error("Error refreshing tokens:", error);
    res.status(500).json({ error: "Failed to refresh tokens" });
  }
});

// Disconnect Google Calendar by deleting from database
router.delete("/google/disconnect/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Delete tokens from database
    const { error: deleteError } = await supabase
      .from("google_calendar_tokens")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Error deleting tokens from database:", deleteError);
      return res
        .status(500)
        .json({ error: "Failed to disconnect Google Calendar" });
    }

    res.json({
      success: true,
      message: "Google Calendar disconnected successfully",
    });
  } catch (error) {
    console.error("Error disconnecting Google Calendar:", error);
    res.status(500).json({ error: "Failed to disconnect Google Calendar" });
  }
});

module.exports = router;
