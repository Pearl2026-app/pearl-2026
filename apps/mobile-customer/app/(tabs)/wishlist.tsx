import { router } from 'expo-router';
import { FlatList, Pressable, RefreshControl, Share, Text, View } from 'react-native';
import { client } from '@/api';
import { useCached } from '@/data';
import { useSession } from '@/session';
import { C } from '@/theme';
import type { ProductCard } from '@/types';
import { Button, H1, Muted, ProductTile } from '@/ui';

export default function Wishlist() {
  const { me } = useSession();
  if (!me)
    return (
      <View style={{ padding: 16, gap: 12 }}>
        <H1>Your wishlist</H1>
        <Muted>Sign in to save pieces and hear when they are on offer.</Muted>
        <Button title="Sign in" onPress={() => router.push('/login')} />
      </View>
    );
  return <List />;
}

function List() {
  const { data, loading, refresh } = useCached<{ items: ProductCard[]; shareText: string }>('wishlist', () => client.account.wishlist());
  const items = data?.items ?? [];
  return (
    <FlatList
      data={items}
      numColumns={2}
      keyExtractor={(p) => p.id}
      contentContainerStyle={{ padding: 6 }}
      refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} />}
      renderItem={({ item }) => <ProductTile p={item} />}
      ListHeaderComponent={
        items.length ? (
          <Pressable onPress={() => data && Share.share({ message: data.shareText })} accessibilityRole="button" style={{ padding: 10, alignSelf: 'flex-end' }}>
            <Text style={{ color: C.accent }}>Share my wishlist</Text>
          </Pressable>
        ) : null
      }
      ListEmptyComponent={!loading ? <View style={{ padding: 10 }}><Muted>Nothing saved yet. Tap ♡ on any piece to keep it here.</Muted></View> : null}
    />
  );
}
