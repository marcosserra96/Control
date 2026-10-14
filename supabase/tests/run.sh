#!/usr/bin/env bash
# Testa o schema num Postgres local (precisa de psql e de um servidor acessível).
# Uso: PGHOST=... PGPORT=... PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=control_schema_test
psql -q -c "drop database if exists $DB" -c "create database $DB"
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql -f supabase/migrations/0001_schema.sql >/dev/null 2>&1
# A migração precisa poder ser executada de novo sem erro
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/migrations/0001_schema.sql >/dev/null 2>&1
psql -q -d $DB -v ON_ERROR_STOP=1 -f supabase/tests/schema.test.sql 2>&1 | grep -E "OK|ERROR|assert" 
psql -q -c "drop database $DB"
