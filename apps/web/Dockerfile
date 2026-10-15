FROM node:24-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package*.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci
COPY apps/web ./apps/web
COPY packages ./packages
COPY scripts ./scripts
COPY database ./database
RUN npm run build
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["npm","start"]
