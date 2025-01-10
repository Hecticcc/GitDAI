import { debugLogger } from './debug';

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
        url: '/.netlify/functions/pterodactyl/application/servers',
        method: 'POST',
        body: requestBody
      },
      level: 'info',
      source: 'pterodactyl',
      requestId
    });

    const response = await fetch('/.netlify/functions/pterodactyl/application/servers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: requestBody
    });

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
      
      debugLogger.log({
        stage: 'API Error',
        data: { error: errorMessage, response: responseData },
        statusCode: response.status,
        level: 'error',
        source: 'pterodactyl',
        requestId
      });
      
      // Provide more context based on status code
      const statusContext = response.status === 500 ? ' (Server error)' :
                          response.status === 401 ? ' (Authentication failed)' :
                          response.status === 422 ? ' (Invalid configuration)' : '';
                          
      throw new Error(`${errorMessage}${statusContext}`);
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
        url: '/.netlify/functions/pterodactyl/application/servers',
        method: 'POST'
      },
      level: 'info',
      source: 'pterodactyl-test',
      requestId
    });

    const response = await fetch('/.netlify/functions/pterodactyl/application/servers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        name: `test-bot-${Date.now()}`,
        user: 1,
        egg: 15,
        docker_image: 'ghcr.io/pterodactyl/yolks:nodejs_18',
        startup: 'node {{SERVER_SCRIPT}}',
        limits: {
          memory: 1024,
          swap: 0,
          disk: 10240,
          io: 500,
          cpu: 100
        },
        feature_limits: {
          databases: 1,
          allocations: 1
        },
        environment: {
          SERVER_SCRIPT: 'bot.js',
          DISCORD_TOKEN: '{{DISCORD_TOKEN}}'
        }
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