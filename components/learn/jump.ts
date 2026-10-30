// One-shot navigation targets: set before following a link, consumed by the destination page.
const JUMP_KEY = 'learning-jump-target';

export const setJumpTarget = (target: string) => {
  try {
    window.sessionStorage.setItem(JUMP_KEY, target);
  } catch {
    // The destination page simply opens at the top.
  }
};

export const takeJumpTarget = (prefix: string): string | undefined => {
  try {
    const value = window.sessionStorage.getItem(JUMP_KEY);
    if (!value || !value.startsWith(prefix)) return undefined;
    window.sessionStorage.removeItem(JUMP_KEY);
    return value.slice(prefix.length);
  } catch {
    return undefined;
  }
};
