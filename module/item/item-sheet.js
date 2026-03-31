import { SLADrugSystem } from "../sla-drug-system.js";

/**
 * Extend the basic ItemSheet with some very simple modifications
 * @extends {ItemSheet}
 */
export class MothershipItemSheet extends foundry.appv1.sheets.ItemSheet {

  /** @override */
  static get defaultOptions() {
    var options = {
      classes: ["mosh", "sheet", "item"],
      width: 600,
      height: 500,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }]
    };

    return foundry.utils.mergeObject(super.defaultOptions, options);
  }

  /** @override */
  get template() {
    const path = "systems/sla-mothership/templates/item";
    // Return a single sheet for all item types.
    return `${path}/item-${this.item.type}-sheet.html`;
    // Alternatively, you could use the following return statement to do a
    // unique item sheet by type, like `weapon-sheet.html`.

    // return `${path}/${this.item.system.type}-sheet.html`;
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const data = await super.getData();
    const sheetData = data.data ?? data;
    const superData = sheetData.system ?? (sheetData.system = {});
    const itemType = this.item.type;

    superData.sla ??= {};
    superData.settings ??= {};

    if (itemType === "weapon") {
      superData.ranges ??= { short: 0, medium: 0, long: 0, value: "" };
      superData.ammoTag ??= "STD";
      superData.ammoLoadedType ??= superData.ammoTag ?? "STD";
      superData.ammoReserveStd ??= Math.max(0, Number(superData.ammo ?? 0) || 0);
      superData.ammoReserveAp ??= 0;
      superData.ammoReserveHe ??= 0;
      superData.ammoReserveHeap ??= 0;
      superData.ammoReserve ??= Number(superData.ammoReserveStd ?? 0) + Number(superData.ammoReserveAp ?? 0) + Number(superData.ammoReserveHe ?? 0) + Number(superData.ammoReserveHeap ?? 0);
      superData.ammo ??= superData.ammoReserve;
      superData.ammoBaseCost ??= 0;
      superData.sla.fireModes ??= deriveDefaultFireModes(superData);
      superData.sla.currentFireMode ??= getFireModes(superData)[0]?.label ?? "Single";
      superData.shotsPerFire = getActiveFireMode(superData)?.shots ?? Math.max(Number(superData.shotsPerFire ?? 1) || 1, 1);

      if (superData.ranges.value === "" && Number(superData.ranges.medium ?? 0) > 0) {
        superData.ranges.value = `${superData.ranges.short}/${superData.ranges.medium}/${superData.ranges.long}`;
        superData.ranges.medium = 0;
      }
    }

    if (itemType === "ability") {
      superData.sla.abilityType ??= "ebb";
      superData.sla.skillRef ??= "";
      superData.sla.fluxCost ??= 1;
      superData.sla.tier ??= "basic";
      superData.sla.panicSave ??= "fear";
      superData.sla.rollOnUse ??= true;
      superData.sla.tiers ??= [];
    }

    if (itemType === "drug") {
      superData.quantity ??= 1;
      superData.weight ??= 0;
      superData.cost ??= 0;
      superData.sla.drugId ??= "";
      superData.sla.category ??= "Drug";
      superData.sla.rating ??= 0;
      superData.sla.durationLabel ??= "";
      superData.sla.addictionFactor ??= 0;
      const drugDefinition = await SLADrugSystem.getDrugDefinitionFromItem(this.item);
      sheetData.drugDefinition = drugDefinition;
      if (drugDefinition) {
        superData.sla.drugId = drugDefinition.id;
        superData.sla.category = drugDefinition.category ?? "Drug";
        superData.sla.rating = Number(drugDefinition.rating ?? 0);
        superData.sla.durationLabel = String(drugDefinition.durationLabel ?? "");
        superData.sla.addictionFactor = Number(drugDefinition.addiction?.threshold ?? 0);
      }
    }

    superData.settings.useCalm = game.settings.get("sla-mothership", "useCalm");
    superData.settings.hideWeight = game.settings.get("sla-mothership", "hideWeight");
    superData.settings.firstEdition = game.settings.get("sla-mothership", "firstEdition");
    superData.settings.androidPanic = game.settings.get("sla-mothership", "androidPanic");

    sheetData.enriched = [];
    sheetData.enriched.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(superData.description ?? "", { async: true });

    return sheetData;
  }

  /* -------------------------------------------- */

  /** @override */
  setPosition(options = {}) {
    const position = super.setPosition(options);
    const sheetBody = this.element.find(".sheet-body");
    const bodyHeight = position.height - 192;
    sheetBody.css("height", bodyHeight);
    return position;
  }

  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    // Roll handlers, click handlers, etc. would go here.
  }

  async _updateObject(event, formData) {
    const updateData = foundry.utils.expandObject(formData);
    if (Object.prototype.hasOwnProperty.call(updateData?.system ?? {}, "weight")) {
      const parsed = Number(updateData.system.weight ?? 0) || 0;
      updateData.system.weight = Math.round(parsed * 10) / 10;
    }
    await this.item.update(updateData, { diff: false });
  }
}

function getFireModes(system) {
  const raw = String(system?.sla?.fireModes ?? "").trim();
  const rofText = String(system?.sla?.rofText ?? system?.rofText ?? "").toLowerCase();
  const shotsPerFire = Math.max(1, Number(system?.shotsPerFire ?? 1) || 1);
  const special = String(system?.sla?.special ?? "").toLowerCase();
  const name = String(system?.name ?? "");
  const modes = [];
  for (const chunk of raw.split(/[\n,]+/)) {
    const entry = chunk.trim();
    if (!entry) continue;
    const match = entry.match(/^(.+?)(?:\s*[:=|-]\s*|\s*\(\s*)(\d+)\)?$/);
    if (!match) {
      const inferred = inferWeaponModeShots(entry, shotsPerFire, rofText);
      if (!inferred) continue;
      modes.push({
        label: entry.replace(/\s+/g, " ").trim().replace(/\bfull auto\b/i, "Auto"),
        shots: inferred
      });
      continue;
    }
    modes.push({
      label: match[1].trim(),
      shots: Math.max(1, Number(match[2]) || 1)
    });
  }
  const staleSingleMode = modes.length === 1
    && modes[0].label.toLowerCase() === "single"
    && modes[0].shots === 1
    && (special.includes("auto") || special.includes("burst") || rofText.includes("burst") || rofText.includes("auto") || inferAutomaticWeaponShots(name) > 1);

  return modes.length && !staleSingleMode
    ? modes
    : deriveWeaponModeDefaults(Math.max(shotsPerFire, inferAutomaticWeaponShots(name)), special, rofText, name);
}

function getActiveFireMode(system) {
  const modes = getFireModes(system);
  const current = String(system?.sla?.currentFireMode ?? "").trim().toLowerCase();
  return modes.find((mode) => mode.label.toLowerCase() === current) ?? modes[0];
}

function deriveDefaultFireModes(system) {
  const shotsPerFire = Math.max(1, Number(system?.shotsPerFire ?? 1) || 1);
  const special = String(system?.sla?.special ?? "").toLowerCase();
  const rofText = String(system?.sla?.rofText ?? system?.rofText ?? "").toLowerCase();
  const modes = deriveWeaponModeDefaults(shotsPerFire, special, rofText);

  return modes
    .filter((mode, index, list) => list.findIndex((entry) => entry.label === mode.label && entry.shots === mode.shots) === index)
    .map((mode) => `${mode.label}:${mode.shots}`)
    .join(", ");
}

function inferWeaponModeShots(label = "", shotsPerFire = 1, rofText = "") {
  const normalized = String(label ?? "").toLowerCase();
  if (normalized.includes("single") || normalized.includes("semi")) return 1;
  if (normalized.includes("double") || normalized.includes("2 shots")) return Math.max(2, shotsPerFire);
  if (normalized.includes("burst")) return Math.max(3, shotsPerFire);
  if (normalized.includes("auto")) {
    if (rofText.includes("full auto")) return Math.max(6, shotsPerFire);
    return Math.max(3, shotsPerFire);
  }
  return 0;
}

function deriveWeaponModeDefaults(shotsPerFire = 1, special = "", rofText = "", name = "") {
  const modes = [{ label: "Single", shots: 1 }];
  const text = `${special} ${rofText}`.toLowerCase();
  const effectiveShots = Math.max(shotsPerFire, inferAutomaticWeaponShots(name));

  if (text.includes("2 shots") || text.includes("2/round")) {
    modes.push({ label: "Double", shots: 2 });
  }
  if (text.includes("burst") || (special.includes("auto") && effectiveShots >= 3)) {
    modes.push({ label: "Burst", shots: Math.max(3, effectiveShots) });
  } else if (effectiveShots === 2) {
    modes.push({ label: "Double", shots: 2 });
  } else if (effectiveShots > 2) {
    modes.push({ label: "Burst", shots: effectiveShots });
  }
  if (text.includes("full auto") || special.includes("auto")) {
    modes.push({ label: "Auto", shots: Math.max(text.includes("full auto") ? 6 : effectiveShots, 3) });
  }

  return modes;
}

function inferAutomaticWeaponShots(name = "") {
  const text = String(name ?? "").toLowerCase();
  if (/lmg|machine gun|minigun/.test(text)) return 6;
  if (/assault rifle|fen\s*ar|smg|machine pistol|auto-shotgun|reaper/.test(text)) return 3;
  return 1;
}
