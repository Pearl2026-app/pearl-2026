import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useOpenFromNotification } from '@/push';
import { SessionProvider } from '@/session';
import { C } from '@/theme';

function Notifications() {
  useOpenFromNotification();
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Notifications />
        <Stack screenOptions={{ headerStyle: { backgroundColor: C.bg }, headerTintColor: C.accent, headerTitleStyle: { color: C.ink }, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="job/[id]" options={{ title: 'Delivery' }} />
        </Stack>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
