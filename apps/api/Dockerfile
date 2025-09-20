# apps/api/Dockerfile
FROM node:20-bullseye

# 1) Base workspace
WORKDIR /app

# Use pnpm via corepack
RUN corepack enable && corepack prepare pnpm@9.9.0 --activate

# 2) Copy only manifests first for better layer caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY apps/api/package.json ./apps/api/package.json

# 3) Install ONLY what's needed for apps/api (respects workspaces)
RUN pnpm -w install --frozen-lockfile --filter ./apps/api...

# 4) Copy prisma + tsconfig for generate step
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/prisma ./apps/api/prisma

# 5) Generate Prisma client (safe to no-op if schema missing)
RUN pnpm --filter ./apps/api... exec prisma generate || echo "no prisma schema, skipping generate"

# 6) Copy the rest of the app source
COPY apps/api/src ./apps/api/src

# 7) Runtime config
WORKDIR /app/apps/api
ENV NODE_ENV=development
ENV PORT=4000
EXPOSE 4000

# 8) Start dev server (use "pnpm start" for prod build)
CMD ["pnpm", "dev"]
