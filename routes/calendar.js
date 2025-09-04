const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createClient } = require("@supabase/supabase-js");

const router = express.Router();

// Initialize Google AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Extract calendar events from syllabus content
router.post("/extract-events", async (req, res) => {
  try {
    const { pdf_context } = req.body;

    if (!pdf_context) {
      return res.status(400).json({
        error: "Missing required field: pdf_context",
      });
    }

    console.log("Extracting calendar events from syllabus content...");

    // Create the prompt for event extraction
    const prompt = `
    You are an expert at analyzing academic syllabi and extracting calendar events. 
    Given the following syllabus content, extract all calendar events (assignments, exams, readings, etc.) 
    and return them in a structured JSON format.

    Syllabus Content:
    ${pdf_context}

    Please extract all calendar events and return them in the following JSON format:
    {
      "events": [
        {
          "title": "Event title",
          "description": "Event description or details",
          "event_type": "assignment|exam|reading|other",
          "due_date": "YYYY-MM-DD",
          "due_time": "HH:MM" (optional, null if not specified),
          "confidence_score": 0.95 (confidence in extraction, 0-1),
          "source_text": "exact text from syllabus that led to this extraction"
        }
      ]
    }

    Rules:
    1. Only extract actual calendar events (assignments, exams, readings, etc.)
    2. Convert all dates to YYYY-MM-DD format
    3. If time is mentioned, include it in due_time (HH:MM format)
    4. Set confidence_score based on how clear the event information is
    5. Include the exact text from the syllabus that led to each extraction
    6. If no clear events are found, return an empty events array
    7. Be conservative - only extract events you're confident about

    Return only the JSON object, no additional text.
    `;

    // Generate content using Google AI
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    console.log("AI response received, parsing JSON...");

    // Parse the JSON response
    let extractedData;
    try {
      // Clean the response to extract just the JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error("No JSON found in AI response");
      }
      extractedData = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      console.error("Raw AI response:", text);
      return res.status(500).json({
        error: "Failed to parse AI response",
        details: parseError.message,
      });
    }

    // Validate the extracted data
    if (!extractedData.events || !Array.isArray(extractedData.events)) {
      return res.status(500).json({
        error: "Invalid response format from AI",
        details: "Expected events array not found",
      });
    }

    console.log(`Successfully extracted ${extractedData.events.length} events`);

    res.json({
      message: `Successfully extracted ${extractedData.events.length} calendar events`,
      events: extractedData.events,
      count: extractedData.events.length,
    });
  } catch (error) {
    console.error("Calendar extraction error:", error);
    res.status(500).json({
      error: "Failed to extract calendar events",
      details: error.message,
    });
  }
});

// Get calendar events for a user
router.get("/events/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, eventType } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    let query = supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", userId)
      .order("due_date", { ascending: true });

    if (startDate) {
      query = query.gte("due_date", startDate);
    }

    if (endDate) {
      query = query.lte("due_date", endDate);
    }

    if (eventType) {
      query = query.eq("event_type", eventType);
    }

    const { data: events, error } = await query;

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Failed to fetch calendar events" });
    }

    res.json({
      success: true,
      events: events || [],
    });
  } catch (error) {
    console.error("Error fetching calendar events:", error);
    res.status(500).json({
      error: "Failed to fetch calendar events",
      details: error.message,
    });
  }
});

// Save calendar events to database
router.post("/save-events/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { events, classId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: "Events array is required" });
    }

    console.log(`Saving ${events.length} events for user ${userId}`);

    // Prepare events for database insertion
    const eventsToInsert = events.map((event) => ({
      user_id: userId,
      class_id: classId || null,
      title: event.title,
      description: event.description,
      event_type: event.event_type,
      due_date: event.due_date,
      due_time: event.due_time,
      confidence_score: event.confidence_score,
      source_text: event.source_text,
      created_at: new Date().toISOString(),
    }));

    const { data: insertedEvents, error } = await supabase
      .from("calendar_events")
      .insert(eventsToInsert)
      .select();

    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Failed to save events" });
    }

    console.log(`Successfully saved ${insertedEvents.length} events`);

    res.json({
      success: true,
      message: `Successfully saved ${insertedEvents.length} events`,
      events: insertedEvents,
    });
  } catch (error) {
    console.error("Error saving calendar events:", error);
    res.status(500).json({
      error: "Failed to save calendar events",
      details: error.message,
    });
  }
});

module.exports = router;
