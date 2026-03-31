const SYSTEM_ID = "sla-mothership";
const PREFIX = "[SLA Mothership]";

function isDebugEnabled() {
  try {
    return game?.settings?.get?.(SYSTEM_ID, "debugLogging") === true;
  } catch (_error) {
    return false;
  }
}

export function slaDebug(...args) {
  if (!isDebugEnabled()) return;
  console.debug(PREFIX, ...args);
}

export function slaInfo(...args) {
  console.info(PREFIX, ...args);
}

export function slaWarn(...args) {
  console.warn(PREFIX, ...args);
}

export function slaError(...args) {
  console.error(PREFIX, ...args);
}
