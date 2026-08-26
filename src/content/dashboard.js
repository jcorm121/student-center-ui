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

  function parseFinancialSummary() {
    return globalThis.SCU.homepage.parseFinancialSummary(sourceText());
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

    const homeLabel = document.createElement("p");
    homeLabel.className = "scu-nav-label";
    homeLabel.textContent = "Home";
    container.append(homeLabel);

    [
      ["Overview", ROOT_ID, "overview"],
      ["Schedule", "scu-schedule", "plan"],
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
    card.id = "scu-schedule";
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

    const advisor = extractLabeledValue("Program Advisor");
    const body = document.createElement("div");
    body.className = "scu-advisor-body";
    const avatar = document.createElement("span");
    avatar.className = "scu-advisor-avatar";
    avatar.textContent = advisor ? advisor.charAt(0).toUpperCase() : "A";
    avatar.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    title.textContent = advisor || "Program advisor";
    const detail = document.createElement("small");
    detail.textContent = advisor ? "Your assigned advising contact" : "View your advising information";
    copy.append(title, detail);
    body.append(avatar, copy);

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

  function render(root, rows) {
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
    renderFinances(primary, financialSummary);
    renderProfile(primary);

    const secondary = document.createElement("aside");
    secondary.className = "scu-secondary-column";
    secondary.setAttribute("aria-label", "Student status and tasks");
    renderStatus(secondary);
    renderTodo(secondary);
    renderAdvisor(secondary);
    renderResources(secondary);

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
    const signature = JSON.stringify({
      rows,
      actionCount: interactiveElements().length
    });
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
