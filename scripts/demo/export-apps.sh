#!/usr/bin/env bash
# Builds browser previews of the two phone apps into the website (apps/web/public/apps/…), so the
# presentation site can show them at /apps/customer and /apps/delivery. Run from the repository root.
# Never fails the website build: if an app cannot be exported, its address points to a working fallback.
set -u
OUT=apps/web/public/apps
rm -rf "$OUT"
mkdir -p "$OUT"

# The apps import @sahyadri/shared from its compiled dist/, which the website build makes only later.
pnpm --filter @sahyadri/shared build >/dev/null || echo "WARNING: @sahyadri/shared did not build; the app previews will fall back."

export_app() { # name, package folder, fallback page
  local name=$1 dir=$2 fallback=$3
  if (cd "apps/$dir" && EXPO_OFFLINE=1 EXPO_NO_TELEMETRY=1 EXPO_PUBLIC_SAME_ORIGIN=1 EXPO_BASE_URL="/apps/$name" \
        npx expo export -p web --output-dir "../../$OUT/$name" >/dev/null); then
    # Hosts skip folders that start with a dot; Expo puts some images under node_modules/.pnpm.
    if [ -d "$OUT/$name/assets/__node_modules/.pnpm" ]; then
      mv "$OUT/$name/assets/__node_modules/.pnpm" "$OUT/$name/assets/__node_modules/_pnpm"
      grep -rl '__node_modules/.pnpm' "$OUT/$name/_expo" | xargs -r sed -i 's#__node_modules/\.pnpm#__node_modules/_pnpm#g'
    fi
    echo "Exported the $name app preview."
  else
    echo "WARNING: the $name app preview could not be built; /apps/$name opens $fallback instead."
    rm -rf "$OUT/$name" && mkdir -p "$OUT/$name"
    printf '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=%s"><a href="%s">Open</a>\n' "$fallback" "$fallback" > "$OUT/$name/index.html"
  fi
}

export_app customer mobile-customer /
export_app delivery mobile-delivery /admin/delivery

# The rider app goes live as an installable app (PWA): riders open /apps/delivery on their phone and
# "Add to Home Screen" — full screen, own icon, camera and GPS included. (Client request, 27 Oct.)
make_installable() { # name, app title, short name, theme colour
  local name=$1 title=$2 short=$3 colour=$4
  [ -f "$OUT/$name/index.html" ] || return 0
  grep -q 'rel="manifest"' "$OUT/$name/index.html" && return 0
  cp "apps/mobile-$name/assets/icon.png" "$OUT/$name/app-icon.png" 2>/dev/null || return 0
  cat > "$OUT/$name/manifest.json" <<EOF
{
  "name": "$title",
  "short_name": "$short",
  "start_url": "/apps/$name/",
  "scope": "/apps/$name/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "$colour",
  "theme_color": "$colour",
  "icons": [{ "src": "/apps/$name/app-icon.png", "sizes": "1024x1024", "type": "image/png", "purpose": "any" }]
}
EOF
  cat > "$OUT/$name/sw.js" <<'EOF'
// Minimal service worker: makes the app installable; the network stays the source of truth.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));
EOF
  sed -i "s#</head>#<link rel=\"manifest\" href=\"/apps/$name/manifest.json\"/><meta name=\"theme-color\" content=\"$colour\"/><link rel=\"apple-touch-icon\" href=\"/apps/$name/app-icon.png\"/><meta name=\"apple-mobile-web-app-capable\" content=\"yes\"/><script>if('serviceWorker' in navigator)navigator.serviceWorker.register('/apps/$name/sw.js',{scope:'/apps/$name/'});</script></head>#" "$OUT/$name/index.html"
  echo "Made the $name app installable (PWA)."
}
make_installable delivery 'Sahyadri Pearls Delivery' 'SP Delivery' '#1F4E52'
make_installable customer 'Sahyadri Pearls' 'Sahyadri' '#111111'
exit 0
