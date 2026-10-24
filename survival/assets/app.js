/* Offline Survival Library — renders data/*.json.
   No frameworks, no build step, no network after first load.
   Everything is escaped before it touches innerHTML. */
(() => {
  "use strict";

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const trim = (str, n) => {
    const t = String(str);
    if (t.length <= n) return t;
    const cut = t.slice(0, n);
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 18)) + "…";
  };
  const host = (u) => { try { return new URL(u, location.href).hostname.replace(/^www\./, ""); } catch { return u; } };
  const fmtDate = (d) => {
    if (!d) return "—";
    const [y, m, dd] = String(d).split("-").map(Number);
    if (!y) return String(d);
    return new Date(Date.UTC(y, (m || 1) - 1, dd || 1)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  const getJSON = (p) => fetch(p, { cache: "no-cache" }).then((r) => {
    if (!r.ok) throw new Error(`${p} → HTTP ${r.status}`);
    return r.json();
  });

  const VIEWS = ["plan", "skills", "shelf", "recipes", "tools", "drill", "print"];
  const state = { view: null, data: {}, index: [] };
  let dlg = null;

  /* ------------------------------------------------------------------ boot */
  Promise.all([
    getJSON("data/setup.json"),
    getJSON("data/skills.json"),
    getJSON("data/shelf.json"),
    getJSON("data/recipes.json"),
    getJSON("data/drill.json"),
    getJSON("data/print.json")
  ]).then(([setup, skills, shelf, recipes, drill, print]) => {
    state.data = { setup, skills, shelf, recipes, drill, print };
    renderPlan(setup);
    renderSkills(skills);
    renderShelf(shelf);
    renderRecipes(recipes);
    renderDrill(drill);
    renderPrint(print);
    buildSearch();
    initDialogs();
    initNav();
    initNight();
    initCalculators();
    initPrint();
    updateDates();
    route(true);
  }).catch((err) => {
    const main = $("main");
    if (main) main.insertAdjacentHTML("afterbegin",
      `<div class="sheet"><div class="callout warn" style="margin-top:24px">
        <h3>Could not load the library data</h3>
        <p>${esc(err.message)}</p>
        <p class="small">This page reads its content from <code>data/*.json</code>, and browsers block that on a <code>file://</code> address. Serve the folder over HTTP — for example <code>python3 -m http.server 8765</code> — and reload.</p>
      </div></div>`);
  });

  /* ------------------------------------------------------------------ plan */
  function renderPlan(setup) {
    $("#setupIntro").textContent = setup.intro;
    $("#setupDevice").textContent = setup.device;

    const total = setup.steps.length;
    $("#steps").innerHTML = setup.steps.map((s) => `
      <article class="step" id="${esc(s.id)}">
        <div class="step-no"><b>${esc(String(s.n).padStart(2, "0"))}</b><span>${esc(s.minutes)} min</span></div>
        <div class="step-body">
          <h3>${esc(s.title)}</h3>
          <div class="step-meta"><span>Step ${esc(s.n)} of ${total}</span><span>${esc(s.minutes)} minutes</span></div>
          <p class="why">${esc(s.why)}</p>
          <div class="path"><b>Where</b>${s.path.map((p) => `<span>${esc(p)}</span>`).join("<i>›</i>")}</div>
          <ol class="do">${s.do.map((d) => `<li>${esc(d)}</li>`).join("")}</ol>
          <div class="watch">
            <h4>What usually goes wrong</h4>
            <ul>${s.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
          </div>
          <div class="done"><b>Done when</b><span>${esc(s.done)}</span></div>
        </div>
      </article>`).join("");

    $("#afterBox").innerHTML = `
      <h3>${esc(setup.after.title)}</h3>
      <p>${esc(setup.after.body)}</p>
      <ul class="plain" style="margin-top:10px">${setup.after.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`;

    const picks = ["water", "fire", "pantry"];
    $("#quickPicks").innerHTML = picks.map((id) => {
      const k = (state.data.skills?.skills || []).find((x) => x.id === id);
      if (!k) return "";
      return `<article class="skill">
        <figure class="skill-fig"><img src="${esc(k.image)}" alt="${esc(k.image_alt || "")}" loading="lazy" width="1100" height="738"><span class="no">Start here</span></figure>
        <div class="skill-body">
          <h3>${esc(k.title)}</h3>
          <p class="small" style="margin:0;color:var(--ink-soft)">${esc(trim(k.why, 116))}</p>
          <div class="skill-foot"><span>${esc(k.time)}</span><button class="btn small" type="button" data-skill="${esc(k.id)}">Open card →</button></div>
        </div>
      </article>`;
    }).join("");
    $$("[data-skill]").forEach((b) => b.addEventListener("click", () => navigate(`#skill/${b.dataset.skill}`)));

    $("#heroStats").innerHTML = [
      [setup.steps.length, "setup steps"],
      [state.data.skills ? state.data.skills.skills.length : 10, "field skills"],
      [state.data.recipes ? state.data.recipes.recipes.length : 10, "pantry recipes"],
      [state.data.shelf ? state.data.shelf.docs.length : 11, "shelf items"],
      [0, "accounts needed"]
    ].map(([n, l]) => `<div><b>${esc(n)}</b><span>${esc(l)}</span></div>`).join("");
  }

  /* ---------------------------------------------------------------- skills */
  function renderSkills(skills) {
    const t = skills.triage;
    $("#triage").innerHTML = `
      <h3>${esc(t.title)}</h3>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px;margin-top:12px">
        ${t.steps.map((s) => `<div><div class="mono" style="color:var(--orange);margin-bottom:4px">${esc(String(s.n).padStart(2, "0"))} — ${esc(s.t)}</div><p class="small" style="margin:0;color:var(--ink-soft)">${esc(s.d)}</p></div>`).join("")}
      </div>`;

    $("#skillGrid").innerHTML = skills.skills.map((s) => {
      const fig = s.image
        ? `<figure class="skill-fig"><img src="${esc(s.image)}" alt="${esc(s.image_alt || "")}" loading="lazy" width="1100" height="738"><span class="no">${esc(String(s.n).padStart(2, "0"))}</span></figure>`
        : `<div class="skill-fig flat"><span class="no">${esc(String(s.n).padStart(2, "0"))}</span><span class="flat-no" aria-hidden="true">${esc(String(s.n).padStart(2, "0"))}</span><span class="flat-tag">Card only · no picture</span></div>`;
      return `<article class="skill">
        ${fig}
        <div class="skill-body">
          <div class="skill-tags">${s.tags.map((g, i) => `<span class="chip${i === 0 ? " hot" : ""}">${esc(g)}</span>`).join("")}</div>
          <h3>${esc(s.title)}</h3>
          <p class="small" style="margin:0;color:var(--ink-soft)">${esc(trim(s.why, 132))}</p>
          <div class="skill-foot">
            <span>${esc(s.time)}</span>
            <button class="btn small" type="button" data-skill="${esc(s.id)}">Open card →</button>
          </div>
        </div>
      </article>`;
    }).join("");

    $$("[data-skill]").forEach((b) => b.addEventListener("click", () => navigate(`#skill/${b.dataset.skill}`)));
  }

  function initDialogs() {
    dlg = document.createElement("dialog");
    dlg.className = "sheetdlg";
    dlg.setAttribute("aria-labelledby", "dlgTitle");
    document.body.appendChild(dlg);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) closeDlg(); });
    dlg.addEventListener("close", () => {
      if (location.hash.startsWith("#skill/")) { try { history.replaceState(null, "", `${location.pathname}#skills`); } catch { /* file:// */ } }
    });
  }

  function openSkill(id) {
    const s = (state.data.skills?.skills || []).find((x) => x.id === id);
    if (!s || !dlg) return;

    dlg.innerHTML = `
      <div class="dlg-head">
        <div>
          <div class="mono" style="color:var(--orange);margin-bottom:4px">Card ${esc(String(s.n).padStart(2, "0"))} · ${esc(s.time)} · ${esc(s.level)}</div>
          <h3 id="dlgTitle">${esc(s.title)}</h3>
          <div class="skill-tags" style="margin-top:8px">${s.tags.map((g, i) => `<span class="chip${i === 0 ? " hot" : ""}">${esc(g)}</span>`).join("")}</div>
        </div>
        <button class="dlg-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="dlg-body">
        ${s.image ? `<figure style="margin:0 0 18px"><img src="${esc(s.image)}" alt="${esc(s.image_alt || "")}" style="width:100%;height:auto;border:1px solid var(--line);border-radius:4px"></figure>` : ""}
        <p class="lead" style="font-size:1.02rem">${esc(s.why)}</p>
        <h4 class="mono" style="color:var(--ink-faint);margin:18px 0 8px">Gather</h4>
        <ul class="plain">${s.gear.map((g) => `<li>${esc(g)}</li>`).join("")}</ul>
        <h4 class="mono" style="color:var(--ink-faint);margin:22px 0 10px">Do it in this order</h4>
        <ol class="do">${s.steps.map((st) => `<li><strong>${esc(st.t)}.</strong> ${esc(st.d)}</li>`).join("")}</ol>
        <div class="watch"><h4>What usually goes wrong</h4><ul>${s.watch.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>
        <div class="done"><b>Done when</b><span>${esc(s.done)}</span></div>
        <h4 class="mono" style="color:var(--ink-faint);margin:22px 0 8px">Sources</h4>
        <ul class="plain">${s.sources.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a></li>`).join("")}</ul>
        <p class="small muted" style="margin-top:16px">Checked ${esc(fmtDate(state.data.skills.updated))}. If this card and a current official guide disagree, the guide wins.</p>
        <p style="margin:18px 0 0"><button class="btn ghost" type="button" data-dlg-close>Close</button></p>
      </div>`;

    dlg.querySelector(".dlg-close").addEventListener("click", closeDlg);
    const cb = dlg.querySelector("[data-dlg-close]");
    if (cb) cb.addEventListener("click", closeDlg);
    if (!dlg.open) dlg.showModal();
    const body = dlg.querySelector(".dlg-body");
    if (body) body.scrollTop = 0;
  }

  function closeDlg() {
    if (dlg && dlg.open) dlg.close();
  }

  /* ----------------------------------------------------------------- shelf */
  function renderShelf(shelf) {
    $("#tierGuide").innerHTML = shelf.tier_guide.map((t) => `
      <div class="card"><div class="card-pad">
        <div class="mono" style="color:var(--orange);margin-bottom:6px">${esc(t.name)}</div>
        <div class="mono small muted" style="margin-bottom:8px">${esc(t.range)}</div>
        <p class="small" style="margin:0;color:var(--ink-soft)">${esc(t.desc)}</p>
      </div></div>`).join("");

    $("#shelfNote").textContent = shelf.note;

    const tiers = ["all", ...shelf.tier_guide.map((t) => t.id)];
    $("#tierBar").innerHTML = tiers.map((t) => `<button type="button" data-tier="${esc(t)}" aria-pressed="${t === "all"}">${t === "all" ? "All tiers" : "Tier " + esc(t)}</button>`).join("");

    const licClass = Object.fromEntries((shelf.licence_key || []).map((l) => [l.class, l]));

    const draw = (filter) => {
      const docs = shelf.docs.filter((d) => filter === "all" || String(d.tier) === String(filter));
      $("#docList").innerHTML = docs.map((d) => {
        const l = licClass[d.license_class] || { label: d.license_class, meaning: "" };
        const links = [`<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.url_label || host(d.url))} ↗</a>`]
          .concat((d.alt_urls || []).map((a) => `<a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.label)} ↗</a>`))
          .join("");
        return `<article class="doc" id="doc-${esc(d.id)}">
          <div class="doc-tier"><b>T${esc(d.tier)}</b><span>${esc(["pocket", "core", "depth", "world"][d.tier] || "tier " + d.tier)}</span></div>
          <div class="doc-body">
            <div class="doc-top">
              <div>
                <h3>${esc(d.title)}</h3>
                <div class="doc-kicker">${esc(d.kicker)}${d.pages ? ` · ${esc(d.pages)} pp` : ""}${d.size_note ? ` · ${esc(d.size_note)}` : ""}</div>
              </div>
              <span class="lic ${esc(d.license_class)}" title="${esc(l.meaning)}">${esc(l.label)}</span>
            </div>
            <p class="doc-what">${esc(d.what)}</p>
            <p class="doc-why">${esc(d.why)}</p>
            <div class="doc-links">${links}<span class="mono muted small" style="margin-left:auto">checked ${esc(fmtDate(d.checked))}</span></div>
            <p class="doc-caveat"><strong>Read this first:</strong> ${esc(d.caveat)}</p>
          </div>
        </article>`;
      }).join("");
    };

    draw("all");
    $$("#tierBar button").forEach((b) => b.addEventListener("click", () => {
      $$("#tierBar button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw(b.dataset.tier);
    }));

    $("#heldOut").innerHTML = shelf.held_out.map((h) => `
      <div class="held">
        <div class="mono">${esc(h.title)} — ${esc(h.by)}</div>
        <p class="small" style="margin:6px 0">${esc(h.reason)}</p>
        <p class="small" style="margin:0"><strong>What to do:</strong> ${esc(h.action)} ${h.contact ? `· <a href="mailto:${esc(h.contact)}">${esc(h.contact)}</a>` : ""}</p>
      </div>`).join("");

    $("#licenceBody").innerHTML = shelf.licence_key.map((l) => `
      <tr><td><span class="lic ${esc(l.class)}">${esc(l.label)}</span></td><td>${esc(l.meaning)}</td></tr>`).join("");
  }

  /* --------------------------------------------------------------- recipes */
  function renderRecipes(recipes) {
    const cats = recipes.categories;
    $("#recipeBar").innerHTML = cats.map((c) => `<button type="button" data-cat="${esc(c.id)}" aria-pressed="${c.id === "all"}">${esc(c.label)}</button>`).join("");

    const draw = (cat) => {
      const list = recipes.recipes.filter((r) => cat === "all" || r.cat === cat);
      $("#recipeGrid").innerHTML = list.map((r) => `
        <article class="recipe" id="rec-${esc(r.id)}">
          <div class="recipe-head">
            <div class="kicker">${esc(r.kicker)}</div>
            <h3>${esc(r.title)}</h3>
            <p class="small" style="margin:0;color:var(--ink-soft)">${esc(r.why)}</p>
          </div>
          <div class="recipe-facts">
            <div><b>${esc(r.serves)}</b><span>serves</span></div>
            <div><b>${esc(r.time)}</b><span>time</span></div>
            <div><b>${esc(r.fuel)}</b><span>fuel</span></div>
            <div><b>${esc(r.water)}</b><span>water</span></div>
            <div><b>${esc(r.kcal)}</b><span>energy</span></div>
          </div>
          <div class="recipe-body">
            <ul class="ing">${r.ingredients.map((i) => `<li><q>${esc(i.q)}</q><span>${esc(i.item)}</span></li>`).join("")}</ul>
            <ol class="rec-steps">${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
            <div class="notes">
              <h4>Notes and substitutions</h4>
              <ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
            </div>
            <p class="src">Source: <a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.label)}</a></p>
          </div>
        </article>`).join("");
    };

    draw("all");
    $$("#recipeBar button").forEach((b) => b.addEventListener("click", () => {
      $$("#recipeBar button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      draw(b.dataset.cat);
    }));
  }

  /* ----------------------------------------------------------------- drill */
  function renderDrill(drill) {
    $("#drillLede").textContent = drill.drill.lede;
    $("#drillPhases").innerHTML = drill.drill.phases.map((p) => `
      <div class="card"><div class="card-pad">
        <div class="mono" style="color:var(--orange);margin-bottom:10px">${esc(p.name)}</div>
        <ul class="plain">${p.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      </div></div>`).join("");

    $("#drillPass").innerHTML = `<h4 class="mono" style="color:var(--ok)">Pass condition</h4><p style="margin:0">${esc(drill.drill.pass)}</p>`;

    $("#unknownBody").innerHTML = drill.unknowns.map((u) => `
      <tr><td><strong>${esc(u.claim)}</strong></td><td><span class="lic ${u.status === "Unconfirmed" || u.status === "Unmeasured" || u.status === "Not tested" || u.status === "No" ? "free-check" : "verify"}">${esc(u.status)}</span></td><td>${esc(u.detail)}</td></tr>`).join("");

    $("#rotationBody").innerHTML = drill.rotation.map((r) => `<tr><td class="mono small">${esc(r.every)}</td><td>${esc(r.task)}</td><td class="small muted">${esc(r.owner)}</td></tr>`).join("");

    $("#logTemplate").textContent = drill.log_template;
    $("#copyLog").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(drill.log_template);
        toast("Log template copied");
      } catch {
        const r = document.createRange();
        r.selectNodeContents($("#logTemplate"));
        const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
        toast("Selected — press ⌘C or Ctrl-C");
      }
    });
  }

  /* ----------------------------------------------------------------- print */
  function renderPrint(print) {
    $("#printPack").innerHTML = print.cards.map((c) => `
      <div class="pcard">
        <h3>${esc(c.title)} <span>${esc(c.code)}</span></h3>
        <div class="big">${esc(c.big)}</div>
        <div class="mono small muted" style="margin:2px 0 10px">${esc(c.biglabel)}</div>
        <dl>${c.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
      </div>`).join("");

    const ct = print.contacts;
    $("#printContacts").innerHTML = `
      <h3>${esc(ct.title)} <span>${esc(ct.code)}</span></h3>
      <div style="font-family:var(--mono);font-size:.8rem;line-height:2.1">
        ${ct.lines.map((l) => `<div>${esc(l)}</div>`).join("")}
      </div>`;
  }

  function initPrint() {
    $("#printBtn").addEventListener("click", () => window.print());
  }

  /* ----------------------------------------------------------- calculators */
  const FRACTIONS = [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, "1"]];

  // 8 drops of bleach ≈ 1/8 tsp, so one teaspoon is about 64 drops.
  function tspLabel(teaspoons) {
    if (!isFinite(teaspoons) || teaspoons <= 0) return "less than a drop";
    if (teaspoons >= 1) {
      const n = Math.round(teaspoons * 10) / 10;
      return `${Number.isInteger(n) ? n : n.toFixed(1)} tsp`;
    }
    const hit = FRACTIONS.find(([v]) => Math.abs(v - teaspoons) < 0.02);
    if (hit) return `${hit[1]} tsp`;
    return `${teaspoons.toFixed(2)} tsp`;
  }

  function initCalculators() {
    const wOut = $("#w-out");
    const waterCalc = () => {
      const amt = parseFloat($("#w-amount").value);
      const unit = $("#w-unit").value;
      const cloudy = $("#w-cloud").value === "cloudy";
      const names = { gal: "gallon", qt: "quart", l: "litre" };
      if (!isFinite(amt) || amt <= 0) {
        wOut.innerHTML = `<b>—</b><span>Enter an amount of water.</span>`;
        return;
      }
      const gal = unit === "gal" ? amt : unit === "qt" ? amt / 4 : amt / 3.785;
      const perGal = cloudy ? 16 : 8;
      const safeDrops = Math.max(1, Math.round(perGal * gal));
      wOut.innerHTML = `
        <b>${safeDrops} drop${safeDrops === 1 ? "" : "s"} of bleach</b>
        <span>for ${amt} ${names[unit]}${amt === 1 ? "" : "s"} of ${cloudy ? "cloudy" : "clear"} water — that is about ${tspLabel(safeDrops / 64)}.</span>
        <span>Stir well, then wait <strong>30 minutes</strong> before drinking. It should smell faintly of chlorine; if it does not, repeat the dose once and wait 15 more minutes.</span>
        <span class="fine">Dose: 8 drops per gallon of clear water, 16 if cloudy, murky or very cold (CDC). Use plain unscented 5–9% sodium hypochlorite only. Filter sediment first. Water contaminated with fuel or chemicals cannot be disinfected at all.</span>`;
    };
    ["w-amount", "w-unit", "w-cloud"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", waterCalc);
      el.addEventListener("change", waterCalc);
    });
    waterCalc();

    const eOut = $("#e-out");
    const elevCalc = () => {
      const amt = parseFloat($("#e-amount").value);
      const unit = $("#e-unit").value;
      const ft = unit === "ft" ? amt : amt * 3.28084;
      if (!isFinite(ft) || ft < 0) {
        eOut.innerHTML = `<b>—</b><span>Enter an elevation.</span>`;
        return;
      }
      const boil = ft > 6500 ? 3 : 1;
      const add = ft <= 1000 ? 0 : ft <= 3000 ? 5 : ft <= 6000 ? 10 : 15;
      const bpF = 212 - 1.83 * (ft / 1000);
      const bpC = ((bpF - 32) * 5) / 9;
      eOut.innerHTML = `
        <b>Boil ${boil} minute${boil === 1 ? "" : "s"}</b>
        <span>Rolling boil for drinking water at ${Math.round(ft).toLocaleString()} ft (${Math.round(ft * 0.3048).toLocaleString()} m).</span>
        <span>Water boils at roughly ${bpF.toFixed(0)}°F / ${bpC.toFixed(0)}°C here${ft > 2000 ? ", so everything cooks a little slower and needs a little more water" : ""}.</span>
        <span><strong>Canning:</strong> add ${add === 0 ? "nothing" : add + " minutes"} to a tested water-bath process time at this altitude.</span>
        <span class="fine">CDC uses 6,500 ft for the 3-minute boil; EPA's page says 5,000 ft. Boiling longer costs fuel, not safety. Pressure canning needs its own altitude table — this only covers water-bath times.</span>`;
    };
    ["e-amount", "e-unit"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", elevCalc);
      el.addEventListener("change", elevCalc);
    });
    elevCalc();

    const sOut = $("#s-out");
    const stockCalc = () => {
      const people = Math.max(1, parseInt($("#s-people").value, 10) || 1);
      const days = Math.max(1, parseInt($("#s-days").value, 10) || 1);
      const kcal = parseInt($("#s-kcal").value, 10);
      const water = people * days;
      const totalCal = people * days * kcal;
      const split = [
        ["Rice", 0.40, 1600],
        ["Dry beans or lentils", 0.25, 1500],
        ["Oats", 0.10, 1700],
        ["Oil or fat", 0.10, 4000],
        ["Cans, jars and extras", 0.15, 600]
      ];
      sOut.innerHTML = `
        <b>${water} gallons of water</b>
        <span>${(water * 3.785).toFixed(0)} litres · about ${(water * 8.34).toFixed(0)} lb to carry and store.</span>
        <span><strong>${totalCal.toLocaleString()} kcal</strong> for ${people} ${people === 1 ? "person" : "people"} × ${days} days.</span>
        <span style="margin-top:8px">${split.map(([n, share, perLb]) => `· ${n}: <strong>${Math.max(1, Math.round((totalCal * share) / perLb))} lb</strong>`).join("<br>")}</span>
        <span class="fine">Estimates only, assuming adults at rest and a varied diet. Ready.gov's floor is 1 gallon per person per day and a 3-day food supply; two weeks is better. Children, illness, cold weather and hard work all raise these numbers.</span>`;
    };
    ["s-people", "s-days", "s-kcal"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", stockCalc);
      el.addEventListener("change", stockCalc);
    });
    stockCalc();

    const bOut = $("#b-out");
    const bottleCalc = () => {
      const gal = Math.max(0, parseFloat($("#b-gal").value) || 0);
      const oz = parseFloat($("#b-size").value);
      const count = Math.ceil((gal * 128) / oz);
      const lb = gal * 8.34;
      bOut.innerHTML = `
        <b>${count.toLocaleString()} container${count === 1 ? "" : "s"}</b>
        <span>${gal} gallons · ${(gal * 3.785).toFixed(1)} litres · ${lb.toFixed(0)} lb / ${(lb * 0.4536).toFixed(0)} kg.</span>
        <span>Store low, cool and dark. Rotate once a year, and label the fill date on each container.</span>
        <span class="fine">Buying bottled water is the easiest start, but it is expensive and bulky. Food-grade jugs and a filled bathtub (for washing, not drinking) extend the same supply.</span>`;
    };
    ["b-gal", "b-size"].forEach((id) => {
      const el = document.getElementById(id);
      el.addEventListener("input", bottleCalc);
      el.addEventListener("change", bottleCalc);
    });
    bottleCalc();
  }

  /* ---------------------------------------------------------------- night */
  function initNight() {
    const btn = $("#nightBtn");
    const label = $("#nightLabel");
    const saved = (() => { try { return localStorage.getItem("osl-theme"); } catch { return null; } })();

    const apply = (mode) => {
      document.documentElement.classList.remove("night", "day");
      if (mode === "night") document.documentElement.classList.add("night");
      if (mode === "day") document.documentElement.classList.add("day");
      btn.setAttribute("aria-pressed", String(mode === "night"));
      label.textContent = mode === "night" ? "Red light" : "Night";
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", mode === "night" ? "#0a0a08" : "#3f4a33");
      try { localStorage.setItem("osl-theme", mode); } catch { /* private mode */ }
    };

    apply(saved || "auto");
    btn.addEventListener("click", () => {
      apply(document.documentElement.classList.contains("night") ? "day" : "night");
    });
  }

  /* --------------------------------------------------------------- search */
  function buildSearch() {
    const { setup, skills, shelf, recipes } = state.data;
    const idx = [];

    setup.steps.forEach((s) => idx.push({
      kind: "Setup step", title: `${s.n}. ${s.title}`, sub: `${s.minutes} min · ${s.path.join(" › ")}`,
      hash: `#plan/${s.id}`, keys: [s.id],
      text: [s.title, s.why, s.do.join(" "), s.watch.join(" "), s.path.join(" ")].join(" ")
    }));

    skills.skills.forEach((s) => idx.push({
      kind: "Skill", title: s.title, sub: `${s.time} · ${s.tags.join(", ")}`,
      hash: `#skill/${s.id}`, keys: [s.id, ...s.tags],
      text: [s.title, s.why, s.tags.join(" "), s.gear.join(" "), s.steps.map((x) => x.t + " " + x.d).join(" "), s.watch.join(" ")].join(" ")
    }));

    recipes.recipes.forEach((r) => idx.push({
      kind: "Recipe", title: r.title, sub: `${r.serves} · ${r.time}`,
      hash: `#recipe/${r.id}`, keys: [r.id, r.cat, r.kicker],
      text: [r.title, r.kicker, r.why, r.ingredients.map((i) => i.item).join(" "), r.steps.join(" "), r.notes.join(" ")].join(" ")
    }));

    shelf.docs.forEach((d) => idx.push({
      kind: `Shelf · Tier ${d.tier}`, title: d.title, sub: d.kicker,
      hash: `#shelf/${d.id}`, keys: [d.id, d.kind],
      text: [d.title, d.kicker, d.what, d.why, d.license].join(" ")
    }));

    state.index = idx.map((e) => ({ ...e, hay: e.text.toLowerCase() }));
  }

  function initSearch() {
    const input = $("#q");
    const box = $("#results");
    let timer = null;

    const render = () => {
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
      const terms = q.split(/\s+/);
      const rank = { Skill: 0, Recipe: 1, "Setup step": 2 };
      const hits = state.index
        .filter((e) => terms.every((t) => e.hay.includes(t)))
        .map((e) => {
          const title = e.title.toLowerCase();
          const sub = String(e.sub || "").toLowerCase();
          let score = 0;
          terms.forEach((t) => {
            if (title === t) score += 100;
            else if (title.startsWith(t)) score += 60;
            else if (title.includes(t)) score += 40;
            else if (sub.includes(t)) score += 16;
            const hits = Math.min(6, e.hay.split(t).length - 1);
            score += hits * 2;
          });
          const keys = (e.keys || []).map((k) => String(k).toLowerCase());
          terms.forEach((t) => { if (keys.some((k) => k === t || k.startsWith(t))) score += 80; });
          score += { Skill: 6, Recipe: 4 }[e.kind] ?? (e.kind.startsWith("Shelf") ? 2 : 0);
          score -= rank[e.kind] ?? 0;
          return { e, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 12)
        .map((x) => x.e);
      box.innerHTML = hits.length
        ? hits.map((h) => `<a href="${esc(h.hash)}" role="option"><span class="r-kind">${esc(h.kind)}</span><span class="r-title">${esc(h.title)}</span><span class="r-sub">${esc(h.sub || "")}</span></a>`).join("")
        : `<div class="empty">Nothing under “${esc(input.value.trim())}”. Try <a href="#skills/water">water</a>, <a href="#recipes/canned-tomatoes">canning</a> or <a href="#skills/fire">fire</a>.</div>`;
      box.hidden = false;
    };

    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(render, 120); });
    input.addEventListener("focus", render);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { box.hidden = true; input.blur(); }
      if (e.key === "Enter") {
        const first = box.querySelector("a");
        if (first) { e.preventDefault(); navigate(first.getAttribute("href")); box.hidden = true; input.blur(); }
      }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".searchbox")) box.hidden = true;
    });
    box.addEventListener("click", () => { box.hidden = true; input.value = ""; });
  }

  /* ---------------------------------------------------------------- route */
  function route(initial) {
    const raw = decodeURIComponent(location.hash.replace(/^#/, ""));
    let [viewRaw, item] = raw.split("/");
    const alias = { skill: "skills", recipe: "recipes", doc: "shelf", step: "plan" };
    if (alias[viewRaw]) viewRaw = alias[viewRaw];
    const view = VIEWS.includes(viewRaw) ? viewRaw : "plan";
    show(view, item, initial);
  }

  function navigate(hash) {
    if (location.hash === hash) { route(false); return; }
    try { history.pushState(null, "", hash); } catch { location.hash = hash; return; }
    route(false);
  }

  function initNav() {
    document.addEventListener("click", (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href === "#" || href === "#main") return;
      e.preventDefault();
      navigate(href);
      const box = $("#results");
      if (box) box.hidden = true;
      const input = $("#q");
      if (input && a.closest(".results")) input.value = "";
    });
    window.addEventListener("popstate", () => route(false));
    }

  function show(view, item, initial) {
    const changed = state.view !== view;
    state.view = view;

    VIEWS.forEach((v) => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.hidden = v !== view;
    });
    $$(".tab").forEach((t) => {
      if (t.dataset.view === view) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    });

    if (!item && (changed || initial)) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    if (view === "skills" && item) {
      openSkill(item);
    } else if (item) {
      requestAnimationFrame(() => {
        const el = document.getElementById(
          view === "shelf" ? `doc-${item}` : view === "recipes" ? `rec-${item}` : item
        );
        if (el) {
          el.scrollIntoView({ block: "start", behavior: "auto" });
          el.style.transition = "background-color .6s";
          el.style.backgroundColor = "color-mix(in srgb, var(--orange) 14%, transparent)";
          setTimeout(() => { el.style.backgroundColor = ""; }, 1400);
        }
      });
    }
  }

  /* ----------------------------------------------------------------- misc */
  function updateDates() {
    const d = state.data;
    const all = [d.setup?.updated, d.skills?.updated, d.shelf?.updated, d.recipes?.updated, d.drill?.updated, d.print?.updated].filter(Boolean).sort();
    const latest = all[all.length - 1];
    $("#footDate").textContent = fmtDate(latest);
    $("#printDate").textContent = fmtDate(latest);
  }

  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("on"));
    setTimeout(() => { t.classList.remove("on"); setTimeout(() => t.remove(), 300); }, 2200);
  }

  /* --------------------------------------------------------- service worker */
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache is optional */ });
    });
  }

  /* ------------------------------------------------------------------ init */
  document.addEventListener("DOMContentLoaded", initSearch);
  if (document.readyState !== "loading") initSearch();
})();
