FROM node:22-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/core-api/package.json apps/core-api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
COPY src/ src/
COPY prisma/ prisma/
COPY tsconfig.json ./
RUN pnpm build
COPY tests/ tests/
ENV PORT=8000
EXPOSE 8000
CMD ["pnpm", "start"]
