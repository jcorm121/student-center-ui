const assert = require("node:assert/strict");

require("../src/content/schedule.js");
require("../src/content/homepage-data.js");

const { academicToolGroup, parseFinancialSummary } = globalThis.SCU.homepage;

assert.deepEqual(
  parseFinancialSummary(
    "You owe 1,250.00. Due Now 250.00 Future Due 1,000.00. You have a past due balance of 250.00."
  ),
  {
    available: true,
    balance: "$1,250.00",
    dueNow: "$250.00",
    futureDue: "$1,000.00",
    pastDue: true
  }
);

assert.deepEqual(parseFinancialSummary("No account information available"), {
  available: false,
  balance: "—",
  dueNow: "—",
  futureDue: "—",
  pastDue: false
});

assert.equal(academicToolGroup("Academic Requirements"), "Planning");
assert.equal(academicToolGroup("Enrollment: Swap"), "Enrollment");
assert.equal(academicToolGroup("Transcript: View Unofficial"), "Records");
assert.equal(academicToolGroup("A Future Cornell Tool"), "More");

console.log("homepage data tests passed");
