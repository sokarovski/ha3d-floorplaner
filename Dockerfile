# Homeplan as a Home Assistant app (spec/home-assistant/publishing.md#app-packaging-and-ingress).
# The Supervisor builds this on the device from the whole repository (no prebuilt image). It also builds and runs
# with plain Docker: docker build -t homeplan-app . && docker run -p 8099:8099 -v homeplan-data:/data homeplan-app
# The base image is pinned by tag and digest (Supervisor 2026.04+ passes no BUILD_FROM); npm run app:check checks it.
ARG NODE_IMAGE=node:24.22.3-alpine3.24@sha256:116b800c3754b440ee0aa3ed2f20f5bf3d99a554bfd9adeea09ea8017f6e85f5

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# The builder SPA, and the production HA viewer the builder offers to the integration ("Upgrade panel").
RUN npm run build && npm run build:ha-viewer
RUN npm prune --omit=dev --no-audit --no-fund

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8099
WORKDIR /app
COPY --from=build /app/package.json /app/tsconfig.json /app/tsconfig.base.json /app/LICENSE ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/dist/ha-viewer ./dist/ha-viewer
COPY --from=build /app/dist/ha-artifacts ./dist/ha-artifacts
EXPOSE 8099
CMD ["node", "--import", "tsx", "server/main.ts"]
