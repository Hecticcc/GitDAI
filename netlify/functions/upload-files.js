// We'll use dynamic import for node-fetch
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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({
          error: 'Method not allowed',
          allowedMethods: ['POST']
        })
      };
    }

    // Validate environment variables
    if (!process.env.PTERODACTYL_API_URL || !process.env.PTERODACTYL_API_KEY) {
      throw new Error('Missing required environment variables');
    }

    const { serverId, files } = JSON.parse(event.body);

    if (!serverId || !files || !Array.isArray(files)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Invalid request. Required: serverId and files array'
        })
      };
    }

    log('Uploading Files', {
      serverId,
      fileCount: files.length
    });

    // Import node-fetch dynamically
    const { default: fetch } = await import('node-fetch');

    const uploadPromises = files.map(async file => {
      const { path, content } = file;
      
      // Ensure clean URL construction
      const baseUrl = process.env.PTERODACTYL_API_URL.replace(/\/+$/, '');
      const apiUrl = `${baseUrl}/api/client/servers/${serverId}/files/write`;
      
      log('Making API Request', {
        url: apiUrl,
        path,
        contentLength: content.length
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          path,
          raw: content // Send raw content instead of base64
        })
      });

      const responseText = await response.text();
      log('Raw Response', {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: responseText
      });

      if (!response.ok) {
        throw new Error(`Failed to upload ${path}: ${responseText}`);
      }

      return { path, success: true };
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const uploadResults = results.map((result, index) => ({
      path: files[index].path,
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? result.reason.message : null
    }));

    log('Upload Complete', {
      results: uploadResults
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        results: uploadResults,
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
        error: 'Failed to upload files',
        message: error.message,
        requestId,
        logs
      })
    };
  }
};

export { handler };