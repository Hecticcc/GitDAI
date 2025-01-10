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

    const response = await fetch(
      `${process.env.PTERODACTYL_API_URL}/api/application/servers/${serverId}`,
      {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
          'Accept': 'application/json'
        }
      }
    );

    const responseData = await response.json();

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
      status: responseData.attributes.status,
      serverName: responseData.attributes.name
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: responseData.attributes.status,
        serverName: responseData.attributes.name,
        requestId,
        logs
      })
    };
  } catch (error) {
    log('Error', {
      message: error.message,
      stack: error.stack
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