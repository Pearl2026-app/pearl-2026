# apps/mobile-customer — Customer app (Android and iOS)

React Native with Expo (SDK 57) and expo-router, on the same API as the website (`@sahyadri/api-client`, token sign-in).

## What it does
- **Home:** banners, collections, featured pieces, shortcuts to Ring Finder, Customized Jewellery, consultation and the Pearl Guide.
- **Shop:** search, categories, filters (colour, shape, price band, collection, in stock), sorting, endless list.
- **Product:** gallery, price, origin farm, certificate, specification linked to the Pearl Guide, reviews, related pieces; add to cart, WhatsApp enquiry (saved first, rule 3), wishlist, share.
- **Cart and checkout:** guest or signed in, saved addresses, city, gift packing with a message, cash on delivery, or online payment on the website's secure payment page (`/pay/app`), which returns to the app.
- **Account:** sign in with mobile number and code, orders with tracking, cancel or return, addresses, referral code, returns, wishlist sharing.
- **Ring Finder** and **Customized Jewellery** (with reference photos) as native screens; consultation booking, Pearl Guide and policies open in an in-app browser.
- **Push:** offers and order updates; tapping one opens the right screen.
- **Links:** website product and tracking links open in the app once the website has `APPLE_TEAM_ID` and `ANDROID_APP_SHA256` set (see docs/DEPLOYMENT.md).

## Run
```bash
pnpm --filter @sahyadri/mobile-customer start
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000/api/v1 EXPO_PUBLIC_WEB_URL=http://192.168.1.10:3000 pnpm --filter @sahyadri/mobile-customer start
pnpm --filter @sahyadri/mobile-customer test     # links, filters, checkout form
```

## Release
`eas build --profile production`, then `eas submit` (needs the owner's Google Play and Apple developer accounts). Addresses per profile are in `eas.json`.
