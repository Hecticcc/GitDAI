export type DebugLevel = 'info' | 'warn' | 'error' | 'debug';

export interface DebugEvent {
  timestamp: Date;
  level: DebugLevel;
  component: string;
  action: string;
  data?: any;
  error?: Error;
}