# Public demo via Cloudflare named tunnel (on your own domain)

Runs entirely on the Pi host — no router port-forwarding, no cloud VM. Only
`:3000` (the Next BFF) is exposed; the API is loopback-bound in
docker-compose.yml and the Spark LLM stays LAN-only.

## Prereqs
- A Cloudflare account with your domain's DNS on Cloudflare (nameservers pointed).
- The stack running: `docker compose up -d` (api healthy on 127.0.0.1:8100, web on :3000).

## One-time setup (Pi host)

```bash
# 1) Install cloudflared (arm64 build for the Pi 4)
curl -L -o cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
sudo install -m 755 cloudflared /usr/local/bin/

# 2) Authorize against your Cloudflare account (opens a browser; pick your domain)
cloudflared tunnel login

# 3) Create the tunnel — note the UUID it prints (<TUUID>)
cloudflared tunnel create evolent-demo

# 4) Config: copy the repo template, replace <TUUID> and <your-domain>
mkdir -p ~/.cloudflared
cp demo/cloudflared-config.yml ~/.cloudflared/evolent-demo.yml
nano ~/.cloudflared/evolent-demo.yml

# 5) DNS record: reviewer.<your-domain> -> the tunnel (proxied, orange cloud)
cloudflared tunnel route dns evolent-demo reviewer.<your-domain>
```

## Demo day

```bash
# Start the tunnel (foreground — Ctrl-C when done)
cloudflared tunnel --config ~/.cloudflared/evolent-demo.yml run

# ...or start it first & hands-off if you want the link always available:
#   sudo cloudflared service install /home/p11primera/.cloudflared/evolent-demo.yml
```

Then verify from an external network (phone on LTE):
`https://reviewer.<your-domain>/login` → sign in → run a review.

## Notes
- Login is a display name, not authentication (see README limitations). For a
  5-minute extra gate: Cloudflare Zero Trust → Access → add an app on
  reviewer.<your-domain> with a one-time-pin email policy — visitors need an
  emailed code before reaching the app.
- The DNS record persists when the tunnel is stopped; visitors then get a
  clean Cloudflare 530. Tearing down entirely:
  `cloudflared tunnel delete evolent-demo` (deletes the record too).
- `cloudflared tunnel list` / `cloudflared tunnel list --tunnel <TUUID>` for
  connection status.
