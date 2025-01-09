const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const FormData = require('form-data');

const RAILWAY_API = 'https://backboard.railway.app/api';
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://discordai.net'
];

// Helper to parse multipart form data
async function parseMultipartForm(event) {
  if (!event.body) return null;
  
  const boundary = event.headers['content-type']?.split('boundary=')[1];
  if (!boundary) return null;

  try {
    const formData = new FormData();
    const parts = event.body.split(`--${boundary}`);

    for (const part of parts) {
      if (part.includes('name="deployment"')) {
        const matches = part.match(/Content-Type: (.*?)\r\n\r\n([\s\S]*?)(?:\r\n--|\Z)/);
        if (matches && matches[2]) {
          const content = Buffer.from(matches[2], 'binary');
          formData.append('deployment', content, {
            filename: 'deployment.zip',
            contentType: 'application/zip'
          });
        }
      }
    }

    return formData;
  } catch (error) {
    console.error('Error parsing multipart form:', error);
    return null;
  }
}

const handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(event.headers.origin) 
      ? event.headers.origin 
      : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  // Handle preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  // Only allow POST and GET requests
  if (!['POST', 'GET'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const railwayToken = event.headers.authorization;
  if (!railwayToken || !railwayToken.startsWith('Bearer ')) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Missing or invalid Railway API token format' }),
    };
  }

  try {
    // Extract the Railway API path from the request
    const path = event.path.replace('/.netlify/functions/railway', '');
    const url = `${RAILWAY_API}${path}`;

    // Enhanced request logging
    console.log('Railway API Request:', {
      method: event.httpMethod,
      url,
      headers: event.headers,
      body: event.body ? JSON.parse(event.body) : undefined
    });

    // Handle form data for POST requests
    let requestBody = event.body;
    let requestHeaders = {
      'Authorization': `Bearer ${railwayToken}`,
      'Content-Type': event.headers['content-type'] || 'application/json',
      'Origin': event.headers.origin || '*'
    };

    if (event.httpMethod === 'POST' && event.headers['content-type']?.includes('multipart/form-data')) {
      requestBody = await parseMultipartForm(event);
      if (!requestBody) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Failed to parse deployment data' })
        };
      }
      // Let FormData set the correct headers including boundary
      requestHeaders = {
        'Authorization': `Bearer ${railwayToken}`,
        ...requestBody.getHeaders()
      };
    }

    // Forward the request to Railway API
    console.log('Sending request to Railway API:', {
      url,
      method: event.httpMethod
    });

    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        ...requestHeaders,
        'User-Agent': 'DiscordAI-Bot/1.0'
      },
      body: requestBody instanceof FormData ? requestBody : JSON.stringify(requestBody)
    });

    // Get response text first to debug
    const responseText = await response.text();
    console.log('Raw Railway API Response:', {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      body: responseText.slice(0, 1000) // Log first 1000 chars to avoid excessive logging
    });

    if (!response.ok) {
      console.error('Railway API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText.slice(0, 1000)
      });
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Railway API request failed',
          status: response.status,
          statusText: response.statusText,
          details: responseText.slice(0, 1000)
        })
      };
    }

    // Try to parse JSON response
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (error) {
      console.error('Failed to parse Railway API response:', {
        error: error.message,
        response: responseText.slice(0, 1000)
      });
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Invalid JSON response from Railway API',
          details: responseText.slice(0, 1000)
        })
      };
    }

    // Enhanced response logging
    console.log('Railway API Response:', {
      status: response.status,
      data
    });

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
    };
  } catch (error) {
    console.error('Railway API proxy error:', error);

    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to proxy request to Railway API',
        details: error.message || 'Unknown error'
      }),
    };
  }
};

exports.handler = handler;