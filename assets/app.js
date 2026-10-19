// Crypto Payment Rails Tracker: renders data/*.json. No trackers, no cookies, no forms.
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };
const fmtDate = d => { const [y,m,dd] = d.split("-").map(Number); return new Date(Date.UTC(y,m-1,dd)).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}); };
const get = p => fetch(p, {cache: "no-cache"}).then(r => r.json());

Promise.all([get("data/processors.json"), get("data/news.json"), get("data/rails.json")]).then(([proc, news, rails]) => {
  const names = Object.fromEntries(rails.rails.map(r => [r.id, r.name]));
  const sel = document.getElementById("railFilter");
  rails.rails.forEach(r => sel.insertAdjacentHTML("beforeend", `<option value="${esc(r.id)}">${esc(r.name)}</option>`));
  const tbody = document.querySelector("#toolsTable tbody");
  const render = () => {
    const f = sel.value, rows = proc.rows.filter(r => !f || r.rails.includes(f));
    tbody.innerHTML = rows.map(r => `<tr>
      <td data-l="Tool"><div class="tname">${esc(r.name)}</div><div class="ttype">${esc(r.type)}</div><div class="tnote">${esc(r.notes)}</div>
        ${r.affiliate_url ? `<a class="aff" rel="sponsored noopener" href="${esc(r.affiliate_url)}">Affiliate link</a>` : `<span class="aff" title="Placeholder: no affiliate program joined">Affiliate link spot (placeholder)</span>`}</td>
      <td data-l="Rails">${r.rails.map(x => `<span class="chip">${esc(names[x] ? x : x)}</span>`).join("")}</td>
      <td data-l="Fees (as published)">${esc(r.fees)}${r.fee_source !== r.source ? ` <a href="${esc(r.fee_source)}" rel="noopener" target="_blank">(fee page)</a>` : ""}</td>
      <td data-l="Source"><a href="${esc(r.source)}" rel="noopener" target="_blank">${esc(host(r.source))}</a><div class="ttype">checked ${esc(fmtDate(r.checked))}</div></td></tr>`).join("");
    document.getElementById("count").textContent = `${rows.length} of ${proc.rows.length} tools`;
  };
  sel.addEventListener("change", render); render();
  document.getElementById("toolsNote").textContent = proc.note;

  document.getElementById("newsList").innerHTML = news.items.slice(0, 25).map(n => `<li>
    <span class="date">${esc(fmtDate(n.date))}</span><a href="${esc(n.url)}" rel="noopener" target="_blank">${esc(n.title)}</a>
    <div class="meta">${esc(n.publisher)} · ${esc(host(n.url))} · ${n.rails.map(esc).join(", ")}</div></li>`).join("");
  document.getElementById("newsNote").textContent = "Pulled from official press pages and blogs, plus hand-checked items. Each one links to its original source.";

  document.getElementById("railCards").innerHTML = rails.rails.map(r => `<div class="card">
    <h3>${esc(r.name)}</h3><div class="kind">${esc(r.kind)}</div><p>${esc(r.plain)}</p>
    <a class="small" href="${esc(r.source)}" rel="noopener" target="_blank">Source: ${esc(host(r.source))}</a></div>`).join("");
  document.getElementById("updated").textContent = `tools ${fmtDate(proc.updated)}, news ${fmtDate(news.updated)}`;
}).catch(e => { document.querySelector("main").insertAdjacentHTML("afterbegin", `<p>Could not load data (${esc(e.message)}). Serve this folder over HTTP.</p>`); });
