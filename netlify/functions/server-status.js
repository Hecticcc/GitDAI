const fetch = require('node-fetch');

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
    'X-Request-ID': requestId
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  try {
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
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(
          `${process.env.PTERODACTYL_API_URL}/api/application/servers/${serverId}`,
          {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
              'Accept': 'application/json'
            },
            signal: controller.signal
          }
        );

        clearTimeout(timeout);

        // If we get a 502, retry with exponential backoff
        if (response.status === 502 && attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          log('Retrying after 502', { attempt, delay }, 'warn');
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          continue;
        }

        const responseText = await response.text();
        let responseData;

        try {
          responseData = JSON.parse(responseText);
        } catch (error) {
          throw new Error(`Failed to parse response: ${responseText}`);
        }

        if (!response.ok) {
          log('API Error', responseData, 'error');
          return {
            statusCode: response.status,
            headers,
            body: JSON.stringify({
              error: responseData.error || 'Failed to check server status',
              requestId,
              logs
            })
          };
        }

        log('Server Status Retrieved', {
          status: responseData.attributes.status || responseData.attributes.state,
          serverName: responseData.attributes.name,
          attempt
        });

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            status: responseData.attributes.status || responseData.attributes.state || 'running',
            serverName: responseData.attributes.name,
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