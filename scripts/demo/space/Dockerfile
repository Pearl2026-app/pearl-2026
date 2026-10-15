FROM node:22-bookworm-slim AS node
FROM postgres:16-bookworm
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
ADD https://github.com/Pearl2026-app/pearl-2026/archive/refs/heads/main.tar.gz /tmp/src.tgz
RUN mkdir -p /repo && tar -xzf /tmp/src.tgz -C /repo --strip-components=1 && rm /tmp/src.tgz && bash /repo/scripts/demo/build-in-container.sh
USER demo
ENV PORT=7860
CMD ["bash", "/repo/scripts/demo/start.sh"]
