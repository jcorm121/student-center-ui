(() => {
  const ROOT_ID = "scu-extension-root";
  const RETURN_ID = "scu-return-modern";
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
    return normalize(sourceDocuments.map((sourceDocument) => sourceDocument.body?.textContent ?? "").join(" "));
  }

  function findAction(label, mode = "exact") {
    const target = normalize(label).toLowerCase();
    return interactiveElements().find((element) => {
      const candidate = ownLabel(element).toLowerCase();
      return mode === "contains" ? candidate.includes(target) : candidate === target;
    }) ?? null;
  }

  function invokeOriginal(element) {
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    element.click();
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

    return { table: null, documents };
  }

  function extractRows(table) {
    const rows = [...table.rows];
    const header = rows.find((row) => {
      const labels = [...row.cells].map(ownLabel);
      return labels.includes("Class") && labels.includes("Schedule");
    });
    if (!header) return [];

    const labels = [...header.cells].map(ownLabel);
    const classIndex = labels.indexOf("Class");
    const scheduleIndex = labels.indexOf("Schedule");

    return rows.slice(rows.indexOf(header) + 1)
      .map((row) => ({
        courseText: ownLabel(row.cells[classIndex]),
        scheduleText: ownLabel(row.cells[scheduleIndex])
      }))
      .filter((row) => row.courseText && row.scheduleText);
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

  function renderNavigation(container) {
    const brand = document.createElement("div");
    brand.className = "scu-brand";
    brand.innerHTML = '<span class="scu-brand-mark" aria-hidden="true">C</span><span>Student Center</span>';
    container.append(brand);

    const label = document.createElement("p");
    label.className = "scu-nav-label";
    label.textContent = "Academics";
    container.append(label);

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

  function renderHeader(container) {
    const copy = document.createElement("div");
    copy.className = "scu-page-heading";
    copy.innerHTML = "<p>Overview</p><h1>Your week at Cornell</h1><span>Classes, tasks, and enrollment information in one place.</span>";
    container.append(copy);

    const actions = document.createElement("div");
    actions.className = "scu-header-actions";
    const search = createActionButton("Search classes", {
      className: "scu-primary-button",
      originalLabel: "Search for Classes"
    });
    search.prepend(createIcon("search"));
    actions.append(search);
    container.append(actions);
  }

  function renderCalendar(container, schedule) {
    const card = document.createElement("section");
    card.className = "scu-card scu-schedule-card";
    card.setAttribute("aria-labelledby", "scu-schedule-title");

    const heading = document.createElement("div");
    heading.className = "scu-card-heading";
    heading.innerHTML = '<div><p class="scu-eyebrow">Schedule</p><h2 id="scu-schedule-title">This week</h2></div>';
    const count = document.createElement("span");
    count.className = "scu-count-pill";
    count.textContent = `${schedule.courses.length} ${schedule.courses.length === 1 ? "course" : "courses"}`;
    heading.append(count);
    card.append(heading);

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
        time.textContent = `${globalThis.SCU.schedule.formatClock(meeting.start)}–${globalThis.SCU.schedule.formatClock(meeting.end)}`;
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
        pill.textContent = course.code;
        unscheduled.append(pill);
      });
      card.append(unscheduled);
    }

    container.append(card);
  }

  function renderQuickActions(container) {
    const card = document.createElement("section");
    card.className = "scu-card";
    card.innerHTML = '<div class="scu-card-heading"><div><p class="scu-eyebrow">Shortcuts</p><h2>Quick actions</h2></div></div>';
    const grid = document.createElement("div");
    grid.className = "scu-quick-grid";

    [
      ["Enroll", "Add or change classes", "enroll"],
      ["Plan", "Prepare a future term", "plan"],
      ["My Academics", "Requirements and history", "academics"],
      ["Search for Classes", "Explore the course roster", "search"]
    ].forEach(([label, description, icon]) => {
      const original = findAction(label);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scu-quick-action";
      button.disabled = !original;
      button.append(createIcon(icon));
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      title.textContent = label;
      const detail = document.createElement("small");
      detail.textContent = description;
      copy.append(title, detail);
      button.append(copy, createIcon("arrow"));
      button.addEventListener("click", () => invokeOriginal(original));
      grid.append(button);
    });

    card.append(grid);
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

  function render(root, rows) {
    const schedule = globalThis.SCU.schedule.buildSchedule(rows);
    root.replaceChildren();
    root.removeAttribute("aria-hidden");
    root.className = "scu-dashboard-root";
    document.documentElement.classList.add("scu-dashboard-mounted");

    const app = document.createElement("div");
    app.className = "scu-dashboard";
    const nav = document.createElement("nav");
    nav.className = "scu-sidebar";
    nav.setAttribute("aria-label", "Student Center navigation");
    renderNavigation(nav);

    const page = document.createElement("div");
    page.className = "scu-page";
    const header = document.createElement("header");
    header.className = "scu-topbar";
    renderHeader(header);

    const content = document.createElement("main");
    content.className = "scu-content";
    const primary = document.createElement("div");
    primary.className = "scu-primary-column";
    renderCalendar(primary, schedule);
    renderQuickActions(primary);

    const secondary = document.createElement("aside");
    secondary.className = "scu-secondary-column";
    secondary.setAttribute("aria-label", "Student status and tasks");
    renderStatus(secondary);
    renderTodo(secondary);

    content.append(primary, secondary);
    page.append(header, content);
    app.append(nav, page);
    root.append(app);
  }

  function refresh() {
    const result = findScheduleTable();
    const { table } = result;
    sourceDocuments = result.documents;
    const root = document.getElementById(ROOT_ID);
    if (!table || !root) {
      if (root) {
        root.replaceChildren();
        root.className = "";
        root.setAttribute("aria-hidden", "true");
      }
      document.documentElement.classList.remove("scu-dashboard-mounted");
      lastSignature = "";
      return false;
    }

    const rows = extractRows(table);
    if (!rows.length) {
      root.replaceChildren();
      root.className = "";
      root.setAttribute("aria-hidden", "true");
      document.documentElement.classList.remove("scu-dashboard-mounted");
      return false;
    }
    const signature = JSON.stringify(rows);
    if (signature === lastSignature && root.childElementCount) return true;

    lastSignature = signature;
    render(root, rows);
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
