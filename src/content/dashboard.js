(() => {
  const ROOT_ID = "scu-extension-root";
  const RETURN_ID = "scu-return-modern";
  const SCHEDULE_CACHE_KEY = "scu-schedule-cache-v1";
  const SEARCH_CACHE_KEY = "scu-pending-class-search-v1";
  const PAGE_ACTION_EVENT = "scu:invoke-page-action";
  const ACTION_LABELS = ["Search", "Plan", "Enroll", "My Academics"];
  const COLORS = ["blue", "violet", "teal", "orange", "rose", "indigo"];
  let lastSignature = "";
  let sourceDocuments = [document];

  const normalize = (value) => globalThis.SCU.schedule.normalize(value);

  function ownLabel(element) {
    if (!element) return "";
    if (element.tagName === "INPUT") return normalize(element.value);
    return normalize(element.textContent);
  }

  function collectDocuments(rootDocument = document, collected = []) {
    if (!rootDocument?.documentElement || collected.includes(rootDocument)) return collected;
    collected.push(rootDocument);

    rootDocument.querySelectorAll("iframe, frame").forEach((frame) => {
      try {
        collectDocuments(frame.contentDocument, collected);
      } catch {
        // Cross-origin frames are independently handled by all_frames injection.
      }
    });

    return collected;
  }

  function interactiveElements() {
    return sourceDocuments.flatMap((sourceDocument) => {
      return [...sourceDocument.querySelectorAll("a, button, input[type='button'], input[type='submit']")];
    }).filter((element) => !element.closest(`#${ROOT_ID}, #${RETURN_ID}`));
  }

  function sourceText() {
    return normalize(sourceDocuments.map((sourceDocument) => {
      if (!sourceDocument.body) return "";
      return [...sourceDocument.body.childNodes]
        .filter((node) => node !== sourceDocument.getElementById(ROOT_ID))
        .filter((node) => node !== sourceDocument.getElementById(RETURN_ID))
        .map((node) => node.textContent ?? "")
        .join(" ");
    }).join(" "));
  }

  function findAction(label, mode = "exact") {
    const target = normalize(label).toLowerCase();
    return interactiveElements().find((element) => {
      const candidate = ownLabel(element).toLowerCase();
      return mode === "contains" ? candidate.includes(target) : candidate === target;
    }) ?? null;
  }

  function findButtonAction(label) {
    const target = normalize(label).toLowerCase();
    return interactiveElements().filter((element) => {
      if (element.tagName === "A") return false;
      return ownLabel(element).toLowerCase() === target;
    }).at(-1) ?? null;
  }

  function findSourceElement(selector) {
    for (const sourceDocument of sourceDocuments) {
      const element = sourceDocument.querySelector(selector);
      if (element && !element.closest(`#${ROOT_ID}`)) return element;
    }
    return null;
  }

  function findPeopleSoftControl(tagName, idPrefix) {
    return findSourceElement(`${tagName}[id^="${idPrefix}"]`);
  }

  function findCriteriaSearchAction() {
    return findPeopleSoftControl("input", "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH") ??
      findButtonAction("Search");
  }

  function findCriteriaClearAction() {
    return findPeopleSoftControl("input", "CLASS_SRCH_WRK2_SSR_PB_CLEAR") ??
      findButtonAction("Clear");
  }

  function pageKind() {
    const text = sourceText();
    if (
      /Search Results|class section\(s\) found/i.test(text) &&
      findSourceElement("input[id^='SSR_PB_SELECT$']")
    ) return "class-results";
    if (findPeopleSoftControl("input", "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH")) return "class-search";
    if (
      findPeopleSoftControl("input", "DERIVED_REGFRM1_SSR_PB_SRCH") ||
      findPeopleSoftControl("input", "DERIVED_REGFRM1_CLASS_NBR")
    ) return "add-classes";
    if (!/Enrollment:\s*Add Classes/i.test(text)) return "home";
    return "enrollment-step";
  }

  function readSessionValue(key, fallback) {
    try {
      const value = window.sessionStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeSessionValue(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The workflow still works without continuity if storage is unavailable.
    }
  }

  function removeSessionValue(key) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      // Ignore unavailable storage.
    }
  }

  function findTextElement(label) {
    const target = normalize(label);

    for (const sourceDocument of sourceDocuments) {
      if (!sourceDocument.body) continue;
      const walker = sourceDocument.createTreeWalker(
        sourceDocument.body,
        NodeFilter.SHOW_TEXT
      );
      let node = walker.nextNode();

      while (node) {
        if (normalize(node.nodeValue) === target && !node.parentElement?.closest(`#${ROOT_ID}`)) {
          return node.parentElement;
        }
        node = walker.nextNode();
      }
    }

    return null;
  }

  function extractLabeledValue(label) {
    const element = findTextElement(label);
    if (!element) return "";

    const siblings = [...(element.parentNode?.childNodes ?? [])];
    const siblingIndex = siblings.indexOf(element);
    const trailingText = normalize(siblings.slice(siblingIndex + 1)
      .map((node) => node.textContent ?? "")
      .join(" "));
    if (trailingText && trailingText.length < 240) {
      return trailingText.replace(/\b(?:Details|Edit)\b\s*$/i, "").trim();
    }

    let container = element;
    for (let depth = 0; depth < 5 && container; depth += 1) {
      const text = ownLabel(container);
      if (text.startsWith(label) && text.length > label.length && text.length < 240) {
        return normalize(text.slice(label.length))
          .replace(/\b(?:Details|Edit)\b\s*$/i, "")
          .trim();
      }
      container = container.parentElement;
    }

    return "";
  }

  function findNearbyAction(label, actionLabel) {
    const element = findTextElement(label);
    if (!element) return null;

    let container = element.parentElement;
    for (let depth = 0; depth < 7 && container; depth += 1) {
      const action = [...container.querySelectorAll("a, button, input[type='button'], input[type='submit']")]
        .find((candidate) => ownLabel(candidate) === actionLabel);
      if (action) return action;
      container = container.parentElement;
    }

    return null;
  }

  function nearbyControls(label, selector) {
    const element = findTextElement(label);
    if (!element) return [];

    const sourceDocument = element.ownerDocument;
    const htmlLabel = element.closest("label");
    const labelledControl = htmlLabel?.htmlFor ? sourceDocument.getElementById(htmlLabel.htmlFor) : null;
    if (labelledControl?.matches(selector)) return [labelledControl];

    let container = element.parentElement;
    for (let depth = 0; depth < 7 && container; depth += 1) {
      const matches = [...container.querySelectorAll(selector)]
        .filter((candidate) => !candidate.closest(`#${ROOT_ID}`));
      if (matches.length) return matches;
      container = container.parentElement;
    }
    return [];
  }

  function dispatchControlChange(control) {
    const EventConstructor = control.ownerDocument.defaultView.Event;
    control.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    control.dispatchEvent(new EventConstructor("change", { bubbles: true }));
  }

  function setControlValue(control, value) {
    if (!control) return;
    control.value = value;
    dispatchControlChange(control);
  }

  function findSearchControls() {
    const subject = findPeopleSoftControl("select", "SSR_CLSRCH_WRK_SUBJECT_SRCH") ??
      nearbyControls("Subject", "select")[0] ?? null;
    const directCourseControls = nearbyControls(
      "Course Number",
      "select, input:not([type='button']):not([type='submit']):not([type='image']):not([type='checkbox']):not([type='radio'])"
    );
    let courseControls = directCourseControls;
    if (!courseControls.some((control) => control.tagName === "INPUT")) {
      const label = findTextElement("Course Number");
      let container = label?.parentElement;
      for (let depth = 0; depth < 6 && container; depth += 1) {
        const matches = [...container.querySelectorAll(
          "select, input:not([type='button']):not([type='submit']):not([type='image']):not([type='checkbox']):not([type='radio'])"
        )].filter((candidate) => !candidate.closest(`#${ROOT_ID}`));
        if (
          matches.some((control) => control.tagName === "SELECT") &&
          matches.some((control) => control.tagName === "INPUT")
        ) {
          courseControls = matches;
          break;
        }
        container = container.parentElement;
      }
    }
    const courseOperator = findPeopleSoftControl("select", "SSR_CLSRCH_WRK_SSR_EXACT_MATCH1") ??
      directCourseControls.find((control) => control.tagName === "SELECT") ??
      courseControls.find((control) => control.tagName === "SELECT") ?? null;
    const courseNumber = findPeopleSoftControl("input", "SSR_CLSRCH_WRK_CATALOG_NBR") ??
      courseControls.find((control) => control.tagName === "INPUT") ?? null;
    const career = findPeopleSoftControl("select", "SSR_CLSRCH_WRK_ACAD_CAREER") ??
      nearbyControls("Course Career", "select")[0] ?? null;
    const openOnly = findSourceElement("input[type='checkbox'][id^='SSR_CLSRCH_WRK_SSR_OPEN_ONLY']") ??
      nearbyControls("Show Open Classes Only", "input[type='checkbox']")[0] ?? null;

    return { subject, courseOperator, courseNumber, career, openOnly };
  }

  function findAddSearchAction() {
    const peopleSoftAction = findPeopleSoftControl("input", "DERIVED_REGFRM1_SSR_PB_SRCH");
    if (peopleSoftAction) return peopleSoftAction;
    const local = findNearbyAction("Find Classes", "Search");
    if (local && local.tagName !== "A") return local;
    return findButtonAction("Search");
  }

  function findClassNumberControls() {
    const controls = nearbyControls(
      "Enter Class Nbr",
      "input:not([type='button']):not([type='submit']):not([type='image'])"
    );
    return {
      input: findPeopleSoftControl("input", "DERIVED_REGFRM1_CLASS_NBR") ?? controls[0] ?? null,
      submit: findPeopleSoftControl("input", "DERIVED_REGFRM1_SSR_PB_ADDTOLIST2") ??
        findNearbyAction("Enter Class Nbr", "Enter")
    };
  }

  function extractAdvisorNames() {
    const label = findTextElement("Program Advisor");
    if (!label) return [];

    let container = label.parentElement;
    for (let depth = 0; depth < 7 && container; depth += 1) {
      const hasDetails = [...container.querySelectorAll("a, button, input[type='button']")]
        .some((candidate) => ownLabel(candidate) === "Details");
      if (hasDetails) break;
      container = container.parentElement;
    }

    if (!container) return [];
    const sourceDocument = container.ownerDocument;
    const walker = sourceDocument.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const names = [];
    let node = walker.nextNode();

    while (node) {
      const value = normalize(node.nodeValue).replace(/^Program Advisor\s*/i, "").trim();
      if (
        value &&
        value.length < 100 &&
        !["Advisor", "Program Advisor", "Details"].includes(value) &&
        !names.includes(value)
      ) {
        names.push(value);
      }
      node = walker.nextNode();
    }

    if (names.length) return names;
    const fallback = extractLabeledValue("Program Advisor");
    return fallback ? [fallback] : [];
  }

  function parseFinancialSummary() {
    return globalThis.SCU.homepage.parseFinancialSummary(sourceText());
  }

  function invokeOriginal(element) {
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    activateOriginal(element);
  }

  function activateOriginal(element) {
    if (!element) return false;
    const EventConstructor = element.ownerDocument.defaultView.Event;
    const event = new EventConstructor(PAGE_ACTION_EVENT, {
      bubbles: false,
      cancelable: true
    });
    const handledInPage = !element.dispatchEvent(event);
    if (!handledInPage) element.click();
    return true;
  }

  function createActionButton(label, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = options.className ?? "scu-nav-button";
    button.dataset.action = label;
    button.textContent = label;
    const original = findAction(options.originalLabel ?? label, options.mode);
    button.disabled = !original;
    button.addEventListener("click", () => invokeOriginal(original));
    return button;
  }

  function createSectionButton(label, targetId, iconName) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scu-nav-button";
    button.prepend(createIcon(iconName));
    button.append(label);
    button.addEventListener("click", () => {
      const root = document.getElementById(ROOT_ID);
      const target = targetId === ROOT_ID ? root : root?.querySelector(`#${targetId}`);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return button;
  }

  function createLinkRow(label, description = "", iconName = "arrow") {
    const original = findAction(label);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scu-link-row";
    button.disabled = !original;

    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = label;
    copy.append(title);

    if (description) {
      const detail = document.createElement("small");
      detail.textContent = description;
      copy.append(detail);
    }

    button.append(copy, createIcon(iconName));
    button.addEventListener("click", () => invokeOriginal(original));
    return button;
  }

  function accessibleLabel(element) {
    return normalize([
      ownLabel(element),
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.getAttribute?.("alt"),
      element.querySelector?.("img")?.getAttribute("alt"),
      element.querySelector?.("img")?.getAttribute("title")
    ].filter(Boolean).join(" "));
  }

  function findSelectMenu(label) {
    const labelElement = findTextElement(label);
    if (!labelElement) return null;
    const sourceDocument = labelElement.ownerDocument;
    const htmlLabel = labelElement.closest("label");
    let select = htmlLabel?.htmlFor ? sourceDocument.getElementById(htmlLabel.htmlFor) : null;

    if (!(select instanceof sourceDocument.defaultView.HTMLSelectElement)) {
      let container = labelElement.parentElement;
      for (let depth = 0; depth < 6 && container && !select; depth += 1) {
        select = container.querySelector("select");
        container = container.parentElement;
      }
    }

    if (!select) return null;
    const items = [...select.options]
      .map((option) => ({
        label: normalize(option.textContent),
        value: option.value
      }))
      .filter((item) => item.label);

    return { label, select, items };
  }

  function findSelectTrigger(select, menuLabel = "") {
    const sourceDocument = select.ownerDocument;
    const exactTriggerIds = {
      "Other Academic Information": "DERIVED_SSS_SCL_SSS_GO_1"
    };
    const exactTriggerId = exactTriggerIds[menuLabel];
    const exactTrigger = exactTriggerId ? sourceDocument.getElementById(exactTriggerId) : null;
    if (exactTrigger) return exactTrigger;

    const selector = "a, button, input[type='button'], input[type='image'], input[type='submit']";
    const likelyTriggers = [...sourceDocument.querySelectorAll(selector)].filter((candidate) => {
      if (candidate.closest(`#${ROOT_ID}`)) return false;
      const identity = normalize([
        candidate.id,
        candidate.getAttribute("name"),
        candidate.getAttribute("href"),
        candidate.querySelector("img")?.getAttribute("src"),
        accessibleLabel(candidate)
      ].filter(Boolean).join(" "));
      return /(?:^|[_$\s-])go(?:[_$\s-]|\d|$)|nav[_-]?go/i.test(identity);
    });

    if (likelyTriggers.length) {
      const selectRect = select.getBoundingClientRect();
      const ancestors = new Map();
      let ancestor = select;
      let depth = 0;
      while (ancestor) {
        ancestors.set(ancestor, depth);
        ancestor = ancestor.parentElement;
        depth += 1;
      }

      const score = (candidate) => {
        let candidateAncestor = candidate;
        let candidateDepth = 0;
        let treeDistance = 100;
        while (candidateAncestor) {
          if (ancestors.has(candidateAncestor)) {
            treeDistance = candidateDepth + ancestors.get(candidateAncestor);
            break;
          }
          candidateAncestor = candidateAncestor.parentElement;
          candidateDepth += 1;
        }
        const rect = candidate.getBoundingClientRect();
        const horizontal = Math.abs((rect.left + rect.right) / 2 - (selectRect.left + selectRect.right) / 2);
        const vertical = Math.abs((rect.top + rect.bottom) / 2 - (selectRect.top + selectRect.bottom) / 2);
        return treeDistance * 100 + horizontal + vertical * 2;
      };

      return likelyTriggers.sort((first, second) => score(first) - score(second))[0];
    }

    let container = select.parentElement;
    for (let depth = 0; depth < 14 && container; depth += 1) {
      const candidates = [...container.querySelectorAll(selector)]
        .filter((candidate) => !candidate.closest(`#${ROOT_ID}`));
      const labelled = candidates.find((candidate) => /\b(?:go|submit|continue)\b/i.test(accessibleLabel(candidate)));
      if (labelled) return labelled;
      if (candidates.length === 1) return candidates[0];
      container = container.parentElement;
    }
    return null;
  }

  function invokeSelectItem(menu, item) {
    const option = [...menu.select.options].find((candidate) => candidate.value === item.value);
    if (!option) return;
    const trigger = findSelectTrigger(menu.select, menu.label);
    menu.select.selectedIndex = option.index;
    const EventConstructor = menu.select.ownerDocument.defaultView.Event;
    menu.select.dispatchEvent(new EventConstructor("input", { bubbles: true }));
    menu.select.dispatchEvent(new EventConstructor("change", { bubbles: true }));
    activateOriginal(trigger);
  }

  function friendlyToolLabel(label) {
    const labels = {
      "Enrollment: Add": "Add a class",
      "Enrollment: Drop": "Drop a class",
      "Enrollment: Edit": "Edit enrollment",
      "Enrollment: Swap": "Swap classes",
      "Transcript: Request Official": "Request official transcript",
      "Transcript: View Unofficial": "View unofficial transcript",
      "Transfer Credit: Report": "Transfer credit report"
    };
    return labels[label] ?? label;
  }

  function createSelectActionRow(menu, item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scu-link-row";
    const title = document.createElement("strong");
    title.textContent = friendlyToolLabel(item.label);
    const copy = document.createElement("span");
    copy.append(title);
    button.append(copy, createIcon("arrow"));
    button.addEventListener("click", () => invokeSelectItem(menu, item));
    return button;
  }

  function appendSelectMenu(card, menuLabel, headingText) {
    const menu = findSelectMenu(menuLabel);
    if (!menu?.items.length) return;
    const section = document.createElement("section");
    section.className = "scu-card-subsection";
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    const grid = document.createElement("div");
    grid.className = "scu-link-grid";
    menu.items.forEach((item) => grid.append(createSelectActionRow(menu, item)));
    section.append(heading, grid);
    card.append(section);
  }

  function findScheduleTable() {
    const documents = collectDocuments();

    for (const sourceDocument of documents) {
      const matchingTables = [...sourceDocument.querySelectorAll("table")]
        .filter((candidate) => {
          if (candidate.closest(`#${ROOT_ID}`)) return false;
          const labels = [...candidate.querySelectorAll("th, td")].map(ownLabel);
          return labels.includes("Class") && labels.includes("Schedule");
        })
        .sort((first, second) => {
          return first.querySelectorAll("th, td").length - second.querySelectorAll("th, td").length;
        });

      const table = matchingTables[0];

      if (table) return { table, documents };
    }

    const fallbackTables = documents.flatMap((sourceDocument) => {
      return [...sourceDocument.querySelectorAll("table")]
        .filter((candidate) => !candidate.closest(`#${ROOT_ID}`))
        .map((table) => {
          const matchingRows = [...table.rows].filter((row) => {
            const text = ownLabel(row);
            return /\b[A-Z&]{2,8}\s*\d{3,4}(?:-\d{3})?\b/.test(text) &&
              (/\d{1,2}:\d{2}\s*(?:AM|PM)/i.test(text) || /\bTBA\b/i.test(text));
          });
          return { table, matchCount: matchingRows.length };
        })
        .filter((candidate) => candidate.matchCount);
    }).sort((first, second) => {
      return second.matchCount - first.matchCount ||
        first.table.querySelectorAll("th, td").length - second.table.querySelectorAll("th, td").length;
    });

    if (fallbackTables[0]) return { table: fallbackTables[0].table, documents };

    return { table: null, documents };
  }

  function extractRows(table) {
    const rows = [...table.rows];
    const header = rows.find((row) => {
      const labels = [...row.cells].map(ownLabel);
      return labels.includes("Class") && labels.includes("Schedule");
    });
    if (!header) {
      return rows.map((row) => {
        const cells = [...row.cells];
        const courseCell = cells.find((cell) => /\b[A-Z&]{2,8}\s*\d{3,4}(?:-\d{3})?\b/.test(ownLabel(cell)));
        const rowText = ownLabel(row);
        return {
          courseText: ownLabel(courseCell),
          scheduleText: rowText,
          statusText: cells.map(ownLabel).join(" ")
        };
      }).filter((row) => {
        return row.courseText &&
          (/\d{1,2}:\d{2}\s*(?:AM|PM)/i.test(row.scheduleText) || /\bTBA\b/i.test(row.scheduleText)) &&
          !/\bDropped\b/i.test(row.statusText);
      });
    }

    const labels = [...header.cells].map(ownLabel);
    const classIndex = labels.indexOf("Class");
    const scheduleIndex = labels.indexOf("Schedule");
    const statusIndex = labels.findIndex((label) => /Status/i.test(label));

    return rows.slice(rows.indexOf(header) + 1)
      .map((row) => ({
        courseText: ownLabel(row.cells[classIndex]),
        scheduleText: ownLabel(row.cells[scheduleIndex]),
        statusText: statusIndex >= 0 ? ownLabel(row.cells[statusIndex]) : ownLabel(row)
      }))
      .filter((row) => row.courseText && row.scheduleText && !/\bDropped\b/i.test(row.statusText));
  }

  function cacheScheduleRows(rows) {
    if (rows.length) writeSessionValue(SCHEDULE_CACHE_KEY, rows);
  }

  function cachedScheduleRows() {
    const rows = readSessionValue(SCHEDULE_CACHE_KEY, []);
    return Array.isArray(rows) ? rows : [];
  }

  function findCourseHeading(table) {
    const pattern = /\b([A-Z&]{2,8}\s*\d{3,4})\s*-\s*([^\n]{2,160})/i;
    let current = table;

    for (let depth = 0; depth < 8 && current; depth += 1) {
      let sibling = current.previousElementSibling;
      while (sibling) {
        const text = ownLabel(sibling);
        const match = text.length < 320 ? text.match(pattern) : null;
        if (match) {
          return {
            code: normalize(match[1]).toUpperCase(),
            title: normalize(match[2]).replace(/\s+(?:Class|Section|Days & Times).*$/i, "")
          };
        }
        sibling = sibling.previousElementSibling;
      }
      current = current.parentElement;
    }

    const query = globalThis.SCU.enrollment.parseClassQuery(pendingSearch()?.query ?? "");
    return {
      code: query.subject && query.courseNumber ? `${query.subject} ${query.courseNumber}` : "Course",
      title: ""
    };
  }

  function resultStatus(statusCell) {
    if (!statusCell) return "Unknown";
    const images = [...statusCell.querySelectorAll("img")];
    const description = [
      accessibleLabel(statusCell),
      statusCell.className,
      ...images.flatMap((image) => [image.src, image.className])
    ].join(" ");
    return globalThis.SCU.enrollment.normalizeAvailability(description);
  }

  function extractSearchResults() {
    const results = [];
    const seen = new Set();
    const tables = sourceDocuments.flatMap((sourceDocument) => {
      return [...sourceDocument.querySelectorAll("table")]
        .filter((table) => !table.closest(`#${ROOT_ID}`));
    }).sort((first, second) => {
      return first.querySelectorAll("th, td").length - second.querySelectorAll("th, td").length;
    });

    tables.forEach((table) => {
      const rows = [...table.rows];
      const header = rows.find((row) => {
        const labels = [...row.cells].map((cell) => ownLabel(cell).toLowerCase());
        return labels.includes("class") && labels.includes("section") &&
          labels.includes("days & times") && labels.includes("room") && labels.includes("status");
      });
      if (!header) return;

      const labels = [...header.cells].map((cell) => ownLabel(cell).toLowerCase());
      const indexOf = (label) => labels.indexOf(label);
      const course = findCourseHeading(table);

      rows.slice(rows.indexOf(header) + 1).forEach((row) => {
        const valueAt = (label) => {
          const index = indexOf(label);
          return index >= 0 ? ownLabel(row.cells[index]) : "";
        };
        const classNumber = valueAt("class").match(/\d{4,6}/)?.[0] ?? "";
        const sectionLabel = valueAt("section");
        if (!classNumber || !sectionLabel) return;
        const key = `${course.code}|${classNumber}|${sectionLabel}`;
        if (seen.has(key)) return;
        seen.add(key);

        const section = globalThis.SCU.enrollment.parseSectionLabel(sectionLabel);
        const daysTimes = valueAt("days & times");
        const room = valueAt("room");
        const statusIndex = indexOf("status");
        const select = [...row.querySelectorAll("a, button, input[type='button'], input[type='submit']")]
          .find((candidate) => ownLabel(candidate).toLowerCase() === "select") ?? null;
        const courseText = `${course.code}-${section.section}`;
        const courseData = globalThis.SCU.schedule.parseCourse(courseText);
        const meetings = globalThis.SCU.schedule.parseMeetings(`${daysTimes} ${room}`, courseData);

        results.push({
          key,
          courseCode: course.code,
          courseTitle: course.title,
          classNumber,
          sectionLabel,
          section: section.section,
          component: section.component,
          type: section.type,
          daysTimes,
          room,
          instructor: valueAt("instructor"),
          meetingDates: valueAt("meeting dates"),
          status: resultStatus(statusIndex >= 0 ? row.cells[statusIndex] : null),
          meetings,
          select
        });
      });
    });

    return results;
  }

  function colorFor(value) {
    const total = [...value].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return COLORS[total % COLORS.length];
  }

  function createIcon(name) {
    const icon = document.createElement("span");
    icon.className = `scu-icon scu-icon--${name}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function renderNavigation(container, kind = "home") {
    const brand = document.createElement("div");
    brand.className = "scu-brand";
    brand.innerHTML = '<span class="scu-brand-mark" aria-hidden="true">C</span><span>Student Center</span>';
    container.append(brand);

    if (kind !== "home") {
      const enrollmentLabel = document.createElement("p");
      enrollmentLabel.className = "scu-nav-label";
      enrollmentLabel.textContent = "Enrollment";
      container.append(enrollmentLabel);

      const scheduleButton = createSectionButton("Schedule and search", "scu-schedule", "plan");
      container.append(scheduleButton);
      ["My Class Schedule", "Add", "Drop", "Swap", "Edit", "Term Information"].forEach((label) => {
        const button = createActionButton(label);
        button.prepend(createIcon(label === "Add" ? "plus" : "arrow"));
        container.append(button);
      });

      const spacer = document.createElement("div");
      spacer.className = "scu-nav-spacer";
      container.append(spacer);
      const originalButton = document.createElement("button");
      originalButton.type = "button";
      originalButton.className = "scu-nav-button scu-original-button";
      originalButton.prepend(createIcon("legacy"));
      originalButton.append("Original view");
      originalButton.addEventListener("click", showOriginalView);
      container.append(originalButton);
      return;
    }

    const homeLabel = document.createElement("p");
    homeLabel.className = "scu-nav-label";
    homeLabel.textContent = "Home";
    container.append(homeLabel);

    [
      ["Overview", ROOT_ID, "overview"],
      ["Schedule", "scu-schedule", "plan"],
      ["Academic tools", "scu-academic-tools", "academics"],
      ["Finances", "scu-finances", "finance"],
      ["Profile", "scu-profile", "profile"]
    ].forEach(([label, target, icon]) => {
      container.append(createSectionButton(label, target, icon));
    });

    const actionsLabel = document.createElement("p");
    actionsLabel.className = "scu-nav-label scu-nav-label--spaced";
    actionsLabel.textContent = "Academics";
    container.append(actionsLabel);

    ACTION_LABELS.forEach((action, index) => {
      const button = createActionButton(action);
      button.prepend(createIcon(["search", "plan", "enroll", "academics"][index]));
      container.append(button);
    });

    const spacer = document.createElement("div");
    spacer.className = "scu-nav-spacer";
    container.append(spacer);

    const originalButton = document.createElement("button");
    originalButton.type = "button";
    originalButton.className = "scu-nav-button scu-original-button";
    originalButton.prepend(createIcon("legacy"));
    originalButton.append("Original view");
    originalButton.addEventListener("click", showOriginalView);
    container.append(originalButton);
  }

  function pendingSearch() {
    const pending = readSessionValue(SEARCH_CACHE_KEY, null);
    return pending && typeof pending.query === "string" ? pending : null;
  }

  function savePendingSearch(query, changes = {}) {
    const current = pendingSearch() ?? {};
    const next = { ...current, query, ...changes };
    writeSessionValue(SEARCH_CACHE_KEY, next);
    return next;
  }

  function selectOptionForSubject(select, subject) {
    if (!select || !subject) return false;
    const option = [...select.options]
      .find((candidate) => globalThis.SCU.enrollment.optionMatchesSubject(candidate, subject));
    if (!option) return false;
    select.selectedIndex = option.index;
    dispatchControlChange(select);
    return true;
  }

  function applyClassQueryToOriginal(queryValue) {
    const query = globalThis.SCU.enrollment.parseClassQuery(queryValue);
    const controls = findSearchControls();
    const result = { query, subjectMatched: false, courseMatched: false };

    if (query.subject && controls.subject) {
      result.subjectMatched = selectOptionForSubject(controls.subject, query.subject);
    }
    if (query.courseNumber && controls.courseNumber) {
      setControlValue(controls.courseNumber, query.courseNumber);
      result.courseMatched = true;
    }
    return result;
  }

  function beginEnrollmentSearch(queryValue) {
    const query = globalThis.SCU.enrollment.parseClassQuery(queryValue);
    if (!query.raw) return;
    savePendingSearch(query.raw, { advanced: false, submitted: false });
    const kind = pageKind();

    if (kind === "home") {
      const menu = findSelectMenu("Other Academic Information");
      const addItem = menu?.items.find((item) => /^Enrollment:\s*Add$/i.test(item.label));
      if (menu && addItem) {
        invokeSelectItem(menu, addItem);
        return;
      }
      invokeOriginal(findAction("Search for Classes"));
      return;
    }

    if (kind === "add-classes") {
      if (query.classNumber) {
        const controls = findClassNumberControls();
        setControlValue(controls.input, query.classNumber);
        controls.submit?.click();
      } else {
        findAddSearchAction()?.click();
      }
      return;
    }

    if (kind === "class-search") {
      applyClassQueryToOriginal(query.raw);
      findCriteriaSearchAction()?.click();
    }
  }

  function createMirroredSelect(original, labelText) {
    if (!original) return null;
    const field = document.createElement("label");
    field.className = "scu-search-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const select = document.createElement("select");
    [...original.options].forEach((originalOption) => {
      const option = document.createElement("option");
      option.value = originalOption.value;
      option.textContent = normalize(originalOption.textContent);
      option.selected = originalOption.selected;
      select.append(option);
    });
    select.addEventListener("change", () => setControlValue(original, select.value));
    field.append(label, select);
    return field;
  }

  function createMirroredInput(original, labelText, placeholder = "") {
    if (!original) return null;
    const field = document.createElement("label");
    field.className = "scu-search-field";
    const label = document.createElement("span");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "text";
    input.value = original.value ?? "";
    input.placeholder = placeholder;
    input.addEventListener("input", () => setControlValue(original, input.value));
    field.append(label, input);
    return field;
  }

  function renderFullSearchForm(container) {
    const controls = findSearchControls();
    if (!controls.subject && !controls.courseNumber) return;

    const form = document.createElement("div");
    form.className = "scu-search-fields";
    const subject = createMirroredSelect(controls.subject, "Subject");
    const course = createMirroredInput(controls.courseNumber, "Course number", "4820");
    const career = createMirroredSelect(controls.career, "Course career");
    [subject, course, career].filter(Boolean).forEach((field) => form.append(field));

    if (controls.courseOperator) {
      const operator = createMirroredSelect(controls.courseOperator, "Course number match");
      if (operator) {
        operator.classList.add("scu-search-field--operator");
        form.insertBefore(operator, course);
      }
    }

    if (controls.openOnly) {
      const field = document.createElement("label");
      field.className = "scu-checkbox-field";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = controls.openOnly.checked;
      checkbox.addEventListener("change", () => {
        if (controls.openOnly.checked !== checkbox.checked) controls.openOnly.click();
      });
      field.append(checkbox, "Show open classes only");
      form.append(field);
    }

    const actions = document.createElement("div");
    actions.className = "scu-search-actions";
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "scu-secondary-button";
    clear.textContent = "Clear";
    clear.disabled = !findCriteriaClearAction();
    clear.addEventListener("click", () => {
      removeSessionValue(SEARCH_CACHE_KEY);
      findCriteriaClearAction()?.click();
    });
    const search = document.createElement("button");
    search.type = "button";
    search.className = "scu-primary-button";
    search.textContent = "Search classes";
    search.disabled = !findCriteriaSearchAction();
    search.addEventListener("click", () => {
      removeSessionValue(SEARCH_CACHE_KEY);
      findCriteriaSearchAction()?.click();
    });
    actions.append(clear, search);

    const more = findAction("Additional Search Criteria", "contains");
    if (more) {
      const moreButton = document.createElement("button");
      moreButton.type = "button";
      moreButton.className = "scu-text-button scu-more-filters-button";
      moreButton.textContent = "More filters in original view";
      moreButton.addEventListener("click", () => {
        invokeOriginal(more);
        showOriginalView();
      });
      actions.prepend(moreButton);
    }

    container.append(form, actions);
  }

  function createSearchPanel(kind) {
    const panel = document.createElement("section");
    panel.className = "scu-class-search-panel";
    panel.hidden = kind === "home" || kind === "class-results";

    const intro = document.createElement("div");
    intro.className = "scu-search-intro";
    intro.innerHTML = '<div><strong>Find a class</strong><span>Search by subject and course, or enter a five-digit class number.</span></div>';
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "scu-search-dismiss";
    dismiss.setAttribute("aria-label", "Close class search");
    dismiss.textContent = "×";
    dismiss.addEventListener("click", () => { panel.hidden = true; });
    intro.append(dismiss);

    const quickForm = document.createElement("form");
    quickForm.className = "scu-quick-search";
    const input = document.createElement("input");
    input.type = "search";
    input.autocomplete = "off";
    input.placeholder = "Try CS 4820 or class #17325";
    input.setAttribute("aria-label", "Class search");
    input.value = pendingSearch()?.query ?? "";
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "scu-primary-button";
    submit.textContent = kind === "class-search" ? "Apply search" : "Continue";
    quickForm.addEventListener("submit", (event) => {
      event.preventDefault();
      beginEnrollmentSearch(input.value);
    });
    quickForm.append(createIcon("search"), input, submit);

    panel.append(intro, quickForm);
    if (kind === "class-search") renderFullSearchForm(panel);

    const note = document.createElement("p");
    note.className = "scu-search-note";
    note.textContent = "Searches and enrollment actions are completed by Cornell’s signed-in PeopleSoft session.";
    panel.append(note);
    return panel;
  }

  function createResultDetail(label, value) {
    const detail = document.createElement("div");
    detail.className = "scu-result-detail";
    const term = document.createElement("span");
    term.textContent = label;
    const description = document.createElement("strong");
    description.textContent = value || "—";
    detail.append(term, description);
    return detail;
  }

  function renderSearchResults(container, results, schedule) {
    const card = document.createElement("section");
    card.id = "scu-search-results";
    card.className = "scu-card scu-search-results";

    const heading = document.createElement("div");
    heading.className = "scu-card-heading scu-results-heading";
    const title = document.createElement("div");
    title.innerHTML = '<p class="scu-eyebrow">Class search</p><h2>Search results</h2>';
    const actions = document.createElement("div");
    actions.className = "scu-results-actions";
    ["Modify Search", "New Search"].forEach((label) => {
      const button = createActionButton(label, { className: "scu-secondary-button" });
      button.addEventListener("click", () => removeSessionValue(SEARCH_CACHE_KEY), { once: true });
      actions.append(button);
    });
    heading.append(title, actions);
    card.append(heading);

    if (!results.length) {
      const empty = document.createElement("div");
      empty.className = "scu-empty-state";
      empty.innerHTML = "<strong>No readable sections found</strong><span>Use Original view to continue, then send the page HTML so this result format can be supported.</span>";
      const original = document.createElement("button");
      original.type = "button";
      original.className = "scu-primary-button";
      original.textContent = "Open original results";
      original.addEventListener("click", showOriginalView);
      empty.append(original);
      card.append(empty);
      container.append(card);
      return;
    }

    const grouped = new Map();
    results.forEach((result) => {
      const key = `${result.courseCode}|${result.courseTitle}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(result);
    });

    grouped.forEach((courseResults) => {
      const first = courseResults[0];
      const group = document.createElement("section");
      group.className = "scu-result-group";
      const groupHeading = document.createElement("div");
      groupHeading.className = "scu-result-group-heading";
      const copy = document.createElement("div");
      const code = document.createElement("h3");
      code.textContent = first.courseCode;
      copy.append(code);
      if (first.courseTitle) {
        const courseTitle = document.createElement("p");
        courseTitle.textContent = first.courseTitle;
        copy.append(courseTitle);
      }
      const count = document.createElement("span");
      count.className = "scu-count-pill";
      count.textContent = `${courseResults.length} ${courseResults.length === 1 ? "section" : "sections"}`;
      groupHeading.append(copy, count);

      const list = document.createElement("div");
      list.className = "scu-result-list";
      courseResults.forEach((result) => {
        const conflicts = globalThis.SCU.enrollment.conflictingCourses(result.meetings, schedule.meetings);
        const item = document.createElement("article");
        item.className = "scu-result-item";

        const identity = document.createElement("div");
        identity.className = "scu-result-identity";
        const type = document.createElement("strong");
        type.textContent = result.type || result.component || "Section";
        const section = document.createElement("span");
        section.textContent = result.section ? `Section ${result.section}` : result.sectionLabel;
        const classNumber = document.createElement("small");
        classNumber.textContent = `Class #${result.classNumber}`;
        identity.append(type, section, classNumber);

        const details = document.createElement("div");
        details.className = "scu-result-details";
        details.append(
          createResultDetail("When", result.daysTimes),
          createResultDetail("Where", result.room),
          createResultDetail("Instructor", result.instructor)
        );

        const availability = document.createElement("div");
        availability.className = "scu-result-availability";
        const status = document.createElement("span");
        status.className = `scu-availability scu-availability--${result.status.toLowerCase().replace(/\s+/g, "-")}`;
        status.textContent = result.status;
        availability.append(status);
        if (conflicts.length) {
          const conflict = document.createElement("span");
          conflict.className = "scu-conflict-badge";
          conflict.textContent = `Conflicts with ${conflicts.join(", ")}`;
          availability.append(conflict);
        }

        const select = document.createElement("button");
        select.type = "button";
        select.className = "scu-primary-button scu-select-section";
        select.textContent = "Select section";
        select.disabled = !result.select;
        select.addEventListener("click", () => invokeOriginal(result.select));

        item.append(identity, details, availability, select);
        list.append(item);
      });
      group.append(groupHeading, list);
      card.append(group);
    });

    container.append(card);
  }

  function renderCalendar(container, schedule, kind) {
    const card = document.createElement("section");
    card.id = "scu-schedule";
    card.className = "scu-card scu-schedule-card";
    card.setAttribute("aria-labelledby", "scu-schedule-title");

    const heading = document.createElement("div");
    heading.className = "scu-card-heading";
    heading.innerHTML = '<div><p class="scu-eyebrow">Schedule</p><h2 id="scu-schedule-title">This week</h2></div>';
    const actions = document.createElement("div");
    actions.className = "scu-calendar-heading-actions";
    const count = document.createElement("span");
    count.className = "scu-count-pill";
    count.textContent = `${schedule.courses.length} ${schedule.courses.length === 1 ? "course" : "courses"}`;
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "scu-add-class-button";
    addButton.append(createIcon("plus"), "Add classes");
    actions.append(count, addButton);
    heading.append(actions);
    const searchPanel = createSearchPanel(kind);
    addButton.addEventListener("click", () => {
      searchPanel.hidden = !searchPanel.hidden;
      if (!searchPanel.hidden) searchPanel.querySelector("input[type='search']")?.focus();
    });
    card.append(heading, searchPanel);

    if (!schedule.meetings.length) {
      const empty = document.createElement("div");
      empty.className = "scu-empty-state";
      empty.innerHTML = "<strong>No scheduled meeting times</strong><span>Courses with times will appear here automatically.</span>";
      card.append(empty);
      container.append(card);
      return;
    }

    const viewport = document.createElement("div");
    viewport.className = "scu-calendar-viewport";
    const calendar = document.createElement("div");
    calendar.className = "scu-calendar";
    const totalMinutes = schedule.endMinute - schedule.startMinute;
    const hourCount = Math.ceil(totalMinutes / 60);
    calendar.style.setProperty("--scu-calendar-minutes", totalMinutes);
    calendar.style.setProperty("--scu-hour-count", hourCount);

    const corner = document.createElement("div");
    corner.className = "scu-calendar-corner";
    calendar.append(corner);

    schedule.dayCodes.forEach((day) => {
      const header = document.createElement("div");
      header.className = "scu-day-header";
      header.textContent = schedule.dayLabels[day];
      calendar.append(header);
    });

    for (let hour = 0; hour < hourCount; hour += 1) {
      const minute = schedule.startMinute + hour * 60;
      const label = document.createElement("div");
      label.className = "scu-time-label";
      label.style.gridRow = `${hour + 2}`;
      label.textContent = globalThis.SCU.schedule.formatClock(minute).replace(":00", "");
      calendar.append(label);
    }

    schedule.dayCodes.forEach((day, dayIndex) => {
      const column = document.createElement("div");
      column.className = "scu-day-column";
      column.style.gridColumn = `${dayIndex + 2}`;
      column.style.setProperty("--scu-hour-count", hourCount);

      schedule.meetings.filter((meeting) => meeting.day === day).forEach((meeting) => {
        const event = document.createElement("article");
        event.className = `scu-calendar-event scu-calendar-event--${colorFor(meeting.code)}`;
        event.style.setProperty("--scu-event-start", meeting.start - schedule.startMinute);
        event.style.setProperty("--scu-event-duration", meeting.end - meeting.start);
        event.title = `${meeting.code}, ${globalThis.SCU.schedule.formatClock(meeting.start)}–${globalThis.SCU.schedule.formatClock(meeting.end)}${meeting.location ? `, ${meeting.location}` : ""}`;

        const code = document.createElement("strong");
        code.textContent = meeting.code;
        const time = document.createElement("span");
        const timeRange = `${globalThis.SCU.schedule.formatClock(meeting.start)}–${globalThis.SCU.schedule.formatClock(meeting.end)}`;
        time.textContent = meeting.type ? `${meeting.type} · ${timeRange}` : timeRange;
        event.append(code, time);

        if (meeting.location) {
          const location = document.createElement("small");
          location.textContent = meeting.location;
          event.append(location);
        }
        column.append(event);
      });

      calendar.append(column);
    });

    viewport.append(calendar);
    card.append(viewport);

    if (schedule.unscheduled.length) {
      const unscheduled = document.createElement("div");
      unscheduled.className = "scu-unscheduled";
      const title = document.createElement("strong");
      title.textContent = "No set meeting time";
      unscheduled.append(title);
      schedule.unscheduled.forEach((course) => {
        const pill = document.createElement("span");
        pill.textContent = course.type ? `${course.code} · ${course.type}` : course.code;
        unscheduled.append(pill);
      });
      card.append(unscheduled);
    }

    container.append(card);
  }

  function renderAcademicTools(container) {
    const menu = findSelectMenu("Other Academic Information");
    if (!menu?.items.length) return;

    const card = document.createElement("section");
    card.id = "scu-academic-tools";
    card.className = "scu-card scu-academic-tools-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Academics</p><h2>Academic tools</h2></div></div>';
    const groups = document.createElement("div");
    groups.className = "scu-tool-groups";

    ["Planning", "Enrollment", "Records", "More"].forEach((groupName) => {
      const items = menu.items.filter((item) => {
        return globalThis.SCU.homepage.academicToolGroup(item.label) === groupName;
      });
      if (!items.length) return;
      const group = document.createElement("section");
      group.className = "scu-tool-group";
      const heading = document.createElement("h3");
      heading.textContent = groupName;
      const list = document.createElement("div");
      list.className = "scu-tool-list";
      items.forEach((item) => list.append(createSelectActionRow(menu, item)));
      group.append(heading, list);
      groups.append(group);
    });

    card.append(groups);
    container.append(card);
  }

  function renderFinances(container, summary) {
    const card = document.createElement("section");
    card.id = "scu-finances";
    card.className = "scu-card scu-finances-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Finances</p><h2>Account overview</h2></div></div>';

    if (summary.available) {
      const overview = document.createElement("div");
      overview.className = "scu-financial-overview";
      const balance = document.createElement("div");
      balance.className = "scu-balance-block";
      const balanceLabel = document.createElement("span");
      balanceLabel.textContent = "Account balance";
      const amount = document.createElement("strong");
      amount.textContent = summary.balance;
      balance.append(balanceLabel, amount);

      if (summary.pastDue) {
        const badge = document.createElement("span");
        badge.className = "scu-alert-badge";
        badge.textContent = "Past due";
        balance.append(badge);
      }

      const metrics = document.createElement("div");
      metrics.className = "scu-financial-metrics";
      [["Due now", summary.dueNow], ["Future due", summary.futureDue]].forEach(([label, value]) => {
        const metric = document.createElement("div");
        const metricLabel = document.createElement("span");
        metricLabel.textContent = label;
        const metricValue = document.createElement("strong");
        metricValue.textContent = value;
        metric.append(metricLabel, metricValue);
        metrics.append(metric);
      });
      overview.append(balance, metrics);
      card.append(overview);
    } else {
      const empty = document.createElement("div");
      empty.className = "scu-empty-compact";
      empty.innerHTML = "<strong>No account summary shown</strong><span>Open Account Inquiry for current details.</span>";
      card.append(empty);
    }

    const links = document.createElement("div");
    links.className = "scu-link-grid";
    [
      ["Account Inquiry", "Charges, payments, and balances"],
      ["View Financial Aid", "Awards and aid information"],
      ["Accept/Decline Awards", "Respond to offered aid"],
      ["View/Pay Bursar Bill", "Open Cornell’s billing service"]
    ].forEach(([label, description]) => links.append(createLinkRow(label, description)));
    card.append(links);
    appendSelectMenu(card, "Other Finance Information", "More financial tools");
    container.append(card);
  }

  function renderProfile(container) {
    const card = document.createElement("section");
    card.id = "scu-profile";
    card.className = "scu-card scu-profile-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Personal information</p><h2>Profile and contact</h2></div></div>';

    const email = extractLabeledValue("CU Assigned E-mail");
    if (email) {
      const summary = document.createElement("div");
      summary.className = "scu-profile-summary";
      summary.append(createIcon("mail"));
      const copy = document.createElement("span");
      const label = document.createElement("small");
      label.textContent = "Cornell-assigned email";
      const value = document.createElement("strong");
      value.textContent = email;
      copy.append(label, value);
      summary.append(copy);
      card.append(summary);
    }

    const note = document.createElement("p");
    note.className = "scu-privacy-note";
    note.textContent = "Home and campus addresses stay hidden on this overview for privacy.";
    card.append(note);

    const links = document.createElement("div");
    links.className = "scu-link-grid scu-link-grid--profile";
    [
      ["Demographic Data", "Review personal details"],
      ["Emergency Contact", "Manage emergency contacts"],
      ["Emergency Mass Notification", "Update CornellALERT information"],
      ["Names", "Review name preferences"],
      ["User Preferences", "Student Center preferences"]
    ].forEach(([label, description]) => links.append(createLinkRow(label, description)));
    card.append(links);
    appendSelectMenu(card, "Other Profile Information", "More profile tools");
    container.append(card);
  }

  function renderStatus(container) {
    const card = document.createElement("section");
    card.className = "scu-card scu-status-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Student status</p><h2>At a glance</h2></div></div>';
    const list = document.createElement("div");
    list.className = "scu-status-list";
    const bodyText = sourceText();

    const items = [
      {
        label: "Holds",
        value: bodyText.includes("No Holds") ? "All clear" : "Review holds",
        state: bodyText.includes("No Holds") ? "success" : "attention",
        action: findAction("Holds", "contains")
      },
      {
        label: "Milestones",
        value: bodyText.includes("No Milestones") ? "None pending" : "View milestones",
        state: "neutral",
        action: findAction("Milestones", "contains")
      },
      {
        label: "Enrollment",
        value: findAction("Open Enrollment Dates") ? "View dates" : "No dates shown",
        state: "neutral",
        action: findAction("Open Enrollment Dates")
      }
    ];

    items.forEach((item) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "scu-status-row";
      row.disabled = !item.action;
      const indicator = document.createElement("span");
      indicator.className = `scu-status-dot scu-status-dot--${item.state}`;
      indicator.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      const label = document.createElement("strong");
      label.textContent = item.label;
      const value = document.createElement("small");
      value.textContent = item.value;
      copy.append(label, value);
      row.append(indicator, copy, createIcon("arrow"));
      row.addEventListener("click", () => invokeOriginal(item.action));
      list.append(row);
    });

    card.append(list);
    container.append(card);
  }

  function renderTodo(container) {
    const card = document.createElement("section");
    card.className = "scu-card scu-todo-card";
    const heading = document.createElement("div");
    heading.className = "scu-card-heading";
    heading.innerHTML = '<div><p class="scu-eyebrow">Tasks</p><h2>To do</h2></div>';
    card.append(heading);

    const more = findAction("More");
    const hasTodo = sourceText().includes("To Do List") && more;
    const content = document.createElement("div");
    content.className = hasTodo ? "scu-todo-content" : "scu-empty-compact";

    if (hasTodo) {
      content.innerHTML = '<span class="scu-task-icon" aria-hidden="true">!</span><span><strong>Items need your attention</strong><small>Open Student Center to review your current tasks.</small></span>';
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scu-text-button";
      button.textContent = "Review";
      button.addEventListener("click", () => invokeOriginal(more));
      content.append(button);
    } else {
      content.innerHTML = "<strong>You’re all caught up</strong><span>New Student Center tasks will appear here.</span>";
    }

    card.append(content);
    container.append(card);
  }

  function renderAdvisor(container) {
    const card = document.createElement("section");
    card.className = "scu-card scu-advisor-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Support</p><h2>Advisor</h2></div></div>';

    const advisors = extractAdvisorNames();
    const body = document.createElement("div");
    body.className = "scu-advisor-body";
    const list = document.createElement("div");
    list.className = "scu-advisor-list";

    (advisors.length ? advisors : ["Program advisor"]).forEach((advisor) => {
      const person = document.createElement("div");
      person.className = "scu-advisor-person";
      const avatar = document.createElement("span");
      avatar.className = "scu-advisor-avatar";
      avatar.textContent = advisor.charAt(0).toUpperCase();
      avatar.setAttribute("aria-hidden", "true");
      const name = document.createElement("strong");
      name.textContent = advisor;
      person.append(avatar, name);
      list.append(person);
    });
    body.append(list);

    const original = findNearbyAction("Program Advisor", "Details");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scu-secondary-button";
    button.textContent = "View details";
    button.disabled = !original;
    button.addEventListener("click", () => invokeOriginal(original));
    body.append(button);
    card.append(body);
    container.append(card);
  }

  function renderResources(container) {
    const card = document.createElement("section");
    card.className = "scu-card scu-resources-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Cornell links</p><h2>Resources</h2></div></div>';
    const list = document.createElement("div");
    list.className = "scu-resource-list";

    [
      ["Class Roster", "Browse current course offerings"],
      ["University Catalog", "Programs, policies, and courses"],
      ["Guide to Enrollment", "Registration guidance"],
      ["University Bursar Office", "Billing help and information"],
      ["View CornellCard Activity", "Review CornellCard transactions"],
      ["Enrollment Shopping Cart", "Review planned classes"]
    ].forEach(([label, description]) => list.append(createLinkRow(label, description)));

    card.append(list);
    container.append(card);
  }

  function showOriginalView() {
    const root = document.getElementById(ROOT_ID);
    if (root) root.hidden = true;
    document.documentElement.classList.remove("scu-dashboard-mounted");

    let returnButton = document.getElementById(RETURN_ID);
    if (!returnButton) {
      returnButton = document.createElement("button");
      returnButton.id = RETURN_ID;
      returnButton.type = "button";
      returnButton.textContent = "Return to modern view";
      returnButton.addEventListener("click", () => {
        root.hidden = false;
        document.documentElement.classList.add("scu-dashboard-mounted");
        returnButton.remove();
      });
      document.body.append(returnButton);
    }
  }

  function render(root, rows, kind, searchResults = []) {
    const schedule = globalThis.SCU.schedule.buildSchedule(rows);
    const financialSummary = parseFinancialSummary();
    root.replaceChildren();
    root.removeAttribute("aria-hidden");
    root.className = "scu-dashboard-root";
    document.documentElement.classList.add("scu-dashboard-mounted");

    const app = document.createElement("div");
    app.className = "scu-dashboard";
    const nav = document.createElement("nav");
    nav.className = "scu-sidebar";
    nav.setAttribute("aria-label", "Student Center navigation");
    renderNavigation(nav, kind);

    const page = document.createElement("div");
    page.className = "scu-page";
    const content = document.createElement("main");
    content.className = "scu-content";
    if (kind !== "home") content.classList.add("scu-content--enrollment");
    const primary = document.createElement("div");
    primary.className = "scu-primary-column";
    if (kind === "class-results") primary.classList.add("scu-primary-column--results");
    renderCalendar(primary, schedule, kind);

    if (kind === "home") {
      renderAcademicTools(primary);
      renderFinances(primary, financialSummary);
      renderProfile(primary);
    } else if (kind === "class-results") {
      renderSearchResults(primary, searchResults, schedule);
    }

    content.append(primary);
    if (kind === "home") {
      const secondary = document.createElement("aside");
      secondary.className = "scu-secondary-column";
      secondary.setAttribute("aria-label", "Student status and tasks");
      renderStatus(secondary);
      renderTodo(secondary);
      renderAdvisor(secondary);
      renderResources(secondary);
      content.append(secondary);
    }

    page.append(content);
    app.append(nav, page);
    root.append(app);
  }

  function continuePendingSearch(kind) {
    const pending = pendingSearch();
    if (!pending?.query) return;
    const parsed = globalThis.SCU.enrollment.parseClassQuery(pending.query);

    if (kind === "add-classes" && !pending.advanced) {
      if (parsed.classNumber) {
        const controls = findClassNumberControls();
        if (!controls.input || !controls.submit) return;
        setControlValue(controls.input, parsed.classNumber);
        savePendingSearch(pending.query, { advanced: true, submitted: true });
        window.setTimeout(() => controls.submit.click(), 0);
        return;
      }

      const action = findAddSearchAction();
      if (!action) return;
      savePendingSearch(pending.query, { advanced: true });
      window.setTimeout(() => action.click(), 0);
      return;
    }

    if (kind === "class-search" && !pending.submitted) {
      const applied = applyClassQueryToOriginal(pending.query);
      if (!applied.subjectMatched || !applied.courseMatched) return;
      const action = findCriteriaSearchAction();
      if (!action) return;
      savePendingSearch(pending.query, { submitted: true });
      window.setTimeout(() => action.click(), 0);
    }
  }

  function refresh() {
    const result = findScheduleTable();
    const { table } = result;
    sourceDocuments = result.documents;
    const root = document.getElementById(ROOT_ID);
    const kind = pageKind();
    if (!root) return false;

    if (kind === "enrollment-step") {
      root.replaceChildren();
      root.className = "";
      root.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("scu-dashboard-mounted");
      lastSignature = "";
      return false;
    }

    let rows = table ? extractRows(table) : [];
    if (kind === "home" || kind === "add-classes") cacheScheduleRows(rows);
    if (kind !== "home" && (!rows.length || kind === "class-results")) {
      rows = cachedScheduleRows();
    }
    const searchResults = kind === "class-results" ? extractSearchResults() : [];

    if (kind === "home" && !rows.length) {
      if (root) {
        root.replaceChildren();
        root.className = "";
        root.setAttribute("aria-hidden", "true");
      }
      document.documentElement.classList.remove("scu-dashboard-mounted");
      lastSignature = "";
      return false;
    }
    const signature = JSON.stringify({
      kind,
      rows,
      actionCount: interactiveElements().length,
      searchResults: searchResults.map((result) => ({
        key: result.key,
        daysTimes: result.daysTimes,
        room: result.room,
        instructor: result.instructor,
        status: result.status
      })),
      searchControls: Object.values(findSearchControls()).map((control) => {
        return control?.tagName === "SELECT" ? control.options.length : Boolean(control);
      })
    });
    if (signature === lastSignature && root.childElementCount) return true;

    lastSignature = signature;
    render(root, rows, kind, searchResults);
    continuePendingSearch(kind);
    return true;
  }

  function unmount() {
    document.getElementById(RETURN_ID)?.remove();
    document.documentElement.classList.remove("scu-dashboard-mounted");
    lastSignature = "";
  }

  globalThis.SCU = globalThis.SCU || {};
  globalThis.SCU.dashboard = { refresh, unmount };
})();
