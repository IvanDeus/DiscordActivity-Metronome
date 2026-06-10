## DiscordActivity-Metronome
# Discord Activity: Simple Metronome

A simple metronome app that runs inside **Discord Voice Channels** as an embedded Activity, using a **Flask backend** and **SQLite** for storing user BPM preferences.

> Works only inside Discord as an Activity and requires HTTPS/WSS access.

---

## ✅ Features

- Runs natively inside Discord via the Embedded App SDK
- Authenticates Discord users securely via OAuth2
- Saves/loads BPM settings from SQLite
- Audio click metronome with easily adjustable tempo
- Works securely over HTTPS

---

## 📦 Requirements

### 💻 Local Development Tools

- Python 3.8+
- Flask
- requests
- SQLite
- Discord Developer account with an Application created

### ⚙️ Server Setup (for production)

- Linux (Ubuntu/RedHat or similar) server
- Nginx or Cloudflare Tunnel (cloudflared)
- Domain name with DNS configured and HTTPS

---

## 🛠️ Installation Instructions

### Step 1: Get the App

Clone the repository or download the source code.

### Step 2: Create Environment & Install Dependencies

Depending on your OS, install Python 3 and the required dependencies:
```bash
pip install flask requests sqlite3
```

You will also need `pm2` installed via Node.js:
```bash
npm install -g pm2
```

### Step 3: 🤖 Set Up Your Discord Application

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application.
2. Save your **Client ID** and **Client Secret**.
3. Under the **OAuth2** tab, add a redirect URI (the same as on the Activity URL mappings).
4. Navigate to the **URL Mapping** section (or Activities settings) and set your target base URL to the public HTTPS URL where your app is hosted.

### Step 4: Configure App Backend

Copy `app_cfg.example.py` to `app_cfg.py`:

```bash
cp app_cfg.example.py app_cfg.py
```

Edit `app_cfg.py` and add your actual data: `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET`.

### Step 5: Configure App Frontend

Open `static/js/main.js` and replace the placeholder client ID at the top of the file with your actual Discord Application's **Client ID**:
```javascript
const DISCORD_CLIENT_ID = 'YOUR_DISCORD_CLIENT_ID';
```

### Step 6: 🏃🏻‍♂️ Run Your Metronome App

To start the App in the background using **PM2**, run:

```bash
pm2 start app.py --name "discord-metronome" --interpreter python3
```

This step will also automatically initialize the SQLite database (`users_db.sqlite`) if it doesn't exist.
To view logs, run `pm2 logs discord-metronome`. To stop it, run `pm2 stop discord-metronome`.

### Step 7: Expose App Publicly

To test the app inside Discord, your application needs to be served over HTTPS. You can use Cloudflare Tunnels (recommended for quick testing):
```bash
cloudflared tunnel --url http://localhost:6543
```
Then paste the generated `https://` URL into the Discord Developer Portal URL mappings.

Alternatively, use Nginx for a production server:

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    ssl_certificate /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://localhost:6543;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### Step 8: 🎉 Enjoy!

Hop into a Discord Voice Channel, launch your Activity, and start the metronome!

2026 [ ivan deus ] 
