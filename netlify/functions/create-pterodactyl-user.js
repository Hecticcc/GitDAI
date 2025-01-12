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
      console.log('Parsed request body:', {
        ...parsedBody,
        password: '[REDACTED]'
      });
    } catch (error) {
      console.error('Failed to parse request body:', error);
      throw new Error('Invalid JSON in request body');
    }

    const { email, password, username, firstName, lastName } = parsedBody;
    
    // Additional validation
    console.log('Environment Check:', {
      PTERODACTYL_API_URL: process.env.PTERODACTYL_API_URL ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_URL_VALUE: process.env.PTERODACTYL_API_URL?.replace(/\/+$/, ''),
      PTERODACTYL_API_KEY: process.env.PTERODACTYL_API_KEY ? '[SET]' : '[NOT SET]',
      PTERODACTYL_API_KEY_LENGTH: process.env.PTERODACTYL_API_KEY?.length || 0,
      NODE_VERSION: process.version,
      INPUT: { email, username, firstName, lastName },
      FUNCTION_NAME: context.functionName,
      FUNCTION_VERSION: context.functionVersion,
      REQUEST_ID: context.awsRequestId
    });

    if (!process.env.PTERODACTYL_API_URL || !process.env.PTERODACTYL_API_KEY) {
      console.error('Missing required environment variables');
      throw new Error('Missing required environment variables: PTERODACTYL_API_URL and/or PTERODACTYL_API_KEY');
    }

    // Validate API URL format
    try {
      const apiUrl = new URL(process.env.PTERODACTYL_API_URL);
      // Clean up URL path
      const cleanPath = apiUrl.pathname.replace(/\/+/g, '/').replace(/\/+$/, '');
      
      // Check if path contains /api
      if (!cleanPath.includes('/api')) {
        console.error('API URL must contain /api in path:', {
          url: apiUrl.toString(),
          path: cleanPath,
          hostname: apiUrl.hostname
        });
        throw new Error('Invalid API URL format - must include /api in path');
      }
      
      // Ensure protocol is https
      if (apiUrl.protocol !== 'https:') {
        console.error('API URL must use HTTPS:', {
          url: apiUrl.toString(),
          protocol: apiUrl.protocol,
          hostname: apiUrl.hostname
        });
        throw new Error('Invalid API URL format - must use HTTPS');
      }
      
      console.log('API URL Validation:', {
        original: process.env.PTERODACTYL_API_URL,
        parsed: {
          protocol: apiUrl.protocol,
          hostname: apiUrl.hostname,
          pathname: apiUrl.pathname,
          href: apiUrl.href
        }
      });
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
    if (!email || !password || !username || !firstName || !lastName) {
      throw new Error('Missing required fields: email, password, username, firstName, and lastName are required');
    }

    const { default: fetch } = await import('node-fetch');

    // Validate API key format
    if (process.env.PTERODACTYL_API_KEY.length < 32) {
      console.error('API key appears to be invalid (too short)');
      throw new Error('Invalid API key configuration');
    }

    // Check if user already exists
    const baseUrl = process.env.PTERODACTYL_API_URL.replace(/\/+$/, '');
    const userCheckUrl = `${baseUrl}/application/users?filter[email]=${encodeURIComponent(email)}`;
    
    // Test API connectivity first
    try {
      console.log('Testing API connectivity...');
      const testResponse = await fetch(`${baseUrl}/application/users`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY.trim()}`,
          'Accept': 'application/json',
          'User-Agent': 'DiscordAI-Bot/1.0'
        }
      });

      if (!testResponse.ok) {
        const testErrorText = await testResponse.text();
        console.error('API Connectivity Test Failed:', {
          status: testResponse.status,
          statusText: testResponse.statusText,
          response: testErrorText,
          headers: Object.fromEntries(testResponse.headers)
        });
        throw new Error(`API connectivity test failed: ${testResponse.status} ${testResponse.statusText}`);
      }

      console.log('API connectivity test successful');
    } catch (error) {
      console.error('API Connectivity Test Error:', {
        message: error.message,
        stack: error.stack,
        url: `${baseUrl}/api/application/users`
      });
      throw new Error(`Failed to connect to Pterodactyl API: ${error.message}`);
    }
    
    // Log the full request details (redacting sensitive info)
    console.log('Full Request Details:', {
      baseUrl: baseUrl.replace(process.env.PTERODACTYL_API_KEY, '[REDACTED]'),
      checkUrl: userCheckUrl.replace(process.env.PTERODACTYL_API_KEY, '[REDACTED]'),
      method: 'GET',
      headers: {
        'Authorization': 'Bearer [REDACTED]',
        'Accept': 'application/json',
        'User-Agent': 'DiscordAI-Bot/1.0'
      }
    });

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
      requestUrl: `${baseUrl}/application/users`,
      method: 'POST'
    });
    
    const requestBody = {
      email,
      username,
      first_name: firstName,
      last_name: lastName,
      password,
      root_admin: false,
      language: 'en'
    };

    // Validate name fields
    if (firstName.length < 1 || lastName.length < 1) {
      throw new Error('First name and last name must not be empty');
    }

    console.log('Request Body:', JSON.stringify(requestBody, null, 2));
    console.log('Request Body:', {
      ...requestBody,
      password: '[REDACTED]'
    });

    // Create new controller for create request
    const createController = new AbortController();
    const createTimeout = setTimeout(() => createController.abort(), 30000);

    const response = await fetch(`${baseUrl}/application/users`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.PTERODACTYL_API_KEY.trim()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'DiscordAI-Bot/1.0'
      },
      body: JSON.stringify(requestBody),
      signal: createController.signal
    });

    clearTimeout(createTimeout);

    if (!response.ok) {
      const errorText = await response.text();
      let parsedError = null;
      let errorDetails = errorText;
      
      try {
        if (errorText && errorText.trim()) {
          parsedError = JSON.parse(errorText);
          errorDetails = JSON.stringify(parsedError, null, 2);
        }
      } catch (e) {
        console.error('Error Response Parse Failed:', {
          error: e.message,
          rawResponse: errorText.substring(0, 1000)
        });
      }

      console.error('User Creation Failed:', {
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        headers: Object.fromEntries(response.headers),
        error: errorDetails.substring(0, 1000),
        url: `${baseUrl}/api/application/users`
      });

      // Check for specific error conditions
      if (response.status === 401) {
        throw new Error('Invalid API credentials');
      } else if (response.status === 422) {
        const validationErrors = parsedError?.errors?.map(e => e.detail).join(', ');
        throw new Error(`Validation error: ${validationErrors || 'Invalid user data provided'}`);
      } else if (response.status === 500) {
        throw new Error('Pterodactyl server error. Please check the panel logs.');
      }

      const errorMessage = parsedError?.errors?.[0]?.detail || 
                          parsedError?.message || 
                          `Failed to create Pterodactyl user (${response.status} ${response.statusText})`;
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