import express from 'express';
import { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { PuppeteerService } from './core/puppeteer-service';
import { getAppLogger, logError } from './utils/logger';
import { PuppeteerError, ValidationError } from './utils/errors';
import { RedditController } from './controllers/reddit-controller';

// Get the application logger
const logger = getAppLogger();

// Initialize express app
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(express.static('screenshots'));

// Create a single PuppeteerService instance to reuse across requests
const puppeteerService = new PuppeteerService();

// Initialize controllers - pass the puppeteerService instance
const redditController = new RedditController(puppeteerService);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  logger.info('Health check endpoint called');
  res.status(200).json({ status: 'healthy' });
});

// Start the server
app.listen(port, async () => {
  logger.info(`CL-Puppeteer service running on port ${port}`, { port });
  
  // Initialize the browser
  try {
    const taskId = `browser-init-${Date.now()}`;
    await puppeteerService.executeTask(
      taskId,
      async (page) => ({ success: true }),
      '',
      { releasePage: false }
    );

    // Run the initial job scrape
    setTimeout(async () => {
      try {
        logger.info('Performing initial Reddit job scrape');
        await redditController.getJobListings({} as Request, {
          status: () => ({ json: () => {} }),
          json: (data: { data?: any[] }) => {
            logger.info(`Initial Reddit scrape complete, found ${data.data?.length || 0} jobs`);
          }
        } as any);
      } catch (error) {
        logger.error('Error during initial Reddit scrape', { error });
      }
    }, 5000); // Wait 5 seconds after server start to run the initial scrape
    
  } catch (error) {
    logger.error('Failed to initialize browser on startup', { error });
  }

  // Set up periodic job scraping (every 1 hour)
  setInterval(async () => {
    try {
      logger.info('Running scheduled Reddit job scrape');
      await redditController.getJobListings({} as Request, {
        status: () => ({ json: () => {} }),
        json: (data: { data?: any[] }) => {
          logger.info(`Scheduled Reddit scrape complete, found ${data.data?.length || 0} jobs`);
        }
      } as any);
    } catch (error) {
      logger.error('Error during scheduled Reddit scrape', { error });
    }
  }, 60 * 60 * 1000); // Every hour
});

// Add routes for Reddit job listings
app.get('/api/jobs', (req, res) => redditController.getJobListings(req, res));