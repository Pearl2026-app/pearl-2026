import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { client } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks once for permission and sends the device token to the API, so new assignments arrive as push. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('assignments', { name: 'New deliveries', importance: Notifications.AndroidImportance.HIGH });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = await Notifications.getDevicePushTokenAsync();
    await client.auth.registerDevice(String(token.data), Platform.OS === 'ios' ? 'IOS' : 'ANDROID', 'delivery');
  } catch {
    // Push is a convenience: the jobs list refreshes on its own.
  }
}

/** Tapping a "new delivery" notification opens that job. */
export function useOpenFromNotification() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const id = response?.notification.request.identifier;
    const orderId = (response?.notification.request.content.data as { orderId?: string } | undefined)?.orderId;
    if (!id || !orderId || handled.current === id) return;
    handled.current = id;
    router.push(`/job/${orderId}`);
  }, [response]);
}
