// Simple Service Worker for Push Notifications
// This handles push notifications when the dashboard is not open

self.addEventListener('push', function(event) {
  console.log('🔔 Push notification received:', event);
  
  let notificationData = {};
  
  if (event.data) {
    try {
      notificationData = event.data.json();
    } catch (e) {
      notificationData = {
        title: 'New Notification',
        body: event.data.text() || 'You have a new notification',
        icon: self.location.hostname.startsWith('seller.') ? '/favicon.ico' : '/seller-dashboard/favicon.ico'
      };
    }
  } else {
    notificationData = {
      title: 'New Order Alert',
      body: 'You have received a new order!',
      icon: self.location.hostname.startsWith('seller.') ? '/favicon.ico' : '/seller-dashboard/favicon.ico'
    };
  }

  const iconPath = self.location.hostname.startsWith('seller.') ? '/favicon.ico' : '/seller-dashboard/favicon.ico';
  
  const options = {
    body: notificationData.body || notificationData.message,
    icon: notificationData.icon || iconPath,
    badge: iconPath,
    vibrate: [200, 100, 200],
    data: notificationData.data || {},
    actions: [
      {
        action: 'view',
        title: 'View Dashboard'
      },
      {
        action: 'close',
        title: 'Close'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(notificationData.title || 'New Notification', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  console.log('🔔 Notification clicked:', event);
  
  event.notification.close();

  if (event.action === 'view' || !event.action) {
    // Open the seller dashboard - use correct path based on current location
    const dashboardUrl = self.location.hostname.startsWith('seller.') 
      ? '/index.html'  // For seller subdomain
      : '/seller-dashboard/index.html';  // For other domains
    
    event.waitUntil(
      clients.openWindow(dashboardUrl)
    );
  }
});

self.addEventListener('notificationclose', function(event) {
  console.log('🔔 Notification closed:', event);
});

// Basic service worker installation
self.addEventListener('install', function(event) {
  console.log('📦 Service Worker installing');
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  console.log('✅ Service Worker activated');
  event.waitUntil(self.clients.claim());
});
