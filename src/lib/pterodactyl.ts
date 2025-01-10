import { debugLogger } from './debug';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
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
      responseData = JSON.parse(responseText);
    } catch (error) {
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

export async function testCreateServer() {
  const requestId = crypto.randomUUID();
  debugLogger.startRequest(requestId);

  try {
    debugLogger.log({
      stage: 'Testing Server Creation',
      data: {
        url: '/.netlify/functions/pterodactyl?test=true',
        method: 'POST'
      },
      level: 'info',
      source: 'pterodactyl-test',
      requestId
    });

    const response = await fetch('/.netlify/functions/pterodactyl?test=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: `test-bot-${Date.now()}`,
        description: 'Test Discord bot server',
        isTest: true
      })
    });

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
      throw new Error(`Failed to parse response: ${responseText}`);
    }

    if (!response.ok) {
      throw new Error(responseData.error || 'Failed to create test server');
    }

    return responseData;
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