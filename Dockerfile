# Stage 1: Build ircw frontend as ES module
FROM docker.io/library/node:22-alpine AS frontend
WORKDIR /frontend
COPY hecate-app-ircw/package.json hecate-app-ircw/package-lock.json* ./
RUN npm ci
COPY hecate-app-ircw/ .
RUN npx svelte-kit sync 2>/dev/null || true
RUN npm run build:lib

# Stage 2: Build ircd Erlang release
FROM docker.io/library/erlang:27-alpine AS backend
WORKDIR /build
RUN apk add --no-cache git curl bash build-base cmake
RUN curl -fsSL https://s3.amazonaws.com/rebar3/rebar3 -o /usr/local/bin/rebar3 && \
    chmod +x /usr/local/bin/rebar3
COPY hecate-app-ircd/rebar.config hecate-app-ircd/rebar.lock* ./
COPY hecate-app-ircd/config/ config/
COPY hecate-app-ircd/src/ src/
COPY hecate-app-ircd/include/ include/
RUN rebar3 get-deps && rebar3 compile
COPY --from=frontend /frontend/dist priv/static/
RUN rebar3 as prod release

# Stage 3: Runtime
FROM docker.io/library/alpine:3.22
RUN apk add --no-cache ncurses-libs libstdc++ libgcc openssl ca-certificates
WORKDIR /app
COPY --from=backend /build/_build/prod/rel/hecate_app_ircd ./
ENTRYPOINT ["/app/bin/hecate_app_ircd"]
CMD ["foreground"]
