(() => {
  function parseClassQuery(value) {
    const raw = String(value ?? "").replace(/\s+/g, " ").trim();
    const normalized = raw.toUpperCase();
    const classNumberMatch = normalized.match(/^(?:CLASS\s*)?#?(\d{5})$/);

    if (classNumberMatch) {
      return {
        raw,
        classNumber: classNumberMatch[1],
        subject: "",
        courseNumber: ""
      };
    }

    const courseMatch = normalized.match(/^([A-Z&]{2,8})(?:\s+|-)?(\d{3,4})?$/);
    return {
      raw,
      classNumber: "",
      subject: courseMatch?.[1] ?? "",
      courseNumber: courseMatch?.[2] ?? ""
    };
  }

  function optionMatchesSubject(option, subject) {
    if (!option || !subject) return false;
    const target = subject.toUpperCase();
    const value = String(option.value ?? "").trim().toUpperCase();
    const label = String(option.textContent ?? "").replace(/\s+/g, " ").trim().toUpperCase();
    if (value === target || label === target) return true;
    return new RegExp(`(^|[^A-Z])${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z]|$)`).test(label);
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.enrollment = { optionMatchesSubject, parseClassQuery };
})();
