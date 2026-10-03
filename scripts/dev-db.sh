#!/usr/bin/env bash
# Ambiente de desenvolvimento local no Docker: Supabase (Postgres + login + API) e Redis com a API do Upstash.
#   npm run dev:db        sobe tudo e gera o .env.development.local
#   npm run dev:db:stop   desliga (os dados ficam guardados nos volumes do Docker)
# Depois de subir: `npm run db:seed` copia os dados de produção; `npm run dev` roda o app já no ambiente local.
set -euo pipefail
cd "$(dirname "$0")/.."

# OrbStack: ferramentas e soquete do Docker (o comando `docker` pode não estar no PATH do terminal).
ORB_BIN=/Applications/OrbStack.app/Contents/MacOS/xbin
[ -d "$ORB_BIN" ] && export PATH="$ORB_BIN:$PATH"
[ -S "$HOME/.orbstack/run/docker.sock" ] && export DOCKER_HOST="${DOCKER_HOST:-unix://$HOME/.orbstack/run/docker.sock}"

# Serviços do Supabase que o app não usa ficam de fora para subir mais leve.
SKIP=realtime,storage-api,imgproxy,edge-runtime,logflare,vector,supavisor

if [ "${1:-}" = "stop" ]; then
  npx supabase stop
  docker-compose -f docker-compose.dev.yml stop
  exit 0
fi

docker info >/dev/null 2>&1 || { echo "O Docker não está rodando. Abra o OrbStack e tente de novo."; exit 1; }

docker-compose -f docker-compose.dev.yml up -d
npx supabase start -x "$SKIP"

# Variáveis do ambiente local. No `next dev`, o .env.development.local tem prioridade sobre o .env.local (produção).
ENV_FILE=.env.development.local
STATUS=$(npx supabase status -o env 2>/dev/null)
val() { echo "$STATUS" | grep -E "^$1=" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }
API_URL=$(val API_URL); ANON=$(val ANON_KEY); SERVICE=$(val SERVICE_ROLE_KEY); DB_URL=$(val DB_URL)
[ -n "$API_URL" ] && [ -n "$ANON" ] && [ -n "$SERVICE" ] || { echo "Não consegui ler as chaves do Supabase local."; exit 1; }

# A chave de criptografia local é criada uma vez e mantida (é diferente da de produção de propósito).
KEY=$(grep -E '^TOKEN_ENCRYPTION_KEY=' "$ENV_FILE" 2>/dev/null | cut -d= -f2- || true)
[ -n "$KEY" ] || KEY=$(openssl rand -base64 32)

cat > "$ENV_FILE" <<EOF
# GERADO por scripts/dev-db.sh. Ambiente LOCAL (Docker). Não vai para o Git.
MUCHCHAT_ENV=dev
# Modo de teste: nenhuma DM, resposta ou publicação sai de verdade no Instagram.
DRY_RUN=true

# Supabase local
NEXT_PUBLIC_SUPABASE_URL=$API_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON
SUPABASE_URL=$API_URL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE
POSTGRES_URL_NON_POOLING=$DB_URL

# Redis local (API compatível com o Upstash, docker-compose.dev.yml)
KV_REST_API_URL=http://127.0.0.1:8079
KV_REST_API_TOKEN=muchchat-dev-token

# Chave própria do ambiente local: os tokens de produção não abrem aqui.
TOKEN_ENCRYPTION_KEY=$KEY

# Sem acesso ao armazenamento de mídia de produção: apagar uma publicação local não pode apagar a mídia real.
BLOB_READ_WRITE_TOKEN=
EOF

echo
echo "Ambiente local no ar."
echo "  App:       npm run dev  →  http://localhost:3000"
echo "  Banco:     $DB_URL"
echo "  Studio:    http://127.0.0.1:54323 (ver e editar tabelas)"
echo "  E-mails:   http://127.0.0.1:54324 (caixa de entrada falsa: confirmação e troca de senha)"
echo "  Dados:     npm run db:seed  (copia produção para o local)"
