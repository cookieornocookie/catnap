const webpush = require('web-push');

/**
 * Configure Web Push with VAPID credentials
 */
function initWebPush() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const email = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn('[WebPush] WARNING: VAPID keys missing. Push notifications will not send until configured.');
    return;
  }

  webpush.setVapidDetails(email, publicKey, privateKey);
  console.log('[WebPush] Initialized successfully.');
}

/**
 * Send a Web Push Notification to a target device subscription
 * @param {Object} subscription - Target PushSubscription object from client
 * @param {Object} payloadData - { title, body, url, icon }
 */
async function sendNotification(subscription, payloadData) {
  if (!subscription || !subscription.endpoint) {
    console.error('[WebPush] Invalid subscription object.');
    return false;
  }

  const payload = JSON.stringify({
    title: payloadData.title || 'New Notification',
    body: payloadData.body || 'You have a new update in Snapchat.',
    url: payloadData.url || '/',
    icon: payloadData.icon || '/icon-192.png'
  });

  const options = {
    TTL: 60 * 60 * 24 // Time-to-live: 24 hours in seconds
  };

  try {
    await webpush.sendNotification(subscription, payload, options);
    console.log(`[WebPush] Notification sent to endpoint: ${subscription.endpoint.slice(-15)}`);
    return true;
  } catch (error) {
    console.error('[WebPush] Error sending notification:', error.statusCode || error.message);
    // 410 Gone means the subscription is expired or unsubscribed
    if (error.statusCode === 410 || error.statusCode === 404) {
      return { expired: true };
    }
    return false;
  }
}

module.exports = {
  initWebPush,
  sendNotification
};
