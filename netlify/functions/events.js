// Netlify Function to fetch events from Luma API
// This keeps the API key secure on the server side

const LUMA_EVENTS_URL = 'https://api.lu.ma/public/v1/calendar/list-events';
const CAISH_TAG = 'CAISH';

const normalizeTagName = (tag) => {
  if (typeof tag === 'string') {
    return tag;
  }
  if (tag && typeof tag.name === 'string') {
    return tag.name;
  }
  return '';
};

const extractTagNames = (tags = []) =>
  tags
    .map(normalizeTagName)
    .filter(Boolean)
    .map(tag => tag.toUpperCase());

const hasCaishtag = (tagNames = []) =>
  tagNames.some(tag => tag.includes(CAISH_TAG));

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control': 's-maxage=300, stale-while-revalidate=600'
  };

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const apiKey = process.env.LUMA_API_KEY;

  if (!apiKey) {
    console.error('LUMA_API_KEY environment variable not set');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'API configuration error' })
    };
  }

  try {
    const response = await fetch(LUMA_EVENTS_URL, {
      method: 'GET',
      headers: {
        'x-luma-api-key': apiKey,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Luma API error:', response.status, errorText);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Failed to fetch events from Luma',
          details: errorText
        })
      };
    }

    const data = await response.json();
    let events = data.entries || data.events || [];
    const tagDictionary = new Map();
    const tagList = data.tags || data.tag_list || [];

    tagList.forEach(tag => {
      const id = tag?.api_id || tag?.id;
      const name = normalizeTagName(tag);
      if (id && name) {
        tagDictionary.set(id, name);
      }
    });

    events = events.filter(entry => {
      const eventData = entry.event || entry;
      const directTagNames = extractTagNames(eventData.tags || entry.tags || []);
      const tagIds = eventData.tag_ids || entry.tag_ids || [];
      const resolvedTagNames = tagIds
        .map(tagId => tagDictionary.get(tagId))
        .filter(Boolean)
        .map(name => name.toUpperCase());
      const allTags = [...directTagNames, ...resolvedTagNames];
      const name = eventData.name || '';
      const description = eventData.description || '';

      return (
        hasCaishtag(allTags) ||
        name.toUpperCase().includes(CAISH_TAG) ||
        description.toUpperCase().includes(CAISH_TAG)
      );
    });

    events.sort((a, b) => {
      const dateA = new Date((a.event || a).start_at || (a.event || a).start_time);
      const dateB = new Date((b.event || b).start_at || (b.event || b).start_time);
      return dateA - dateB;
    });

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    events = events.filter(entry => {
      const eventData = entry.event || entry;
      const startDate = new Date(eventData.start_at || eventData.start_time);
      return startDate >= oneWeekAgo;
    });

    const limit = event.queryStringParameters?.limit
      ? Number.parseInt(event.queryStringParameters.limit, 10)
      : null;

    if (limit && limit > 0) {
      events = events.slice(0, limit);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        events,
        count: events.length,
        fetched_at: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Error fetching events:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
