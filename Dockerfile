# Serviço de auditoria (tarefa 0.26). Mesmo imagem para API, migração e verificador.
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY tsconfig.json ./
COPY src src
COPY db db
COPY docs/catalogo-eventos-auditoria.md docs/
USER node
EXPOSE 3100
CMD ["node_modules/.bin/tsx", "src/main.ts"]
