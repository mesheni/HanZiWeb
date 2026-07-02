import { apiPost, apiDelete } from './client';

let vapidPublicKey: string | null = null;

async function getVapidPublicKey(): Promise<string | null> {
  if (vapidPublicKey) return vapidPublicKey;

  try {
    const res = await fetch('/api/devices/vapid-public-key');
    const json = await res.json();
    if (json.success && json.data?.publicKey) {
      vapidPublicKey = json.data.publicKey;
      return vapidPublicKey;
    }
  } catch {
    // ignore
  }
  return null;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return false;
  }

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const json = subscription.toJSON();
    await apiPost('/devices', {
      fcmToken: json.endpoint ?? '',
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
      platform: 'web',
    });

    return true;
  } catch {
    return false;
  }
}

export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await apiDelete(`/devices/${encodeURIComponent(endpoint)}`);
    }
    return true;
  } catch {
    return false;
  }
}

export async function isPushSubscribed(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
