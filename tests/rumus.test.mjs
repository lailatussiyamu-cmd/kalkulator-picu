// Tes rumus Kalkulator PICU. Jalankan: node --test
// Memuat <script> asli dari index.html dengan halaman tiruan, jadi yang diuji adalah kode yang tayang.
// Angka harapan ditulis tetap di sini. Bila rumus memang diubah, ubah angkanya setelah dicek ke acuan.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync, existsSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.equal(scripts.length, 1, "index.html harus punya satu <script>");
const els = {};
const el = () => ({ style: {}, dataset: {}, innerHTML: "", value: "", classList: { add() {}, remove() {}, toggle() {} }, addEventListener() {}, focus() {}, scrollIntoView() {} });
const ctx = vm.createContext({ document: { querySelector: s => els[s] ||= el(), querySelectorAll: () => [], addEventListener() {} },
  navigator: {}, location: { search: "", hash: "", protocol: "file:" }, URLSearchParams, Intl, setTimeout, console });
vm.runInContext(scripts[0], ctx);
vm.runInContext("globalThis.T = { Calc, S, D, SEC, FEAT, parse, set(o, c) { p = Object.assign(blank(), o); cur = c; refresh(); } };", ctx);
const { Calc, S, D, SEC, FEAT, parse } = ctx.T;
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a, b, d = 0.01) => assert.ok(Math.abs(a - b) <= d, `${a} ≠ ${b}`);
const same = (a, b) => assert.deepEqual(plain(a), b);
const text = (o, c) => { ctx.T.set(o, c); return SEC[c].res().replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); };

test("angka dibaca benar (koma, titik, isian salah)", () => {
  assert.equal(parse("12,5"), 12.5); assert.equal(parse("12.5"), 12.5); assert.equal(parse("1.500"), 1500);
  for (const x of ["", "-3", "abc"]) assert.equal(parse(x), null);
});
test("Holliday-Segar", () => { for (const [w, v] of [[3, 300], [10, 1000], [12, 1100], [20, 1500], [25, 1600]]) assert.equal(Calc.hs(w), v); });
test("Schofield", () => {
  near(Calc.schofield(12, 2, true), 683.744); near(Calc.schofield(12, 2, false), 668.704);
  near(Calc.schofield(20, 5, true), 958.42); near(Calc.schofield(20, 5, false), 892.2);
  near(Calc.schofield(40, 12, true), 1365.64); near(Calc.schofield(40, 12, false), 1227.96);
});
test("Caldwell-Kennedy", () => near(Calc.caldwell(12, 2), 396.92));
test("RDA per umur, termasuk batas", () => {
  for (const [m, v] of [[5, 108], [6, 98], [11, 98], [12, 102], [47, 102], [48, 90], [83, 90], [84, 70], [131, 70]]) assert.equal(Calc.rda(m, null)[0], v);
  assert.equal(Calc.rda(132, null), null);
  for (const [m, l, pr] of [[132, 55, 47], [179, 55, 47], [180, 45, 40]]) { assert.equal(Calc.rda(m, true)[0], l); assert.equal(Calc.rda(m, false)[0], pr); }
});
test("IWL RSSA", () => { assert.equal(Calc.iwlRate(0, true), 50); for (const [m, v] of [[12, 40], [13, 30], [60, 30], [61, 20]]) assert.equal(Calc.iwlRate(m, false), v); });
test("Balance", () => {
  const b = Calc.balance(500, 240, 10, 12, 12, 24, false);
  near(b.iwl, 180); near(b.out, 430); near(b.bal, 70); near(b.perKg, 5.833); near(b.diuresis, 1.667);
  assert.equal(Calc.balance(500, 0, 0, 0, 12, 24, false), null);
});
test("GFR Schwartz, konstanta k, pRIFLE", () => {
  near(Calc.schwartz(0.55, 100, 0.5), 110); assert.equal(Calc.schwartz(0.55, 100, 0), null);
  assert.equal(Calc.defK(6, true, null), 0.33); assert.equal(Calc.defK(11, false, null), 0.45); assert.equal(Calc.defK(12, false, true), 0.55);
  assert.equal(Calc.defK(156, false, true), 0.7); assert.equal(Calc.defK(156, false, false), 0.55);
  for (const [d, g, v] of [[0, 100, 0], [25, 100, 1], [50, 100, 2], [75, 100, 3], [0, 34, 3]]) assert.equal(Calc.pRIFLE(d, g)[1], v);
  assert.equal(Calc.bunClass(9), "Renal"); assert.equal(Calc.bunClass(20), "Renal / post renal"); assert.equal(Calc.bunClass(21), "Prerenal");
});
test("Zona tanda vital", () => {
  for (const [m, b] of [[11, 0], [12, 1], [24, 2], [60, 3], [144, 4]]) assert.equal(Calc.band(m), b);
  for (const [v, z] of [[87, 3], [88, 1], [109, 1], [110, 0], [160, 0], [161, 1], [192, 1], [193, 3]]) assert.equal(Calc.zone(v, Calc.hr[0]), z);
  for (const [v, z] of [[91, 3], [92, 1], [94, 1], [95, 0]]) assert.equal(Calc.spo2Zone(v, null, null), z);
  for (const [v, z] of [[34.9, 3], [35, 1], [36, 0], [37.9, 0], [38, 1], [39.5, 3]]) assert.equal(Calc.tempZone(v), z);
  for (const [v, z] of [[2, 0], [3, 1], [3.1, 3]]) assert.equal(Calc.crtZone(v), z);
  near(Calc.map(90, 60), 70);
});
test("ETT anak, bayi, neonatus", () => {
  same(Calc.ett(24, 12, false).slice(0, 2), [4, 4.5]); same(Calc.ett(144, 40, false).slice(0, 2), [6.5, 7]);
  same(Calc.ett(12, 10, false).slice(0, 2), [3.5, 4]); same(Calc.ett(6, 7, false).slice(0, 2), [3, 3.5]);
  same(Calc.ett(1, 3.4, false).slice(0, 2), [null, 3.5]);
  for (const [w, v] of [[0.9, 2.5], [1, 3], [2, 3], [2.1, 3.5]]) same(Calc.ett(0, w, true).slice(0, 2), [null, v]);
  assert.equal(Calc.ett(156, 45, false), null);
  same(Calc.ettSizes(4.25), [4, 4.5]); same(Calc.ettSizes(4), [4]);
});
test("ETT dewasa", () => {
  same(Calc.ettAdult(true), [7.5, 8, 23]); same(Calc.ettAdult(false), [7, 7.5, 21]); assert.equal(Calc.ettAdult(null), null);
  near(Calc.ettChula(170), 21); near(Calc.ettChulaNasal(170), 26);
  assert.match(text({ ageYears: "40", male: true, heightCm: "170" }, "ett"), /26 cm di hidung/);
  assert.doesNotMatch(text({ ageYears: "40", male: true }, "ett"), /nasal/);
  const a = text({ ageYears: "40", male: true, heightCm: "170" }, "ett"); assert.match(a, /7,5–8 mm/); assert.match(a, /21 cm di sudut mulut/);
  assert.match(text({ ageYears: "15", male: true }, "ett"), /Rujukan dewasa/);
  assert.match(text({ ageYears: "12" }, "ett"), /6,5 mm/);
  assert.match(text({ ageYears: "40" }, "ett"), /pilih jenis kelamin/);
  assert.doesNotMatch(text({ ageYears: "121", male: true }, "ett"), /dewasa \(/);
});
test("rumus anak tidak dihitung untuk umur > 18", () => {
  for (const ageYears of ["19", "40", "40,5", "121"]) for (const c of ["kebutuhan", "balance", "intake"]) {
    const t = text({ ageYears, weight: "60", male: true, rda: "40", intakePerHour: "50", balIntake: "500", balHours: "12" }, c);
    assert.match(t, /hanya untuk umur 0–18 tahun/); assert.doesNotMatch(t, /kcal|cc\/|%/);
    assert.match(els["#hs"].innerHTML, /hanya umur 0–18/); assert.doesNotMatch(els["#hs"].innerHTML, /\d cc/);
    const names = ["Holliday-Segar", "Schofield", "Caldwell-Kennedy (REE)", "IWL", "Intake vs maintenance"];
    const hit = FEAT.filter(x => names.includes(x[0])); assert.equal(hit.length, names.length);
    for (const x of hit) assert.ok(!x[3](), x[0]);
    for (const x of FEAT.filter(x => x[2] === "kebutuhan")) assert.ok(!x[3](), x[0]);
  }
});
test("umur 18 dan umur kosong tetap dihitung", () => {
  assert.match(text({ ageYears: "18", weight: "60", male: true }, "kebutuhan"), /2300 kcal/);
  assert.match(text({ weight: "12" }, "kebutuhan"), /1100 kcal/); assert.match(els["#hs"].innerHTML, /1100 cc\/hari/);
  assert.match(text({ weight: "12", intakePerHour: "45,83" }, "intake"), /100%/);
});
test("kardeks F6.1 simulasi (11 kg, 3 th 2 bl, P): HS 1050, Schofield 709, diuresis 2", () => {
  const o = { weight: "11", ageYears: "3", ageMonths: "2", male: false };
  const t = text(o, "kebutuhan"); assert.match(t, /1050 kcal/); assert.match(t, /709 kcal/);
  assert.match(text({ ...o, balIntake: "130", balUrine: "44", balHours: "2" }, "balance"), /Diuresis 2 cc\/kg\/jam/);
});
test("neonatus: Holliday-Segar, % maintenance dan pRIFLE tidak dihitung", () => {
  const n = { weight: "3", ageMonths: "0", neonate: true, male: true, intakePerHour: "10" };
  const t = text(n, "kebutuhan"); assert.match(t, /tidak dihitung untuk neonatus/); assert.doesNotMatch(t, /300 cc/); assert.match(t, /150 cc\/hari/);
  assert.doesNotMatch(els["#hs"].innerHTML, /\d cc/); assert.doesNotMatch(text(n, "intake"), /%/);
  for (const g of [{ ...n }, { ageMonths: "0" }, { ageMonths: "1" }, { ageMonths: "0" }].map((x, i) => ({ ...x, heightCm: "50", creatinine: "0,9", gfrRow: [0, 1, 2, 0][i] }))) {
    const r = text(g, "gfr"); assert.match(r, /GFR \(k/); assert.match(r, /tidak dinilai pada neonatus/); assert.doesNotMatch(r, /Failure pRIFLE|F – Failure/); }
  assert.match(text({ ageYears: "5", heightCm: "100", creatinine: "2" }, "gfr"), /F – Failure/);
  for (const x of FEAT.filter(x => ["Holliday-Segar", "Intake vs maintenance"].includes(x[0]))) { ctx.T.set(n, "kebutuhan"); assert.ok(!x[3](), x[0]); }
});
test("pesan umur", () => {
  ctx.T.set({ ageYears: "121" }, "ett"); assert.match(D.warnings().join(), /sampai 120/);
  ctx.T.set({ ageYears: "120", male: true }, "ett"); assert.equal(D.warnings().length, 0);
  ctx.T.set({ ageYears: "40" }, "gcs"); assert.match(D.warnings().join(), /hanya didukung di ETT/);
});
test("rentang total tiap skala", () => {
  const range = it => [Math.min, Math.max].map(f => it.reduce((s, x) => s + f(...x.opts.map(o => o[0])), 0));
  for (const [n, it, r] of [["gcs bayi", S.gcs(true), [3, 15]], ["gcs", S.gcs(false), [3, 15]], ["comfort", S.comfort(false), [6, 30]], ["comfort vent", S.comfort(true), [6, 30]],
    ["flacc", S.flacc(), [0, 10]], ["cheops", S.cheops(), [4, 13]], ["nips", S.nips(), [0, 7]], ["cries", S.cries(), [0, 10]], ["four", S.four(), [0, 16]],
    ["cpot", S.cpot(false), [0, 8]], ["cpot int", S.cpot(true), [0, 8]], ["braden", S.braden(), [7, 28]]]) assert.deepEqual(range(it), r, n);
});
test("file cache offline ada semua", () => {
  const sw = readFileSync(new URL("sw.js", root), "utf8"); const list = JSON.parse(sw.match(/FILES = (\[.*?\])/)[1]);
  for (const f of list) assert.ok(existsSync(new URL(f, root)), f);
});
