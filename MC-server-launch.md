# Mission Control Server Launch

This file is startup and operations instructions. It does not by itself prove services are running.
Live verification timestamps belong in `MISSION_CONTROL.md` and the AgentOS work log.

## Preferred: systemd user services

Mission Control production processes are owned by the user systemd instance, not Hermes Desktop.

### Install / reload units (after unit file changes)

```bash
mkdir -p ~/.config/systemd/user
cp /home/oggie/mission-control/deploy/systemd/user/mission-control.service \
   /home/oggie/mission-control/deploy/systemd/user/mission-dispatcher.service \
   ~/.config/systemd/user/
systemctl --user daemon-reload
```

Canonical unit sources live in the repo under `deploy/systemd/user/`.
Installed copies live under `~/.config/systemd/user/`.

### Control commands

```bash
systemctl --user start mission-control
systemctl --user stop mission-control
systemctl --user restart mission-control
systemctl --user status mission-control

systemctl --user start mission-dispatcher
systemctl --user stop mission-dispatcher
systemctl --user restart mission-dispatcher
systemctl --user status mission-dispatcher

systemctl --user enable mission-control mission-dispatcher
systemctl --user disable mission-control mission-dispatcher
```

### Logs

```bash
journalctl --user -u mission-control -f
journalctl --user -u mission-dispatcher -f
journalctl --user -u mission-control -n 100 --no-pager
journalctl --user -u mission-dispatcher -n 100 --no-pager
```

### Deploy a new build

Do **not** build inside `ExecStart`. Build first, then restart:

```bash
cd /home/oggie/mission-control
systemctl --user stop mission-control mission-dispatcher
npm run build
systemctl --user start mission-control mission-dispatcher
# or: systemctl --user restart mission-control mission-dispatcher
```

### Prerequisites

```bash
docker start mission-control-pg
```

Each service runs `scripts/wait-for-postgres.sh` before start (starts the container if possible and waits for TCP `127.0.0.1:5432`).

### Secrets

Both services load `/home/oggie/mission-control/.env` through `scripts/systemd-exec.cjs`.

Requirements:

- `.env` must be **owned by `oggie`**
- `.env` mode must be **`0600`** (`chmod 600 .env`)
- The launcher **refuses to start** if group/other bits are set
- Secrets must **never** be stored in unit files
- Values are loaded **literally** (no shell `eval`, no `$VAR` expansion, no `$(command)` execution)

```bash
stat -c '%U %a %n' /home/oggie/mission-control/.env
# expected: oggie 600 /home/oggie/mission-control/.env
```

### Restart rate limits

Both units set:

```ini
StartLimitIntervalSec=300
StartLimitBurst=5
Restart=on-failure
RestartSec=5
```

Repeated immediate failures place the service in a failed/start-limit state rather than restarting forever.

### Health checks

```bash
curl -sS http://localhost:3000/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/missions/state
curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/missions
```

Healthy health body:

```json
{"ok":true,"db":"connected"}
```

### Independence

- `mission-control` and `mission-dispatcher` do **not** require each other.
- Both require PostgreSQL.
- Either service can be restarted alone.

### Legacy worker

Leave the Hermes `mission-worker` cron **disabled** while `mission-dispatcher` is active.

### Linger note

`loginctl show-user oggie -p Linger` may already report `Linger=yes` on this host.
Linger keeps user services running after logout / before login.
Do not change linger without reviewing security implications (persistent user services, broader attack surface when logged out).

## Manual fallback (not preferred)

Only for debugging when systemd units are stopped:

```bash
docker start mission-control-pg
cd /home/oggie/mission-control
npm run build
npm run start -- -p 3000
# other terminal:
npm run dispatcher
```

Manual processes die when the owning terminal/Hermes session closes. Prefer systemd.
