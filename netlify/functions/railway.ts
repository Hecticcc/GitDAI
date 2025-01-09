import { Handler } from '@netlify/functions';
import fetch from 'node-fetch';

const RAILWAY_API = 'https://backboard.railway.app/api';

// Helper to parse multipart form data
async function parseMultipartForm(event) {
  if (!event.body) return null;
  
  const boundary = event.headers['content-type']?.split('boundary=')[1];
  if (!boundary) return null;

  const parts = event.body.split(`--${boundary}`);
  const formData = new FormData();

  for (const part of parts) {
    if (part.includes('name="deployment"')) {
      const content = part.split('\r\n\r\n')[1]?.split('\r\n--')[0];
      if (content) {
        formData.append('deployment', new Blob([content]), 'deployment.zip');
      }
    }
  }

  return formData;
}

export const handler: Handler = async (event) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
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
      requestBody = await parseMultipartForm(event);
    }

    // Forward the request to Railway API
    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        'Authorization': railwayToken,
        'Content-Type': event.headers['content-type'] || 'application/json'
      },
      body: requestBody,
      redirect: 'follow'
      },
      body: event.body ? event.body : undefined,
    });

    // Get response data
    const data = await response.json();

    // Enhanced response logging
    console.log('Railway API Response:', {
      status: response.status,
      headers: Object.fromEntries(response.headers),
      data
    });
    console.log('Railway API response status:', response.status);

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json',
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
      // Include more detailed error information for debugging
      body: JSON.stringify({ 
        error: 'Failed to proxy request to Railway API',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
}