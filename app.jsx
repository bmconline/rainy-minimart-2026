const { useState, useMemo, useEffect, useRef, useReducer } = React;
const D = window.RAINY_DATA;

// ─── persisted user entries ───────────────────────────────────────────────
const LS_KEY = "rainy.entries.v1";
function loadEntries() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; }
}
function saveEntries(arr) { localStorage.setItem(LS_KEY, JSON.stringify(arr)); }

// Recompute D.ytd + apply a single entry onto D.months / D.may
function applyEntryToD(e) {
  const mIdx = +e.date.slice(5, 7) - 1;
  const m = D.months[mIdx];
  const inMay = mIdx === D.currentMonth - 1;

  if (e.type === "in") {
    m.income += e.amount;
    if (inMay) D.may.income.unshift([e.date, e.amount, e.cat]);
  } else if (e.type === "out") {
    m.expense += e.amount;
    if (inMay) D.may.expense.unshift([e.date, e.amount, e.cat]);
  } else if (e.type === "save") {
    m.saving += e.amount;
    if (inMay) D.may.investment.unshift([e.date, e.cat || "ออมเงินฝาก", e.amount, "ซื้อ"]);
    D.ytd.investmentNow += e.amount;
    D.balances.pracharat += e.amount; // kept goes into pracharat wallet
  } else if (e.type === "adj") {
    // Transfer / adjustment — affects balances only, not P&L
    const sign = e.dir === "out" ? -1 : 1;
    if (e.wallet === "storeDeposit") D.balances.storeDeposit += sign * e.amount;
    if (e.wallet === "storeCash")    D.balances.storeCash    += sign * e.amount;
    if (e.wallet === "pracharat")    D.balances.pracharat    += sign * e.amount;
    if (e.wallet === "savings")      D.balances.savings      += sign * e.amount;
  }
  m.profit = m.income - m.expense;
  m.savRate = m.income > 0 ? m.saving / m.income : 0;
}
function rebuildYTD() {
  D.ytd.income  = D.months.reduce((s, x) => s + x.income, 0);
  D.ytd.expense = D.months.reduce((s, x) => s + x.expense, 0);
  D.ytd.profit  = D.ytd.income - D.ytd.expense;
}
// Snapshot the pristine values once so a re-apply doesn't double-count
if (!D._pristine) {
  D._pristine = {
    months: D.months.map(m => ({ ...m })),
    ytd: { ...D.ytd },
    mayInc: [...D.may.income],
    mayExp: [...D.may.expense],
    mayInv: [...D.may.investment],
    balances: { ...D.balances },
  };
}
function resetAndApply(entries) {
  D.months.forEach((m, i) => Object.assign(m, D._pristine.months[i]));
  Object.assign(D.ytd, D._pristine.ytd);
  Object.assign(D.balances, D._pristine.balances);
  D.may.income = [...D._pristine.mayInc];
  D.may.expense = [...D._pristine.mayExp];
  D.may.investment = [...D._pristine.mayInv];
  for (const e of entries) applyEntryToD({ ...e });
  // tag user rows so we can pick them out visually
  for (const e of entries) {
    if (e.type === "in" || e.type === "out") {
      const list = e.type === "in" ? D.may.income : D.may.expense;
      const row = list.find(r => r[0] === e.date && r[1] === e.amount && r[2] === e.cat && !r._id);
      if (row) row._id = e.id;
    } else if (e.type === "save") {
      const row = D.may.investment.find(r => r[0] === e.date && r[2] === e.amount && !r._id);
      if (row) row._id = e.id;
    }
  }
  rebuildYTD();
}

// ─── helpers ──────────────────────────────────────────────────────────────
const fmt = (n, dec = 0) => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  return (n < 0 ? "−" : "") + s;
};
const fmtK = (n) => {
  if (!n) return "0";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(n);
};
const thMonths = D.months.map((m) => m.name);
const monthHas = (m) => m.income > 0 || m.expense > 0;

// ─── decorative rain SVG ──────────────────────────────────────────────────
function RainDots({ w = 140, h = 60, color = "currentColor" }) {
  const drops = [];
  for (let i = 0; i < 22; i++) {
    const x = (i * 37) % w;
    const y = ((i * 53) % (h - 8)) + 4;
    drops.push(<line key={i} x1={x} y1={y} x2={x} y2={y + 6} stroke={color} strokeWidth=".8" strokeLinecap="round" opacity={0.35 + ((i * 13) % 60) / 100} />);
  }
  return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>{drops}</svg>;
}

// ─── topbar ───────────────────────────────────────────────────────────────
function TopBar({ currentMonth, onAdd }) {
  const m = D.months[currentMonth - 1];
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo" aria-hidden>
          <RainDots w={40} h={40} color="rgba(244,239,226,.9)" />
          <span style={{ position: "relative" }}>R</span>
        </div>
        <div>
          <div className="brand-name">Rainy <em style={{ fontStyle: "italic", fontWeight: 400 }}>Minimart</em></div>
          <div className="brand-sub">สมุดบัญชี · {D.year}</div>
        </div>
      </div>
      <div className="topbar-right">
        <div className="stat"><span className="v">{m.name} {D.year + 543}</span><span className="l">เดือนปัจจุบัน</span></div>
        <div className="stat"><span className="v">{D.may.income.length + D.may.expense.length}</span><span className="l">ธุรกรรม</span></div>
        <div className="stat"><span className="v"><span className="live-dot" />sync 18:42</span><span className="l">อัปเดตล่าสุด</span></div>
        <button className="add-btn" onClick={onAdd}>
          <span style={{ fontSize: 18, lineHeight: 0, marginRight: 2 }}>+</span> บันทึกรายการ
        </button>
      </div>
    </div>
  );
}

// ─── hero ─────────────────────────────────────────────────────────────────
function Hero({ ytd }) {
  const profitPos = ytd.profit >= 0;
  return (
    <section className="hero">
      <div>
        <div className="hero-kicker">รายงานสรุปการเงิน · ปีงบประมาณ {D.year}</div>
        <h1 className="hero-title">
          ปีนี้ร้านโต<br/>
          อย่าง<em>มีจังหวะ</em>ของฝน
        </h1>
        <p className="hero-lede">
          5 เดือนแรกของปี <strong>{D.year + 543}</strong> ร้านมินิมาร์ทมีรายรับสะสม {fmt(ytd.income, 2)} บาท
          เทียบกับรายจ่ายสะสม {fmt(ytd.expense, 2)} บาท
          คงเหลือกำไรสุทธิ <strong>{fmt(ytd.profit, 2)} บาท</strong> และมีเงินออม + ลงทุนรวม {fmt(ytd.saving)} บาท
        </p>
        <span className="hero-pill"><span className="dot" /> 5 ใน 12 เดือน · อัปเดตถึง {D.months[D.currentMonth - 1].name} 19, {D.year + 543}</span>
      </div>
      <aside className="ytd-card">
        <div className="ytd-label">รายรับสะสมทั้งปี</div>
        <div className="ytd-big num">฿{fmt(ytd.income, 0)}</div>
        <div className="ytd-sub">YTD · {D.year}</div>

        <div className="ytd-row">
          <span className="k">รายจ่ายสะสม</span>
          <span className="v">฿{fmt(ytd.expense, 0)}</span>
        </div>
        <div className="ytd-row" style={{ marginTop: 0, paddingTop: 14, borderTop: 0 }}>
          <span className="k">กำไรสุทธิ</span>
          <span className={"v " + (profitPos ? "pos" : "neg")}>{profitPos ? "+" : ""}฿{fmt(ytd.profit, 2)}</span>
        </div>
        <div className="ytd-row" style={{ marginTop: 0, paddingTop: 14, borderTop: 0 }}>
          <span className="k">ลงทุน · มูลค่าปัจจุบัน</span>
          <span className="v">฿{fmt(ytd.investmentNow, 2)}</span>
        </div>
      </aside>
    </section>
  );
}

// ─── KPI ──────────────────────────────────────────────────────────────────
function Sparkline({ values, color = "#3d7a5c", w = 78, h = 32 }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - ((v - min) / range) * (h - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="kpi-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(values.length - 1) * step} cy={h - ((values[values.length - 1] - min) / range) * (h - 4) - 2} r="2.3" fill={color} />
    </svg>
  );
}

function KPI({ month }) {
  const m = D.months[month - 1];
  const prev = month > 1 ? D.months[month - 2] : null;
  const dInc = prev && prev.income ? (m.income - prev.income) / prev.income : null;
  const dExp = prev && prev.expense ? (m.expense - prev.expense) / prev.expense : null;
  const dProf = prev ? (m.profit - prev.profit) : null;
  const sparkInc = D.months.slice(0, D.currentMonth).map((x) => x.income);
  const sparkExp = D.months.slice(0, D.currentMonth).map((x) => x.expense);
  const sparkProf = D.months.slice(0, D.currentMonth).map((x) => x.profit);
  const sparkSav = D.months.slice(0, D.currentMonth).map((x) => x.saving);

  return (
    <div className="kpi">
      <div className="kpi-cell accent-income">
        <div className="kpi-label">รายรับ · {m.name}</div>
        <div className="kpi-num"><span className="b">฿</span><span className="num">{fmt(m.income)}</span></div>
        <Sparkline values={sparkInc} color="#3d7a5c" />
        <div className="kpi-foot">
          <span>เทียบเดือนก่อน</span>
          <span className={"kpi-delta " + (dInc >= 0 ? "pos" : "neg")}>{dInc == null ? "—" : (dInc >= 0 ? "+" : "") + (dInc * 100).toFixed(1) + "%"}</span>
        </div>
      </div>
      <div className="kpi-cell">
        <div className="kpi-label">รายจ่าย · {m.name}</div>
        <div className="kpi-num"><span className="b">฿</span><span className="num">{fmt(m.expense)}</span></div>
        <Sparkline values={sparkExp} color="#b54a32" />
        <div className="kpi-foot">
          <span>เทียบเดือนก่อน</span>
          <span className={"kpi-delta " + (dExp <= 0 ? "pos" : "neg")}>{dExp == null ? "—" : (dExp >= 0 ? "+" : "") + (dExp * 100).toFixed(1) + "%"}</span>
        </div>
      </div>
      <div className="kpi-cell">
        <div className="kpi-label">กำไร / ขาดทุน · {m.name}</div>
        <div className="kpi-num" style={{ color: m.profit >= 0 ? "var(--green-2)" : "var(--clay-2)" }}>
          <span className="b" style={{ color: "inherit" }}>{m.profit >= 0 ? "+฿" : "−฿"}</span><span className="num">{fmt(Math.abs(m.profit), 2)}</span>
        </div>
        <Sparkline values={sparkProf} color="#b58a4a" />
        <div className="kpi-foot">
          <span>{m.profit >= 0 ? "กำไร" : "ขาดทุน"}สุทธิ</span>
          <span className={"kpi-delta " + (m.profit >= 0 ? "pos" : "neg")}>{m.profit >= 0 ? "บวก" : "ลบ"}</span>
        </div>
      </div>
      <div className="kpi-cell">
        <div className="kpi-label">ออม + ลงทุน · {m.name}</div>
        <div className="kpi-num"><span className="b">฿</span><span className="num">{fmt(m.saving)}</span></div>
        <Sparkline values={sparkSav} color="#b58a4a" />
        <div className="kpi-foot">
          <span>คิดเป็น {(m.savRate * 100).toFixed(1)}% ของรายรับ</span>
          <span className="kpi-delta">{(m.savRate * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  );
}

// ─── 12 month chart ───────────────────────────────────────────────────────
function YearChart({ onPick, picked }) {
  const max = Math.max(...D.months.flatMap((m) => [m.income, m.expense]));
  const W = 1100, H = 320, padL = 56, padR = 20, padT = 24, padB = 44;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / 12;
  const barW = (slot - 14) / 2;

  // Y ticks
  const ticks = [0, 100000, 200000, 300000, 400000, 500000];
  const yAt = (v) => padT + innerH - (v / 500000) * innerH;

  // profit line
  const profitPts = D.months.map((m, i) => {
    if (!monthHas(m)) return null;
    const cx = padL + slot * i + slot / 2;
    const cy = padT + innerH / 2 - (m.profit / 250000) * (innerH / 2);
    return { x: cx, y: cy, m };
  }).filter(Boolean);

  return (
    <div className="chart-wrap">
      <div className="chart-title-row">
        <div className="chart-title">รายรับ vs รายจ่าย · รายเดือน {D.year}</div>
        <div className="chart-legend">
          <span><span className="sw" style={{ background: "var(--green)" }} /> รายรับ</span>
          <span><span className="sw" style={{ background: "var(--clay)" }} /> รายจ่าย</span>
          <span><span className="sw" style={{ background: "var(--gold)", borderRadius: "50%", height: 8, width: 8 }} /> กำไร / ขาดทุน</span>
        </div>
      </div>

      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {/* grid */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W - padR} y1={yAt(t)} y2={yAt(t)} stroke="#e6dfca" strokeDasharray={t === 0 ? "" : "2 4"} />
            <text x={padL - 10} y={yAt(t) + 4} fontSize="10" fill="#8c9991" textAnchor="end" fontFamily="IBM Plex Mono, monospace">{fmtK(t)}</text>
          </g>
        ))}

        {/* bars */}
        {D.months.map((m, i) => {
          const cx = padL + slot * i;
          const incH = (m.income / 500000) * innerH;
          const expH = (m.expense / 500000) * innerH;
          const active = picked === m.idx;
          return (
            <g key={m.idx} onClick={() => onPick(m.idx)} style={{ cursor: "pointer" }}>
              <rect x={cx + 4} y={padT} width={slot - 8} height={innerH} fill={active ? "rgba(20,52,43,0.04)" : "transparent"} />
              {/* income bar */}
              <rect x={cx + slot / 2 - barW - 1} y={padT + innerH - incH} width={barW} height={incH || 1}
                fill={monthHas(m) ? "var(--green)" : "#e6dfca"} opacity={monthHas(m) ? (active ? 1 : 0.92) : 0.5} />
              {/* expense bar */}
              <rect x={cx + slot / 2 + 1} y={padT + innerH - expH} width={barW} height={expH || 1}
                fill={monthHas(m) ? "var(--clay)" : "#e6dfca"} opacity={monthHas(m) ? (active ? 1 : 0.85) : 0.4} />
              <text x={cx + slot / 2} y={H - padB + 18} fontSize="11" fill={active ? "var(--ink)" : "var(--ink-3)"} fontWeight={active ? 600 : 400} textAnchor="middle">{m.en}</text>
              <text x={cx + slot / 2} y={H - padB + 32} fontSize="9" fill="#8c9991" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">{String(m.idx).padStart(2, "0")}</text>
            </g>
          );
        })}

        {/* zero ref line for profit (overlay) */}
        <line x1={padL} x2={W - padR} y1={padT + innerH / 2} y2={padT + innerH / 2} stroke="transparent" />

        {/* profit line */}
        <polyline
          points={profitPts.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeDasharray="4 3"
        />
        {profitPts.map((p) => (
          <g key={p.m.idx}>
            <circle cx={p.x} cy={p.y} r="4.5" fill="var(--paper)" stroke="var(--gold-2)" strokeWidth="1.4" />
            <text x={p.x} y={p.y - 10} fontSize="10" fontFamily="IBM Plex Mono, monospace" fill={p.m.profit >= 0 ? "var(--green-2)" : "var(--clay-2)"} textAnchor="middle">
              {p.m.profit >= 0 ? "+" : "−"}{fmtK(Math.abs(p.m.profit))}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ─── month picker ─────────────────────────────────────────────────────────
function MonthPicker({ picked, onPick }) {
  return (
    <div className="month-pick">
      {D.months.map((m) => (
        <button key={m.idx}
          className={(picked === m.idx ? "active " : "") + (monthHas(m) ? "" : "empty")}
          onClick={() => onPick(m.idx)}>
          {String(m.idx).padStart(2, "0")} · {m.en}
        </button>
      ))}
    </div>
  );
}

// ─── donut ────────────────────────────────────────────────────────────────
function Donut({ data, size = 180, centerLabel = "รวม" }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 10;
  const cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const frac = d.value / total;
    const a1 = a0 + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const rIn = r - 26;
    const xi0 = cx + rIn * Math.cos(a0), yi0 = cy + rIn * Math.sin(a0);
    const xi1 = cx + rIn * Math.cos(a1), yi1 = cy + rIn * Math.sin(a1);
    const path = `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} L ${xi1} ${yi1} A ${rIn} ${rIn} 0 ${large} 0 ${xi0} ${yi0} Z`;
    a0 = a1;
    return <path key={i} d={path} fill={d.color} />;
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {arcs}
      <text x={cx} y={cy - 4} fontSize="11" fill="var(--ink-3)" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">{centerLabel}</text>
      <text x={cx} y={cy + 16} fontSize="20" fill="var(--ink)" textAnchor="middle" fontFamily="Newsreader, serif" fontWeight="500">฿{fmtK(total)}</text>
    </svg>
  );
}

// ─── group transactions of current month ──────────────────────────────────
function groupBy(arr, fn) {
  const o = {};
  for (const x of arr) {
    const k = fn(x);
    o[k] = (o[k] || 0) + x[1];
  }
  return o;
}

function CurrentMonthDetail() {
  const expByCat = groupBy(D.may.expense, (x) => x[2]);
  const incByCat = groupBy(D.may.income, (x) => x[2]);

  const expData = [
    { label: "หน้าร้าน", value: expByCat["หน้าร้าน"] || 0, color: "var(--clay)" },
    { label: "เบิกร้าน", value: expByCat["เบิกร้าน"] || 0, color: "var(--gold)" },
    { label: "เงินโอน", value: expByCat["เงินโอน"] || 0, color: "var(--ink-2)" },
  ];
  const totalExp = expData.reduce((s, d) => s + d.value, 0);

  const incData = [
    { label: "หน้าร้าน", value: incByCat["หน้าร้าน"] || 0, color: "var(--green-2)" },
    { label: "เงินโอน", value: incByCat["เงินโอน"] || 0, color: "var(--sky)" },
    { label: "ประชารัฐ", value: incByCat["ประชารัฐ"] || 0, color: "var(--gold)" },
  ];
  const totalInc = incData.reduce((s, d) => s + d.value, 0);

  return (
    <div className="detail-grid">
      <div className="panel">
        <div className="panel-kicker">โครงสร้างรายจ่าย · {D.months[D.currentMonth - 1].name}</div>
        <h3 className="panel-title">เงินไหลออกไปไหนบ้าง</h3>
        <div className="donut-wrap">
          <Donut data={expData} centerLabel="รวมรายจ่าย" />
          <div className="donut-legend">
            {expData.map((d) => (
              <div className="row" key={d.label}>
                <span className="sw" style={{ background: d.color }} />
                <span className="label">{d.label}</span>
                <span className="amt num">฿{fmt(d.value)}</span>
                <span className="pct">{((d.value / totalExp) * 100).toFixed(1)}%</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--hairline-2)" }}>
              <span className="sw" style={{ background: "transparent" }} />
              <span className="label" style={{ color: "var(--ink-3)" }}>รวมทั้งหมด</span>
              <span className="amt num">฿{fmt(totalExp)}</span>
              <span className="pct">100%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-kicker">โครงสร้างรายรับ · {D.months[D.currentMonth - 1].name}</div>
        <h3 className="panel-title">เงินเข้าจากช่องทางไหน</h3>
        <div className="donut-wrap">
          <Donut data={incData} centerLabel="รวมรายรับ" />
          <div className="donut-legend">
            {incData.map((d) => (
              <div className="row" key={d.label}>
                <span className="sw" style={{ background: d.color }} />
                <span className="label">{d.label}</span>
                <span className="amt num">฿{fmt(d.value)}</span>
                <span className="pct">{((d.value / totalInc) * 100).toFixed(1)}%</span>
              </div>
            ))}
            <div className="row" style={{ marginTop: 8, paddingTop: 10, borderTop: "1px solid var(--hairline-2)" }}>
              <span className="sw" style={{ background: "transparent" }} />
              <span className="label" style={{ color: "var(--ink-3)" }}>รวมทั้งหมด</span>
              <span className="amt num">฿{fmt(totalInc)}</span>
              <span className="pct">100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── daily flow strip ─────────────────────────────────────────────────────
function DailyFlow() {
  const days = {};
  for (const [d, v] of D.may.income) { days[d] = days[d] || { in: 0, out: 0 }; days[d].in += v; }
  for (const [d, v] of D.may.expense) { days[d] = days[d] || { in: 0, out: 0 }; days[d].out += v; }
  const sorted = Object.entries(days).sort();
  const max = Math.max(...sorted.flatMap(([, v]) => [v.in, v.out]));

  const W = 1100, H = 220, padL = 40, padR = 20, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const slot = innerW / sorted.length;
  const barW = slot * 0.35;

  return (
    <div className="chart-wrap">
      <div className="chart-title-row">
        <div className="chart-title">กระแสเงินรายวัน · {D.months[D.currentMonth - 1].name} {D.year + 543}</div>
        <div className="chart-legend">
          <span><span className="sw" style={{ background: "var(--green)" }} /> เข้า</span>
          <span><span className="sw" style={{ background: "var(--clay)" }} /> ออก</span>
        </div>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        <line x1={padL} x2={W - padR} y1={padT + innerH} y2={padT + innerH} stroke="#d8cfb8" />
        {sorted.map(([d, v], i) => {
          const cx = padL + slot * i + slot / 2;
          const inH = (v.in / max) * innerH;
          const outH = (v.out / max) * innerH;
          const day = d.slice(-2);
          return (
            <g key={d}>
              <rect x={cx - barW - 1} y={padT + innerH - inH} width={barW} height={inH || 1} fill="var(--green)" opacity=".9" />
              <rect x={cx + 1} y={padT + innerH - outH} width={barW} height={outH || 1} fill="var(--clay)" opacity=".85" />
              <text x={cx} y={H - padB + 18} fontSize="10" fill="var(--ink-3)" textAnchor="middle" fontFamily="IBM Plex Mono, monospace">{day}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── balances / wallets ──────────────────────────────────────────────────
function Wallets() {
  const b = D.balances;
  const cells = [
    { l: "เงินฝากร้าน", v: b.storeDeposit, sub: "ยอดสะสมจากหน้าร้าน" },
    { l: "เงินสดร้าน", v: b.storeCash, sub: "เงินสดในลิ้นชัก" },
    { l: "เงินประชารัฐ", v: b.pracharat, sub: "ยอดเก็บคงเหลือ" },
    { l: "บัญชีเงินฝาก", v: b.savings + b.deposit2 + b.deposit3, sub: "ออม + ลงทุน" },
  ];
  return (
    <div className="balance-row">
      {cells.map((c) => (
        <div className="bcell" key={c.l}>
          <div className="l">{c.l}</div>
          <div className="v"><span className="b">฿</span><span className="num">{fmt(c.v, 0)}</span></div>
          <div style={{ fontSize: 11, color: "var(--ink-mute)", marginTop: 6, fontFamily: "IBM Plex Sans Thai" }}>{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

// ─── transactions table ──────────────────────────────────────────────────
function chipFor(cat, kind) {
  if (cat === "หน้าร้าน") return <span className="chip green">หน้าร้าน</span>;
  if (cat === "เบิกร้าน") return <span className="chip gold">เบิกร้าน</span>;
  if (cat === "เงินโอน") return <span className="chip sky">เงินโอน</span>;
  if (cat === "ประชารัฐ") return <span className="chip gold">ประชารัฐ</span>;
  return <span className="chip">{cat}</span>;
}

const noteFor = (cat, kind) => {
  if (kind === "in") {
    if (cat === "หน้าร้าน") return "ยอดขายหน้าร้าน";
    if (cat === "เงินโอน") return "รายรับโอนเข้า";
    if (cat === "ประชารัฐ") return "รับเงินประชารัฐ";
  }
  if (cat === "หน้าร้าน") return "ของเข้าร้าน · จ่ายสด";
  if (cat === "เบิกร้าน") return "เบิกเงินจากร้าน";
  if (cat === "เงินโอน") return "รายจ่ายเงินโอน";
  return cat;
};

function TxTable() {
  const all = [
    ...D.may.income.map((r) => ({ d: r[0], a: r[1], c: r[2], k: "in", u: !!r._id })),
    ...D.may.expense.map((r) => ({ d: r[0], a: r[1], c: r[2], k: "out", u: !!r._id })),
  ].sort((x, y) => (y.u - x.u) || y.d.localeCompare(x.d) || y.a - x.a).slice(0, 14);

  return (
    <table className="ledger">
      <thead>
        <tr>
          <th style={{ width: 100 }}>วันที่</th>
          <th>รายการ</th>
          <th>หมวด</th>
          <th style={{ textAlign: "right", width: 140 }}>จำนวน (บาท)</th>
          <th style={{ width: 80 }}>ประเภท</th>
        </tr>
      </thead>
      <tbody>
        {all.map((t, i) => (
          <tr key={i} className={t.u ? "user" : ""}>
            <td className="num" style={{ color: "var(--ink-3)" }}>{t.d}</td>
            <td>{noteFor(t.c, t.k)}{t.u && <span style={{ marginLeft: 8, fontSize: 10, color: "var(--green-2)", fontFamily: "IBM Plex Mono, monospace", letterSpacing: ".1em", textTransform: "uppercase" }}>เพิ่งบันทึก</span>}</td>
            <td>{chipFor(t.c, t.k)}</td>
            <td className="num" style={{ color: t.k === "in" ? "var(--green-2)" : "var(--clay-2)" }}>
              {t.k === "in" ? "+" : "−"}{fmt(t.a)}
            </td>
            <td style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "IBM Plex Mono, monospace", letterSpacing: ".1em", textTransform: "uppercase" }}>
              {t.k === "in" ? "รายรับ" : "รายจ่าย"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── investments ─────────────────────────────────────────────────────────
function Investments() {
  const total = D.may.investment.reduce((s, x) => s + x[2], 0);
  return (
    <div className="panel">
      <div className="panel-kicker">การออม · {D.months[D.currentMonth - 1].name} {D.year + 543}</div>
      <h3 className="panel-title">ฝากเก็บไว้สำหรับวันฝนตก</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: "var(--hairline-2)", border: "1px solid var(--hairline)", marginTop: 6 }}>
        <div style={{ background: "var(--paper)", padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".15em", textTransform: "uppercase", fontFamily: "IBM Plex Mono, monospace" }}>ออมเดือนนี้</div>
          <div className="display" style={{ fontSize: 26, marginTop: 4 }}><span style={{ fontSize: 14, color: "var(--ink-3)" }}>฿</span><span className="num">{fmt(total)}</span></div>
        </div>
        <div style={{ background: "var(--paper)", padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", letterSpacing: ".15em", textTransform: "uppercase", fontFamily: "IBM Plex Mono, monospace" }}>มูลค่ารวมปัจจุบัน</div>
          <div className="display" style={{ fontSize: 26, marginTop: 4 }}><span style={{ fontSize: 14, color: "var(--ink-3)" }}>฿</span><span className="num">{fmt(D.ytd.investmentNow, 2)}</span></div>
        </div>
      </div>
      <div style={{ marginTop: 18 }}>
        {D.may.investment.map(([d, name, amt], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: i < D.may.investment.length - 1 ? "1px solid var(--hairline-2)" : "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 26, height: 26, borderRadius: 99, background: "#f0ead4", display: "grid", placeItems: "center", fontFamily: "Newsreader,serif", fontStyle: "italic", color: "var(--gold-2)", fontSize: 14 }}>k</span>
              <div>
                <div style={{ fontSize: 14, color: "var(--ink)" }}>{name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "IBM Plex Mono, monospace" }}>{d} · เงินฝาก</div>
              </div>
            </div>
            <div className="num" style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: "var(--gold-2)" }}>+฿{fmt(amt)}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, padding: 14, background: "#f0ead4", border: "1px solid #e0d3a8", fontSize: 13, color: "var(--ink-2)", lineHeight: 1.55 }}>
        <strong style={{ fontFamily: "Newsreader, serif", fontStyle: "italic", fontWeight: 500 }}>หมายเหตุ:</strong> ตัวเลขมูลค่าปัจจุบันคำนวนจากเงินฝากสะสม (kept) ตลอดทั้งปี โดยยังไม่มี Cap Gain ในเดือนนี้
      </div>
    </div>
  );
}

// ─── tweaks ──────────────────────────────────────────────────────────────
const TWEAK_DEFAULS = /*EDITMODE-BEGIN*/{
  "palette": "cream",
  "showDaily": true,
  "showTx": true,
  "showInvest": true,
  "rainOverlay": false
}/*EDITMODE-END*/;

const PALETTES = {
  cream: {
    "--bg": "#f4efe2", "--bg-2": "#ece6d4", "--paper": "#fbf7ec",
    "--ink": "#14342B", "--ink-2": "#2c4a3f", "--ink-3": "#5d6e63", "--ink-mute": "#8c9991",
    "--hairline": "#d8cfb8", "--hairline-2": "#e6dfca",
    "--green": "#3d7a5c", "--green-2": "#2c5a44",
    "--clay": "#b54a32", "--clay-2": "#963b27",
    "--gold": "#b58a4a", "--gold-2": "#946d33",
    "--sky": "#4a7894",
  },
  midnight: {
    "--bg": "#12191a", "--bg-2": "#1b2425", "--paper": "#1a2324",
    "--ink": "#eee6d4", "--ink-2": "#cdc6b2", "--ink-3": "#8e8e7c", "--ink-mute": "#5c6361",
    "--hairline": "#2a3537", "--hairline-2": "#212c2d",
    "--green": "#7bb091", "--green-2": "#a4ccb4",
    "--clay": "#d68466", "--clay-2": "#e89e85",
    "--gold": "#d6b27a", "--gold-2": "#e8ca94",
    "--sky": "#83a8be",
  },
  paper: {
    "--bg": "#f7f5ef", "--bg-2": "#efeae0", "--paper": "#ffffff",
    "--ink": "#1c1c1a", "--ink-2": "#3d3d39", "--ink-3": "#6b6b65", "--ink-mute": "#9b9b94",
    "--hairline": "#dcd6c5", "--hairline-2": "#ebe5d4",
    "--green": "#2f6b50", "--green-2": "#1e5039",
    "--clay": "#a13e2a", "--clay-2": "#83321f",
    "--gold": "#a87a3e", "--gold-2": "#876028",
    "--sky": "#3d6e89",
  },
};

function applyPalette(key) {
  const p = PALETTES[key] || PALETTES.cream;
  for (const [k, v] of Object.entries(p)) document.documentElement.style.setProperty(k, v);
}

function Tweaks({ t, setTweak }) {
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="ธีมสี">
        <TweakRadio value={t.palette} onChange={(v) => setTweak("palette", v)} options={[
          { value: "cream", label: "Cream" },
          { value: "midnight", label: "Midnight" },
          { value: "paper", label: "Paper" },
        ]} />
      </TweakSection>
      <TweakSection label="ส่วนประกอบ">
        <TweakToggle label="กระแสเงินรายวัน" value={t.showDaily} onChange={(v) => setTweak("showDaily", v)} />
        <TweakToggle label="ตารางธุรกรรม" value={t.showTx} onChange={(v) => setTweak("showTx", v)} />
        <TweakToggle label="ส่วนการลงทุน" value={t.showInvest} onChange={(v) => setTweak("showInvest", v)} />
        <TweakToggle label="เม็ดฝนพื้นหลัง" value={t.rainOverlay} onChange={(v) => setTweak("rainOverlay", v)} />
      </TweakSection>
    </TweaksPanel>
  );
}

// ─── entry form (slide-over) ──────────────────────────────────────────────
const TYPES = [
  { v: "in",   l: "รายรับ",        color: "green", desc: "ขายของ/รับโอน" },
  { v: "out",  l: "รายจ่าย",       color: "clay",  desc: "ค่าสินค้า/ค่าใช้จ่าย" },
  { v: "save", l: "ออม + ลงทุน",  color: "gold",  desc: "ฝากเก็บ/ซื้อกองทุน" },
  { v: "adj",  l: "ปรับยอด/โอน",   color: "sky",   desc: "ฝาก-ถอน-ยืม-แลก" },
];
const CATS_IN   = ["หน้าร้าน", "เงินโอน", "ประชารัฐ"];
const CATS_OUT  = ["หน้าร้าน", "เบิกร้าน", "เงินโอน", "เงินเดือนพนักงาน", "บัตรเครดิต"];
const CATS_SAVE = ["ออมเงินฝาก", "ลงทุนเพิ่ม"];
const CATS_ADJ  = ["ฝาก", "ถอน", "ยืมเงิน", "คืนเงิน", "แลกเหรียญ", "ปรับยอด"];
const WALLETS = [
  { v: "storeDeposit", l: "เงินฝากร้าน" },
  { v: "storeCash",    l: "เงินสดร้าน" },
  { v: "pracharat",    l: "เงินประชารัฐ" },
  { v: "savings",      l: "บัญชีเงินฝาก" },
];
function catsFor(t) {
  if (t === "in")   return CATS_IN;
  if (t === "out")  return CATS_OUT;
  if (t === "save") return CATS_SAVE;
  return CATS_ADJ;
}

function EntryForm({ open, onClose, onSubmit, entries, onRemove }) {
  const [type, setType] = useState("in");
  const [cat, setCat]   = useState(CATS_IN[0]);
  const [date, setDate] = useState("2026-05-20");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [wallet, setWallet] = useState("storeCash");
  const [dir, setDir] = useState("in"); // for adj only
  const amtRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => amtRef.current?.focus(), 80); }, [open]);
  useEffect(() => {
    const cats = catsFor(type);
    if (!cats.includes(cat)) setCat(cats[0]);
  }, [type]);

  const typeMeta = TYPES.find((t) => t.v === type);

  const submit = (e) => {
    e?.preventDefault();
    const n = parseFloat(amount.toString().replace(/,/g, ""));
    if (!n || n <= 0) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    onSubmit({
      id: "u_" + Math.random().toString(36).slice(2, 9),
      ts: Date.now(),
      type, cat, date,
      amount: Math.round(n * 100) / 100,
      note: note.trim(),
      ...(type === "adj" ? { wallet, dir } : {}),
    });
    setAmount(""); setNote("");
  };

  // submit button color
  const btnColor = typeMeta.color === "green" ? "green" : typeMeta.color === "clay" ? "clay" : typeMeta.color === "gold" ? "gold" : "sky";

  return (
    <>
      <div className={"sheet-back " + (open ? "on" : "")} onClick={onClose} />
      <aside className={"sheet " + (open ? "on" : "")} role="dialog" aria-label="บันทึกรายการใหม่">
        <header className="sheet-h">
          <div>
            <div className="sheet-kicker">เพิ่มรายการใหม่</div>
            <h3 className="sheet-title">บันทึกธุรกรรม</h3>
          </div>
          <button className="sheet-x" onClick={onClose} aria-label="ปิด">×</button>
        </header>

        <form onSubmit={submit} className="sheet-body">
          <div className="fld">
            <label>ประเภทธุรกรรม</label>
            <div className="type-grid">
              {TYPES.map((tt) => (
                <button key={tt.v} type="button"
                  className={"type-card " + tt.color + (type === tt.v ? " on" : "")}
                  onClick={() => setType(tt.v)}>
                  <span className="type-dot" />
                  <div className="type-text">
                    <span className="type-l">{tt.l}</span>
                    <span className="type-d">{tt.desc}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="fld">
            <label>{type === "adj" ? "ลักษณะการปรับยอด" : "หมวด"}</label>
            <div className="chip-row">
              {catsFor(type).map((c) => (
                <button key={c} type="button" className={"chip-btn " + (c === cat ? "on" : "")} onClick={() => setCat(c)}>{c}</button>
              ))}
            </div>
          </div>

          {type === "adj" && (
            <>
              <div className="fld">
                <label>บัญชี/กระเป๋า</label>
                <div className="chip-row">
                  {WALLETS.map((w) => (
                    <button key={w.v} type="button"
                      className={"chip-btn " + (w.v === wallet ? "on" : "")}
                      onClick={() => setWallet(w.v)}>{w.l}</button>
                  ))}
                </div>
              </div>
              <div className="fld">
                <label>ทิศทาง</label>
                <div className="seg seg-2">
                  <button type="button" className={dir === "in" ? "on green" : ""} onClick={() => setDir("in")}>
                    <span className="seg-dot" /> เข้า (+)
                  </button>
                  <button type="button" className={dir === "out" ? "on clay" : ""} onClick={() => setDir("out")}>
                    <span className="seg-dot" /> ออก (−)
                  </button>
                </div>
              </div>
            </>
          )}

          <div className="fld">
            <label>จำนวนเงิน (บาท)</label>
            <div className="amt-wrap">
              <span className="amt-baht">฿</span>
              <input ref={amtRef} className="amt-input num" type="text" inputMode="decimal"
                placeholder="0.00" value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} />
            </div>
            <div className="quick-row">
              {[100, 500, 1000, 5000].map((v) => (
                <button type="button" key={v} className="quick-chip"
                  onClick={() => setAmount(String((+amount.toString().replace(/,/g, "") || 0) + v))}>
                  +{v.toLocaleString()}
                </button>
              ))}
              <button type="button" className="quick-chip ghost" onClick={() => setAmount("")}>ล้าง</button>
            </div>
          </div>

          <div className="fld">
            <label>วันที่</label>
            <input className="date-input num" type="date" min="2026-01-01" max="2026-12-31"
              value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div className="fld">
            <label>หมายเหตุ (ถ้ามี)</label>
            <input className="text-input" type="text" placeholder="เช่น ขายเบียร์เพิ่ม / ค่าน้ำค่าไฟ / ยืมน้า"
              value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <button type="submit" className={"submit-btn " + btnColor}>
            บันทึก{typeMeta.l} ฿{amount || "0"}
          </button>
        </form>

        {entries.length > 0 && (
          <div className="sheet-recent">
            <div className="sheet-kicker">บันทึกของฉัน · {entries.length} รายการ</div>
            <div className="recent-list">
              {entries.slice(0, 8).map((e) => {
                const meta = TYPES.find((tt) => tt.v === e.type) || TYPES[0];
                const isIn = e.type === "in" || (e.type === "adj" && e.dir === "in");
                return (
                  <div className="recent-row" key={e.id}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: "var(--ink)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span className={"chip " + (meta.color === "green" ? "green" : meta.color === "clay" ? "clay" : meta.color === "gold" ? "gold" : "sky")}>{meta.l}</span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.cat}{e.note ? " · " + e.note : ""}</span>
                      </span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "IBM Plex Mono, monospace" }}>{e.date}{e.wallet ? " · " + (WALLETS.find(w=>w.v===e.wallet)?.l) : ""}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="num" style={{ fontFamily: "IBM Plex Mono, monospace", fontWeight: 500, color: isIn ? "var(--green-2)" : "var(--clay-2)" }}>
                        {isIn ? "+" : "−"}฿{fmt(e.amount)}
                      </span>
                      <button className="rm-btn" onClick={() => onRemove(e.id)} aria-label="ลบ">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}

function RainOverlay() {
  const lines = [];
  for (let i = 0; i < 60; i++) {
    const x = (i * 53) % 100;
    const delay = (i * 0.17) % 3;
    lines.push(<line key={i} x1={x + "%"} y1="-10" x2={(x - 2) + "%"} y2="14" stroke="currentColor" strokeWidth=".6" opacity=".25">
      <animateTransform attributeName="transform" type="translate" from="0 -40" to="0 120" dur={(2 + (i % 5) * 0.3) + "s"} repeatCount="indefinite" begin={delay + "s"} />
    </line>);
  }
  return (
    <svg style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, color: "var(--ink-2)" }} preserveAspectRatio="none" viewBox="0 0 100 100">
      {lines}
    </svg>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────
function App() {
  const [picked, setPicked] = useState(D.currentMonth);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULS);
  const [entries, setEntries] = useState(loadEntries);
  const [open, setOpen] = useState(false);
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => { applyPalette(t.palette); }, [t.palette]);

  // Recompute D every time entries change
  useEffect(() => {
    resetAndApply(entries);
    saveEntries(entries);
    force();
  }, [entries]);

  const addEntry = (e) => setEntries((s) => [e, ...s]);
  const removeEntry = (id) => setEntries((s) => s.filter((x) => x.id !== id));

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  return (
    <>
      {t.rainOverlay && <RainOverlay />}
      <div className="shell" style={{ position: "relative", zIndex: 1 }}>
        <TopBar currentMonth={picked} onAdd={() => setOpen(true)} />
        <Hero ytd={D.ytd} />

        <div className="sec-h">
          <h2><span className="num-id">01</span>สรุปประจำเดือน</h2>
          <span className="meta">กดที่กราฟด้านล่างเพื่อสลับเดือน</span>
        </div>
        <MonthPicker picked={picked} onPick={setPicked} />
        <div style={{ height: 14 }} />
        <KPI month={picked} />

        <div className="sec-h">
          <h2><span className="num-id">02</span>ภาพรวมทั้งปี</h2>
          <span className="meta">รายรับ × รายจ่าย × กำไร · {D.year}</span>
        </div>
        <YearChart picked={picked} onPick={setPicked} />

        <div className="sec-h">
          <h2><span className="num-id">03</span>เจาะลึกเดือนปัจจุบัน</h2>
          <span className="meta">โครงสร้างรายรับ-รายจ่าย</span>
        </div>
        <CurrentMonthDetail />

        {t.showDaily && (
          <>
            <div className="sec-h">
              <h2><span className="num-id">04</span>กระแสเงินรายวัน</h2>
              <span className="meta">19 วันแรกของเดือน</span>
            </div>
            <DailyFlow />
          </>
        )}

        <div className="sec-h">
          <h2><span className="num-id">05</span>เงินคงเหลือในกระเป๋า</h2>
          <span className="meta">ยอด ณ ปัจจุบัน</span>
        </div>
        <Wallets />

        <div style={{ display: "grid", gridTemplateColumns: t.showInvest ? "1.4fr 1fr" : "1fr", gap: 24, marginTop: 24, alignItems: "start" }}>
          {t.showTx && (
            <div className="panel">
              <div className="panel-kicker">บันทึกล่าสุด</div>
              <h3 className="panel-title">ธุรกรรมเดือนนี้</h3>
              <TxTable />
            </div>
          )}
          {t.showInvest && <Investments />}
        </div>

        <div className="credit">
          <span>RAINY MINIMART · LEDGER 2026</span>
          <span>SOURCE · 2026 Rainy minimart.xlsx</span>
          <span>PRINTED · {new Date().toISOString().slice(0, 10)}</span>
        </div>
      </div>
      <Tweaks t={t} setTweak={setTweak} />
      <EntryForm
        open={open}
        onClose={() => setOpen(false)}
        onSubmit={(e) => { addEntry(e); }}
        entries={entries}
        onRemove={removeEntry}
      />
      <button className={"fab " + (open ? "hide" : "")} onClick={() => setOpen(true)} aria-label="บันทึกรายการ">
        <svg width="22" height="22" viewBox="0 0 22 22"><path d="M11 4v14M4 11h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
        <span className="fab-label">บันทึกรายการ</span>
      </button>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
