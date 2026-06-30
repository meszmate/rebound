// Load the easing modules in dependency order and expose the namespace they
// attach to globalThis. The runtime modules are UMD: under Node/Vitest the
// CJS branch is skipped (module is undefined), so they register on globalThis
// exactly as they do in the browser. Import order matters, sampler reads the
// others from the global namespace.
import '../../client/js/easing/bezier.js';
import '../../client/js/easing/penner.js';
import '../../client/js/easing/spring.js';
import '../../client/js/easing/speedgraph.js';
import '../../client/js/easing/sampler.js';

export const E = globalThis.Rebound.easing;
export const { bezier, penner, spring, speedgraph, sampler } = E;
