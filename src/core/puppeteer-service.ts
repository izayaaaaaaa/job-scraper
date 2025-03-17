import { Page } from 'puppeteer';
import { BrowserManager } from './browser-manager';
import { PuppeteerTask, PuppeteerTaskResult } from '../types/puppeteer-types';
import { getLogger, logError } from './logger';
import { NavigationError, toPuppeteerError } from './errors';

// Get a component-specific logger
const logger = getLogger('puppeteer');

export class PuppeteerService {
  private browserManager: BrowserManager;

  constructor() {
    this.browserManager = BrowserManager.getInstance();
  }

  /**
   * Execute a puppeteer task with a provided function
   * This is the parent function that accepts different task implementations
   */
  public async executeTask<T extends PuppeteerTaskResult>(
    taskId: string,
    taskFn: PuppeteerTask<T>,
    url: string,
    options?: any
  ): Promise<T> {
    let page: Page | null = null;
    
    try {
      // Get a page from the pool
      page = await this.browserManager.getPage(taskId);
      
      // Navigate to the URL if provided
      if (url) {
        try {
          await page.goto(url, { waitUntil: 'networkidle2' });
        } catch (navError) {
          // Create a specific navigation error with context
          throw new NavigationError(`Failed to navigate to ${url}`, {
            taskId,
            url,
            originalError: navError
          });
        }
      }
      
      // Execute the task-specific function
      const result = await taskFn(page, options);
      
      return result;
    } catch (error) {
      // Convert to PuppeteerError if it's not already and add task context
      const puppeteerError = toPuppeteerError(error, { taskId, url });
      
      // Log with rich context
      logError(logger, `Error executing Puppeteer task:`, puppeteerError, { taskId, url });
      
      // Re-throw for the server to handle
      throw puppeteerError;
    } finally {
      // Optionally release the page or keep it in the pool based on your strategy
      if (options?.releasePage && page) {
        await this.browserManager.releasePage(taskId);
      }
    }
  }
  
  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    await this.browserManager.closeBrowser();
  }
} 