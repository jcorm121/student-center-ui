(() => {
  const SECTION_TYPES = {
    0: "Lecture",
    2: "Discussion",
    4: "Lab",
    6: "Project"
  };

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

  function parseSectionLabel(value) {
    const raw = String(value ?? "").replace(/\s+/g, " ").trim();
    const match = raw.match(/\b(\d{3})(?:-([A-Z]+))?\b/i);
    const section = match?.[1] ?? "";
    return {
      raw,
      section,
      component: match?.[2]?.toUpperCase() ?? "",
      type: section ? SECTION_TYPES[section.charAt(0)] ?? "" : ""
    };
  }

  function normalizeAvailability(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    if (/wait\s*list/i.test(text)) return "Wait list";
    if (/closed/i.test(text)) return "Closed";
    if (/open/i.test(text)) return "Open";
    return "Unknown";
  }

  function meetingsOverlap(first, second) {
    return first?.day === second?.day && first.start < second.end && second.start < first.end;
  }

  function conflictingCourses(candidateMeetings, enrolledMeetings) {
    const codes = new Set();
    candidateMeetings.forEach((candidate) => {
      enrolledMeetings.forEach((enrolled) => {
        if (meetingsOverlap(candidate, enrolled)) codes.add(enrolled.code);
      });
    });
    return [...codes];
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.enrollment = {
    conflictingCourses,
    meetingsOverlap,
    normalizeAvailability,
    optionMatchesSubject,
    parseClassQuery,
    parseSectionLabel
  };
})();
