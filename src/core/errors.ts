/**
 * Base error class for the Puppeteer service
 * Maintains context data that can be passed through the error chain
 */
export class PuppeteerError extends Error {
  public context: Record<string, any>;

  constructor(message: string, context: Record<string, any> = {}) {
    super(message);
    this.name = 'PuppeteerError';
    this.context = context;
  }

  /**
   * Enrich the error with additional context
   */
  public enrich(additionalContext: Record<string, any>): this {
    this.context = {
      ...this.context,
      ...additionalContext
    };
    return this;
  }
}

/**
 * Error thrown during browser/page management
 */
export class BrowserError extends PuppeteerError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, context);
    this.name = 'BrowserError';
  }
}

/**
 * Error thrown during navigation or page interaction
 */
export class NavigationError extends PuppeteerError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, context);
    this.name = 'NavigationError';
  }
}

/**
 * Error thrown during scraping operations
 */
export class ScrapingError extends PuppeteerError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, context);
    this.name = 'ScrapingError';
  }
}

/**
 * Error thrown during validation (missing inputs, etc)
 */
export class ValidationError extends PuppeteerError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, context);
    this.name = 'ValidationError';
  }
}

/**
 * Convert any error to a PuppeteerError
 */
export function toPuppeteerError(error: unknown, context: Record<string, any> = {}): PuppeteerError {
  if (error instanceof PuppeteerError) {
    return error.enrich(context);
  }
  
  return new PuppeteerError(
    error instanceof Error ? error.message : String(error),
    {
      originalError: error,
      stack: error instanceof Error ? error.stack : undefined,
      ...context
    }
  );
} 