/* -------- 00-runtime.js --------
   Shared runtime object. Every other JS module hangs off `window.__cu`:
   - utils:    cross-module helpers populated by 01-utils.js
   - runners:  list of functions invoked every 400ms by 99-main.js
   - register: push a runner that should fire on the polling tick */

(function () {
    if (window.__cu) return; // already initialised
    window.__cu = {
        utils: {},
        runners: [],
        register: function (fn) {
            if (typeof fn === 'function') this.runners.push(fn);
        },
    };
})();
