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
exit 0
