import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { api } from './bootstrap';

/**
 * F22d: регистрация устройства для push-уведомлений.
 *
 * Expo push token в нативной сборке (EAS) — это нативный FCM token,
 * который сервер принимает как `fcmToken` и шлёт через web-push
 * (FCM совместим с Web Push протоколом). В Expo Go / dev без
 * projectId токен недоступен — молча пропускаем.
 */
export async function registerForPushNotifications(): Promise<void> {
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Напоминания',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (!token) return;

    await api.post('/devices', { fcmToken: token, platform: Platform.OS });
  } catch {
    // Best-effort: без push приложение работает как обычно.
  }
}
