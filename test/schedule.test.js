const assert = require("node:assert/strict");

require("../src/content/schedule.js");

const { buildSchedule, parseClock, parseCourse, parseMeetings } = globalThis.SCU.schedule;

assert.equal(parseClock("10:10AM"), 610);
assert.equal(parseClock("12:30PM"), 750);
assert.equal(parseClock("12:05AM"), 5);

assert.deepEqual(parseCourse("CS 1234-001 LEC (4567)"), {
  code: "CS 1234",
  id: "CS 1234-001",
  section: "001",
  type: "Lecture",
  component: "LEC",
  classNumber: "4567",
  raw: "CS 1234-001 LEC (4567)"
});

assert.equal(parseCourse("CS 1234-201 DIS (4568)").type, "Discussion");
assert.equal(parseCourse("CS 1234-401 LAB (4569)").type, "Lab");
assert.equal(parseCourse("CS 1234-601 PRJ (4570)").type, "Project");
assert.equal(parseCourse("CS 1234-801 SEM (4571)").type, "");

const splitRoomMeetings = parseMeetings(
  "MoWeFr 10:10AM - 11:00AM North Hall 101 Fr 10:10AM - 11:00AM South Hall 202",
  parseCourse("INFO 1234-001 LEC (4567)")
);

assert.equal(splitRoomMeetings.length, 3);
assert.equal(splitRoomMeetings.find((meeting) => meeting.day === "Fr").location, "South Hall 202");

const schedule = buildSchedule([
  {
    courseText: "INFO 1234-001 LEC (4567)",
    scheduleText: "MoWe 9:05AM - 9:55AM North Hall 101"
  },
  {
    courseText: "INFO 1234-601 PRJ (8910)",
    scheduleText: "TBA No Room"
  }
]);

assert.equal(schedule.meetings.length, 2);
assert.equal(schedule.unscheduled.length, 1);
assert.equal(schedule.unscheduled[0].code, "INFO 1234");
assert.equal(schedule.unscheduled[0].type, "Project");
assert.equal(schedule.startMinute, 540);
assert.equal(schedule.endMinute, 1020);

console.log("schedule parser tests passed");
