const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const { FormData } = require('formdata-node');
const { FormDataEncoder } = require('form-data-encoder');
const { Readable, PassThrough } = require('stream');

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
    // Create a new FormData instance
    const formData = new FormData();
    
    // Convert base64 body to buffer if needed
    const body = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');
    
    const bodyStr = body.toString();
    const parts = bodyStr.split(`--${boundary}`);

    for (const part of parts) {
      if (part.includes('name="deployment"')) {
        const matches = part.match(/Content-Type: ([^\r\n]+)[\r\n]+[\r\n]+([\s\S]*?)(?=[\r\n]*--)/);
        if (matches && matches[2]) {
          const contentType = matches[1].trim();
          const content = matches[2];
          
          // Create a buffer from the content
          const fileBuffer = Buffer.from(content, 'binary');
          
          // Create a Blob with the correct type
          const blob = new Blob([fileBuffer], { type: contentType });
          
          // Append to FormData with filename
          formData.append('deployment', blob, {
            filename: 'deployment.zip',
            contentType: contentType
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
      'Authorization': railwayToken,
      'Content-Type': event.headers['content-type'] || 'application/json'
    };

    if (event.httpMethod === 'POST' && event.headers['content-type']?.includes('multipart/form-data')) {
      requestBody = await parseMultipartForm(event);
      if (!requestBody) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Failed to parse deployment data',
            details: 'Could not process multipart form data'
          })
        };
      }
      
      // Encode FormData for sending
      const encoder = new FormDataEncoder(requestBody);
      const readable = Readable.from(encoder.encode());
      
      requestHeaders = {
        'Authorization': railwayToken,
        'Content-Type': encoder.contentType
      };
      
      requestBody = readable;
    }

    // Forward the request to Railway API
    console.log('Sending request to Railway API:', {
      url,
      method: event.httpMethod
    });

    const response = await fetch(url, {
      method: event.httpMethod,
      headers: {
        ...requestHeaders
      },
      body: requestBody instanceof Readable ? requestBody : 
            typeof requestBody === 'string' ? requestBody :
            JSON.stringify(requestBody)
    }).catch(error => {
      console.error('Fetch error:', error);
      throw error;
    });

    // Log response headers for debugging
    console.log('Railway API Response Headers:', {
      status: response.status,
      headers: Object.fromEntries(response.headers)
    });

    // Get response as buffer first
    const buffer = await response.buffer();
    const responseText = buffer.toString('utf-8');

    console.log('Raw Railway API Response:', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      bodyPreview: responseText.slice(0, 200) // Log first 200 chars
    });

    if (!response.ok) {
      console.error('Railway API error response:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: 'Railway API request failed',
          details: responseText
        })
      };
    }

    // Try to parse JSON response if content type is JSON
    const contentType = response.headers.get('content-type');
    let data;
    if (contentType?.includes('application/json')) {
      try {
        data = JSON.parse(responseText);
      } catch (error) {
        console.error('Failed to parse JSON response:', {
          error: error.message,
          responsePreview: responseText.slice(0, 200)
        });
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({
            error: 'Invalid JSON response from Railway API',
            details: error.message
          })
        };
      }
    } else {
      // For non-JSON responses, return the raw text
      data = { message: responseText };
    }

    // Enhanced response logging
    console.log('Railway API Response:', {
      status: response.status,
      contentType,
      data: typeof data === 'object' ? data : { text: data }
    });

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': contentType || 'application/json'
      },
      body: typeof data === 'object' ? JSON.stringify(data) : data,
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