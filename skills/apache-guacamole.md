---
name: apache-guacamole
description: Browser-clientless remote desktop gateway. Wraps VNC/RDP/SSH and serves them as an HTML5 canvas + WebSocket — the controller needs only a browser tab.
priority: niche-fallback
when_to_use: The controller is browser-only (a phone, a Chromebook, a kiosk, a colleague who doesn't have your tooling installed). Or you want a single web UI to multiplex sessions to many controlled machines. Or compliance requires the gateway-and-audit pattern (every session goes through one inspectable choke point).
when_to_skip: You're in a 1:1 OpenClaw scenario where both ends run the connector binary. `webrtc` is lower-latency, `vnc` is simpler. Don't reach for Guacamole unless the *controller* really needs to be a vanilla browser.
---

# apache-guacamole

Three components. Together they let any browser drive any VNC/RDP/SSH backend without installing a client:

```
┌───────────────────┐   HTTPS   ┌──────────────────────┐   WebSocket   ┌────────────┐
│ Browser           │ ←───────→ │ guacamole-client     │ ←───────────→ │   guacd    │
│ (HTML5 canvas)    │           │ (Java web app on     │   tunnel      │   (C       │
│                   │           │  Tomcat / standalone)│               │   daemon)  │
└───────────────────┘           └──────────────────────┘               └────────────┘
                                                                              ↓
                                                  RFB / RDP / SSH / Telnet / Kubernetes
                                                                              ↓
                                                                       ┌──────────────┐
                                                                       │ controlled   │
                                                                       │  machine     │
                                                                       │ (VNC server) │
                                                                       └──────────────┘
```

- **`guacd`** — the proxy daemon. Speaks RFB/RDP/SSH outbound; Guacamole protocol over WebSocket inbound. Written in C, tiny (~5 MB binary).
- **`guacamole-client`** — Java web app. Authenticates users, orchestrates connections, serves the HTML5 client, brokers the WebSocket between browser and `guacd`.
- **Browser** — opens the Guacamole URL, gets back a canvas + JS client. Renders frames, sends mouse/keyboard, all over WebSocket.

## Required setup (Docker, the only sane way)

```bash
docker network create guacamole-net

# 1. The proxy daemon
docker run -d --name guacd \
  --network guacamole-net \
  guacamole/guacd:1.5.5

# 2. The web app
docker run -d --name guacamole \
  --network guacamole-net \
  -e GUACD_HOSTNAME=guacd \
  -e EXTENSION_PRIORITY=jdbc-postgresql \
  -e POSTGRES_HOSTNAME=db \
  -e POSTGRES_DATABASE=guacamole_db \
  -e POSTGRES_USER=guacamole_user \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  -p 8080:8080 \
  guacamole/guacamole:1.5.5

# 3. Postgres for connection metadata + auth
docker run -d --name db \
  --network guacamole-net \
  -e POSTGRES_DB=guacamole_db \
  -e POSTGRES_USER=guacamole_user \
  -e POSTGRES_PASSWORD=$DB_PASSWORD \
  postgres:16
```

Hit `http://localhost:8080/guacamole`. Default login is `guacadmin` / `guacadmin` — **change immediately**.

For TLS: front Tomcat with Caddy or nginx (`reverse_proxy localhost:8080` with auto-cert). Don't expose `:8080` directly on the public internet.

## Defining a connection (REST API)

```bash
# Get an auth token
TOKEN=$(curl -sd "username=guacadmin&password=$ADMIN_PASS" \
  http://localhost:8080/guacamole/api/tokens | jq -r .authToken)

# Create a VNC connection that points at an OpenClaw-controlled Mac on the AXL Yggdrasil mesh
curl -X POST "http://localhost:8080/guacamole/api/session/data/postgresql/connections?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<EOF
{
  "name": "openclaw-mac-derek",
  "protocol": "vnc",
  "parameters": {
    "hostname": "203:a715:4888:f3da:ae90:54b1:91a6:961e",
    "port": "5900",
    "password": "$VNC_PASSWORD",
    "color-depth": "32",
    "cursor": "remote",
    "enable-audio": "false"
  },
  "attributes": {
    "max-connections": "1",
    "max-connections-per-user": "1"
  }
}
EOF
```

Now `https://your-host/guacamole/#/client/<conn-id>` opens a remote-control session in any browser.

## API surface (for the OpenClaw controller agent)

The agent doesn't drive Guacamole's frontend directly; it uses the REST API to provision connections and the browser-facing URL to hand off to the user (or to a headless browser if the agent itself wants to drive). For the latter:

```ts
import { chromium } from "playwright";

export async function aiViaGuacamole(connectionId: string, token: string) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`https://guac.openclaw.local/#/client/${connectionId}?token=${token}`);
  await page.waitForSelector("canvas.display");

  // Now you can:
  // 1. Screenshot the canvas → pass to vision (computer-use loop)
  // 2. Synthesize mouse events on the canvas (page.mouse.click)
  //    Guacamole forwards them through guacd to the VNC server.
  return { browser, page };
}
```

This is "remote control of a remote control" — useful when the controller agent must run inside a containerized / sandboxed environment that can't make outbound TCP to arbitrary ports but CAN reach the Guacamole HTTPS endpoint.

## Auth integrations (skip the built-in DB if possible)

Guacamole ships with several auth extensions — pick whichever already gates the rest of your infra:

- **OIDC** (Okta, Auth0, Authentik) — ship `guacamole-auth-sso-openid-*.jar` to `/opt/guacamole/extensions`.
- **LDAP** — `guacamole-auth-ldap`.
- **Header auth** (sso-header) — when fronted by a SSO reverse proxy that injects `REMOTE_USER`.
- **TOTP** — adds 2FA on top of any other auth.

For OpenClaw: use OIDC pointed at your existing identity provider; map ENS subnames as user IDs via a custom claim.

## When to fall back

| failure signal | fall back to |
|---|---|
| `guacd` can't reach the backend (`vnc connect refused`) | The VNC server isn't listening or AXL routing isn't established. Verify with `nc -vz <ip> 5900` from the guacd host. |
| Browser shows "tunnel closed unexpectedly" mid-session | guacd → backend connection dropped. Check guacd logs (`docker logs guacd`); usually a network blip or a backend-side disconnect. |
| Latency > 1s on every click | You're bottlenecked on a slow guacd → backend hop, OR the browser → guacamole hop. Measure with browser devtools. Consider `webrtc` direct P2P instead. |
| Need to host this for many controllers | Add `guacamole-client` replicas behind a load balancer; `guacd` is stateless and horizontally scalable. |

## Security

- Default `guacadmin/guacadmin` is the most-exploited credential in the Guacamole CVE list. Change before you bind to anything routable.
- The Postgres DB stores connection passwords (VNC, RDP). Encrypt at rest (`TDE` or full-disk), restrict network access to the guacamole container.
- TLS-terminate at a reverse proxy. Set `X-Forwarded-For` and `X-Forwarded-Proto` so Guacamole's session cookies get the `secure` flag.
- Tomcat's default session timeout is 30 min — explicit `<session-timeout>` in `web.xml` if you want shorter.

## Performance

- Round-trip click latency: ~150–300ms on a same-region session. Worse than `webrtc` (which is direct P2P), comparable to a `vnc` session over a similar path.
- CPU: ~5% per concurrent session on the guacd host (mostly RFB decode + Guacamole-protocol re-encode).
- Bandwidth: ~300–800 KB/s per session at 1080p, depending on screen activity.

## Why this is in the toolbox at all

Because sometimes you don't get to pick the controller's environment. A user on an iPad in a lobby doesn't have native VNC; a colleague on a Chromebook can't run Pion; a compliance team requires every remote session to flow through one auditable proxy. Guacamole is the answer in those scenarios — overkill for everything else.
