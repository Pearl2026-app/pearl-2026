import { useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';
import { C } from './theme';

/** The customer signs with a finger; capture() returns a PNG file for the proof of delivery. */
export function useSignaturePad() {
  const ref = useRef<View>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef('');
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = `M${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        setPaths((p) => [...p, current.current]);
      },
      onPanResponderMove: (e) => {
        current.current += ` L${e.nativeEvent.locationX.toFixed(1)},${e.nativeEvent.locationY.toFixed(1)}`;
        setPaths((p) => [...p.slice(0, -1), current.current]);
      },
    }),
  ).current;

  const pad = (
    <View>
      <View ref={ref} collapsable={false} style={{ height: 180, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line }} {...responder.panHandlers}>
        <Svg width="100%" height="100%">
          {paths.map((d, i) => (
            <Path key={i} d={d} stroke={C.ink} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {paths.length === 0 && <Text style={{ position: 'absolute', top: 76, width: '100%', textAlign: 'center', color: C.sub }}>Customer signs here</Text>}
      </View>
      {paths.length > 0 && (
        <Pressable onPress={() => setPaths([])} style={{ alignSelf: 'flex-end', padding: 8 }} accessibilityRole="button">
          <Text style={{ color: C.accent }}>Clear</Text>
        </Pressable>
      )}
    </View>
  );

  return {
    pad,
    signed: paths.some((p) => p.includes('L')),
    capture: async () => {
      const uri = await captureRef(ref, { format: 'png', quality: 0.9, result: 'tmpfile' });
      return { uri, name: 'signature.png', type: 'image/png' };
    },
  };
}
