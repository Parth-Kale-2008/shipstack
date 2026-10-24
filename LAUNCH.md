# Launching ShipStack on shipzo.tech

When you're done:

- **https://shipzo.tech** shows the ShipStack dashboard (sign up, deploy).
- **https://\<app-name\>.shipzo.tech** shows each deployed app, with HTTPS.
- Everything runs on a free cloud server 24/7, even with your laptop off.

It takes about 30–45 minutes the first time. Steps 1 and 3 happen in your own accounts; step 2 is one command.

---

## Step 1: Create a free Ubuntu server

Pick **one** option.

### Option A: Azure for Students (no credit card)

1. Go to **azure.microsoft.com/free/students** and sign up with your college email. You get $100 credit for 12 months.
2. In the Azure portal: **Create a resource → Virtual machine**.
   - **Image:** Ubuntu Server 24.04 LTS
   - **Size:** `B1s` (free for 12 months), or `B2s` if you want faster builds (uses credit)
   - **Authentication:** SSH public key. Azure creates a `.pem` key file, so download it and keep it safe.
   - **Inbound ports:** allow **SSH (22), HTTP (80), HTTPS (443)**
   - **Disk:** 30 GB Standard SSD (64 GB is free with the student offer)
3. Create it, then copy the **Public IP address** from the VM page.

### Option B: Oracle Cloud Always Free (free forever, card needed for verification only)

1. Sign up at **oracle.com/cloud/free**.
2. **Compute → Instances → Create instance**.
   - **Image:** Canonical Ubuntu 24.04
   - **Shape:** Ampere `VM.Standard.A1.Flex`, 2 OCPU / 12 GB RAM (inside the free limit)
   - **SSH keys:** "Generate a key pair for me" and download the private key
3. After it starts: open its **Subnet → Default Security List → Add Ingress Rules**, source `0.0.0.0/0`, TCP ports **80** and **443**.
4. Copy the **Public IP address**.

> If Oracle says "Out of capacity" for the free ARM shape, try another availability domain, or use Azure.

---

## Step 2: Copy ShipStack to the server and install it

On your laptop, open PowerShell in the folder that **contains** `shipstack-saas`. Replace `KEY.pem` with your key file and `IP` with the server IP. The username is `azureuser` on Azure and `ubuntu` on Oracle.

```powershell
scp -i KEY.pem -r shipstack-saas azureuser@IP:~/
ssh -i KEY.pem azureuser@IP
```

Now you're on the server:

```bash
sudo bash ~/shipstack-saas/deploy/install.sh shipzo.tech your@email.com
```

This installs Docker, Node.js and Caddy (HTTPS), sets up ShipStack as a service that starts on boot, and prints the server's IP at the end.

> If Windows complains the key file is "too open", run this once in PowerShell:
> `icacls KEY.pem /inheritance:r /grant:r "$($env:USERNAME):R"`

---

## Step 3: Point shipzo.tech at the server (get.tech)

1. Log in at **get.tech** (or the panel where you claimed the domain through the GitHub Student Pack). Open **shipzo.tech → Manage DNS** (it may be called DNS Management or Zone Records).
2. Delete any existing **A** records for `@` or `www` that point to a parking page.
3. Add:

| Type | Host / Name | Value | TTL |
|---|---|---|---|
| A | `@` | your server IP | 3600 |
| A | `*` | your server IP | 3600 |

The `*` record is what makes `anything.shipzo.tech` reach the server, so each app gets its own address.

> If the panel doesn't accept `*` as a host: add `shipzo.tech` to a free **Cloudflare** account, set the two records there (keep the cloud icon **grey / DNS only**), and change the domain's nameservers at get.tech to the two Cloudflare gives you.

DNS usually updates within 5–30 minutes (rarely up to 24 h). To check it from your laptop:

```powershell
nslookup shipzo.tech
nslookup test.shipzo.tech
```

Both should show your server IP.

---

## Step 4: Open it

Go to **https://shipzo.tech**, create your account, and deploy a template. The first visit to each address takes ~20 seconds while its HTTPS certificate is issued.

---

## Running it day to day

| Task | Command (on the server) |
|---|---|
| Live logs | `journalctl -u shipstack -f` |
| Restart | `sudo systemctl restart shipstack` |
| Change settings | `sudo nano /etc/shipstack.env`, then restart |
| Close public sign-ups | set `ALLOW_SIGNUP=false` in the settings file |
| Update to new code | `scp` the folder again, then rerun `install.sh` (data and settings are kept) |
| Back up data | `sudo tar czf shipstack-backup.tgz /var/lib/shipstack/data /etc/shipstack.env` |
| Disk space | `docker system prune -af` removes unused images |

**Defaults on the public server:** 3 projects per account, 1 build at a time (good for a 1 GB server), apps only reachable through `https://<name>.shipzo.tech`, user apps always in Docker containers with memory/CPU limits. Without Docker, deployments pause rather than run user code directly on the server.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser can't reach shipzo.tech | Check DNS (`nslookup`), and that ports 80/443 are open in the Azure *Networking* tab or the Oracle *Security List* |
| Certificate / "not secure" error | DNS hasn't reached the server yet; wait, then `sudo systemctl restart caddy` |
| Builds are very slow or killed | 1 GB servers are tight: use Azure `B2s` / Oracle 2 OCPU, or keep `MAX_CONCURRENT_BUILDS=1` |
| "Deployments are paused" | Docker stopped: `sudo systemctl restart docker shipstack` |
