/* ================================================================
   蒲公英星球 · 前端逻辑（原生 JS，无构建）
   与后端 app.js 配套使用
================================================================ */
"use strict";

/* ---------- 状态 ---------- */
const S = {
  token: localStorage.getItem("sv_planet_token") || "",
  user: null,
  view: "plaza",
  plazaSort: "hot",
  plazaPage: 1,
  plazaHasMore: false,
  soupPage: 1,
  soupHasMore: false,
  qs: new URLSearchParams(location.search),
  pendingArch: null,
  seenViews: {},
};

const $ = (sel, root) => (root || document).querySelector(sel);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtTime = (ts) => {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60 * 1000) return "刚刚";
  if (diff < 3600 * 1000) return Math.floor(diff / 60000) + " 分钟前";
  if (diff < 24 * 3600 * 1000) return Math.floor(diff / 3600000) + " 小时前";
  if (diff < 7 * 24 * 3600 * 1000) return Math.floor(diff / 86400000) + " 天前";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
};
const confirmBox = (msg, onOk) => {
  const ov = document.createElement("div");
  ov.className = "confirm-ov";
  ov.innerHTML = `<div class="confirm-card"><p>${esc(msg)}</p><div class="confirm-row">
    <button class="btn btn-sm btn-ghost" data-c="no">取消</button>
    <button class="btn btn-sm btn-pri" data-c="ok">确认</button></div></div>`;
  ov.addEventListener("click", (e) => {
    if (e.target.dataset.c === "no" || e.target === ov) ov.remove();
    else if (e.target.dataset.c === "ok") { ov.remove(); onOk(); }
  });
  document.body.appendChild(ov);
};

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const headers = { "Content-Type": "application/json" };
  if (S.token) headers.Authorization = "Bearer " + S.token;
  /* PHP 单入口：/api/xxx?a=b -> api.php?r=/api/xxx&a=b */
  const [pp, qq] = String(path).split("?");
  const url = "api.php?r=" + encodeURIComponent(pp) + (qq ? "&" + qq : "");
  const res = await fetch(url, { ...opts, headers });
  let data = {};
  try { data = await res.json(); } catch (e) { /* noop */ }
  if (!res.ok) {
    if (data && data.needLogin) { S.token = ""; localStorage.removeItem("sv_planet_token"); refreshUserBox(); }
    const e = new Error(data && data.msg ? data.msg : "请求失败（" + res.status + "）");
    e.status = res.status; e.data = data;
    throw e;
  }
  return data;
}
const get = (p) => api(p);
const post = (p, b) => api(p, { method: "POST", body: JSON.stringify(b || {}) });
const del = (p) => api(p, { method: "DELETE" });

/* ---------- 登录态 ---------- */
async function refreshUserBox() {
  const uName = $("#uName"), btnLogout = $("#btnLogout"), btnLogin = $("#btnLogin");
  if (S.token) {
    try {
      const me = await get("/api/me");
      S.user = me;
      uName.textContent = me.username;
      uName.hidden = false;
      btnLogout.hidden = false;
      btnLogin.hidden = true;
      return;
    } catch (e) { /* token 失效则继续走未登录 */ }
    S.token = ""; localStorage.removeItem("sv_planet_token"); S.user = null;
  }
  uName.hidden = true; btnLogout.hidden = true; btnLogin.hidden = false;
}
function logout() {
  S.token = ""; S.user = null;
  localStorage.removeItem("sv_planet_token");
  localStorage.removeItem("sv_planet_user");
  refreshUserBox();
  route();
}

/* ---------- 路由 ---------- */
function route() {
  const h = location.hash || "#plaza";
  const m = h.match(/^#profile\/(\d+)/);
  if (m) return renderProfile(parseInt(m[1], 10));
  const t = h.replace("#", "");
  S.view = ["plaza", "soup", "mine", "archives", "login"].includes(t) ? t : "plaza";
  document.querySelectorAll(".topnav a").forEach((a) => a.classList.toggle("on", a.dataset.tab === S.view));
  if (S.view === "plaza") renderPlaza();
  else if (S.view === "soup") renderSoup();
  else if (S.view === "mine") renderMine();
  else if (S.view === "archives") renderArchives();
  else renderAuth();
}

/* ---------- 主站跳转参数（?test=&score=&level= / ?mode=archive&...） ---------- */
function consumeQSParams() {
  const test = S.qs.get("test");
  const score = S.qs.get("score");
  const level = S.qs.get("level");
  const mode = S.qs.get("mode");
  if (mode === "archive" || (mode === "archive")) {
    S.pendingArch = { test, score, level };
  } else if (test) {
    S.pendingPublish = { test, score, level };
  }
  if (S.pendingArch || S.pendingPublish) {
    history.replaceState(null, "", location.pathname);
  }
}

/* ================================================================
   视图：登录 / 注册
================================================================ */
function renderAuth() {
  const app = $("#app");
  app.innerHTML = `
  <div class="auth-card">
    <div class="auth-tabs">
      <button data-at="login" class="on" id="atLogin">登录</button>
      <button data-at="reg" id="atReg">注册</button>
    </div>
    <div id="authForm">
      <div class="field"><label>账号</label><input id="au" maxlength="20" placeholder="请输入中文或英文账号" autocomplete="username"></div>
      <div class="field"><label>密码</label><input id="ap" type="password" maxlength="64" placeholder="6-64 位，不能是纯数字" autocomplete="current-password"></div>
      <button class="btn btn-pri" id="aSubmit" style="width:100%;margin-top:6px">登录</button>
      <p class="err" id="aErr"></p>
      <p class="ok-msg" id="aOk"></p>
    </div>
    <div class="auth-note" id="authNote" hidden>
      注册规则：账号只允许<b>中文或英文、禁止数字</b>（纯中文 2-12 字 / 纯英文 3-20 位 / 中英混合 2-20 位）；
      密码 6-64 位、不能是纯数字；同一网络 5 分钟内最多注册 5 次。注册即代表内容可公开分享。
    </div>
  </div>`;
  const atLogin = $("#atLogin"), atReg = $("#atReg");
  const au = $("#au"), ap = $("#ap"), aErr = $("#aErr"), aOk = $("#aOk");
  const note = $("#authNote");
  let mode = "login";
  const setMode = (m) => {
    mode = m;
    atLogin.classList.toggle("on", m === "login");
    atReg.classList.toggle("on", m === "reg");
    note.hidden = m !== "reg";
    $("#aSubmit").textContent = m === "login" ? "登录" : "注册";
    aErr.style.display = "none"; aOk.style.display = "none";
  };
  atLogin.onclick = () => setMode("login");
  atReg.onclick = () => setMode("reg");
  $("#aSubmit").onclick = async () => {
    const username = au.value.trim(), password = ap.value;
    if (!username || !password) return (aErr.textContent = "请填写账号和密码", aErr.style.display = "block");
    aErr.style.display = "none"; aOk.style.display = "none";
    try {
      const r = mode === "login" ? await post("/api/login", { username, password }) : await post("/api/register", { username, password });
      S.token = r.token; S.user = { id: r.id, username: r.username };
      localStorage.setItem("sv_planet_token", r.token);
      localStorage.setItem("sv_planet_user", r.username);
      refreshUserBox();
      if (mode === "reg") {
        aOk.textContent = "注册成功，欢迎来到蒲公英星球！";
        aOk.style.display = "block";
        setTimeout(() => { aOk.style.display = "none"; setMode("login"); au.value = ""; ap.value = ""; }, 1200);
      } else {
        route();
      }
    } catch (e) {
      aErr.textContent = e.message;
      aErr.style.display = "block";
    }
  };
}

/* ================================================================
   通用：日记卡片 HTML
================================================================ */
function dcardHtml(d, extraBtn) {
  const badges = [];
  if (d.type === "soup") badges.push('<span class="badge soup">心灵鸡汤</span>');
  if (d.visibility === "followers") badges.push('<span class="badge followers">仅关注者可见</span>');
  const mineDel = d.isMine ? `<button class="btn btn-sm btn-warn" data-del-diary="${d.id}">删除</button>` : "";
  return `
  <div class="dcard" data-did="${d.id}">
    <div class="dcard-head">
      <span class="avatar">${esc((d.username || "?").slice(0, 1).toUpperCase())}</span>
      <span class="who" data-profile="${d.userId || ""}">${esc(d.username)}</span>
      <span class="when">${fmtTime(d.createdAt)}</span>
      ${badges.join("")}
      <span class="spacer"></span>
      <div class="dcard-actions">${mineDel}${extraBtn || ""}</div>
    </div>
    <div class="content">${esc(d.content)}</div>
    <div class="dcard-stats">
      <span class="stat">👁 <span class="v-${d.id}">${d.views}</span> 观看</span>
      <span class="stat cmt-toggle" data-cmt-toggle="${d.id}" style="cursor:pointer">💬 ${d.commentCount} 评论</span>
      <span class="spacer"></span>
      <span class="muted">${d.type === "soup" ? "鸡汤" : "心情日记"}</span>
    </div>
    <div class="cmt-box" id="cmt-${d.id}" hidden></div>
  </div>`;
}

/* 加载评论并渲染 */
async function loadComments(did, box, silent) {
  try {
    const r = await get("/api/diary/" + did);
    const d = r.diary, cms = r.comments;
    if (silent && !box.hidden) return;
    let html = "";
    if (cms.length) {
      html = cms.map((c) => `
        <div class="cmt-item">
          <span class="avatar" style="width:26px;height:26px;font-size:12px">${esc(c.username.slice(0, 1).toUpperCase())}</span>
          <div class="cmt-body">
            <div class="cmt-who" data-profile="${c.userId}">${esc(c.username)} <span style="color:var(--ink-3);font-weight:400">${fmtTime(c.createdAt)}</span></div>
            <div class="cmt-txt">${esc(c.content)}</div>
          </div>
          ${c.isMine ? `<button class="btn btn-sm btn-warn" data-del-cmt="${c.id}" style="flex:none">删</button>` : ""}
        </div>`).join("");
    } else {
      html = '<div class="muted" style="font-size:12.5px;margin-bottom:6px">还没有评论</div>';
    }
    if (S.token && d.allowComment) {
      html += `<div class="cmt-input"><input maxlength="50" placeholder="写评论（2-50 字）" data-cmt-input="${did}"><button class="btn btn-sm btn-pri" data-cmt-send="${did}">发送</button></div>`;
    } else if (!S.token) {
      html += `<div class="muted" style="font-size:12.5px"><a href="#login" style="color:var(--brand)">登录后评论</a></div>`;
    } else if (!d.allowComment) {
      html += `<div class="muted" style="font-size:12.5px">作者关闭了评论</div>`;
    }
    box.innerHTML = html;
    box.hidden = false;
    box.dataset.loaded = "1";
    /* 计数观看（前端按日记去重，24 小时内只计一次） */
    const key = "sv_v_" + did;
    if (!localStorage.getItem(key)) {
      post("/api/diary/" + did + "/view").catch(() => {});
      localStorage.setItem(key, "1");
      const vEl = $(".v-" + did);
      if (vEl) vEl.textContent = parseInt(vEl.textContent || "0", 10) + 1;
    }
  } catch (e) {
    if (!silent) toast(e.message);
  }
}

/* 发送评论 */
async function sendComment(did, input) {
  const c = input.value.trim();
  if (c.length < 2) return toast("评论至少 2 字");
  if (c.length > 50) return toast("评论最多 50 字");
  try {
    await post("/api/diary/" + did + "/comment", { content: c });
    input.value = "";
    const box = $("#cmt-" + did);
    await loadComments(did, box, false);
    const toggler = document.querySelector(`[data-cmt-toggle="${did}"]`);
    if (toggler) {
      const t = toggler.textContent.match(/(\d+)/);
      toggler.textContent = "💬 " + (t ? parseInt(t[1], 10) + 1 : 1) + " 评论";
    }
    toast("评论已发布");
  } catch (e) {
    toast(e.message);
  }
}

/* 事件委托：全局点击 */
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-cmt-toggle]");
  if (t) {
    const did = t.dataset.cmtToggle;
    const box = $("#cmt-" + did);
    if (box.hidden || !box.dataset.loaded) loadComments(did, box, false);
    else box.hidden = true;
    return;
  }
  const send = e.target.closest("[data-cmt-send]");
  if (send) {
    const did = send.dataset.cmtSend;
    const input = document.querySelector(`[data-cmt-input="${did}"]`);
    if (input) sendComment(did, input);
    return;
  }
  const delD = e.target.closest("[data-del-diary]");
  if (delD) {
    const did = delD.dataset.delDiary;
    confirmBox("确定删除这篇内容吗？删除后不可恢复（可随时自由删除自己的内容）。", async () => {
      try { await del("/api/diary/" + did); toast("已删除"); route(); }
      catch (err) { toast(err.message); }
    });
    return;
  }
  const delC = e.target.closest("[data-del-cmt]");
  if (delC) {
    const cid = delC.dataset.delCmt;
    const did = delC.closest(".cmt-box").id.replace("cmt-", "");
    confirmBox("删除这条评论？", async () => {
      try { await del("/api/comment/" + cid); await loadComments(did, $("#cmt-" + did), false); toast("已删除评论"); }
      catch (err) { toast(err.message); }
    });
    return;
  }
  const prof = e.target.closest("[data-profile]");
  if (prof && prof.dataset.profile) {
    location.hash = "#profile/" + prof.dataset.profile;
    return;
  }
  const tag = e.target.closest("[data-tag]");
  if (tag) {
    S.archTag = tag.dataset.tag;
    route();
  }
});

/* ================================================================
   视图：广场（登录墙）
================================================================ */
function renderPlaza() {
  const app = $("#app");
  if (!S.token) {
    app.innerHTML = `
    <div class="login-wall card" style="border-style:dashed">
      <div class="wall-ic">🌿</div>
      <h1>星球蒲公英广场</h1>
      <p>广场内容仅对登录用户开放。<br>登录后即可浏览大家的分享、观看与评论，也可以在蒲公英星球上认识志同道合的朋友。</p>
      <button class="btn btn-pri" id="wallLogin">登录 / 注册后观看</button>
    </div>`;
    $("#wallLogin").onclick = () => { location.hash = "#login"; };
    return;
  }
  const pub = S.pendingPublish ? `
    <div class="pub-box">
      <textarea id="pubContent" maxlength="500" placeholder="此刻的心情是？分享给星球上的朋友…"></textarea>
      <div class="pub-row">
        <label><input type="checkbox" id="pubVis" checked> 公开（所有人可见）</label>
        <label><input type="checkbox" id="pubCmt" checked> 允许评论</label>
        <span class="spacer"></span>
        <span class="counter" id="pubCnt">0 / 500</span>
        <button class="btn btn-pri" id="pubSend">发布</button>
      </div>
      <div class="muted" style="margin-top:10px">💡 检测到你刚完成的测评：<b>${esc(S.pendingPublish.test)}</b>（${esc(S.pendingPublish.score || "")} · ${esc(S.pendingPublish.level || "")}）。发布后公开到广场，别人可以看到并评论。</div>
    </div>` : `
    <div class="pub-box">
      <textarea id="pubContent" maxlength="500" placeholder="此刻的心情是？分享给星球上的朋友…"></textarea>
      <div class="pub-row">
        <label><input type="checkbox" id="pubVis" checked> 公开（所有人可见）</label>
        <label><input type="checkbox" id="pubCmt" checked> 允许评论</label>
        <span class="spacer"></span>
        <span class="counter" id="pubCnt">0 / 500</span>
        <button class="btn btn-pri" id="pubSend">发布</button>
      </div>
    </div>`;
  app.innerHTML = `
  <div class="plaza-bar">
    <h1>星球蒲公英广场</h1>
    <div class="seg">
      <button data-sort="hot" class="on">推荐</button>
      <button data-sort="new">最新</button>
    </div>
    <span class="muted" style="margin-left:auto">广场内容公开可见 · 可随时自由删除</span>
  </div>
  ${pub}
  <div id="plazaList"></div>
  <div class="pager"><button class="btn btn-ghost" id="plazaMore" hidden>加载更多</button></div>`;

  /* 发布 */
  const pc = $("#pubContent");
  if (S.pendingPublish) {
    pc.value = "刚完成了测评：" + S.pendingPublish.test + "（" + (S.pendingPublish.score || "") + " · " + (S.pendingPublish.level || "") + "）\n";
    pc.focus();
    /* 延迟清除：避免 hashchange 二次渲染把预填覆盖掉 */
    const pp = S.pendingPublish;
    setTimeout(() => { if (S.pendingPublish === pp) S.pendingPublish = null; }, 120);
  }
  pc.addEventListener("input", () => { $("#pubCnt").textContent = pc.value.length + " / 500"; });
  $("#pubSend").onclick = async () => {
    const content = pc.value.trim();
    if (!content) return toast("写点内容再发布吧");
    if (content.length > 500) return toast("内容最多 500 字");
    try {
      await post("/api/diary", { content, type: "diary", visibility: $("#pubVis").checked ? "public" : "followers", allowComment: $("#pubCmt").checked });
      toast("已发布到广场");
      pc.value = ""; $("#pubCnt").textContent = "0 / 500";
      S.plazaPage = 1;
      loadPlaza(true);
    } catch (e) { toast(e.message); }
  };

  /* 排序 */
  document.querySelectorAll("[data-sort]").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("[data-sort]").forEach((x) => x.classList.remove("on"));
      b.classList.add("on");
      S.plazaSort = b.dataset.sort;
      S.plazaPage = 1;
      loadPlaza(true);
    };
  });

  $("#plazaMore").onclick = () => { S.plazaPage++; loadPlaza(false); };
  loadPlaza(true);
}

async function loadPlaza(reset) {
  const listEl = $("#plazaList");
  if (reset) { listEl.innerHTML = '<div class="loading">加载中…</div>'; }
  try {
    const r = await get(`/api/plaza?type=diary&sort=${S.plazaSort}&page=${S.plazaPage}&size=10`);
    if (reset) listEl.innerHTML = "";
    if (!r.list.length) {
      if (reset) listEl.innerHTML = '<div class="empty">广场还很安静，来发布第一篇吧 🌱</div>';
    }
    r.list.forEach((d) => { listEl.insertAdjacentHTML("beforeend", dcardHtml(d)); });
    $("#plazaMore").hidden = !r.hasMore;
  } catch (e) {
    if (reset) listEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ================================================================
   视图：心灵鸡汤（免登录浏览，登录可发布/评论）
================================================================ */
function renderSoup() {
  const app = $("#app");
  const pub = S.token ? `
    <div class="pub-box">
      <textarea id="soupContent" maxlength="500" placeholder="分享一句温暖的话，治愈星球上的某个人…"></textarea>
      <div class="pub-row">
        <span class="counter" id="soupCnt">0 / 500</span>
        <span class="spacer"></span>
        <button class="btn btn-pri" id="soupSend">发布鸡汤</button>
      </div>
    </div>` : `
    <div class="pub-box" style="text-align:center">
      <p class="muted" style="margin-bottom:10px">💛 登录后即可发布心灵鸡汤，分享温暖</p>
      <button class="btn btn-sm btn-pri" id="soupGoLogin">登录 / 注册</button>
    </div>`;
  app.innerHTML = `
  <div class="plaza-bar">
    <h1>心灵鸡汤</h1>
    <span class="muted" style="margin-left:auto">免登录可浏览 · 登录可发布与评论</span>
  </div>
  ${pub}
  <div id="soupList"></div>
  <div class="pager"><button class="btn btn-ghost" id="soupMore" hidden>加载更多</button></div>`;
  const sb = $("#soupGoLogin");
  if (sb) sb.onclick = () => { location.hash = "#login"; };
  const sc = $("#soupContent");
  if (sc) sc.addEventListener("input", () => { $("#soupCnt").textContent = sc.value.length + " / 500"; });
  const ss = $("#soupSend");
  if (ss) ss.onclick = async () => {
    const content = sc.value.trim();
    if (!content) return toast("写点内容再发布吧");
    if (content.length > 500) return toast("内容最多 500 字");
    try {
      await post("/api/diary", { content, type: "soup", visibility: "public", allowComment: true });
      toast("鸡汤已发布");
      sc.value = ""; $("#soupCnt").textContent = "0 / 500";
      S.soupPage = 1;
      loadSoup(true);
    } catch (e) { toast(e.message); }
  };
  $("#soupMore").onclick = () => { S.soupPage++; loadSoup(false); };
  loadSoup(true);
}

async function loadSoup(reset) {
  const listEl = $("#soupList");
  if (reset) listEl.innerHTML = '<div class="loading">加载中…</div>';
  try {
    const r = await get(`/api/plaza?type=soup&sort=new&page=${S.soupPage}&size=10`);
    if (reset) listEl.innerHTML = "";
    if (!r.list.length) {
      if (reset) listEl.innerHTML = '<div class="empty">还没有鸡汤，来温暖第一句吧 🌞</div>';
    }
    r.list.forEach((d) => { listEl.insertAdjacentHTML("beforeend", dcardHtml(d)); });
    $("#soupMore").hidden = !r.hasMore;
  } catch (e) {
    if (reset) listEl.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ================================================================
   视图：我的私人日记
================================================================ */
function renderMine() {
  const app = $("#app");
  if (!S.token) {
    app.innerHTML = `
    <div class="login-wall card" style="border-style:dashed">
      <div class="wall-ic">📔</div>
      <h1>我的私人日记</h1>
      <p>登录后查看你保存的云端日记，可随时自由删除。</p>
      <button class="btn btn-pri" id="wallLogin2">登录 / 注册</button>
    </div>`;
    $("#wallLogin2").onclick = () => { location.hash = "#login"; };
    return;
  }
  app.innerHTML = `
  <h1>我的私人日记</h1>
  <p class="sub">云端长期保存 · 可随时自由删除</p>
  <div id="mineList"></div>`;
  (async () => {
    try {
      const r = await get("/api/mine/diaries");
      const el = $("#mineList");
      if (!r.list.length) {
        el.innerHTML = '<div class="empty">还没有日记。去广场写第一篇，或从测评结果页"发布到心情日记"保存吧 🌱</div>';
        return;
      }
      r.list.forEach((d) => {
        const isSoup = d.type === "soup";
        const badges = [isSoup ? '<span class="badge soup">心灵鸡汤</span>' : '<span class="badge">心情日记</span>',
                        d.visibility === "followers" ? '<span class="badge followers">仅关注者可见</span>' : '<span class="badge">公开</span>'];
        el.insertAdjacentHTML("beforeend", `
        <div class="dcard">
          <div class="dcard-head">
            <span class="avatar">${esc((S.user.username || "?").slice(0, 1).toUpperCase())}</span>
            <span class="who">${esc(S.user.username)}</span>
            <span class="when">${fmtTime(d.createdAt)}</span>
            ${badges.join("")}
            <span class="spacer"></span>
            <button class="btn btn-sm btn-warn" data-del-diary="${d.id}">删除</button>
          </div>
          <div class="content">${esc(d.content)}</div>
          <div class="dcard-stats">
            <span class="stat">👁 ${d.views} 观看</span>
            <span class="stat">💬 ${d.commentCount} 评论</span>
          </div>
        </div>`);
      });
    } catch (e) {
      $("#mineList").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  })();
}

/* ================================================================
   视图：测评档案
================================================================ */
function renderArchives() {
  const app = $("#app");
  if (!S.token) {
    app.innerHTML = `
    <div class="login-wall card" style="border-style:dashed">
      <div class="wall-ic">🧭</div>
      <h1>测评档案</h1>
      <p>登录后把测评结果长期保存在云端，可随时自由删除，也可在名片上选择公开。</p>
      <button class="btn btn-pri" id="wallLogin3">登录 / 注册</button>
    </div>`;
    $("#wallLogin3").onclick = () => { location.hash = "#login"; };
    return;
  }
  app.innerHTML = `
  <h1>测评档案</h1>
  <p class="sub">云端长期保存 · 可随时自由删除 · 可在名片选择公开或仅关注者可见</p>
  <div id="archList"></div>`;
  (async () => {
    try {
      const r = await get("/api/archives");
      const el = $("#archList");
      if (!r.list.length) {
        el.innerHTML = '<div class="empty">还没有测评档案。在测评结果页勾选"保存到云端"，或从结果页跳转过来即可保存 🧭</div>';
        return;
      }
      r.list.forEach((a) => {
        el.insertAdjacentHTML("beforeend", `
        <div class="card" style="padding:14px 18px">
          <div class="arch-row" style="border:none;padding:0">
            <div>
              <div class="arch-test">${esc(a.test)}</div>
              <div class="arch-meta">${esc(a.level || "—")}${a.visibility === "followers" ? " · 仅关注者可见" : " · 公开"}</div>
            </div>
            <span class="arch-score">${esc(a.score || "")}</span>
            <span class="muted" style="margin-left:auto">${fmtTime(a.createdAt)}</span>
            <button class="btn btn-sm btn-warn" data-del-arch="${a.id}">删除</button>
          </div>
        </div>`);
      });
    } catch (e) {
      $("#archList").innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  })();
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-del-arch]");
  if (b) {
    const id = b.dataset.delArch;
    confirmBox("删除这份测评档案？删除后不可恢复（可随时自由删除）。", async () => {
      try { await del("/api/archive/" + id); toast("已删除"); renderArchives(); }
      catch (err) { toast(err.message); }
    });
  }
});

/* ================================================================
   视图：蒲公英名片（用户主页 + 关注 + 按测评找同类）
================================================================ */
async function renderProfile(uid) {
  const app = $("#app");
  app.innerHTML = '<div class="loading">加载名片…</div>';
  try {
    const r = await get("/api/profile/" + uid);
    const u = r.user;
    /* 测评标签聚合（找同类） */
    const tags = {};
    r.archives.forEach((a) => { tags[a.test] = (tags[a.test] || 0) + 1; });
    const tagList = Object.keys(tags).sort((x, y) => tags[y] - tags[x]);
    const activeTag = S.archTag && tags[S.archTag] ? S.archTag : null;
    const archs = activeTag ? r.archives.filter((a) => a.test === activeTag) : r.archives;
    const followBtn = !u.isSelf
      ? `<button class="btn ${u.following ? "btn-ghost" : "btn-pri"}" id="followBtn">${u.following ? "已关注" : "关注"}</button>`
      : "";
    app.innerHTML = `
    <div class="profile-head">
      <span class="avatar">${esc(u.username.slice(0, 1).toUpperCase())}</span>
      <div>
        <div class="pname">${esc(u.username)}</div>
        <div class="pmeta">加入于 ${fmtTime(u.createdAt)}</div>
      </div>
      <div class="pstats">
        <span>关注 <b>${u.followingCount}</b></span>
        <span>粉丝 <b>${u.followers}</b></span>
        <span>日记 <b>${r.diaries.length}</b></span>
        <span>档案 <b>${r.archives.length}</b></span>
      </div>
      <span class="spacer"></span>
      ${followBtn}
    </div>
    ${tagList.length ? `
    <div class="card">
      <h3>按测评找同类</h3>
      <div class="tag-row">
        <button class="tag ${!activeTag ? "on" : ""}" data-tag="__all">全部</button>
        ${tagList.map((t) => `<button class="tag ${activeTag === t ? "on" : ""}" data-tag="${esc(t)}">${esc(t)}（${tags[t]}）</button>`).join("")}
      </div>
    </div>` : ""}
    <h3 style="margin:18px 0 10px">公开日记与鸡汤</h3>
    <div id="pfDiaries">${r.diaries.length ? r.diaries.map((d) => dcardHtml({ ...d, userId: u.id, username: u.username, isMine: u.isSelf })).join("") : '<div class="empty">还没有公开内容</div>'}</div>
    ${archs.length ? `
    <h3 style="margin:18px 0 10px">测评档案（${activeTag ? esc(activeTag) : "全部"}）</h3>
    ${archs.map((a) => `
      <div class="card" style="padding:12px 18px">
        <div class="arch-row" style="border:none;padding:0">
          <div>
            <div class="arch-test">${esc(a.test)}</div>
            <div class="arch-meta">${esc(a.level || "—")}</div>
          </div>
          <span class="arch-score">${esc(a.score || "")}</span>
          <span class="muted" style="margin-left:auto">${fmtTime(a.createdAt)}</span>
        </div>
      </div>`).join("")}` : ""}
    `;
    const fb = $("#followBtn");
    if (fb) fb.onclick = async () => {
      try {
        if (u.following) { await del("/api/follow/" + uid); u.following = false; }
        else { await post("/api/follow/" + uid); u.following = true; }
        renderProfile(uid);
      } catch (e) { toast(e.message); }
    };
  } catch (e) {
    app.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* ================================================================
   初始化
================================================================ */
async function init() {
  consumeQSParams();
  if (!S.token) {
    const u = localStorage.getItem("sv_planet_user");
    if (u) S.user = { username: u };
  }
  await refreshUserBox();
  /* 顶栏按钮 */
  $("#btnLogin").onclick = () => { location.hash = "#login"; };
  $("#btnLogout").onclick = () => logout();
  /* 主站带参数：mode=archive 直接去档案页 */
  if (S.pendingArch) {
    location.hash = "#archives";
  } else if (S.pendingPublish) {
    location.hash = "#plaza";
  }
  window.addEventListener("hashchange", route);
  route();
  /* 主站跳转预填档案 */
  if (S.pendingArch) {
    setTimeout(() => {
      const el = $("#app");
      const body = el.querySelector("h1");
      if (body && !$("#archQuick")) {
        el.insertAdjacentHTML("afterbegin", `
        <div class="card" id="archQuick" style="border-color:var(--brand)">
          <h3>💾 保存本次测评到云端档案</h3>
          <p class="muted" style="margin-bottom:12px">测评：<b>${esc(S.pendingArch.test || "")}</b> · ${esc(S.pendingArch.score || "")} · ${esc(S.pendingArch.level || "")}<br>可随时在「测评档案」里自由删除。</p>
          <button class="btn btn-pri" id="archSave">保存到档案</button>
          <button class="btn btn-ghost" id="archSkip">暂不保存</button>
        </div>`);
        $("#archSave").onclick = async () => {
          try {
            await post("/api/archive", { test: S.pendingArch.test, score: S.pendingArch.score, level: S.pendingArch.level, visibility: "public" });
            toast("已保存到云端档案");
            S.pendingArch = null;
            $("#archQuick").remove();
            renderArchives();
          } catch (e) { toast(e.message); }
        };
        $("#archSkip").onclick = () => { S.pendingArch = null; $("#archQuick").remove(); };
      }
    }, 50);
  }
}
init();
