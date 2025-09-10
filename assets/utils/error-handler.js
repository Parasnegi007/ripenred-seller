// Error handling utilities
import config from '../../config.js';
import { showNotification } from './notifications.js';

export async function handleError(error) {
  if (error.response?.status === 401) {
    return handleAuthError(error);
  }

  if (error.message === 'Network Error') {
    return handleNetworkError(error);
  }

  handleGenericError(error);
  return Promise.reject(error);
}

async function handleAuthError(error) {
  try {
    const newToken = await refreshToken();
    if (newToken) {
      // Retry the original request
      const originalRequest = error.config;
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      return axios(originalRequest);
    }
  } catch (refreshError) {
    console.error('Token refresh failed:', refreshError);
    logout();
  }
  return Promise.reject(error);
}

async function handleNetworkError(error, retryCount = 0) {
  if (retryCount < 3) {
    await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
    return axios(error.config);
  }
  showNotification('Network error. Please check your connection.', 'error');
  return Promise.reject(error);
}

function handleGenericError(error) {
  const message = error.response?.data?.message || 'An unexpected error occurred';
  showNotification(message, 'error');
}
