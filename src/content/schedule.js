(() => {
  const DAY_CODES = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  const DAY_LABELS = {
    Mo: "Mon",
    Tu: "Tue",
    We: "Wed",
    Th: "Thu",
    Fr: "Fri",
    Sa: "Sat",
    Su: "Sun"
  };

  function normalize(value) {
    return String(value ?? "")
      .replace(/[–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseClock(value) {
    const match = normalize(value).match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
    if (!match) return null;

    let hour = Number(match[1]) % 12;
    const minute = Number(match[2]);
    if (match[3].toUpperCase() === "PM") hour += 12;
    return hour * 60 + minute;
  }

  function formatClock(totalMinutes) {
    const hour24 = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour12 = hour24 % 12 || 12;
    return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
  }

  function parseCourse(value) {
    const text = normalize(value);
    const code = text.match(/\b([A-Z&]{2,8}\s*\d{3,4}(?:-\d{3})?)\b/)?.[1] ?? text;
    const component = text.match(/\b(LEC|DIS|LAB|PRJ|SEM|IND|RSC|FLD|STU)\b/)?.[1] ?? "Class";
    const classNumber = text.match(/\((\d+)\)/)?.[1] ?? "";

    return {
      code: code.replace(/\s+/g, " "),
      component,
      classNumber,
      raw: text
    };
  }

  function parseDaySequence(value) {
    return value.match(/Mo|Tu|We|Th|Fr|Sa|Su/g) ?? [];
  }

  function parseMeetings(scheduleText, course) {
    const text = normalize(scheduleText);
    const pattern = /((?:(?:Mo|Tu|We|Th|Fr|Sa|Su))+)[, ]+(\d{1,2}:\d{2}[AP]M)\s*-\s*(\d{1,2}:\d{2}[AP]M)/gi;
    const matches = [...text.matchAll(pattern)];
    const candidates = [];

    matches.forEach((match, index) => {
      const days = parseDaySequence(match[1]);
      const start = parseClock(match[2]);
      const end = parseClock(match[3]);
      const nextStart = matches[index + 1]?.index ?? text.length;
      const location = normalize(text.slice((match.index ?? 0) + match[0].length, nextStart))
        .replace(/^(?:at|in)\s+/i, "")
        .replace(/\b(?:TBA|No Room)\b/gi, "")
        .trim();

      if (start === null || end === null || end <= start) return;

      days.forEach((day) => {
        candidates.push({
          ...course,
          day,
          dayLabel: DAY_LABELS[day],
          start,
          end,
          location,
          specificity: days.length
        });
      });
    });

    // A dedicated day entry (for example, Friday in a different room) should
    // override the broader MoWeFr entry for the same class and time.
    const deduped = new Map();
    candidates.forEach((meeting) => {
      const key = `${meeting.code}|${meeting.day}|${meeting.start}|${meeting.end}`;
      const current = deduped.get(key);
      if (!current || meeting.specificity <= current.specificity) {
        deduped.set(key, meeting);
      }
    });

    return [...deduped.values()].sort((a, b) => {
      return DAY_CODES.indexOf(a.day) - DAY_CODES.indexOf(b.day) || a.start - b.start;
    });
  }

  function buildSchedule(rows) {
    const courses = rows.map((row) => ({
      ...parseCourse(row.courseText),
      scheduleText: normalize(row.scheduleText)
    }));
    const meetings = courses.flatMap((course) => parseMeetings(course.scheduleText, course));
    const scheduledCodes = new Set(meetings.map((meeting) => meeting.code));
    const unscheduled = courses.filter((course) => !scheduledCodes.has(course.code));

    const earliest = meetings.length ? Math.min(...meetings.map((meeting) => meeting.start)) : 9 * 60;
    const latest = meetings.length ? Math.max(...meetings.map((meeting) => meeting.end)) : 17 * 60;
    const startMinute = Math.min(9 * 60, Math.floor(earliest / 60) * 60);
    const endMinute = Math.max(17 * 60, Math.ceil(latest / 60) * 60);

    return {
      courses,
      meetings,
      unscheduled,
      startMinute,
      endMinute,
      dayCodes: DAY_CODES.slice(0, 5),
      dayLabels: DAY_LABELS
    };
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.schedule = {
    buildSchedule,
    formatClock,
    normalize,
    parseClock,
    parseCourse,
    parseMeetings
  };
})();

