/* -------- 99-main.js --------
   Loads last. Starts the 400ms poll that fans out to every runner
   registered by the previous modules. */

(function () {
    function runAll() {
        const runners = (window.__cu && window.__cu.runners) || [];
        for (const fn of runners) {
            try { fn(); } catch (e) { console.error('[__cu] runner error:', e); }
        }
    }
    setInterval(runAll, 400);
    runAll();
    console.log('Stremio Disney+ Theme engine loaded successfully!');
})();
