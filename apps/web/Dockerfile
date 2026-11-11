FROM node:22-alpine
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @teamforge/web...
COPY apps/web/ apps/web/
WORKDIR /workspace/apps/web
ENV PORT=3000
EXPOSE 3000
# Replace this command with the application entrypoint during implementation.
CMD ["node", "-e", "console.error('Application scaffold: implement the application entrypoint before starting.'); process.exit(1)"]
