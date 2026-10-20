import { useEffect } from 'react';
import { Redirect, Tabs } from 'expo-router';
import { client } from '@/api';
import { startLiveLocation } from '@/location';
import { Text, type ColorValue } from 'react-native';
import { useSession } from '@/session';
import { C } from '@/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { me, ready } = useSession();
  // Share the rider's position while they are signed in; the API keeps it only while a delivery is active.
  useEffect(() => (me ? startLiveLocation((p) => client.post('/delivery/location', p)) : undefined), [me]);
  if (ready && !me) return <Redirect href="/login" />;
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.accent, headerStyle: { backgroundColor: C.bg }, headerTitleStyle: { color: C.ink }, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'To deliver', tabBarIcon: icon('◉') }} />
      <Tabs.Screen name="done" options={{ title: 'Completed', tabBarIcon: icon('✓') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
