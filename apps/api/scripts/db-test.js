const { Client } = require("pg");
(async () => {
  const url = process.env.DATABASE_URL;
  console.log("Connecting:", url);
  const client = new Client({ connectionString: url, ssl: false });
  await client.connect();
  const r = await client.query("select current_user, current_database()");
  console.log("OK:", r.rows[0]);
  await client.end();
})().catch(e => { console.error("FAILED:", e.message); process.exit(1); });
