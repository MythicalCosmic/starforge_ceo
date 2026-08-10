# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:22.23.1-alpine3.24@sha256:16e22a550f3863206a3f701448c45f7912c6896a62de43add43bb9c86130c3e2 AS build

WORKDIR /app

# The lockfile is the only dependency-resolution input in release builds.
COPY package.json package-lock.json ./
RUN npm install --global npm@10.9.8 \
    && test "$(npm --version)" = "10.9.8" \
    && npm ci --include=dev --no-audit --no-fund

COPY . .

# Browser configuration is compiled into the Vite bundle. Production images
# deliberately reject mock mode, force same-origin API paths, and never accept
# a build-time credential or cross-origin backend URL.
ARG VITE_USE_MOCK=false

RUN test "${VITE_USE_MOCK}" = "false" \
    && VITE_API_URL= VITE_USE_MOCK=false npm run build

FROM nginx:1.31.3-alpine3.24@sha256:4a73073bd557c65b759505da037898b61f1be6cbcc3c2c3aeac22d2a470c1752 AS runtime

ARG BUILD_REVISION=unknown
LABEL org.opencontainers.image.title="StarForge CEO Console" \
      org.opencontainers.image.source="https://github.com/MythicalCosmic/starforge_ceo" \
      org.opencontainers.image.revision="${BUILD_REVISION}"

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf.template
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/starforge-entrypoint
# The serving worker only needs read access. Keeping release assets root-owned
# prevents an Nginx compromise from persisting a modified shell if an operator
# accidentally starts the image without the documented read-only filesystem.
COPY --from=build --chown=root:root /app/dist/ /usr/share/nginx/html/

# Nginx runs without root privileges or Linux capabilities. Runtime
# configuration is rendered into the writable /tmp filesystem.
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["starforge-entrypoint"]
