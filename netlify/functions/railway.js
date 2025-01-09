const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const RAILWAY_API = 'https://backboard.railway.app/api/v2';

// Debug utility
const debug = (stage, data) => {
  console.log(`Railway Debug [${stage}]:`, JSON.stringify(data, null, 2));
};

const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://discordai.net'];

// Helper for consistent error responses
const errorResponse = (statusCode, message, details = null) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  },
  body: JSON.stringify({
    error: message,
    ...(details && { details })
  })
});

const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      }
    };
  }

  // Validate auth token
  const token = event.headers.authorization;
  if (!token?.startsWith('Bearer ')) {
    return errorResponse(401, 'Invalid or missing authorization token');
  }

  try {
    // Handle deployment creation
    if (event.httpMethod === 'POST') {
      try {
        debug('Request Body', event.body);
        const { projectId, serviceId, files } = JSON.parse(event.body);

        // Validate required fields
        if (!projectId || !serviceId || !files) {
          throw new Error('Missing required deployment fields');
        }

        debug('Deployment Variables', { projectId, serviceId, files });

        // Format files for Railway's REST API
        const formattedFiles = {};
        for (const [path, content] of Object.entries(files)) {
          formattedFiles[path] = {
            content,
            encoding: 'utf-8'
          };
        }

        // Prepare deployment data
        const requestBody = JSON.stringify({
          files: formattedFiles,
          build: {
            builder: 'NIXPACKS',
            buildCommand: null,
            startCommand: 'npm start'
          }
        });

        // Update URL to use REST API endpoint
        const url = `${RAILWAY_API}/projects/${projectId}/services/${serviceId}/deployments`;

        debug('Request URL', url);
        debug('Request Body', requestBody);

        const requestHeaders = {
          'Authorization': token,
          'Content-Type': 'application/json'
        };

        console.log('Deployment Request:', {
          url,
          method: 'POST',
          fileCount: Object.keys(files).length
        });

        const response = await fetch(url, {
          method: 'POST',
          headers: requestHeaders,
          body: requestBody
        });

        const result = await response.json();

        return {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result)
        };
      } catch (error) {
        console.error('Error creating deployment data:', error);
        return errorResponse(500, 'Failed to create deployment', error.message);
      }
    }

    // Handle GET requests for deployment status
    if (event.httpMethod === 'GET') {
      const deploymentId = event.queryStringParameters?.id;
      const { projectId, serviceId } = event.queryStringParameters;

      if (!deploymentId) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Missing deployment ID' })
        };
      }
      
      // Update URL to use REST API endpoint
      const url = `${RAILWAY_API}/projects/${projectId}/services/${serviceId}/deployments/${deploymentId}`;
      debug('Status Check URL', url);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': token
        }
      });

      const result = await response.json();

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result)
      };
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    console.error('Railway API Error:', error);
    return errorResponse(500, 'Railway API request failed', error.message);
  }
};

exports.handler = handler;