import { createStream } from 'rotating-file-stream';
import { Logger, ILogObj, ISettingsParam, ILogObjMeta } from 'tslog';
import * as path from 'path';

// Configure log directory and ensure it exists
const logDir = path.join(process.cwd(), 'logs');
const fs = require('fs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Default logger settings
const defaultSettings: ISettingsParam<ILogObj> = {
  name: "app",
  minLevel: 2, // info in prod, debug in dev
  hideLogPositionForProduction: true,
};

// Create the application-level logger
const appLogger = new Logger<ILogObj>(defaultSettings);

// Set up file rotation for logs
const fileStream = createStream(path.join(logDir, 'app.log'), {
  size: '10M',        // Rotate after 10 megabytes
  interval: '7d',     // Rotate after 7 days
  compress: 'gzip',   // Compress rotated files
});

// Attach file transport with proper type
appLogger.attachTransport((logObj: ILogObj & ILogObjMeta) => {
  fileStream.write(JSON.stringify(logObj) + '\n');
});

/**
 * Get a component-specific logger that automatically adds component metadata
 */
export function getLogger(component: string): Logger<ILogObj> {
  // Create a new logger with the component name
  const componentLogger = new Logger<ILogObj>({
    ...defaultSettings,
    name: component
  });
  
  // Attach the file transport to this logger as well
  componentLogger.attachTransport((logObj: ILogObj & ILogObjMeta) => {
    fileStream.write(JSON.stringify(logObj) + '\n');
  });
  
  // Wrap the logger to automatically add component info to metadata
  const wrappedLogger = Object.create(componentLogger) as Logger<ILogObj>;
  
  // List of logging methods to wrap
  const loggingMethods = [
    'silly', 'trace', 'debug', 'info', 'warn', 'error', 'fatal'
  ] as const;
  
  // Override each method to include component metadata
  loggingMethods.forEach(method => {
    wrappedLogger[method] = function(message: string, ...args: any[]) {
      // If the first argument after message is an object, add component to it
      if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null) {
        args[0] = { component, ...args[0] };
      } else {
        // Otherwise, add a new metadata object with component
        args.unshift({ component });
      }
      
      // Call the original method with enhanced arguments
      return componentLogger[method](message, ...args);
    };
  });
  
  return wrappedLogger;
}

/**
 * Get the application-level logger
 */
export function getAppLogger(): Logger<ILogObj> {
  return getLogger('app');
}

/**
 * Helper function to log errors with context
 */
export function logError(
  logger: Logger<ILogObj>,
  message: string,
  error: Error | unknown,
  additionalContext: Record<string, any> = {}
): void {
  // Extract useful info from the error
  const errorInfo = error instanceof Error
    ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
        ...(error as any).context || {}  // Extract context if available
      }
    : { message: String(error) };
    
  // Log with combined context
  logger.error(message, {
    error: errorInfo,
    ...additionalContext
  });
} 