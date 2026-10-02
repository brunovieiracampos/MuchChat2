#!/usr/bin/env bash
# Cria as tabelas no banco de DESENVOLVIMENTO aplicando supabase/migrations em ordem.
# Lê POSTGRES_URL_NON_POOLING de .env.development.local e se recusa a rodar contra o banco de produção.
set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=.env.development.local
PROD_REF=ktmmxvukdtgzjyhovqma

[ -f "$ENV_FILE" ] || { echo "Crie o $ENV_FILE a partir de .env.development.example."; exit 1; }
DB_URL=$(grep -E '^POSTGRES_URL_NON_POOLING=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')
[ -n "$DB_URL" ] || { echo "Preencha POSTGRES_URL_NON_POOLING no $ENV_FILE."; exit 1; }
case "$DB_URL" in *"$PROD_REF"*) echo "Esse endereço é do banco de PRODUÇÃO. Nada foi feito."; exit 1;; esac

for f in supabase/migrations/*.sql; do
  echo "→ $f"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "Pronto: tabelas criadas no banco de desenvolvimento."
