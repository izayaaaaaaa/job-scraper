import puppeteer from 'puppeteer-extra';
import * as puppeteerType from 'puppeteer';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { getLogger } from '../utils/logger';
import { BrowserError, toPuppeteerError } from '../utils/errors';

// Register the stealth plugin
puppeteer.use(StealthPlugin());

// Get a component-specific logger
const logger = getLogger('browser');

/**
 * Manages a single browser instance for efficient resource usage
 */
export class BrowserManager {
  private static instance: BrowserManager;
  private browser: puppeteerType.Browser | null = null;
  private pagePool: Map<string, puppeteerType.Page> = new Map();

  private constructor() {}

  public static getInstance(): BrowserManager {
    if (!BrowserManager.instance) {
      BrowserManager.instance = new BrowserManager();
    }
    return BrowserManager.instance;
  }

  /**
   * Initialize the browser if not already initialized
   */
  public async initBrowser(): Promise<puppeteerType.Browser> {
    if (!this.browser) {
      try {
        this.browser = await puppeteer.launch({
          headless: false,
          defaultViewport: { width: 2560, height: 1080 },
          args: ['--no-sandbox', '--start-fullscreen'],
          protocolTimeout: 60000,
        });
        logger.info('Browser instance initialized');
      } catch (error) {
        throw new BrowserError('Failed to initialize browser', { 
          originalError: error 
        });
      }
    }
    return this.browser;
  }

  /**
   * Get a page by ID or create a new one
   */
  public async getPage(id: string): Promise<puppeteerType.Page> {
    try {
      if (this.pagePool.has(id)) {
        logger.debug(`Using existing page for task ID: ${id}`);
        return this.pagePool.get(id)!;
      }
      
      const browser = await this.initBrowser();
      const page = await browser.newPage();
      this.pagePool.set(id, page);
  
      logger.info('Page created', { taskId: id, poolSize: this.pagePool.size });
  
      return page;
    } catch (error) {
      throw new BrowserError('Failed to get page', {
        taskId: id,
        poolSize: this.pagePool.size,
        originalError: error
      });
    }
  }

  /**
   * Release a page from the pool
   */
  public async releasePage(id: string): Promise<void> {
    try {
      if (this.pagePool.has(id)) {
        const page = this.pagePool.get(id)!;
        await page.close();
        this.pagePool.delete(id);
        logger.debug(`Released page for task ID: ${id}`, { poolSize: this.pagePool.size });
      }
    } catch (error) {
      // Log but don't throw for cleanup operations
      logger.error(`Error releasing page for task ID: ${id}`, {
        error: error instanceof Error ? error.message : String(error),
        taskId: id
      });
    }
  }

  /**
   * Close the browser and clear all resources
   */
  public async closeBrowser(): Promise<void> {
    try {
      if (this.browser) {
        logger.info(`Closing browser and cleaning up ${this.pagePool.size} pages`);
        for (const [id, page] of this.pagePool) {
          try {
            await page.close();
            this.pagePool.delete(id);
          } catch (pageError) {
            logger.warn(`Error closing page ${id}`, { 
              error: pageError instanceof Error ? pageError.message : String(pageError) 
            });
          }
        }
        await this.browser.close();
        this.browser = null;
        logger.info('Browser closed');
      }
    } catch (error) {
      // Log but don't throw for cleanup operations
      logger.error('Error closing browser', { 
        error: error instanceof Error ? error.message : String(error),
        pagesRemaining: this.pagePool.size
      });
    }
  }
} 