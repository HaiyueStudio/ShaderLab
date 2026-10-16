#!/usr/bin/env bash
set -euo pipefail
if [[ "$(uname -s)" != "Darwin" ]]; then echo "iOS archive requires macOS and Xcode." >&2; exit 1; fi
cd "$(dirname "$0")/../.."
npm ci --ignore-scripts
cd mobile
bundle install
node scripts/doctor.mjs ios
node scripts/build.mjs build ios --for-device "$@"
