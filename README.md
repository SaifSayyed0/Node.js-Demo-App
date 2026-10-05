# Notes App: learn servers, ports and EC2

A tiny full-stack app. The browser (frontend) talks to a Node.js server (backend) which saves each note as a `.md` file in the `notes/` folder.

No `npm install` needed. It uses only Node's built-in modules.

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
