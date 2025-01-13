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

  // Validate server ID format first
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!serverId || !uuidRegex.test(serverId)) {
    debugLogger.log({
      stage: 'Invalid Server ID',
      data: { serverId },
      level: 'error',
      source: 'pterodactyl-status',
      requestId
    });
    throw new Error('Invalid server ID format');
  }

  let attempt = 1;
  const maxAttempts = 3;
  const baseDelay = 1000; // Base delay of 1 second

  try {
    while (attempt <= maxAttempts) {
      try {
        if (!serverId) {
          throw new Error('Server ID is required');
        }

        // Calculate exponential backoff delay
        const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), 5000);

        // Log the attempt
        debugLogger.log({
          stage: 'Checking Server Status',
          data: { serverId, attempt, maxAttempts, delay },
          level: 'info',
          source: 'pterodactyl-status',
          requestId
        });

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000); // Increase timeout to 15 seconds

        // Use Netlify function to proxy the request
        const response = await fetch(
          `/.netlify/functions/server-status?serverId=${serverId}`,
          {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            },
            signal: controller.signal
          }
        );

        clearTimeout(timeout);

        // If we get a retriable status code, retry
        if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < maxAttempts) {
          debugLogger.log({
            stage: 'Retrying after error',
            data: { 
              attempt,
              delay,
              status: response.status,
              statusText: response.statusText
            },
            level: 'warn',
            source: 'pterodactyl-status',
            requestId
          });
          await sleep(delay);
          attempt++;
          continue;
        }

        const responseText = await response.text();
        
        // Check if we got an HTML error page
        if (responseText.includes('<!DOCTYPE html>')) {
          throw new Error('Received HTML error page instead of JSON response');
        }

        let responseData;

        try {
          responseData = JSON.parse(responseText);
        } catch (error) {
          throw new Error(`Failed to parse response: ${responseText.substring(0, 100)}...`);
        }

        if (!response.ok) {
          throw new Error(responseData.error || 'Failed to check server status');
        }

        debugLogger.log({
          stage: 'Server Status',
          data: {
            status: responseData.attributes.status,
            state: responseData.attributes.state,
            installed: responseData.attributes.container?.installed,
            identifier: responseData.attributes.identifier
          },
          level: 'info',
          source: 'pterodactyl-status',
          requestId
        });

        // Determine actual server state
        const installed = responseData.attributes.container?.installed === 1;
        const status = responseData.attributes.status;
        const state = responseData.attributes.state;

        if (status === 'suspended') return 'suspended';
        if (status === 'error' || state === 'error') return 'error';
        if (!installed) return 'installing';
        return 'running';
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

// Simulated installation wait with fixed 200-second timer
export async function waitForInstallation(serverId: string): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 200000); // 200 seconds
  });
}

export async function createPterodactylServer(name: string, description: string, userId: string | number) {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);

  debugLogger.log({
    stage: 'Creating Pterodactyl Server',
    data: { name, description, userId },
    level: 'info',
    source: 'pterodactyl',
    requestId
  });

  try {
    const requestBody = JSON.stringify({ name, description, userId });
    
    // Validate userId
    if (!userId) {
      throw new Error('User ID is required');
    }

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
      stage: 'Validating Response',
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

    // Validate server identifier
    if (!responseData?.data?.attributes?.identifier) {
      debugLogger.error('Missing Server Identifier', {
        response: responseData,
        userId
      }, 'pterodactyl', { requestId });
      throw new Error('Server creation succeeded but no identifier was returned. Please check the Pterodactyl panel.');
    }

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

export async function deletePterodactylServer(serverId: string): Promise<void> {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);

  try {
    debugLogger.log({
      stage: 'Deleting Server',
      data: { serverId, url: `/.netlify/functions/pterodactyl?serverId=${serverId}` },
      level: 'info',
      source: 'pterodactyl',
      requestId
    });

    let response;
    try {
      response = await fetch(`/.netlify/functions/pterodactyl?serverId=${serverId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        redirect: 'follow'
      });
    } catch (fetchError) {
      debugLogger.log({
        stage: 'Fetch Error',
        data: {
          message: fetchError instanceof Error ? fetchError.message : 'Unknown fetch error',
          type: fetchError instanceof Error ? fetchError.name : typeof fetchError
        },
        level: 'error',
        source: 'pterodactyl',
        requestId
      });
      throw new Error(`Network error while deleting server: ${fetchError.message}`);
    }

    // Log response details
    debugLogger.log({
      stage: 'Delete Response',
      data: {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers),
        type: response.type,
        redirected: response.redirected,
        url: response.url
      },
      level: response.ok ? 'info' : 'warn',
      source: 'pterodactyl',
      requestId
    });
    if (!response.ok) {
      let errorData;
      try {
        const errorText = await response.text();
        errorData = JSON.parse(errorText);
      } catch (parseError) {
        debugLogger.log({
          stage: 'Error Parse Failed',
          data: { parseError },
          level: 'error',
          source: 'pterodactyl',
          requestId
        });
        throw new Error(`Failed to delete server (${response.status} ${response.statusText})`);
      }
      throw new Error(errorData.error || `Failed to delete server (${response.status})`);
    }

    debugLogger.log({
      stage: 'Server Deleted',
      data: { serverId, status: response.status },
      level: 'info',
      source: 'pterodactyl',
      requestId
    });
  } catch (error) {
    debugLogger.log({
      stage: 'Delete Server Failed',
      data: {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        serverId
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