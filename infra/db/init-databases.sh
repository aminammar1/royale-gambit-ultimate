#!/bin/sh
# Creates one role and one database per service (ADR-06). Safe to run on every `up`: anything
# that already exists is left alone, so a service added later gets its database without wiping
# the volume. Runs from the one-shot `postgres-init` container (PGHOST, PGUSER, PGPASSWORD set).
# Dev only: each role's password equals its name. Real environments use secrets (M16).
set -eu
for db in $SERVICE_DATABASES; do
  psql -v ON_ERROR_STOP=1 -v db="$db" --dbname postgres -q <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'db', :'db')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'db') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'db', :'db')
 WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') \gexec
SQL
  echo "database $db ready"
done
