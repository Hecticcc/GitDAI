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

  try {
    // Dynamically import node-fetch
    const { default: fetch } = await import('node-fetch');

    let attempt = 1;
    const maxAttempts = 3;
    let lastError;

    const { serverId } = event.queryStringParameters;

    if (!serverId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Server ID is required',
          requestId,
          logs
        })
      };
    }

    log('Checking Server Status', { serverId });

    while (attempt <= maxAttempts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // Increase timeout to 15 seconds

        const response = await fetch(
          `${process.env.PTERODACTYL_API_URL}/api/client/servers/${serverId}/resources`,
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
          currentState: responseData.attributes.current_state,
          isSuspended: responseData.attributes.is_suspended,
          resources: responseData.attributes.resources,
          attempt
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            status: responseData.attributes.current_state,
            isSuspended: responseData.attributes.is_suspended,
            resources: responseData.attributes.resources,
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