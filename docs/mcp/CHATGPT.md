# Connect GBrain to ChatGPT

**Status (v0.26.0):** Unblocked. GBrain's `gbrain serve --http` ships OAuth 2.1
with PKCE, which is the ChatGPT MCP connector's hard requirement. Before v1.0,
this was a P0 TODO — the only major AI client that could not connect.

ChatGPT does not support bearer-token MCP servers. You must use the OAuth 2.1
HTTP server.

## Setup

### 1. Start the HTTP server

```bash
gbrain serve --http --port 3131 --bind 0.0.0.0 --enable-dcr --public-url https://your-brain.ngrok.app
```

Save the admin bootstrap token printed on stderr. Open
`http://localhost:3131/admin` and paste it to access the dashboard.

If you're deploying on Render, the repo's `start-render.sh` already does the
same thing for you: it reads `RENDER_EXTERNAL_URL` (or `GBRAIN_PUBLIC_URL`),
binds `0.0.0.0`, and enables DCR so ChatGPT can self-register its callback.

### 2. Register a ChatGPT client

ChatGPT uses the authorization code flow with PKCE (browser-based OAuth).
For ChatGPT, do not try to paste a callback URL into GBrain's admin UI: the
current `/admin` client form does not collect redirect URIs. Instead, enable
Dynamic Client Registration and let ChatGPT send its own callback during the
OAuth handshake.

Use the ChatGPT connector's advanced OAuth settings:

1. Registration method: **User-Defined OAuth Client**.
2. Registration URL: `https://your-brain.ngrok.app/register`.
3. Auth server base: `https://your-brain.ngrok.app/`.
4. Resource: `https://your-brain.ngrok.app/`.
5. Client ID: leave blank for the first connect.
6. Client Secret: leave blank.
7. Token endpoint auth method: `none`.
8. Default scopes: `read write`.
9. Base scopes: leave blank.
10. OIDC: disabled.

When you click Connect, ChatGPT will register a public PKCE client and supply
its redirect URI itself. GBrain stores that redirect URI server-side during the
`/register` call.

### 3. Expose the server publicly

```bash
brew install ngrok
ngrok http 3131 --url your-brain.ngrok.app
```

Your OAuth issuer URL becomes `https://your-brain.ngrok.app`. ChatGPT's
connector auto-discovers the spec-compliant endpoint at
`/.well-known/oauth-authorization-server`. If the connector says
`Unregistered redirect_uri`, the server is not running with DCR enabled or the
public issuer URL does not match the URL ChatGPT is using.

### 4. Add the connector in ChatGPT

1. Open ChatGPT > Settings > Connectors.
2. Click **Add connector**.
3. MCP server URL: `https://your-brain.ngrok.app/mcp`.
4. Client ID: the `client_id` you saved in step 2.
5. Click **Connect**. ChatGPT opens the OAuth consent page, you approve, and
   the connector is live.

Start a new conversation and ask ChatGPT to search your brain. The MCP tool
calls show up in the admin dashboard's live SSE feed in real time.

## Scopes

ChatGPT clients can request any combination of `read`, `write`, `admin`. The
scopes granted at consent time are enforced on every tool call. Four
operations are `localOnly` and rejected over HTTP regardless of scope:
`sync_brain`, `file_upload`, `file_list`, `file_url`. The HTTP server fails
closed for any attempt to reach local filesystem surface area.

Recommended ChatGPT scope: `read write`. Leave `admin` for your local CLI
and the admin dashboard.

## Troubleshooting

**"Invalid redirect_uri" during the ChatGPT connector OAuth handshake**
Make sure the server is running with `--enable-dcr` and `--public-url` points
at the same public host ChatGPT reaches. ChatGPT provides the redirect URI
itself during registration, so there is no manual callback field to fill in
on the GBrain side.

**ChatGPT shows an MCP connection error after approval**
Open `/admin`, watch the SSE feed, and try again. If no request arrives, the
connector isn't reaching your ngrok URL. If a request arrives but fails,
the Request Log tab shows the exact error.

**"Unsupported grant_type" on the token endpoint**
ChatGPT uses `authorization_code`, which the MCP SDK supports natively.
If you see this error, verify the client was registered with
`--grant-types authorization_code` and not `client_credentials`.

## See also

- [DEPLOY.md](DEPLOY.md) — full OAuth 2.1 setup reference
- [ALTERNATIVES.md](ALTERNATIVES.md) — tunnel options (ngrok, Tailscale, Fly)
