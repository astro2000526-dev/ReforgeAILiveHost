# Next.js console + API gateway.
# NEXT_PUBLIC_* are accepted as build ARGs but the deploy leaves them empty and
# supplies them as RUNTIME env (docker-compose `environment:`) instead — the
# data path is server-side (API routes read process.env at runtime), and the
# internal gateway URL (http://nginx:8088) must NOT be baked into the client
# bundle (the browser can't reach it).
FROM node:20-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
# npmmirror = fast in CN; works fine elsewhere too.
RUN npm config set registry https://registry.npmmirror.com && npm ci

COPY . .

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG SUPABASE_SERVICE_KEY
ARG PIPELINE_API_URL
ARG PIPELINE_TOKEN
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    SUPABASE_SERVICE_KEY=$SUPABASE_SERVICE_KEY \
    SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY \
    PIPELINE_API_URL=$PIPELINE_API_URL \
    PIPELINE_TOKEN=$PIPELINE_TOKEN

RUN npm run build
EXPOSE 3000
CMD ["npm","run","start","--","-p","3000"]
