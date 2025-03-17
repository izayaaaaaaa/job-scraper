import { Request, Response } from 'express';
import { getLogger } from '../utils/logger';
import { PuppeteerService } from '../core/puppeteer-service';
import { ParsedJobListing } from '../types/reddit-types';
import { scrapeRedditJobListings, parseJobDetails } from '../services/reddit-service';
import { PuppeteerError, ValidationError } from '../utils/errors';

const logger = getLogger('reddit-controller');

export class RedditController {
  private puppeteerService: PuppeteerService;
  
  constructor(puppeteerService: PuppeteerService) {
    this.puppeteerService = puppeteerService;
  }
  
  async getJobListings(req: Request, res: Response): Promise<void> {
    try {
      const url = 'https://www.reddit.com/r/PinoyProgrammer/comments/1j0m8iv/who_is_hiring_march_2025/?sort=new';
      
      // Generate a unique task ID for this request
      const taskId = `reddit-task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      logger.info(`Starting Reddit job scraping task ${taskId}`, { taskId, url });
      
      // Execute the Reddit scraping task
      const scrapingResult = await this.puppeteerService.executeTask(
        taskId,
        scrapeRedditJobListings,
        '',  // URL is passed in options
        { 
          url,
          releasePage: true
        }
      );
      
      if (!scrapingResult.success || !scrapingResult.data) {
        res.status(500).json({
          success: false,
          error: scrapingResult.error || 'Failed to scrape job listings'
        });
        return;  // Just return without returning the response
      }
      
      // Parse job details
      const parsedListings = parseJobDetails(scrapingResult.data);
    //   logger.debug('Parsed job listings:', { parsedListings });
      
      res.status(200).json({
        success: true,
        data: parsedListings
      });
    } catch (error) {
      // Handle errors based on their type
      if (error instanceof ValidationError) {
        // Validation errors (400 Bad Request)
        logger.error('Validation error in Reddit job scraping request:', { error });
        res.status(400).json({ 
          success: false, 
          error: error.message
        });
        return;  // Just return without returning the response
      } else if (error instanceof PuppeteerError) {
        // Known Puppeteer errors (500 Internal Server Error, but with context)
        logger.error('Error processing Reddit job scraping request:', { error });
        res.status(500).json({ 
          success: false, 
          error: error.message,
          errorType: error.name
        });
        return;  // Just return without returning the response
      } else {
        // Unknown errors (500 Internal Server Error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Unexpected error in Reddit job scraping request:', { error });
        res.status(500).json({ 
          success: false, 
          error: `Server error: ${errorMessage}` 
        });
        return;  // Just return without returning the response
      }
    }
  }
} 