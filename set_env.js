const { execSync } = require('child_process');

const envs = {
  KITE_API_KEY: "8pu6ys3tdgxb99so",
  KITE_API_SECRET: "7rmia27pmuar22fewy94z86xgggjstj3",
  WEB_APP_ID: "ed67d675",
  NOTIF_ID_TRADE_ENTRY_ALERT: "960ce3c7a",
  NOTIF_ID_TRADE_EXIT_ALERT: "1068fca3bb",
  NOTIF_ID_DAILY_PL_SUMMARY: "28b422fc",
  NOTIF_ID_RISK_LIMIT_WARNING: "730e28a3d"
};

const cli = "C:\\Users\\Nani\\AppData\\Roaming\\npm\\node_modules\\vercel\\dist\\index.js";

for (const [key, value] of Object.entries(envs)) {
  console.log(`Adding ${key}...`);
  try {
    const output = execSync(`node "${cli}" env add ${key} production --value "${value}"`, { stdio: 'pipe' });
    console.log(output.toString());
  } catch (err) {
    console.error(`Error adding ${key}:`);
    if (err.stdout) console.error("stdout:", err.stdout.toString());
    if (err.stderr) console.error("stderr:", err.stderr.toString());
  }
}
