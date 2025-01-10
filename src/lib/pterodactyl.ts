import { debugLogger } from './debug';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second
const INSTALLATION_CHECK_INTERVAL = 5000; // 5 seconds
const INSTALLATION_TIMEOUT = 300000; // 5 minutes

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function checkServerStatus(serverId: string): Promise<'installing' | 'running' | 'suspended' | 'error'> {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);
  let attempt = 1;
  const maxAttempts = 3;

  try {
    while (attempt <= maxAttempts) {
      try {
        debugLogger.log({
          stage: 'Checking Server Status',
          data: { serverId, attempt, maxAttempts },
          level: 'info',
          source: 'pterodactyl-status',
          requestId
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(`/.netlify/functions/server-status?serverId=${serverId}`, {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeout);

        // If we get a 502, retry
        if (response.status === 502 && attempt < maxAttempts) {
          debugLogger.log({
            stage: 'Retrying after 502',
            data: { attempt, delay: attempt * 1000 },
            level: 'warn',
            source: 'pterodactyl-status',
            requestId
          });
          await sleep(attempt * 1000); // Exponential backoff
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
          throw new Error(responseData.error || 'Failed to check server status');
        }

        debugLogger.log({
          stage: 'Server Status',
          data: responseData,
          level: 'info',
          source: 'pterodactyl-status',
          requestId
        });

        return responseData.status;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out while checking server status');
        }
        if (attempt === maxAttempts) {
          throw error;
        }
        attempt++;
        await sleep(1000 * attempt);
      }
    }
    throw new Error('Maximum retry attempts reached');
  } catch (error) {
    debugLogger.log({
      stage: 'Status Check Failed',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      level: 'error',
      source: 'pterodactyl-status',
      requestId
    });
    throw error;
  } finally {
    debugLogger.endRequest(requestId);
  }
}

export async function waitForInstallation(serverId: string): Promise<void> {
  const startTime = Date.now();
  let consecutiveErrors = 0;
  
  while (true) {
    if (Date.now() - startTime > INSTALLATION_TIMEOUT) {
      throw new Error('Server installation timed out after 5 minutes');
    }

    try {
      const status = await checkServerStatus(serverId);
      consecutiveErrors = 0; // Reset error counter on successful check
      
      if (status === 'running') {
        return;
      } else if (status === 'error' || status === 'suspended') {
        throw new Error(`Server installation failed with status: ${status}`);
      }
    } catch (error) {
      consecutiveErrors++;
      
      // If we get 3 consecutive errors, fail the installation
      if (consecutiveErrors >= 3) {
        throw new Error(`Failed to check server status after ${consecutiveErrors} attempts: ${error.message}`);
      }
      
      debugLogger.log({
        stage: 'Installation Status Check Failed',
        data: {
          error: error.message,
          consecutiveErrors,
          willRetry: consecutiveErrors < 3
        },
        level: 'warn',
        source: 'pterodactyl-status'
      });
    }
    
    await sleep(INSTALLATION_CHECK_INTERVAL);
  }
}
export async function createPterodactylServer(name: string, description?: string) {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);

  debugLogger.log({
    stage: 'Creating Pterodactyl Server',
    data: { name, description },
    level: 'info',
    source: 'pterodactyl',
    requestId
  });

  try {
    const requestBody = JSON.stringify({ name, description });
    debugLogger.log({
      stage: 'Preparing Request',
      data: {
        url: '/.netlify/functions/pterodactyl',
        method: 'POST',
        body: requestBody
      },
      level: 'info',
      source: 'pterodactyl',
      requestId
    });

    let response;
    let lastError;
    
    // Implement retry logic
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        debugLogger.log({
          stage: 'Making Request',
          data: { attempt, maxAttempts: MAX_RETRIES },
          level: 'info',
          source: 'pterodactyl',
          requestId
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        response = await fetch('/.netlify/functions/pterodactyl', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: requestBody,
          signal: controller.signal
        });

        clearTimeout(timeout);

        // If we get a successful response or a non-retriable error, break the loop
        if (response.ok || ![502, 503, 504].includes(response.status)) {
          break;
        }

        lastError = new Error(`Server returned ${response.status} status`);
      } catch (error) {
        lastError = error;
        debugLogger.log({
          stage: 'Request Attempt Failed',
          data: {
            attempt,
            error: error instanceof Error ? error.message : 'Unknown error'
          },
          level: 'warn',
          source: 'pterodactyl',
          requestId
        });
      }

      // If this wasn't our last attempt, wait before retrying
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAY * attempt;
        debugLogger.log({
          stage: 'Retrying Request',
          data: { attempt, delay },
          level: 'info',
          source: 'pterodactyl',
          requestId
        });
        await sleep(delay);
      }
    }

    if (!response) {
      throw lastError || new Error('Failed to connect to Pterodactyl API after multiple attempts');
    }

    let responseText;
    try {
      responseText = await response.text();
      if (!responseText) {
        debugLogger.log({
          stage: 'Empty Response',
          data: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers)
          },
          level: 'error',
          source: 'pterodactyl',
          requestId
        });
        throw new Error('Server returned an empty response. Please check your Pterodactyl configuration.');
      }
      debugLogger.log({
        stage: 'Raw Response',
        data: responseText,
        level: 'info',
        source: 'pterodactyl',
        requestId
      });
    } catch (error) {
      debugLogger.log({
        stage: 'Failed to get response text',
        data: error,
        level: 'error',
        source: 'pterodactyl',
        requestId
      });
      throw new Error('Failed to read response');
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
      debugLogger.log({
        stage: 'Parsed Response',
        data: responseData,
        level: 'info',
        source: 'pterodactyl',
        requestId
      });
    } catch (error) {
      const truncatedResponse = responseText.length > 1000 
        ? `${responseText.substring(0, 1000)}...` 
        : responseText;
        
      // Try to extract error message from HTML response
      const htmlErrorMatch = responseText.match(/<pre>(.*?)<\/pre>/s);
      const extractedError = htmlErrorMatch ? htmlErrorMatch[1].trim() : null;
      
      debugLogger.log({
        stage: 'JSON Parse Error',
        data: {
          error: error.message,
          responseText: extractedError || truncatedResponse,
          responseLength: responseText.length
        },
        level: 'error',
        source: 'pterodactyl',
        requestId
      });
      throw new Error('Failed to parse server response. The server may be misconfigured or experiencing issues.');
    }
    debugLogger.log({
      stage: 'Received Response',
      data: {
        status: response.status,
        statusText: response.statusText,
        responseData
      },
      statusCode: response.status,
      headers: Object.fromEntries(response.headers),
      level: response.ok ? 'info' : 'warn',
      source: 'pterodactyl',
      requestId
    });

    if (!response.ok) {
      const errorData = responseData?.error || responseData?.message || responseData;
      const errorMessage = typeof errorData === 'string' ? errorData : JSON.stringify(errorData);
      
      // Enhanced error context based on status code
      let contextMessage = '';
      if (response.status === 502) {
        contextMessage = ' (Bad Gateway - The server is temporarily unavailable)';
      } else if (response.status === 503) {
        contextMessage = ' (Service Unavailable - The server is temporarily overloaded)';
      } else if (response.status === 504) {
        contextMessage = ' (Gateway Timeout - The server took too long to respond)';
      } else if (response.status === 500) {
        contextMessage = ' (Internal Server Error)';
      } else if (response.status === 401) {
        contextMessage = ' (Authentication failed - Please check your API credentials)';
      } else if (response.status === 422) {
        contextMessage = ' (Invalid configuration - Please check your server settings)';
      }

      debugLogger.log({
        stage: 'API Error',
        data: { 
          error: errorMessage,
          response: responseData,
          context: contextMessage
        },
        statusCode: response.status,
        level: 'error',
        source: 'pterodactyl',
        requestId
      });
      
      throw new Error(`${errorMessage}${contextMessage}`);
    }

    debugLogger.log({
      stage: 'Request Complete',
      data: responseData,
      level: 'info',
      source: 'pterodactyl',
      requestId
    });

    return responseData;
  } catch (error) {
    debugLogger.log({
      stage: 'Request Failed',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      level: 'error',
      source: 'pterodactyl',
      requestId
    });
    throw error;
  } finally {
    debugLogger.endRequest(requestId);
  }
}

export async function uploadFiles(serverId: string, files: Array<{ path: string, content: string }>) {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);
  let attempt = 1;
  const maxAttempts = 3;

  try {
    debugLogger.log({
      stage: 'Uploading Files',
      data: {
        serverId,
        fileCount: files.length,
        files: files.map(f => f.path)
      },
      level: 'info',
      source: 'pterodactyl-upload',
      requestId
    });
    
    while (attempt <= maxAttempts) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('/.netlify/functions/upload-files', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            serverId,
            files
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        const responseText = await response.text();
        let responseData;

        try {
          responseData = JSON.parse(responseText);
        } catch (error) {
          throw new Error(`Failed to parse response: ${responseText}`);
        }

        if (!response.ok) {
          if (response.status === 502 && attempt < maxAttempts) {
            await sleep(attempt * 1000);
            attempt++;
            continue;
          }
          throw new Error(responseData.error || 'Failed to upload files');
        }

        return responseData;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out while uploading files');
        }
        if (attempt === maxAttempts) {
          throw error;
        }
        attempt++;
        await sleep(1000 * attempt);
      }
    }
    throw new Error('Maximum retry attempts reached');
  } catch (error) {
    debugLogger.log({
      stage: 'Upload Failed',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      level: 'error',
      source: 'pterodactyl-upload',
      requestId
    });
    throw error;
  } finally {
    debugLogger.endRequest(requestId);
  }
}
export async function testCreateServer() {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);
  let attempt = 1;
  const maxAttempts = 3;

  try {
    while (attempt <= maxAttempts) {
      debugLogger.log({
        stage: 'Testing Server Creation',
        data: {
          url: '/.netlify/functions/pterodactyl?test=true',
          method: 'POST',
          attempt,
          maxAttempts
        },
        level: 'info',
        source: 'pterodactyl-test',
        requestId
      });

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch('/.netlify/functions/pterodactyl?test=true', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            name: `test-bot-${Date.now()}`,
            description: 'Test Discord bot server',
            test: true
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        const responseText = await response.text();
        debugLogger.log({
          stage: 'Raw Test Response',
          data: {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers),
            body: responseText
          },
          level: response.ok ? 'info' : 'error',
          source: 'pterodactyl-test',
          requestId
        });

        // If we get a 502, retry
        if (response.status === 502 && attempt < maxAttempts) {
          debugLogger.log({
            stage: 'Retrying after 502',
            data: { attempt, delay: attempt * 1000 },
            level: 'warn',
            source: 'pterodactyl-test',
            requestId
          });
          await sleep(attempt * 1000); // Exponential backoff
          attempt++;
          continue;
        }

        let responseData;
        try {
          responseData = JSON.parse(responseText);
          debugLogger.log({
            stage: 'Parsed Test Response',
            data: responseData,
            level: 'info',
            source: 'pterodactyl-test',
            requestId
          });
        } catch (error) {
          if (response.status === 502) {
            throw new Error('Netlify function is not responding. Please check if the function is properly deployed and configured.');
          }
          throw new Error(`Failed to parse response: ${responseText}`);
        }

        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to create test server');
        }

        return responseData;
      } catch (error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. The Netlify function may be taking too long to respond.');
        }
        if (attempt === maxAttempts) {
          throw error;
        }
        attempt++;
        await sleep(1000 * attempt);
      }
    }
    throw new Error('Maximum retry attempts reached');
  } catch (error) {
    debugLogger.log({
      stage: 'Test Request Failed',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      level: 'error',
      source: 'pterodactyl-test',
      requestId
    });
    throw error;
  } finally {
    debugLogger.endRequest(requestId);
  }
}