export interface JobListing {
  id: string;
  author: string;
  content: string;
  postedAt: string;
  url: string;
}

export interface ParsedJobListing {
  id: string;
  author: string;
  postedAt: string;
  url: string;
  company: string;
  position: string;
  location: string;
  salary: string;
  requirements: string[];
  contactInfo: string;
  fullContent: string;
} 