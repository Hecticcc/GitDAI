// Server status check function
const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
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
    // Validate environment
    if (!process.env.PTERODACTYL_API_URL || !process.env.PTERODACTYL_API_KEY) {
      throw new Error('Missing required environment variables');
    }

    // Validate server ID
    const { serverId } = event.queryStringParameters || {};
    if (!serverId) {
      throw new Error('Server ID is required');
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(serverId)) {
      throw new Error('Invalid server ID format');
    }

    // Import node-fetch
    const { default: fetch } = await import('node-fetch');

    // Make request to Pterodactyl API
    const baseUrl = process.env.PTERODACTYL_API_URL.replace(/\/+$/, '');
    const apiUrl = `${baseUrl}/api/application/servers/${serverId}/resources`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY}`,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      }
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error checking server status:', error);

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

module.exports = { handler };