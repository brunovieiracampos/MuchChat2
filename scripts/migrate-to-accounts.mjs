// Migração única (fase 2 do multi-contas): leva a conta que existia antes das contas de usuário
// (chaves globais no Redis) para o dono informado.
//
//   node scripts/migrate-to-accounts.mjs <email-do-dono> [--apply] [--backup <arquivo.json>]
//   node scripts/migrate-to-accounts.mjs <email-do-dono> --cleanup
//
// Sem --apply só mostra o plano. Com --apply:
//   1. salva uma cópia de todas as chaves do Redis no arquivo de backup;
//   2. pausa as automações (a versão antiga do sistema para de gravar);
//   3. cria a conta do Instagram no Supabase (token criptografado) e copia as automações;
//   4. renomeia as chaves do Redis para o prefixo a:{accountId}: (o TTL é preservado).
// Depois disso, publique a versão nova e retome as automações pelo painel.
// Com --cleanup (depois de conferir a versão nova): apaga as chaves antigas, inclusive o token em texto aberto.
//
// O backup tem o token da Meta em texto aberto: por padrão vai para a pasta temporária do sistema, fora do repositório.
//
// Variáveis: KV_REST_API_URL/TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TOKEN_ENCRYPTION_KEY.
import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const [email, ...flags] = process.argv.slice(2);
const apply = flags.includes("--apply");
const cleanup = flags.includes("--cleanup");
const backupPath = flags.includes("--backup") ? flags[flags.indexOf("--backup") + 1] : path.join(os.tmpdir(), `backup-redis-${Date.now()}.json`);
if (!email) { console.error("Uso: node scripts/migrate-to-accounts.mjs <email-do-dono> [--apply] [--backup arquivo.json]"); process.exit(1); }

const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Mesmo formato de lib/secret-box.ts
function seal(plain) {
  const key = Buffer.from(process.env.TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY ausente ou inválida.");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

async function allKeys() {
  const out = [];
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, { count: 500 });
    cursor = String(next);
    out.push(...keys);
  } while (cursor !== "0");
  return out;
}

async function dump(key) {
  const type = await redis.type(key);
  const ttl = await redis.ttl(key);
  const value = type === "string" ? await redis.get(key)
    : type === "hash" ? await redis.hgetall(key)
    : type === "list" ? await redis.lrange(key, 0, -1)
    : null;
  return { key, type, ttl, value };
}

if (cleanup) {
  const { data: acc } = await db.from("instagram_accounts").select("id").eq("ig_user_id", String(await redis.get("ig:user"))).maybeSingle();
  if (!acc) throw new Error("A conta ainda não está no Supabase: rode a migração antes do cleanup.");
  const legacyLeft = (await allKeys()).filter((k) => !k.startsWith("a:") && !k.startsWith("rl:"));
  for (const k of legacyLeft) await redis.del(k);
  console.log(`Apagadas ${legacyLeft.length} chaves antigas: ${legacyLeft.join(", ") || "nenhuma"}.`);
  process.exit(0);
}

// 1. Estado atual
const keys = await allKeys();
const legacy = keys.filter((k) => !k.startsWith("a:") && !k.startsWith("rl:"));
const tokenRec = await redis.get("ig:token");
const igUserId = String((await redis.get("ig:user")) ?? process.env.IG_USER_ID ?? "");
const automations = (await redis.get("automations")) ?? [];
if (!tokenRec?.token || !igUserId) throw new Error("Não achei ig:token / ig:user no Redis: nada a migrar.");

const { data: users, error: uErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (uErr) throw uErr;
const owner = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!owner) throw new Error(`Usuário ${email} não encontrado no Supabase. Crie a conta em /cadastro antes.`);

const me = await fetch(`https://graph.instagram.com/me?fields=user_id,username,account_type&access_token=${encodeURIComponent(tokenRec.token)}`).then((r) => r.json());
if (me.error) throw new Error(`O token salvo não funciona: ${me.error.message}`);
if (String(me.user_id) !== igUserId) throw new Error(`ig:user (${igUserId}) difere do /me (${me.user_id}).`);

// "paused" não é renomeada: a versão antiga precisa continuar vendo a pausa até a nova ser publicada.
const toRename = legacy.filter((k) => !["automations", "ig:token", "ig:user", "paused"].includes(k) && !k.startsWith("lock:"));
console.log(`Dono: ${owner.email} (${owner.id})`);
console.log(`Conta: @${me.username} (${igUserId}), ${me.account_type}`);
console.log(`Automações para o Postgres: ${automations.map((a) => `${a.id}${a.active ? " (ativa)" : ""}`).join(", ") || "nenhuma"}`);
console.log(`Chaves para o prefixo da conta: ${toRename.length} (${[...new Set(toRename.map((k) => k.split(":")[0]))].join(", ")})`);
if (!apply) { console.log("\nNada foi alterado. Rode com --apply para migrar."); process.exit(0); }

// 2. Backup
const backup = await Promise.all(legacy.map(dump));
fs.writeFileSync(backupPath, JSON.stringify({ at: new Date().toISOString(), keys: backup }, null, 1), { mode: 0o600 });
console.log(`Backup: ${backup.length} chaves em ${backupPath}`);

// 3. Pausa a versão antiga (ela confere "paused" antes de gravar qualquer coisa)
const wasPaused = (await redis.get("paused")) === true;
await redis.set("paused", true);
console.log(`Automações pausadas${wasPaused ? " (já estavam)" : ""}.`);

// 4. Conta e automações no Supabase
const now = new Date().toISOString();
const { data: acc, error: aErr } = await db.from("instagram_accounts").upsert({
  owner_id: owner.id, ig_user_id: igUserId, username: me.username ?? "", account_type: me.account_type ?? null,
  token_ciphertext: seal(tokenRec.token), token_refreshed_at: new Date(tokenRec.refreshedAt ?? Date.now()).toISOString(), updated_at: now,
}, { onConflict: "ig_user_id" }).select("id").single();
if (aErr) throw aErr;
const prefix = `a:${acc.id}:`;
for (const a of automations) {
  const { error } = await db.from("automations").upsert({
    account_id: acc.id, id: a.id, name: a.name ?? "", active: a.active !== false, rule: a,
    created_at: new Date(a.createdAt ?? Date.now()).toISOString(), updated_at: new Date(a.updatedAt ?? Date.now()).toISOString(),
  });
  if (error) throw error;
}
console.log(`Conta ${acc.id} e ${automations.length} automação(ões) gravadas no Supabase.`);

// 5. Renomeia as chaves (RENAME preserva o TTL). A conta nova começa pausada; a pausa antiga continua ligada.
for (const k of toRename) await redis.rename(k, prefix + k);
await redis.set(prefix + "paused", true);
console.log(`${toRename.length} chaves renomeadas para ${prefix}*; a conta começa pausada.`);

// 6. Conferência
const after = await allKeys();
const missing = toRename.filter((k) => !after.includes(prefix + k));
const { count } = await db.from("automations").select("id", { count: "exact", head: true }).eq("account_id", acc.id);
console.log(missing.length ? `ATENÇÃO: ${missing.length} chaves não apareceram com o prefixo: ${missing.join(", ")}` : "Todas as chaves conferidas.");
console.log(`Automações no Supabase: ${count} de ${automations.length}.`);
console.log(`Log: ${await redis.llen(prefix + "log")} eventos em ${prefix}log.`);
console.log("\nPróximo passo: publicar a versão nova e retomar as automações pelo painel.");
console.log("As chaves antigas (ig:token em texto aberto, ig:user, automations, paused) ficaram no Redis: depois de conferir, rode com --cleanup.");
console.log(`Apague também o backup (${backupPath}) quando não precisar mais dele.`);
