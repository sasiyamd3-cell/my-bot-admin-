# 🚤 Minibot Dashboard

MongoDB Atlas එකෙන් **read-only** විදියට minibot count සහ speed monitor කරන ලස්සන dashboard එකක්.

## ✨ Features

- 🤖 Total / Online / Offline bot count
- ⚡ Average speed
- 📊 Bar chart එකෙන් එක එක bot ගේ speed
- 🔄 Live refresh (5s)
- 🎨 Glassmorphism UI + gradient animations
- 📱 Mobile responsive
- 🔍 Auto-detect collection & field names

## 🚀 Quick Start

```bash
git clone <your-repo-url>
cd minibot-dashboard
npm install
npm start
```

Open: http://localhost:3000

## ⚙️ Environment (Optional)

`.env` file එකක් හදලා:

```
PORT=3000
MONGO_URI=your_mongodb_uri
```

## 📡 API

- `GET /api/bots` — bots data + stats
- `GET /api/health` — server status

## ⚠️ MongoDB Atlas Setup

**Network Access** → **Add IP Address** → **Allow from Anywhere** (`0.0.0.0/0`)

## 📝 License

MIT
