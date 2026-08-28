(() => {
  const ACTION_EVENT = "scu:invoke-page-action";

  document.addEventListener(ACTION_EVENT, (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    // Content scripts run in an isolated JavaScript world. Perform the final
    // activation here so PeopleSoft's inline handlers and javascript: links
    // execute in the page's own world.
    event.preventDefault();
    target.click();
  }, true);
})();
