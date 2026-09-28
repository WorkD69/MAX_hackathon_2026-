#!/usr/bin/env python3
"""Создать серверный env, не выводя его содержимое. Запускать через sudo."""
import os
import re
import secrets
import sys
from pathlib import Path

sha = sys.argv[1]
if not re.fullmatch(r"[0-9a-f]{40}", sha):
    raise SystemExit("BUILD_SHA_INVALID")
directory = Path('/etc/max-smart-city')
env_path = directory / 'production.env'
token = (directory / 'bot-token').read_text().strip()
if len(token) < 8 or any(c in token for c in '\r\n\x00'):
    raise SystemExit('BOT_TOKEN_INVALID_FORMAT')
if env_path.exists():
    existing = dict(line.split('=', 1) for line in env_path.read_text().splitlines() if '=' in line)
else:
    existing = {}
values = {
    'BUILD_SHA': sha, 'APP_ENV': 'production', 'HOST': '0.0.0.0', 'PORT': '3000',
    'DEMO_MODE': 'true', 'MAX_ADAPTER_MODE': 'live', 'MAX_BOT_TOKEN': token,
    'MAX_WEBHOOK_SECRET': existing.get('MAX_WEBHOOK_SECRET') or secrets.token_hex(32),
    'APP_SESSION_SECRET': existing.get('APP_SESSION_SECRET') or secrets.token_hex(48),
    'POSTGRES_USER': 'city', 'POSTGRES_DB': 'city',
    'POSTGRES_PASSWORD': existing.get('POSTGRES_PASSWORD') or secrets.token_hex(32),
    'PUBLIC_APP_URL': 'https://157-22-231-21.sslip.io/',
    'PUBLIC_API_BASE_URL': 'https://157-22-231-21.sslip.io/api/v1',
}
os.umask(0o077)
temporary = directory / 'production.env.new'
temporary.write_text(''.join(f'{k}={v}\n' for k, v in values.items()))
temporary.chmod(0o600)
temporary.replace(env_path)
env_path.chmod(0o600)
print('SERVER_ENV_READY root-only; values not printed')
