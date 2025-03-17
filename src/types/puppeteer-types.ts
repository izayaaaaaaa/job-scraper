import { Page } from 'puppeteer';

declare module 'puppeteer' {
  interface Page {
    waitForTimeout(timeout: number): Promise<void>;
  }
}

// Base interface for task results
export interface PuppeteerTaskResult {
  [key: string]: any;
}

// Profile Analysis result interface
export interface ProfileAnalysisResult extends PuppeteerTaskResult {
  profileData?: {
    followers?: number;
    posts?: number;
    engagement?: number;
    // Add more fields as needed
  };
}

// Video Analysis result interface
export interface VideoAnalysisResult extends PuppeteerTaskResult {
  videoData?: {
    views?: number;
    likes?: number;
    comments?: number;
    // Add more fields as needed
  };
}

// Campaign Creation result interface
export interface CampaignCreationResult extends PuppeteerTaskResult {
  campaignId?: string;
  triggerIds?: string[];
}

// TikTok Post Analytics result interface
export interface TikTokPostAnalyticsResult extends PuppeteerTaskResult {
  videoData?: {
    views?: number;
    likes?: number;
    comments?: number;
    shares?: number;
  };
  profileData?: {
    followers?: number;
  };
  screenshots?: {
    videoScreenshot?: string; // path or base64 data
    viewsScreenshot?: string; // path or base64 data
  };
}

// Type for task functions
export type PuppeteerTask<T extends PuppeteerTaskResult> = (
  page: Page,
  options?: any
) => Promise<T>; 