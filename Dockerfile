FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json server.js backup.js ./
COPY lib ./lib
COPY public ./public
ENV PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
