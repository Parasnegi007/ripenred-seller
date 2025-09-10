// API utilities and axios instance configuration
import config from '../../config.js';
import { handleError } from './error-handler.js';

const axiosInstance = axios.create({
  baseURL: config.API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
  headers: {
    ...config.SECURITY_HEADERS
  }
});

// Request interceptor
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sellerAuthToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    return handleError(error);
  }
);

export default axiosInstance;
