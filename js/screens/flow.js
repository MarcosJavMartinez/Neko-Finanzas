// ¿A dónde va tu dinero?: cómo se llega al disponible (lo que tienes, menos lo
// apartado en metas y lo reservado, cosa por cosa) y lo que pasó este mes,
// contado en frases simples.

import { msg, tr } from "../core/i18n.js";
import { html } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { approx, shortDay } from "../ui/components.js";
import { formatMoney } from "../core/money.js";
import { balanceSummary, findCategory, findSubcategory, goalSaved, loanSaveCurrency, loanSetAsideStatus, nextMonthPlan, toMain } from "../core/finance.js";
import { formatDate, formatDue, formatMonth, midSentence, monthRange, monthKey, todayISO } from "../core/dates.js";

/** Una fila: burbuja con emoji, la frase (con el monto en negrita) y una línea de detalle. */
function flowRow({ emoji, color = "var(--brand)", text, meta = "", extra = "", action = "", id = "", href = "" }) {
  const body = html`<span class="cat-bubble cat-bubble-md" style="--c:${color}" aria-hidden="true">${emoji}</span>
    <span class="flow-body">
      <span class="flow-text">${text}</span>
      ${meta || extra ? html`<span class="flow-meta">${meta}${extra}</span>` : ""}
    </span>`;
  if (href) return html`<a class="flow-row" href="${href}">${body}</a>`;
  return action ? html`<button type="button" class="flow-row" data-action="${action}" data-id="${id}">${body}</button>` : html`<div class="flow-row">${body}</div>`;
}

const accountName = (state, id) => {
  const account = state.accounts.find((a) => a.id === id);
  return account ? `${account.icon} ${tr(account.name)}` : "";
};

/**
 * Lo apartado y lo reservado, cosa por cosa (lo mismo que se descuenta del
 * disponible), en grupos con su total: facturas, cuotas, deudas, presupuestos,
 * fondo de facturas y metas.
 */
function reservedGroups(state, summary, today) {
  const main = state.settings.mainCurrency;
  const m = (n, currency = main) => formatMoney(n, currency);
  const groups = [];
  const group = (title, total, href) => {
    const rows = [];
    groups.push({ title, total, href, rows });
    return rows;
  };
  let rows = group("Facturas", summary.reserve.amount, "#/facturas");
  for (const { bill, dueDate } of summary.reserve.items) {
    rows.push(flowRow({ emoji: bill.icon, color: "var(--bill)", text: html`<strong>${m(bill.amount, bill.currency)}</strong> reservados para ${bill.name}`, meta: formatDue(dueDate, today), extra: bill.currency !== main ? approx(state, bill.amount, bill.currency) : "", action: "bill-detail", id: bill.id }));
  }
  rows = group("Cuotas", summary.scheduled.amount, "#/transacciones");
  for (const tx of summary.scheduled.items) {
    const category = findCategory(state, tx.categoryId);
    const name = tx.description || findSubcategory(category, tx.subcategoryId)?.name || category?.name || "Gasto";
    rows.push(flowRow({
      emoji: category?.icon || "🗓️",
      color: "var(--expense)",
      text: html`<strong>${m(tx.amount, tx.currency)}</strong> reservados para ${name}`,
      meta: [tx.installment ? msg`Cuota ${tx.installment.n} de ${tx.installment.of}` : "", tr(formatDue(tx.date, today))].filter(Boolean).join(" · "),
      action: "edit-tx",
      id: tx.recurringOf || tx.id,
    }));
  }
  rows = group("Deudas", summary.debts.amount, "#/prestamos");
  for (const item of summary.debts.items) {
    const { loan } = item;
    const dueSoon = loan.dueDate && loan.dueDate <= summary.debts.until;
    const currency = dueSoon ? loan.currency : loanSaveCurrency(loan);
    rows.push(flowRow({
      emoji: "🤝",
      color: "var(--goal)",
      text: html`<strong>${m(item.reserved, currency)}</strong> apartados para devolverle a ${loan.person}`,
      meta: dueSoon ? formatDue(loan.dueDate, today) : msg`${m(loan.saveMonthly, currency)} por mes`,
      extra: currency !== main ? approx(state, item.reserved, currency) : "",
      action: "loan-detail",
      id: loan.id,
    }));
  }
  rows = group("Presupuestos", summary.envelopes.amount, "#/presupuestos");
  for (const { budget, amount } of summary.envelopes.items) {
    rows.push(flowRow({ emoji: budget.icon, color: "var(--action)", text: html`<strong>${m(amount)}</strong> reservados para ${budget.name}`, meta: "Lo que te falta gastar este mes", href: "#/presupuestos" }));
  }
  rows = group("Fondo de facturas", summary.cushion.amount, "#/facturas");
  if (summary.cushion.amount > 0) {
    rows.push(flowRow({ emoji: "🛟", color: "var(--bill)", text: html`<strong>${m(summary.cushion.amount)}</strong> en el fondo de facturas`, meta: "Lo que sobró al pagar facturas", href: "#/facturas" }));
  }
  rows = group("Metas", summary.inGoals, "#/metas");
  for (const goal of state.goals) {
    const saved = goalSaved(goal);
    if (!(saved > 0)) continue;
    rows.push(flowRow({ emoji: goal.icon, color: goal.color, text: html`<strong>${m(saved, goal.currency)}</strong> apartados en ${goal.name}`, meta: "Meta", extra: goal.currency !== main ? approx(state, saved, goal.currency) : "", action: "goal-detail", id: goal.id }));
  }
  return groups.filter((g) => g.rows.length);
}

/** El mes que viene: lo que hay que pagar, lo que ya tienes y lo que falta juntar. */
function nextMonthCard(state, today) {
  const plan = nextMonthPlan(state, today);
  if (!plan.items.length) return "";
  const main = state.settings.mainCurrency;
  const m = (n) => formatMoney(n, main);
  const month = midSentence(formatMonth(plan.key).split(" ")[0]);
  const verdict = plan.income > 0
    ? plan.afterIncome >= 0
      ? html`<p class="next-verdict is-ok">${msg`Con lo que esperas cobrar te alcanza: te sobrarían ${m(plan.afterIncome)}.`}</p>`
      : html`<p class="next-verdict is-short">${msg`Aun con lo que esperas cobrar te faltarían ${m(-plan.afterIncome)}.`}</p>`
    : plan.missing > 0
      ? html`<p class="next-verdict is-short">${msg`Te falta juntar ${m(plan.missing)}.`} <span>Si cargas tu sueldo como ingreso que se repite, la cuenta lo tiene en cuenta.</span></p>`
      : html`<p class="next-verdict is-ok">Ya lo tienes cubierto con lo que te sobra de este mes.</p>`;
  const label = { bill: "Factura", scheduled: "Cuota o gasto programado", debt: "Deuda que vence", setAside: "Apartar para la deuda", budget: "Presupuesto reservado" };
  return html`<section class="card next-month reveal" aria-labelledby="flow-next-title">
    <h2 id="flow-next-title" class="section-title">${msg`El mes que viene (${month})`}</h2>
    <dl class="flow-lines">
      <div class="flow-line"><dt>Vas a tener que pagar</dt><dd>${m(plan.needs)}</dd></div>
      <div class="flow-line"><dt>Te sobra hoy de este mes</dt><dd>${m(plan.have)}</dd></div>
      ${plan.income > 0 ? html`<div class="flow-line"><dt>Ingresos que se repiten</dt><dd>+ ${m(plan.income)}</dd></div>` : ""}
    </dl>
    ${verdict}
    <details class="next-detail">
      <summary>${msg`Ver lo que hay que pagar (${plan.items.length})`}</summary>
      <div class="flow-list">
        ${plan.items.map((i) => flowRow({
          emoji: i.icon || (i.kind === "debt" || i.kind === "setAside" ? "🤝" : "🗓️"),
          color: i.kind === "bill" ? "var(--bill)" : i.kind === "budget" ? "var(--action)" : i.kind === "scheduled" ? "var(--expense)" : "var(--goal)",
          text: html`<strong>${formatMoney(i.amount, i.currency)}</strong> · ${i.name || label[i.kind]}`,
          meta: [tr(label[i.kind]), i.kind === "budget" || i.kind === "setAside" ? "" : formatDate(i.date)].filter(Boolean).join(" · "),
          extra: i.currency !== main ? approx(state, i.amount, i.currency) : "",
        }))}
      </div>
    </details>
  </section>`;
}

/** Lo que pasó este mes, de lo más nuevo a lo más viejo. */
function monthEvents(state, today) {
  const { start } = monthRange(monthKey(today));
  const events = [];
  const inMonth = (date) => date >= start && date <= today;
  const m = (n, currency) => formatMoney(n, currency);

  for (const tx of state.transactions) {
    if (!inMonth(tx.date)) continue;
    const where = accountName(state, tx.accountId);
    const when = tr(shortDay(tx.date));
    let row;
    if (tx.type === "expense" || tx.type === "income") {
      const category = findCategory(state, tx.categoryId);
      const name = tx.description || findSubcategory(category, tx.subcategoryId)?.name || category?.name || (tx.type === "income" ? "Ingreso" : "Gasto");
      const amount = m(tx.amount, tx.currency);
      const text =
        tx.type === "income" ? html`Entraron <strong>${amount}</strong> por ${name}` : tx.billId ? html`Pagaste ${name}: <strong>${amount}</strong>` : html`<strong>${amount}</strong> se usaron en ${name}`;
      row = flowRow({ emoji: category?.icon || (tx.type === "income" ? "💰" : "🧾"), color: category?.color || "var(--brand)", text, meta: [where, when].filter(Boolean).join(" · "), action: "edit-tx", id: tx.id });
    } else if (tx.type === "transfer") {
      row = flowRow({ emoji: "🔁", text: html`Pasaste <strong>${m(tx.amount, tx.currency)}</strong> de ${accountName(state, tx.accountId)} a ${accountName(state, tx.toAccountId)}`, meta: when, action: "edit-tx", id: tx.id });
    } else if (tx.type === "loan") {
      const loan = (state.loans || []).find((l) => l.id === tx.loanId);
      if (!loan) continue;
      const amount = m(tx.amount, tx.currency);
      const cost = tx.accountAmount > 0 ? m(tx.accountAmount, tx.accountCurrency) : "";
      const first = loan.txId === tx.id;
      let text;
      if (first) text = loan.direction === "lent" ? html`Le prestaste <strong>${amount}</strong> a ${loan.person}` : html`${loan.person} te prestó <strong>${amount}</strong>`;
      else if (loan.direction === "lent") text = cost ? html`${loan.person} te devolvió <strong>${amount}</strong> (entraron ${cost})` : html`${loan.person} te devolvió <strong>${amount}</strong>`;
      else text = cost ? html`Le devolviste <strong>${amount}</strong> a ${loan.person} (te costó ${cost})` : html`Le devolviste <strong>${amount}</strong> a ${loan.person}`;
      row = flowRow({ emoji: "🤝", color: "var(--goal)", text, meta: [where, when].filter(Boolean).join(" · "), action: "loan-detail", id: loan.id });
    }
    if (row) events.push({ date: tx.date, at: tx.createdAt || "", row });
  }

  for (const goal of state.goals) {
    for (const mv of goal.movements) {
      if (!inMonth(mv.date)) continue;
      const amount = m(Math.abs(mv.amount), goal.currency);
      const text = mv.amount > 0 ? html`Apartaste <strong>${amount}</strong> para ${goal.name}` : html`Sacaste <strong>${amount}</strong> de ${goal.name}`;
      events.push({ date: mv.date, at: "", row: flowRow({ emoji: goal.icon, color: goal.color, text, meta: tr(shortDay(mv.date)), action: "goal-detail", id: goal.id }) });
    }
  }

  // "Apartar por mes": cada mes se aparta ese monto para la deuda.
  for (const loan of state.loans || []) {
    if (!(loan.saveMonthly > 0) || !loan.saveSince || loan.plan || loan.saveSince > today) continue;
    const status = loanSetAsideStatus(state, loan, Math.max(0, loan.amount - loan.payments.reduce((s, p) => s + p.amount, 0)), today);
    if (!(status.saved > 0)) continue;
    const date = loan.saveSince > start ? loan.saveSince : start;
    events.push({ date, at: "", row: flowRow({ emoji: "🤝", color: "var(--goal)", text: html`Se apartaron <strong>${m(loan.saveMonthly, status.currency)}</strong> para devolverle a ${loan.person}`, meta: tr(shortDay(date)), action: "loan-detail", id: loan.id }) });
  }

  return events.sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at)).map((e) => e.row);
}

export default {
  id: "tu-dinero",
  tab: "inicio",
  title: "Tu dinero",
  back: "#/inicio",
  render(state) {
    const today = todayISO();
    const main = state.settings.mainCurrency;
    const m = (n) => formatMoney(n, main);
    const summary = balanceSummary(state, today);
    const reserved = reservedGroups(state, summary, today);
    const events = monthEvents(state, today);
    const shown = events.slice(0, 40);

    return html`
      <section class="card flow-sum reveal" aria-labelledby="flow-sum-title">
        <h1 class="flow-title">¿A dónde va tu dinero?</h1>
        <h2 id="flow-sum-title" class="section-title">Así se calcula tu disponible</h2>
        <dl class="flow-lines">
          <div class="flow-line"><dt>Tienes en tus cuentas</dt><dd>${m(summary.total)}</dd></div>
          <div class="flow-line is-minus"><dt>Apartado en metas</dt><dd>− ${m(summary.inGoals)}</dd></div>
          <div class="flow-line is-minus"><dt>Reservado para pagos</dt><dd>− ${m(summary.reserved)}</dd></div>
          <div class="flow-line is-total"><dt>Disponible</dt><dd>${m(summary.available)}</dd></div>
        </dl>
        <p class="fine-print">Lo apartado y lo reservado sigue en tus cuentas: solo deja de contar como disponible para que no lo gastes.</p>
      </section>

      <section class="card reveal" aria-labelledby="flow-reserved-title">
        <h2 id="flow-reserved-title" class="section-title">Lo apartado y reservado</h2>
        ${reserved.length
          ? reserved.map((g) => html`<h3 class="flow-group"><a href="${g.href}">${g.title}</a><span>${m(g.total)}</span></h3><div class="flow-list">${g.rows}</div>`)
          : html`<p class="sheet-text">Por ahora no hay nada apartado ni reservado: todo tu dinero está disponible.</p>`}
      </section>

      ${nextMonthCard(state, today)}

      <section class="card reveal" aria-labelledby="flow-month-title">
        <h2 id="flow-month-title" class="section-title">Lo que pasó este mes</h2>
        ${shown.length ? html`<div class="flow-list">${shown}</div>` : html`<p class="sheet-text">Todavía no hay movimientos este mes.</p>`}
        <a class="inline-link flow-more" href="#/transacciones">${icon("list", 16)} Ver todos los movimientos</a>
      </section>
    `;
  },
};
