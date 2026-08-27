const assert = require("node:assert/strict");

require("../src/content/enrollment.js");

const { optionMatchesSubject, parseClassQuery } = globalThis.SCU.enrollment;

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

console.log("enrollment helper tests passed");
