import { registerPlugin } from '@capacitor/core';
const LiveUpdate = registerPlugin('LiveUpdate', {
    web: () => import('./web').then(m => new m.LiveUpdateWeb()),
});
export * from './definitions';
export { LiveUpdate };
//# sourceMappingURL=index.js.map