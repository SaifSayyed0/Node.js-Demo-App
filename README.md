# Notes App: learn servers, ports and EC2

A tiny full-stack app. The browser (frontend) talks to a Node.js server (backend) which saves each note as a `.md` file in the `notes/` folder.

No `npm install` needed. It uses only Node's built-in modules.

Keep this folder layout, or the server returns 404 (`index.html` must be inside `public/`):
```
notes-app/
├── server.js
├── package.json
└── public/index.html
```

## Run it locally
```bash
node server.js
```
Open http://localhost:3000. Watch the terminal: every request is logged. Write a note and a file appears in `notes/`.

Try a different port: `PORT=8080 node server.js` (Windows PowerShell: `$env:PORT=8080; node server.js`).

## Concepts to explore
- **Port**: the server listens on 3000. `localhost:3000` = this computer, door 3000.
- **0.0.0.0**: listen on every network interface. With `127.0.0.1` only your own machine could connect, which is why it matters on EC2.
- **Frontend vs backend**: `public/index.html` runs in the browser; `server.js` runs on the server. They talk through `/api/...` requests (see the green log at the bottom of the page and your terminal).
- **REST verbs**: GET reads, PUT saves, DELETE removes.

## Server setup commands (fresh Ubuntu EC2)
Run these after you SSH in. They are written for Ubuntu 22.04 / 24.04.

### 1. Update and upgrade the system
```bash
sudo apt update          # refresh the list of available packages
sudo apt upgrade -y      # install newer versions of what is already installed
```

### 2. Install Node.js (22.x LTS) and npm
```bash
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v && npm -v        # confirm both installed
```

### 3. Install the MySQL/MariaDB command-line client
Newer Debian and Ubuntu releases no longer ship a package called `mysql-client`. The drop-in replacement is the MariaDB client, which provides the same `mysql` command and connects to MySQL and RDS databases. It installs only the client, not a database server.
```bash
sudo apt install -y mariadb-client-compat
mysql --version
# connect to a remote database:
# mysql -h <DB_HOST> -u <USER> -p
```
#### Connect to a database (for example AWS RDS)
Replace `your-endpoint` with your database endpoint and `your-username` with your database username:
```bash
mysql -h your-endpoint \
  -P 3306 \
  -u your-username \
  -p \
  --ssl=0
```
Example endpoint format: `mydb.abc123xyz.us-east-1.rds.amazonaws.com`. You can find it in the RDS console under your database's **Connectivity & security** tab. The `-p` flag prompts for the password, so it never appears in your shell history.

- `-h` is the host, `-P` is the port (3306 is the MySQL default), `-u` is the user.
- `--ssl=0` turns off encryption for the connection. This is fine for a classroom demo, but leave it off the command in production. With the original Oracle MySQL client the equivalent flag is `--ssl-mode=DISABLED`.
- If it hangs or times out, the RDS security group is probably missing an inbound rule: allow **MySQL/Aurora (port 3306)** from the EC2 instance's security group.

If `mariadb-client-compat` is not found, use `sudo apt install -y mariadb-client` and run it as `mariadb` instead of `mysql`.

### 4. Install, enable and start Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx     # start automatically on every boot
sudo systemctl start nginx      # start it right now
sudo systemctl status nginx     # should say "active (running)"; press q to exit
```
Open port **80** in the EC2 security group, then visit `http://<EC2_PUBLIC_IP>` to see the Nginx welcome page.

Useful Nginx commands:
```bash
sudo nginx -t                   # test the config for mistakes
sudo systemctl reload nginx     # apply config changes without downtime
sudo systemctl restart nginx
sudo tail -f /var/log/nginx/access.log    # watch requests arrive
```

### 5. (Optional) Put Nginx in front of the notes app
Nginx listens on port 80 and forwards requests to Node on port 3000. This is called a reverse proxy.
```bash
sudo tee /etc/nginx/sites-available/notes > /dev/null <<'CONF'
server {
    listen 80;
    server_name _;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
CONF
sudo ln -sf /etc/nginx/sites-available/notes /etc/nginx/sites-enabled/notes
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```
Now `http://<EC2_PUBLIC_IP>` (no `:3000`) shows the notes app. You can close port 3000 in the security group and set `HOST` to `127.0.0.1` in `server.js`, so only Nginx can reach Node.

### 6. Quick HTTPS on a bare IP (self-signed certificate)
The fastest way to get HTTPS working with no domain name. Browsers show a one-time "Not secure" warning because no trusted authority signed the certificate, but the encryption is real.

First, open **port 443** in the EC2 security group (Custom TCP 443 from 0.0.0.0/0). Then:
```bash
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/ssl/private/selfsigned.key \
  -out /etc/ssl/certs/selfsigned.crt \
  -subj "/CN=localhost"

sudo tee /etc/nginx/sites-available/default > /dev/null <<'CONF'
server {
    listen 80 default_server;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl default_server;
    ssl_certificate     /etc/ssl/certs/selfsigned.crt;
    ssl_certificate_key /etc/ssl/private/selfsigned.key;
    root /var/www/html;
    index index.html index.nginx-debian.html;
    location / { try_files $uri $uri/ =404; }
}
CONF

sudo nginx -t && sudo systemctl reload nginx
```
Visit `https://<EC2_PUBLIC_IP>`, click **Advanced, then Proceed**, and you will see the Nginx welcome page over HTTPS. Plain `http://` requests redirect to HTTPS automatically.

To serve the notes app over HTTPS instead, replace the `root`, `index` and `location` lines with:
```nginx
location / { proxy_pass http://127.0.0.1:3000; }
```
(If you did step 5, remove its `sites-enabled/notes` link first so the two configs do not conflict: `sudo rm -f /etc/nginx/sites-enabled/notes`.)

Notes:
- The certificate is valid for 365 days; rerun the `openssl` command to renew it.
- A browser-trusted certificate with no warning needs a domain name plus Let's Encrypt: `sudo apt install -y certbot python3-certbot-nginx` then `sudo certbot --nginx -d yourdomain.com`. This cannot be done for a bare IP address.

### 7. HTTPS for the Node app on port 3000
Two ways. Pick one.

**Option A: Node serves HTTPS itself on port 3000** (`https://<EC2_PUBLIC_IP>:3000`). The app already supports this: if the `SSL_KEY` and `SSL_CERT` environment variables are set, `server.js` serves HTTPS instead of HTTP on the same port.
```bash
cd ~/notes-app
mkdir -p certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout certs/key.pem -out certs/cert.pem -subj "/CN=localhost"

SSL_KEY=certs/key.pem SSL_CERT=certs/cert.pem node server.js
```
The startup banner will show `https://localhost:3000`. Port 3000 must be open in the security group. Visit `https://<EC2_PUBLIC_IP>:3000` and click **Advanced, then Proceed** on the warning. Plain `http://` no longer works on that port, because one port speaks one protocol.

With pm2:
```bash
SSL_KEY=certs/key.pem SSL_CERT=certs/cert.pem pm2 start server.js --name notes
```

**Option B: Nginx handles HTTPS on 443, Node stays plain HTTP on 3000** (the usual real-world setup). Follow step 6 and use `location / { proxy_pass http://127.0.0.1:3000; }`. Visit `https://<EC2_PUBLIC_IP>`.

| | Option A | Option B |
|---|---|---|
| URL | `https://IP:3000` | `https://IP` |
| Security group port | 3000 | 443 (and 80) |
| Nginx needed | No | Yes |
| Good for | Quick demo | Closer to production |

## Deploy on EC2 (Ubuntu)
1. Launch an EC2 instance (Ubuntu, t2/t3.micro). Create or download a key pair.
2. **Security group** inbound rules: SSH (22) from your IP, Custom TCP **3000** from 0.0.0.0/0. Without this rule the firewall blocks your port.
3. Copy the project:
   ```bash
   scp -i key.pem -r notes-app ubuntu@<EC2_PUBLIC_IP>:~
   ```
4. SSH in and install Node:
   ```bash
   ssh -i key.pem ubuntu@<EC2_PUBLIC_IP>
   sudo apt update && sudo apt install -y nodejs
   node -v     # should be 18 or higher; otherwise install via NodeSource
   ```
5. Start it: `cd notes-app && node server.js`
6. Open `http://<EC2_PUBLIC_IP>:3000` in your browser.

### Keep it running after you close SSH
```bash
sudo npm install -g pm2
pm2 start server.js --name notes
pm2 logs notes      # the same console logs
pm2 startup         # restart on reboot (run the command it prints)
```

### Use port 80 (no :3000 in the URL)
Open port 80 in the security group, then:
```bash
sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3000
```
Or put nginx in front as a reverse proxy.

## Exercises
1. Change the port and redeploy. What breaks until you update the security group?
2. Change `HOST` to `"127.0.0.1"` on EC2. Why can't you connect anymore?
3. Add a `GET /api/search?q=` route.
4. Stop the server and refresh the page. What do you see?
