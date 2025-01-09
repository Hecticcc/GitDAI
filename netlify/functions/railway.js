const fetch = require('node-fetch').default;

const RAILWAY_API = 'https://backboard.railway.app/api';
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://discordai.net'
];

// Helper to parse multipart form data
async function parseMultipartForm(event) {
  if (!event.body) return null;
  
  const boundary = event.headers['content-type']?.split('boundary=')[1];
  if (!boundary) {
    console.error('No boundary found in content-type');
    return null;
  }

  const parts = event.body.split(`--${boundary}`);
  const formData = new FormData();

  for (const part of parts) {
    if (part.includes('name="deployment"')) {
      let content = part.split('\r\n\r\n')[1];
      if (!content) continue;
      
      // Remove the trailing boundary if it exists
      const boundaryIndex = content.lastIndexOf('\r\n--');
      if (boundaryIndex !== -1) {
        content = content.substring(0, boundaryIndex);
      }
      
      if (content) {
        try {
          formData.append('deployment', new Blob([content], { type: 'application/zip' }), 'deployment.zip');
        } catch (error) {
          console.error('Error creating deployment blob:', error);
          throw new Error('Failed to process deployment file');
        }
      }
    }
  }

  return formData;
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
  if (!railwayToken) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: 'Missing Railway API token' }),
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
    if (event.httpMethod === 'POST' && event.headers['content-type']?.includes('multipart/form-data')) {
      try {
        requestBody = await parseMultipartForm(event);
        if (!requestBody) {
          throw new Error('Failed to parse multipart form data');
        }
      } catch (error) {
        console.error('Form data parsing error:', error);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Failed to process deployment data',
            details: error.message
          })
        };
      }
    }

    // Forward the request to Railway API
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        'Authorization': `Bearer ${railwayToken}`,
        'Content-Type': event.headers['content-type'] || 'application/json',
        'Origin': event.headers.origin || '*'
      },
      body: requestBody
    });

    if (!response.ok) {
      console.error('Railway API error response:', {
        status: response.status,
        statusText: response.statusText
      });
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Railway API request failed',
          status: response.status,
          statusText: response.statusText
        })
      };
    }

    // Get response data
    const data = await response.json();

    // Enhanced response logging
    console.log('Railway API Response:', {
      status: response.status,
      headers: Object.fromEntries(response.headers),
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