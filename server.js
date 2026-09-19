require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const MONGO_URI = process.env.MONGO_URI ||
  "mongodb+srv://sasiyamd3_db_user:gJLM5AVLnE8qoa20@cluster0.q0olms4.mongodb.net/?retryWrites=true&w=majority";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let BotModel = null;
let activeCollection = null;
let activeDatabase = null;

// ========== IGNORE LISTS ==========
const IGNORE_DBS = ["admin", "local", "config", "sample_mflix", "test"];
const BOT_KEYWORDS = ["bot", "minibot", "telemetry", "telemetries", "device", "activity", "activities"];

// ========== SCORE FUNCTION ==========
// Collection එකක් bot data ද කියලා score කරනවා
function scoreCollection(dbName, colName, docCount) {
  if (docCount === 0) return -1;

  const name = colName.toLowerCase();
  const db = dbName.toLowerCase();
  let score = 0;

  // Bot keywords තියෙනවා නම් +100
  for (const kw of BOT_KEYWORDS) {
    if (name.includes(kw)) {
      score += 100;
      break;
    }
  }

  // Database name එකේ "bot" තියෙනවා නම් +50
  if (db.includes("bot")) score += 50;

  // "sample", "demo" වගේ නම් -1000 (ignore)
  if (name.includes("sample") || name.includes("demo")) score -= 1000;

  // Document count එකෙන් +log (හුඟක් තියෙන එකට ටිකක් වැඩිපුර)
  score += Math.log10(docCount + 1) * 5;

  return score;
}

// ========== AUTO CONNECT + DETECT ==========
async function connectDB() {
  await mongoose.connect(MONGO_URI);
  console.log("\n✅ MongoDB Connected\n");

  const admin = mongoose.connection.db.admin();
  const dbsInfo = await admin.listDatabases();

  console.log("📚 Databases:");
  for (const dbInfo of dbsInfo.databases) {
    if (IGNORE_DBS.includes(dbInfo.name)) continue;
    console.log(`   └─ ${dbInfo.name}`);
  }

  let bestMatch = null;

  for (const dbInfo of dbsInfo.databases) {
    if (IGNORE_DBS.includes(dbInfo.name)) continue;

    const db = mongoose.connection.client.db(dbInfo.name);
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      const docCount = await db.collection(col.name).estimatedDocumentCount();
      const score = scoreCollection(dbInfo.name, col.name, docCount);

      console.log(
        `   📂 ${dbInfo.name}.${col.name} → ${docCount} docs (score: ${score.toFixed(1)})`
      );

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = {
          db: dbInfo.name,
          collection: col.name,
          count: docCount,
          score,
        };
      }
    }
  }

  if (!bestMatch) {
    console.log("\n⚠️  Bot data collection එකක් හම්බුනේ නෑ\n");
    return;
  }

  activeDatabase = bestMatch.db;
  activeCollection = bestMatch.collection;
  console.log(`\n✅ Auto-detected: ${bestMatch.db}.${bestMatch.collection} (${bestMatch.count} docs)`);

  // ✅ හරි ක්‍රමය — mongoose.model() use කරන්න
  const schema = new mongoose.Schema(
    {},
    { strict: false, collection: bestMatch.collection }
  );

  // Model නම unique කරන්න (database + collection)
  const modelName = `Bot_${bestMatch.db}_${bestMatch.collection}`;
  BotModel = mongoose.model(modelName, schema, bestMatch.collection);

  // Data එක database එකෙන් fetch කරන්න mongoose.connection.useDb
  const dbConn = mongoose.connection.useDb(bestMatch.db, { useCache: true });

  // Collection එකට direct access
  BotModel = dbConn.model(modelName, schema, bestMatch.collection);

  const sample = await BotModel.findOne().lean();
  if (sample) {
    console.log("📋 Fields:", Object.keys(sample).join(", "));
    console.log("📄 Sample:", JSON.stringify(sample, null, 2).substring(0, 500));
  } else {
    console.log("⚠️  Collection එකේ documents නෑ");
  }
  console.log("\n🚀 Dashboard ready!\n");
}

// ========== HELPERS ==========
function findKey(keys, candidates) {
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase() === c.toLowerCase());
    if (found) return found;
  }
  for (const c of candidates) {
    const found = keys.find((k) => k.toLowerCase().includes(c.toLowerCase()));
    if (found) return found;
  }
  return null;
}

// ========== API ==========
app.get("/api/bots", async (req, res) => {
  try {
    if (!BotModel) {
      return res.json({
        success: false,
        error: "Bot collection හම්බුනේ නෑ",
        total: 0, online: 0, offline: 0, avgSpeed: 0, bots: [],
      });
    }

    const bots = await BotModel.find().limit(500).lean();
    if (!bots.length) {
      return res.json({
        success: true, total: 0, online: 0, offline: 0, avgSpeed: 0, bots: [],
      });
    }

    const keys = Object.keys(bots[0]);
    const speedKey = findKey(keys, ["speed", "velocity", "kmph", "kmh", "spd"]);
    const nameKey  = findKey(keys, ["name", "botname", "devicename", "title", "bot_id"]);
    const idKey    = findKey(keys, ["botid", "bot_id", "deviceid", "device_id", "id"]);
    const statKey  = findKey(keys, ["status", "state", "online", "isOnline"]);

    const normalized = bots.map((b, i) => {
      let status = "offline";
      if (statKey) {
        const v = b[statKey];
        if (typeof v === "boolean") status = v ? "online" : "offline";
        else if (typeof v === "string") status = v.toLowerCase();
        else if (typeof v === "number") status = v === 1 ? "online" : "offline";
      } else {
        status = "online"; // status field නැත්නම් default online
      }
      return {
        id: String(b[idKey] ?? b._id ?? `bot_${i + 1}`),
        name: b[nameKey] ?? `Minibot ${i + 1}`,
        speed: Number(b[speedKey]) || 0,
        status,
      };
    });

    const online = normalized.filter((b) => b.status === "online").length;
    const total = normalized.length;
    const avgSpeed = total
      ? +(normalized.reduce((s, b) => s + b.speed, 0) / total).toFixed(2)
      : 0;

    res.json({
      success: true,
      total, online, offline: total - online, avgSpeed,
      bots: normalized,
      collection: `${activeDatabase}.${activeCollection}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    collection: `${activeDatabase}.${activeCollection}`,
    time: new Date(),
  });
});

// ========== START ==========
connectDB()
  .then(() =>
    app.listen(PORT, "0.0.0.0", () =>
      console.log(`🌐 Open: http://localhost:${PORT}\n`)
    )
  )
  .catch((err) => console.error("❌ MongoDB Error:", err));
