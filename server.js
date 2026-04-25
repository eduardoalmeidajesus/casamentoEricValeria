const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const IMAGE_CACHE_PATH = path.join(DATA_DIR, "amazon-image-cache.json");
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.ADMIN_USER || "noivos";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "12092026";
const DATABASE_URL = process.env.DATABASE_URL || "";

let pgPool = null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();

async function main() {
  await ensureDb();

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      sendJson(res, 500, { message: "Erro interno do servidor." });
    });
  });

  server.listen(PORT, () => {
    console.log(`Casamento Eric & Valeria rodando em http://localhost:${PORT}`);
    console.log(`Painel dos noivos: http://localhost:${PORT}/admin`);
    console.log(`Login admin padrao: ${ADMIN_USER} / ${ADMIN_PASSWORD}`);
  });
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/gifts" && req.method === "GET") {
    const db = await readDb();
    sendJson(res, 200, { gifts: publicGifts(db.gifts) });
    return;
  }

  if (url.pathname === "/api/rsvps" && req.method === "POST") {
    const payload = await readBody(req);
    const result = await createRsvp(payload);
    sendJson(res, result.status, result.body);
    return;
  }

  const imageMatch = url.pathname.match(/^\/api\/gift-image\/([^/]+)$/);
  if (imageMatch && req.method === "GET") {
    const db = await readDb();
    const gift = db.gifts.find((item) => item.id === decodeURIComponent(imageMatch[1]));
    if (!gift) {
      sendJson(res, 404, { message: "Imagem nao encontrada." });
      return;
    }
    await sendAmazonImage(res, gift);
    return;
  }

  const purchaseMatch = url.pathname.match(/^\/api\/gifts\/([^/]+)\/purchase$/);
  if (purchaseMatch && req.method === "POST") {
    const giftId = decodeURIComponent(purchaseMatch[1]);
    const payload = await readBody(req);
    const result = await purchaseGift(giftId, payload);
    sendJson(res, result.status, result.body);
    return;
  }

  if (url.pathname === "/api/admin/gifts" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const db = await readDb();
    sendJson(res, 200, { gifts: db.gifts });
    return;
  }

  if (url.pathname === "/api/admin/rsvps" && req.method === "GET") {
    if (!requireAdmin(req, res)) return;
    const db = await readDb();
    sendJson(res, 200, { rsvps: adminRsvps(db.rsvps || []) });
    return;
  }

  const contributionMatch = url.pathname.match(/^\/api\/admin\/contributions\/([^/]+)$/);
  if (contributionMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const result = await deleteContribution(decodeURIComponent(contributionMatch[1]));
    sendJson(res, result.status, result.body);
    return;
  }

  const rsvpMatch = url.pathname.match(/^\/api\/admin\/rsvps\/([^/]+)$/);
  if (rsvpMatch && req.method === "DELETE") {
    if (!requireAdmin(req, res)) return;
    const result = await deleteRsvp(decodeURIComponent(rsvpMatch[1]));
    sendJson(res, result.status, result.body);
    return;
  }

  if (url.pathname === "/admin" || url.pathname === "/admin/") {
    if (!requireAdmin(req, res)) return;
    await sendFile(res, path.join(ROOT, "admin.html"));
    return;
  }

  if (url.pathname.startsWith("/data/")) {
    sendJson(res, 404, { message: "Arquivo nao encontrado." });
    return;
  }

  const filePath = routeToFile(url.pathname);
  await sendFile(res, filePath);
}

function routeToFile(pathname) {
  const clean = decodeURIComponent(pathname.split("?")[0]);
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const target = path.normalize(path.join(ROOT, relative));
  if (!target.startsWith(ROOT)) return path.join(ROOT, "index.html");
  return target;
}

async function sendFile(res, filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) throw new Error("not file");
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(await fs.readFile(filePath));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Arquivo nao encontrado.");
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(data));
}

function sendSvg(res, svg) {
  res.writeHead(200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "public, max-age=86400"
  });
  res.end(svg);
}

function sendBinary(res, status, contentType, buffer) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=86400"
  });
  res.end(Buffer.from(buffer));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

async function ensureDb() {
  if (usesPostgres()) {
    await ensurePostgresDb();
    return;
  }
  await ensureFileDb();
}

async function ensureFileDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
    const db = await readDb();
    const normalized = normalizeDb(db);
    if (normalized.changed) await writeDb({ gifts: normalized.gifts, rsvps: normalized.rsvps });
  } catch {
    const now = new Date().toISOString();
    const seed = require("./data/seed-gifts.json").map((gift, index) => normalizeGift({
      ...gift,
      createdAt: now,
      updatedAt: now,
      featuredOrder: index + 1
    }).gift);
    await writeDb({ gifts: seed, rsvps: [] });
  }
}

async function readDb() {
  if (usesPostgres()) return readPostgresDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  if (usesPostgres()) {
    await writePostgresDb(db);
    return;
  }
  const temp = `${DB_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(db, null, 2), "utf8");
  await fs.rename(temp, DB_PATH);
}

function usesPostgres() {
  return Boolean(DATABASE_URL);
}

function getPgPool() {
  if (pgPool) return pgPool;

  let Pool;
  try {
    ({ Pool } = require("pg"));
  } catch {
    throw new Error("A dependencia 'pg' nao esta instalada. Rode 'npm install' antes de usar DATABASE_URL.");
  }

  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false }
  });
  return pgPool;
}

async function ensurePostgresDb() {
  const pool = getPgPool();
  await pool.query(`
    create table if not exists gifts (
      id text primary key,
      name text not null,
      description text not null,
      price numeric(10, 2) not null,
      image text,
      category text not null,
      status text not null default 'available',
      featured_order integer not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );

    create table if not exists contributions (
      id text primary key,
      gift_id text not null references gifts(id) on delete cascade,
      giver_name text not null,
      giver_contact text not null,
      message text,
      confirmed_at timestamptz not null default now()
    );

    create table if not exists rsvps (
      id text primary key,
      name text not null,
      guest_count integer not null,
      message text,
      created_at timestamptz not null default now()
    );

    create index if not exists contributions_gift_id_idx on contributions(gift_id);
    create index if not exists rsvps_created_at_idx on rsvps(created_at desc);
  `);

  const existing = await pool.query("select count(*)::int as count from gifts");
  if (existing.rows[0].count > 0) return;

  await writePostgresDb(await loadSeedDb());
}

async function loadSeedDb() {
  const now = new Date().toISOString();
  try {
    const localDb = JSON.parse(await fs.readFile(DB_PATH, "utf8"));
    const normalized = normalizeDb(localDb);
    return { gifts: normalized.gifts, rsvps: normalized.rsvps };
  } catch {
    const seed = require("./data/seed-gifts.json").map((gift, index) => normalizeGift({
      ...gift,
      createdAt: now,
      updatedAt: now,
      featuredOrder: index + 1
    }, index).gift);
    return { gifts: seed, rsvps: [] };
  }
}

async function readPostgresDb() {
  const result = await getPgPool().query(`
    select
      g.id,
      g.name,
      g.description,
      g.price::float8 as price,
      g.image,
      g.category,
      g.status,
      g.featured_order as "featuredOrder",
      g.created_at as "createdAt",
      g.updated_at as "updatedAt",
      coalesce(
        json_agg(
          json_build_object(
            'id', c.id,
            'giverName', c.giver_name,
            'giverContact', c.giver_contact,
            'message', c.message,
            'confirmedAt', c.confirmed_at
          )
          order by c.confirmed_at desc
        ) filter (where c.id is not null),
        '[]'::json
      ) as contributions
    from gifts g
    left join contributions c on c.gift_id = g.id
    group by g.id
    order by g.featured_order asc, g.name asc
  `);

  const rsvpResult = await getPgPool().query(`
    select
      id,
      name,
      guest_count as "guestCount",
      message,
      created_at as "createdAt"
    from rsvps
    order by created_at desc
  `);

  return {
    gifts: result.rows.map((gift) => ({
      ...gift,
      image: gift.image,
      createdAt: toIso(gift.createdAt),
      updatedAt: toIso(gift.updatedAt),
      contributions: gift.contributions.map((contribution) => ({
        ...contribution,
        confirmedAt: toIso(contribution.confirmedAt)
      }))
    })),
    rsvps: rsvpResult.rows.map((rsvp) => ({
      ...rsvp,
      createdAt: toIso(rsvp.createdAt)
    }))
  };
}

async function writePostgresDb(db) {
  const client = await getPgPool().connect();
  try {
    await client.query("begin");
    await client.query("delete from contributions");
    await client.query("delete from rsvps");

    for (const gift of db.gifts || []) {
      await client.query(`
        insert into gifts (
          id, name, description, price, image, category, status, featured_order, created_at, updated_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz)
        on conflict (id) do update set
          name = excluded.name,
          description = excluded.description,
          price = excluded.price,
          image = excluded.image,
          category = excluded.category,
          status = excluded.status,
          featured_order = excluded.featured_order,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `, [
        gift.id,
        gift.name,
        gift.description,
        gift.price,
        gift.image || null,
        gift.category,
        gift.status || "available",
        gift.featuredOrder || 999,
        gift.createdAt || new Date().toISOString(),
        gift.updatedAt || new Date().toISOString()
      ]);

      for (const contribution of gift.contributions || []) {
        await client.query(`
          insert into contributions (
            id, gift_id, giver_name, giver_contact, message, confirmed_at
          ) values ($1, $2, $3, $4, $5, $6::timestamptz)
        `, [
          contribution.id,
          gift.id,
          contribution.giverName,
          contribution.giverContact,
          contribution.message || null,
          contribution.confirmedAt || new Date().toISOString()
        ]);
      }
    }

    for (const rsvp of db.rsvps || []) {
      await client.query(`
        insert into rsvps (
          id, name, guest_count, message, created_at
        ) values ($1, $2, $3, $4, $5::timestamptz)
      `, [
        rsvp.id,
        rsvp.name,
        rsvp.guestCount,
        rsvp.message || null,
        rsvp.createdAt || new Date().toISOString()
      ]);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

function toIso(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function enqueueWrite(fn) {
  writeQueue = writeQueue.then(fn, fn);
  return writeQueue;
}

function normalizeDb(db) {
  let changed = false;
  const gifts = (db.gifts || []).map((gift, index) => {
    const result = normalizeGift(gift, index);
    changed = changed || result.changed;
    return result.gift;
  });
  const rsvps = (db.rsvps || []).map((rsvp, index) => {
    const result = normalizeRsvp(rsvp, index);
    changed = changed || result.changed;
    return result.rsvp;
  });
  return { gifts, rsvps, changed };
}

function normalizeGift(input, index) {
  const gift = { ...input };
  let changed = false;

  if (!Array.isArray(gift.contributions)) {
    gift.contributions = [];
    changed = true;
  }

  if (gift.giverName || gift.giverContact || gift.confirmedAt) {
    gift.contributions.push({
      id: crypto.randomUUID(),
      giverName: gift.giverName || "Não informado",
      giverContact: gift.giverContact || "Não informado",
      message: gift.message || null,
      confirmedAt: gift.confirmedAt || gift.updatedAt || new Date().toISOString()
    });
    changed = true;
  }

  if (gift.status !== "available") {
    gift.status = "available";
    changed = true;
  }

  ["giverName", "giverContact", "message", "confirmedAt"].forEach((key) => {
    if (key in gift) {
      delete gift[key];
      changed = true;
    }
  });

  if (gift.image === undefined) {
    gift.image = null;
    changed = true;
  }

  if (!gift.createdAt) {
    gift.createdAt = new Date().toISOString();
    changed = true;
  }

  if (!gift.updatedAt) {
    gift.updatedAt = gift.createdAt;
    changed = true;
  }

  if (!gift.featuredOrder) {
    gift.featuredOrder = index + 1;
    changed = true;
  }

  return { gift, changed };
}

function normalizeRsvp(input) {
  const rsvp = { ...input };
  let changed = false;

  if (!rsvp.id) {
    rsvp.id = crypto.randomUUID();
    changed = true;
  }

  if (!rsvp.name) {
    rsvp.name = "Não informado";
    changed = true;
  }

  const guestCount = Number(rsvp.guestCount || 1);
  if (!Number.isFinite(guestCount) || guestCount < 1) {
    rsvp.guestCount = 1;
    changed = true;
  } else if (rsvp.guestCount !== guestCount) {
    rsvp.guestCount = guestCount;
    changed = true;
  }

  if (rsvp.message === undefined) {
    rsvp.message = null;
    changed = true;
  }

  if (!rsvp.createdAt) {
    rsvp.createdAt = new Date().toISOString();
    changed = true;
  }

  return { rsvp, changed };
}

async function purchaseGift(giftId, payload) {
  const giverName = String(payload.giverName || "").trim();
  const giverContact = String(payload.giverContact || "Não informado").trim();
  const message = String(payload.message || "").trim();

  if (!giverName) {
    return { status: 400, body: { message: "Informe seu nome para confirmar." } };
  }

  return enqueueWrite(async () => {
    const db = await readDb();
    const gift = db.gifts.find((item) => item.id === giftId);
    if (!gift) return { status: 404, body: { message: "Presente não encontrado." } };

    const now = new Date().toISOString();
    gift.contributions = Array.isArray(gift.contributions) ? gift.contributions : [];
    gift.contributions.push({
      id: crypto.randomUUID(),
      giverName,
      giverContact,
      message: message || null,
      confirmedAt: now
    });
    gift.status = "available";
    gift.updatedAt = now;
    await writeDb(db);
    return { status: 200, body: { gift: publicGift(gift) } };
  });
}

async function deleteContribution(contributionId) {
  return enqueueWrite(async () => {
    const db = await readDb();
    let found = false;
    for (const gift of db.gifts) {
      const before = Array.isArray(gift.contributions) ? gift.contributions.length : 0;
      gift.contributions = (gift.contributions || []).filter((item) => item.id !== contributionId);
      if (gift.contributions.length !== before) {
        gift.updatedAt = new Date().toISOString();
        found = true;
      }
    }
    if (!found) return { status: 404, body: { message: "Confirmação não encontrada." } };
    await writeDb(db);
    return { status: 200, body: { ok: true } };
  });
}

async function createRsvp(payload) {
  const name = String(payload.name || "").trim();
  const guestCount = Number(payload.guestCount || 1);
  const message = String(payload.message || "").trim();

  if (!name) {
    return { status: 400, body: { message: "Informe seu nome para confirmar a presença." } };
  }

  if (!Number.isFinite(guestCount) || guestCount < 1 || guestCount > 20) {
    return { status: 400, body: { message: "Informe uma quantidade válida de pessoas." } };
  }

  return enqueueWrite(async () => {
    const db = await readDb();
    db.rsvps = Array.isArray(db.rsvps) ? db.rsvps : [];

    const rsvp = normalizeRsvp({
      id: crypto.randomUUID(),
      name,
      guestCount: Math.round(guestCount),
      message: message || null,
      createdAt: new Date().toISOString()
    }).rsvp;

    db.rsvps.unshift(rsvp);
    await writeDb(db);
    return { status: 200, body: { rsvp: adminRsvp(rsvp) } };
  });
}

async function deleteRsvp(rsvpId) {
  return enqueueWrite(async () => {
    const db = await readDb();
    const before = Array.isArray(db.rsvps) ? db.rsvps.length : 0;
    db.rsvps = (db.rsvps || []).filter((item) => item.id !== rsvpId);
    if (db.rsvps.length === before) {
      return { status: 404, body: { message: "Presença não encontrada." } };
    }
    await writeDb(db);
    return { status: 200, body: { ok: true } };
  });
}

function publicGifts(gifts) {
  return gifts.map(publicGift);
}

function adminRsvps(rsvps) {
  return rsvps.map(adminRsvp);
}

function adminRsvp(rsvp) {
  return {
    id: rsvp.id,
    name: rsvp.name,
    guestCount: rsvp.guestCount,
    message: rsvp.message,
    createdAt: rsvp.createdAt
  };
}

function publicGift(gift) {
  return {
    id: gift.id,
    name: gift.name,
    description: gift.description,
    price: gift.price,
    image: gift.image || `/api/gift-image/${encodeURIComponent(gift.id)}?v=20260424-1`,
    category: gift.category,
    status: "available",
    contributionCount: Array.isArray(gift.contributions) ? gift.contributions.length : 0,
    featuredOrder: gift.featuredOrder
  };
}

async function sendAmazonImage(res, gift) {
  try {
    if (shouldUseIllustration(gift)) {
      sendSvg(res, renderGiftSvg(gift));
      return;
    }

    const imageUrl = await getAmazonImageUrl(gift);
    if (imageUrl) {
      const imageResponse = await fetch(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          "Referer": "https://www.amazon.com.br/"
        }
      });

      if (imageResponse.ok) {
        const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
        const bytes = await imageResponse.arrayBuffer();
        sendBinary(res, 200, contentType, bytes);
        return;
      }
    }
  } catch (error) {
    console.warn(`Falha ao buscar imagem Amazon para ${gift.id}:`, error.message);
  }

  sendSvg(res, renderGiftSvg(gift));
}

async function getAmazonImageUrl(gift) {
  const cache = await readImageCache();
  const cached = cache[gift.id];
  const maxAgeMs = 1000 * 60 * 60 * 24 * 14;

  if (cached && cached.url && Date.now() - new Date(cached.cachedAt).getTime() < maxAgeMs) {
    return cached.url;
  }

  const query = buildAmazonQuery(gift);
  const searchUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}`;
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.6"
    }
  });

  if (!response.ok) return cached && cached.url ? cached.url : null;
  const html = await response.text();
  const imageUrl = pickAmazonImage(html, gift);

  if (imageUrl) {
    cache[gift.id] = { url: imageUrl, query, cachedAt: new Date().toISOString() };
    await writeImageCache(cache);
    return imageUrl;
  }

  return cached && cached.url ? cached.url : null;
}

async function readImageCache() {
  try {
    return JSON.parse(await fs.readFile(IMAGE_CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

async function writeImageCache(cache) {
  const temp = `${IMAGE_CACHE_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temp, JSON.stringify(cache, null, 2), "utf8");
  await fs.rename(temp, IMAGE_CACHE_PATH);
}

function buildAmazonQuery(gift) {
  const override = amazonQueryOverrides()[gift.id];
  if (override) return override;

  const name = String(gift.name || "")
    .replace(/\b(Pix|para os noivos|dos noivos|da noiva|do noivo)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const categoryHints = {
    "Cozinha": "casa cozinha",
    "Mesa posta": "casa mesa posta",
    "Eletrodomésticos": "eletrodomestico",
    "Eletrônicos": "eletronico",
    "Móveis": "moveis casa",
    "Quarto": "quarto casal",
    "Banho": "banheiro",
    "Casa": "casa",
    "Decoração": "decoracao casa",
    "Lazer": "casa lazer"
  };
  const hint = categoryHints[gift.category] || "casa casamento";
  return `${name} ${hint}`.trim();
}

function pickAmazonImage(html, gift) {
  const blocks = html.match(/<div[^>]+data-component-type="s-search-result"[\s\S]*?(?=<div[^>]+data-component-type="s-search-result"|$)/g) || [];
  const candidates = [];

  for (const block of blocks.slice(0, 24)) {
    const imageMatch = block.match(/<img[^>]+class="[^"]*s-image[^"]*"[^>]+>/);
    if (!imageMatch) continue;

    const tag = imageMatch[0];
    const src = attr(tag, "src") || attr(tag, "data-src");
    const alt = attr(tag, "alt");
    const aria = attr(block, "aria-label");
    const text = stripHtml(`${alt || ""} ${aria || ""} ${block.match(/<h2[\s\S]*?<\/h2>/)?.[0] || ""}`);
    const url = cleanAmazonImageUrl(src);
    const score = scoreAmazonCandidate(text, gift);

    if (isValidAmazonImage(url) && score > 0) {
      candidates.push({ url, score, text });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] && candidates[0].score >= 3 ? candidates[0].url : null;
}

function cleanAmazonImageUrl(url) {
  return String(url || "")
    .replace(/\\u002F/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/\._AC_[^./]+_\./, "._AC_SL800_.")
    .replace(/\._[^./]+_\./, "._AC_SL800_.");
}

function isValidAmazonImage(url) {
  return Boolean(
    url &&
    url.includes("m.media-amazon.com/images/I/") &&
    !url.includes("/images/G/") &&
    !url.includes("transparent-pixel") &&
    !url.includes("grey-pixel") &&
    !url.includes("sprite")
  );
}

function scoreAmazonCandidate(text, gift) {
  const normalized = normalizeText(text);
  const keywords = keywordsForGift(gift);
  let score = 0;

  for (const keyword of keywords.required) {
    if (normalized.includes(keyword)) score += 3;
  }
  for (const keyword of keywords.optional) {
    if (normalized.includes(keyword)) score += 1;
  }
  for (const keyword of keywords.negative) {
    if (normalized.includes(keyword)) score -= 3;
  }
  return score;
}

function keywordsForGift(gift) {
  const text = normalizeText(`${gift.name} ${gift.category}`);
  const optional = normalizeText(gift.name).split(" ").filter((word) => word.length > 3);
  const negative = [
    "infantil",
    "brinquedo",
    "miniatura",
    "adesivo",
    "capa",
    "pelucia",
    "fantasia",
    "livro",
    "pato",
    "sanitario",
    "desinfetante",
    "limpador",
    "pastilha",
    "refil",
    "bloco",
    "repelente",
    "shampoo",
    "sabonete",
    "creme",
    "pet",
    "cachorro",
    "gato"
  ];
  const rules = [
    ["air fryer", ["air", "fryer"], ["fritadeira"]],
    ["televisao", ["tv"], ["smart", "televisao"]],
    ["smart tv", ["tv"], ["smart", "televisao"]],
    ["ps5", ["ps5"], ["playstation", "console"]],
    ["sofa", ["sofa"], ["sala"]],
    ["micro ondas", ["micro"], ["ondas"]],
    ["microondas", ["micro"], ["ondas"]],
    ["liquidificador", ["liquidificador"], ["jarra"]],
    ["cafeteira", ["cafeteira"], ["cafe"]],
    ["batedeira", ["batedeira"], ["planetaria"]],
    ["cooktop", ["cooktop"], ["fogao"]],
    ["forno", ["forno"], ["eletrico"]],
    ["panela", ["panela"], ["cozinha"]],
    ["frigideira", ["frigideira"], ["antiaderente"]],
    ["aspirador", ["aspirador"], ["po", "robo"]],
    ["robo aspirador", ["robo", "aspirador"], ["automatico"]],
    ["maquina de lavar", ["lava", "seca"], ["lavadora"]],
    ["lava e seca", ["lava", "seca"], ["lavadora"]],
    ["jogo de jantar", ["jogo", "jantar"], ["pratos"]],
    ["faqueiro", ["faqueiro"], ["talheres"]],
    ["talheres", ["talheres"], ["tramontina"]],
    ["copos", ["copos"], ["vidro"]],
    ["taças", ["tacas"], ["vinho", "cristal"]],
    ["tacas", ["tacas"], ["vinho", "cristal"]],
    ["xicaras", ["xicaras"], ["cafe"]],
    ["xícaras", ["xicaras"], ["cafe"]],
    ["toalha", ["toalha"], ["banho"]],
    ["tapete", ["tapete"], ["sala", "banheiro"]],
    ["cortinas", ["cortina"], ["janela"]],
    ["guarda roupa", ["guarda", "roupa"], ["casal"]],
    ["rack", ["rack"], ["tv"]],
    ["mesa de jantar", ["mesa", "jantar"], ["sala"]],
    ["mesa de centro", ["mesa", "centro"], ["sala"]],
    ["cadeira", ["cadeira"], ["escritorio"]],
    ["chaleira", ["chaleira"], ["eletrica"]],
    ["sanduicheira", ["sanduicheira"], ["grill"]],
    ["ferro", ["ferro"], ["passar"]],
    ["varal", ["varal"], ["roupa"]],
    ["lixeira", ["lixeira"], ["cozinha", "banheiro"]],
    ["cabides", ["cabide"], ["roupa"]],
    ["potes", ["potes"], ["hermeticos"]],
    ["travessas", ["travessa"], ["vidro"]],
    ["assadeiras", ["assadeira"], ["forma"]],
    ["churrasco", ["churrasco"], ["kit"]],
    ["balanca", ["balanca"], ["digital"]],
    ["balança", ["balanca"], ["digital"]],
    ["caixa de ferramentas", ["caixa", "ferramentas"], ["maleta"]],
    ["máquina de pão", ["panificadora"], ["pao"]],
    ["maquina de pao", ["panificadora"], ["pao"]]
  ];

  for (const [needle, required, extra] of rules) {
    if (text.includes(normalizeText(needle))) {
      return { required, optional: extra.concat(optional), negative };
    }
  }

  return { required: optional.slice(0, 2), optional, negative };
}

function shouldUseIllustration(gift) {
  const category = normalizeText(gift.category);
  const name = normalizeText(gift.name);
  return (
    category.includes("pix") ||
    category.includes("experiencias") ||
    category.includes("lua") ||
    name.includes("almoco") ||
    name.includes("buffet") ||
    name.includes("buque") ||
    name.includes("sal para") ||
    name.includes("deus tocou")
  );
}

function amazonQueryOverrides() {
  return {
    "kit-panos-prato": "kit panos de prato algodao cozinha",
    "kit-toalha-banho": "jogo toalha banho algodao",
    "tapete-banheiro": "tapete banheiro antiderrapante",
    "jogo-copos": "jogo copos vidro transparente",
    "porta-temperos": "porta temperos cozinha",
    "air-fryer": "air fryer 5 litros",
    "mesa-jantar": "mesa jantar 6 lugares",
    "faqueiro-completo": "faqueiro completo inox",
    "smart-tv-50": "smart tv 50 polegadas",
    "kit-edredom-lencois": "kit edredom lencol casal",
    "liquidificador": "liquidificador jarra vidro",
    "cafeteira": "cafeteira eletrica",
    "jogo-panelas-completo": "jogo panelas antiaderente",
    "aspirador-po": "aspirador de po",
    "lava-e-seca": "lava e seca 11kg",
    "cooktop": "cooktop 4 bocas",
    "rack-painel-tv": "rack painel tv sala",
    "sanduicheira": "sanduicheira grill",
    "ventilador": "ventilador mesa",
    "cortinas": "cortina sala blackout",
    "jogo-jantar-20": "aparelho jantar 20 pecas porcelana",
    "guarda-roupa-casal": "guarda roupa casal",
    "jogo-americano": "jogo americano 6 pecas",
    "kit-travessas": "jogo travessas vidro",
    "jogo-tacas": "jogo tacas vinho",
    "potes-hermeticos": "kit potes hermeticos",
    "utensilios-cozinha": "kit utensilios cozinha silicone",
    "ferro-passar": "ferro passar roupa vapor",
    "kit-assadeiras": "kit assadeiras antiaderente",
    "tabua-corte": "tabua corte madeira",
    "balanca-casal": "balanca digital banheiro",
    "caixa-ferramentas": "caixa ferramentas completa",
    "talheres-completo": "kit talheres inox",
    "micro-ondas": "micro ondas 20 litros",
    "kit-churrasco": "kit churrasco inox",
    "panela-pressao-eletrica": "panela pressao eletrica",
    "travesseiros": "travesseiro casal",
    "jarras-agua-suco": "jogo jarra agua suco vidro",
    "kit-mesa-posta": "kit mesa posta jogo americano",
    "jogo-xicaras-6": "jogo 6 xicaras cafe porcelana",
    "ps5-noivos": "console playstation 5",
    "escorredor-loucas": "escorredor loucas inox",
    "potes-guarda-mantimentos": "potes guarda mantimentos hermeticos",
    "lixeira-cozinha": "lixeira cozinha",
    "lixeira-banheiro": "lixeira banheiro",
    "kit-banheiro": "kit banheiro porta sabonete",
    "varal-roupa": "varal roupa",
    "kit-limpeza": "kit limpeza rodo vassoura balde",
    "petisqueira": "petisqueira vidro",
    "chaleira-eletrica": "chaleira eletrica inox",
    "mesa-centro": "mesa centro sala",
    "forno-eletrico": "forno eletrico bancada",
    "mesa-escritorio": "mesa escritorio",
    "jogo-sobremesa": "jogo sobremesa vidro",
    "sofa": "sofa 3 lugares sala",
    "cadeira-escritorio": "cadeira escritorio ergonomica",
    "tapete-sala": "tapete sala",
    "maquina-pao": "panificadora maquina de pao",
    "kit-cabides": "kit cabides",
    "robo-aspirador": "robo aspirador",
    "jogo-cama-casal": "jogo cama casal",
    "frigideiras-antiaderentes": "kit frigideiras antiaderentes",
    "raladores": "ralador cozinha inox",
    "kit-medidores": "kit medidores culinarios",
    "peneiras": "kit peneiras cozinha",
    "batedeira": "batedeira planetaria",
    "mop-limpeza": "mop limpeza",
    "potes-hermeticos-organizadores": "potes hermeticos organizadores",
    "cabeceira": "cabeceira casal",
    "jogo-xicaras": "jogo xicaras cafe porcelana",
    "talheres-tramontina": "jogo talheres tramontina",
    "porta-guardanapo": "porta guardanapo mesa",
    "streaming-6-meses": "gift card streaming"
  };
}

function attr(html, name) {
  const match = String(html || "").match(new RegExp(`${name}="([^"]*)"`, "i"));
  return match ? decodeHtml(match[1]) : "";
}

function stripHtml(value) {
  return decodeHtml(String(value || "").replace(/<[^>]*>/g, " "));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderGiftSvg(gift) {
  const title = escapeSvg(gift.name);
  const category = escapeSvg(gift.category);
  const icon = iconForGift(gift);
  const palette = paletteForGift(gift);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640" role="img" aria-label="${title}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="${palette[0]}"/>
      <stop offset="1" stop-color="${palette[1]}"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="22" stdDeviation="18" flood-color="#2b241b" flood-opacity=".18"/>
    </filter>
  </defs>
  <rect width="960" height="640" fill="url(#bg)"/>
  <circle cx="770" cy="95" r="170" fill="#fff8ef" opacity=".20"/>
  <circle cx="155" cy="560" r="220" fill="#2b3a2f" opacity=".12"/>
  <rect x="170" y="92" width="620" height="405" rx="26" fill="#fffaf4" opacity=".88" filter="url(#shadow)"/>
  <text x="480" y="265" text-anchor="middle" font-size="118" font-family="Segoe UI Emoji, Apple Color Emoji, sans-serif">${icon}</text>
  <text x="480" y="392" text-anchor="middle" fill="#2b241b" font-size="42" font-weight="700" font-family="Inter, Arial, sans-serif">${title}</text>
  <text x="480" y="440" text-anchor="middle" fill="#806f5d" font-size="24" font-weight="700" letter-spacing="4" font-family="Inter, Arial, sans-serif">${category.toUpperCase()}</text>
  <path d="M215 536 H745" stroke="#b98b4d" stroke-width="3" stroke-linecap="round" opacity=".55"/>
</svg>`;
}

function iconForGift(gift) {
  const text = `${gift.name} ${gift.category}`.toLowerCase();
  if (text.includes("air fryer")) return "🍟";
  if (text.includes("tv") || text.includes("televis")) return "📺";
  if (text.includes("ps5")) return "🎮";
  if (text.includes("sof")) return "🛋️";
  if (text.includes("cama") || text.includes("travesseiro") || text.includes("edredom") || text.includes("cabeceira")) return "🛏️";
  if (text.includes("toalha") || text.includes("banheiro")) return "🛁";
  if (text.includes("mesa") || text.includes("cadeira") || text.includes("rack") || text.includes("guarda-roupa")) return "🪑";
  if (text.includes("cafeteira") || text.includes("xícara") || text.includes("xicara")) return "☕";
  if (text.includes("panela") || text.includes("frigideira") || text.includes("cooktop") || text.includes("forno")) return "🍳";
  if (text.includes("liquidificador") || text.includes("batedeira")) return "🥤";
  if (text.includes("micro")) return "🍽️";
  if (text.includes("aspirador") || text.includes("mop") || text.includes("limpeza")) return "🧽";
  if (text.includes("jantar") || text.includes("travessa") || text.includes("taça") || text.includes("copos") || text.includes("talheres")) return "🍽️";
  if (text.includes("lua de mel")) return "✈️";
  if (text.includes("churrasco")) return "🔥";
  if (text.includes("pão")) return "🍞";
  if (text.includes("cortina") || text.includes("tapete")) return "🏡";
  if (text.includes("pix") || text.includes("buquê") || text.includes("buffet") || text.includes("coração")) return "💛";
  return "🎁";
}

function paletteForGift(gift) {
  const category = String(gift.category || "").toLowerCase();
  if (category.includes("cozinha") || category.includes("eletro")) return ["#e8dfd1", "#b9c1a8"];
  if (category.includes("mesa")) return ["#efe4d6", "#cba875"];
  if (category.includes("móveis") || category.includes("moveis")) return ["#ded4c4", "#8f9a80"];
  if (category.includes("quarto") || category.includes("banho")) return ["#f2e9df", "#c9b8aa"];
  if (category.includes("pix") || category.includes("lua") || category.includes("exper")) return ["#ead9b9", "#9fb09a"];
  return ["#efe7dc", "#b8a487"];
}

function escapeSvg(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function requireAdmin(req, res) {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [user, pass] = Buffer.from(encoded, "base64").toString("utf8").split(":");
    if (timingSafeEqual(user, ADMIN_USER) && timingSafeEqual(pass, ADMIN_PASSWORD)) return true;
  }
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Painel dos Noivos"',
    "Content-Type": "text/plain; charset=utf-8"
  });
  res.end("Autenticacao necessaria.");
  return false;
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
