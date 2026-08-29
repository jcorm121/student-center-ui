const assert = require("node:assert/strict");

require("../src/content/enrollment.js");

const {
  conflictingCourses,
  meetingsOverlap,
  mergeSelectedScheduleRows,
  normalizeAvailability,
  optionMatchesSubject,
  parseClassQuery,
  parseRelatedRequirement,
  parseSelectedSectionSummary,
  parseSectionLabel
} = globalThis.SCU.enrollment;

assert.deepEqual(parseClassQuery("CS 4820"), {
  raw: "CS 4820",
  classNumber: "",
  subject: "CS",
  courseNumber: "4820"
});

assert.deepEqual(parseClassQuery("ILR"), {
  raw: "ILR",
  classNumber: "",
  subject: "ILR",
  courseNumber: ""
});

assert.deepEqual(parseClassQuery("#17325"), {
  raw: "#17325",
  classNumber: "17325",
  subject: "",
  courseNumber: ""
});

assert.equal(optionMatchesSubject({ value: "CS", textContent: "Computer Science" }, "CS"), true);
assert.equal(optionMatchesSubject({ value: "", textContent: "CS - Computer Science" }, "CS"), true);
assert.equal(optionMatchesSubject({ value: "ILR", textContent: "Industrial Labor Relations" }, "CS"), false);

assert.deepEqual(parseSectionLabel("001-LEC Regular"), {
  raw: "001-LEC Regular",
  section: "001",
  component: "LEC",
  type: "Lecture"
});
assert.equal(parseSectionLabel("201-DIS Regular").type, "Discussion");
assert.equal(parseSectionLabel("801-SEM Regular").type, "");

assert.equal(parseRelatedRequirement("Select Discussion section (Required):"), "Discussion");
assert.equal(
  parseRelatedRequirement("Choose a classes to add - related class sections Fall 2026"),
  ""
);
assert.deepEqual(
  parseSelectedSectionSummary(
    "Lecture selected Section 001 MoWeFr 1:25PM - 2:15PM Baker Laboratory 200",
    "CS 3110"
  ),
  {
    courseText: "CS 3110-001 LEC",
    scheduleText: "MoWeFr 1:25PM - 2:15PM Baker Laboratory 200",
    statusText: "Selected for enrollment",
    dropped: false
  }
);
assert.deepEqual(
  parseSelectedSectionSummary(
    "Discussion selected Section 201 Mo 2:55PM - 4:10PM Hollister Hall 306",
    "CS 3110"
  ),
  {
    courseText: "CS 3110-201 DIS",
    scheduleText: "Mo 2:55PM - 4:10PM Hollister Hall 306",
    statusText: "Selected for enrollment",
    dropped: false
  }
);
const cachedRows = [
  { courseText: "MATH 2940-002 LEC (11567)", scheduleText: "MoWeFr 12:20PM - 1:10PM" }
];
const selectedLecture = parseSelectedSectionSummary(
  "Lecture selected Section 001 MoWeFr 1:25PM - 2:15PM Baker Laboratory 200",
  "CS 3110"
);
assert.deepEqual(mergeSelectedScheduleRows(cachedRows, selectedLecture), [...cachedRows, selectedLecture]);
assert.deepEqual(
  mergeSelectedScheduleRows([...cachedRows, selectedLecture], selectedLecture),
  [...cachedRows, selectedLecture]
);

assert.equal(normalizeAvailability("Status: Open"), "Open");
assert.equal(normalizeAvailability("Wait List"), "Wait list");
assert.equal(normalizeAvailability(""), "Unknown");

const enrolled = [{ code: "MATH 2940", day: "Mo", start: 795, end: 850 }];
const candidate = [{ code: "CS 3110", day: "Mo", start: 795, end: 855 }];
assert.equal(meetingsOverlap(candidate[0], enrolled[0]), true);
assert.deepEqual(conflictingCourses(candidate, enrolled), ["MATH 2940"]);
assert.deepEqual(
  conflictingCourses(candidate, [...enrolled, { code: "CS 3110", day: "Mo", start: 780, end: 900 }], ["CS 3110"]),
  ["MATH 2940"]
);

console.log("enrollment helper tests passed");
