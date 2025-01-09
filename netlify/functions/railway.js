const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const RAILWAY_API = 'https://backboard.railway.app/graphql/v2';
const ALLOWED_ORIGINS = ['http://localhost:5173', 'https://discordai.net'];

// GraphQL Queries
const CREATE_DEPLOYMENT = `
  mutation($projectId: String!, $serviceId: String!, $environmentId: String!, $source: DeploymentSourceInput!) {
    createDeployment(input: {
      projectId: $projectId
      serviceId: $serviceId
      environmentId: $environmentId
      source: $source
    }) {
      deployment {
        id
        status
        url
      }
    }
  }
`;

const GET_DEPLOYMENT = `
  query($id: String!) {
    deployment(id: $id) {
      id
      status
      url
    }
  }
`;

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

// Helper for GraphQL requests
async function graphqlRequest(token, query, variables) {
  const response = await fetch(RAILWAY_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token
    },
    body: JSON.stringify({ query, variables })
  });

  const result = await response.json();

  if (result.errors) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

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
      const { projectId, serviceId, environmentId, files, entrypoint } = JSON.parse(event.body);

      // Validate required fields
      if (!projectId || !serviceId || !environmentId || !files) {
        return errorResponse(400, 'Missing required deployment fields');
      }

      const result = await graphqlRequest(token, CREATE_DEPLOYMENT, {
        projectId,
        serviceId,
        environmentId,
        source: {
          files,
          entrypoint: entrypoint || 'npm start'
        }
      });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.createDeployment)
      };
    }

    // Handle deployment status check
    if (event.httpMethod === 'GET') {
      const deploymentId = event.queryStringParameters?.id;
      if (!deploymentId) {
        return errorResponse(400, 'Missing deployment ID');
      }

      const result = await graphqlRequest(token, GET_DEPLOYMENT, { id: deploymentId });

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(result.deployment)
      };
    }

    return errorResponse(405, 'Method not allowed');

  } catch (error) {
    console.error('Railway API Error:', error);
    return errorResponse(500, 'Railway API request failed', error.message);
  }
};

exports.handler = handler;