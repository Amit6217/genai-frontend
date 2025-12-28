const fetch = require("node-fetch");

function keepAlive() {
  const url = process.env.BACKEND_URL;

  if (!url) {
    console.error("❌ BACKEND_URL is not defined in .env");
    return;
  }

  setInterval(async () => {
    try {
      const res = await fetch(`${url}/ping`);
      console.log("✅ made by Amit ", res.status);
    } catch (err) {
      console.error("❌ Ping failed:", err.message);
    }
  }, 10 * 60 * 1000); // every 10 minutes
}

module.exports = keepAlive;
