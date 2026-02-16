
export type LogType = 'info' | 'success' | 'error' | 'warning' | 'connect';

export interface LogEntry {
  id: string;
  timestamp: number;
  message: string;
  type: LogType;
}

type Listener = (log: LogEntry) => void;
const listeners: Listener[] = [];

export const addLog = (message: string, type: LogType = 'info') => {
  const entry: LogEntry = {
    id: Math.random().toString(36).substring(7),
    timestamp: Date.now(),
    message,
    type
  };
  console.log(`[${type.toUpperCase()}] ${message}`); // Keep console sync
  listeners.forEach(l => l(entry));
};

export const subscribeToLogs = (listener: Listener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};
