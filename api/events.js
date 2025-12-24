// Vercel Serverless Function to fetch events from Luma API
// This keeps the API key secure on the server side

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const API_KEY = process.env.LUMA_API_KEY;

  if (!API_KEY) {
    console.error('LUMA_API_KEY environment variable not set');
    return res.status(500).json({ error: 'API configuration error' });
  }

  try {
    // Fetch events from Luma API
    // The calendar/list-events endpoint returns events for your calendar
    const response = await fetch('https://api.lu.ma/public/v1/calendar/list-events', {
      method: 'GET',
      headers: {
        'x-luma-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Luma API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Failed to fetch events from Luma',
        details: errorText
      });
    }

    const data = await response.json();

    // Filter events by CAISH tag if present in the event data
    // Luma events may have tags in different places depending on how they're configured
    let events = data.entries || data.events || [];

    const hasCaishtag = (tags = []) =>
      tags.some(tag =>
        (typeof tag === 'string' && tag.toUpperCase().includes('CAISH')) ||
        (tag && tag.name && tag.name.toUpperCase().includes('CAISH'))
      );

    // Filter for events with CAISH tag (case-insensitive)
    events = events.filter(entry => {
      const event = entry.event || entry;
      const tags = event.tags || [];
      const name = event.name || '';
      const description = event.description || '';

      // Check if CAISH appears in tags, name, or description
      return (
        hasCaishtag(tags) ||
        name.toUpperCase().includes('CAISH') ||
        description.toUpperCase().includes('CAISH')
      );
    });

    // Sort by start time (upcoming first)
    events.sort((a, b) => {
      const dateA = new Date((a.event || a).start_at || (a.event || a).start_time);
      const dateB = new Date((b.event || b).start_at || (b.event || b).start_time);
      return dateA - dateB;
    });

    // Filter to only show upcoming events (or events from the past week for context)
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    events = events.filter(entry => {
      const event = entry.event || entry;
      const startDate = new Date(event.start_at || event.start_time);
      return startDate >= oneWeekAgo;
    });

    // Get limit from query params (for home page showing only 3)
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : null;

    if (limit && limit > 0) {
      events = events.slice(0, limit);
    }

    return res.status(200).json({
      events,
      count: events.length,
      fetched_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching events:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}
