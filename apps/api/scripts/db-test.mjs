import pg from "pg";
const { Client } = pg;

const url = process.env.DATABASE_URL;
console.log("Connecting:", url);

const client = new Client({ connectionString: url, ssl: false });
await client.connect();
const r = await client.query("select current_user, current_database()");
console.log("OK:", r.rows[0]);
await client.end();
