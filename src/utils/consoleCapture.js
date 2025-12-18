/**
 * Console capture utility for debugging user-reported issues
 *
 * Intercepts console.log, console.warn, console.error and buffers them
 * for later submission to the server.
 */

const MAX_BUFFER_SIZE = 500; // Keep last 500 log entries
const logBuffer = [];
let isInitialized = false;

// Store original console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error,
  info: console.info,
  debug: console.debug
};

/**
 * Serialize arguments for storage
 */
function serializeArgs(args) {
  return args.map(arg => {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        // Handle Error objects specially
        if (arg instanceof Error) {
          return `Error: ${arg.message}\n${arg.stack || ''}`;
        }
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  });
}

/**
 * Add entry to log buffer
 */
function addToBuffer(level, args) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: serializeArgs(args).join(' ')
  };

  logBuffer.push(entry);

  // Trim buffer if too large
  if (logBuffer.length > MAX_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

/**
 * Initialize console capture - call once at app startup
 */
export function initConsoleCapture() {
  if (isInitialized) return;

  console.log = (...args) => {
    addToBuffer('log', args);
    originalConsole.log.apply(console, args);
  };

  console.warn = (...args) => {
    addToBuffer('warn', args);
    originalConsole.warn.apply(console, args);
  };

  console.error = (...args) => {
    addToBuffer('error', args);
    originalConsole.error.apply(console, args);
  };

  console.info = (...args) => {
    addToBuffer('info', args);
    originalConsole.info.apply(console, args);
  };

  console.debug = (...args) => {
    addToBuffer('debug', args);
    originalConsole.debug.apply(console, args);
  };

  // Also capture unhandled errors
  window.addEventListener('error', (event) => {
    addToBuffer('uncaught_error', [
      `Uncaught error: ${event.message}`,
      `at ${event.filename}:${event.lineno}:${event.colno}`
    ]);
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    addToBuffer('unhandled_rejection', [
      `Unhandled promise rejection: ${event.reason}`
    ]);
  });

  isInitialized = true;
  originalConsole.log('[ConsoleCapture] Initialized');
}

/**
 * Get current log buffer (copy)
 */
export function getLogBuffer() {
  return [...logBuffer];
}

/**
 * Clear the log buffer
 */
export function clearLogBuffer() {
  logBuffer.length = 0;
}

/**
 * Get browser/environment info for debugging
 */
export function getEnvironmentInfo() {
  return {
    userAgent: navigator.userAgent,
    url: window.location.href,
    timestamp: new Date().toISOString(),
    screenSize: `${window.screen.width}x${window.screen.height}`,
    windowSize: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    online: navigator.onLine,
    referrer: document.referrer || null
  };
}
