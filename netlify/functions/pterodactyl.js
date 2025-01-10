// Enhanced debug logging with timestamps and request IDs
function createLogger() {
  const logs = [];
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);

  return {
    logs,
    requestId,
    log: (stage, data, level = 'info') => {
      const entry = {
        timestamp: new Date().toISOString(),
        requestId,
        stage,
        level,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      };
      logs.push(entry);
      console.log(`[${entry.timestamp}] [${level.toUpperCase()}] [${requestId}] ${stage}:`, data);
      return entry;
    }
  };
}

// Required environment variables
const requiredEnvVars = {
  PTERODACTYL_API_URL: process.env.PTERODACTYL_API_URL,
  PTERODACTYL_API_KEY: process.env.PTERODACTYL_API_KEY,
  PTERODACTYL_USER_ID: process.env.PTERODACTYL_USER_ID,
  PTERODACTYL_EGG_ID: process.env.PTERODACTYL_EGG_ID,
  PTERODACTYL_NEST_ID: process.env.PTERODACTYL_NEST_ID,
  PTERODACTYL_LOCATION_ID: process.env.PTERODACTYL_LOCATION_ID
};

// Validate environment variables
function validateEnvironment(log) {
  const issues = [];
  
  // Check for missing variables
  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value) {
      issues.push(`Missing ${key}`);
    }
  }
  
  // Validate API URL format
  if (requiredEnvVars.PTERODACTYL_API_URL) {
    try {
      new URL(requiredEnvVars.PTERODACTYL_API_URL);
    } catch (e) {
      issues.push('Invalid PTERODACTYL_API_URL format');
    }
  }
  
  // Validate API key format (should be at least 32 chars)
  if (requiredEnvVars.PTERODACTYL_API_KEY && requiredEnvVars.PTERODACTYL_API_KEY.length < 32) {
    issues.push('PTERODACTYL_API_KEY appears to be invalid (too short)');
  }
  
  // Validate numeric values
  ['PTERODACTYL_USER_ID', 'PTERODACTYL_EGG_ID', 'PTERODACTYL_NEST_ID', 'PTERODACTYL_LOCATION_ID'].forEach(key => {
    if (requiredEnvVars[key] && isNaN(Number(requiredEnvVars[key]))) {
      issues.push(`${key} must be a number`);
    }
  });
  
  if (issues.length > 0) {
    log('Environment Validation Failed', { issues }, 'error');
  }
  
  return issues;
}

const handler = async (event, context) => {
  const logger = createLogger();
  const { log, logs, requestId } = logger;

  // Always return proper CORS headers for all responses
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  
  const headers = {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'X-Request-ID': requestId
  };

  try {
    // Dynamically import node-fetch
    const { default: fetch } = await import('node-fetch');

    // Handle preflight requests first
    if (event.httpMethod === 'OPTIONS') {
      log('Handling CORS Preflight', {
        method: event.httpMethod,
        headers: event.headers
      }, 'info');

      return {
        statusCode: 204,
        headers: corsHeaders,
        body: ''
      };
    }

    // Handle test requests
    const isTest = event.queryStringParameters?.test === 'true' || 
                   (event.body && JSON.parse(event.body)?.isTest === true);
    
    if (isTest) {
      log('Test Request Received', { 
        isTest,
        method: event.httpMethod,
        headers: event.headers,
        queryParams: event.queryStringParameters
      }, 'info');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Test endpoint is working',
          attributes: {
            id: 'test-' + Date.now(),
            name: 'Test Server',
            description: 'Test server response'
          }, 
          requestId,
          logs
        })
      };
    }

    // Log all environment variables (redacted)
    log('Environment Variables', {
      PTERODACTYL_API_URL: requiredEnvVars.PTERODACTYL_API_URL ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_KEY: requiredEnvVars.PTERODACTYL_API_KEY ? '[SET]' : '[NOT SET]',
      PTERODACTYL_USER_ID: requiredEnvVars.PTERODACTYL_USER_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_EGG_ID: requiredEnvVars.PTERODACTYL_EGG_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_NEST_ID: requiredEnvVars.PTERODACTYL_NEST_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_LOCATION_ID: requiredEnvVars.PTERODACTYL_LOCATION_ID ? '[SET]' : '[NOT SET]'
    }, 'info');

    // Validate environment first
    const envIssues = validateEnvironment(log);
    if (envIssues.length > 0) {
      log('Environment Validation Failed', { issues: envIssues }, 'error');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: 'Environment configuration issues detected',
          issues: envIssues,
          requestId,
          logs
        })
      };
    }

    // Validate request method
    if (event.httpMethod !== 'POST') {
      log('Method Not Allowed', event.httpMethod, 'error');
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['POST'],
          requestId,
          logs
        })
      };
    }

    // Parse and validate request body
    let requestData;
    try {
      requestData = JSON.parse(event.body || '{}');
      if (!requestData.name) {
        throw new Error('Server name is required');
      }
    } catch (error) {
      log('Request Validation Error', error.message, 'error');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request data',
          details: error.message,
          requestId,
          logs
        })
      };
    }

    // Prepare server creation payload
    const serverData = {
      name: requestData.name,
      user: Number(process.env.PTERODACTYL_USER_ID),
      egg: Number(process.env.PTERODACTYL_EGG_ID),
      docker_image: "ghcr.io/pterodactyl/yolks:nodejs_18",
      startup: "node {{SERVER_SCRIPT}}",
      environment: {
        SERVER_SCRIPT: "bot.js",
        DISCORD_TOKEN: "{{DISCORD_TOKEN}}"
      },
      limits: requestData.limits || {
        memory: 512,
        swap: 0,
        disk: 1024,
        io: 500,
        cpu: 100
      },
      feature_limits: requestData.feature_limits || {
        databases: 0,
        backups: 0,
        allocations: 1
      },
      deploy: {
        locations: [Number(process.env.PTERODACTYL_LOCATION_ID)],
        dedicated_ip: false,
        port_range: []
      },
      start_on_completion: true,
      skip_scripts: false,
      oom_disabled: false,
      description: requestData.description || 'Discord bot server',
      nest: Number(process.env.PTERODACTYL_NEST_ID)
    };

    // Log outgoing request
    log('Outgoing Request', {
      url: `${requiredEnvVars.PTERODACTYL_API_URL}/application/servers`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer [REDACTED]',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: serverData
    });

    // Make request to Pterodactyl API
    log('Making API Request', {
      url: `${requiredEnvVars.PTERODACTYL_API_URL}/application/servers`,
      method: 'POST'
    });

    // Add timeout to the fetch request
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    const response = await fetch(`${requiredEnvVars.PTERODACTYL_API_URL}/application/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${requiredEnvVars.PTERODACTYL_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(serverData),
      signal: controller.signal
    });

    clearTimeout(timeout);

    // Try to get response text first
    const responseText = await response.text();
    let responseData;
    let parsedResponse = false;
    
    log('Raw Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: responseText.substring(0, 1000) + (responseText.length > 1000 ? '...' : '')
    });
    
    try {
      responseData = JSON.parse(responseText);
      parsedResponse = true;
      log('Parsed Response', responseData);
    } catch (error) {
      log('Response Parsing Error', {
        text: responseText,
        error: error.message
      }, 'error');
      
      // Try to extract error message from HTML response
      const htmlErrorMatch = responseText.match(/<pre>(.*?)<\/pre>/s);
      const extractedError = htmlErrorMatch ? htmlErrorMatch[1].trim() : null;
      
      responseData = { 
        error: 'Invalid JSON response from Pterodactyl API', 
        rawResponse: extractedError || responseText.substring(0, 1000),
        parseError: error.message 
      };
    }

    // Log API response
    log('API Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers),
      body: parsedResponse ? responseData : { error: 'Failed to parse response' },
      rawResponse: responseText
    }, response.ok ? 'info' : 'error');

    // Handle API errors
    if (!response.ok) {
      // Check for specific error conditions
      let errorMessage;
      if (response.status === 502) {
        errorMessage = 'Unable to reach Pterodactyl API. Please check the API endpoint configuration.';
      } else if (response.status === 500) {
        errorMessage = `Pterodactyl server error: ${responseData.error || responseText.substring(0, 100)}`;
      } else if (response.status === 401) {
        errorMessage = 'Invalid or missing API credentials';
      } else if (response.status === 422) {
        errorMessage = `Invalid server configuration: ${responseData.errors?.join(', ') || 'Unknown validation error'}`;
      } else {
        errorMessage = 'Failed to create server';
      }

      const errorDetails = {
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        body: parsedResponse ? responseData : { error: 'Unparseable response' },
        rawResponse: responseText,
        url: `${requiredEnvVars.PTERODACTYL_API_URL}/application/servers`
      };
      log('API Error Response', errorDetails, 'error');
      
      // Log environment check
      const envCheck = {
        apiUrlSet: !!requiredEnvVars.PTERODACTYL_API_URL,
        apiKeySet: !!requiredEnvVars.PTERODACTYL_API_KEY,
        apiKeyLength: requiredEnvVars.PTERODACTYL_API_KEY?.length || 0,
        userIdSet: !!requiredEnvVars.PTERODACTYL_USER_ID,
        eggIdSet: !!requiredEnvVars.PTERODACTYL_EGG_ID,
        nestIdSet: !!requiredEnvVars.PTERODACTYL_NEST_ID,
        locationIdSet: !!requiredEnvVars.PTERODACTYL_LOCATION_ID
      };
      
      log('Environment Check', envCheck, 'info');
      
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: errorMessage,
          details: {
            ...errorDetails,
            environmentCheck: envCheck,
            missingEnvVars: Object.entries(requiredEnvVars)
              .filter(([_, value]) => !value)
              .map(([key]) => key)
          },
          requestId,
          logs
        })
      };
    }

    // Return success response
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        data: responseData,
        requestId,
        logs
      })
    };
  } catch (error) {
    // Log and handle unexpected errors
    const errorMessage = error.name === 'AbortError' 
      ? 'Request timed out while connecting to Pterodactyl API'
      : error.message;

    log('Unexpected Error', {
      message: errorMessage,
      stack: error.stack
    }, 'error');

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Internal server error',
        message: errorMessage,
        requestId,
        logs
      })
    };
  }
};

export { handler };