import { DebugEvent, DebugLevel } from './types';

class DebugSystem {
  private static instance: DebugSystem;
  private logs: DebugEvent[] = [];
  private subscribers: Set<(event: DebugEvent) => void> = new Set();
  private isEnabled: boolean = true;
  private maxLogs: number = 1000;

  private constructor() {}

  static getInstance(): DebugSystem {
    if (!DebugSystem.instance) {
      DebugSystem.instance = new DebugSystem();
    }
    return DebugSystem.instance;
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  setMaxLogs(max: number) {
    this.maxLogs = max;
  }

  subscribe(callback: (event: DebugEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private addLog(event: DebugEvent) {
    if (!this.isEnabled) return;

    this.logs.push(event);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.subscribers.forEach(callback => callback(event));

    // Log to console with styling
    const styles = {
      info: 'color: #7289DA',
      warn: 'color: #FFA500',
      error: 'color: #FF4444',
      debug: 'color: #808080'
    };

    console.groupCollapsed(
      `%c[${event.level.toUpperCase()}] ${event.component}`,
      styles[event.level]
    );
    console.log('Timestamp:', event.timestamp);
    console.log('Component:', event.component);
    console.log('Action:', event.action);
    console.log('Data:', event.data);
    if (event.error) {
      console.error('Error:', event.error);
    }
    console.groupEnd();
  }

  log(
    level: DebugLevel,
    component: string,
    action: string,
    data?: any,
    error?: Error
  ) {
    const event: DebugEvent = {
      timestamp: new Date(),
      level,
      component,
      action,
      data,
      error
    };
    this.addLog(event);
  }

  info(component: string, action: string, data?: any) {
    this.log('info', component, action, data);
  }

  warn(component: string, action: string, data?: any) {
    this.log('warn', component, action, data);
  }

  error(component: string, action: string, error: Error, data?: any) {
    this.log('error', component, action, data, error);
  }

  debug(component: string, action: string, data?: any) {
    this.log('debug', component, action, data);
  }

  getLogs(): DebugEvent[] {
    return [...this.logs];
  }

  getLogsByLevel(level: DebugLevel): DebugEvent[] {
    return this.logs.filter(log => log.level === level);
  }

  getLogsByComponent(component: string): DebugEvent[] {
    return this.logs.filter(log => log.component === component);
  }

  clearLogs() {
    this.logs = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const debugSystem = DebugSystem.getInstance();