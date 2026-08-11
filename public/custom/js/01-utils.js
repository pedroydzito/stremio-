/* -------- 01-utils.js --------
   Reusable helpers: React-fiber inspection + URL-route parsing. */

(function () {
    const u = window.__cu.utils;

    u.getReactFiber = function getReactFiber(element) {
        const key = Object.keys(element).find(
            (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
        );
        return key ? element[key] : null;
    };

    u.findFiberProps = function findFiberProps(fiber, predicate) {
        let current = fiber;
        while (current) {
            if (current.memoizedProps && predicate(current.memoizedProps)) {
                return current.memoizedProps;
            }
            current = current.return;
        }
        return null;
    };

    u.findFiberInSubtree = function findFiberInSubtree(fiber, predicate) {
        if (!fiber) return null;
        if (predicate(fiber)) return fiber;
        
        let child = fiber.child;
        while (child) {
            const found = u.findFiberInSubtree(child, predicate);
            if (found) return found;
            child = child.sibling;
        }
        return null;
    };

    u.findHookState = function findHookState(fiber, predicate) {
        let current = fiber;
        while (current) {
            let hook = current.memoizedState;
            while (hook && typeof hook === 'object') {
                if ('memoizedState' in hook) {
                    if (predicate(hook.memoizedState)) {
                        return hook.memoizedState;
                    }
                    hook = hook.next;
                } else {
                    if (predicate(hook)) {
                        return hook;
                    }
                    break;
                }
            }
            current = current.return;
        }
        return null;
    };

    u.routeFromHref = function routeFromHref(href) {
        if (!href) return '';
        const hashPart = href.includes('#') ? href.split('#')[1] : href;
        return (hashPart || '').split('?')[0].replace(/^\//, '').split('/')[0] || '';
    };

    u.currentRoute = function currentRoute() {
        const h = window.location.hash || '';
        return (h.split('?')[0] || '').replace(/^#?\/?/, '').split('/')[0] || '';
    };
})();
