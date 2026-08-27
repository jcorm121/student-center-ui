const assert = require("node:assert/strict");

require("../src/content/enrollment.js");

const {
  conflictingCourses,
  meetingsOverlap,
  normalizeAvailability,
  optionMatchesSubject,
  parseClassQuery,
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

assert.equal(normalizeAvailability("Status: Open"), "Open");
assert.equal(normalizeAvailability("Wait List"), "Wait list");
assert.equal(normalizeAvailability(""), "Unknown");

const enrolled = [{ code: "MATH 2940", day: "Mo", start: 795, end: 850 }];
const candidate = [{ code: "CS 3110", day: "Mo", start: 795, end: 855 }];
assert.equal(meetingsOverlap(candidate[0], enrolled[0]), true);
assert.deepEqual(conflictingCourses(candidate, enrolled), ["MATH 2940"]);

console.log("enrollment helper tests passed");
