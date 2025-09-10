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
        icon: '/seller-dashboard/favicon.ico'
      };
    }
  } else {
    notificationData = {
      title: 'New Order Alert',
      body: 'You have received a new order!',
      icon: '/seller-dashboard/favicon.ico'
    };
  }

  const options = {
    body: notificationData.body || notificationData.message,
    icon: notificationData.icon || '/seller-dashboard/favicon.ico',
    badge: '/seller-dashboard/favicon.ico',
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
    // Open the seller dashboard
    event.waitUntil(
      clients.openWindow('/seller-dashboard/index.html')
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
