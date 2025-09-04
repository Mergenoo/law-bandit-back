const express = require("express");
const { google } = require("googleapis");
const {
  getCalendarClientFromDatabase,
  formatEventForGoogleCalendar,
  syncEventsToDatabaseFromDatabase,
  getUserConnectionStatusFromDatabase,
  supabase,
} = require("../utils/googleCalendar");

const router = express.Router();

// Get user's connection status
router.get("/connection-status/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const status = await getUserConnectionStatusFromDatabase(userId);

    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("Error checking connection status:", error);
    res.status(500).json({
      error: "Failed to check connection status",
      details: error.message,
    });
  }
});

// Get user's calendars
router.get("/calendars/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const calendar = await getCalendarClientFromDatabase(userId);

    const response = await calendar.calendarList.list({
      maxResults: 100,
      showDeleted: false,
      showHidden: false,
    });

    const calendars = response.data.items.map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      description: cal.description,
      primary: cal.primary,
      accessRole: cal.accessRole,
      backgroundColor: cal.backgroundColor,
      foregroundColor: cal.foregroundColor,
      selected: cal.selected,
    }));

    res.json({
      success: true,
      calendars: calendars,
    });
  } catch (error) {
    console.error("Error fetching calendars:", error);
    res.status(500).json({
      error: "Failed to fetch calendars",
      details: error.message,
    });
  }
});

// Get events from a specific calendar
router.get("/events/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      calendarId = "primary",
      startDate,
      endDate,
      maxResults = 50,
    } = req.query;

    const calendar = await getCalendarClientFromDatabase(userId);

    const timeMin = startDate
      ? new Date(startDate).toISOString()
      : new Date().toISOString();
    const timeMax = endDate
      ? new Date(endDate).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const response = await calendar.events.list({
      calendarId: calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      maxResults: parseInt(maxResults),
      singleEvents: true,
      orderBy: "startTime",
    });

    const events = response.data.items.map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      location: event.location,
      start: event.start,
      end: event.end,
      attendees: event.attendees,
      organizer: event.organizer,
      status: event.status,
      htmlLink: event.htmlLink,
      created: event.created,
      updated: event.updated,
    }));

    res.json({
      success: true,
      events: events,
      nextPageToken: response.data.nextPageToken,
    });
  } catch (error) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      error: "Failed to fetch events",
      details: error.message,
    });
  }
});

// Add event to Google Calendar
router.post("/add-to-google-calendar/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { eventData, calendarId = "primary" } = req.body;

    if (!eventData || !eventData.title || !eventData.due_date) {
      return res.status(400).json({
        error:
          "Missing required fields: eventData.title and eventData.due_date",
      });
    }

    const calendar = await getCalendarClientFromDatabase(userId);

    const event = formatEventForGoogleCalendar(eventData);

    const response = await calendar.events.insert({
      calendarId: calendarId,
      resource: event,
      sendUpdates: "all",
    });

    res.json({
      success: true,
      message: "Event added to Google Calendar successfully",
      eventId: response.data.id,
      eventUrl: response.data.htmlLink,
      data: response.data,
    });
  } catch (error) {
    console.error("Error adding event to Google Calendar:", error);
    res.status(500).json({
      error: "Failed to add event to Google Calendar",
      details: error.message,
    });
  }
});

// Update event in Google Calendar
router.put("/update-event/:eventId/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;
    const { eventData, calendarId = "primary" } = req.body;

    if (!eventData) {
      return res.status(400).json({ error: "Event data is required" });
    }

    const calendar = await getCalendarClientFromDatabase(userId);

    // Parse the due date and time
    const dueDate = new Date(eventData.due_date);
    const startTime = eventData.due_time
      ? new Date(`${eventData.due_date}T${eventData.due_time}`)
      : dueDate;

    const endTime = eventData.due_time
      ? new Date(startTime.getTime() + 60 * 60 * 1000)
      : new Date(dueDate.getTime() + 24 * 60 * 60 * 1000);

    const event = {
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
    };

    const response = await calendar.events.update({
      calendarId: calendarId,
      eventId: eventId,
      resource: event,
      sendUpdates: "all",
    });

    res.json({
      success: true,
      message: "Event updated successfully",
      eventId: response.data.id,
      eventUrl: response.data.htmlLink,
      data: response.data,
    });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({
      error: "Failed to update event",
      details: error.message,
    });
  }
});

// Delete event from Google Calendar
router.delete("/delete-event/:eventId/:userId", async (req, res) => {
  try {
    const { eventId, userId } = req.params;
    const { calendarId = "primary" } = req.query;

    const calendar = await getCalendarClientFromDatabase(userId);

    await calendar.events.delete({
      calendarId: calendarId,
      eventId: eventId,
      sendUpdates: "all",
    });

    res.json({
      success: true,
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting event:", error);
    res.status(500).json({
      error: "Failed to delete event",
      details: error.message,
    });
  }
});

// Sync events from Google Calendar to local database
router.post("/sync-events/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { calendarId = "primary", startDate, endDate } = req.body;

    const result = await syncEventsToDatabaseFromDatabase(
      userId,
      calendarId,
      startDate,
      endDate
    );

    res.json({
      success: true,
      message: `Successfully synced ${result.syncedCount} events`,
      syncedCount: result.syncedCount,
    });
  } catch (error) {
    console.error("Error syncing events:", error);
    res.status(500).json({
      error: "Failed to sync events",
      details: error.message,
    });
  }
});

// Get synced events from local database
router.get("/synced-events/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    let query = supabase
      .from("google_calendar_events")
      .select("*")
      .eq("user_id", userId)
      .order("start_time", { ascending: true });

    if (startDate) {
      query = query.gte("start_time", startDate);
    }

    if (endDate) {
      query = query.lte("start_time", endDate);
    }

    const { data: events, error } = await query;

    if (error) {
      return res.status(500).json({ error: "Failed to fetch synced events" });
    }

    res.json({
      success: true,
      events: events,
    });
  } catch (error) {
    console.error("Error fetching synced events:", error);
    res.status(500).json({
      error: "Failed to fetch synced events",
      details: error.message,
    });
  }
});

// Create a new calendar
router.post("/create-calendar/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { summary, description, timeZone } = req.body;

    if (!summary) {
      return res.status(400).json({ error: "Calendar summary is required" });
    }

    const calendar = await getCalendarClientFromDatabase(userId);

    const calendarResource = {
      summary: summary,
      description: description || "",
      timeZone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    const response = await calendar.calendars.insert({
      resource: calendarResource,
    });

    res.json({
      success: true,
      message: "Calendar created successfully",
      calendarId: response.data.id,
      data: response.data,
    });
  } catch (error) {
    console.error("Error creating calendar:", error);
    res.status(500).json({
      error: "Failed to create calendar",
      details: error.message,
    });
  }
});

// Delete a calendar
router.delete("/delete-calendar/:calendarId/:userId", async (req, res) => {
  try {
    const { calendarId, userId } = req.params;

    const calendar = await getCalendarClientFromDatabase(userId);

    await calendar.calendars.delete({
      calendarId: calendarId,
    });

    res.json({
      success: true,
      message: "Calendar deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting calendar:", error);
    res.status(500).json({
      error: "Failed to delete calendar",
      details: error.message,
    });
  }
});

module.exports = router;
