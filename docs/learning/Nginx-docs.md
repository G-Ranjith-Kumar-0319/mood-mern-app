# Nginx — learning guide for this project

Nginx is the single entry point: it serves the built React app, reverse-proxies and
load-balances `/api` to the Node instances, terminates TLS in production, and adds
security headers.

Files: [nginx/nginx.conf](../../nginx/nginx.conf) (local),
[nginx/nginx.prod.conf](../../nginx/nginx.prod.conf) (TLS),
[nginx/snippets/](../../nginx/snippets/)

---

## Directives used

### Load balancing

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;          # Docker's DNS
upstream api_upstream {
    zone api_upstream 64k;                       # shared memory, needed for `resolve`
    server api:5000 resolve max_fails=3 fail_timeout=10s;
    keepalive 32;                                # reuse connections to Node
}
```

- `api` resolves to **every replica**; requests are spread round-robin.
- `resolve` (open-source Nginx ≥ 1.27.3) re-resolves the name every 10 s, so
  scaled or restarted replicas join without restarting Nginx. Verified: scaling
  2 → 3 split 30 requests 10/10/10; scaling back lost 0 of 60.
- `max_fails`/`fail_timeout` take a failing instance out for 10 s (passive health checks).

### Proxying ([snippets/proxy-api.conf](../../nginx/snippets/proxy-api.conf))

| Directive                                                                 | Why                                                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proxy_pass http://api_upstream`                                          | Forward to the pool                                                                                                                                |
| `proxy_http_version 1.1` + `proxy_set_header Connection ""`               | Upstream keep-alive                                                                                                                                |
| `proxy_set_header X-Forwarded-For / X-Forwarded-Proto / X-Real-IP / Host` | The API sees the real client IP and protocol (`trust proxy 1`)                                                                                     |
| `proxy_set_header X-Request-Id $request_id`                               | One id from Nginx to the API logs and back to the browser                                                                                          |
| `proxy_connect_timeout 5s`, `proxy_read_timeout 30s`                      | Don't hang forever                                                                                                                                 |
| `proxy_next_upstream error timeout http_502 http_503` + `tries 2`         | If an instance fails, retry on another (never retries POST/DELETE by default). Verified: with one API container stopped, 30/30 requests succeeded. |

### Server-Sent Events location

```nginx
location = /api/v1/expressions/events {
    include /etc/nginx/snippets/proxy-api.conf;
    proxy_buffering off;         # pass each event through immediately
    proxy_read_timeout 1h;       # the stream is long-lived (heartbeat every 25 s)
}
```

(Directives can't be repeated in one context. `proxy_read_timeout` had to move
out of the shared snippet; Nginx refused to start with "directive is duplicate".)

### Serving the SPA

```nginx
root /usr/share/nginx/html;
location /assets/ { add_header Cache-Control "public, max-age=31536000, immutable" always; }
location /models/ { add_header Cache-Control "public, max-age=604800" always; }
location /        { add_header Cache-Control "no-cache" always; try_files $uri /index.html; }
```

- Hashed `/assets/` files can be cached forever; `index.html` and `sw.js` must be revalidated.
- `try_files $uri /index.html`: unknown paths return the app, and React Router
  handles them.

### Security headers ([snippets/security-headers.conf](../../nginx/snippets/security-headers.conf))

`Content-Security-Policy`, `X-Frame-Options DENY`, `X-Content-Type-Options`,
`Referrer-Policy`, `Permissions-Policy camera=(self), microphone=()`.
**Gotcha:** a location that has its own `add_header` does _not_ inherit the
server-level ones, so the snippet is included in every location.

### TLS (production)

`listen 8443 ssl; http2 on;`, `ssl_certificate`, `ssl_protocols TLSv1.2 TLSv1.3`,
`ssl_session_cache`, HSTS (`Strict-Transport-Security`), and port 8080 does
`return 301 https://$host$request_uri`. The unprivileged image can't bind 80/443,
so Compose maps 80→8080 and 443→8443.

### Other

`client_max_body_size 16k`, `server_tokens off`, `gzip on`, a custom `log_format`
with `$request_time`, `$upstream_addr` and `$request_id`, and an internal-only
`/nginx-health` endpoint on 127.0.0.1:8081 for the container healthcheck.

## Exercises

1. Remove `proxy_buffering off` from the events location, rebuild, and watch
   how events arrive (`curl -N`).
2. Change the upstream to `least_conn;` and compare the distribution.
