import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cors from "cors";
import express from "express";
import multer from "multer";
import bcrypt from "bcryptjs";
import { XMLParser } from "fast-xml-parser";
import { connectDb, getDb, publicApplication, publicClass, publicTest, publicUser, publicNotice, publicPost, publicApplyField } from "./db.js";

const isServerless = Boolean(process.env.VERCEL);
const app = express();
const port = Number(process.env.PORT || 3000);
app.use(cors());
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use(async (_req, res, next) => {
  try {
    await connectDb();
    next();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "데이터베이스에 연결할 수 없습니다." });
  }
});

// Vercel's deployed filesystem is read-only except /tmp, and /tmp does not persist
// between invocations, so uploaded TEST files won't survive on that host — fine for
// local/traditional hosting, but production file attachments need real object storage
// (e.g. Vercel Blob or S3) if this ever runs on Vercel long-term.
const uploadsDir = isServerless ? path.join(os.tmpdir(), "uploads") : path.join(process.cwd(), "server", "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
app.use("/uploads", express.static(uploadsDir));
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString("hex")}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

const col = (name) => getDb().collection(name);
const isAdmin = (user) => (user?.role || "user") === "admin";
const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
const unwrap = (doc) => (doc?.id || doc?.email ? doc : doc?.value || null);
const bearer = (req) => (req.headers.authorization || "").replace(/^Bearer\s/, "");

function validPhone(phone) {
  return /^01[016789]\d{7,8}$/.test(String(phone || "").replace(/\D/g, ""));
}

function validPassword(password) {
  return String(password || "").length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

async function createSession(email) {
  const token = crypto.randomBytes(32).toString("hex");
  await col("sessions").insertOne({
    token,
    email,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  });
  return token;
}

async function userFromReq(req) {
  const token = bearer(req);
  if (!token) return null;
  const session = await col("sessions").findOne({ token });
  if (!session || session.expiresAt < new Date()) return null;
  return col("users").findOne({ email: session.email });
}

async function requireAdmin(req, res, next) {
  req.user = await userFromReq(req);
  if (!req.user) return res.status(401).json({ error: "로그인이 필요합니다." });
  if (!isAdmin(req.user)) return res.status(403).json({ error: "관리자만 이용할 수 있습니다." });
  next();
}

async function saveDoc(res, name, id, data, mapFn, missing) {
  if (id) {
    const updated = unwrap(await col(name).findOneAndUpdate({ id }, { $set: data }, { returnDocument: "after" }));
    if (!updated) return res.status(404).json({ error: missing });
    return res.json(mapFn(updated));
  }
  await col(name).insertOne(data);
  res.json(mapFn(data));
}

function classPayload(body, id) {
  return {
    id: id || String(body.id || makeId("class")),
    label: String(body.label || "CLASS").trim(),
    tone: ["live", "vod", "off"].includes(body.tone) ? body.tone : "live",
    status: String(body.status || "온라인 · 진행중").trim(),
    title: String(body.title || "").trim(),
    summary: String(body.summary || "").trim(),
  };
}

function testPayload(body, id) {
  return {
    id: id || String(body.id || makeId("test")),
    title: String(body.title || "").trim(),
    summary: String(body.summary || "").trim(),
    password: String(body.password || "").trim(),
    body: String(body.body || "").trim(),
    linkUrl: String(body.linkUrl || "").trim(),
    fileUrl: String(body.fileUrl || "").trim(),
    fileName: String(body.fileName || "").trim(),
  };
}

function noticePayload(body, id) {
  return {
    id: id || String(body.id || makeId("notice")),
    tag: String(body.tag || "공지").trim(),
    title: String(body.title || "").trim(),
    body: String(body.body || "").trim(),
    createdAt: body.createdAt || new Date(),
  };
}

function postPayload(body, id, existing) {
  return {
    id: id || String(body.id || makeId("post")),
    tag: String(body.tag || existing?.tag || "질문").trim(),
    name: String(body.name || existing?.name || "").trim(),
    title: String(body.title || "").trim(),
    body: String(body.body || "").trim(),
    createdAt: body.createdAt || existing?.createdAt || new Date(),
  };
}

function applyFieldPayload(body, id, existingOrder) {
  return {
    id: id || String(body.id || makeId("field")),
    label: String(body.label || "").trim(),
    type: ["text", "email", "tel", "textarea", "select"].includes(body.type) ? body.type : "text",
    required: Boolean(body.required),
    options: Array.isArray(body.options)
      ? body.options.map((opt) => String(opt).trim()).filter(Boolean)
      : String(body.options || "")
          .split(",")
          .map((opt) => opt.trim())
          .filter(Boolean),
    order: Number.isFinite(Number(body.order)) ? Number(body.order) : existingOrder ?? 0,
  };
}

function applyPayload(body, id, fields) {
  const status = ["pending", "confirmed", "counseling", "done"].includes(body.status) ? body.status : "pending";
  const values = {};
  for (const field of fields) values[field.id] = String(body[field.id] || "").trim();
  return {
    id: id || String(body.id || makeId("apply")),
    type: String(body.type || "").trim(),
    values,
    status,
    createdAt: body.createdAt || new Date(),
  };
}

const BLOG_IDS = ["smartjula", "qortmd1502"];
const blogReviewCache = { data: null, at: 0 };
const BLOG_CACHE_MS = 10 * 60 * 1000;

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstImage(html) {
  const match = String(html || "").match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : "";
}

function logNoFromLink(link) {
  return String(link || "").match(/\/(\d+)(?:\?|$)/)?.[1] || "";
}

function parseNaverListDate(value) {
  const m = String(value || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return "";
  const [, y, mo, d] = m;
  return new Date(`${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`).toISOString();
}

// Naver blog RSS only ever returns the ~50 most recent posts per blog, so it can't
// surface a blog's full archive. PostTitleListAsync is the (undocumented, but
// publicly used) JSON endpoint the blog's own post-list page paginates through —
// we use it to pull older post titles/links beyond what RSS exposes. It doesn't
// include a thumbnail/excerpt, so those posts fall back to a plain badge in the UI.
async function fetchOlderPostTitles(blogId, skipLogNos) {
  const older = [];
  for (let page = 1; page <= 10; page++) {
    try {
      const res = await fetch(
        `https://blog.naver.com/PostTitleListAsync.naver?blogId=${encodeURIComponent(blogId)}&currentPage=${page}&categoryNo=&parentCategoryNo=&countPerPage=30`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      const raw = await res.text();
      const data = JSON.parse(raw.replace(/\\'/g, "'"));
      const posts = data?.postList || [];
      if (!posts.length) break;
      for (const post of posts) {
        if (skipLogNos.has(post.logNo)) continue;
        skipLogNos.add(post.logNo);
        older.push({
          title: decodeURIComponent(String(post.title || "").replace(/\+/g, " ")),
          link: `https://blog.naver.com/${blogId}/${post.logNo}`,
          image: "",
          excerpt: "",
          pubDate: parseNaverListDate(post.addDate),
          blogId,
        });
      }
      if (posts.length < 30) break;
    } catch (error) {
      console.error(`블로그(${blogId}) 글 목록(${page}p)을 불러오지 못했습니다:`, error.message);
      break;
    }
  }
  return older;
}

async function fetchBlogReviews() {
  if (blogReviewCache.data && Date.now() - blogReviewCache.at < BLOG_CACHE_MS) {
    return blogReviewCache.data;
  }
  const parser = new XMLParser();
  const all = [];
  for (const blogId of BLOG_IDS) {
    const seenLogNos = new Set();
    try {
      const res = await fetch(`https://rss.blog.naver.com/${blogId}.xml`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      const xml = await res.text();
      const items = parser.parse(xml)?.rss?.channel?.item;
      const list = Array.isArray(items) ? items : items ? [items] : [];
      for (const item of list) {
        const logNo = logNoFromLink(item.link);
        if (logNo) seenLogNos.add(logNo);
        all.push({
          title: String(item.title || "").trim(),
          link: String(item.link || "").trim(),
          image: firstImage(item.description),
          excerpt: stripHtml(item.description).slice(0, 90),
          pubDate: item.pubDate || "",
          blogId,
        });
      }
    } catch (error) {
      console.error(`블로그(${blogId}) RSS를 불러오지 못했습니다:`, error.message);
    }
    all.push(...(await fetchOlderPostTitles(blogId, seenLogNos)));
  }
  all.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
  blogReviewCache.data = all.slice(0, 600);
  blogReviewCache.at = Date.now();
  return blogReviewCache.data;
}

app.get("/api/blog-reviews", async (_req, res) => {
  res.json(await fetchBlogReviews());
});

app.get("/api/classes", async (_req, res) => {
  res.json((await col("classes").find({}).toArray()).map(publicClass));
});

app.get("/api/tests", async (req, res) => {
  const admin = isAdmin(await userFromReq(req));
  res.json((await col("tests").find({}).toArray()).map((item) => publicTest(item, { includeSecret: admin })));
});

app.post("/api/tests/:id/unlock", async (req, res) => {
  const test = await col("tests").findOne({ id: req.params.id });
  if (!test || test.password !== String(req.body.password || "").trim()) {
    return res.status(403).json({ error: "비밀번호가 올바르지 않습니다." });
  }
  await col("tests").updateOne({ id: test.id }, { $inc: { unlockCount: 1 } });
  res.json({ id: test.id, body: test.body, linkUrl: test.linkUrl || "", fileUrl: test.fileUrl || "", fileName: test.fileName || "" });
});

app.post("/api/admin/tests/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "파일을 선택해 주세요." });
  res.json({ fileUrl: `/uploads/${req.file.filename}`, fileName: req.file.originalname });
});

app.get("/api/apply-fields", async (_req, res) => {
  res.json((await col("applyFields").find({}).sort({ order: 1 }).toArray()).map(publicApplyField));
});

app.get("/api/notices", async (_req, res) => {
  res.json((await col("notices").find({}).sort({ createdAt: -1 }).toArray()).map(publicNotice));
});

app.get("/api/posts", async (_req, res) => {
  res.json((await col("posts").find({}).sort({ createdAt: -1 }).toArray()).map(publicPost));
});

app.post("/api/posts", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const title = String(req.body.title || "").trim();
  const body = String(req.body.body || "").trim();
  const password = String(req.body.password || "");
  if (!name || !title || !body || password.length < 4) {
    return res.status(400).json({ error: "이름, 제목, 내용을 입력하고 4자 이상의 비밀번호를 설정해 주세요." });
  }
  const item = {
    id: makeId("post"),
    tag: String(req.body.tag || "질문").trim(),
    name,
    title,
    body,
    passwordHash: await bcrypt.hash(password, 10),
    createdAt: new Date(),
  };
  await col("posts").insertOne(item);
  res.json(publicPost(item));
});

async function canEditPost(req, current) {
  if (!current) return false;
  if (isAdmin(await userFromReq(req))) return true;
  if (!current.passwordHash) return false;
  return bcrypt.compare(String(req.body.password || ""), current.passwordHash);
}

app.put("/api/posts/:id", async (req, res) => {
  const current = await col("posts").findOne({ id: req.params.id });
  if (!current) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  if (!(await canEditPost(req, current))) return res.status(403).json({ error: "비밀번호가 올바르지 않습니다." });
  const item = postPayload(req.body, req.params.id, current);
  if (!item.title || !item.body) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
  await col("posts").updateOne({ id: req.params.id }, { $set: { tag: item.tag, name: item.name, title: item.title, body: item.body } });
  res.json(publicPost({ ...current, ...item }));
});

app.delete("/api/posts/:id", async (req, res) => {
  const current = await col("posts").findOne({ id: req.params.id });
  if (!current) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  if (!(await canEditPost(req, current))) return res.status(403).json({ error: "비밀번호가 올바르지 않습니다." });
  await col("posts").deleteOne({ id: req.params.id });
  res.json({ ok: true });
});

app.post("/api/auth/signup", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const password = String(req.body.password || "");
  if (!name || !email) return res.status(400).json({ error: "이름과 이메일을 입력해 주세요." });
  if (!validPassword(password)) return res.status(400).json({ error: "비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다." });
  if (!validPhone(phone)) return res.status(400).json({ error: "전화번호를 올바르게 입력해 주세요. 예: 010-1234-5678" });
  if (await col("users").findOne({ email })) return res.status(409).json({ error: "이미 가입된 이메일입니다. 로그인 해주세요." });
  const role = (await col("users").countDocuments()) === 0 ? "admin" : "user";
  await col("users").insertOne({ name, email, phone, passwordHash: await bcrypt.hash(password, 10), role, createdAt: new Date() });
  res.json({ token: await createSession(email), user: publicUser({ name, email, phone, role }) });
});

app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = await col("users").findOne({ email });
  if (!user || !(await bcrypt.compare(String(req.body.password || ""), user.passwordHash || ""))) {
    return res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다." });
  }
  res.json({ token: await createSession(email), user: publicUser(user) });
});

app.post("/api/auth/logout", async (req, res) => {
  const token = bearer(req);
  if (token) await col("sessions").deleteOne({ token });
  res.json({ ok: true });
});

app.post("/api/applications", async (req, res) => {
  const fields = await col("applyFields").find({}).sort({ order: 1 }).toArray();
  const item = applyPayload(req.body, null, fields);
  const missingRequired = fields.some((field) => field.required && !item.values[field.id]);
  if (missingRequired) {
    return res.status(400).json({ error: "필수 항목을 모두 입력해 주세요." });
  }
  await col("applications").insertOne(item);
  res.json(publicApplication(item));
});

app.get("/api/admin/applications", requireAdmin, async (_req, res) => {
  const list = await col("applications").find({}).sort({ createdAt: -1 }).toArray();
  res.json(list.map(publicApplication));
});

app.post("/api/admin/applications", requireAdmin, async (req, res) => {
  const fields = await col("applyFields").find({}).sort({ order: 1 }).toArray();
  const item = { ...applyPayload(req.body, null, fields), note: String(req.body.note || "").trim() };
  if (!item.type) return res.status(400).json({ error: "신청 교육을 선택해 주세요." });
  await saveDoc(res, "applications", null, item, publicApplication);
});

app.put("/api/admin/applications/:id", requireAdmin, async (req, res) => {
  const current = await col("applications").findOne({ id: req.params.id });
  const fields = await col("applyFields").find({}).sort({ order: 1 }).toArray();
  const item = { ...applyPayload({ ...req.body, createdAt: current?.createdAt }, req.params.id, fields), note: String(req.body.note || "").trim() };
  if (!item.type) return res.status(400).json({ error: "신청 교육을 선택해 주세요." });
  await saveDoc(res, "applications", req.params.id, item, publicApplication, "신청 내역을 찾을 수 없습니다.");
});

app.delete("/api/admin/applications/:id", requireAdmin, async (req, res) => {
  if (!(await col("applications").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "신청 내역을 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.get("/api/admin/users", requireAdmin, async (_req, res) => {
  res.json((await col("users").find({}).project({ passwordHash: 0 }).toArray()).map(publicUser));
});

app.patch("/api/admin/users/:email/role", requireAdmin, async (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase();
  const role = req.body.role === "admin" ? "admin" : "user";
  if (role !== "admin" && (await col("users").countDocuments({ role: "admin", email: { $ne: email } })) === 0) {
    return res.status(400).json({ error: "마지막 관리자 권한은 해제할 수 없습니다." });
  }
  const updated = unwrap(await col("users").findOneAndUpdate({ email }, { $set: { role } }, { returnDocument: "after" }));
  if (!updated) return res.status(404).json({ error: "회원을 찾을 수 없습니다." });
  res.json({ user: publicUser(updated) });
});

app.post("/api/admin/classes", requireAdmin, async (req, res) => {
  const item = classPayload(req.body);
  if (!item.title) return res.status(400).json({ error: "교육 제목을 입력해 주세요." });
  await saveDoc(res, "classes", null, item, publicClass);
});

app.put("/api/admin/classes/:id", requireAdmin, async (req, res) => {
  const item = classPayload(req.body, req.params.id);
  if (!item.title) return res.status(400).json({ error: "교육 제목을 입력해 주세요." });
  await saveDoc(res, "classes", req.params.id, item, publicClass, "교육을 찾을 수 없습니다.");
});

app.delete("/api/admin/classes/:id", requireAdmin, async (req, res) => {
  if (!(await col("classes").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "교육을 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.post("/api/admin/tests", requireAdmin, async (req, res) => {
  const item = testPayload(req.body);
  if (!item.title || !item.password) return res.status(400).json({ error: "제목과 비밀번호를 입력해 주세요." });
  await saveDoc(res, "tests", null, item, (doc) => publicTest(doc, { includeSecret: true }));
});

app.put("/api/admin/tests/:id", requireAdmin, async (req, res) => {
  const item = testPayload(req.body, req.params.id);
  if (!item.title || !item.password) return res.status(400).json({ error: "제목과 비밀번호를 입력해 주세요." });
  await saveDoc(res, "tests", req.params.id, item, (doc) => publicTest(doc, { includeSecret: true }), "TEST를 찾을 수 없습니다.");
});

app.delete("/api/admin/tests/:id", requireAdmin, async (req, res) => {
  if (!(await col("tests").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "TEST를 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.post("/api/admin/notices", requireAdmin, async (req, res) => {
  const item = noticePayload(req.body);
  if (!item.title || !item.body) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
  await saveDoc(res, "notices", null, item, publicNotice);
});

app.put("/api/admin/notices/:id", requireAdmin, async (req, res) => {
  const current = await col("notices").findOne({ id: req.params.id });
  const item = noticePayload({ ...req.body, createdAt: current?.createdAt }, req.params.id);
  if (!item.title || !item.body) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
  await saveDoc(res, "notices", req.params.id, item, publicNotice, "공지사항을 찾을 수 없습니다.");
});

app.delete("/api/admin/notices/:id", requireAdmin, async (req, res) => {
  if (!(await col("notices").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "공지사항을 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.post("/api/admin/posts", requireAdmin, async (req, res) => {
  const item = postPayload(req.body);
  if (!item.title || !item.body) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
  await saveDoc(res, "posts", null, item, publicPost);
});

app.put("/api/admin/posts/:id", requireAdmin, async (req, res) => {
  const current = await col("posts").findOne({ id: req.params.id });
  const item = postPayload(req.body, req.params.id, current);
  if (!item.title || !item.body) return res.status(400).json({ error: "제목과 내용을 입력해 주세요." });
  await saveDoc(res, "posts", req.params.id, item, publicPost, "게시글을 찾을 수 없습니다.");
});

app.delete("/api/admin/posts/:id", requireAdmin, async (req, res) => {
  if (!(await col("posts").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.post("/api/admin/apply-fields", requireAdmin, async (req, res) => {
  const count = await col("applyFields").countDocuments();
  const item = applyFieldPayload(req.body, null, count);
  if (!item.label) return res.status(400).json({ error: "항목 이름을 입력해 주세요." });
  await saveDoc(res, "applyFields", null, item, publicApplyField);
});

app.put("/api/admin/apply-fields/:id", requireAdmin, async (req, res) => {
  const current = await col("applyFields").findOne({ id: req.params.id });
  const item = applyFieldPayload(req.body, req.params.id, current?.order);
  if (!item.label) return res.status(400).json({ error: "항목 이름을 입력해 주세요." });
  await saveDoc(res, "applyFields", req.params.id, item, publicApplyField, "입력 항목을 찾을 수 없습니다.");
});

app.delete("/api/admin/apply-fields/:id", requireAdmin, async (req, res) => {
  if (!(await col("applyFields").deleteOne({ id: req.params.id })).deletedCount) {
    return res.status(404).json({ error: "입력 항목을 찾을 수 없습니다." });
  }
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

if (!isServerless) {
  try {
    await connectDb();
    app.listen(port, () => console.log(`Oncodelab API http://127.0.0.1:${port}`));
  } catch (error) {
    console.error("서버를 시작하지 못했습니다.");
    console.error(error.message);
    process.exit(1);
  }
}

export default app;
