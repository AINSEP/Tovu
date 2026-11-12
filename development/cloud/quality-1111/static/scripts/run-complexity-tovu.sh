#!/bin/bash
export PATH=$HOME/.local/node24/bin:$PATH
cd /home/user/Tovu
npm run complexity:strict -- -f json -o /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-tovu.json > /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-tovu.txt 2>&1; echo "exit $?" >> /home/user/Tovu/development/cloud/quality-1111/static/raw/complexity-tovu.txt
