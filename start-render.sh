#!/bin/bash
set -euo pipefail

export PATH="$PWD/node_modules/.bin:$PATH"

: "${PROXY_API_KEY:?PROXY_API_KEY is required}"
: "${PROXY_BASE_URL:?PROXY_BASE_URL is required}"

export PROXY_API_KEY PROXY_BASE_URL

mkdir -p "$HOME/.gbrain"

node <<'NODE'
const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.HOME, '.gbrain', 'config.json');
const configDir = path.dirname(configPath);

let config = {};
if (fs.existsSync(configPath)) {
	try {
		config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
	} catch (error) {
		throw new Error(`Invalid JSON in ${configPath}: ${error.message}`);
	}
}

delete config.openai_api_key;
config.embedding_model = 'litellm:text-embedding-3-small';
config.embedding_dimensions = 1536;
config.chat_model = 'litellm:mistralai/mistral-medium-3.5-128b';
const providerBaseUrls = { ...(config.provider_base_urls ?? {}) };
delete providerBaseUrls.openai;
providerBaseUrls.litellm = process.env.PROXY_BASE_URL;
config.provider_base_urls = {
	...providerBaseUrls,
};

fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
try {
	fs.chmodSync(configPath, 0o600);
} catch {
	// Ignore chmod failures on filesystems that do not support it.
}
NODE

export LITELLM_BASE_URL="$PROXY_BASE_URL"
export LITELLM_API_KEY="$PROXY_API_KEY"

PUBLIC_URL="${GBRAIN_PUBLIC_URL:-${RENDER_EXTERNAL_URL:-}}"
if [ -z "$PUBLIC_URL" ]; then
	echo "ERROR: set RENDER_EXTERNAL_URL (Render) or GBRAIN_PUBLIC_URL so OAuth clients can register against the public issuer URL." >&2
	exit 1
fi

bun run src/cli.ts config set models.default "litellm:mistralai/mistral-medium-3.5-128b"
bun run src/cli.ts config set models.chat "litellm:mistralai/mistral-medium-3.5-128b"

echo "Applying database migrations..."
bun run src/cli.ts apply-migrations --yes --non-interactive

echo "Starting background minions..."
bun run src/cli.ts jobs work &

echo "Starting HTTP MCP server..."
exec bun run src/cli.ts serve --http --enable-dcr --bind 0.0.0.0 --port "${PORT:-10000}" --public-url "$PUBLIC_URL"