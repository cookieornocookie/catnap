import { urlBase64ToUint8Array, isIOSStandalone } from './utils.js';

export class PushManager {
  constructor(userId, publicVapidKey) {
    this.userId = userId;
    this.publicVapidKey = publicVapidKey;
    this.swRegistration = null;
  }

  async init() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      console.warn('Web Push Notifications are not supported in this browser.');
      return false;
    }

    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js');
      console.log('[PWA] Service Worker registered successfully.');
      return true;
    } catch (err) {
      console.error('[PWA] Service Worker registration failed:', err);
      return false;
    }
  }

  async subscribeUser() {
    const { isIOS, isStandalone } = isIOSStandalone();

    if (isIOS && !isStandalone) {
      alert('iOS Requirement: Please tap the Share button in Safari -> "Add to Home Screen" first to enable Web Push notifications!');
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission was denied.');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(this.publicVapidKey)
        });
      }

      // Sync subscription with backend database
      await fetch('/api/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.userId,
          subscription: subscription
        })
      });

      console.log('[PWA] Push Subscription saved to server.');
      return true;
    } catch (err) {
      console.error('[PWA] Failed to subscribe to push notifications:', err);
      return false;
    }
  }
}
