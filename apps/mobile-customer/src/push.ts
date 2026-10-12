import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { client, WEB_HOST, WEB_URL } from './api';
import { routeFor } from './links';

if (Platform.OS !== 'web') Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Offers and order updates. Asked after sign-in, never at first launch. */
export async function registerForPush(): Promise<void> {
  if (!Device.isDevice) return;
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Orders and offers', importance: Notifications.AndroidImportance.DEFAULT });
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    const token = await Notifications.getDevicePushTokenAsync();
    await client.auth.registerDevice(String(token.data), Platform.OS === 'ios' ? 'IOS' : 'ANDROID', 'customer');
  } catch {
    /* push is optional */
  }
}

/** Open a link inside the app when there is a screen for it, otherwise in the browser. */
export function openLink(link: string) {
  const route = routeFor(link, WEB_HOST);
  if (route) router.push(route as never);
  else void WebBrowser.openBrowserAsync(/^https?:\/\//.test(link) ? link : `${WEB_URL}${link.startsWith('/') ? '' : '/'}${link}`);
}

/** Tapping a notification opens its page (campaign deep link or order). No push in the web preview. */
export const useOpenFromNotification = Platform.OS === 'web' ? () => undefined : useOpenFromNotificationNative;

function useOpenFromNotificationNative() {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const id = response?.notification.request.identifier;
    const data = response?.notification.request.content.data as { deepLink?: string; url?: string; orderNumber?: string } | undefined;
    if (!id || handled.current === id || !data) return;
    handled.current = id;
    const link = data.deepLink ?? data.url ?? (data.orderNumber ? `/account/orders/${data.orderNumber}` : null);
    if (link) openLink(link);
  }, [response]);
}
