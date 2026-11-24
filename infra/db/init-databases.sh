#!/bin/sh
# Creates one role and one database per service (ADR-06). Runs once, on an empty data volume.
# Dev only: each role's password equals its name. Real environments use secrets (M16).
set -eu
for db in $SERVICE_DATABASES; do
  echo "creating database $db"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<SQL
CREATE ROLE "$db" LOGIN PASSWORD '$db';
CREATE DATABASE "$db" OWNER "$db";
SQL
done
