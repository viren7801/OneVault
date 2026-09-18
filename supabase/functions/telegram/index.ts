
import { createClient } from "npm:@supabase/supabase-js@2";
import postgres from "npm:postgres@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-onevault-cron-secret, x-telegram-bot-api-secret-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SECRET_KEYS = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
const SUPABASE_SECRET_KEY = SECRET_KEYS.default || Object.values(SECRET_KEYS)[0] || "";
const SUPABASE_DB_URL = Deno.env.get("SUPABASE_DB_URL") || "";

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({}, corsHeaders, { "Content-Type": "application/json" }),
  });
}

function getAdminClient() {
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function vaultSecret(name, required = true) {
  if (!SUPABASE_DB_URL) {
    if (required) throw new Error("Supabase database configuration is missing.");
    return "";
  }

  const sql = postgres(SUPABASE_DB_URL, {
    prepare: false,
    max: 1,
    idle_timeout: 5,
    connect_timeout: 5,
  });

  try {
    const rows = await sql`
      select decrypted_secret
      from vault.decrypted_secrets
      where name = ${name}
      limit 1
    `;

    const value = rows[0] && rows[0].decrypted_secret ? rows[0].decrypted_secret : "";
    if (!value && required) {
      throw new Error("Telegram setup is missing " + name + ".");
    }
    return value;
  } finally {
    await sql.end({ timeout: 1 }).catch(() => {});
  }
}

async function telegramRequest(method, payload) {
  const token = await vaultSecret("onevault_telegram_bot_token");
  const response = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data.description || ("Telegram " + method + " failed."));
  }

  return data.result;
}

async function requireUser(req) {
  const auth = req.headers.get("Authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) throw new Response("Unauthorized", { status: 401 });

  const admin = getAdminClient();
  const result = await admin.auth.getUser(match[1]);
  if (result.error || !result.data.user) throw new Response("Unauthorized", { status: 401 });

  return { admin, user: result.data.user };
}

async function hash(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), function(byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function functionUrl() {
  return SUPABASE_URL + "/functions/v1/telegram";
}

function formatReminderTime(value) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function connectTelegram(admin, userId) {
  const botUsername = await vaultSecret("onevault_telegram_bot_username");
  const webhookSecret = await vaultSecret("onevault_telegram_webhook_secret");

  await telegramRequest("setWebhook", {
    url: functionUrl() + "?action=webhook",
    secret_token: webhookSecret,
    allowed_updates: ["message"],
  });

  const token = randomToken();
  const tokenHash = await hash(token);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const result = await admin.from("telegram_link_token").upsert(
    {
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      used_at: null,
    },
    { onConflict: "user_id" },
  );

  if (result.error) throw result.error;

  return {
    url: "https://t.me/" + botUsername + "?start=" + encodeURIComponent(token),
    expiresAt,
  };
}

async function status(admin, userId) {
  const result = await admin
    .from("telegram_connection")
    .select("username, first_name, connected_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) throw result.error;

  const data = result.data;
  return {
    connected: Boolean(data),
    username: data && data.username ? data.username : "",
    firstName: data && data.first_name ? data.first_name : "",
    connectedAt: data && data.connected_at ? data.connected_at : null,
  };
}

async function disconnect(admin, userId) {
  const connectionDelete = await admin
    .from("telegram_connection")
    .delete()
    .eq("user_id", userId);

  if (connectionDelete.error) throw connectionDelete.error;

  const remindersUpdate = await admin
    .from("reminders")
    .update({
      notify_telegram: false,
      telegram_sent_at: null,
      telegram_locked_at: null,
      telegram_attempts: 0,
      telegram_last_error: null,
    })
    .eq("user_id", userId);

  if (remindersUpdate.error) throw remindersUpdate.error;

  return { connected: false };
}

async function testTelegram(admin, userId) {
  const result = await admin
    .from("telegram_connection")
    .select("chat_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (result.error) throw result.error;
  if (!result.data || !result.data.chat_id) return json({ error: "Telegram is not connected." }, 409);

  await telegramRequest("sendMessage", {
    chat_id: result.data.chat_id,
    text: "✅ oneVault Telegram test\n\nYour Telegram connection is working.",
  });

  return { sent: true };
}

async function webhook(req) {
  const expected = await vaultSecret("onevault_telegram_webhook_secret");
  const received = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || received !== expected) return json({ error: "Invalid webhook secret." }, 401);

  const update = await req.json().catch(function() { return null; });
  const message = update && update.message;
  const text = message && typeof message.text === "string" ? message.text.trim() : "";
  const match = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);

  if (!match || !match[1] || !message || !message.chat || !message.chat.id) {
    return json({ ok: true });
  }

  const tokenHash = await hash(match[1].trim());
  const admin = getAdminClient();

  const linkResult = await admin
    .from("telegram_link_token")
    .select("user_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (linkResult.error) throw linkResult.error;

  const link = linkResult.data;
  const expired = !link || link.used_at || new Date(link.expires_at).getTime() <= Date.now();

  if (expired) {
    await telegramRequest("sendMessage", {
      chat_id: message.chat.id,
      text: "This oneVault connection link has expired. Start the Telegram connection again from oneVault.",
    });
    return json({ ok: true });
  }

  const connection = await admin.from("telegram_connection").upsert(
    {
      user_id: link.user_id,
      chat_id: String(message.chat.id),
      username: message.from && message.from.username ? message.from.username : null,
      first_name: message.from && message.from.first_name ? message.from.first_name : null,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (connection.error) throw connection.error;

  const tokenUpdate = await admin
    .from("telegram_link_token")
    .update({ used_at: new Date().toISOString() })
    .eq("user_id", link.user_id);

  if (tokenUpdate.error) throw tokenUpdate.error;

  await telegramRequest("sendMessage", {
    chat_id: message.chat.id,
    text: "✅ oneVault is now connected. Reminders you mark for Telegram will be sent to this chat.",
  });

  return json({ ok: true });
}

async function worker(req) {
  const expected = await vaultSecret("onevault_telegram_cron_secret");
  const received = req.headers.get("x-onevault-cron-secret");
  if (!expected || received !== expected) return json({ error: "Unauthorized worker." }, 401);

  const admin = getAdminClient();
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const due = await admin
    .from("reminders")
    .select("id, user_id, title, due_at, telegram_attempts")
    .eq("notify_telegram", true)
    .eq("completed", false)
    .lte("due_at", now)
    .is("telegram_sent_at", null)
    .or("telegram_locked_at.is.null,telegram_locked_at.lt." + cutoff)
    .order("due_at", { ascending: true })
    .limit(50);

  if (due.error) throw due.error;

  let sent = 0;
  let failed = 0;

  for (const row of due.data || []) {
    const claim = await admin
      .from("reminders")
      .update({
        telegram_locked_at: new Date().toISOString(),
        telegram_attempts: Number(row.telegram_attempts || 0) + 1,
        telegram_last_error: null,
      })
      .eq("id", row.id)
      .eq("notify_telegram", true)
      .eq("completed", false)
      .is("telegram_sent_at", null)
      .or("telegram_locked_at.is.null,telegram_locked_at.lt." + cutoff)
      .select("id, user_id, title, due_at")
      .maybeSingle();

    if (claim.error || !claim.data) continue;

    try {
      const connection = await admin
        .from("telegram_connection")
        .select("chat_id")
        .eq("user_id", claim.data.user_id)
        .maybeSingle();

      if (connection.error) throw connection.error;
      if (!connection.data || !connection.data.chat_id) throw new Error("Telegram is not connected.");

      await telegramRequest("sendMessage", {
        chat_id: connection.data.chat_id,
        text: "🔔 oneVault reminder\n\n" + claim.data.title + "\n" + formatReminderTime(claim.data.due_at),
      });

      const markSent = await admin
        .from("reminders")
        .update({
          telegram_sent_at: new Date().toISOString(),
          telegram_locked_at: null,
          telegram_last_error: null,
        })
        .eq("id", claim.data.id);

      if (markSent.error) throw markSent.error;
      sent += 1;
    } catch (sendError) {
      await admin
        .from("reminders")
        .update({
          telegram_locked_at: null,
          telegram_last_error: String((sendError && sendError.message) || sendError).slice(0, 1000),
        })
        .eq("id", claim.data.id);
      failed += 1;
    }
  }

  return json({ ok: true, checked: (due.data || []).length, sent, failed });
}

async function getAction(req) {
  const url = new URL(req.url);
  const queryAction = url.searchParams.get("action");
  if (queryAction) return queryAction;

  if (req.method !== "GET") {
    const body = await req.clone().json().catch(function() { return {}; });
    return body && typeof body.action === "string" ? body.action : "";
  }

  return "";
}

Deno.serve(async function(req) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const action = await getAction(req);

  try {
    if (action === "webhook") return await webhook(req);
    if (action === "worker") return await worker(req);

    const auth = await requireUser(req);
    if (action === "status") return json(await status(auth.admin, auth.user.id));
    if (action === "connect") return json(await connectTelegram(auth.admin, auth.user.id));
    if (action === "disconnect") return json(await disconnect(auth.admin, auth.user.id));
    if (action === "test") {
      const result = await testTelegram(auth.admin, auth.user.id);
      return result instanceof Response ? result : json(result);
    }

    return json({ error: "Unknown Telegram action." }, 404);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("oneVault Telegram error", error);
    return json({ error: error && error.message ? error.message : "Telegram integration failed." }, 500);
  }
});
