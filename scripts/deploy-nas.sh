#!/usr/bin/env bash
# Publica dist/ en el Synology (paralelo a GitHub Pages). No toca remotes ni Pages.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="$ROOT/nas/deploy.env"
EXAMPLE="$ROOT/nas/deploy.env.example"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$EXAMPLE" ]]; then
    cp "$EXAMPLE" "$ENV_FILE"
    echo "Creado $ENV_FILE desde el ejemplo. Revisa rutas SMB si hace falta."
  else
    echo "Falta $ENV_FILE" >&2
    exit 1
  fi
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

NAS_PUBLISH_DIR="${NAS_PUBLISH_DIR:?Define NAS_PUBLISH_DIR en nas/deploy.env}"
NAS_MIRROR_MOBILE="${NAS_MIRROR_MOBILE:-0}"

if [[ ! -d "$NAS_PUBLISH_DIR" ]]; then
  echo "No está montado el destino: $NAS_PUBLISH_DIR" >&2
  echo "En el Finder: Conectar al servidor → smb://${NAS_HOST:-192.168.1.131} → carpeta homes." >&2
  exit 1
fi

echo "→ npm run build"
npm run build

if [[ ! -f dist/index.html ]]; then
  echo "Build incompleto: falta dist/index.html" >&2
  exit 1
fi

echo "→ rsync → $NAS_PUBLISH_DIR"
mkdir -p "$NAS_PUBLISH_DIR"
rsync -a --delete \
  --exclude '.DS_Store' \
  --exclude 'LEEME-SCADA.txt' \
  dist/ "$NAS_PUBLISH_DIR/"

if [[ "$NAS_MIRROR_MOBILE" == "1" && -n "${NAS_PUBLISH_DIR_MOBILE:-}" ]]; then
  echo "→ rsync espejo → $NAS_PUBLISH_DIR_MOBILE"
  mkdir -p "$NAS_PUBLISH_DIR_MOBILE"
  rsync -a --delete \
    --exclude '.DS_Store' \
    dist/ "$NAS_PUBLISH_DIR_MOBILE/"
fi

echo "Listo. GitHub Pages sigue igual; en DSM configura Web Station hacia:"
echo "  $NAS_PUBLISH_DIR"
echo "Luego abre la URL del virtual host / carpeta web del NAS."
