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

  function parseRelatedRequirement(value) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text.match(/^Select\s+(.+?)\s+section\s*\(Required\)\s*:?$/i)?.[1]?.trim() ?? "";
  }

  function parseSelectedSectionSummary(value, courseCode) {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    const match = text.match(
      /\b(Lecture|Discussion|Lab|Project)\s+selected\s+Section\s+(\d{3})\s+((?:(?:Mo|Tu|We|Th|Fr|Sa|Su))+\s+\d{1,2}:\d{2}\s*[AP]M\s*-\s*\d{1,2}:\d{2}\s*[AP]M)\s+(.+)$/i
    );
    if (!match || !courseCode) return null;
    const component = {
      lecture: "LEC",
      discussion: "DIS",
      lab: "LAB",
      project: "PRJ"
    }[match[1].toLowerCase()] ?? "";
    const location = match[4].replace(/\s+(?:Open|Closed|Wait List)\b.*$/i, "").trim();
    return {
      courseText: `${courseCode}-${match[2]} ${component}`.trim(),
      scheduleText: `${match[3]} ${location}`.trim(),
      statusText: "Selected for enrollment",
      dropped: false
    };
  }

  function mergeSelectedScheduleRows(rows, selectedRow) {
    const current = Array.isArray(rows) ? rows : [];
    if (!selectedRow) return [...current];
    const rowId = (row) => {
      const match = String(row?.courseText ?? "").match(/\b([A-Z&]{2,8})\s*(\d{3,4})-(\d{3})\b/i);
      return match ? `${match[1].toUpperCase()} ${match[2]}-${match[3]}` : "";
    };
    const selectedId = rowId(selectedRow);
    if (selectedId && current.some((row) => rowId(row) === selectedId)) return [...current];
    return [...current, selectedRow];
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

  function conflictingCourses(candidateMeetings, enrolledMeetings, ignoredCodes = []) {
    const ignored = new Set(ignoredCodes);
    const codes = new Set();
    candidateMeetings.forEach((candidate) => {
      enrolledMeetings.forEach((enrolled) => {
        if (meetingsOverlap(candidate, enrolled) && !ignored.has(enrolled.code)) {
          codes.add(enrolled.code);
        }
      });
    });
    return [...codes];
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.enrollment = {
    conflictingCourses,
    meetingsOverlap,
    mergeSelectedScheduleRows,
    normalizeAvailability,
    optionMatchesSubject,
    parseClassQuery,
    parseRelatedRequirement,
    parseSelectedSectionSummary,
    parseSectionLabel
  };
})();
