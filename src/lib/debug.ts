interface DebugInfo {
  stage: string;
  data: unknown;
  timestamp: string;
  requestId?: string;
  duration?: number;
  statusCode?: number;
  headers?: Record<string, string>;
  level: 'info' | 'warn' | 'error';
  source: string;
}

class DebugLogger {
  private static instance: DebugLogger;
  private logs: DebugInfo[] = [];
  private readonly MAX_LOGS = 100;
  private activeRequests: Map<string, number> = new Map();

  private constructor() {}

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  log(info: Omit<DebugInfo, 'timestamp'>) {
    const requestId = info.requestId || crypto.randomUUID();
    const startTime = this.activeRequests.get(requestId) || Date.now();
    
    if (!this.activeRequests.has(requestId)) {
      this.activeRequests.set(requestId, startTime);
    }

    const logEntry = {
      ...info,
      timestamp: new Date().toISOString(),
      requestId,
      duration: Date.now() - startTime
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    // Console output with styling
    const styles = {
      info: 'color: #7289DA',
      warn: 'color: #FFA500',
      error: 'color: #FF4444'
    };

    console.group(`%c🔍 [${info.source}] ${info.stage}`, styles[info.level]);
    console.log('Request ID:', requestId);
    console.log('Duration:', `${logEntry.duration}ms`);
    
    if (info.statusCode) {
      console.log('Status Code:', info.statusCode);
    }
    
    if (info.headers) {
      console.log('Headers:', info.headers);
    }
    
    console.log('Data:', typeof info.data === 'object' ? JSON.stringify(info.data, null, 2) : info.data);
    console.groupEnd();
    
    // Clean up completed requests
    if (info.stage.toLowerCase().includes('complete') || info.level === 'error') {
      this.activeRequests.delete(requestId);
    }
  }

  startRequest(requestId: string) {
    this.activeRequests.set(requestId, Date.now());
  }

  endRequest(requestId: string) {
    this.activeRequests.delete(requestId);
  }

  getLogs(): DebugInfo[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  getLogsBySource(source: string): DebugInfo[] {
    return this.logs.filter(log => log.source === source);
  }

  getLogsByLevel(level: DebugInfo['level']): DebugInfo[] {
    return this.logs.filter(log => log.level === level);
  }
  
  getActiveRequests(): string[] {
    return Array.from(this.activeRequests.keys());
  }
  
  getRequestDuration(requestId: string): number | undefined {
    const startTime = this.activeRequests.get(requestId);
    return startTime ? Date.now() - startTime : undefined;
  }
  
  getRequestLogs(requestId: string): DebugInfo[] {
    return this.logs.filter(log => log.requestId === requestId);
  }
}

export const debugLogger = DebugLogger.getInstance();