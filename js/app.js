(() => {
  const catalog = Array.isArray(window.RUANKAO_CATALOG) ? window.RUANKAO_CATALOG : [];
  const banks = window.RUANKAO_BANKS || {};
  const $ = (sel) => document.querySelector(sel);

  const els = {
    home: $("#homeView"),
    study: $("#studyView"),
    grid: $("#qualGrid"),
    title: $("#brandTitle"),
    sub: $("#brandSub"),
    paper: $("#paperSelect"),
    chapter: $("#chapterSelect"),
    known: $("#statKnown"),
    weak: $("#statWeak"),
    today: $("#statToday"),
    streak: $("#statStreak"),
    remain: $("#statRemain"),
    flash: $("#flash"),
    tag: $("#cardTag"),
    progress: $("#cardProgress"),
    prompt: $("#cardPrompt"),
    answer: $("#cardAnswer"),
    hint: $("#cardHint"),
    reveal: $("#revealBlock"),
    echo: $("#userEcho"),
    composer: $("#composer"),
    userAnswer: $("#userAnswer"),
    btnFlip: $("#btnFlip"),
    btnSkip: $("#btnSkip"),
    btnKnow: $("#btnKnow"),
    btnWeak: $("#btnWeak"),
    btnReport: $("#btnReport"),
    btnReset: $("#btnReset"),
    modal: $("#reportModal"),
    canvas: $("#reportCanvas"),
    btnSave: $("#btnSaveReport"),
    btnClose: $("#btnCloseReport"),
  };

  let level = "高级";
  let qual = null;
  let cards = [];
  let state = null;
  let pool = [];
  let index = 0;
  let flipped = false;
  let current = null;

  function todayKey() {
    const d = new Date();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function storageKey(id) {
    return `ruankao-flash-v2.${id}`;
  }

  function defaultState() {
    return {
      weights: {},
      known: {},
      today: { date: todayKey(), reviewed: 0, known: 0, weak: 0, seen: [], papers: { 综合: 0, 案例: 0, 论文: 0 } },
      streak: 0,
      lastActive: "",
    };
  }

  function loadState(id) {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(storageKey(id)) || "{}");
    } catch {
      raw = {};
    }
    const next = { ...defaultState(), ...raw };
    next.weights = next.weights || {};
    next.known = next.known || {};
    next.streak = next.streak || 0;
    next.lastActive = next.lastActive || "";
    if (!next.today || next.today.date !== todayKey()) {
      next.today = { date: todayKey(), reviewed: 0, known: 0, weak: 0, seen: [], papers: { 综合: 0, 案例: 0, 论文: 0 } };
    }
    next.today.papers = { 综合: 0, 案例: 0, 论文: 0, ...(next.today.papers || {}) };
    next.today.seen = next.today.seen || [];
    return next;
  }

  function saveState() {
    if (!qual) return;
    localStorage.setItem(storageKey(qual.id), JSON.stringify(state));
  }

  function renderHome() {
    const items = catalog.filter((item) => item.level === level);
    els.grid.innerHTML = items.map((item) => {
      const count = (banks[item.id] || []).length;
      const status = item.ready ? `${count} 题 · ${item.sessions}` : `即将上线 · ${item.sessions}`;
      return `<button type="button" class="qual-card${item.ready ? "" : " is-locked"}" data-id="${item.id}" ${item.ready ? "" : "disabled"}>
        <span class="tag">${item.level}</span>
        <strong>${item.name}</strong>
        <small>${status}</small>
      </button>`;
    }).join("");
    els.grid.querySelectorAll(".qual-card:not(.is-locked)").forEach((btn) => {
      btn.addEventListener("click", () => enterStudy(btn.dataset.id));
    });
  }

  function setLevel(next) {
    level = next;
    document.querySelectorAll(".level-tabs button").forEach((btn) => {
      btn.setAttribute("aria-selected", btn.dataset.level === level ? "true" : "false");
    });
    renderHome();
  }

  function chaptersFor(paper) {
    const list = cards.filter((card) => paper === "全部" || card.paper === paper);
    return [...new Set(list.map((card) => card.chapter))];
  }

  function fillChapters() {
    const prev = els.chapter.value;
    const opts = ['<option value="全部">全部章节</option>']
      .concat(chaptersFor(els.paper.value).map((name) => `<option value="${name}">${name}</option>`));
    els.chapter.innerHTML = opts.join("");
    if ([...els.chapter.options].some((opt) => opt.value === prev)) els.chapter.value = prev;
  }

  function weightOf(id) {
    return state.weights[id] ?? 1;
  }

  function buildPool() {
    const paper = els.paper.value;
    const chapter = els.chapter.value;
    const filtered = cards.filter((card) => {
      const paperOk = paper === "全部" || card.paper === paper;
      const chapterOk = chapter === "全部" || card.chapter === chapter;
      return paperOk && chapterOk;
    });
    const expanded = [];
    filtered.forEach((card) => {
      const w = Math.max(1, Math.min(8, Math.round(weightOf(card.id))));
      for (let i = 0; i < w; i++) expanded.push(card);
    });
    for (let i = expanded.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [expanded[i], expanded[j]] = [expanded[j], expanded[i]];
    }
    const seen = new Set();
    pool = [];
    expanded.forEach((card) => {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        pool.push(card);
      }
    });
    index = 0;
  }

  function touchStreakOnReview() {
    const today = todayKey();
    if (state.lastActive === today) return;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yKey = `${y.getFullYear()}-${`${y.getMonth() + 1}`.padStart(2, "0")}-${`${y.getDate()}`.padStart(2, "0")}`;
    state.streak = state.lastActive === yKey ? (state.streak || 0) + 1 : 1;
    state.lastActive = today;
  }

  function updateStats() {
    const knownCount = Object.values(state.known || {}).filter(Boolean).length;
    const weakCount = Object.entries(state.weights || {}).filter(([, w]) => w >= 3).length;
    els.known.textContent = String(knownCount);
    els.weak.textContent = String(weakCount);
    els.today.textContent = String(state.today?.reviewed || 0);
    els.streak.textContent = String(state.streak || 0);
    els.remain.textContent = String(Math.max(0, pool.length - index));
  }

  function placeholderFor(paper) {
    if (paper === "案例") return "先写出你的判断和依据，再对照参考答案";
    if (paper === "论文") return "先写提纲：背景、做法、结果。不必写完整论文";
    return "先用自己的话写出要点，不必与参考答案逐字相同";
  }

  function ensureFlashDom() {
    if (els.prompt && document.body.contains(els.prompt)) return;
    els.flash.classList.add("flash");
    els.flash.innerHTML = `
      <div class="flash-meta">
        <span class="tag" id="cardTag"></span>
        <span id="cardProgress"></span>
      </div>
      <p class="prompt" id="cardPrompt"></p>
      <p class="hint" id="cardHint">先写下答案，再对照参考答案</p>
      <div id="revealBlock" hidden>
        <p class="field-label">你的作答</p>
        <p class="answer mine" id="userEcho"></p>
        <p class="field-label">参考答案</p>
        <p class="answer" id="cardAnswer"></p>
      </div>`;
    els.tag = $("#cardTag");
    els.progress = $("#cardProgress");
    els.prompt = $("#cardPrompt");
    els.answer = $("#cardAnswer");
    els.hint = $("#cardHint");
    els.reveal = $("#revealBlock");
    els.echo = $("#userEcho");
  }

  function syncFlipButton() {
    if (!els.userAnswer) return;
    els.btnFlip.disabled = flipped || !els.userAnswer.value.trim();
  }

  function showCard() {
    flipped = false;
    current = pool[index] || null;
    if (!current) {
      els.flash.innerHTML = `<div class="empty">当前筛选已刷完一轮。<br/>可切换科目或章节，或点「再来一轮」。</div>`;
      els.prompt = null;
      els.btnKnow.disabled = true;
      els.btnWeak.disabled = true;
      els.btnFlip.disabled = true;
      els.btnSkip.disabled = true;
      els.composer.hidden = true;
      updateStats();
      return;
    }
    ensureFlashDom();
    els.tag.textContent = `${current.paper} · ${current.chapter}`;
    els.progress.textContent = `${index + 1} / ${pool.length}`;
    els.prompt.textContent = current.q;
    els.answer.textContent = current.a;
    els.reveal.hidden = true;
    els.hint.hidden = false;
    els.composer.hidden = false;
    els.userAnswer.hidden = false;
    els.userAnswer.value = "";
    els.userAnswer.placeholder = placeholderFor(current.paper);
    els.btnKnow.disabled = true;
    els.btnWeak.disabled = true;
    els.btnSkip.disabled = false;
    syncFlipButton();
    updateStats();
    els.userAnswer.focus();
  }

  function onFlip(force) {
    if (!current || flipped) return;
    const text = els.userAnswer.value.trim();
    if (!text && !force) return;
    flipped = true;
    els.echo.textContent = text || "（未作答）";
    els.reveal.hidden = false;
    els.hint.hidden = true;
    els.composer.hidden = true;
    els.btnKnow.disabled = false;
    els.btnWeak.disabled = false;
    els.btnFlip.disabled = true;
    els.btnSkip.disabled = true;
  }

  function mark(know) {
    if (!current || !flipped) return;
    touchStreakOnReview();
    const id = current.id;
    const prev = weightOf(id);
    if (know) {
      state.weights[id] = Math.max(1, prev - 1);
      state.known[id] = true;
      state.today.known += 1;
    } else {
      state.weights[id] = Math.min(8, prev + 2);
      state.known[id] = false;
      state.today.weak += 1;
    }
    state.today.reviewed += 1;
    const paper = current.paper;
    if (state.today.papers[paper] == null) state.today.papers[paper] = 0;
    state.today.papers[paper] += 1;
    if (!state.today.seen.includes(id)) state.today.seen.push(id);
    saveState();
    index += 1;
    showCard();
  }

  function reshuffle() {
    fillChapters();
    buildPool();
    showCard();
  }

  function resetProgress() {
    if (!qual) return;
    if (!confirm(`清空「${qual.name}」的本地进度？题库本身不会删除。`)) return;
    state = defaultState();
    saveState();
    buildPool();
    showCard();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function publicShareUrl() {
    const configured = String(window.APP_PUBLIC_URL || "").trim();
    if (configured) return configured.endsWith("/") ? configured : `${configured}/`;
    const path = location.pathname.endsWith("/")
      ? location.pathname
      : location.pathname.replace(/[^/]*$/, "");
    return `${location.origin}${path || "/"}`;
  }

  function makeQrCanvas(text, size) {
    return new Promise((resolve, reject) => {
      if (typeof QRCode === "undefined") {
        reject(new Error("QRCode library missing"));
        return;
      }
      try {
        const holder = document.createElement("div");
        holder.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
        document.body.appendChild(holder);
        new QRCode(holder, {
          text,
          width: size,
          height: size,
          colorDark: "#14212b",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel.M,
        });
        const src = holder.querySelector("canvas") || holder.querySelector("img");
        const out = document.createElement("canvas");
        out.width = size;
        out.height = size;
        const octx = out.getContext("2d");
        const finish = () => {
          holder.remove();
          resolve(out);
        };
        if (src && src.tagName === "CANVAS") {
          octx.drawImage(src, 0, 0, size, size);
          finish();
        } else if (src && src.tagName === "IMG") {
          if (src.complete) {
            octx.drawImage(src, 0, 0, size, size);
            finish();
          } else {
            src.onload = () => {
              octx.drawImage(src, 0, 0, size, size);
              finish();
            };
            src.onerror = () => {
              holder.remove();
              reject(new Error("QR image failed"));
            };
          }
        } else {
          holder.remove();
          reject(new Error("QR DOM empty"));
        }
      } catch (err) {
        reject(err);
      }
    });
  }

  async function drawReport() {
    const canvas = els.canvas;
    const ctx = canvas.getContext("2d");
    const W = 720;
    const H = 960;
    canvas.width = W;
    canvas.height = H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#efe6d6");
    g.addColorStop(0.45, "#f7f3ea");
    g.addColorStop(1, "#e4eee8");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#cbbfaa";
    ctx.lineWidth = 2;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.fillStyle = "#14212b";
    ctx.font = "46px 'ZCOOL XiaoWei', 'Noto Serif SC', serif";
    ctx.fillText("软考题库 · 今日战报", 72, 118);
    ctx.fillStyle = "#3a4a57";
    ctx.font = "22px 'Sora', 'Noto Sans SC', sans-serif";
    ctx.fillText(todayKey(), 72, 164);
    ctx.fillText(`${qual.level} · ${qual.name}`, 72, 200);

    const knownCount = Object.values(state.known || {}).filter(Boolean).length;
    const weakCount = Object.entries(state.weights || {}).filter(([, w]) => w >= 3).length;
    const papers = state.today.papers || {};
    const rows = [
      ["今日综合知识", `${papers.综合 || 0} 张`],
      ["今日案例分析", `${papers.案例 || 0} 张`],
      ["今日论文", `${papers.论文 || 0} 张`],
      ["累计掌握", `${knownCount} / ${cards.length}`],
      ["薄弱待补", `${weakCount} 张`],
      ["连续打卡", `${state.streak || 0} 天`],
    ];
    const rowH = 78;
    const rowGap = 8;
    rows.forEach(([k, v], i) => {
      const boxY = 230 + i * (rowH + rowGap);
      ctx.fillStyle = i % 2 === 0 ? "rgba(255,253,248,0.92)" : "rgba(231,242,237,0.85)";
      roundRect(ctx, 72, boxY, W - 144, rowH, 14);
      ctx.fill();
      ctx.fillStyle = "#3a4a57";
      ctx.font = "24px 'Sora', 'Noto Sans SC', sans-serif";
      ctx.fillText(k, 96, boxY + 48);
      ctx.fillStyle = "#0f6e56";
      ctx.font = "700 28px 'Sora', 'Noto Sans SC', sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(v, W - 96, boxY + 50);
      ctx.textAlign = "left";
    });

    const shareUrl = publicShareUrl();
    const qrSize = 128;
    const qrX = W - 72 - qrSize;
    const qrY = H - 72 - qrSize - 8;
    try {
      const qrCanvas = await makeQrCanvas(shareUrl, qrSize);
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
      ctx.fill();
      ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
    } catch {
      ctx.fillStyle = "#ffffff";
      roundRect(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 10);
      ctx.fill();
      ctx.strokeStyle = "#cbbfaa";
      ctx.strokeRect(qrX, qrY, qrSize, qrSize);
      ctx.fillStyle = "#3a4a57";
      ctx.font = "16px 'Sora', 'Noto Sans SC', sans-serif";
      ctx.fillText("二维码", qrX + 36, qrY + 68);
    }

    ctx.fillStyle = "#3a4a57";
    ctx.font = "20px 'Sora', 'Noto Sans SC', sans-serif";
    ctx.fillText("不会的题会提高再次抽中概率 · 数据仅存本机", 72, H - 118);
    ctx.fillText("扫码继续刷题 · 码上创 · 软考题库", 72, H - 82);
  }

  async function openReport() {
    await drawReport();
    els.modal.hidden = false;
  }

  function closeReport() {
    els.modal.hidden = true;
  }

  async function saveReport() {
    await drawReport();
    const a = document.createElement("a");
    a.download = `软考题库-${qual.name}-今日战报-${todayKey()}.png`;
    a.href = els.canvas.toDataURL("image/png");
    a.click();
  }

  function enterStudy(id) {
    qual = catalog.find((item) => item.id === id);
    cards = banks[id] || [];
    if (!qual || !qual.ready || !cards.length) return;
    state = loadState(id);
    els.title.textContent = qual.name;
    els.sub.textContent = `${qual.level} · ${qual.sessions} · ${cards.length} 题`;
    els.home.hidden = true;
    els.study.hidden = false;
    els.paper.value = "全部";
    fillChapters();
    els.chapter.value = "全部";
    buildPool();
    showCard();
  }

  function backHome() {
    qual = null;
    els.home.hidden = false;
    els.study.hidden = true;
    els.title.textContent = "软考题库";
    els.sub.textContent = "先选等级，再选资格。高级五科可直接开刷。";
    closeReport();
  }

  document.querySelectorAll(".level-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => setLevel(btn.dataset.level));
  });
  $("#btnBack").addEventListener("click", backHome);
  els.paper.addEventListener("change", () => {
    fillChapters();
    els.chapter.value = "全部";
    buildPool();
    showCard();
  });
  els.chapter.addEventListener("change", () => {
    buildPool();
    showCard();
  });
  els.userAnswer.addEventListener("input", syncFlipButton);
  els.userAnswer.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      onFlip(false);
    }
  });
  els.btnFlip.addEventListener("click", () => onFlip(false));
  els.btnSkip.addEventListener("click", () => onFlip(true));
  els.btnKnow.addEventListener("click", (e) => {
    e.stopPropagation();
    mark(true);
  });
  els.btnWeak.addEventListener("click", (e) => {
    e.stopPropagation();
    mark(false);
  });
  $("#btnShuffle").addEventListener("click", () => {
    buildPool();
    showCard();
  });
  els.btnReport.addEventListener("click", openReport);
  els.btnReset.addEventListener("click", resetProgress);
  els.btnSave.addEventListener("click", saveReport);
  els.btnClose.addEventListener("click", closeReport);
  els.modal.addEventListener("click", (e) => {
    if (e.target === els.modal) closeReport();
  });

  renderHome();
})();
