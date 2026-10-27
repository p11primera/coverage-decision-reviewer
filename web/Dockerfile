# Multi-stage container for the Next.js 15 reviewer UI (M3A) — portable, no Vercel
# features: nodejs-runtime route handlers, standalone output, no edge runtime, no
# Vercel URL conventions. AKS shape: this image = one Deployment behind the cluster
# ingress; SESSION_SECRET + AGENT_URL arrive as env (Secret/ConfigMap), see the
# mapping notes in docker-compose.yml.
#
# Base: node:26-slim (Debian). The spec allows "node:26-alpine-ish"; we deliberately
# take slim because @tailwindcss/ox + Next SWC native binaries assume glibc — alpine's
# musl has bitten this ecosystem before (sharp/ox-class failures), and the interview
# answer ("glibc-safe, still ~180MB") beats a smaller-but-fragile alpine tag.

# ---- stage 1: deps --------------------------------------------------------------------
# package files only, so dependency install caches across source changes.
FROM node:26-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# CI-like deterministic install (respects the lockfile committed from npm 10+).
RUN npm ci --no-audit --no-fund

# ---- stage 2: build -------------------------------------------------------------------
FROM node:26-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    COPILOTKIT_TELEMETRY_DISABLED=true
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json next.config.ts tsconfig.json postcss.config.mjs eslint.config.mjs ./
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY public ./public
COPY types ./types
# Same build command the local acceptance run used (turbopack), so the container image
# is built exactly like the verified artifact — no webpack/turbopack drift between
# "what I tested" and "what ships". No SESSION_SECRET/AGENT_URL at build time: both are
# read at REQUEST time only (route handlers), keeping one image safe for many envs.
RUN npm run build \
    && npm prune --omit=dev

# ---- stage 3: runtime -----------------------------------------------------------------
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    COPILOTKIT_TELEMETRY_DISABLED=true \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# curl for HEALTHCHECK only (slim ships without it).
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*
# Non-root: next start needs no privileges beyond an unprivileged port.
RUN useradd --create-home --shell /usr/sbin/nologin nextjs
# Deliberate non-standalone pairing (see next.config.ts): the container runs the EXACT
# command this repo's dev/demo flow uses — `npm run start` (= next start) over the built
# .next + production node_modules (dev deps pruned at the end of the build stage).
COPY --from=build --chown=nextjs:nextjs /app/package.json /app/package-lock.json ./
COPY --from=build --chown=nextjs:nextjs /app/node_modules ./node_modules
COPY --from=build --chown=nextjs:nextjs /app/.next ./.next
COPY --from=build --chown=nextjs:nextjs /app/public ./public
USER nextjs
EXPOSE 3000
# Liveness = the auth-gated login page renders (200; / itself would 307 to /login
# unauthenticated, which curl -f would also accept — /login proves real rendering).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:3000/login || exit 1
# Same start command as the verified local flow (npm run start → next start). next
# start reads PORT/HOSTNAME env; -H 0.0.0.0 binds the pod/containers interface.
CMD ["sh", "-c", "npm run start -- -H 0.0.0.0 -p ${PORT:-3000}"]
