#!/usr/bin/env node
/**
 * Seed do ambiente LOCAL com um retrato dos dados de produção. Roda em `npm run db:seed`.
 *
 * Postgres (lido de produção só com SELECT, gravado em supabase/seed.sql e aplicado com `supabase db reset`):
 *   - usuários: mesmos ids e e-mails, mas todos com a senha de desenvolvimento (as senhas reais não são copiadas);
 *   - perfis, conta do Instagram, automações e publicações: como estão em produção;
 *   - token do Instagram: trocado por um token falso, criptografado com a chave local (o local não age no Instagram);
 *   - tokens do MCP (api_tokens): não são copiados.
 * Redis (lido de produção com token somente leitura, gravado no Redis local):
 *   - só as chaves das contas (a:{conta}:…): execuções, contadores do funil, estado dos comentários, pausa.
 *
 * supabase/seed.sql tem dados reais e fica fora do Git. Nada é escrito em produção.
 */
import { execFileSync, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);

const DEV_PASSWORD = "muchchat-dev";
const PROD_REF = "ktmmxvukdtgzjyhovqma";
const ORB_BIN = "/Applications/OrbStack.app/Contents/MacOS/xbin";
const dockerEnv = {
  ...process.env,
  PATH: `${existsSync(ORB_BIN) ? `${ORB_BIN}:` : ""}${process.env.PATH}`,
  DOCKER_HOST: process.env.DOCKER_HOST ?? `unix://${process.env.HOME}/.orbstack/run/docker.sock`,
};

function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}
const fail = (msg) => { console.error(`\n✗ ${msg}`); process.exit(1); };

const prod = readEnv(".env.local");
const seedEnv = readEnv(".env.seed");
const dev = readEnv(".env.development.local");

const prodDb = prod.POSTGRES_URL_NON_POOLING;
if (!prodDb || !prodDb.includes(PROD_REF)) fail("POSTGRES_URL_NON_POOLING de produção não encontrada no .env.local.");
if (!dev.TOKEN_ENCRYPTION_KEY || dev.MUCHCHAT_ENV !== "dev") fail("Rode `npm run dev:db` antes: ele cria o .env.development.local do ambiente local.");
if (!/127\.0\.0\.1|localhost/.test(dev.NEXT_PUBLIC_SUPABASE_URL ?? "")) fail("O .env.development.local não aponta para o Supabase local. Nada foi feito.");

/* ---------- Postgres: produção → seed.sql ---------- */

const q = (sql) => execFileSync("psql", [prodDb, "-At", "-v", "ON_ERROR_STOP=1", "-c", sql], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
const rows = (sql) => JSON.parse(q(`select coalesce(json_agg(t), '[]'::json) from (${sql}) t`));

console.log("Lendo o Postgres de produção (só leitura)…");
const users = rows("select id, email, raw_user_meta_data, created_at from auth.users order by created_at");
const profiles = rows("select * from public.profiles");
const accounts = rows("select * from public.instagram_accounts");
const automations = rows("select * from public.automations");
const posts = rows("select * from public.scheduled_posts");

// Token falso, no mesmo formato de lib/secret-box.ts, com a chave do ambiente local.
function seal(plain) {
  const key = Buffer.from(dev.TOKEN_ENCRYPTION_KEY, "base64");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}
for (const a of accounts) a.token_ciphertext = seal("token-falso-do-ambiente-local");

const lit = (v) => (v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`);
const json = (v) => `$seed$${JSON.stringify(v)}$seed$`;
const insert = (table, data) => (data.length ? `insert into ${table} select * from json_populate_recordset(null::${table}, ${json(data)});\n` : "");

let sql = `-- GERADO por scripts/seed-dev.mjs em ${new Date().toISOString()}. Contém dados reais de produção: não versionar.\n`;
sql += "-- Senha de todos os usuários no ambiente local: " + DEV_PASSWORD + "\n\n";
for (const u of users) {
  sql += `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)\n`
    + `values ('00000000-0000-0000-0000-000000000000', ${lit(u.id)}, 'authenticated', 'authenticated', ${lit(u.email)}, crypt(${lit(DEV_PASSWORD)}, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', ${lit(JSON.stringify(u.raw_user_meta_data ?? {}))}::jsonb, ${lit(u.created_at)}, now(), '', '', '', '');\n`;
  sql += `insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)\n`
    + `values (${lit(u.id)}, ${lit(u.id)}, ${lit(JSON.stringify({ sub: u.id, email: u.email, email_verified: true }))}::jsonb, 'email', now(), now(), now(), gen_random_uuid());\n`;
}
// O gatilho on_auth_user_created já criou os perfis; trocamos pelos de produção.
sql += "\ndelete from public.profiles;\n" + insert("public.profiles", profiles);
sql += insert("public.instagram_accounts", accounts) + insert("public.automations", automations) + insert("public.scheduled_posts", posts);
writeFileSync("supabase/seed.sql", sql);
console.log(`  ${users.length} usuário(s), ${accounts.length} conta(s), ${automations.length} automação(ões), ${posts.length} publicação(ões) → supabase/seed.sql`);

console.log("Recriando o banco local (migrações + seed)…");
const reset = spawnSync("npx", ["supabase", "db", "reset"], { stdio: "inherit", env: dockerEnv });
if (reset.status !== 0) fail("`supabase db reset` falhou. O Supabase local está no ar? Rode `npm run dev:db`.");

/* ---------- Redis: produção → local ---------- */

const PROD_URL = seedEnv.PROD_KV_REST_API_URL, PROD_TOKEN = seedEnv.PROD_KV_REST_API_READ_ONLY_TOKEN;
const LOCAL_URL = dev.KV_REST_API_URL, LOCAL_TOKEN = dev.KV_REST_API_TOKEN;
if (!/127\.0\.0\.1|localhost/.test(LOCAL_URL ?? "")) fail("KV_REST_API_URL do .env.development.local não é local. Nada foi gravado no Redis.");

async function redis(url, token, body, pipeline = false) {
  const res = await fetch(pipeline ? `${url}/pipeline` : url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json();
  const bad = pipeline ? out.find?.((r) => r.error) : out.error ? out : null;
  if (!res.ok || bad) throw new Error(`Redis ${url}: ${JSON.stringify(bad ?? out).slice(0, 300)}`);
  return pipeline ? out.map((r) => r.result) : out.result;
}

if (!PROD_URL || !PROD_TOKEN) {
  console.log("Sem .env.seed (credenciais de leitura do Redis de produção): o Redis local fica como está.");
} else {
  console.log("Lendo o Redis de produção (token somente leitura)…");
  const keys = [];
  let cursor = "0";
  do {
    const [next, batch] = await redis(PROD_URL, PROD_TOKEN, ["SCAN", cursor, "MATCH", "a:*", "COUNT", "500"]);
    keys.push(...batch);
    cursor = String(next);
  } while (cursor !== "0");

  const types = keys.length ? await redis(PROD_URL, PROD_TOKEN, keys.map((k) => ["TYPE", k]), true) : [];
  const READ = { string: (k) => ["GET", k], hash: (k) => ["HGETALL", k], list: (k) => ["LRANGE", k, "0", "-1"], set: (k) => ["SMEMBERS", k], zset: (k) => ["ZRANGE", k, "0", "-1", "WITHSCORES"] };
  const known = keys.map((k, i) => ({ key: k, type: types[i] })).filter((x) => READ[x.type]);
  const values = known.length ? await redis(PROD_URL, PROD_TOKEN, known.map((x) => READ[x.type](x.key)), true) : [];
  const ttls = known.length ? await redis(PROD_URL, PROD_TOKEN, known.map((x) => ["PTTL", x.key]), true) : [];

  const cmds = [["FLUSHDB"]];
  known.forEach(({ key, type }, i) => {
    const v = values[i];
    if (v === null || (Array.isArray(v) && !v.length)) return;
    if (type === "string") cmds.push(["SET", key, v]);
    if (type === "hash") cmds.push(["HSET", key, ...v]);
    if (type === "list") cmds.push(["RPUSH", key, ...v]);
    if (type === "set") cmds.push(["SADD", key, ...v]);
    if (type === "zset") { const pairs = []; for (let j = 0; j < v.length; j += 2) pairs.push(v[j + 1], v[j]); cmds.push(["ZADD", key, ...pairs]); }
    if (ttls[i] > 0) cmds.push(["PEXPIRE", key, String(ttls[i])]);
  });
  for (let i = 0; i < cmds.length; i += 200) await redis(LOCAL_URL, LOCAL_TOKEN, cmds.slice(i, i + 200), true);
  console.log(`  ${known.length} chave(s) de conta copiadas para o Redis local.`);
}

console.log(`\n✓ Ambiente local pronto. Entre em http://localhost:3000/entrar com um destes e-mails e a senha "${DEV_PASSWORD}":`);
for (const u of users) console.log(`  - ${u.email}`);
