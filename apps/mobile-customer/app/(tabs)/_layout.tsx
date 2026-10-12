import { Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { useSession } from '@/session';
import { C } from '@/theme';

const icon = (glyph: string) => ({ color }: { color: ColorValue }) => <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;

export default function TabsLayout() {
  const { cartCount } = useSession();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: C.accent, headerStyle: { backgroundColor: C.bg }, headerTitleStyle: { color: C.ink, fontFamily: 'serif' }, sceneStyle: { backgroundColor: C.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Sahyadri Pearls', tabBarLabel: 'Home', tabBarIcon: icon('◯') }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarIcon: icon('◇') }} />
      <Tabs.Screen name="wishlist" options={{ title: 'Wishlist', tabBarIcon: icon('♡') }} />
      <Tabs.Screen name="cart" options={{ title: 'Cart', tabBarIcon: icon('▢'), tabBarBadge: cartCount > 0 ? cartCount : undefined, tabBarBadgeStyle: { backgroundColor: C.accent } }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('☰') }} />
    </Tabs>
  );
}
