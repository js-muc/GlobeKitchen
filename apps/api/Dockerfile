# apps/api/Dockerfile — production build
FROM node:20-bullseye

WORKDIR /app

# pnpm
RUN corepack enable && corepack prepare pnpm@10.17.0 --activate

# 1) workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/api/package.json ./apps/api/package.json

# 2) install only API deps
RUN pnpm -w install --frozen-lockfile --filter ./apps/api...

# 3) prisma + tsconfigs
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json ./apps/api/tsconfig.build.json

# 4) *** generate prisma client (REQUIRED before tsc) ***
RUN pnpm --filter ./apps/api... exec prisma generate --schema=/app/apps/api/prisma/schema.prisma || echo "no prisma schema, skipping generate"

# 5) source
COPY apps/api/src ./apps/api/src

# 6) build TS -> dist
WORKDIR /app/apps/api
RUN pnpm run build

# 7) runtime
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node", "dist/index.js"]
