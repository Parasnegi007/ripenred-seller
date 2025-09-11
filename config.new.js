/**
 * Seller Dashboard API Configuration
 * Mirrors store/assets/config.js behavior for consistent local/prod setup
 */

// Single source of truth (shared name with storefront for consistency)
window.API_CONFIG = window.API_CONFIG || null;

// Load configuration from backend (relative to current origin)
async function loadAPIConfig() {
  try {
    const response = await fetch('/api/config/api-config');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const config = await response.json();

    // Normalize and store
    const baseUrl = (config.API_BASE_URL || config.apiBaseUrl || '').replace(/\/$/, '');
    window.API_CONFIG = {
      BASE_URL: baseUrl,
      API_URL: baseUrl + '/api'
    };

    console.log('✅ [Seller] API Configuration loaded:', window.API_CONFIG);
    return window.API_CONFIG;
  } catch (error) {
    console.error('❌ [Seller] Failed to load API configuration:', error);
    // Fallback to current domain if config loading fails (works for local dev)
    const fallbackURL = window.location.origin.replace(/\/$/, '');
    window.API_CONFIG = {
      BASE_URL: fallbackURL,
      API_URL: fallbackURL + '/api'
    };
    console.warn('⚠️ [Seller] Using fallback API configuration:', window.API_CONFIG);
    return window.API_CONFIG;
  }
}

// Helper function to get API URL (used by other scripts)
function getAPIURL() {
  if (!window.API_CONFIG) {
    // Return fallback immediately, config will update later
    return window.location.origin.replace(/\/$/, '') + '/api';
  }
  // Prefer explicit API_URL if present, else derive from BASE_URL
  return window.API_CONFIG.API_URL || (window.API_CONFIG.BASE_URL + '/api');
}

// Helper function to get base URL
function getBaseURL() {
  if (!window.API_CONFIG) {
    return window.location.origin.replace(/\/$/, '');
  }
  return window.API_CONFIG.BASE_URL;
}

// Auto-load configuration when script loads
loadAPIConfig();

// Export a seller-specific accessor to avoid ambiguity if both configs are on the same page
window.sellerConfig = {
  loadAPIConfig,
  getAPIURL,
  getBaseURL,
};

// Optional: expose limits used by seller dashboard
window.SELLER_LIMITS = {
  TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes
  IMAGE_MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};
