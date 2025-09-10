// Application Configuration
let appConfig = {
    API_BASE_URL: null, // Will be loaded dynamically
    TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24 hours
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    IMAGE_MAX_SIZE: 5 * 1024 * 1024, // 5MB
    ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
};

// Dynamic configuration loading
let configLoaded = false;

// Helper function to get API URL with fallback
window.getAPIURL = function() {
    if (appConfig.API_BASE_URL) {
        return appConfig.API_BASE_URL;
    }
    // Fallback URL if config hasn't loaded yet
    return 'http://localhost:5000/api';
};

// Helper function to get base URL
window.getBaseURL = function() {
    const apiURL = getAPIURL();
    return apiURL.replace('/api', '');
};

// Load configuration from backend
async function loadConfig() {
    try {
        const baseURL = 'http://localhost:5000'; // Initial base URL for config endpoint
        const response = await fetch(`${baseURL}/config/api-config`);
        
        if (response.ok) {
            const config = await response.json();
            appConfig.API_BASE_URL = config.apiBaseUrl;
            configLoaded = true;
            console.log('Configuration loaded successfully:', config);
        } else {
            console.warn('Failed to load configuration from server, using fallback');
        }
    } catch (error) {
        console.warn('Error loading configuration:', error.message, '- using fallback');
    }
}

// Load config immediately
loadConfig();

// Make config available globally
window.config = appConfig;
