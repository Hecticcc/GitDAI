interface DebugInfo {
  stage: string;
  data: unknown;
  timestamp: string;
  requestId?: string;
  duration?: number;
  statusCode?: number;
  headers?: Record<string, string>;
  level: 'debug' | 'info' | 'warn' | 'error';
  source: string;
  metadata?: Record<string, unknown>;
}

class DebugLogger {
  private static instance: DebugLogger;
  private logs: DebugInfo[] = [];
  private readonly MAX_LOGS = 100;
  private activeRequests: Map<string, number> = new Map();
  private logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info';
  private subscribers: Set<(info: DebugInfo) => void> = new Set();

  private constructor() {}

  static getInstance(): DebugLogger {
    if (!DebugLogger.instance) {
      DebugLogger.instance = new DebugLogger();
    }
    return DebugLogger.instance;
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): void {
    this.logLevel = level;
  }

  subscribe(callback: (info: DebugInfo) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private shouldLog(level: DebugInfo['level']): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatData(data: unknown): string {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      return `[Unable to stringify data: ${error.message}]`;
    }
  }

  log(info: Omit<DebugInfo, 'timestamp'>) {
    const requestId = info.requestId || crypto.randomUUID();
    const startTime = this.activeRequests.get(requestId) || Date.now();
    
    if (!this.activeRequests.has(requestId)) {
      this.activeRequests.set(requestId, startTime);
    }

    if (!this.shouldLog(info.level)) {
      return;
    }

    const logEntry = {
      ...info,
      timestamp: new Date().toISOString(),
      requestId,
      duration: Date.now() - startTime,
      metadata: {
        ...info.metadata,
        browser: typeof window !== 'undefined',
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Node.js',
        timestamp: Date.now(),
        memory: typeof performance !== 'undefined' ? performance.memory?.usedJSHeapSize : undefined
      }
    };

    this.logs.push(logEntry);
    if (this.logs.length > this.MAX_LOGS) {
      this.logs.shift();
    }

    // Console output with styling
    const styles = {
      debug: 'color: #808080',
      info: 'color: #7289DA',
      warn: 'color: #FFA500',
      error: 'color: #FF4444'
    };

    const prefix = info.level === 'error' ? '❌' : info.level === 'warn' ? '⚠️' : '🔍';
    
    console.group(`%c${prefix} [${info.source}] ${info.stage}`, styles[info.level]);
    console.log('Request ID:', requestId);
    console.log('Duration:', `${logEntry.duration}ms`);
    
    if (info.statusCode) {
      console.log('Status Code:', info.statusCode);
    }
    
    if (info.headers) {
      console.log('Headers:', info.headers);
    }
    
    console.log('Data:', this.formatData(info.data));
    
    if (info.metadata) {
      console.log('Metadata:', this.formatData(info.metadata));
    }

    console.groupEnd();
    
    // Notify subscribers
    this.subscribers.forEach(callback => callback(logEntry));

    // Clean up completed requests
    if (info.stage.toLowerCase().includes('complete') || info.level === 'error') {
      this.activeRequests.delete(requestId);
    }
  }

  debug(stage: string, data: unknown, source: string, metadata?: Record<string, unknown>) {
    this.log({ stage, data, level: 'debug', source, metadata });
  }

  info(stage: string, data: unknown, source: string, metadata?: Record<string, unknown>) {
    this.log({ stage, data, level: 'info', source, metadata });
  }

  warn(stage: string, data: unknown, source: string, metadata?: Record<string, unknown>) {
    this.log({ stage, data, level: 'warn', source, metadata });
  }

  error(stage: string, data: unknown, source: string, metadata?: Record<string, unknown>) {
    this.log({ stage, data, level: 'error', source, metadata });
  }
  startRequest(requestId: string) {
    this.activeRequests.set(requestId, Date.now());
  }

  endRequest(requestId: string) {
    this.activeRequests.delete(requestId);
  }

  getLogs(options?: {
    level?: DebugInfo['level'];
    source?: string;
    requestId?: string;
    startTime?: number;
    endTime?: number;
  }): DebugInfo[] {
    let filteredLogs = [...this.logs];
    
    if (options) {
      if (options.level) {
        filteredLogs = filteredLogs.filter(log => log.level === options.level);
      }
      if (options.source) {
        filteredLogs = filteredLogs.filter(log => log.source === options.source);
      }
      if (options.requestId) {
        filteredLogs = filteredLogs.filter(log => log.requestId === options.requestId);
      }
      if (options.startTime) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() >= options.startTime!);
      }
      if (options.endTime) {
        filteredLogs = filteredLogs.filter(log => new Date(log.timestamp).getTime() <= options.endTime!);
      }
    }
    
    return filteredLogs;
  }

  clearLogs() {
    this.logs = [];
    this.activeRequests.clear();
  }

  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      const headers = ['timestamp', 'level', 'source', 'stage', 'requestId', 'duration', 'data'];
      const rows = this.logs.map(log => [
        log.timestamp,
        log.level,
        log.source,
        log.stage,
        log.requestId,
        log.duration,
        JSON.stringify(log.data)
      ]);
      return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }
    return JSON.stringify(this.logs, null, 2);
  }

  getStats(): Record<string, unknown> {
    return {
      totalLogs: this.logs.length,
      activeRequests: this.activeRequests.size,
      errorCount: this.logs.filter(log => log.level === 'error').length,
      warningCount: this.logs.filter(log => log.level === 'warn').length,
      averageDuration: this.logs.reduce((acc, log) => acc + (log.duration || 0), 0) / this.logs.length,
      sourceBreakdown: this.logs.reduce((acc, log) => {
        acc[log.source] = (acc[log.source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>)
    };
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