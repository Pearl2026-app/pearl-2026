import type { ExpoConfig } from 'expo/config';

// Addresses fixed at build time (eas.json profiles); local development uses this computer.
const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const webUrl = process.env.EXPO_PUBLIC_WEB_URL ?? 'http://localhost:3000';
const webHost = new URL(webUrl).host;
const isLocal = /^(localhost|127\.|10\.|192\.168\.)/.test(webHost);

const config: ExpoConfig = {
  name: 'Sahyadri Pearls',
  slug: 'sahyadri-pearls',
  scheme: 'sahyadri',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'light',
  ios: {
    bundleIdentifier: 'in.sahyadripearls.app',
    supportsTablet: true,
    // Product and tracking links open in the app (the website serves apple-app-site-association).
    associatedDomains: isLocal ? [] : [`applinks:${webHost}`, `applinks:${webHost.replace(/^www\./, '')}`],
    infoPlist: {
      NSCameraUsageDescription: 'Add photos of a design you like to a Customized Jewellery request.',
      NSPhotoLibraryUsageDescription: 'Add photos of a design you like to a Customized Jewellery request.',
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'in.sahyadripearls.app',
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#1F4E52' },
    permissions: ['POST_NOTIFICATIONS'],
    intentFilters: isLocal
      ? []
      : [
          {
            action: 'VIEW',
            autoVerify: true,
            data: ['/product', '/track', '/order'].map((pathPrefix) => ({ scheme: 'https', host: webHost, pathPrefix })),
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
  },
  plugins: [
    'expo-router',
    ['expo-splash-screen', { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#1F4E52' }],
    'expo-secure-store',
    'expo-web-browser',
    ['expo-image-picker', { photosPermission: 'Add photos of a design you like to a Customized Jewellery request.', cameraPermission: 'Add photos of a design you like to a Customized Jewellery request.' }],
    ['expo-notifications', { color: '#1F4E52' }],
  ],
  extra: { apiUrl, webUrl },
};

export default config;
