import { Link, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Dimensions, FlatList, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { client, img, WEB_URL } from '@/api';
import { useCached } from '@/data';
import { openLink } from '@/push';
import { useSite } from '@/site';
import { C } from '@/theme';
import type { Home } from '@/types';
import { Banner, Eyebrow, Muted, ProductTile } from '@/ui';

const W = Dimensions.get('window').width;

export default function HomeScreen() {
  const site = useSite();
  const { data, loading, stale, refresh } = useCached<Home>('home', () => client.shop.home<Home>());
  const hero = data?.banners[0];
  const shortcuts = [
    { label: 'Ring Finder', onPress: () => router.push('/ring-finder') },
    { label: 'Design your own', onPress: () => router.push('/custom') },
    ...(site?.storefront.consultationsEnabled ? [{ label: 'Video consultation', onPress: () => WebBrowser.openBrowserAsync(`${WEB_URL}/book-consultation`) }] : []),
    { label: 'Pearl Guide', onPress: () => WebBrowser.openBrowserAsync(`${WEB_URL}/pearl-guide`) },
  ];
  return (
    <ScrollView refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={refresh} />} contentContainerStyle={{ paddingBottom: 32 }}>
      {stale && <View style={{ padding: 12 }}><Banner tone="info">You are offline. Showing what was saved on this phone.</Banner></View>}
      {hero ? (
        <Pressable onPress={() => hero.linkUrl && openLink(hero.linkUrl)} accessibilityRole="link">
          <Image source={{ uri: img(hero.imageUrl) }} style={{ width: W, height: W * 0.75 }} resizeMode="cover" accessibilityLabel={hero.title ?? ''} />
          <View style={{ position: 'absolute', left: 20, right: 20, bottom: 24 }}>
            {hero.title ? <Text style={{ fontFamily: 'serif', fontSize: 34, color: '#fff' }}>{hero.title}</Text> : null}
            {hero.subtitle ? <Text style={{ color: '#fff', fontSize: 15, marginTop: 4 }}>{hero.subtitle}</Text> : null}
          </View>
        </Pressable>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {shortcuts.map((s) => (
          <Pressable key={s.label} onPress={s.onPress} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' }}>
            <Text style={{ color: C.ink }}>{s.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {!!data?.collections.length && (
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <Eyebrow>Collections</Eyebrow>
          <Text style={{ fontFamily: 'serif', fontSize: 26, color: C.ink, marginBottom: 12 }}>Find your strand</Text>
          <FlatList
            horizontal
            data={data.collections}
            keyExtractor={(c) => c.slug}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
            renderItem={({ item: c }) => (
              <Link href={`/shop?collection=${c.slug}`} asChild>
                <Pressable style={{ width: W * 0.6 }} accessibilityRole="link">
                  <View style={{ aspectRatio: 4 / 5, backgroundColor: C.muted }}>{c.imageUrl ? <Image source={{ uri: img(c.imageUrl) }} style={{ width: '100%', height: '100%' }} /> : null}</View>
                  <Text style={{ fontFamily: 'serif', fontSize: 18, color: C.ink, marginTop: 6 }}>{c.name}</Text>
                  {c.description ? <Muted>{c.description}</Muted> : null}
                </Pressable>
              </Link>
            )}
          />
        </View>
      )}

      {!!data?.featured.length && (
        <View style={{ paddingHorizontal: 10, marginTop: 28 }}>
          <View style={{ paddingHorizontal: 6 }}>
            <Eyebrow>Featured</Eyebrow>
            <Text style={{ fontFamily: 'serif', fontSize: 26, color: C.ink, marginBottom: 6 }}>Pieces we love</Text>
          </View>
          {chunk(data.featured, 2).map((row, i) => (
            <View key={i} style={{ flexDirection: 'row' }}>
              {row.map((p) => <ProductTile key={p.id} p={p} />)}
              {row.length === 1 && <View style={{ flex: 1, margin: 6 }} />}
            </View>
          ))}
          <Link href="/shop" asChild>
            <Pressable style={{ alignSelf: 'center', padding: 14 }} accessibilityRole="link"><Text style={{ color: C.accent, fontSize: 16 }}>Shop all jewellery →</Text></Pressable>
          </Link>
        </View>
      )}

      <View style={{ margin: 16, padding: 18, backgroundColor: C.accent, gap: 6 }}>
        <Text style={{ fontFamily: 'serif', fontSize: 24, color: '#fff' }}>Every pearl has a birthplace</Text>
        <Text style={{ color: '#E8EFEF' }}>Each piece names the farm its pearls came from, with a certificate you can verify.</Text>
        <Pressable onPress={() => WebBrowser.openBrowserAsync(`${WEB_URL}/our-farm`)} accessibilityRole="link"><Text style={{ color: '#fff', textDecorationLine: 'underline', marginTop: 6 }}>Visit our farms</Text></Pressable>
      </View>
    </ScrollView>
  );
}

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
