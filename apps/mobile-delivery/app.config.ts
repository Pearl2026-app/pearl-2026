import type { ExpoConfig } from 'expo/config';

// The API address is fixed at build time: EXPO_PUBLIC_API_URL=https://www.sahyadripearls.in/api/v1
// (see eas.json). Local development falls back to the API on this computer.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const config: ExpoConfig = {
  name: 'Sahyadri Pearls Delivery',
  slug: 'sahyadri-pearls-delivery',
  scheme: 'sahyadri-delivery',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'in.sahyadripearls.delivery',
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: 'The camera takes the proof-of-delivery photo of the handover.',
      NSLocationWhenInUseUsageDescription: 'Your location is saved with a delivery as part of the proof of delivery.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'in.sahyadripearls.delivery',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1F4E52' },
    permissions: ['CAMERA', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION', 'POST_NOTIFICATIONS'],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#1F4E52' }],
    'expo-secure-store',
    ['expo-image-picker', { cameraPermission: 'The camera takes the proof-of-delivery photo of the handover.' }],
    ['expo-location', { locationWhenInUsePermission: 'Your location is saved with a delivery as part of the proof of delivery.' }],
    ['expo-notifications', { color: '#1F4E52' }],
  ],
  extra: { apiUrl },
};

export default config;
