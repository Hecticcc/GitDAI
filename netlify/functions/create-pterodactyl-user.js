// Create Pterodactyl user function
const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
      console.error('Invalid HTTP method:', event.httpMethod);
      throw new Error('Method not allowed');
    }

    // Validate request body
    if (!event.body) {
      console.error('Missing request body');
      throw new Error('Request body is required');
    }

    let parsedBody;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      console.error('Failed to parse request body:', error);
      throw new Error('Invalid JSON in request body');
    }

    const { email, password, username, firstName, lastName } = JSON.parse(event.body);
    
    // Additional validation
    console.log('Environment Check:', {
      PTERODACTYL_API_URL: process.env.PTERODACTYL_API_URL ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_KEY: process.env.PTERODACTYL_API_KEY ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_KEY_LENGTH: process.env.PTERODACTYL_API_KEY?.length || 0,
      NODE_VERSION: process.version,
      INPUT: { email, username, firstName, lastName }
    });

    if (!process.env.PTERODACTYL_API_URL || !process.env.PTERODACTYL_API_KEY) {
      console.error('Missing required environment variables');
      throw new Error('Server configuration error');
    }

    // Validate API URL format
    try {
      new URL(process.env.PTERODACTYL_API_URL);
    } catch (error) {
      console.error('Invalid API URL format:', process.env.PTERODACTYL_API_URL);
      throw new Error('Invalid API URL configuration');
    }

    if (username.length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }
    
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    // Validate required fields
    if (!email || !password || !username) {
      throw new Error('Missing required fields');
    }

    const { default: fetch } = await import('node-fetch');

    // Validate API key format
    if (process.env.PTERODACTYL_API_KEY.length < 32) {
      console.error('API key appears to be invalid (too short)');
      throw new Error('Invalid API key configuration');
    }

    // Check if user already exists
    const baseUrl = process.env.PTERODACTYL_API_URL.replace(/\/+$/, '');
    const userCheckUrl = `${baseUrl}/api/application/users?filter[email]=${encodeURIComponent(email)}`;

    console.log('API Request:', {
      method: 'GET',
      url: userCheckUrl,
      headers: {
        'Authorization': 'Bearer [REDACTED]',
        'Accept': 'application/json'
      }
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const checkResponse = await fetch(userCheckUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY.trim()}`,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!checkResponse.ok) {
      const errorText = await checkResponse.text();
      let parsedErrorText;
      
      try {
        parsedErrorText = JSON.parse(errorText);
      } catch (e) {
        parsedErrorText = errorText;
      }

      console.error('User Check Failed:', {
        status: checkResponse.status,
        statusText: checkResponse.statusText,
        headers: Object.fromEntries(checkResponse.headers),
        body: parsedErrorText,
        url: userCheckUrl
      });
      
      // Specific error handling based on status code
      if (checkResponse.status === 401) {
        throw new Error('Invalid API credentials');
      } else if (checkResponse.status === 403) {
        throw new Error('API key does not have sufficient permissions');
      } else if (checkResponse.status === 404) {
        throw new Error('Invalid API endpoint');
      }
      
      throw new Error(`Failed to check existing users: ${checkResponse.status} ${checkResponse.statusText}`);
    }

    let checkData;
    try {
      const checkText = await checkResponse.text();
      console.log('User Check Response:', checkText);
      checkData = JSON.parse(checkText);
    } catch (error) {
      console.error('Failed to parse user check response:', error);
      throw new Error('Invalid response format from user check');
    }

    if (checkData.data?.length > 0) {
      throw new Error('A Pterodactyl account with this email already exists');
    }

    // Create user
    console.log('Creating User:', {
      requestUrl: `${baseUrl}/api/application/users`,
      method: 'POST',
      headers: {
        'Authorization': 'Bearer [REDACTED]',
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });
    
    const requestBody = {
      email,
      username,
      first_name: firstName || 'Discord',
      last_name: lastName || 'User',
      password,
      root_admin: false,
      language: 'en'
    };

    console.log('Request Body:', JSON.stringify(requestBody, null, 2));

    // Create new controller for create request
    const createController = new AbortController();
    const createTimeout = setTimeout(() => createController.abort(), 30000);

    const response = await fetch(`${baseUrl}/api/application/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal: createController.signal
    });

    clearTimeout(createTimeout);

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError = null;
      let errorDetails = '';
      
      try {
        parsedError = errorText ? JSON.parse(errorText) : null;
        errorDetails = JSON.stringify(parsedError, null, 2);
      } catch (e) {
        console.error('Error Response Parse Failed:', {
          error: e.message,
          rawResponse: errorText
        });
        errorDetails = errorText;
      }

      console.error('User Creation Failed:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        headers: Object.fromEntries(response.headers),
        error: errorDetails,
        url: `${baseUrl}/api/application/users`
      });

      // Check for specific error conditions
      if (response.status === 401) {
        throw new Error('Invalid API credentials');
      } else if (response.status === 422) {
        const validationErrors = parsedError?.errors?.map(e => e.detail).join(', ');
        throw new Error(`Validation error: ${validationErrors || 'Invalid user data provided'}`);
      }

      const errorMessage = parsedError?.errors?.[0]?.detail || 
                          parsedError?.message || 
                          `Failed to create Pterodactyl user (Status: ${response.status} ${response.statusText})`;
      throw new Error(errorMessage);
    }

    let data;
    try {
      const responseText = await response.text();
      console.log('Success Response:', {
        status: response.status,
        headers: Object.fromEntries(response.headers),
        body: responseText
      });
      data = JSON.parse(responseText);
    } catch (error) {
      console.error('Success Response Parse Failed:', {
        error: error.message,
        stack: error.stack
      });
      throw new Error('Invalid response format from Pterodactyl API');
    }

    return {
      statusCode: 201,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    };
  } catch (error) {
    console.error('Error creating Pterodactyl user:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      type: error.constructor.name,
      code: error.code,
      isAbortError: error.name === 'AbortError'
    });

    let statusCode = 500;
    if (error.message.includes('already exists')) {
      statusCode = 409;
    } else if (error.name === 'AbortError') {
      statusCode = 504;
    } else if (error.message.includes('Invalid API credentials')) {
      statusCode = 401;
    }

    return {
      statusCode,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message,
        type: error.name,
        timestamp: new Date().toISOString()
      })
    };
  }
};

export { handler };