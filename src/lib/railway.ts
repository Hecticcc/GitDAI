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

interface DeploymentDebugInfo {
  timestamp: string;
  stage: string;
  data: unknown;
}

class DeploymentDebugger {
  private logs: DeploymentDebugInfo[] = [];
  private deploymentId?: string;

  constructor() {
    this.clear();
  }

  log(stage: string, data: unknown) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      stage,
      data
    };
    this.logs.push(logEntry);
    console.group(`🚂 Railway Debug [${stage}]`);
    console.log('Timestamp:', logEntry.timestamp);
    console.log('Data:', data);
    console.groupEnd();
  }

  setDeploymentId(id: string) {
    this.deploymentId = id;
    this.log('Deployment ID Set', { id });
  }

  getDeploymentId() {
    return this.deploymentId;
  }

  getLogs() {
    return this.logs;
  }

  clear() {
    this.logs = [];
    this.deploymentId = undefined;
  }

  exportLogs() {
    return {
      deploymentId: this.deploymentId,
      logs: this.logs,
      summary: {
        totalSteps: this.logs.length,
        startTime: this.logs[0]?.timestamp,
        endTime: this.logs[this.logs.length - 1]?.timestamp
      }
    };
  }
}

// Create a singleton instance
export const deploymentDebugger = new DeploymentDebugger();

export async function deployToRailway(
  code: string,
  botToken: string,
  config: RailwayDeploymentConfig
): Promise<string> {
  deploymentDebugger.clear();
  deploymentDebugger.log('Deploy Started', { config });

  try {
    // Validate config
    const missingConfig = Object.entries(config)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingConfig.length > 0) {
      throw new Error(`Missing required configuration: ${missingConfig.join(', ')}`);
    }

    deploymentDebugger.log('Config Validation', { status: 'passed' });

    // Create deployment package
    const zip = new JSZip();
    deploymentDebugger.log('Creating Deployment Package', { files: ['bot.js', 'package.json'] });
    
    // Add bot code with token
    const codeWithToken = code.replace('your_bot_token_here', botToken);
    zip.file('bot.js', codeWithToken);
    
    // Add package.json
    const packageJson = {
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
    };

    zip.file('package.json', JSON.stringify(packageJson, null, 2));
    deploymentDebugger.log('Files Added', { packageJson });

    // Generate deployment data
    const deploymentData = {
      files: {
        'bot.js': codeWithToken,
        'package.json': JSON.stringify(packageJson, null, 2)
      },
      entrypoint: 'npm start'
    };

    deploymentDebugger.log('Deployment Data Prepared', {
      fileCount: Object.keys(deploymentData.files).length,
      entrypoint: deploymentData.entrypoint
    });

    // Start deployment
    const response = await fetch(
      `${RAILWAY_API}/projects/${config.projectId}/services/${config.serviceId}/deployments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.apiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(deploymentData)
      }
    );

    deploymentDebugger.log('Deployment Request Sent', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      deploymentDebugger.log('Deployment Request Failed', {
        status: response.status,
        error: errorData
      });
      throw new Error(errorData?.error || 'Failed to start deployment');
    }

    const deployment = await response.json();
    deploymentDebugger.log('Deployment Created', deployment);
    deploymentDebugger.setDeploymentId(deployment.id);

    return deployment.id;
  } catch (error) {
    const errorInfo = {
      message: error instanceof Error ? error.message : 'Failed to deploy to Railway',
      error,
      config: {
        projectId: config.projectId,
        serviceId: config.serviceId,
        environmentId: config.environmentId
      }
    };
    
    deploymentDebugger.log('Deployment Error', errorInfo);
    console.error('Railway deployment error:', errorInfo);
    
    throw error instanceof Error ? error : new Error(errorInfo.message);
  }
}

export async function getRailwayDeploymentStatus(
  deploymentId: string,
  config: RailwayDeploymentConfig
): Promise<RailwayDeploymentStatus> {
  try {
    deploymentDebugger.log('Checking Status', { deploymentId });

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

    deploymentDebugger.log('Status Response', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      deploymentDebugger.log('Status Check Failed', {
        status: response.status,
        error: errorData
      });
      throw new Error(errorData?.error || 'Failed to get deployment status');
    }

    const deployment = await response.json();
    deploymentDebugger.log('Status Retrieved', deployment);

    return {
      id: deployment.id,
      status: deployment.status.toUpperCase(),
      url: deployment.url
    };
  } catch (error) {
    const errorInfo = {
      message: error instanceof Error ? error.message : 'Failed to get deployment status',
      error,
      deploymentId,
      config: {
        projectId: config.projectId,
        serviceId: config.serviceId
      }
    };

    deploymentDebugger.log('Status Check Error', errorInfo);
    console.error('Railway status check error:', errorInfo);

    throw error instanceof Error ? error : new Error(errorInfo.message);
  }
}

// Export debug utilities
export const getDeploymentLogs = () => deploymentDebugger.getLogs();
export const exportDeploymentDebugInfo = () => deploymentDebugger.exportLogs();