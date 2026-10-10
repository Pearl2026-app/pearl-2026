# API and background worker image (one image, two commands).
#   docker build -f apps/api/Dockerfile -t sahyadri-api .        (from the repository root)
#   API:     docker run ... sahyadri-api                         → node dist/main.js
#   Worker:  docker run ... sahyadri-api node dist/worker.js
#   Release: docker run ... sahyadri-api pnpm --filter @sahyadri/db migrate:deploy
# The full Debian image already has OpenSSL (needed by Prisma) and CA certificates, so no apt step.
FROM node:22-bookworm AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1 COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Optional build secret "ca": an extra CA for builds behind a TLS-inspecting proxy. Normal builds skip it.
RUN --mount=type=secret,id=ca,required=false export NODE_EXTRA_CA_CERTS=$([ -f /run/secrets/ca ] && echo /run/secrets/ca); \
  corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS build
COPY . .
# Only the API and the packages it uses.
RUN --mount=type=secret,id=ca,required=false export NODE_EXTRA_CA_CERTS=$([ -f /run/secrets/ca ] && echo /run/secrets/ca); \
  pnpm install --frozen-lockfile --filter "@sahyadri/api..." \
  && pnpm --filter "@sahyadri/api..." build

FROM base AS runtime
ENV NODE_ENV=production PORT=4000
COPY --from=build /repo /repo
WORKDIR /repo/apps/api
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/main.js"]
