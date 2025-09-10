// Simple Order Notification System
class NotificationManager {
  constructor() {
    this.sellerId = null;
    this.baseUrl = this.getBaseUrl();
    
    this.initializeToastr();
  }

  // Get the correct base URL for API calls
  getBaseUrl() {
    // Use current origin or localhost for development
    return window.location.protocol === 'file:' 
      ? 'http://localhost:5000' 
      : window.location.origin;
  }

  // Initialize Toastr configuration
  initializeToastr() {
    if (typeof toastr !== 'undefined') {
      toastr.options = {
        closeButton: true,
        timeOut: 6000,
        progressBar: true,
        preventDuplicates: true,
        positionClass: 'toast-top-right',
        showMethod: 'slideDown',
        hideMethod: 'slideUp',
        extendedTimeOut: 2000,
        tapToDismiss: true
      };
    }
  }

  // Request notification permissions proactively
  async requestNotificationPermissions() {
    if ('Notification' in window) {
      const currentPermission = Notification.permission;
      
      if (currentPermission === 'default') {
        try {
          const permission = await Notification.requestPermission();
          
          if (permission === 'granted') {
            this.showNotification('Great! You\'ll receive browser notifications for new orders.', 'success', '🔔 Notifications Enabled');
          } else if (permission === 'denied') {
            this.showNotification('Browser notifications disabled. You\'ll still get in-app alerts.', 'warning', '⚠️ Limited Notifications');
          }
        } catch (error) {
          console.warn('Could not request notification permissions:', error.message);
          this.showNotification('Could not request notification permissions', 'warning');
        }
      } else if (currentPermission === 'denied') {
        this.showNotification('Browser notifications are blocked. Enable them in browser settings for order alerts.', 'info', 'ℹ️ Notification Info');
      }
    }
  }

  // Initialize notification system without Socket.IO (Email & Push only)
  async initialize(sellerId) {
    this.sellerId = sellerId;
    console.log('🔔 Initializing notification system for seller:', sellerId);
    
    try {
      // Request notification permissions
      await this.requestNotificationPermissions();
      
      // Initialize push notifications for browser notifications (non-blocking)
      await this.initializePushNotifications();
      
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocalhost) {
        console.log('✅ Development notification system ready (Email + Browser notifications)');
        this.showNotification('Development mode ready! Email notifications will work for real orders.', 'success', '🔔 Dev Mode Ready');
      } else {
        console.log('✅ Notification system ready (Email + Browser + Push notifications)');
        this.showNotification('Notification system ready! You\'ll receive email and browser alerts for new orders.', 'success', '🔔 Notifications Ready');
      }
      
      
    } catch (error) {
      console.error('❌ Notification system initialization failed:', error);
      this.showNotification('Notification system ready with basic features. Email notifications will work.', 'info', '🔔 Basic Notifications');
    }
  }

  // Initialize Push Notifications (register for push service)
  async initializePushNotifications() {
    // Check if we're on localhost - skip push notifications entirely
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      console.log('💻 Development mode: Skipping push notifications (use HTTPS for full push support)');
      return;
    }
    
    try {
      // Check for push notification API support
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.log('📴 Push notifications not supported by this browser');
        return;
      }
      
      // Try to get VAPID public key from backend
      await this.registerForPushNotifications();
      
      console.log('✅ Push notification setup completed');
    } catch (error) {
      console.warn('⚠️ Push notification setup failed:', error.message);
      // Don't throw error - push notifications are optional
    }
  }

  // Register for push notifications with backend
  async registerForPushNotifications() {
    try {
      // Check if we're on localhost (push notifications have limited support on localhost)
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      
      if (isLocalhost) {
        console.log('💻 Running on localhost - Push notifications have limited functionality');
        // Still try to register, but don't throw errors if it fails
      }
      
      // Get VAPID public key from backend
      const response = await fetch(`${getAPIURL()}/notifications/vapid-public-key`);
      if (!response.ok) {
        throw new Error('Failed to get VAPID key from backend');
      }
      
      const { publicKey } = await response.json();
      if (!publicKey) {
        throw new Error('No VAPID public key received from backend');
      }
      
      console.log('✅ VAPID public key retrieved from backend');
      
      // Register service worker (basic one for push notifications)
      let swRegistration;
      try {
        swRegistration = await navigator.serviceWorker.register('/seller-dashboard/sw.js');
        console.log('✅ Service worker registered successfully');
        
        // Wait for service worker to be ready
        await navigator.serviceWorker.ready;
      } catch (swError) {
        throw new Error(`Service worker registration failed: ${swError.message}`);
      }
      
      // Check if push manager is available
      if (!swRegistration.pushManager) {
        throw new Error('Push notifications not supported by this browser/environment');
      }
      
      // Subscribe to push notifications
      let subscription;
      try {
        // Check if already subscribed
        const existingSubscription = await swRegistration.pushManager.getSubscription();
        if (existingSubscription) {
          console.log('✅ Using existing push subscription');
          subscription = existingSubscription;
        } else {
          subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: this.urlBase64ToUint8Array(publicKey)
          });
          console.log('✅ New push subscription created successfully');
        }
      } catch (subscribeError) {
        // More specific error handling
        if (subscribeError.name === 'NotSupportedError') {
          throw new Error('Push notifications not supported on this device/browser');
        } else if (subscribeError.name === 'NotAllowedError') {
          throw new Error('Push notifications permission denied');
        } else if (subscribeError.message.includes('network')) {
          throw new Error('Network error during push subscription (common on localhost)');
        } else {
          // For localhost, provide a friendly message instead of error
          const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (isLocalhost) {
            console.log('💻 Push notifications not available on localhost - this is normal');
            return; // Exit gracefully
          }
          throw new Error(`Push subscription failed: ${subscribeError.message}`);
        }
      }
      
      // Send subscription to backend
      const authToken = localStorage.getItem('sellerAuthToken');
      if (authToken) {
        try {
          const registerResponse = await fetch(`${getAPIURL()}/notifications/subscribe-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ subscription })
          });
          
          if (registerResponse.ok) {
            console.log('✅ Push notifications registered with backend successfully');
          } else {
            console.warn('⚠️ Backend registration failed, but local notifications will still work');
          }
        } catch (backendError) {
          console.warn('⚠️ Backend registration failed:', backendError.message);
          // Don't throw - local notifications can still work
        }
      } else {
        console.warn('⚠️ No auth token found - skipping backend registration');
      }
      
    } catch (error) {
      console.warn('⚠️ Push notification registration failed:', error.message);
      
      // If we're on localhost, don't throw the error - just log it
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalhost) {
        console.log('💻 Push notifications disabled on localhost - this is normal for development');
        console.log('✅ Browser notifications and email notifications will still work fine');
        return; // Don't throw
      }
      
      throw error;
    }
  }
  
  // Convert VAPID key to Uint8Array
  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Handle specifically order notifications
  handleOrderNotification(notification) {
    console.log('🛒 New Order Notification:', notification);
    
    // Show prominent order notification
    this.showNotification(notification.message, 'success', notification.title);
    
    // Play order sound (different from regular notifications)
    this.playOrderSound();
    
    // Update order counter
    this.updateOrderCounter();
    
    // Store order notification
    this.storeNotificationHistory({...notification, category: 'order'});
    
    // Show browser notification if supported (simple version)
    this.showBrowserNotification(notification);
  }
  
  // Simple browser notification (no service worker needed)
  showBrowserNotification(notification) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message,
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%234ade80"><path d="M7 4V2C7 1.45 7.45 1 8 1H16C16.55 1 17 1.45 17 2V4H20C20.55 4 21 4.45 21 5S20.55 6 20 6H19V19C19 20.1 18.1 21 17 21H7C5.9 21 5 20.1 5 19V6H4C3.45 6 3 5.55 3 5S3.45 4 4 4H7ZM9 3V4H15V3H9ZM7 6V19H17V6H7Z"/></svg>'
      });
    } else if ('Notification' in window && Notification.permission === 'default') {
      // Ask for permission once
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(notification.title, {
            body: notification.message
          });
        }
      });
    }
  }
  
  // Play special sound for orders
  playOrderSound() {
    try {
      // Different sound for orders - more prominent
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt459NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OU');
      audio.volume = 0.5; // Louder for orders
      audio.play().catch(() => {}); // Ignore errors
    } catch (error) {
      // Ignore audio errors
    }
  }
  
  // Update order counter specifically
  updateOrderCounter() {
    const counter = document.querySelector('.order-counter, .notification-counter');
    if (counter) {
      const current = parseInt(counter.textContent) || 0;
      counter.textContent = current + 1;
      counter.style.display = 'inline';
      counter.style.backgroundColor = '#10b981'; // Green for orders
    }
  }

  // Handle incoming notifications (Email & Push based)
  handleIncomingNotification(notification) {
    console.log('📨 Incoming notification:', notification);
    
    // Handle order notifications specially
    if (notification.title && notification.title.includes('Order')) {
      this.handleOrderNotification(notification);
    } else {
      // Show regular notification for anything else
      this.showNotification(notification.message, notification.type, notification.title);
      this.playNotificationSound();
      this.storeNotificationHistory(notification);
    }
  }

  // Show toast notification (enhanced)
  showNotification(message, type = 'info', title = '') {
    if (typeof toastr === 'undefined') {
      console.warn('Toastr not available, using fallback notification');
      this.showFallbackNotification(message, title, type);
      return;
    }

    const config = {
      onclick: function() {
        // Add click handler for notifications
        window.focus();
      }
    };

    switch(type) {
      case 'error':
        toastr.error(message, title || 'Error', config);
        break;
      case 'success':
        toastr.success(message, title || 'Success', config);
        break;
      case 'warning':
        toastr.warning(message, title || 'Warning', config);
        break;
      default:
        toastr.info(message, title || 'Info', config);
    }
  }

  // Fallback notification for when Toastr isn't available
  showFallbackNotification(message, title, type) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-header">${title}</div>
      <div class="notification-body">${message}</div>
    `;
    
    // Add styles
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; z-index: 9999;
      background: white; border-radius: 8px; padding: 15px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 300px;
      border-left: 4px solid ${this.getTypeColor(type)};
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 5000);
  }

  // Get color for notification type
  getTypeColor(type) {
    const colors = {
      success: '#28a745',
      error: '#dc3545',
      warning: '#ffc107',
      info: '#17a2b8'
    };
    return colors[type] || colors.info;
  }

  // Play notification sound
  playNotificationSound() {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt459NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OUNwgVaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmYdETON0fDTgjEIHInM7+OU');
      audio.volume = 0.3;
      audio.play().catch(() => {}); // Ignore errors
    } catch (error) {
      // Ignore audio errors
    }
  }

  // Update notification counter in UI
  updateNotificationCounter() {
    const counter = document.querySelector('.notification-counter');
    if (counter) {
      const current = parseInt(counter.textContent) || 0;
      counter.textContent = current + 1;
      counter.style.display = 'inline';
    }
  }

  // Store notification in browser storage
  storeNotificationHistory(notification) {
    try {
      const history = JSON.parse(localStorage.getItem('notification_history') || '[]');
      history.unshift({
        ...notification,
        id: Date.now(),
        read: false,
        receivedAt: new Date().toISOString()
      });
      
      // Keep only last 50 notifications
      if (history.length > 50) {
        history.splice(50);
      }
      
      localStorage.setItem('notification_history', JSON.stringify(history));
    } catch (error) {
      console.error('Failed to store notification:', error);
    }
  }



  // Get connection status
  getConnectionStatus() {
    return {
      pushNotifications: 'serviceWorker' in navigator && 'PushManager' in window,
      notificationPermission: Notification?.permission || 'unknown',
      sellerId: this.sellerId
    };
  }

  // Clean up resources
  disconnect() {
    // No real-time connections to clean up
    console.log('🔌 Notification system cleaned up');
  }
}

// Create global notification manager instance
const notificationManager = new NotificationManager();

// Legacy function for backward compatibility
function showNotification(message, type = 'info', title = '') {
  notificationManager.showNotification(message, type, title);
}

// Export for use in other modules
window.NotificationManager = NotificationManager;
window.notificationManager = notificationManager;
window.showNotification = showNotification;
