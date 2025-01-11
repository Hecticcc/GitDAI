// Remove the require and we'll use dynamic import inside the handler

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

const handler = async (event, context) => {
  const logger = createLogger();
  const { log, logs, requestId } = logger;
  
  // Enhanced request validation and logging
  const validateAndLogRequest = () => {
    const { serverId } = event.queryStringParameters || {};
    
    log('Request Details', {
      method: event.httpMethod,
      path: event.path,
      queryParams: event.queryStringParameters,
      headers: {
        ...event.headers,
        authorization: '[REDACTED]'
      },
      envVars: {
        apiUrl: process.env.PTERODACTYL_API_URL ? '[SET]' : '[NOT SET]',
        apiKey: process.env.PTERODACTYL_API_KEY ? '[SET]' : '[NOT SET]'
      }
    });

    if (!serverId) {
      throw new Error('Server ID is required');
    }

    // Validate server ID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(serverId)) {
      throw new Error('Invalid server ID format. Expected full UUID.');
    }

    return serverId;
  };

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
    // Add Cloudflare-specific headers
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  let serverId;
  try {
    serverId = validateAndLogRequest();
  } catch (error) {
    log('Validation Error', {
      error: error.message,
      requestParams: event.queryStringParameters
    }, 'error');

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({
        error: error.message,
        requestId,
        logs
      })
    };
  }

  // Dynamically import node-fetch
  const { default: fetch } = await import('node-fetch');

  let attempt = 1;
  const maxAttempts = 3;
  let lastError;

  log('Checking Server Status', { 
    serverId,
    apiUrl: `${process.env.PTERODACTYL_API_URL}/api/application/servers/${serverId}`,
    attempt: 1,
    maxAttempts
  });

  while (attempt <= maxAttempts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // Increase timeout to 15 seconds

        const apiUrl = `${process.env.PTERODACTYL_API_URL}/api/application/servers/${serverId}`;
        log('Making API Request', {
          url: apiUrl,
          attempt,
          headers: {
            'User-Agent': 'DiscordAI-Status-Check/1.0',
            'Accept': 'application/json',
            'Authorization': '[REDACTED]'
          }
        });

        // Use the server ID for the API request - Pterodactyl API should handle both short and full IDs
        const response = await fetch(apiUrl,
          {
            method: 'GET',
            headers: {
              'User-Agent': 'DiscordAI-Status-Check/1.0',
              'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
              'Accept': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
              'Expires': '0',
              // Add Cloudflare bypass headers
              'CF-IPCountry': 'US',
              'CF-Connecting-IP': event.headers['client-ip'] || event.headers['x-forwarded-for'] || '127.0.0.1'
            },
            signal: controller.signal
          }
        );

        clearTimeout(timeout);
        
        log('Response Headers', {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          attempt
        });

        // If we get a 502, retry with exponential backoff
        if ((response.status === 502 || response.status === 504 || response.status === 522 || response.status === 524) && attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          log('Retrying after gateway error', { 
            status: response.status,
            attempt, 
            delay,
            remainingAttempts: maxAttempts - attempt,
            cfRay: response.headers.get('cf-ray'),
            cfCache: response.headers.get('cf-cache-status')
          }, 'warn');
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          continue;
        }

        const responseText = await response.text();
        
        // Check if we got an HTML error page
        if (responseText.includes('<!DOCTYPE html>')) {
          const statusCode = response.status;
          const errorMessage = `Received HTML error page instead of JSON response (Status: ${statusCode})`;
          log('HTML Error Page', {
            status: statusCode,
            attempt,
            responsePreview: responseText.substring(0, 200),
            cfRay: response.headers.get('cf-ray'),
            cfCache: response.headers.get('cf-cache-status')
          }, 'error');
          throw new Error(errorMessage);
        }
        let responseData;

        try {
          responseData = JSON.parse(responseText);
        } catch (error) {
          const preview = responseText.substring(0, 100);
          log('Parse Error', {
            error: error.message,
            preview,
            attempt
          }, 'error');
          throw new Error(`Failed to parse response: ${preview}...`);
        }

        if (!response.ok) {
          log('API Error Response', {
            status: response.status,
            error: responseData.error || 'Unknown error',
            attempt
          }, 'error');
          return {
            statusCode: response.status,
            headers,
            body: JSON.stringify({
              error: responseData.error || 'Failed to check server status',
              status: response.status,
              attempt,
              requestId,
              logs
            })
          };
        }

        log('Server Status Retrieved', {
          status: responseData.attributes.status,
          state: responseData.attributes.state,
          installed: responseData.attributes.container?.installed,
          attempt
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            status: responseData.attributes.status,
            state: responseData.attributes.state,
            installed: responseData.attributes.container?.installed,
            requestId,
            logs
          })
        };
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          log('Request Timeout', { attempt }, 'warn');
        } else {
          log('Request Failed', { 
            error: error.message,
            attempt 
          }, 'error');
        }

        if (attempt === maxAttempts) {
          break;
        }

        attempt++;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw lastError || new Error('Failed to check server status after multiple attempts');
  } catch (error) {
    log('Error', {
      message: error.message,
      stack: error.stack,
      attempts: attempt
    }, 'error');

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Failed to check server status',
        message: error.message,
        requestId,
        logs
      })
    };
  }
};

export { handler };