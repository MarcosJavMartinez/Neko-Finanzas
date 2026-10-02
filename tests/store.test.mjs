// Operaciones aleatorias sobre el store real (con un localStorage simulado)
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
const base = new URL("../js/", import.meta.url).href;
const store = await import(base + "core/store.js");
const F = await import(base + "core/finance.js");
const D = await import(base + "core/dates.js");
const { sanitizeState } = await import(base + "core/sanitize.js");

let seed = 777;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const failures = [];
const check = (name, ok, info = "") => { if (!ok && failures.length < 30) failures.push(name + " → " + JSON.stringify(info).slice(0, 250)); };
const canon = (v) => Array.isArray(v) ? v.map(canon) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => [k, canon(v[k])])) : v;
const snap = () => JSON.stringify(store.getState());
const norm = (s) => { const x = JSON.parse(s); delete x.ratesUpdatedAt; if (x.settings) delete x.settings.demoEdited; return JSON.stringify(canon(x)); };
function firstDiff(a, b, path = "") {
  if (JSON.stringify(canon(a)) === JSON.stringify(canon(b))) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (a[k] === undefined && b[k] === undefined) continue;
      const d = firstDiff(a[k], b[k], path + "." + k);
      if (d) return d;
    }
  }
  return path + ": " + JSON.stringify(a)?.slice(0, 90) + " ≠ " + JSON.stringify(b)?.slice(0, 90);
}

function invariants(tag) {
  const s = store.getState();
  // Ninguna acción puede dejar datos que la validación rechazaría
  const clean = sanitizeState(JSON.parse(JSON.stringify(s)));
  clean.version = s.version;
  check(`[${tag}] estado válido (sanitize no cambia nada)`, JSON.stringify(canon(clean)) === JSON.stringify(canon(JSON.parse(JSON.stringify(s)))), firstDiff(JSON.parse(JSON.stringify(s)), clean));
  const catIds = new Set(s.categories.map((c) => c.id));
  check(`[${tag}] sin categorías huérfanas`, s.transactions.every((t) => t.type === "transfer" || t.type === "loan" || catIds.has(t.categoryId)) && s.bills.every((b) => catIds.has(b.categoryId)), tag);
  const txIds = new Set(s.transactions.map((t) => t.id));
  check(`[${tag}] pagos de facturas apuntan a gastos existentes`, s.bills.every((b) => b.payments.every((p) => txIds.has(p.txId))), tag);
  const billIds = new Set(s.bills.map((b) => b.id));
  check(`[${tag}] gastos de facturas apuntan a facturas existentes`, s.transactions.every((t) => !t.billId || billIds.has(t.billId)), tag);
  const accIds = new Set(s.accounts.map((a) => a.id));
  check(`[${tag}] movimientos en cuentas que existen`, s.transactions.every((t) => accIds.has(t.accountId) && (t.type !== "transfer" || (accIds.has(t.toAccountId) && t.toAccountId !== t.accountId))), tag);
  check(`[${tag}] al menos una cuenta activa`, s.accounts.some((a) => !a.archived), tag);
  const loanIds = new Set(s.loans.map((l) => l.id));
  check(`[${tag}] movimientos de préstamos apuntan a préstamos`, s.transactions.every((t) => t.type !== "loan" || loanIds.has(t.loanId)), tag);
  check(`[${tag}] pagos de préstamos apuntan a movimientos que existen`, s.loans.every((l) => (!l.txId || txIds.has(l.txId)) && l.payments.every((p) => !p.txId || txIds.has(p.txId))), tag);
  const goalIds = new Set(s.goals.map((g) => g.id));
  check(`[${tag}] presupuestos de metas apuntan a metas existentes`, s.budgets.every((b) => b.target.kind !== "goal" || goalIds.has(b.target.goalId)), tag);
  const sum = F.balanceSummary(s);
  check(`[${tag}] saldo finito`, Number.isFinite(sum.available), sum);
  check(`[${tag}] guardado = memoria`, mem.get("nekoFinanzas.data.v1") === JSON.stringify(s), tag);
}

const ops = {
  addTx() {
    const type = pick(["income", "expense"]);
    const cat = pick(store.getState().categories.filter((c) => c.type === type));
    const accountId = pick([...store.getState().accounts.map((a) => a.id), "cuenta-que-no-existe", undefined]);
    store.addTransaction({ type, amount: int(1, 900000), currency: pick(["ARS", "USD"]), date: D.addDays(D.todayISO(), int(-90, 10)), categoryId: cat.id, subcategoryId: cat.subcategories[0]?.id || "", description: "x", accountId });
  },
  addAccount() {
    store.saveAccount({ name: "C" + int(1, 99), kind: pick(["cash", "bank", "wallet", "savings", "rara"]), currency: pick(["ARS", "USD"]), opening: int(-1000, 500000), color: pick(["#123456", "red;}"]) });
  },
  archiveOrDeleteAccount() {
    const a = pick(store.getState().accounts);
    if (!a) return;
    if (rnd() < 0.5) store.saveAccount({ ...a, archived: !a.archived });
    else {
      try {
        store.deleteAccount(a.id);
      } catch {
        /* con movimientos o la última: no se puede, y está bien */
      }
    }
  },
  loan() {
    const accs = store.getState().accounts;
    try {
      store.addLoan({ person: "P" + int(1, 9), direction: pick(["lent", "borrowed"]), amount: int(1, 100000), currency: pick(["ARS", "USD"]), date: D.addDays(D.todayISO(), int(-60, 0)), dueDate: pick(["", D.addDays(D.todayISO(), int(1, 90))]), accountId: pick(["", ...accs.map((a) => a.id)]) });
    } catch {
      /* monto inválido */
    }
  },
  loanPayOrDelete() {
    const l = pick(store.getState().loans);
    if (!l) return;
    const r = rnd();
    if (r < 0.5) store.addLoanPayment(l.id, { amount: int(1, 50000), accountId: pick(["", store.defaultAccountId()]) });
    else if (r < 0.7 && l.payments.length) store.deleteLoanPayment(l.id, pick(l.payments).id);
    else if (r < 0.85) {
      const t = store.getState().transactions.find((x) => x.type === "loan" && x.loanId === l.id);
      if (t) store.deleteTransaction(t.id);
    } else store.deleteLoan(l.id);
  },
  transfer() {
    const accs = store.getState().accounts;
    const from = pick(accs);
    const to = pick(accs);
    const before = F.totalBalance(store.getState());
    try {
      store.addTransfer({ fromId: from.id, toId: to.id, amount: int(1, 100000), toAmount: int(1, 100), date: D.todayISO() });
    } catch {
      return; // misma cuenta: se rechaza
    }
    if (from.currency === to.currency) check("transferir no cambia el total", Math.abs(F.totalBalance(store.getState()) - before) < 0.01, { from: from.id, to: to.id });
  },
  deleteTx() {
    const t = pick(store.getState().transactions);
    if (t) store.deleteTransaction(t.id);
  },
  payAndUndo() {
    const b = pick(store.getState().bills.filter((x) => x.recurring || x.status === "pending"));
    if (!b) return;
    const before = norm(snap());
    store.payBill(b.id, {});
    store.undoLastPayment(b.id);
    const after = norm(snap());
    check("pagar + deshacer deja todo igual", after === before, b.name + " " + (after === before ? "" : firstDiff(JSON.parse(before), JSON.parse(after))));
  },
  pay() {
    const b = pick(store.getState().bills);
    if (b && (b.recurring || b.status === "pending")) store.payBill(b.id, { amount: int(1, 99999) });
  },
  deletePaymentTx() {
    const t = pick(store.getState().transactions.filter((x) => x.billId));
    if (t) store.deleteTransaction(t.id);
  },
  addBill() {
    const due = D.addDays(D.todayISO(), int(-40, 40));
    store.addBill({ name: "N", icon: "🧾", amount: int(1, 50000), currency: "ARS", dueDate: due, dueDay: Number(due.slice(8)), frequency: pick(Object.keys(D.FREQUENCIES)), recurring: rnd() < 0.7, categoryId: "exp-servicios", subcategoryId: "" });
  },
  deleteBill() {
    const b = pick(store.getState().bills);
    if (b) store.deleteBill(b.id);
  },
  goalMove() {
    const g = pick(store.getState().goals);
    if (g) store.moveGoalMoney(g.id, pick([1, -1]) * int(1, 50000), "n");
  },
  deleteGoal() {
    const g = pick(store.getState().goals);
    if (g) store.deleteGoal(g.id);
  },
  addGoal() {
    store.addGoal({ name: "G", icon: "🎯", color: "#8a63d2", target: int(1, 900000), currency: "ARS", targetDate: "" });
  },
  deleteCategory() {
    const c = pick(store.getState().categories.filter((x) => !store.isProtectedCategory(x.id)));
    if (c) store.deleteCategory(c.id);
  },
  addCategoryWithSubs() {
    const c = store.saveCategory({ type: pick(["expense", "income"]), name: "C", icon: "🏷️", color: "#1f9e74", subcategories: [{ id: "tmp1", name: "S1", icon: "" }] });
    store.saveSubcategory(c.id, { name: "S2", icon: "" });
  },
  removeSubsInForm() {
    const c = pick(store.getState().categories.filter((x) => x.subcategories.length));
    if (c) store.saveCategory({ id: c.id, name: c.name, icon: c.icon, color: c.color, subcategories: c.subcategories.slice(1) });
  },
  deleteSub() {
    const c = pick(store.getState().categories.filter((x) => x.subcategories.length));
    if (c) store.deleteSubcategory(c.id, c.subcategories[0].id);
  },
  confirmOrSkipRecurring() {
    const t = pick(store.getState().transactions.filter((x) => x.recurrence));
    if (!t) return;
    if (rnd() < 0.5) store.confirmRecurring(t.id);
    else store.skipRecurring(t.id);
  },
  setRate() {
    store.setRate(pick(["USD", "EUR"]), int(100, 3000));
  },
  mainCurrency() {
    store.setMainCurrency(pick(["ARS", "USD", "EUR"]));
  },
  undoSnapshot() {
    const before = snap();
    store.addTransaction({ type: "expense", amount: 5, currency: "ARS", date: D.todayISO(), categoryId: "exp-otros" });
    store.restore(JSON.parse(before));
    check("deshacer (restore) vuelve exactamente al estado anterior", norm(snap()) === norm(before));
  },
  exportImport() {
    const before = snap();
    store.importJSON(store.exportJSON());
    check("exportar → importar no cambia nada", norm(snap()) === norm(before), firstDiff(JSON.parse(before), store.getState()));
  },
};

const names = Object.keys(ops);
const counts = {};
for (let run = 0; run < 12; run++) {
  store.loadDemo();
  invariants("demo " + run);
  for (let i = 0; i < 250; i++) {
    const op = pick(names);
    counts[op] = (counts[op] || 0) + 1;
    try {
      ops[op]();
    } catch (e) {
      check("excepción en " + op, false, e.message);
    }
    invariants(op);
  }
  // Empezar de cero conserva categorías y monedas, borra el resto
  const cats = store.getState().categories.length;
  store.startFresh();
  const s = store.getState();
  check("empezar de cero", s.transactions.length === 0 && s.goals.length === 0 && s.bills.length === 0 && s.categories.length === cats);
  invariants("startFresh");
}
console.log(failures.length ? "FALLAS:\n" + failures.join("\n") : "Todas las invariantes se cumplen");
console.log("operaciones:", Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" "));
