# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM node:26.5.0-alpine3.24@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS build

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

FROM nginx:1.30.4-alpine3.24@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 AS runtime

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /usr/share/nginx/html \
    && chown -R nginx:nginx /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf.template
COPY --chmod=0555 docker-entrypoint.sh /usr/local/bin/starforge-entrypoint
COPY --from=build --chown=nginx:nginx /app/dist/ /usr/share/nginx/html/

# Nginx runs without root privileges or Linux capabilities. Runtime
# configuration is rendered into the writable /tmp filesystem.
USER nginx
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["starforge-entrypoint"]
