FROM node:20-alpine

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copier les manifests en premier (layer cache)
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copier le code source
COPY . .

# Donner les droits à l'utilisateur non-root
RUN chown -R appuser:appgroup /app

# Basculer vers l'utilisateur non-root
USER appuser

EXPOSE 3001

# Healthcheck intégré
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "server.js"]
