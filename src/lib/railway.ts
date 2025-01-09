import JSZip from 'jszip';

const RAILWAY_API = '/.netlify/functions/railway';

interface RailwayDeploymentConfig {
  projectId: string;
  environmentId: string;
  serviceId: string;
  apiToken: string;
}

interface RailwayDeploymentStatus {
  id: string;
  status: 'BUILDING' | 'DEPLOYING' | 'SUCCESS' | 'FAILED';
  url?: string;
}

export async function deployToRailway(
  code: string,
  botToken: string,
  config: RailwayDeploymentConfig
): Promise<string> {
  try {
    // Create deployment package
    const zip = new JSZip();
    
    // Add bot code with token
    const codeWithToken = code.replace('your_bot_token_here', botToken);
    zip.file('bot.js', codeWithToken);
    
    // Add package.json
    zip.file('package.json', JSON.stringify({
      "name": "discord-bot",
      "version": "1.0.0",
      "private": true,
      "main": "bot.js",
      "scripts": {
        "start": "node bot.js"
      },
      "dependencies": {
        "discord.js": "^14.14.1"
      },
      "engines": {
        "node": ">=16.9.0"
      }
    }, null, 2));

    // Generate zip file
    const content = await zip.generateAsync({ type: 'blob' });
    const formData = new FormData();
    formData.append('deployment', content, 'deployment.zip');

    // Start deployment
    const response = await fetch(`${RAILWAY_API}/projects/${config.projectId}/services/${config.serviceId}/deployments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Accept': 'application/json'
      },
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      const errorMessage = errorData?.error || 'Failed to start deployment';
      console.error('Railway API Error Response:', {
        status: response.status,
        statusText: response.statusText,
        error: errorData,
        url: `${RAILWAY_API}/projects/${config.projectId}/services/${config.serviceId}/deployments`
      });
      throw new Error(errorMessage);
    }

    const deployment = await response.json();
    return deployment.id;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to deploy to Railway';
    console.error('Railway deployment error:', {
      error,
      message,
      config: {
        projectId: config.projectId,
        serviceId: config.serviceId,
        environmentId: config.environmentId
      }
    });
    throw new Error(message);
  }
}

export async function getRailwayDeploymentStatus(
  deploymentId: string,
  config: RailwayDeploymentConfig
): Promise<RailwayDeploymentStatus> {
  const response = await fetch(
    `${RAILWAY_API}/projects/${config.projectId}/services/${config.serviceId}/deployments/${deploymentId}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiToken}`,
        'Accept': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const errorMessage = errorData?.error || 'Failed to get deployment status';
    console.error('Railway Status API Error:', {
      status: response.status,
      statusText: response.statusText,
      error: errorData
    });
    throw new Error(errorMessage);
  }

  const deployment = await response.json();
  return {
    id: deployment.id,
    status: deployment.status.toUpperCase(),
    url: deployment.url
  };
}