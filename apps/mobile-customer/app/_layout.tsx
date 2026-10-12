import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { flushPendingEnquiries } from '@/enquire';
import { useOpenFromNotification } from '@/push';
import { SessionProvider } from '@/session';
import { SiteProvider } from '@/site';
import { C } from '@/theme';

function Background() {
  useOpenFromNotification();
  useEffect(() => {
    void flushPendingEnquiries();
  }, []);
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SiteProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Background />
          <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.accent, headerTitleStyle: { color: C.ink }, contentStyle: { backgroundColor: C.bg }, headerBackTitle: 'Back' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="product/[slug]" options={{ title: '' }} />
            <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
            <Stack.Screen name="order/[number]" options={{ title: 'Order' }} />
            <Stack.Screen name="login" options={{ title: 'Sign in', presentation: 'modal' }} />
            <Stack.Screen name="ring-finder" options={{ title: 'Ring Finder' }} />
            <Stack.Screen name="custom" options={{ title: 'Customized Jewellery' }} />
            <Stack.Screen name="orders" options={{ title: 'My orders' }} />
            <Stack.Screen name="addresses" options={{ title: 'Addresses' }} />
            <Stack.Screen name="referral" options={{ title: 'Refer a friend' }} />
            <Stack.Screen name="returns" options={{ title: 'Returns' }} />
          </Stack>
        </SessionProvider>
      </SiteProvider>
    </SafeAreaProvider>
  );
}
