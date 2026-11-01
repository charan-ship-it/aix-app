FROM node:24-alpine AS dependencies
WORKDIR /app
ENV SCARF_ANALYTICS=false COPILOTKIT_TELEMETRY_DISABLED=true
COPY package.json package-lock.json ./
RUN npm ci --include=dev

FROM dependencies AS build
WORKDIR /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM dependencies AS worker
WORKDIR /app
COPY . .
ENV NODE_ENV=production
CMD ["node","--import","tsx","worker.ts"]

FROM node:24-alpine AS app
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 COPILOTKIT_TELEMETRY_DISABLED=true
RUN addgroup -S aix && adduser -S aix -G aix && mkdir -p /data/uploads && chown -R aix:aix /data
COPY --from=build --chown=aix:aix /app/.next/standalone ./
COPY --from=build --chown=aix:aix /app/.next/static ./.next/static
COPY --from=build --chown=aix:aix /app/public ./public
USER aix
EXPOSE 3000
CMD ["node","server.js"]

