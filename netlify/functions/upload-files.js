// Enhanced file upload handler for Pterodactyl API with comprehensive debugging
function createLogger() {
  const logs = [];
  const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  const startTime = Date.now();

  return {
    logs,
    requestId,
    log: (stage, data, level = 'info') => {
      const entry = {
        timestamp: new Date().toISOString(),
        requestId,
        stage,
        level,
        duration: Date.now() - startTime,
        data: typeof data === 'object' ? JSON.stringify(data) : data
      };
      logs.push(entry);
      console.log(`[${entry.timestamp}] [${level.toUpperCase()}] [${requestId}] ${stage} (${entry.duration}ms):`, data);
      return entry;
    }
  };
}

// Validate environment variables
function validateEnvironment(log) {
  const required = {
    PTERODACTYL_API_URL: process.env.PTERODACTYL_API_URL,
    PTERODACTYL_API_KEY: process.env.PTERODACTYL_API_KEY,
    PTERODACTYL_CLIENT_API_KEY: process.env.PTERODACTYL_CLIENT_API_KEY
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    log('Environment Validation Failed', { missing }, 'error');
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  try {
    new URL(process.env.PTERODACTYL_API_URL);
  } catch (error) {
    log('Invalid API URL', { url: process.env.PTERODACTYL_API_URL }, 'error');
    throw new Error('Invalid PTERODACTYL_API_URL format');
  }

  log('Environment Validated', {
    apiUrl: process.env.PTERODACTYL_API_URL.replace(/\/+$/, ''),
    apiKeyLength: process.env.PTERODACTYL_API_KEY.length
  });

  return required;
}

// Validate request data
function validateRequest(event, log) {
  if (!event.body) {
    log('Missing Request Body', {}, 'error');
    throw new Error('Request body is required');
  }

  let data;
  try {
    data = JSON.parse(event.body);
    log('Request Data', {
      serverId: data.serverId,
      fileCount: data.files?.length || 0,
      method: event.httpMethod,
      contentType: event.headers['content-type']
    });
  } catch (error) {
    log('Invalid JSON', { error: error.message }, 'error');
    throw new Error('Invalid JSON in request body');
  }

  const { serverId, files } = data;

  if (!serverId) {
    log('Missing Server ID', {}, 'error');
    throw new Error('Server ID is required');
  }

  if (!files || !Array.isArray(files)) {
    log('Invalid Files Array', { files }, 'error');
    throw new Error('Files must be provided as an array');
  }

  // Validate each file object
  files.forEach((file, index) => {
    if (!file.path || typeof file.content !== 'string') {
      log('Invalid File Object', { index, file }, 'error');
      throw new Error(`Invalid file object at index ${index}`);
    }
  });

  return { serverId, files };
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
    // Validate environment and request
    const env = validateEnvironment(log);
    const { serverId, files } = validateRequest(event, log);

    log('Starting File Upload', {
      serverId,
      fileCount: files.length,
      totalSize: files.reduce((acc, f) => acc + f.content.length, 0)
    });

    // Import node-fetch dynamically
    const { default: fetch } = await import('node-fetch');

    const uploadPromises = files.map(async (file, index) => {
      const { path, content } = file;
      const fileRequestId = `${requestId}-file-${index}`;
      
      // Extract actual content if it's a JSON string
      let fileContent = content;
      try {
        const parsed = JSON.parse(content);
        if (parsed.content) {
          fileContent = parsed.content;
        }
      } catch (e) {
        // Content is not JSON, use as is
        fileContent = content;
      }

      // Ensure clean URL construction
      const baseUrl = env.PTERODACTYL_API_URL.replace(/\/+$/, '').replace(/\/api$/, '');
      const apiUrl = `${baseUrl}/api/client/servers/${serverId}/files/write`;
      
      log('Request Details', {
        fileRequestId,
        url: apiUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': 'Bearer [REDACTED]'
        }
      });

      const startTime = Date.now();
      try {
        log('Content Details', {
          fileRequestId,
          contentLength: content.length,
          contentPreview: content.substring(0, 100) + '...'
        });

        const requestBody = {
          file: path,
          content: fileContent
        };

        log('Request Body', {
          fileRequestId,
          body: {
            file: requestBody.file,
            contentLength: requestBody.content.length
          }
        });

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.PTERODACTYL_CLIENT_API_KEY}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Request-ID': fileRequestId
          },
          body: JSON.stringify(requestBody)
        });

        const duration = Date.now() - startTime;
        const responseText = await response.text();
        
        log('Raw Response', {
          fileRequestId,
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers),
          body: responseText.substring(0, 1000)
        });

        log('File Upload Response', {
          fileRequestId,
          path,
          status: response.status,
          duration,
          success: response.ok
        }, response.ok ? 'info' : 'error');

        if (!response.ok) {
          let errorMessage;
          try {
            const errorData = JSON.parse(responseText);
            log('Error Response Data', {
              fileRequestId,
              errorData
            }, 'error');
            errorMessage = errorData.errors?.[0]?.detail || 
                          errorData.message || 
                          `HTTP ${response.status}: ${response.statusText}`;
          } catch {
            log('Failed to Parse Error Response', {
              fileRequestId,
              responseText
            }, 'error');
            errorMessage = responseText || `HTTP ${response.status}: ${response.statusText}`;
          }
          throw new Error(`Failed to upload ${path}: ${errorMessage}`);
        }

        log('Upload Success', {
          fileRequestId,
          path,
          duration,
          size: content.length
        });

        return { 
          path, 
          success: true, 
          duration,
          size: content.length 
        };
      } catch (error) {
        log('File Upload Error', {
          fileRequestId,
          path,
          error: error.message,
          stack: error.stack,
          duration: Date.now() - startTime
        }, 'error');
        throw error;
      }
    });

    const results = await Promise.allSettled(uploadPromises);
    
    const uploadResults = results.map((result, index) => ({
      path: files[index].path,
      success: result.status === 'fulfilled',
      error: result.status === 'rejected' ? result.reason.message : null,
      duration: result.status === 'fulfilled' ? result.value.duration : null,
      size: result.status === 'fulfilled' ? result.value.size : null
    }));

    const successCount = uploadResults.filter(r => r.success).length;
    const failureCount = uploadResults.filter(r => !r.success).length;

    log('Upload Summary', {
      total: files.length,
      successful: successCount,
      failed: failureCount,
      results: uploadResults
    });

    return {
      statusCode: successCount > 0 ? 200 : 500,
      headers,
      body: JSON.stringify({
        success: successCount > 0,
        results: uploadResults,
        summary: {
          total: files.length,
          successful: successCount,
          failed: failureCount
        },
        requestId,
        logs
      })
    };
  } catch (error) {
    log('Fatal Error', {
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