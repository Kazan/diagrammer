#!/usr/bin/env bash
set -euo pipefail

# Outputs the values needed for GitHub secrets to sign release builds.
# It will reuse existing env vars when present, otherwise prompt interactively.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_STORE_FILE="$ROOT_DIR/keystore/diagrammer-release.keystore"
STORE_FILE="${RELEASE_STORE_FILE:-$DEFAULT_STORE_FILE}"

if [[ ! -f "$STORE_FILE" ]]; then
  echo "Keystore not found at $STORE_FILE" >&2
  exit 1
fi

prompt_secret() {
  local var_name="$1" prompt_text="$2"
  local current_value
  current_value="${!var_name:-}"
  if [[ -z "$current_value" ]]; then
    read -rsp "$prompt_text" current_value
    echo >&2
  fi
  printf -v "$var_name" '%s' "$current_value"
}

prompt_secret "RELEASE_STORE_PASSWORD" "Enter store password (RELEASE_STORE_PASSWORD): "

# Try to auto-detect alias using keytool + store password; fall back to prompt.
RELEASE_KEY_ALIAS="${RELEASE_KEY_ALIAS:-}"
if [[ -z "$RELEASE_KEY_ALIAS" && -n "$RELEASE_STORE_PASSWORD" && -x "$(command -v keytool || true)" ]]; then
  DETECTED_ALIAS=$(keytool -list -keystore "$STORE_FILE" -storepass "$RELEASE_STORE_PASSWORD" 2>/dev/null | sed -n 's/^Alias name: //p' | head -n1 || true)
  if [[ -n "$DETECTED_ALIAS" ]]; then
    RELEASE_KEY_ALIAS="$DETECTED_ALIAS"
  fi
fi

prompt_secret "RELEASE_KEY_ALIAS" "Enter key alias (RELEASE_KEY_ALIAS): "

# Default key password to store password when not provided.
RELEASE_KEY_PASSWORD="${RELEASE_KEY_PASSWORD:-$RELEASE_STORE_PASSWORD}"
prompt_secret "RELEASE_KEY_PASSWORD" "Enter key password (RELEASE_KEY_PASSWORD, default is store password): "

# Base64 encode the keystore without newlines for GitHub secrets.
RELEASE_KEYSTORE_BASE64=$(base64 < "$STORE_FILE" | tr -d '\n')

cat <<EOF
RELEASE_KEYSTORE_BASE64=$RELEASE_KEYSTORE_BASE64
RELEASE_STORE_PASSWORD=$RELEASE_STORE_PASSWORD
RELEASE_KEY_ALIAS=$RELEASE_KEY_ALIAS
RELEASE_KEY_PASSWORD=$RELEASE_KEY_PASSWORD
EOF
