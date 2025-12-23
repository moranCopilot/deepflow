/**
 * API Configuration
 * Automatically detects the API base URL based on the environment
 */

function getApiBaseUrl(): string {
  // If environment variable is set, use it
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // In production, use relative URLs (same domain as frontend)
  if (import.meta.env.PROD) {
    return '';
  }
  
  // In development, use localhost
  return 'http://localhost:3000';
}

function getWebSocketUrl(): string {
  // If environment variable is set, use it
  if (import.meta.env.VITE_WS_URL) {
    return import.meta.env.VITE_WS_URL;
  }
  
  // In production, use wss:// or ws:// based on current protocol
  if (import.meta.env.PROD) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}`;
  }
  
  // In development, use localhost
  return 'ws://localhost:3000';
}

export const API_BASE_URL = getApiBaseUrl();
export const WS_URL = getWebSocketUrl();

export function getApiUrl(path: string): string {
  const baseUrl = API_BASE_URL;
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  
  // If baseUrl is empty (relative path), return the path directly
  if (!baseUrl) {
    return cleanPath;
  }
  
  // If baseUrl ends with slash, remove it to avoid double slashes
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  return `${cleanBaseUrl}${cleanPath}`;
}

// Debug function to log API configuration
console.log('API Configuration:', {
  API_BASE_URL: API_BASE_URL || '(relative)',
  WS_URL,
  PROD: import.meta.env.PROD,
  exampleUrl: getApiUrl('/api/analyze'),
  currentLocation: typeof window !== 'undefined' ? window.location.href : 'N/A'
});

