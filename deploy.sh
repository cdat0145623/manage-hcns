#!/usr/bin/env bash

set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  echo "Usage: $0 TAG=1.x.x" >&2
}

if [[ $# -ne 1 || $1 != TAG=* ]]; then
  usage
  exit 2
fi

readonly RELEASE_TAG="${1#TAG=}"

if [[ -z "$RELEASE_TAG" || ! "$RELEASE_TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9_.-]*$ ]]; then
  echo "Invalid TAG: $RELEASE_TAG" >&2
  usage
  exit 2
fi

cd "$SCRIPT_DIR"

echo "Building images..."
make build

echo "Pushing release tag: $RELEASE_TAG"
make push "TAG=$RELEASE_TAG"

echo "Deploying release tag: $RELEASE_TAG"
make deploy "TAG=$RELEASE_TAG"

echo "Deployment completed successfully."
