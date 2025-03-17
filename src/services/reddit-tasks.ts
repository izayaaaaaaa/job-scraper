import { Page } from 'puppeteer';
import { PuppeteerTask } from '../types/puppeteer-types';
import { JobListing } from '../types/reddit-types';
import { getLogger } from '../core/logger';
import { ScrapingError } from '../core/errors';
import fs from 'fs';

// Get a component-specific logger
const logger = getLogger('reddit-tasks');

interface RedditScrapingResult {
  success: boolean;
  data?: JobListing[];
  error?: string;
}

/**
 * Task function to scrape job listings from a Reddit thread
 */
export const scrapeRedditJobListings: PuppeteerTask<RedditScrapingResult> = async (
  page: Page,
  options?: {
    url?: string;
  }
) => {
  if (!options?.url) {
    return {
      success: false,
      error: 'Reddit URL is required'
    };
  }

  const url = options.url;
  
  try {
    logger.info(`Navigating to ${url}`);
    
    // Increase timeout and use domcontentloaded which is faster than networkidle2
    await page.goto(url, { 
      waitUntil: 'domcontentloaded', 
      timeout: 60000 // Increase timeout to 60 seconds
    });
    
    logger.info('Page loaded, waiting for content to be ready');
    
    // Accept cookies if the dialog appears
    try {
      const cookieButton = await page.$('button[data-testid="COOKIE-ACCEPT-BUTTON"]');
      if (cookieButton) {
        await cookieButton.click();
        await page.waitForTimeout(1000);
      }
    } catch (error) {
      logger.warn('No cookie dialog found or failed to click');
    }
    
    // Wait for comments to load with a more specific selector
    await page.waitForSelector('div[id$="-comment-rtjson-content"]', { 
      timeout: 30000,
      visible: true 
    });
    
    logger.info('Initial comments loaded, scrolling to load all comments');
    
    // Scroll to the bottom of the page multiple times to load all comments
    const scrollDelay = 2000;
    const maxScrolls = 15; // Increase to ensure we get past deleted comments
    let previousCommentCount = 0;
    let sameCountIterations = 0;

    for (let i = 0; i < maxScrolls; i++) {
      logger.info(`Scroll iteration ${i + 1}/${maxScrolls}`);
      
      // Scroll to the bottom of the page
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
      });
      
      // Wait for more content to load
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
      
      // Check if we've loaded more comments
      const currentCommentCount = await page.evaluate(() => {
        return document.querySelectorAll('div[id$="-comment-rtjson-content"]').length;
      });
      
      logger.info(`Found ${currentCommentCount} comments after scroll ${i + 1}`);
      
      // Try to click "load more" buttons if available
      const clickedLoadMore = await page.evaluate(() => {
        const loadMoreButtons = Array.from(document.querySelectorAll('button')).filter(
          button => button.textContent?.includes('load more comments') || 
                    button.textContent?.includes('Continue this thread') ||
                    button.textContent?.includes('View more comments')
        );
        
        let clicked = false;
        loadMoreButtons.forEach(button => {
          button.click();
          clicked = true;
        });
        
        return clicked;
      });
      
      if (clickedLoadMore) {
        logger.info('Clicked "load more" buttons, waiting for content to load');
        await new Promise(resolve => setTimeout(resolve, scrollDelay));
      }
      
      // If comment count hasn't changed for 3 consecutive scrolls, we've probably reached the end
      if (currentCommentCount === previousCommentCount) {
        sameCountIterations++;
        if (sameCountIterations >= 3) {
          logger.info(`Comment count stable at ${currentCommentCount} for 3 scrolls, considering complete`);
          break;
        }
      } else {
        sameCountIterations = 0;
        previousCommentCount = currentCommentCount;
      }
      
      // Alternative approach: scroll to 80% of current height to get past any potential obstacles
      if (i % 3 === 2) { // Every third scroll
        await page.evaluate(() => {
          const height = document.body.scrollHeight;
          window.scrollTo(0, height * 0.8); // Scroll to 80% of total height
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    logger.info('Finished scrolling, extracting data');
    
    // Extract the HTML for debugging (outside of evaluate)
    const commentsHtml = await page.content();
    fs.writeFileSync('page-content.html', commentsHtml);
    
    // Extract job listings with the new structure
    const jobListings = await page.evaluate(() => {
      const listings: JobListing[] = [];
      // Target the shreddit comments
      const comments = document.querySelectorAll('div[id$="-comment-rtjson-content"]');
      
      // Can't use fs here - remove this line
      // fs.writeFileSync('comments.json', JSON.stringify(comments, null, 2));
      
      console.log(`Found ${comments.length} comments`);
      
      Array.from(comments).forEach((comment, index) => {
        try {
          // Check if this is a job post (exclude OP and other non-job comments)
          const paragraphs = comment.querySelectorAll('p');
          
          // Skip if too short to be a job post
          if (paragraphs.length < 3) return;
          
          // Extract author information
          const authorElement = comment.closest('[data-testid="comment"]')?.querySelector('[data-testid="comment_author"]');
          const author = authorElement?.textContent?.trim() || 'Unknown';
          
          // Extract comment ID from the comment element ID
          const idMatch = comment.id.match(/t1_([a-zA-Z0-9]+)-comment/);
          const id = idMatch ? idMatch[1] : `comment-${index}`;
          
          // Extract timestamp
          const timestampElement = comment.closest('[data-testid="comment"]')?.querySelector('time');
          const postedAt = timestampElement?.textContent?.trim() || '';
          
          // Build the URL based on the comment ID
          const url = `${window.location.origin}${window.location.pathname}?comment=${id}`;
          
          // Extract content from paragraphs
          let content = '';
          paragraphs.forEach(p => {
            content += p.textContent?.trim() + '\n';
          });
          
          listings.push({
            id,
            author,
            content,
            postedAt,
            url
          });
        } catch (e) {
          console.error('Error parsing comment:', e);
        }
      });
      
      return listings;
    });
    
    logger.info(`Scraped ${jobListings.length} job listings`);
    
    // Save the jobListings to a file for debugging
    fs.writeFileSync('job-listings.json', JSON.stringify(jobListings, null, 2));
    
    return {
      success: true,
      data: jobListings
    };
    
  } catch (error) {
    logger.error('Error scraping Reddit thread', { error });
    
    // Try to capture the page state even if we hit an error
    try {
      const errorHtml = await page.content();
      fs.writeFileSync('error-page.html', errorHtml);
      logger.info('Captured error page HTML for debugging');
    } catch (e) {
      logger.warn('Could not capture error page content', { error: e });
    }
    
    throw new ScrapingError('Failed to scrape Reddit job listings', { 
      url, 
      originalError: error 
    });
  }
};

/**
 * Parse job details from the raw content
 */
export function parseJobDetails(listings: JobListing[]): any[] {
  return listings.map(listing => {
    const parsedData = {
      id: listing.id,
      author: listing.author,
      postedAt: listing.postedAt,
      url: listing.url,
      company: extractCompany(listing.content),
      position: extractPosition(listing.content),
      location: extractLocation(listing.content),
      salary: extractSalary(listing.content),
      requirements: extractRequirements(listing.content),
      contactInfo: extractContactInfo(listing.content),
      fullContent: listing.content
    };
    
    return parsedData;
  });
}

function extractCompany(content: string): string {
  const match = content.match(/Company:?\s*([^\n]+)/i) || 
                content.match(/^([^:\n]+(?:Inc|LLC|Ltd|Co\.|Company).+)$/im);
  return match ? match[1].trim() : '';
}

function extractPosition(content: string): string {
  const match = content.match(/Position:?\s*([^\n]+)/i) || 
                content.match(/Role:?\s*([^\n]+)/i) ||
                content.match(/Job Title:?\s*([^\n]+)/i) ||
                content.match(/The Job:.*\n.*Position:?\s*([^\n]+)/is);
  return match ? match[1].trim() : '';
}

function extractLocation(content: string): string {
  const match = content.match(/Location:?\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function extractSalary(content: string): string {
  const match = content.match(/Salary:?\s*([^\n]+)/i) ||
                content.match(/Compensation:?\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
}

function extractRequirements(content: string): string[] {
  const reqSection = content.match(/Requirements:?\s*([\s\S]*?)(?:\n\n|\n[A-Z]|$)/i);
  if (!reqSection) return [];
  
  return reqSection[1]
    .split('\n')
    .map(line => line.replace(/^[-•*]\s*/, '').trim())
    .filter(line => line.length > 0);
}

function extractContactInfo(content: string): string {
  const match = content.match(/Contact:?\s*([^\n]+)/i) ||
                content.match(/Email:?\s*([^\n]+)/i);
  return match ? match[1].trim() : '';
} 