(() => {
  const ACTION_EVENT = "scu:invoke-page-action";
  const SUBMIT_ACTION_EVENT = "scu:submit-people-soft-action";

  document.addEventListener(ACTION_EVENT, (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Content scripts run in an isolated JavaScript world. Perform the final
    // activation here so PeopleSoft's inline handlers and javascript: links
    // execute in the page's own world.
    event.preventDefault();
    target.click();
  }, true);

  document.addEventListener(SUBMIT_ACTION_EVENT, (event) => {
    const actionId = event.detail?.actionId;
    if (!/^SSR_PB_SELECT\$\d+$/.test(actionId ?? "")) return;
    if (typeof globalThis.submitAction_win0 !== "function" || !document.forms.win0) return;

    event.preventDefault();
    globalThis.submitAction_win0(document.forms.win0, actionId);
  }, true);
})();
