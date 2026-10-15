// What the open lab is showing, for the bug report dialog. lab-view.js sets
// `current.get` while a lab is mounted and clears it on unmount.
export const current = { get: null };
