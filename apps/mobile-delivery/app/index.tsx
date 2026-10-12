import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/session';
import { C } from '@/theme';

export default function Start() {
  const { me, ready } = useSession();
  if (!ready)
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
        <ActivityIndicator color={C.accent} />
      </View>
    );
  return <Redirect href={me ? '/(tabs)' : '/login'} />;
}
