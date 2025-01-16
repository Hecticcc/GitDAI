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
  
  // Add request tracing
  const traceId = event.headers['x-trace-id'] || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Add detailed request logging
  log('Request Details', {
    method: event.httpMethod,
    path: event.path,
    queryParams: event.queryStringParameters,
    traceId,
    headers: Object.fromEntries(Object.entries(event.headers).map(([k, v]) => [k, 
      k.toLowerCase().includes('authorization') ? '[REDACTED]' : v
    ])),
    body: event.body ? JSON.parse(event.body) : null,
    url: event.rawUrl
  }, 'debug');

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
    'X-Request-ID': requestId,
    'X-Trace-ID': traceId
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
      PTERODACTYL_API_URL_VALUE: requiredEnvVars.PTERODACTYL_API_URL?.replace(/\/+$/, ''),
      PTERODACTYL_API_KEY: requiredEnvVars.PTERODACTYL_API_KEY ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_KEY_LENGTH: requiredEnvVars.PTERODACTYL_API_KEY?.length || 0,
      PTERODACTYL_USER_ID: requiredEnvVars.PTERODACTYL_USER_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_EGG_ID: requiredEnvVars.PTERODACTYL_EGG_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_NEST_ID: requiredEnvVars.PTERODACTYL_NEST_ID ? '[SET]' : '[NOT SET]',
      PTERODACTYL_LOCATION_ID: requiredEnvVars.PTERODACTYL_LOCATION_ID ? '[SET]' : '[NOT SET]'
    }, 'info');

    // Validate API URL format
    try {
      const apiUrl = new URL(requiredEnvVars.PTERODACTYL_API_URL);
      
      // Clean up URL path
      const cleanPath = apiUrl.pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
      
      // Check if path contains /api
      if (!cleanPath.includes('/api')) {
        log('API URL Validation Failed', {
          url: apiUrl.toString(),
          path: cleanPath,
          hostname: apiUrl.hostname
        }, 'error');
        throw new Error('Invalid API URL format - must include /api in path');
      }
      
      // Ensure protocol is https
      if (apiUrl.protocol !== 'https:') {
        log('API URL Protocol Invalid', {
          url: apiUrl.toString(),
          protocol: apiUrl.protocol,
          hostname: apiUrl.hostname
        }, 'error');
        throw new Error('Invalid API URL format - must use HTTPS');
      }
      
      log('API URL Validation', {
        original: requiredEnvVars.PTERODACTYL_API_URL,
        parsed: {
          protocol: apiUrl.protocol,
          hostname: apiUrl.hostname,
          pathname: apiUrl.pathname,
          href: apiUrl.href
        }
      }, 'debug');
    } catch (error) {
      log('API URL Validation Error', {
        error: error.message,
        url: requiredEnvVars.PTERODACTYL_API_URL
      }, 'error');
      throw new Error('Invalid API URL configuration');
    }

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

    // Handle DELETE requests for server deletion
    if (event.httpMethod === 'DELETE') {
      // Validate server ID format
      const serverId = event.queryStringParameters?.serverId;
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      
      if (!serverId || !uuidRegex.test(serverId)) {
        log('Invalid Server ID Format', {
          serverId,
          valid: false,
          reason: !serverId ? 'Missing server ID' : 'Invalid UUID format'
        }, 'error');
        
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error: 'Invalid server ID format - must be a valid UUID',
            requestId,
            logs
          })
        };
      }
      
      const baseUrl = process.env.PTERODACTYL_API_URL.replace(/\/+$/, '');
      const apiUrl = `${baseUrl}/api/application/servers/${serverId.toLowerCase()}`;
      
      log('Delete Request Parameters', {
        serverId,
        apiUrl,
        traceId,
        hasApiKey: !!process.env.PTERODACTYL_API_KEY
      });

      // Log the delete request
      log('Delete Request', {
        serverId,
        url: apiUrl,
        method: 'DELETE',
        headers: {
          'Authorization': '[REDACTED]',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'DiscordAI-Bot/1.0',
          'X-Trace-ID': traceId
        }
      });

      // Add timeout and retry logic for delete request
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);

      let deleteResponse;
      let attempt = 1;
      const maxAttempts = 3;

      while (attempt <= maxAttempts) {
        try {
          deleteResponse = await fetch(apiUrl, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${requiredEnvVars.PTERODACTYL_API_KEY}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'DiscordAI-Bot/1.0',
              'X-Trace-ID': traceId,
              'Cache-Control': 'no-cache'
            },
            signal: controller.signal
          });

          // Break if successful or non-retriable error
          if (deleteResponse.ok || ![502, 503, 504].includes(deleteResponse.status)) {
            break;
          }

          // Log retry attempt
          log('Delete Retry', {
            attempt,
            status: deleteResponse.status,
            statusText: deleteResponse.statusText,
            traceId
          }, 'warn');

          // Wait before retrying
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          }

        } catch (error) {
          log('Delete Attempt Error', {
            attempt,
            error: error.message,
            traceId
          }, 'error');

          if (attempt === maxAttempts) {
            throw error;
          }
        }

        attempt++;
      }

      clearTimeout(timeout);

      if (!deleteResponse) {
        throw new Error('Failed to connect to Pterodactyl API after multiple attempts');
      }

      const response = await fetch(
        apiUrl,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${requiredEnvVars.PTERODACTYL_API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'DiscordAI-Bot/1.0',
            'X-Trace-ID': traceId,
            'Cache-Control': 'no-cache'
          }
        }
      );

      // Log the response
      log('Delete Response', {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        url: response.url,
        traceId
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        let errorDetails = {};
        
        try {
          if (response.status === 404) {
            // Server is already gone, return success
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                success: true,
                message: 'Server already deleted',
                requestId,
                traceId
              })
            };
          } else {
            const errorData = JSON.parse(errorText);
            errorDetails = errorData;
            errorMessage = errorData.errors?.[0]?.detail || errorData.message || 'Unknown error';
          }
        } catch {
          errorMessage = errorText || `${response.status} ${response.statusText}`;
        }

        log('Delete Error Response', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          error: errorMessage,
          details: errorDetails
        }, 'error');

        log('Delete Error', {
          status: response.status,
          error: errorMessage,
          text: errorText
        }, 'error');

        return {
          statusCode: response.status,
          headers,
          body: JSON.stringify({
            error: `Failed to delete server: ${errorMessage}`,
            details: errorDetails,
            requestId,
            logs,
            timestamp: new Date().toISOString()
          })
        };
      }

      return {
        statusCode: 204,
        headers,
        body: ''
      };
    }

    // Validate request method
    if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
      log('Method Not Allowed', event.httpMethod, 'error');
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['POST', 'DELETE'],
          requestId,
          logs
        })
      };
    }

    // Parse and validate request body
    let { name, description, userId } = {};
    try {
      const requestData = JSON.parse(event.body || '{}');
      name = requestData.name;
      description = requestData.description;
      userId = requestData.userId;

      if (!name) {
        throw new Error('Server name is required');
      }
      if (!userId) {
        throw new Error('User ID is required');
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
      name: name,
      user: Number(userId),
      docker_image: "ghcr.io/parkervcp/yolks:nodejs_21",
      egg: Number(process.env.PTERODACTYL_EGG_ID),
      startup: "if [[ -d .git ]] && [[ {{AUTO_UPDATE}} == \"1\" ]]; then git pull; fi; if [[ ! -z ${NODE_PACKAGES} ]]; then /usr/local/bin/npm install ${NODE_PACKAGES}; fi; if [[ ! -z ${UNNODE_PACKAGES} ]]; then /usr/local/bin/npm uninstall ${UNNODE_PACKAGES}; fi; if [ -f /home/container/package.json ]; then /usr/local/bin/npm install; fi; if [[ \"${MAIN_FILE}\" == \"*.js\" ]]; then /usr/local/bin/node \"/home/container/${MAIN_FILE}\" ${NODE_ARGS}; else /usr/local/bin/ts-node --esm \"/home/container/${MAIN_FILE}\" ${NODE_ARGS}; fi",
      environment: {
        SERVER_SCRIPT: "bot.js",
        DISCORD_TOKEN: "{{DISCORD_TOKEN}}",
        STARTUP_FILE: "bot.js",
        REPO_URL: "",
        USER_UPLOAD: "1",
        AUTO_UPDATE: "0",
        MAIN_FILE: "bot.js"
      },
      limits: {
        memory: 512,
        swap: 0,
        disk: 1024,
        io: 500,
        cpu: 100
      },
      feature_limits: {
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
      description: description || 'Discord bot server',
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

    // Add proper request options
    const requestOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${requiredEnvVars.PTERODACTYL_API_KEY}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify(serverData),
      signal: controller.signal,
      redirect: 'follow',
      follow: 5 // Maximum number of redirects to follow
    };

    log('Request Options', {
      ...requestOptions,
      headers: {
        ...requestOptions.headers,
        'Authorization': '[REDACTED]'
      }
    });

    const response = await fetch(`${requiredEnvVars.PTERODACTYL_API_URL}/application/servers`, {
      ...requestOptions
    });

    clearTimeout(timeout);

    // Try to get response text first
    const responseText = await response.text();
    let responseData;
    let parsedResponse = false;
    
    log('Raw Response', {
      status: response.status,
      statusText: response.statusText,
      type: response.type,
      redirected: response.redirected,
      url: response.url,
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
      let errorMessage, errorCode;

      if (response.status === 502) {
        errorCode = 'BAD_GATEWAY';
        errorMessage = 'Unable to reach Pterodactyl API. Please check the API endpoint configuration.';
      } else if (response.status === 500) {
        errorCode = 'INTERNAL_SERVER_ERROR';
        errorMessage = `Pterodactyl server error: ${responseData.error || responseText.substring(0, 100)}`;
      } else if (response.status === 401) {
        errorCode = 'UNAUTHORIZED';
        errorMessage = 'Invalid or missing API credentials';
      } else if (response.status === 422) {
        errorCode = 'VALIDATION_ERROR';
        errorMessage = `Invalid server configuration: ${responseData.errors?.join(', ') || 'Unknown validation error'}`;
      } else if (response.status === 301 || response.status === 302 || response.status === 307 || response.status === 308) {
        errorCode = 'REDIRECT_ERROR';
        errorMessage = 'Unexpected redirect occurred. Please check the API URL configuration.';
      } else {
        errorCode = 'UNKNOWN_ERROR';
        errorMessage = 'Failed to create server';
      }

      const errorDetails = {
        code: errorCode,
        status: response.status,
        statusText: response.statusText,
        message: errorMessage,
        redirected: response.redirected,
        redirectUrl: response.redirected ? response.url : undefined,
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