#!/usr/bin/env bash
set -euo pipefail

APP_NAME="okapi-programasdteme"
APP_DIR="/var/www/okapi.programasdteme.com/current"

if [[ ! -d "$APP_DIR" ]]; then
  echo "No existe $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "Actualizando codigo..."
git fetch origin
git checkout main
git pull --ff-only origin main

echo "Instalando dependencias..."
npm ci

echo "Generando cliente Prisma..."
npx prisma generate

echo "Aplicando esquema de base de datos..."
npx prisma db push

echo "Compilando frontend..."
npm run build

echo "Reiniciando PM2..."
pm2 startOrReload ecosystem.config.cjs --env production
pm2 save

echo "Despliegue completado."
