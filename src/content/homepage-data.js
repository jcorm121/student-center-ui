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

  function academicToolGroup(label) {
    if (/^Enrollment:\s*(?:Add|Drop|Edit|Swap)$/i.test(label)) return "Enrollment";
    if (/^(?:Course History|Enrollment Verification|Grades|Transcript:|Transfer Credit:)/i.test(label)) {
      return "Records";
    }
    if (/^(?:Academic Planner|Academic Requirements|Class Schedule)$/i.test(label)) return "Planning";
    return "More";
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.homepage = { academicToolGroup, formatMoney, parseFinancialSummary };
})();
