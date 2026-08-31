const API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://127.0.0.1:3000" : "";

(function showPageLoading() {
  const overlay = document.createElement("div");
  overlay.id = "page-loading";
  overlay.className = "page-loading";
  overlay.innerHTML = `<div class="page-loading-spinner"></div>`;
  document.body.appendChild(overlay);
  // Safety net: never let the overlay block the page for more than a few seconds,
  // even if something upstream hangs unexpectedly.
  setTimeout(() => overlay.remove(), 8000);
})();

function hidePageLoading() {
  const overlay = document.getElementById("page-loading");
  if (!overlay) return;
  overlay.classList.add("hide");
  setTimeout(() => overlay.remove(), 250);
}
let classCache = [];
let testCache = [];
let userCache = [];
let applyCache = [];
let noticeCache = [];
let postCache = [];
let applyFieldCache = [];
let myApplyAccess = {};
let adminTab = "overview";
let adminNav = "overview";
let editClassId = null;
let editTestId = null;
let editApplyId = null;
let viewApplyId = null;
let editNoticeId = null;
let editPostId = null;
let editFieldId = null;
let applyFilter = { search: "", status: "all" };
let communityTab = "info";
let editPostState = null;
let blogReviewCache = [];
let reviewSearch = "";
let reviewPage = 1;
const REVIEW_PAGE_SIZE = 20;

const courses = [
  { type: "live", tag: "라이브 LAB", title: "엔트리 코딩 기초 마스터", age: "초등 3~4학년", track: "A 스타터" },
  { type: "live", tag: "라이브 LAB", title: "파이썬 퀴즈 프로그램 만들기", age: "초등 5학년 이상", track: "A 스타터" },
  { type: "vod", tag: "VOD LAB", title: "프린터 활동지로 배우는 코딩 개념", age: "초등 저학년", track: "A 스타터" },
  { type: "off", tag: "오프라인 LAB", title: "마이크로비트 게임 메이커", age: "초등 3학년 이상", track: "B 크리에이터" },
  { type: "live", tag: "라이브 LAB", title: "피그마 UI 디자인 스타터", age: "초등 5학년 이상", track: "B 크리에이터" },
  { type: "vod", tag: "프로젝트", title: "AI 코딩 프로젝트", age: "초등 5학년 이상", track: "C 프로젝트" },
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function token() {
  return localStorage.getItem("oncodelab-token") || "";
}

function getSession() {
  return readJson(localStorage, "oncodelab-session", null);
}

function isAdmin(user = getSession()) {
  return (user?.role || "user") === "admin";
}

function saveAuth(result) {
  localStorage.setItem("oncodelab-token", result.token);
  localStorage.setItem("oncodelab-session", JSON.stringify(result.user));
}

function clearAuth() {
  localStorage.removeItem("oncodelab-token");
  localStorage.removeItem("oncodelab-session");
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  if (token()) headers.Authorization = `Bearer ${token()}`;
  let res;
  try {
    res = await fetch(API + path, { ...options, headers });
  } catch {
    throw new Error("서버에 연결할 수 없습니다. API 서버를 먼저 실행해 주세요.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "요청에 실패했습니다.");
  return data;
}

async function loadSiteData() {
  const safe = (promise) => promise.catch((error) => { console.warn(error.message); return null; });
  const admin = isAdmin();
  const loggedIn = Boolean(getSession());
  const [classes, tests, notices, posts, applyFields, users, applications, myApplications] = await Promise.all([
    safe(api("/api/classes")),
    safe(api("/api/tests")),
    safe(api("/api/notices")),
    safe(api("/api/posts")),
    safe(api("/api/apply-fields")),
    admin ? safe(api("/api/admin/users")) : Promise.resolve(null),
    admin ? safe(api("/api/admin/applications")) : Promise.resolve(null),
    loggedIn ? safe(api("/api/my-applications")) : Promise.resolve(null),
  ]);
  if (classes) classCache = classes;
  if (tests) testCache = tests;
  if (notices) noticeCache = notices;
  if (posts) postCache = posts;
  if (applyFields) applyFieldCache = applyFields;
  if (users) userCache = users;
  if (applications) applyCache = applications;
  myApplyAccess = {};
  if (myApplications) {
    for (const item of myApplications) {
      if (item.classAccess) myApplyAccess[item.type] = item.classAccess;
    }
  }
}

// Intentionally in-memory (not sessionStorage): a TEST should require its
// password again every time the page is loaded, and should re-lock itself
// as soon as the visitor actually starts it (see lockTest()).
let unlockedTestIds = [];
let unlockedTestBodies = {};

function unlockedIds() {
  return unlockedTestIds;
}

function unlockedBodies() {
  return unlockedTestBodies;
}

function lockTest(id) {
  unlockedTestIds = unlockedTestIds.filter((entry) => entry !== id);
  delete unlockedTestBodies[id];
  initTests();
}

const COUNSEL_CHAT_URL = "https://open.kakao.com/o/seEpayjh";
const COUNSEL_PHONE_NUMBERS = ["010-8748-2301", "010-4829-4794"];

function setupCounselButton() {
  const contactSpan = document.querySelector(".topbar .wrap span:last-child");
  if (!contactSpan || contactSpan.dataset.counselReady) return;
  contactSpan.dataset.counselReady = "true";
  contactSpan.classList.add("topbar-contact");
  const original = contactSpan.textContent.trim();
  const phoneLinks = COUNSEL_PHONE_NUMBERS.map((num) => `<a href="tel:${num.replace(/-/g, "")}">${escapeHtml(num)}</a>`).join("");
  contactSpan.innerHTML = `<span class="topbar-line">${escapeHtml(original)}
    <a class="topbar-cta" href="${escapeHtml(COUNSEL_CHAT_URL)}" target="_blank" rel="noopener">채팅상담</a>
    <span class="topbar-phone-wrap">
      <button type="button" class="topbar-cta" id="topbar-phone-btn">전화상담</button>
      <div class="topbar-phone-popup" id="topbar-phone-popup">${phoneLinks}</div>
    </span>
  </span><small class="topbar-note">수업 진행 중에는 답변이 다소 늦어질 수 있는 점 양해 부탁드립니다.</small>`;
  const phoneBtn = document.getElementById("topbar-phone-btn");
  const phonePopup = document.getElementById("topbar-phone-popup");
  phoneBtn?.addEventListener("click", (event) => {
    event.stopPropagation();
    phonePopup?.classList.toggle("open");
  });
  document.addEventListener("click", (event) => {
    if (phonePopup?.classList.contains("open") && !event.target.closest(".topbar-phone-wrap")) {
      phonePopup.classList.remove("open");
    }
  });
}

function toggleMenu() {
  document.getElementById("nav")?.classList.toggle("open");
}

function toggleItem(event, el) {
  if (window.innerWidth > 980) return;
  event.preventDefault();
  el.parentElement.classList.toggle("open");
}

function filterCourses(type, btn) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
  btn.classList.add("active");
  renderCourses(type);
}

function renderCourses(type = "all") {
  const box = document.getElementById("course-list");
  if (!box) return;
  const list = type === "all" ? courses : courses.filter((item) => item.type === type);
  box.innerHTML = list
    .map(
      (item) => `
      <article class="card">
        <div class="thumb ${item.type}">${item.track.split(" ")[0]}</div>
        <div class="card-body"><small>${item.tag}</small><h3>${item.title}</h3><p>${item.age} · ${item.track}</p></div>
      </article>`,
    )
    .join("");
}

const HERO_CAROUSEL_COUNT = 18;
const HERO_CAROUSEL_INTERVAL_MS = 5000;
let heroCarouselIndex = 0;
let heroCarouselTimer = null;

function updateHeroCarousel() {
  const track = document.getElementById("hero-carousel-track");
  if (!track) return;
  const total = HERO_CAROUSEL_COUNT;
  track.querySelectorAll(".hero-slide").forEach((slide) => {
    const idx = Number(slide.dataset.index);
    let diff = idx - heroCarouselIndex;
    if (diff > total / 2) diff -= total;
    if (diff < -total / 2) diff += total;
    const abs = Math.abs(diff);
    let transform;
    let opacity;
    let zIndex;
    if (abs === 0) {
      transform = "translate(-50%,-50%) translateX(0) translateZ(0) rotateY(0deg) scale(1)";
      opacity = 1;
      zIndex = 10;
    } else if (abs === 1) {
      transform = `translate(-50%,-50%) translateX(${diff * 390}px) translateZ(-120px) rotateY(${diff * -32}deg) scale(.78)`;
      opacity = 0.75;
      zIndex = 5;
    } else {
      transform = `translate(-50%,-50%) translateX(${diff * 390}px) translateZ(-300px) rotateY(${diff * -32}deg) scale(.6)`;
      opacity = 0;
      zIndex = 0;
    }
    slide.style.transform = transform;
    slide.style.opacity = opacity;
    slide.style.zIndex = zIndex;
    slide.style.pointerEvents = abs > 1 ? "none" : "auto";
  });
  document.querySelectorAll("#hero-carousel-dots button").forEach((dot, idx) => {
    dot.classList.toggle("active", idx === heroCarouselIndex);
  });
}

function goToHeroSlide(index) {
  const total = HERO_CAROUSEL_COUNT;
  heroCarouselIndex = ((index % total) + total) % total;
  updateHeroCarousel();
  restartHeroCarouselAutoplay();
}

function restartHeroCarouselAutoplay() {
  if (heroCarouselTimer) clearInterval(heroCarouselTimer);
  heroCarouselTimer = setInterval(() => {
    heroCarouselIndex = (heroCarouselIndex + 1) % HERO_CAROUSEL_COUNT;
    updateHeroCarousel();
  }, HERO_CAROUSEL_INTERVAL_MS);
}

function initHeroCarousel() {
  const track = document.getElementById("hero-carousel-track");
  const dots = document.getElementById("hero-carousel-dots");
  if (!track || !dots) return;
  track.innerHTML = Array.from(
    { length: HERO_CAROUSEL_COUNT },
    (_, i) => `<div class="hero-slide" data-index="${i}"><img src="images/hero${i + 1}.png" alt="온코드랩 수업 사례 ${i + 1}" loading="lazy" /></div>`,
  ).join("");
  const dotButtons = Array.from({ length: HERO_CAROUSEL_COUNT }, (_, i) => `<button type="button" data-hero-dot="${i}" aria-label="${i + 1}번째 이미지로 이동"></button>`).join("");
  dots.innerHTML = `
    <button type="button" class="hero-carousel-arrow" data-hero-prev aria-label="이전 이미지">‹</button>
    ${dotButtons}
    <button type="button" class="hero-carousel-arrow" data-hero-next aria-label="다음 이미지">›</button>`;
  track.querySelectorAll(".hero-slide").forEach((slide) => {
    slide.addEventListener("click", () => goToHeroSlide(Number(slide.dataset.index)));
  });
  dots.querySelectorAll("[data-hero-dot]").forEach((dot) => {
    dot.addEventListener("click", () => goToHeroSlide(Number(dot.dataset.heroDot)));
  });
  dots.querySelector("[data-hero-prev]").addEventListener("click", () => goToHeroSlide(heroCarouselIndex - 1));
  dots.querySelector("[data-hero-next]").addEventListener("click", () => goToHeroSlide(heroCarouselIndex + 1));
  updateHeroCarousel();
  restartHeroCarouselAutoplay();
}

function renderClassPage() {
  const box = document.getElementById("class-list");
  if (!box) return;
  if (!classCache.length) {
    box.classList.remove("cards");
    box.innerHTML = `<p class="sub">현재 신청 가능한 교육이 없습니다. API 서버가 실행 중인지 확인해 주세요.</p>`;
    return;
  }
  box.classList.add("cards");
  box.innerHTML = classCache
    .map((item) => {
      const access = myApplyAccess[item.title];
      let actionHtml;
      if (access) {
        actionHtml = `<a class="btn btn-orange" href="${escapeHtml(access.linkUrl || (access.fileUrl ? API + access.fileUrl : "#"))}" target="_blank" rel="noopener">수강하기</a>`;
      } else if (item.posterUrl) {
        actionHtml = `<button type="button" class="btn btn-orange" data-open-poster="${escapeHtml(item.id)}">신청하기</button>`;
      } else {
        actionHtml = `<a class="btn btn-orange" href="contact?classTitle=${encodeURIComponent(item.title)}">신청하기</a>`;
      }
      return `
      <article class="card">
        <div class="thumb ${escapeHtml(item.tone || "live")}">${escapeHtml(item.label || "CLASS")}</div>
        <div class="card-body">
          <small>${escapeHtml(item.status || "온라인 · 진행중")}</small>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.summary || "")}</p>
          ${actionHtml}
        </div>
      </article>`;
    })
    .join("");
}

function openPosterModal(item) {
  const modal = document.getElementById("poster-modal");
  if (!modal || !item.posterUrl) return;
  const img = document.getElementById("poster-modal-img");
  const applyLink = document.getElementById("poster-modal-apply");
  img.src = API + item.posterUrl;
  img.alt = item.title;
  applyLink.href = `contact?classTitle=${encodeURIComponent(item.title)}`;
  modal.classList.add("open");
}

function closePosterModal() {
  document.getElementById("poster-modal")?.classList.remove("open");
}

function setupPosterModal() {
  const modal = document.getElementById("poster-modal");
  if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "true";
  modal.querySelectorAll("[data-poster-close]").forEach((el) => el.addEventListener("click", closePosterModal));
  document.addEventListener("click", (event) => {
    const openBtn = event.target.closest("[data-open-poster]");
    if (!openBtn) return;
    const item = classCache.find((entry) => entry.id === openBtn.dataset.openPoster);
    if (item) openPosterModal(item);
  });
}

function fieldTypeLabel(type) {
  return { text: "한 줄 텍스트", email: "이메일", tel: "전화번호", date: "날짜", textarea: "여러 줄 텍스트", select: "선택 목록" }[type] || "한 줄 텍스트";
}

function fieldTypeOptions(selected) {
  const types = [
    { value: "text", label: "한 줄 텍스트" },
    { value: "email", label: "이메일" },
    { value: "tel", label: "전화번호" },
    { value: "date", label: "날짜" },
    { value: "textarea", label: "여러 줄 텍스트" },
    { value: "select", label: "선택 목록" },
  ];
  return types.map((t) => `<option value="${t.value}" ${t.value === (selected || "text") ? "selected" : ""}>${t.label}</option>`).join("");
}

function applyFieldInputHtml(field, value = "") {
  const common = `name="${escapeHtml(field.id)}" ${field.required ? "required" : ""}`;
  const label = `<label class="apply-field-label">${escapeHtml(field.label)}${field.required ? '<span class="required-star">*</span>' : ""}</label>`;
  let input;
  if (field.type === "textarea") {
    input = `<textarea ${common} rows="4" placeholder="${escapeHtml(field.label)}">${escapeHtml(value)}</textarea>`;
  } else if (field.type === "select") {
    const opts = (field.options || []).map((opt) => `<option ${opt === value ? "selected" : ""}>${escapeHtml(opt)}</option>`).join("");
    input = `<select ${common}><option value="">${escapeHtml(field.label)} 선택</option>${opts}</select>`;
  } else {
    const inputType = ["email", "tel", "date"].includes(field.type) ? field.type : "text";
    input = `<input type="${inputType}" ${common} placeholder="${escapeHtml(field.label)}" value="${escapeHtml(value)}" />`;
  }
  return `<div class="apply-field">${label}${input}</div>`;
}

function renderApplyFields() {
  const box = document.getElementById("apply-fields");
  if (!box) return;
  box.innerHTML = applyFieldCache.map((field) => applyFieldInputHtml(field)).join("");
}

function applyDisplayName(item) {
  const first = applyFieldCache[0];
  return (first && item.values?.[first.id]) || item.type || "신청자";
}

function applyFieldsSummary(item) {
  return applyFieldCache
    .map((field) => item.values?.[field.id])
    .filter(Boolean)
    .join(" · ");
}

// "Class 신청자"는 실제 개설된 강좌를 신청한 사람, "수업신청내역"은 상담/문의(수업 의뢰)를 남긴 사람.
const INQUIRY_TYPE = "수업 의뢰";
function isInquiryApply(item) {
  return item.type === INQUIRY_TYPE;
}

function filteredApplyCache() {
  const q = applyFilter.search.trim().toLowerCase();
  return applyCache.filter((item) => {
    if (isInquiryApply(item)) return false;
    if (applyFilter.status !== "all" && (item.status || "pending") !== applyFilter.status) return false;
    if (!q) return true;
    const haystack = [applyDisplayName(item), item.type, applyFieldsSummary(item), item.note].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function inquiryApplyCache() {
  return applyCache.filter(isInquiryApply);
}

function fillInquiryOptions() {
  const select = document.getElementById("class-select");
  if (!select) return;
  select.innerHTML = [
    ...classCache.map((item) => `<option>${escapeHtml(item.title)}</option>`),
    `<option>TEST 진단</option>`,
  ].join("");
}

// contact.html은 두 가지 서로 다른 신청을 같은 화면에서 처리한다.
// 1) Class 카드의 "신청하기"(?classTitle=...) - 이미 개설된 강좌를 수강 신청하는 것. 로그인 필요, 원클릭.
// 2) 상단 주황색 "수업 신청" 버튼(classTitle 없음) - 아직 없는 교육을 만들어달라는 의뢰/문의. 로그인 불필요, 직접 입력.
function initClassSelection() {
  const box = document.getElementById("class-apply-box");
  if (!box) return;
  const classTitle = new URLSearchParams(location.search).get("classTitle") || "";
  const heading = document.getElementById("contact-heading");
  if (heading) heading.textContent = classTitle ? "Class 신청" : "교육신청/문의";
  if (classTitle) renderClassAttendanceApply(box, classTitle);
  else renderClassInquiryForm(box);
}

function renderClassAttendanceApply(box, classTitle) {
  const me = getSession();
  if (!me) {
    box.innerHTML = noticeCard("로그인이 필요합니다", "Class 신청은 로그인 후 이용할 수 있습니다.", `<p><a class="btn btn-orange" href="#" data-auth="login">로그인</a></p>`);
    box.querySelector("[data-auth='login']")?.addEventListener("click", (event) => {
      event.preventDefault();
      openAuth("login");
    });
    return;
  }
  box.innerHTML = `
    <p class="sub" style="margin-bottom:16px"><b>${escapeHtml(classTitle)}</b> 강좌에 신청합니다.</p>
    <button class="btn btn-orange" type="button" id="class-apply-btn">신청하기</button>
  `;
  document.getElementById("class-apply-btn")?.addEventListener("click", () => submitClassApply(classTitle));
}

async function submitClassApply(classTitle) {
  const me = getSession();
  if (!me || !classTitle) return;
  const body = { kind: "class", type: classTitle };
  applyFieldCache.forEach((field, idx) => {
    if (field.type === "tel") body[field.id] = me.phone || "";
    else if (field.type === "email") body[field.id] = me.email || "";
    else if (idx === 0) body[field.id] = me.name || "";
    else if (field.required) body[field.id] = `「${classTitle}」 강좌 수강 신청`; // 수업 의뢰용 필수 항목은 강좌 신청에는 해당 없으므로 자동 채움
  });
  try {
    await api("/api/applications", { method: "POST", body: JSON.stringify(body) });
    const box = document.getElementById("class-apply-box");
    if (box) box.style.display = "none";
    const success = document.getElementById("success");
    if (success) {
      success.innerHTML = `<p><b>「${escapeHtml(classTitle)}」 신청이 완료되었습니다.</b><br /><span style="font-weight:500">새로운 배움의 시작을 온코드랩이 함께하겠습니다.</span><br />관리자 승인 후 교육이 시작되며, 승인 완료 시 별도로 안내드립니다.</p>`;
      success.classList.add("show");
    }
  } catch (error) {
    window.alert(error.message);
  }
}

function renderClassInquiryForm(box) {
  box.innerHTML = `
    <p class="sub" style="margin-bottom:16px">원하시는 교육을 요청해 주시면 확인 후 안내드리겠습니다.</p>
    <form class="form" id="class-inquiry-form">
      ${applyFieldCache.map((field) => applyFieldInputHtml(field)).join("")}
      <button class="btn btn-orange" type="submit">신청하기</button>
    </form>
  `;
  document.getElementById("class-inquiry-form")?.addEventListener("submit", (event) => submitClassInquiry(event));
}

async function submitClassInquiry(event) {
  event.preventDefault();
  const body = { kind: "class", type: "수업 의뢰", ...Object.fromEntries(new FormData(event.target)) };
  try {
    await api("/api/applications", { method: "POST", body: JSON.stringify(body) });
    const box = document.getElementById("class-apply-box");
    if (box) box.style.display = "none";
    const success = document.getElementById("success");
    if (success) {
      success.innerHTML = `<p><b>신청해주신 교육신청/문의가 접수되었습니다.</b><br /><span style="font-weight:500">담당자가 내용 확인 후 빠르게 연락드리겠습니다.</span><br />궁금하신 점은 언제든 문의해 주세요.<br />감사합니다.</p>`;
      success.classList.add("show");
    }
  } catch (error) {
    window.alert(error.message);
  }
}

async function submitInquiry(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  if (data.kind === "instructor") {
    form.style.display = "none";
    document.getElementById("success")?.classList.add("show");
    return;
  }
  try {
    await api("/api/applications", { method: "POST", body: JSON.stringify(data) });
    form.style.display = "none";
    const title = document.getElementById("success-title");
    if (title) {
      title.textContent = data.type ? `「${data.type}」 신청이 완료되었습니다.` : "신청이 완료되었습니다.";
    }
    document.getElementById("success")?.classList.add("show");
  } catch (error) {
    window.alert(error.message);
  }
}

function showTopic(topic, btn) {
  document.querySelectorAll(".topic-btn").forEach((item) => item.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".topic-card").forEach((card) => {
    card.style.display = topic === "all" || card.dataset.topic === topic ? "" : "none";
  });
}

function isValidPhone(phone) {
  return /^01[016789]\d{7,8}$/.test(String(phone || "").replace(/\D/g, ""));
}

function isValidPassword(password) {
  return String(password || "").length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
}

function showAuthMsg(text, isError) {
  const msg = document.getElementById("auth-msg");
  if (!msg) return;
  msg.textContent = text;
  msg.classList.add("show", isError ? "error" : "ok");
  msg.classList.remove(isError ? "ok" : "error");
}

function openAuth(tab) {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  document.querySelectorAll(".auth-tabs [data-auth-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.authTab === tab);
  });
  document.getElementById("login-form")?.classList.toggle("active", tab === "login");
  document.getElementById("signup-form")?.classList.toggle("active", tab === "signup");
  document.getElementById("reset-form")?.classList.toggle("active", tab === "reset");
  document.getElementById("auth-title").textContent = tab === "login" ? "로그인" : tab === "signup" ? "회원가입" : "비밀번호 재설정";
  document.getElementById("auth-hint").textContent =
    tab === "login"
      ? "온코드랩 계정으로 로그인하세요."
      : tab === "signup"
        ? "비밀번호는 영문과 숫자를 포함해 8자 이상으로 만들어 주세요."
        : "가입 시 등록한 이름·이메일·전화번호를 확인한 뒤 새 비밀번호로 바꿔드려요.";
  const msg = document.getElementById("auth-msg");
  if (msg && !msg.classList.contains("ok")) {
    msg.classList.remove("show", "error", "ok");
    msg.textContent = "";
  }
}

function closeAuth() {
  const modal = document.getElementById("auth-modal");
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

function refreshAuthButton() {
  const session = getSession();
  const actions = document.querySelector(".header-actions");
  const loginBtn = actions?.querySelector("[data-auth='login']");
  document.querySelector("[data-auth='mypage']")?.remove();
  document.querySelector("[data-auth='admin']")?.remove();
  // 관리자 계정은 헤더 버튼이 많아 복잡해지므로 방문객용 "교육신청 / 문의" 버튼은 숨긴다.
  const inquiryBtn = actions?.querySelector(".btn-orange");
  if (inquiryBtn) inquiryBtn.style.display = isAdmin() ? "none" : "";
  if (session && actions) {
    const mypage = Object.assign(document.createElement("a"), {
      className: "btn btn-line",
      href: "mypage",
      textContent: "마이페이지",
    });
    mypage.dataset.auth = "mypage";
    actions.insertBefore(mypage, loginBtn || actions.firstChild);
    if (isAdmin()) {
      const adminBtn = Object.assign(document.createElement("a"), {
        className: "btn btn-green",
        href: "admin",
        textContent: "어드민",
      });
      adminBtn.dataset.auth = "admin";
      actions.insertBefore(adminBtn, loginBtn || actions.firstChild);
    }
  }
  document.querySelectorAll("[data-auth='login']").forEach((btn) => {
    btn.textContent = session ? "로그아웃" : "로그인";
  });
}

async function refreshAccountViews() {
  refreshAuthButton();
  await loadSiteData();
  initMypage();
  initAdmin();
  initTests();
  renderClassPage();
  fillInquiryOptions();
  renderApplyFields();
  initClassSelection();
  initNotices();
  initCommunity();
  renderHomeReviews();
}

function formatBoardDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function boardListHtml(list, page) {
  if (!list.length) return `<p class="sub" style="padding:24px 0">등록된 글이 없습니다.</p>`;
  return `<div class="board">${list
    .map(
      (item) => `<a href="${page}?id=${encodeURIComponent(item.id)}"><em>${escapeHtml(item.tag || "")}</em><b>${escapeHtml(item.title)}</b><span>${formatBoardDate(item.createdAt)}</span></a>`,
    )
    .join("")}</div>`;
}

function boardDetailHtml(item, page) {
  if (!item) {
    return `<div class="profile-card"><h2>글을 찾을 수 없습니다.</h2><p style="margin-top:18px"><a class="btn btn-line" href="${page}">목록으로</a></p></div>`;
  }
  return `<div class="profile-card">
    <p class="kicker">${escapeHtml(item.tag || "")}</p>
    <h2>${escapeHtml(item.title)}</h2>
    <p class="sub">${formatBoardDate(item.createdAt)}</p>
    <div class="doc-body">${escapeHtml(item.body || "")}</div>
    <p style="margin-top:24px"><a class="btn btn-line" href="${page}">목록으로</a></p>
  </div>`;
}

function initBoard(boxId, list, page) {
  const box = document.getElementById(boxId);
  if (!box) return;
  const id = new URLSearchParams(location.search).get("id");
  box.innerHTML = id ? boardDetailHtml(list.find((item) => item.id === id), page) : boardListHtml(list, page);
}

function initNotices() {
  initBoard("notice-list", noticeCache, "notice");
}

async function loadBlogReviews() {
  try {
    blogReviewCache = await api("/api/blog-reviews");
  } catch (error) {
    console.warn(error.message);
  }
}

let homeReviewSearch = "";
const HOME_REVIEW_PAGE_SIZE = 25; // 5행 5열

function reviewThumbHtml(item) {
  return item.image
    ? `<img src="${escapeHtml(item.image)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:auto" />`
    : `<div class="thumb live" data-thumb-for="${escapeHtml(item.link)}">REVIEW</div>`;
}

// RSS에 썸네일이 없는(오래된) 글은 목록에는 이미지 없이 나오고, 실제로 화면에
// 그려진 카드에 한해서만 본문에서 이미지를 가져와 채워 넣는다(전체를 한 번에
// 긁으면 너무 느리고 부하가 크기 때문). 같은 글은 세션 내에서 한 번만 요청한다.
const thumbnailFetchCache = {};
async function loadMissingThumbnails(root) {
  const placeholders = root.querySelectorAll("[data-thumb-for]");
  for (const el of placeholders) {
    const link = el.dataset.thumbFor;
    if (!thumbnailFetchCache[link]) {
      thumbnailFetchCache[link] = api(`/api/blog-reviews/thumbnail?link=${encodeURIComponent(link)}`).catch(() => ({ image: "" }));
    }
    thumbnailFetchCache[link].then((result) => {
      if (!result?.image) return;
      document.querySelectorAll(`[data-thumb-for="${CSS.escape(link)}"]`).forEach((node) => {
        node.outerHTML = `<img src="${escapeHtml(result.image)}" alt="" referrerpolicy="no-referrer" style="width:100%;height:auto" />`;
      });
    });
  }
}

function homeReviewCardHtml(item) {
  return `<article class="card">
    ${reviewThumbHtml(item)}
    <div class="card-body">
      <a class="btn btn-line" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">블로그에서 보기</a>
    </div>
  </article>`;
}

function homeReviewResultsHtml() {
  if (!blogReviewCache.length) return `<p class="sub" style="padding:24px 0">불러올 후기가 없습니다.</p>`;
  const query = homeReviewSearch.trim().toLowerCase();
  const filtered = query ? blogReviewCache.filter((item) => item.title.toLowerCase().includes(query)) : blogReviewCache;
  if (!filtered.length) return `<p class="sub" style="padding:24px 0">검색 결과가 없습니다.</p>`;
  const pageItems = filtered.slice(0, HOME_REVIEW_PAGE_SIZE);
  return `<div class="cards review-grid">${pageItems.map(homeReviewCardHtml).join("")}</div>`;
}

function renderHomeReviews() {
  const box = document.getElementById("home-reviews");
  if (!box) return;
  box.innerHTML = `
    <div class="review-search-wrap">
      <span class="review-search-icon">🔍</span>
      <input type="text" id="home-review-search" class="review-search-input" placeholder="원하는 교육을 검색하세요." value="${escapeHtml(homeReviewSearch)}" />
    </div>
    <div id="home-review-results">${homeReviewResultsHtml()}</div>`;
  loadMissingThumbnails(box);
  box.querySelector("#home-review-search")?.addEventListener("input", (event) => {
    homeReviewSearch = event.target.value;
    const results = document.getElementById("home-review-results");
    if (results) {
      results.innerHTML = homeReviewResultsHtml();
      loadMissingThumbnails(results);
    }
  });
}

function reviewCardHtml(item) {
  const author = item.blogId === "smartjula" ? "박주라 강사 블로그" : "백승희 강사 블로그";
  return `<article class="card">
    ${reviewThumbHtml(item)}
    <div class="card-body">
      <small>${escapeHtml(author)}</small>
      <h3>${escapeHtml(item.title)}</h3>
      <a class="btn btn-line" href="${escapeHtml(item.link)}" target="_blank" rel="noopener">블로그에서 보기</a>
    </div>
  </article>`;
}

function paginationRange(current, total) {
  const delta = 2;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
  }
  const withDots = [];
  let prev = 0;
  for (const num of range) {
    if (prev && num - prev > 1) withDots.push("…");
    withDots.push(num);
    prev = num;
  }
  return withDots;
}

function reviewResultsHtml() {
  if (!blogReviewCache.length) {
    return `<p class="sub" style="padding:24px 0">불러올 후기가 없습니다.</p>`;
  }

  const query = reviewSearch.trim().toLowerCase();
  const filtered = query ? blogReviewCache.filter((item) => item.title.toLowerCase().includes(query)) : blogReviewCache;

  if (!filtered.length) {
    return `<p class="sub" style="padding:24px 0">검색 결과가 없습니다.</p>`;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / REVIEW_PAGE_SIZE));
  reviewPage = Math.min(Math.max(1, reviewPage), totalPages);
  const start = (reviewPage - 1) * REVIEW_PAGE_SIZE;
  const pageItems = filtered.slice(start, start + REVIEW_PAGE_SIZE);

  const cards = `<div class="cards review-grid">${pageItems.map(reviewCardHtml).join("")}</div>`;

  const pageButtons = paginationRange(reviewPage, totalPages)
    .map((num) =>
      num === "…"
        ? `<span style="padding:0 6px;color:var(--muted)">…</span>`
        : `<button type="button" class="tab ${num === reviewPage ? "active" : ""}" data-review-page="${num}">${num}</button>`,
    )
    .join("");

  const pagination =
    totalPages > 1
      ? `<div class="tabs" style="justify-content:center;align-items:center;margin-top:28px">
          <button type="button" class="tab" data-review-page="prev" ${reviewPage <= 1 ? "disabled" : ""}>이전</button>
          ${pageButtons}
          <button type="button" class="tab" data-review-page="next" ${reviewPage >= totalPages ? "disabled" : ""}>다음</button>
        </div>`
      : "";

  return cards + pagination;
}

function reviewCardsHtml() {
  const searchBar = `<div class="review-search-wrap">
    <span class="review-search-icon">🔍</span>
    <input type="text" id="review-search" class="review-search-input" placeholder="검색" value="${escapeHtml(reviewSearch)}" />
  </div>`;
  return `${searchBar}<div id="review-results"></div>`;
}

function renderReviewResults() {
  const results = document.getElementById("review-results");
  if (!results) return;
  results.innerHTML = reviewResultsHtml();
  loadMissingThumbnails(results);
  results.querySelectorAll("[data-review-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.reviewPage;
      if (value === "prev") reviewPage -= 1;
      else if (value === "next") reviewPage += 1;
      else reviewPage = Number(value);
      renderReviewResults();
      results.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function postWriteFormHtml() {
  return `<div class="profile-card" style="margin-bottom:20px">
    <h2>질문하기</h2>
    <p class="sub">교육이나 수업이 궁금하신 점을 남겨주시면 답변해 드릴게요. 비밀번호를 입력해 두면 나중에 직접 수정·삭제할 수 있어요.</p>
    <form class="form" id="post-write-form" style="margin-top:16px" autocomplete="off">
      <div class="admin-form-row">
        <input required name="name" placeholder="이름" maxlength="20" autocomplete="off" />
        <input required type="password" name="password" placeholder="비밀번호 (4자 이상)" minlength="4" autocomplete="new-password" />
      </div>
      <input required name="title" placeholder="제목" autocomplete="off" />
      <textarea required name="body" rows="5" placeholder="궁금하신 내용을 입력해 주세요"></textarea>
      <button class="btn btn-orange" type="submit">등록하기</button>
    </form>
  </div>`;
}

function postListHtml(list = postCache) {
  if (!list.length) return `<p class="sub" style="padding:24px 0">등록된 글이 없습니다.</p>`;
  return `<div class="board">${list
    .map(
      (item) =>
        `<a href="community?id=${encodeURIComponent(item.id)}"><em>${escapeHtml(item.tag || "질문")}</em><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.name || "")} · ${formatBoardDate(item.createdAt)}</span></a>`,
    )
    .join("")}</div>`;
}

function postDetailHtml(item) {
  if (!item) {
    return `<div class="profile-card"><h2>글을 찾을 수 없습니다.</h2><p style="margin-top:18px"><a class="btn btn-line" href="community">목록으로</a></p></div>`;
  }
  return `<div class="profile-card">
    <p class="kicker">${escapeHtml(item.tag || "질문")}</p>
    <h2>${escapeHtml(item.title)}</h2>
    <p class="sub">${escapeHtml(item.name || "")} · ${formatBoardDate(item.createdAt)}</p>
    <div class="doc-body">${escapeHtml(item.body || "")}</div>
    <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
      <a class="btn btn-line" href="community">목록으로</a>
      <button class="btn btn-line" type="button" data-post-edit="${escapeHtml(item.id)}">수정</button>
      <button class="btn btn-orange" type="button" data-post-delete="${escapeHtml(item.id)}">삭제</button>
    </div>
  </div>`;
}

function postEditFormHtml(item) {
  return `<div class="profile-card">
    <h2>글 수정</h2>
    <form class="form" id="post-edit-form" style="margin-top:16px" autocomplete="off">
      <div class="admin-form-row">
        <input required name="name" placeholder="이름" maxlength="20" value="${escapeHtml(item.name || "")}" autocomplete="off" />
        ${isAdmin() ? "" : `<input required type="password" name="password" placeholder="비밀번호" autocomplete="current-password" />`}
      </div>
      <input required name="title" placeholder="제목" value="${escapeHtml(item.title)}" />
      <textarea required name="body" rows="5" placeholder="내용">${escapeHtml(item.body || "")}</textarea>
      <div class="admin-form-actions">
        <button class="btn btn-green" type="submit">저장</button>
        <button class="btn btn-line" type="button" data-post-cancel-edit>취소</button>
      </div>
    </form>
  </div>`;
}

async function submitNewPost(event) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    const created = await api("/api/posts", { method: "POST", body: JSON.stringify(data) });
    postCache = [created, ...postCache];
    initCommunity();
  } catch (error) {
    window.alert(error.message);
  }
}

async function savePostEdit(event, id) {
  event.preventDefault();
  const form = event.target;
  const data = Object.fromEntries(new FormData(form));
  try {
    const updated = await api(`/api/posts/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) });
    postCache = postCache.map((item) => (item.id === updated.id ? updated : item));
    editPostState = null;
    initCommunity();
  } catch (error) {
    window.alert(error.message);
  }
}

async function deletePostFlow(id) {
  if (!window.confirm("정말 삭제할까요?")) return;
  let password = "";
  if (!isAdmin()) {
    password = window.prompt("비밀번호를 입력해 주세요.") || "";
    if (!password) return;
  }
  try {
    await api(`/api/posts/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({ password }) });
    postCache = postCache.filter((item) => item.id !== id);
    history.replaceState(null, "", "community");
    initCommunity();
  } catch (error) {
    window.alert(error.message);
  }
}

function initCommunity() {
  const box = document.getElementById("community");
  if (!box) return;
  const tabParam = new URLSearchParams(location.search).get("tab");
  if (["info", "review", "question"].includes(tabParam)) communityTab = tabParam;
  const tabsHtml = `<div class="tabs">
    <button type="button" class="tab ${communityTab === "info" ? "active" : ""}" data-community-tab="info">교육정보</button>
    <button type="button" class="tab ${communityTab === "review" ? "active" : ""}" data-community-tab="review">교육후기</button>
    <button type="button" class="tab ${communityTab === "question" ? "active" : ""}" data-community-tab="question">질문하기</button>
  </div>`;

  if (communityTab === "review") {
    box.innerHTML = tabsHtml + reviewCardsHtml();
    renderReviewResults();
    box.querySelector("#review-search")?.addEventListener("input", (event) => {
      reviewSearch = event.target.value;
      reviewPage = 1;
      renderReviewResults();
    });
  } else {
    const id = new URLSearchParams(location.search).get("id");
    if (id) {
      const item = postCache.find((entry) => entry.id === id);
      box.innerHTML = tabsHtml + (editPostState === id && item ? postEditFormHtml(item) : postDetailHtml(item));
      if (editPostState === id && item) {
        box.querySelector("#post-edit-form")?.addEventListener("submit", (event) => savePostEdit(event, id));
        box.querySelector("[data-post-cancel-edit]")?.addEventListener("click", () => {
          editPostState = null;
          initCommunity();
        });
      } else {
        box.querySelector("[data-post-edit]")?.addEventListener("click", () => {
          editPostState = id;
          initCommunity();
        });
        box.querySelector("[data-post-delete]")?.addEventListener("click", () => deletePostFlow(id));
      }
    } else {
      editPostState = null;
      const isQuestion = communityTab === "question";
      const list = isQuestion ? postCache.filter((item) => (item.tag || "질문") === "질문") : postCache;
      box.innerHTML = tabsHtml + (isQuestion ? postWriteFormHtml() : "") + postListHtml(list);
      box.querySelector("#post-write-form")?.addEventListener("submit", submitNewPost);
    }
  }

  box.querySelectorAll("[data-community-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      communityTab = btn.dataset.communityTab;
      showQuestionForm = false;
      history.replaceState(null, "", "community");
      initCommunity();
    });
  });
}

function setupAuth() {
  const actions = document.querySelector(".header-actions");
  if (actions && !actions.querySelector("[data-auth='login']")) {
    const loginBtn = Object.assign(document.createElement("a"), {
      className: "btn btn-line",
      href: "#",
      textContent: "로그인",
    });
    loginBtn.dataset.auth = "login";
    actions.insertBefore(loginBtn, actions.querySelector(".btn-orange") || actions.firstChild);
  }

  if (!document.getElementById("auth-modal")) {
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div class="auth-modal" id="auth-modal" aria-hidden="true">
        <div class="auth-dim" data-auth-close></div>
        <div class="auth-box" role="dialog" aria-modal="true">
          <button class="auth-close" type="button" data-auth-close aria-label="닫기">×</button>
          <div class="auth-tabs">
            <button type="button" class="active" data-auth-tab="login">로그인</button>
            <button type="button" data-auth-tab="signup">회원가입</button>
          </div>
          <h2 id="auth-title">로그인</h2>
          <p class="hint" id="auth-hint">온코드랩 계정으로 로그인하세요.</p>
          <p class="auth-msg" id="auth-msg"></p>
          <form class="auth-form active" id="login-form">
            <input required type="email" name="email" placeholder="이메일" autocomplete="email" />
            <input required type="password" name="password" placeholder="비밀번호" autocomplete="current-password" />
            <button class="btn btn-orange" type="submit">로그인</button>
            <p class="auth-switch">아직 회원이 아니신가요? <button type="button" data-auth-tab="signup">회원가입</button></p>
            <p class="auth-switch"><button type="button" data-auth-tab="reset">비밀번호를 잊으셨나요?</button></p>
          </form>
          <form class="auth-form" id="signup-form">
            <input required name="name" placeholder="이름" autocomplete="name" />
            <input required type="email" name="email" placeholder="이메일" autocomplete="email" />
            <input required type="tel" name="phone" placeholder="전화번호 (010-0000-0000)" autocomplete="tel" />
            <input required type="password" name="password" placeholder="비밀번호 (영문+숫자 8자 이상)" minlength="8" autocomplete="new-password" />
            <input required type="password" name="password2" placeholder="비밀번호 확인" minlength="8" autocomplete="new-password" />
            <button class="btn btn-green" type="submit">회원가입</button>
            <p class="auth-switch">이미 계정이 있나요? <button type="button" data-auth-tab="login">로그인</button></p>
          </form>
          <form class="auth-form" id="reset-form" autocomplete="off">
            <input required name="name" placeholder="이름" autocomplete="off" />
            <input required type="email" name="email" placeholder="이메일" autocomplete="off" />
            <input required type="tel" name="phone" placeholder="전화번호 (010-0000-0000)" autocomplete="off" />
            <input required type="password" name="password" placeholder="새 비밀번호 (영문+숫자 8자 이상)" minlength="8" autocomplete="new-password" />
            <input required type="password" name="password2" placeholder="새 비밀번호 확인" minlength="8" autocomplete="new-password" />
            <button class="btn btn-orange" type="submit">비밀번호 변경</button>
            <p class="auth-switch">로그인 정보가 기억나셨나요? <button type="button" data-auth-tab="login">로그인</button></p>
          </form>
        </div>
      </div>`,
    );
  }

  document.querySelectorAll("[data-auth='login']").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      if (getSession()) {
        api("/api/auth/logout", { method: "POST" }).catch(() => {});
        clearAuth();
        refreshAccountViews();
        return;
      }
      openAuth("login");
    });
  });
  document.querySelectorAll("[data-auth-close]").forEach((el) => el.addEventListener("click", closeAuth));
  document.querySelectorAll("[data-auth-tab]").forEach((el) => {
    el.addEventListener("click", () => openAuth(el.dataset.authTab));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeAuth();
  });

  document.getElementById("login-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    try {
      saveAuth(await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) }));
      closeAuth();
      await refreshAccountViews();
    } catch (error) {
      showAuthMsg(error.message, true);
    }
  });

  document.getElementById("signup-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const { name, email, phone, password, password2 } = Object.fromEntries(new FormData(form));
    if (!isValidPassword(password)) return showAuthMsg("비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.", true);
    if (password !== password2) return showAuthMsg("비밀번호가 서로 다릅니다.", true);
    if (!isValidPhone(phone)) return showAuthMsg("전화번호를 올바르게 입력해 주세요. 예: 010-1234-5678", true);
    try {
      saveAuth(await api("/api/auth/signup", { method: "POST", body: JSON.stringify({ name, email, phone, password }) }));
      form.reset();
      closeAuth();
      await refreshAccountViews();
    } catch (error) {
      showAuthMsg(error.message, true);
    }
  });

  document.getElementById("reset-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const { name, email, phone, password, password2 } = Object.fromEntries(new FormData(form));
    if (!isValidPassword(password)) return showAuthMsg("비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.", true);
    if (password !== password2) return showAuthMsg("비밀번호가 서로 다릅니다.", true);
    try {
      await api("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ name, email, phone, password }) });
      form.reset();
      showAuthMsg("비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.", false);
      setTimeout(() => openAuth("login"), 1200);
    } catch (error) {
      showAuthMsg(error.message, true);
    }
  });

  refreshAuthButton();
}

function noticeCard(title, text, action) {
  return `<div class="profile-card"><h2>${title}</h2><p class="sub">${text}</p>${action || ""}</div>`;
}

function initMypage() {
  const box = document.getElementById("mypage");
  if (!box) return;
  const me = getSession();
  if (!me) {
    box.innerHTML = noticeCard("로그인이 필요합니다", "마이페이지는 로그인 후 이용할 수 있습니다.", `<p><a class="btn btn-orange" href="#" data-auth="login">로그인</a></p>`);
    box.querySelector("[data-auth='login']")?.addEventListener("click", (event) => {
      event.preventDefault();
      openAuth("login");
    });
    return;
  }
  box.innerHTML = `
    <div class="profile-card">
      <p class="kicker">MY PAGE</p>
      <h2>${escapeHtml(me.name)} 님</h2>
      <p>이메일 ${escapeHtml(me.email)}</p>
      <p>전화번호 ${escapeHtml(me.phone || "-")}</p>
      <p>권한 <span class="role-badge ${isAdmin(me) ? "admin" : ""}">${isAdmin(me) ? "관리자" : "일반 회원"}</span></p>
      ${isAdmin(me) ? `<p style="margin-top:18px"><a class="btn btn-green" href="admin">어드민 페이지로 이동</a></p>` : ""}
    </div>
    <div class="profile-card" style="margin-top:20px">
      <h2>내 수업 신청 현황</h2>
      <p class="sub">신청하신 연락처로 확인됩니다. 승인 완료되면 여기서 바로 강좌에 입장할 수 있어요.</p>
      <div id="my-applications" style="margin-top:16px"><p class="sub">불러오는 중...</p></div>
    </div>
    <div class="profile-card" style="margin-top:20px">
      <h2>회원정보 수정</h2>
      <form class="form" id="profile-form" style="margin-top:16px" autocomplete="off">
        <input required name="name" placeholder="이름" value="${escapeHtml(me.name)}" autocomplete="off" />
        <input required type="tel" name="phone" placeholder="전화번호 (010-0000-0000)" value="${escapeHtml(me.phone || "")}" autocomplete="off" />
        <button class="btn btn-orange" type="submit">정보 저장</button>
      </form>
      <p class="auth-msg" id="profile-msg"></p>
    </div>
    <div class="profile-card" style="margin-top:20px">
      <h2>비밀번호 변경</h2>
      <form class="form" id="password-form" style="margin-top:16px" autocomplete="off">
        <input required type="password" name="currentPassword" placeholder="현재 비밀번호" autocomplete="current-password" />
        <input required type="password" name="newPassword" placeholder="새 비밀번호 (영문+숫자 8자 이상)" minlength="8" autocomplete="new-password" />
        <input required type="password" name="newPassword2" placeholder="새 비밀번호 확인" minlength="8" autocomplete="new-password" />
        <button class="btn btn-line" type="submit">비밀번호 변경</button>
      </form>
      <p class="auth-msg" id="password-msg"></p>
    </div>`;

  const setMsg = (el, text, isError) => {
    el.textContent = text;
    el.classList.add("show", isError ? "error" : "ok");
    el.classList.remove(isError ? "ok" : "error");
  };

  (async () => {
    const container = box.querySelector("#my-applications");
    if (!container) return;
    try {
      const mine = await api("/api/my-applications");
      if (!mine.length) {
        container.innerHTML = `<p class="sub">신청 내역이 없습니다.</p>`;
        return;
      }
      container.innerHTML = mine
        .map((item) => {
          const actions = item.classAccess
            ? `<div class="admin-item-actions">
                ${item.classAccess.linkUrl ? `<a class="btn btn-orange" href="${escapeHtml(item.classAccess.linkUrl)}" target="_blank" rel="noopener">강좌 입장하기</a>` : ""}
                ${item.classAccess.fileUrl ? `<a class="btn btn-line" href="${escapeHtml(API + item.classAccess.fileUrl)}" target="_blank" rel="noopener">${escapeHtml(item.classAccess.fileName || "자료")} 다운로드</a>` : ""}
              </div>`
            : `<span class="role-badge">${escapeHtml(applyStatus(item.status))}</span>`;
          return `<div class="admin-item">
            <div><b>${escapeHtml(item.type || "수업 신청")}</b><p>${formatAdminDate(item.createdAt)}</p></div>
            ${actions}
          </div>`;
        })
        .join("");
    } catch {
      container.innerHTML = `<p class="sub">불러오지 못했습니다.</p>`;
    }
  })();

  box.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const { name, phone } = Object.fromEntries(new FormData(form));
    const msg = box.querySelector("#profile-msg");
    if (!isValidPhone(phone)) return setMsg(msg, "전화번호를 올바르게 입력해 주세요. 예: 010-1234-5678", true);
    try {
      const updated = await api("/api/auth/me", { method: "PUT", body: JSON.stringify({ name, phone }) });
      localStorage.setItem("oncodelab-session", JSON.stringify(updated));
      setMsg(msg, "저장되었습니다.", false);
      refreshAuthButton();
      initMypage();
    } catch (error) {
      setMsg(msg, error.message, true);
    }
  });

  box.querySelector("#password-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const { currentPassword, newPassword, newPassword2 } = Object.fromEntries(new FormData(form));
    const msg = box.querySelector("#password-msg");
    if (!isValidPassword(newPassword)) return setMsg(msg, "새 비밀번호는 영문과 숫자를 포함해 8자 이상이어야 합니다.", true);
    if (newPassword !== newPassword2) return setMsg(msg, "새 비밀번호가 서로 다릅니다.", true);
    try {
      await api("/api/auth/password", { method: "PUT", body: JSON.stringify({ currentPassword, newPassword }) });
      form.reset();
      setMsg(msg, "비밀번호가 변경되었습니다.", false);
    } catch (error) {
      setMsg(msg, error.message, true);
    }
  });
}

function adminItem(item, extra, actions) {
  return `<div class="admin-item"><div><b>${escapeHtml(item.title)}</b><p>${extra}</p></div>${actions}</div>`;
}

function formatAdminDate(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function applyCount(status) {
  return applyCache.filter((item) => (item.status || "pending") === status).length;
}

function applyClassMeta(item) {
  const course = classCache.find((entry) => entry.title === item.type);
  const tone = course?.tone || "etc";
  const label = (course?.label || item.type || "수업").slice(0, 4);
  return { tone: ["live", "vod", "off"].includes(tone) ? tone : "etc", label, title: item.type || "수업 신청" };
}

function initAdmin() {
  const box = document.getElementById("admin");
  if (!box) return;
  if (!getSession()) {
    box.className = "admin-gate";
    box.innerHTML = noticeCard("로그인이 필요합니다", "어드민 페이지는 관리자만 이용할 수 있습니다.", `<p><a class="btn btn-orange" href="#" data-auth="login">로그인</a></p>`);
    box.querySelector("[data-auth='login']")?.addEventListener("click", (event) => {
      event.preventDefault();
      openAuth("login");
    });
    return;
  }
  if (!isAdmin()) {
    box.className = "admin-gate";
    box.innerHTML = noticeCard("접근 권한이 없습니다", "일반 회원은 어드민 페이지를 볼 수 없습니다.", `<p><a class="btn btn-line" href="index">홈으로 이동</a></p>`);
    return;
  }

  const me = getSession();
  const editingClass = classCache.find((item) => item.id === editClassId);
  const editingTest = testCache.find((item) => item.id === editTestId);
  const editingApply = applyCache.find((item) => item.id === editApplyId);
  const editingNotice = noticeCache.find((item) => item.id === editNoticeId);
  const editingPost = postCache.find((item) => item.id === editPostId);
  const editingField = applyFieldCache.find((item) => item.id === editFieldId);
  const tabs = [
    { id: "overview", label: "대시보드" },
    { id: "class", label: "Class 관리" },
    { id: "apply", label: "Class 신청자" },
    { id: "test", label: "TEST" },
    { id: "notice", label: "공지사항" },
    { id: "community", label: "커뮤니티" },
    { id: "fields", label: "수업신청내역" },
    { id: "users", label: "가입자 목록" },
  ];
  box.className = "admin-shell";
  box.innerHTML = `
    <aside class="dash-sidebar">
      <div class="dash-brand">
        <h1>관리자 대시보드</h1>
        <p>${escapeHtml(me.name)} 관리자</p>
      </div>
      <nav class="dash-nav">${tabs
        .map((tab) => {
          return `<button type="button" data-admin-tab="${tab.id}" class="${adminNav === tab.id ? "active" : ""}">${tab.label}</button>`;
        })
        .join("")}</nav>
      <div class="dash-check">
        <h3>운영 체크리스트</h3>
        <ul>
          <li>신규 수업 신청을 확인했나요?</li>
          <li>접수 상태를 업데이트했나요?</li>
          <li>Class 정보를 점검했나요?</li>
          <li>TEST 비밀번호를 확인했나요?</li>
          <li>회원 권한을 확인했나요?</li>
        </ul>
      </div>
      <div class="dash-side-links">
        <a href="index">사이트로 이동</a>
        <button type="button" data-admin-logout>로그아웃</button>
      </div>
    </aside>
    <main class="dash-main">
      ${adminTab === "overview" ? adminOverview() : ""}
      ${adminTab === "class" ? adminClassPanel(editingClass) : ""}
      ${adminTab === "test" ? adminTestPanel(editingTest) : ""}
      ${adminTab === "apply" ? adminApplyPanel(editingApply) : ""}
      ${adminTab === "fields" ? adminFieldsPanel(editingField) : ""}
      ${adminTab === "notice" ? adminNoticePanel(editingNotice) : ""}
      ${adminTab === "community" ? adminPostPanel(editingPost) : ""}
      ${adminTab === "users" ? adminUsersPanel() : ""}
    </main>
  `;

  box.onclick = (event) => {
    if (event.target.closest("[data-admin-logout]")) {
      api("/api/auth/logout", { method: "POST" }).catch(() => {});
      clearAuth();
      refreshAccountViews();
      return;
    }
    const tab = event.target.closest("[data-admin-tab]");
    if (tab) {
      adminNav = tab.dataset.adminTab;
      adminTab = adminNav;
      if (adminTab !== "class") editClassId = null;
      if (adminTab !== "test") editTestId = null;
      if (adminTab !== "apply" && adminTab !== "fields") {
        editApplyId = null;
        viewApplyId = null;
      }
      if (adminTab !== "notice") editNoticeId = null;
      if (adminTab !== "community") editPostId = null;
      if (adminTab !== "fields") editFieldId = null;
      initAdmin();
      return;
    }
    const editClass = event.target.closest("[data-edit-class]");
    if (editClass) {
      adminTab = "class";
      adminNav = "class";
      editClassId = editClass.dataset.editClass;
      initAdmin();
      return;
    }
    const editTest = event.target.closest("[data-edit-test]");
    if (editTest) {
      adminTab = "test";
      adminNav = "test";
      editTestId = editTest.dataset.editTest;
      initAdmin();
      return;
    }
    const editApply = event.target.closest("[data-edit-apply]");
    if (editApply) {
      const id = editApply.dataset.editApply;
      const item = applyCache.find((entry) => entry.id === id);
      adminTab = isInquiryApply(item || {}) ? "fields" : "apply";
      adminNav = adminTab;
      editApplyId = id;
      initAdmin();
      return;
    }
    const quickApprove = event.target.closest("[data-quick-approve]");
    if (quickApprove) {
      const id = quickApprove.dataset.quickApprove;
      const item = applyCache.find((entry) => entry.id === id);
      quickUpdateApplyStatus(id, item?.status === "done" ? "pending" : "done");
      return;
    }
    const viewApply = event.target.closest("[data-view-apply]");
    if (viewApply && !event.target.closest("select, button")) {
      const id = viewApply.dataset.viewApply;
      const item = applyCache.find((entry) => entry.id === id);
      adminTab = isInquiryApply(item || {}) ? "fields" : "apply";
      adminNav = adminTab;
      viewApplyId = id;
      markApplyViewed(id);
      initAdmin();
      return;
    }
    if (event.target.closest("[data-apply-back]")) {
      viewApplyId = null;
      initAdmin();
      return;
    }
    const editNotice = event.target.closest("[data-edit-notice]");
    if (editNotice) {
      adminTab = "notice";
      adminNav = "notice";
      editNoticeId = editNotice.dataset.editNotice;
      initAdmin();
      return;
    }
    const editPost = event.target.closest("[data-edit-post]");
    if (editPost) {
      adminTab = "community";
      adminNav = "community";
      editPostId = editPost.dataset.editPost;
      initAdmin();
      return;
    }
    const editField = event.target.closest("[data-edit-field]");
    if (editField) {
      adminTab = "fields";
      adminNav = "fields";
      editFieldId = editField.dataset.editField;
      initAdmin();
      return;
    }
    const moveFieldUp = event.target.closest("[data-move-field-up]");
    if (moveFieldUp) return moveApplyField(moveFieldUp.dataset.moveFieldUp, -1);
    const moveFieldDown = event.target.closest("[data-move-field-down]");
    if (moveFieldDown) return moveApplyField(moveFieldDown.dataset.moveFieldDown, 1);
    const filterBtn = event.target.closest("[data-apply-filter]");
    if (filterBtn) {
      applyFilter.status = filterBtn.dataset.applyFilter;
      initAdmin();
      return;
    }
    if (event.target.closest("[data-cancel-class]")) {
      editClassId = null;
      adminNav = "class";
      initAdmin();
    }
    if (event.target.closest("[data-cancel-test]")) {
      editTestId = null;
      initAdmin();
    }
    if (event.target.closest("[data-cancel-apply]")) {
      editApplyId = null;
      initAdmin();
    }
    if (event.target.closest("[data-cancel-notice]")) {
      editNoticeId = null;
      initAdmin();
    }
    if (event.target.closest("[data-cancel-post]")) {
      editPostId = null;
      initAdmin();
    }
    if (event.target.closest("[data-cancel-field]")) {
      editFieldId = null;
      initAdmin();
    }
    const delClass = event.target.closest("[data-delete-class]");
    if (delClass) deleteAdminItem("classes", delClass.dataset.deleteClass, classCache);
    const delTest = event.target.closest("[data-delete-test]");
    if (delTest) deleteAdminItem("tests", delTest.dataset.deleteTest, testCache);
    const delApply = event.target.closest("[data-delete-apply]");
    if (delApply) deleteAdminItem("applications", delApply.dataset.deleteApply, applyCache);
    const delNotice = event.target.closest("[data-delete-notice]");
    if (delNotice) deleteAdminItem("notices", delNotice.dataset.deleteNotice, noticeCache);
    const delPost = event.target.closest("[data-delete-post]");
    if (delPost) deleteAdminItem("posts", delPost.dataset.deletePost, postCache);
    const delField = event.target.closest("[data-delete-field]");
    if (delField) deleteAdminItem("apply-fields", delField.dataset.deleteField, applyFieldCache);
    const roleBtn = event.target.closest("[data-role-email]");
    if (roleBtn) setUserRole(roleBtn.dataset.roleEmail, roleBtn.dataset.roleValue);
    const delUser = event.target.closest("[data-delete-user]");
    if (delUser) deleteUser(delUser.dataset.deleteUser, delUser.dataset.userName);
  };
  box.querySelector("#class-form")?.addEventListener("submit", (event) => saveAdminClass(event));
  box.querySelector("#test-form")?.addEventListener("submit", (event) => saveAdminTest(event));
  box.querySelector("#apply-form")?.addEventListener("submit", (event) => saveAdminApply(event));
  box.querySelector("#notice-form")?.addEventListener("submit", (event) => saveAdminNotice(event));
  box.querySelector("#post-form")?.addEventListener("submit", (event) => saveAdminPost(event));
  box.querySelector("#field-form")?.addEventListener("submit", (event) => saveAdminField(event));
  box.querySelector("#apply-search")?.addEventListener("input", (event) => {
    applyFilter.search = event.target.value;
    const cursor = event.target.selectionStart;
    initAdmin();
    const input = document.getElementById("apply-search");
    if (input) {
      input.focus();
      input.setSelectionRange(cursor, cursor);
    }
  });
}

function adminOverview() {
  const recent = applyCache.slice(0, 8);
  const rows = recent.length
    ? recent
        .map((item) => {
          const meta = applyClassMeta(item);
          const status = item.status || "pending";
          return `<tr data-view-apply="${escapeHtml(item.id)}" style="cursor:pointer">
            <td>
              <div class="dash-class">
                <div class="dash-thumb ${meta.tone}">${escapeHtml(meta.label)}</div>
                <div>
                  <b>${escapeHtml(meta.title)}</b>
                  <span>${escapeHtml(applyFieldsSummary(item) || "수업 신청")}</span>
                </div>
              </div>
            </td>
            <td>${formatAdminDate(item.createdAt)}</td>
            <td class="${isApplyUnread(item) ? "apply-unread" : ""}">${escapeHtml(applyDisplayName(item))}</td>
            <td><span class="dash-status is-${escapeHtml(status)}">${applyStatus(status)}</span></td>
          </tr>`;
        })
        .join("")
    : `<tr><td class="empty-row" colspan="4">최근 수업 신청이 없습니다.</td></tr>`;
  return `
    <section class="dash-card">
      <div class="dash-card-head">
        <h2>대시보드 요약</h2>
        <p>수업 신청·회원·Class 현황을 한눈에 확인하세요.</p>
      </div>
      <div class="admin-stats">
        <div class="admin-stat"><span>전체 신청</span><b>${applyCache.length}건</b></div>
        <div class="admin-stat"><span>접수 대기</span><b>${applyCount("pending")}건</b></div>
        <div class="admin-stat"><span>확인 완료</span><b>${applyCount("confirmed")}건</b></div>
        <div class="admin-stat"><span>상담진행중</span><b>${applyCount("counseling")}건</b></div>
        <div class="admin-stat"><span>처리 완료</span><b>${applyCount("done")}건</b></div>
        <div class="admin-stat"><span>가입자 수</span><b>${userCache.length}명</b></div>
        <div class="admin-stat"><span>등록 Class</span><b>${classCache.length}개</b></div>
        <div class="admin-stat"><span>공지사항</span><b>${noticeCache.length}건</b></div>
        <div class="admin-stat"><span>커뮤니티 글</span><b>${postCache.length}건</b></div>
      </div>
    </section>
    <section class="dash-card">
      <div class="dash-card-head"><h2>최근 수업 신청</h2></div>
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>수업 정보</th>
              <th>신청일자</th>
              <th>신청자 정보</th>
              <th>신청상태</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function adminClassPanel(editing) {
  return `
    <div class="profile-card">
      <h2>${editing ? "Class 수정" : "Class 추가"}</h2>
      <form class="admin-form" id="class-form" data-file-url="${escapeHtml(editing?.fileUrl || "")}" data-file-name="${escapeHtml(editing?.fileName || "")}" data-poster-url="${escapeHtml(editing?.posterUrl || "")}">
        <div class="admin-form-row">
          <input required name="label" maxlength="16" placeholder="카테고리 (예: AI, CODE)" value="${escapeHtml(editing?.label || "")}" />
          <select name="tone">
            <option value="live" ${!editing || editing.tone === "live" ? "selected" : ""}>테두리 파랑</option>
            <option value="vod" ${editing?.tone === "vod" ? "selected" : ""}>테두리 초록</option>
            <option value="off" ${editing?.tone === "off" ? "selected" : ""}>테두리 주황</option>
          </select>
        </div>
        <input name="status" placeholder="상태 (예: 온라인 · 진행중)" value="${escapeHtml(editing?.status || "온라인 · 진행중")}" />
        <input required name="title" placeholder="교육 제목" value="${escapeHtml(editing?.title || "")}" />
        <textarea required name="summary" rows="3" placeholder="교육 설명">${escapeHtml(editing?.summary || "")}</textarea>
        <label style="font-size:14px;color:var(--muted)">교육 포스터 이미지 (선택 — 등록하면 Class 목록 카드에 이미지가 통으로 표시됩니다)</label>
        <input type="file" name="poster" accept="image/*" />
        ${
          editing?.posterUrl
            ? `<div><img src="${escapeHtml(API + editing.posterUrl)}" alt="포스터 미리보기" style="max-width:160px;border-radius:12px;margin-top:8px;display:block" /><label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted);margin-top:8px"><input type="checkbox" name="removePoster" /> 현재 포스터 이미지 삭제</label></div>`
            : ""
        }
        <p class="sub">아래는 신청이 <b>승인 완료</b>된 사람만 마이페이지에서 볼 수 있는 강좌 접속 정보예요.</p>
        <input name="linkUrl" placeholder="강좌 링크 (선택, 예: 줌·강의실 주소)" value="${escapeHtml(editing?.linkUrl || "")}" />
        <input type="file" name="file" />
        ${
          editing?.fileName
            ? `<label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)"><input type="checkbox" name="removeFile" /> 현재 첨부 파일(${escapeHtml(editing.fileName)}) 삭제</label>`
            : ""
        }
        <input name="password" placeholder="강좌 비밀번호 (선택, 안내용)" value="${escapeHtml(editing?.password || "")}" />
        <div class="admin-form-actions">
          <button class="btn btn-green" type="submit">${editing ? "수정 저장" : "교육 추가"}</button>
          ${editing ? `<button class="btn btn-line" type="button" data-cancel-class>취소</button>` : ""}
        </div>
      </form>
    </div>
    <div class="profile-card" style="margin-top:20px"><h2>Class 목록</h2>
      ${classCache.map((item) => adminItem(item, `${escapeHtml(item.label || "")} · ${escapeHtml(item.summary || "")}${item.posterUrl ? " · 포스터 등록됨" : ""}${item.linkUrl ? " · 링크 첨부됨" : ""}${item.fileName ? " · 파일 첨부됨" : ""}`, `<div class="admin-item-actions"><button class="btn btn-line" type="button" data-edit-class="${escapeHtml(item.id)}">수정</button><button class="btn btn-orange" type="button" data-delete-class="${escapeHtml(item.id)}">삭제</button></div>`)).join("") || `<p class="sub">등록된 교육이 없습니다.</p>`}
    </div>`;
}

function adminTestPanel(editing) {
  return `
    <div class="profile-card">
      <h2>${editing ? "TEST 수정" : "TEST 추가"}</h2>
      <form class="admin-form" id="test-form" data-file-url="${escapeHtml(editing?.fileUrl || "")}" data-file-name="${escapeHtml(editing?.fileName || "")}">
        <input required name="title" placeholder="TEST 제목" value="${escapeHtml(editing?.title || "")}" />
        <input required name="summary" placeholder="한 줄 소개" value="${escapeHtml(editing?.summary || "")}" />
        <input required name="password" placeholder="입장 비밀번호" value="${escapeHtml(editing?.password || "")}" />
        <textarea name="body" rows="5" placeholder="잠금 해제 후 보여줄 안내 (선택)">${escapeHtml(editing?.body || "")}</textarea>
        <input name="linkUrl" placeholder="외부 링크 (선택, 예: 구글 폼·드라이브 주소)" value="${escapeHtml(editing?.linkUrl || "")}" />
        <input type="file" name="file" />
        ${
          editing?.fileName
            ? `<label style="display:flex;align-items:center;gap:8px;font-size:14px;color:var(--muted)"><input type="checkbox" name="removeFile" /> 현재 첨부 파일(${escapeHtml(editing.fileName)}) 삭제</label>`
            : ""
        }
        <div class="admin-form-actions">
          <button class="btn btn-green" type="submit">${editing ? "수정 저장" : "TEST 추가"}</button>
          ${editing ? `<button class="btn btn-line" type="button" data-cancel-test>취소</button>` : ""}
        </div>
      </form>
    </div>
    <div class="profile-card" style="margin-top:20px"><h2>TEST 목록</h2>
      ${testCache.map((item) => adminItem(item, `${escapeHtml(item.summary || "")}${item.linkUrl ? " · 링크 첨부됨" : ""}${item.fileName ? " · 파일 첨부됨" : ""} · 누적 응시 ${item.unlockCount || 0}회`, `<div class="admin-item-actions"><span class="role-badge admin">${escapeHtml(item.password || "")}</span><button class="btn btn-line" type="button" data-edit-test="${escapeHtml(item.id)}">수정</button><button class="btn btn-orange" type="button" data-delete-test="${escapeHtml(item.id)}">삭제</button></div>`)).join("") || `<p class="sub">등록된 TEST가 없습니다.</p>`}
    </div>`;
}

function applyStatus(status) {
  return { pending: "접수", confirmed: "확인", counseling: "상담진행중", done: "완료" }[status] || "접수";
}

function classOptions(selected) {
  const titles = ["온라인 Class 신청", ...classCache.map((item) => item.title), "TEST 진단"];
  if (selected && !titles.includes(selected)) titles.unshift(selected); // 수업 의뢰처럼 목록에 없는 값도 그대로 보존
  return titles
    .map((title) => `<option ${title === selected ? "selected" : ""}>${escapeHtml(title)}</option>`)
    .join("");
}

function statusSelectOptions(selected) {
  return `
    <option value="pending" ${selected === "pending" ? "selected" : ""}>접수</option>
    <option value="confirmed" ${selected === "confirmed" ? "selected" : ""}>확인</option>
    <option value="counseling" ${selected === "counseling" ? "selected" : ""}>상담진행중</option>
    <option value="done" ${selected === "done" ? "selected" : ""}>완료</option>`;
}

const APPLY_STATUS_TABS = [
  { id: "all", label: "전체" },
  { id: "pending", label: "접수" },
  { id: "confirmed", label: "확인" },
  { id: "counseling", label: "상담진행중" },
  { id: "done", label: "완료" },
];

function isApplyUnread(item) {
  return !item?.viewedAt;
}

async function markApplyViewed(id) {
  const item = applyCache.find((entry) => entry.id === id);
  if (!item || item.viewedAt) return;
  item.viewedAt = new Date().toISOString();
  try {
    await api(`/api/admin/applications/${encodeURIComponent(id)}/viewed`, { method: "POST" });
  } catch (error) {
    console.warn(error.message);
  }
}

function applyRowHtml(item) {
  const summary = `${formatAdminDate(item.createdAt)} · ${escapeHtml(item.type || "")} · ${escapeHtml(applyFieldsSummary(item))}${item.note ? ` · 메모: ${escapeHtml(item.note)}` : ""}`;
  const approved = item.status === "done";
  return `<div class="admin-item" data-view-apply="${escapeHtml(item.id)}" style="cursor:pointer">
    <div><b class="${isApplyUnread(item) ? "apply-unread" : ""}">${escapeHtml(applyDisplayName(item))}</b><p>${summary}</p></div>
    <div class="admin-item-actions">
      <button class="btn ${approved ? "btn-green" : "btn-line"}" type="button" data-quick-approve="${escapeHtml(item.id)}">${approved ? "승인됨" : "승인"}</button>
      <button class="btn btn-line" type="button" data-edit-apply="${escapeHtml(item.id)}">수정</button>
      <button class="btn btn-orange" type="button" data-delete-apply="${escapeHtml(item.id)}">삭제</button>
    </div>
  </div>`;
}

function inquiryResultsListHtml() {
  const list = inquiryApplyCache();
  return list.map(applyRowHtml).join("") || `<p class="sub">접수된 교육신청/문의가 없습니다.</p>`;
}

function applyResultsListHtml() {
  const list = filteredApplyCache();
  const hasAny = applyCache.some((item) => !isInquiryApply(item));
  return (
    list.map((item) => applyRowHtml(item)).join("") ||
    `<p class="sub">${hasAny ? "검색 결과가 없습니다." : "신청 내역이 없습니다."}</p>`
  );
}

function applyDetailHtml(item) {
  const rows = applyFieldCache
    .map((field) => {
      const value = item.values?.[field.id];
      return value ? `<p><b>${escapeHtml(field.label)}</b> ${escapeHtml(value)}</p>` : "";
    })
    .join("");
  return `<div class="profile-card">
    <p class="kicker">${formatAdminDate(item.createdAt)}</p>
    <h2 class="${isApplyUnread(item) ? "apply-unread" : ""}">${escapeHtml(applyDisplayName(item))}</h2>
    <p class="sub">상태: ${applyStatus(item.status)}${item.type ? ` · 신청 교육: ${escapeHtml(item.type)}` : ""}</p>
    <div class="doc-body">${rows || `<p class="sub">등록된 내용이 없습니다.</p>`}</div>
    ${item.note ? `<p style="margin-top:16px"><b>상담 메모</b><br>${escapeHtml(item.note)}</p>` : ""}
    <div style="margin-top:24px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-line" type="button" data-apply-back>목록으로</button>
      <button class="btn btn-line" type="button" data-edit-apply="${escapeHtml(item.id)}">수정</button>
      <button class="btn btn-orange" type="button" data-delete-apply="${escapeHtml(item.id)}">삭제</button>
    </div>
  </div>`;
}

function renderApplyResults() {
  const results = document.getElementById("apply-results");
  if (!results) return;
  results.innerHTML = applyResultsListHtml();
}

function applyEditFormHtml(editing) {
  return `<div class="profile-card">
    <h2>${isInquiryApply(editing) ? "교육신청/문의 수정" : "Class 신청 수정"}</h2>
    <form class="admin-form" id="apply-form">
      ${applyFieldCache.map((field) => applyFieldInputHtml(field, editing?.values?.[field.id] || "")).join("")}
      <div class="admin-form-row">
        <select name="type">${classOptions(editing?.type)}</select>
        <select name="status">${statusSelectOptions(editing?.status || "pending")}</select>
      </div>
      <textarea name="note" rows="3" placeholder="상담 메모 (관리자만 보는 내부 메모)">${escapeHtml(editing?.note || "")}</textarea>
      <div class="admin-form-actions">
        <button class="btn btn-green" type="submit">수정 저장</button>
        <button class="btn btn-line" type="button" data-cancel-apply>취소</button>
      </div>
    </form>
  </div>`;
}

function adminApplyPanel(editing) {
  if (!editing) {
    const viewed = applyCache.find((item) => item.id === viewApplyId && !isInquiryApply(item));
    if (viewed) return applyDetailHtml(viewed);
  }
  return `
    ${editing ? applyEditFormHtml(editing) : ""}
    <div class="profile-card" style="margin-top:20px">
      <h2>Class 신청 내역</h2>
      <input type="text" id="apply-search" placeholder="이름·연락처·메모 검색" value="${escapeHtml(applyFilter.search)}" style="width:100%;margin-top:12px" />
      <div class="tabs" style="margin:14px 0">
        ${APPLY_STATUS_TABS.map((tab) => `<button type="button" class="tab ${applyFilter.status === tab.id ? "active" : ""}" data-apply-filter="${tab.id}">${tab.label}</button>`).join("")}
      </div>
      <div id="apply-results">${applyResultsListHtml()}</div>
    </div>`;
}

function adminFieldsPanel(editing) {
  const viewedInquiry = applyCache.find((item) => item.id === viewApplyId && isInquiryApply(item));
  if (viewedInquiry) return applyDetailHtml(viewedInquiry);
  const editingInquiry = applyCache.find((item) => item.id === editApplyId && isInquiryApply(item));
  return `
    ${editingInquiry ? applyEditFormHtml(editingInquiry) : ""}
    <div class="profile-card">
      <h2>교육신청/문의 목록</h2>
      <p class="sub">상단 "교육신청 / 문의" 버튼으로 접수된 상담·문의 내역입니다.</p>
      <div style="margin-top:12px">${inquiryResultsListHtml()}</div>
    </div>`;
}

function adminNoticePanel(editing) {
  return `
    <div class="profile-card">
      <h2>${editing ? "공지 수정" : "공지 추가"}</h2>
      <form class="admin-form" id="notice-form">
        <input required name="tag" maxlength="8" placeholder="분류 (예: 공지, 안내)" value="${escapeHtml(editing?.tag || "공지")}" />
        <input required name="title" placeholder="제목" value="${escapeHtml(editing?.title || "")}" />
        <textarea required name="body" rows="6" placeholder="내용">${escapeHtml(editing?.body || "")}</textarea>
        <div class="admin-form-actions">
          <button class="btn btn-green" type="submit">${editing ? "수정 저장" : "공지 추가"}</button>
          ${editing ? `<button class="btn btn-line" type="button" data-cancel-notice>취소</button>` : ""}
        </div>
      </form>
    </div>
    <div class="profile-card" style="margin-top:20px"><h2>공지 목록</h2>
      ${noticeCache.map((item) => adminItem(item, `${escapeHtml(item.tag || "")} · ${formatAdminDate(item.createdAt)}`, `<div class="admin-item-actions"><button class="btn btn-line" type="button" data-edit-notice="${escapeHtml(item.id)}">수정</button><button class="btn btn-orange" type="button" data-delete-notice="${escapeHtml(item.id)}">삭제</button></div>`)).join("") || `<p class="sub">등록된 공지가 없습니다.</p>`}
    </div>`;
}

function adminPostPanel(editing) {
  return `
    <div class="profile-card">
      <h2>${editing ? "커뮤니티 글 수정" : "커뮤니티 글 추가"}</h2>
      <form class="admin-form" id="post-form">
        <select name="tag">${["정보", "후기", "FAQ", "질문", "공지"].map((tag) => `<option ${tag === (editing?.tag || "정보") ? "selected" : ""}>${tag}</option>`).join("")}</select>
        <input required name="title" placeholder="제목" value="${escapeHtml(editing?.title || "")}" />
        <textarea required name="body" rows="6" placeholder="내용">${escapeHtml(editing?.body || "")}</textarea>
        <div class="admin-form-actions">
          <button class="btn btn-green" type="submit">${editing ? "수정 저장" : "글 추가"}</button>
          ${editing ? `<button class="btn btn-line" type="button" data-cancel-post>취소</button>` : ""}
        </div>
      </form>
    </div>
    <div class="profile-card" style="margin-top:20px"><h2>커뮤니티 글 목록</h2>
      ${postCache.map((item) => adminItem(item, `${escapeHtml(item.tag || "")} · ${formatAdminDate(item.createdAt)}`, `<div class="admin-item-actions"><button class="btn btn-line" type="button" data-edit-post="${escapeHtml(item.id)}">수정</button><button class="btn btn-orange" type="button" data-delete-post="${escapeHtml(item.id)}">삭제</button></div>`)).join("") || `<p class="sub">등록된 글이 없습니다.</p>`}
    </div>`;
}

function adminUsersPanel() {
  const rows = userCache.length
    ? userCache
        .map((item) => {
          const admin = isAdmin(item);
          return `<tr>
            <td>${escapeHtml(item.name)}</td>
            <td>${formatAdminDate(item.createdAt)}</td>
            <td>${escapeHtml(item.phone || "-")}</td>
            <td>${escapeHtml(item.email)}</td>
            <td><span class="role-badge ${admin ? "admin" : ""}">${admin ? "관리자" : "일반 회원"}</span></td>
            <td style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn ${admin ? "btn-line" : "btn-green"}" type="button" data-role-email="${escapeHtml(item.email)}" data-role-value="${admin ? "user" : "admin"}">${admin ? "일반 회원으로 변경" : "관리자 부여"}</button>
              <button class="btn btn-orange" type="button" data-delete-user="${escapeHtml(item.email)}" data-user-name="${escapeHtml(item.name)}" style="margin-left:auto">삭제</button>
            </td>
          </tr>`;
        })
        .join("")
    : `<tr><td class="empty-row" colspan="6">가입한 회원이 없습니다.</td></tr>`;
  return `<section class="dash-card">
    <div class="dash-card-head"><h2>회원 관리</h2></div>
    <div class="dash-table-wrap">
      <table class="dash-table dash-table-static">
        <thead>
          <tr>
            <th>이름</th>
            <th>가입일자</th>
            <th>전화번호</th>
            <th>메일주소</th>
            <th>회원상태</th>
            <th>관리</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>`;
}

async function saveItem(kind, id, body) {
  try {
    const path = id ? `/api/admin/${kind}/${encodeURIComponent(id)}` : `/api/admin/${kind}`;
    await api(path, { method: id ? "PUT" : "POST", body: JSON.stringify(body) });
    await refreshAccountViews();
  } catch (error) {
    window.alert(error.message);
  }
}

async function saveAdminClass(event) {
  event.preventDefault();
  const form = event.target;
  const id = editClassId;
  editClassId = null;
  adminTab = "class";
  adminNav = "class";
  let fileUrl = form.dataset.fileUrl || "";
  let fileName = form.dataset.fileName || "";
  if (form.removeFile?.checked) {
    fileUrl = "";
    fileName = "";
  }
  const fileInput = form.querySelector('input[name="file"]');
  if (fileInput?.files?.[0]) {
    try {
      const uploaded = await uploadFile(fileInput.files[0], "/api/admin/classes/upload");
      fileUrl = uploaded.fileUrl;
      fileName = uploaded.fileName;
    } catch (error) {
      window.alert(error.message);
      return;
    }
  }
  let posterUrl = form.dataset.posterUrl || "";
  if (form.removePoster?.checked) posterUrl = "";
  const posterInput = form.querySelector('input[name="poster"]');
  if (posterInput?.files?.[0]) {
    try {
      const uploaded = await uploadFile(posterInput.files[0], "/api/admin/classes/upload");
      posterUrl = uploaded.fileUrl;
    } catch (error) {
      window.alert(error.message);
      return;
    }
  }
  await saveItem("classes", id, {
    id,
    label: form.label.value.trim() || "CLASS",
    tone: form.tone.value,
    status: form.status.value.trim() || "온라인 · 진행중",
    title: form.title.value.trim(),
    summary: form.summary.value.trim(),
    posterUrl,
    linkUrl: form.linkUrl.value.trim(),
    fileUrl,
    fileName,
    password: form.password.value.trim(),
  });
}

async function saveAdminApply(event) {
  event.preventDefault();
  const form = event.target;
  const id = editApplyId;
  editApplyId = null;
  adminTab = "apply";
  adminNav = "apply";
  await saveItem("applications", id, { ...Object.fromEntries(new FormData(form)), id });
}

async function quickUpdateApplyStatus(id, status) {
  const item = applyCache.find((entry) => entry.id === id);
  if (!item) return;
  await saveItem("applications", id, { ...item.values, type: item.type, note: item.note || "", status });
}

async function saveAdminField(event) {
  event.preventDefault();
  const form = event.target;
  const id = editFieldId;
  editFieldId = null;
  adminTab = "fields";
  adminNav = "fields";
  const existing = applyFieldCache.find((field) => field.id === id);
  await saveItem("apply-fields", id, {
    id,
    label: form.label.value.trim(),
    type: form.type.value,
    required: form.required.checked,
    options: form.options.value
      .split(",")
      .map((opt) => opt.trim())
      .filter(Boolean),
    order: existing ? existing.order : applyFieldCache.length,
  });
}

async function moveApplyField(id, dir) {
  const sorted = [...applyFieldCache].sort((a, b) => a.order - b.order);
  const idx = sorted.findIndex((field) => field.id === id);
  const swapIdx = idx + dir;
  if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return;
  const current = sorted[idx];
  const target = sorted[swapIdx];
  try {
    await api(`/api/admin/apply-fields/${encodeURIComponent(current.id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...current, order: target.order }),
    });
    await api(`/api/admin/apply-fields/${encodeURIComponent(target.id)}`, {
      method: "PUT",
      body: JSON.stringify({ ...target, order: current.order }),
    });
    await refreshAccountViews();
  } catch (error) {
    window.alert(error.message);
  }
}

async function uploadFile(file, endpoint) {
  const formData = new FormData();
  formData.append("file", file);
  const headers = {};
  if (token()) headers.Authorization = `Bearer ${token()}`;
  let res;
  try {
    res = await fetch(API + endpoint, { method: "POST", headers, body: formData });
  } catch {
    throw new Error("서버에 연결할 수 없습니다.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "파일 업로드에 실패했습니다.");
  return data;
}

async function saveAdminTest(event) {
  event.preventDefault();
  const form = event.target;
  const id = editTestId;
  editTestId = null;
  adminTab = "test";
  adminNav = "test";
  let fileUrl = form.dataset.fileUrl || "";
  let fileName = form.dataset.fileName || "";
  if (form.removeFile?.checked) {
    fileUrl = "";
    fileName = "";
  }
  const fileInput = form.querySelector('input[name="file"]');
  if (fileInput?.files?.[0]) {
    try {
      const uploaded = await uploadFile(fileInput.files[0], "/api/admin/tests/upload");
      fileUrl = uploaded.fileUrl;
      fileName = uploaded.fileName;
    } catch (error) {
      window.alert(error.message);
      return;
    }
  }
  await saveItem("tests", id, {
    id,
    title: form.title.value.trim(),
    summary: form.summary.value.trim(),
    password: form.password.value.trim(),
    body: form.body.value.trim(),
    linkUrl: form.linkUrl.value.trim(),
    fileUrl,
    fileName,
  });
}

async function saveAdminNotice(event) {
  event.preventDefault();
  const form = event.target;
  const id = editNoticeId;
  editNoticeId = null;
  adminTab = "notice";
  adminNav = "notice";
  await saveItem("notices", id, {
    id,
    tag: form.tag.value.trim() || "공지",
    title: form.title.value.trim(),
    body: form.body.value.trim(),
  });
}

async function saveAdminPost(event) {
  event.preventDefault();
  const form = event.target;
  const id = editPostId;
  editPostId = null;
  adminTab = "community";
  adminNav = "community";
  await saveItem("posts", id, {
    id,
    tag: form.tag.value.trim() || "후기",
    title: form.title.value.trim(),
    body: form.body.value.trim(),
  });
}

async function deleteAdminItem(kind, id, list) {
  const item = list.find((entry) => entry.id === id);
  if (!item) return;
  const label = item.title || item.name || item.label || (kind === "applications" ? applyDisplayName(item) : item.id);
  if (!window.confirm(`"${label}"을(를) 삭제할까요?`)) return;
  try {
    await api(`/api/admin/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (kind === "classes" && editClassId === id) editClassId = null;
    if (kind === "tests" && editTestId === id) editTestId = null;
    if (kind === "applications" && editApplyId === id) editApplyId = null;
    if (kind === "applications" && viewApplyId === id) viewApplyId = null;
    if (kind === "notices" && editNoticeId === id) editNoticeId = null;
    if (kind === "posts" && editPostId === id) editPostId = null;
    if (kind === "apply-fields" && editFieldId === id) editFieldId = null;
    await refreshAccountViews();
  } catch (error) {
    window.alert(error.message);
  }
}

async function setUserRole(email, role) {
  try {
    const result = await api(`/api/admin/users/${encodeURIComponent(email)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
    const me = getSession();
    if (me?.email === email) localStorage.setItem("oncodelab-session", JSON.stringify({ ...me, role: result.user.role }));
    await refreshAccountViews();
  } catch (error) {
    window.alert(error.message);
  }
}

async function deleteUser(email, name) {
  if (!window.confirm(`"${name || email}" 회원을 삭제할까요? 계정과 로그인 세션이 즉시 사라지며 되돌릴 수 없습니다.`)) return;
  try {
    await api(`/api/admin/users/${encodeURIComponent(email)}`, { method: "DELETE" });
    await refreshAccountViews();
  } catch (error) {
    window.alert(error.message);
  }
}

function initTests() {
  const box = document.getElementById("test-list");
  if (!box) return;
  if (!testCache.length) {
    box.innerHTML = `<p class="sub">현재 열려 있는 TEST가 없습니다. API 서버가 실행 중인지 확인해 주세요.</p>`;
    return;
  }
  const opened = unlockedIds();
  const bodies = unlockedBodies();
  const admin = isAdmin();
  box.innerHTML = testCache
    .map((item) => {
      const open = admin || opened.includes(item.id);
      const content = admin ? item : bodies[item.id] || {};
      const hasContent = content.body || content.linkUrl || content.fileUrl;
      return `<article class="test-card ${open ? "is-open" : "is-locked"}">
        <div class="test-head"><span class="lock-badge">${open ? "열림" : "잠금"}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p></div>
        ${
          open
            ? `<div class="test-body">
                ${content.body ? `<p>${escapeHtml(content.body)}</p>` : ""}
                ${content.linkUrl ? `<p><a class="btn btn-orange" href="${escapeHtml(content.linkUrl)}" target="_blank" rel="noopener" ${admin ? "" : `data-start-test="${escapeHtml(item.id)}"`}>TEST 시작하기</a></p>` : ""}
                ${content.fileUrl ? `<p><a class="btn btn-line" href="${escapeHtml(API + content.fileUrl)}" target="_blank" rel="noopener" ${admin ? "" : `data-start-test="${escapeHtml(item.id)}"`}>${escapeHtml(content.fileName || "첨부 파일")} 다운로드</a></p>` : ""}
                ${hasContent ? "" : `<p class="sub">등록된 내용이 없습니다.</p>`}
              </div>${admin ? `<p class="test-note">관리자 계정으로 열려 있습니다.</p>` : ""}`
            : `<form class="unlock-form" data-unlock="${escapeHtml(item.id)}"><input type="password" name="code" placeholder="수업에서 받은 비밀번호" autocomplete="off" /><button class="btn btn-green" type="submit">잠금 해제</button><p class="unlock-error" hidden>비밀번호가 올바르지 않습니다.</p></form>`
        }
      </article>`;
    })
    .join("");

  box.querySelectorAll(".unlock-form").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const result = await api(`/api/tests/${encodeURIComponent(form.dataset.unlock)}/unlock`, {
          method: "POST",
          body: JSON.stringify({ password: form.code.value.trim() }),
        });
        if (!unlockedTestIds.includes(form.dataset.unlock)) unlockedTestIds.push(form.dataset.unlock);
        unlockedTestBodies[form.dataset.unlock] = result;
        initTests();
      } catch {
        form.querySelector(".unlock-error").hidden = false;
      }
    });
  });
  box.querySelectorAll("[data-start-test]").forEach((link) => {
    link.addEventListener("click", () => {
      const id = link.dataset.startTest;
      setTimeout(() => lockTest(id), 150);
    });
  });
}

function isTypingInside(container) {
  const active = document.activeElement;
  return active && container.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.tagName === "SELECT");
}

function setupLivePolling() {
  const watchers = [
    { containerId: "class-list", path: "/api/classes", setCache: (v) => (classCache = v), render: () => { renderClassPage(); fillInquiryOptions(); } },
    { containerId: "test-list", path: "/api/tests", setCache: (v) => (testCache = v), render: initTests },
    { containerId: "notice-list", path: "/api/notices", setCache: (v) => (noticeCache = v), render: initNotices },
    { containerId: "community", path: "/api/posts", setCache: (v) => (postCache = v), render: initCommunity },
  ].filter((watcher) => document.getElementById(watcher.containerId));
  if (!watchers.length) return;

  setInterval(async () => {
    for (const watcher of watchers) {
      const container = document.getElementById(watcher.containerId);
      if (!container || isTypingInside(container)) continue;
      let fresh;
      try {
        fresh = await api(watcher.path);
      } catch {
        continue;
      }
      const freshText = JSON.stringify(fresh);
      if (freshText === watcher.lastText) continue;
      watcher.lastText = freshText;
      watcher.setCache(fresh);
      watcher.render();
    }
  }, 5000);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    renderCourses();
    initHeroCarousel();
    setupAuth();
    setupCounselButton();
    setupPosterModal();
    await loadSiteData();
    renderClassPage();
    fillInquiryOptions();
    renderApplyFields();
    initClassSelection();
    initMypage();
    initAdmin();
    initTests();
    initNotices();
    loadBlogReviews().then(() => {
      initCommunity();
      renderHomeReviews();
    });
    initCommunity();
    setupLivePolling();
  } finally {
    hidePageLoading();
  }
});
