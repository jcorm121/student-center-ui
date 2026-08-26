(() => {
  function formatMoney(value) {
    if (!value) return "—";
    const amount = Number(String(value).replace(/,/g, ""));
    if (!Number.isFinite(amount)) return String(value);

    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(amount);
  }

  function parseFinancialSummary(value) {
    const text = globalThis.SCU.schedule.normalize(value);
    const capture = (pattern) => text.match(pattern)?.[1] ?? "";
    const balance = capture(/You owe\s+\$?([\d,]+(?:\.\d{2})?)/i);
    const dueNow = capture(/Due Now\s+\$?([\d,]+(?:\.\d{2})?)/i);
    const futureDue = capture(/Future Due\s+\$?([\d,]+(?:\.\d{2})?)/i);

    return {
      available: Boolean(balance || dueNow || futureDue),
      balance: formatMoney(balance),
      dueNow: formatMoney(dueNow),
      futureDue: formatMoney(futureDue),
      pastDue: /past due balance/i.test(text)
    };
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.homepage = { formatMoney, parseFinancialSummary };
})();
