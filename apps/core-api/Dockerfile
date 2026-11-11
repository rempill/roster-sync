FROM node:22-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/core-api/package.json apps/core-api/package.json
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @teamforge/core-api...
COPY apps/core-api/ apps/core-api/
WORKDIR /workspace/apps/core-api
ENV PORT=8000
EXPOSE 8000
# Replace this command with the application entrypoint during implementation.
CMD ["node", "-e", "console.error('Application scaffold: implement the application entrypoint before starting.'); process.exit(1)"]
