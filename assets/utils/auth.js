import { showNotification } from './notifications.js';
import config from '../../config.js';

class AuthManager {
    constructor() {
        this.authToken = null;
        this.refreshToken = null;
        this.sellerInfo = null;
        this.tokenExpiry = null;
    }

    init() {
        this.authToken = localStorage.getItem('sellerAuthToken');
        this.refreshToken = localStorage.getItem('refreshToken');
        this.tokenExpiry = localStorage.getItem('tokenExpiry');
        const storedSellerInfo = localStorage.getItem('sellerInfo');

        if (storedSellerInfo) {
            try {
                this.sellerInfo = JSON.parse(storedSellerInfo);
            } catch (e) {
                console.error('Error parsing seller info:', e);
            }
        }

        // Set up token refresh interval
        this.setupTokenRefresh();
    }

    setupTokenRefresh() {
        if (this.tokenExpiry) {
            const timeToExpiry = new Date(this.tokenExpiry) - new Date();
            if (timeToExpiry > 0) {
                // Refresh 5 minutes before expiry
                setTimeout(() => this.refreshAuthToken(), timeToExpiry - 5 * 60 * 1000);
            }
        }
    }

    async refreshAuthToken() {
        try {
            const response = await fetch(`${config.API_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refreshToken: this.refreshToken })
            });

            const data = await response.json();
            if (data.token) {
                this.setTokens(data.token, data.refreshToken, data.expiresIn);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token refresh failed:', error);
            this.logout();
            return false;
        }
    }

    setTokens(token, refreshToken, expiresIn) {
        this.authToken = token;
        this.refreshToken = refreshToken;
        this.tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

        localStorage.setItem('sellerAuthToken', token);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('tokenExpiry', this.tokenExpiry);

        this.setupTokenRefresh();
    }

    isAuthenticated() {
        return !!this.authToken && new Date(this.tokenExpiry) > new Date();
    }

    getAuthHeaders() {
        return {
            'Authorization': `Bearer ${this.authToken}`,
            ...config.SECURITY_HEADERS
        };
    }

    logout() {
        localStorage.removeItem('sellerAuthToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenExpiry');
        localStorage.removeItem('sellerInfo');
        
        this.authToken = null;
        this.refreshToken = null;
        this.sellerInfo = null;
        this.tokenExpiry = null;

        showNotification('Logged out successfully', 'success');
        setTimeout(() => {
            window.location.href = 'seller.html';
        }, 1000);
    }
}

export const authManager = new AuthManager();
export default authManager;
