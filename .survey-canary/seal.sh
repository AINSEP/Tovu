#!/usr/bin/env bash
# Encrypts one report for the owner (public repo: findings must never be pushed in plain text).
# Usage: seal.sh <report.md> <dest-dir>  → <dest>/<name>.enc + <name>.key.enc ; deletes nothing.
set -euo pipefail
in=$1; dest=$2; name=$(basename "$in"); here=$(cd "$(dirname "$0")" && pwd)
k=$(openssl rand -hex 32)
openssl enc -aes-256-cbc -pbkdf2 -salt -in "$in" -out "$dest/$name.enc" -pass "pass:$k"
printf %s "$k" | openssl pkeyutl -encrypt -pubin -inkey "$here/pubkey.pem" -pkeyopt rsa_padding_mode:oaep -out "$dest/$name.key.enc"
