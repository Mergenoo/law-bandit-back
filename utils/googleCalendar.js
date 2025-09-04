const { google } = require("googleapis");
const { createClient } = require("@supabase/supabase-js");

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

/**
 * Get user's Google tokens from database
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User tokens
 */
async function getUserTokensFromDatabase(userId) {
  if (!userId) {
    throw new Error("User ID is required");
  }

  // Get tokens from database
  const { data: tokenData, error: tokenError } = await supabase
    .from("google_calendar_tokens")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (tokenError || !tokenData) {
    throw new Error("No Google tokens found in database");
  }

  // Check if token is expired
  if (tokenData.expiry_date && new Date() > new Date(tokenData.expiry_date)) {
    if (!tokenData.refresh_token) {
      throw new Error("Token expired and no refresh token available");
    }
    return await refreshUserTokensFromDatabase(userId, tokenData.refresh_token);
  }

  return {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: tokenData.expiry_date,
    user_id: tokenData.user_id,
  };
}

/**
 * Refresh user's access token from database
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} New tokens
 */
async function refreshUserTokensFromDatabase(userId, refreshToken) {
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
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
    throw new Error(
      `Failed to update tokens in database: ${updateError.message}`
    );
  }

  return credentials;
}

/**
 * Get authenticated Google Calendar client from database
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Google Calendar client
 */
async function getCalendarClientFromDatabase(userId) {
  const tokens = await getUserTokensFromDatabase(userId);
  oauth2Client.setCredentials(tokens);
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/**
 * Format event data for Google Calendar
 * @param {Object} eventData - Event data
 * @returns {Object} Formatted event for Google Calendar
 */
function formatEventForGoogleCalendar(eventData) {
  const dueDate = new Date(eventData.due_date);
  const startTime = eventData.due_time
    ? new Date(`${eventData.due_date}T${eventData.due_time}`)
    : dueDate;

  const endTime = eventData.due_time
    ? new Date(startTime.getTime() + 60 * 60 * 1000) // 1 hour duration
    : new Date(dueDate.getTime() + 24 * 60 * 60 * 1000); // 1 day duration

  return {
    summary: eventData.title,
    description: eventData.description || "",
    location: eventData.location || "",
    start: {
      dateTime: startTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 24 * 60 }, // 1 day before
        { method: "popup", minutes: 30 }, // 30 minutes before
      ],
    },
  };
}

/**
 * Sync events from Google Calendar to local database using database
 * @param {string} userId - User ID
 * @param {string} calendarId - Calendar ID
 * @param {string} startDate - Start date
 * @param {string} endDate - End date
 * @returns {Promise<Object>} Sync result
 */
async function syncEventsToDatabaseFromDatabase(
  userId,
  calendarId,
  startDate,
  endDate
) {
  const calendar = await getCalendarClientFromDatabase(userId);

  const timeMin = startDate
    ? new Date(startDate).toISOString()
    : new Date().toISOString();
  const timeMax = endDate
    ? new Date(endDate).toISOString()
    : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const response = await calendar.events.list({
    calendarId: calendarId,
    timeMin: timeMin,
    timeMax: timeMax,
    maxResults: 2500,
    singleEvents: true,
    orderBy: "startTime",
  });

  const events = response.data.items;

  // Store events in local database
  const eventsToInsert = events.map((event) => ({
    user_id: userId,
    class_id: null, // Google Calendar events don't have a specific class
    title: event.summary || "Untitled Event",
    description: event.description || "",
    event_type: "google_calendar", // Mark as Google Calendar event
    due_date: event.start.dateTime ? new Date(event.start.dateTime).toISOString().split('T')[0] : event.start.date,
    due_time: event.start.dateTime ? new Date(event.start.dateTime).toISOString().split('T')[1].substring(0, 5) : null,
    confidence_score: 1.0, // High confidence for Google Calendar events
    source_text: `Google Calendar Event: ${event.summary}`,
    created_at: new Date().toISOString(),
  }));

  // Upsert events to avoid duplicates
  const { error: insertError } = await supabase
    .from("calendar_events")
    .upsert(eventsToInsert, {
      onConflict: "user_id,title,due_date",
    });

  if (insertError) {
    throw new Error(
      `Failed to sync events to database: ${insertError.message}`
    );
  }

  return {
    syncedCount: events.length,
    events: events,
  };
}

/**
 * Get user's connection status from database
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Connection status
 */
async function getUserConnectionStatusFromDatabase(userId) {
  try {
    if (!userId) {
      return { connected: false };
    }

    // Get tokens from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (tokenError || !tokenData) {
      return { connected: false };
    }

    const isExpired =
      tokenData.expiry_date && new Date() > new Date(tokenData.expiry_date);

    return {
      connected: !isExpired || !!tokenData.refresh_token,
      lastSync: tokenData.expiry_date,
      needsRefresh: isExpired && !!tokenData.refresh_token,
    };
  } catch (error) {
    return { connected: false, error: error.message };
  }
}

module.exports = {
  getUserTokensFromDatabase,
  refreshUserTokensFromDatabase,
  getCalendarClientFromDatabase,
  formatEventForGoogleCalendar,
  syncEventsToDatabaseFromDatabase,
  getUserConnectionStatusFromDatabase,
  supabase,
  oauth2Client,
};
