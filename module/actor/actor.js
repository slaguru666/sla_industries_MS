import { fromIdUuid } from "../mosh.js";
import { slaDebug, slaWarn } from "../logger.js";
import { SLADrugSystem } from "../sla-drug-system.js";
import { SLA_SPECIES_BALANCE_VERSION, getSlaSpeciesStatAdjustments } from "../sla-species-balance.js";
import { buildSlaTraumaResponseText } from "../sla-trauma.js";

const SLA_AMMO_TYPES = {
  STD: { label: "Standard", multiplier: 1, damageBonus: "", woundEffect: "", summary: "Standard ammunition." },
  AP: { label: "AP", multiplier: 2, damageBonus: "-1", woundEffect: "Gunshot [-]", summary: "Armour-piercing ammunition. Treat target armour as halved and reduce damage by 1." },
  HE: { label: "HE", multiplier: 3, damageBonus: "1d5", woundEffect: "Fire & Explosives", summary: "High explosive ammunition. Add 1d5 damage and use explosive wound effects." },
  HEAP: { label: "HEAP", multiplier: 4, damageBonus: "1d5", woundEffect: "Fire & Explosives [+]", summary: "High explosive armour-piercing ammunition. Add 1d5 damage and treat target armour as halved." }
};

const SLA_AMMO_RESERVE_KEYS = {
  STD: "ammoReserveStd",
  AP: "ammoReserveAp",
  HE: "ammoReserveHe",
  HEAP: "ammoReserveHeap"
};

const SLA_WOUND_EFFECTS = {
  bleeding: { key: "bleeding", label: "Bleeding", settingKey: "table1eWoundBleeding" },
  blunt_force: { key: "blunt_force", label: "Blunt Force", settingKey: "table1eWoundBluntForce" },
  fire_explosives: { key: "fire_explosives", label: "Fire & Explosives", settingKey: "table1eWoundFireExplosives" },
  gore_massive: { key: "gore_massive", label: "Gore & Massive", settingKey: "table1eWoundGoreMassive" },
  gunshot: { key: "gunshot", label: "Gunshot", settingKey: "table1eWoundGunshot" }
};

const SLA_WOUND_EFFECT_ALIASES = {
  bleeding: "bleeding",
  blunt_force: "blunt_force",
  fire_explosives: "fire_explosives",
  fire_and_explosives: "fire_explosives",
  gore_massive: "gore_massive",
  gore_and_massive: "gore_massive",
  gunshot: "gunshot"
};

function normalizeSlaWoundEffectKey(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSlaWoundEffect(rawEffect = "") {
  const original = String(rawEffect ?? "").trim();
  if (!original) return null;

  let label = original;
  let modifier = "standard";
  if (/\[\+\]\s*$/.test(label)) {
    modifier = "adv";
    label = label.replace(/\s*\[\+\]\s*$/, "").trim();
  } else if (/\[-\]\s*$/.test(label)) {
    modifier = "dis";
    label = label.replace(/\s*\[-\]\s*$/, "").trim();
  }

  const normalized = normalizeSlaWoundEffectKey(label);
  const resolvedKey = SLA_WOUND_EFFECT_ALIASES[normalized] ?? normalized;
  const entry = SLA_WOUND_EFFECTS[resolvedKey];
  if (!entry) {
    return {
      raw: original,
      label,
      modifier,
      displayLabel: original,
      unknown: true
    };
  }

  const modifierSuffix =
    modifier === "adv" ? " [+]" :
    modifier === "dis" ? " [-]" :
    "";

  return {
    ...entry,
    raw: original,
    modifier,
    displayLabel: `${entry.label}${modifierSuffix}`,
    unknown: false
  };
}

function renderSlaWoundEffectMarkup(rawEffect = "") {
  const parsed = parseSlaWoundEffect(rawEffect);
  if (!parsed) return "";
  if (parsed.unknown) return foundry.utils.escapeHTML(parsed.displayLabel);

  const label = foundry.utils.escapeHTML(parsed.displayLabel);
  const title = foundry.utils.escapeHTML(`Roll ${parsed.displayLabel} wound table`);
  return `<button type="button" class="sla-wound-effect-link" data-wound-effect="${parsed.key}" data-wound-modifier="${parsed.modifier}" title="${title}" aria-label="${title}"><i class="fas fa-dice-d20"></i> ${label}</button>`;
}

function getSlaTableRollFormula(tableData) {
  const formula = String(tableData?.formula ?? "1d10").trim();
  return formula.replace(/\s*-\s*1\b/g, "").trim() || "1d10";
}

function getSlaWoundTableLabelFromSettingKey(settingKey = "") {
  return Object.values(SLA_WOUND_EFFECTS).find((entry) => entry.settingKey === settingKey)?.label ?? null;
}

function normalizeSlaConditionLabel(value = "") {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function resolveRollTableReference(reference) {
  if (!reference) return null;

  const direct = await fromIdUuid(reference, { type: "RollTable" });
  if (direct) return direct;

  const worldTable =
    game.tables?.get?.(reference) ||
    game.tables?.find?.((table) => table.name === reference);
  if (worldTable) return worldTable;

  for (const pack of game.packs ?? []) {
    if (pack.metadata?.type !== "RollTable") continue;
    const index = typeof pack.getIndex === "function"
      ? await pack.getIndex()
      : pack.index;

    const indexMatch = index?.find?.((entry) =>
      entry._id === reference ||
      entry.uuid === reference ||
      entry.name === reference
    );

    if (indexMatch?._id) {
      const document = await pack.getDocument(indexMatch._id);
      if (document) return document;
    }
  }

  return null;
}

async function resolveSlaWoundTableBySetting(settingKey = "") {
  const configured = game.settings.get("sla-mothership", settingKey);
  const direct = await resolveRollTableReference(configured);
  if (direct) return direct;

  const label = getSlaWoundTableLabelFromSettingKey(settingKey);
  if (!label) return null;

  const fallbackNames = [
    `${label} Wound`,
    label.replace(/&/g, "and"),
    `${label.replace(/&/g, "and")} Wound`
  ];

  for (const name of fallbackNames) {
    const resolved = await resolveRollTableReference(name);
    if (resolved) return resolved;
  }

  return null;
}

const SLA_SKILL_IMAGE_OVERRIDES = {
  athletics: "systems/sla-mothership/images/sla-assets/Skills/Athletics.png",
  brawl: "systems/sla-mothership/images/sla-assets/Skills/Brawl.png"
};

function getSlaSkillRankLabel(bonus = 0) {
  const value = Number(bonus ?? 0) || 0;
  if (value >= 20) return "Master";
  if (value >= 15) return "Expert";
  if (value >= 10) return "Trained";
  if (value > 0) return "Basic";
  return "Untrained";
}

const SLA_SKILL_REFERENCE_ALIASES = {
  brawl: ["brawl"],
  meleeweaponknife: ["meleeblade1h", "brawl"],
  meleeweaponclub: ["meleeclub", "brawl"],
  meleeweapon2hsword: ["meleeblade2h"],
  meleeweaponsword: ["meleeblade1h"],
  meleeweaponaxe: ["meleeaxe"],
  meleeweaponany: ["meleeblade1h", "meleeblade2h", "meleeclub", "meleeaxe", "brawl"],
  naturalweaponclaws: ["brawl"],
  shieldriot: ["brawl"],
  throw: ["throw"],
  firearmpistol: ["firearmpistol"],
  firearmrifle: ["firearmrifleshotgun"],
  firearmshotgun: ["firearmrifleshotgun"],
  firearmrifleshotgun: ["firearmrifleshotgun"],
  firearmsmg: ["firearmsmg", "firearmautosupport"],
  firearmauto: ["firearmautosupport", "firearmsmg"],
  firearmheavy: ["firearmautosupport"],
  firearmautosupport: ["firearmautosupport", "firearmsmg"]
};

const SLA_SKILL_METADATA_BY_KEY = {
  slainfo: { category: "Mental", combat: false, attributes: ["intellect"] },
  drivecivilian: { category: "Technical", combat: false, attributes: ["speed", "intellect"] },
  drivemilitary: { category: "Technical", combat: false, attributes: ["speed", "intellect"] },
  pilot: { category: "Technical", combat: false, attributes: ["speed", "intellect"] },
  techcomputersai: { category: "Technical", combat: false, attributes: ["intellect"] },
  techelectronics: { category: "Technical", combat: false, attributes: ["intellect"] },
  techmechanical: { category: "Technical", combat: false, attributes: ["intellect"] },
  techmilitary: { category: "Technical", combat: false, attributes: ["intellect"] },
  bureaucracy: { category: "Mental", combat: false, attributes: ["intellect"] },
  medical: { category: "Mental", combat: false, attributes: ["intellect"] },
  psychology: { category: "Mental", combat: false, attributes: ["intellect"] },
  tactics: { category: "Mental", combat: false, attributes: ["intellect"] },
  computersystems: { category: "Technical", combat: false, attributes: ["intellect"] },
  persuade: { category: "Communication", combat: false, attributes: ["intellect"] },
  fasttalk: { category: "Communication", combat: false, attributes: ["intellect"] },
  intimidate: { category: "Communication", combat: false, attributes: ["intellect"] },
  streetwise: { category: "Communication", combat: false, attributes: ["intellect"] },
  command: { category: "Communication", combat: false, attributes: ["intellect"] },
  craftspecialty: { category: "Mental", combat: false, attributes: ["intellect"] },
  spothidden: { category: "Perception", combat: false, attributes: ["speed", "intellect"] },
  listen: { category: "Perception", combat: false, attributes: ["speed", "intellect"] },
  athletics: { category: "Physical", combat: false, attributes: ["strength", "speed"] },
  climb: { category: "Physical", combat: false, attributes: ["strength", "speed"] },
  swim: { category: "Physical", combat: false, attributes: ["strength", "speed"] },
  dodge: { category: "Physical", combat: false, attributes: ["speed"] },
  stealth: { category: "Physical", combat: false, attributes: ["speed"] },
  brawl: { category: "Combat", combat: true, attributes: ["combat", "strength"] },
  meleeblade1h: { category: "Combat", combat: true, attributes: ["combat", "strength"] },
  meleeblade2h: { category: "Combat", combat: true, attributes: ["combat", "strength"] },
  meleeclub: { category: "Combat", combat: true, attributes: ["combat", "strength"] },
  meleeaxe: { category: "Combat", combat: true, attributes: ["combat", "strength"] },
  throw: { category: "Combat", combat: true, attributes: ["combat", "strength", "speed"] },
  firearmpistol: { category: "Combat", combat: true, attributes: ["combat"] },
  firearmrifleshotgun: { category: "Combat", combat: true, attributes: ["combat"] },
  firearmsmg: { category: "Combat", combat: true, attributes: ["combat"] },
  firearmautosupport: { category: "Combat", combat: true, attributes: ["combat"] },
  biofeedback: { category: "Mental", combat: false, attributes: ["intellect"] },
  formulate: { category: "Mental", combat: false, attributes: ["intellect"] },
  ebbcore: { category: "Mental", combat: false, attributes: ["intellect"] },
  ebbawareness: { category: "Perception", combat: false, attributes: ["speed", "intellect"] },
  ebbblast: { category: "Combat", combat: true, attributes: ["combat", "intellect"] },
  ebbthermalred: { category: "Combat", combat: true, attributes: ["combat", "intellect"] },
  ebbthermalblue: { category: "Combat", combat: true, attributes: ["combat", "intellect"] },
  ebbtelekinesis: { category: "Mental", combat: false, attributes: ["strength", "intellect"] },
  ebbcommunicate: { category: "Mental", combat: false, attributes: ["intellect"] },
  ebbsenses: { category: "Perception", combat: false, attributes: ["speed", "intellect"] },
  ebbprotect: { category: "Mental", combat: false, attributes: ["intellect"] },
  ebbheal: { category: "Mental", combat: false, attributes: ["intellect"] },
  ebbrealityfold: { category: "Mental", combat: false, attributes: ["intellect"] }
};

function normalizeSlaSkillKey(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function getSlaSkillMetadataForName(name = "", fallbackCategory = "") {
  const key = normalizeSlaSkillKey(name);
  const profile = SLA_SKILL_METADATA_BY_KEY[key];
  if (profile) return profile;
  if (fallbackCategory) {
    return {
      category: fallbackCategory,
      combat: String(fallbackCategory).trim().toLowerCase() === "combat",
      attributes: []
    };
  }
  return null;
}

const SLA_CRITICAL_FAILURE_TABLES = {
  firearm: {
    label: "Firearm Critical Failure",
    entries: [
      { title: "Misfeed", effect: "The shot sputters out. Clear the chamber before this weapon can fire again." },
      { title: "Dry Click", effect: "You burn the action on a bad feed. Lose the next half-action or equivalent moment of tempo." },
      { title: "Hot Brass", effect: "You flinch from venting brass and powder. Take Disadvantage on your next firearm roll this round." },
      { title: "Sight Knock", effect: "The weapon bucks off line. Your next aimed shot loses any range or aim benefit." },
      { title: "Magazine Slip", effect: "The magazine drops or partially seats. Spend an action to slam it home." },
      { title: "Safety Snag", effect: "Harness, sling, or safety catches at the wrong time. You cannot use reactions with this weapon until reset." },
      { title: "Overheat", effect: "The chamber runs dangerously hot. Firing again before cooling inflicts 1d5 damage to the weapon hand." },
      { title: "Wild Burst", effect: "The muzzle climbs hard. An ally or nearby asset is exposed unless the GM rules otherwise." },
      { title: "Jam", effect: "The weapon locks up hard. Full reload and field-clear procedure required before it works again." },
      { title: "Catastrophic Flashback", effect: "The shot backfires brutally. Suffer 1d5 damage and the weapon is unusable until repaired." }
    ]
  },
  melee: {
    label: "Melee Critical Failure",
    entries: [
      { title: "Bad Footing", effect: "You overcommit and lose ground. The target gains Advantage on the next opposed melee exchange." },
      { title: "Open Guard", effect: "Your defence opens wide. You cannot parry, block, or react effectively until your next turn." },
      { title: "Weapon Check", effect: "Your weapon binds or bounces free. Spend your next action to recover proper grip and stance." },
      { title: "Glancing Blow", effect: "The hit skids off cover or armour. You deal no damage and your position is compromised." },
      { title: "Off-Balance Spin", effect: "Momentum carries you through. Move one step past the target or fall prone, GM's call." },
      { title: "Hand Shock", effect: "The impact numbs your arm. Take -10 on Strength and Combat checks until the end of the next round." },
      { title: "Dropped Weapon", effect: "Your weapon flies loose or falls at your feet." },
      { title: "Friendly Opening", effect: "You expose an ally's line. The nearest ally loses cover or must reposition immediately." },
      { title: "Pulled Muscle", effect: "You wrench something important. Take 1d5 damage and all melee attacks are at Disadvantage until treated." },
      { title: "Weapon Break", effect: "The weapon chips, bends, or snaps. It is unusable until repaired or replaced." }
    ]
  },
  strength: {
    label: "Strength Critical Failure",
    entries: [
      { title: "Strain", effect: "You pull something ugly. Take 1d5 damage and lose brute-force follow-through this scene." },
      { title: "Dropped Load", effect: "Whatever you were hauling, holding, or forcing slips free in the worst possible way." },
      { title: "Brace Break", effect: "Your leverage collapses. The obstacle, door, or target gains a clear advantage over you." },
      { title: "Noisy Impact", effect: "The effort is loud and obvious. Nearby threats are alerted." },
      { title: "Tool Snap", effect: "Improvised kit, handle, or strap gives way. The relevant tool is damaged or lost." },
      { title: "Bad Lift", effect: "You overextend. Take -10 on the next Strength or Combat roll." },
      { title: "Pinned Position", effect: "You end up trapped under the task. Spend an action to free yourself before trying again." },
      { title: "Collateral Damage", effect: "You break the wrong thing. The environment or objective takes an ugly hit." },
      { title: "Hold Lost", effect: "Grip fails completely. The target breaks loose or the object drops to a worse position." },
      { title: "Backlash", effect: "The force rebounds into you. Suffer 1d10 Stress or 1d5 damage, GM's call for the scene." }
    ]
  },
  speed: {
    label: "Speed Critical Failure",
    entries: [
      { title: "Slip", effect: "You lose traction and go down or collide with the environment." },
      { title: "Bad Timing", effect: "You move a second too early. An opponent or hazard acts before you can recover." },
      { title: "Noise Spike", effect: "The attempt is fast but loud. Stealth is blown." },
      { title: "Wrong Cover", effect: "You dive into poor cover and lose any defensive benefit." },
      { title: "Dropped Kit", effect: "Essential gear spills or is left behind during the scramble." },
      { title: "Twist", effect: "You wrench ankle, knee, or hip. Take -10 on Speed checks until you rest." },
      { title: "Crossed Line", effect: "You overrun the mark and end up exposed to return fire or direct danger." },
      { title: "Friendly Collision", effect: "You crash through a teammate's lane and break squad discipline." },
      { title: "Stall Out", effect: "Momentum dies completely. Lose your next movement action." },
      { title: "Full Spill", effect: "You crash hard. Take 1d5 damage and end prone or hanging in the open." }
    ]
  },
  intellect: {
    label: "Intellect Critical Failure",
    entries: [
      { title: "False Read", effect: "You misread the situation and the GM gives a dangerously wrong first impression." },
      { title: "Terminal Mistake", effect: "You input or interpret the wrong detail. The task gets harder before it gets better." },
      { title: "Bad Assumption", effect: "You lock onto the wrong theory. Another attempt on this problem is at Disadvantage until new evidence appears." },
      { title: "Corrupted Data", effect: "You overwrite, erase, or contaminate useful intel." },
      { title: "Security Trace", effect: "Your inquiry leaves a footprint. Someone knows you were here." },
      { title: "Slow Realisation", effect: "You lose vital time. The scene clock advances or pressure escalates." },
      { title: "Protocol Breach", effect: "You trigger a lockout, alarm, or bureaucratic complication." },
      { title: "Miscommunication", effect: "Your explanation sends the team in the wrong direction for a beat." },
      { title: "Feedback Headache", effect: "The mental load hits hard. Gain 1 Stress." },
      { title: "Cascade Failure", effect: "The whole approach collapses. You need a new angle, tool, or specialist before retrying." }
    ]
  }
};

const SLA_CRITICAL_SUCCESS_OPTIONS = {
  firearm: [
    "Choose one: roll the weapon's damage twice and keep the better result.",
    "Choose one: ignore half the target's armour or cover on this hit.",
    "Choose one: pin, disarm, or force the target to move exactly where the shot drives them."
  ],
  melee: [
    "Choose one: double the final damage after all normal modifiers.",
    "Choose one: force the target prone, back a zone, or off balance for the next exchange.",
    "Choose one: disarm, grapple, or open a free follow-up attack for an ally in reach."
  ],
  strength: [
    "Choose one: complete the task faster than expected and create a clean follow-up opening.",
    "Choose one: force the obstacle, restraint, or target to yield so completely it cannot be reused immediately.",
    "Choose one: add a decisive physical edge such as pinning, breaking, or hurling the target clear."
  ],
  speed: [
    "Choose one: gain immediate positional advantage, cover, or initiative over everyone else in the scene.",
    "Choose one: stay silent and leave no obvious trace of movement.",
    "Choose one: complete the action and still keep momentum for a second linked move or interaction."
  ],
  intellect: [
    "Choose one: gain an extra true detail, hidden pattern, or exploitable weakness beyond the original ask.",
    "Choose one: solve the problem cleanly and reduce the time, cost, or fallout of the action.",
    "Choose one: create a lasting procedural edge such as bypass access, a reusable exploit, or a stronger briefing."
  ]
};

/**
 * Extend the base Actor entity by defining a custom roll data structure which is ideal for the Simple system.
 * @extends {Actor}
 */
export class MothershipActor extends Actor {

  // augment the basic actor data with additional dynamic data
  prepareDerivedData() {

    super.prepareDerivedData();
    const system = this.system;

    // ----- per-type derived -----
    if (this.type === "character") this._deriveCharacter();
    else if (this.type === "creature") this._deriveCreature();
    else if (this.type === "ship") this._deriveShip();
  }

  // Prepare Character type specific data
  _deriveCharacter() {
    const system = this.system;
    //armor points + damage reduction
      //init vars
      let armorPoints = 0;
      let damageReduction = 0;
      //count values
      for (const armor of this.items.filter(i => i.type === "armor")) {
        if (armor.system?.equipped) {
          armorPoints += Number(armor.system.armorPoints ?? 0);
          damageReduction += Number(armor.system.damageReduction ?? 0);
        }
      }
      //set values
      system.stats.armor.mod = armorPoints;
      system.stats.armor.total = armorPoints + Number(system.stats.armor.value ?? 0);
      system.stats.armor.damageReduction = damageReduction;
    //net hp
      //init vars
      let netHPvalue = 0;
      let netHPmax = 0;
      //check if actor has netHP
      system.netHP ??= { value: 0, min: 0, max: 0, label: "Net HP"};
      //set values
      system.netHP.value = ((Number(system.hits.max ?? 0)-Number(system.hits.value ?? 0)-1) * Number(system.health.max ?? 0)) + Number(system.health.value ?? 0);
      system.netHP.max = Number(system.health.max ?? 0) * Number(system.hits.max ?? 0);
    //bleeding
      //init vars
      let bleedingValue = 0;
      //count values
      for (const condition of this.items.filter(i => i.type === "condition")) {
        if (condition.name === 'Bleeding') {
          bleedingValue += Number(condition.system.severity ?? 0);
        }
      }
      //set values
      system.bleeding.value = Number(bleedingValue ?? 0);
  }

  // Prepare Creature type specific data
  _deriveCreature() {
    const system = this.system;
    //armor points + damage reduction
      //init vars
      let armorPoints = 0;
      let damageReduction = 0;
      //count values
      for (const armor of this.items.filter(i => i.type === "armor")) {
        if (armor.system?.equipped) {
          armorPoints += Number(armor.system.armorPoints ?? 0);
          damageReduction += Number(armor.system.damageReduction ?? 0);
        }
      }
      //set values
      system.stats.armor.mod = armorPoints;
      system.stats.armor.total = armorPoints + Number(system.stats.armor.value ?? 0);
      system.stats.armor.damageReduction = damageReduction;
    //net hp
      //check if actor has netHP
      system.netHP ??= { value: 0, min: 0, max: 0, label: "Net HP"};
      //set values
      system.netHP.value = ((Number(system.hits.max ?? 0)-Number(system.hits.value ?? 0)-1) * Number(system.health.max ?? 0)) + Number(system.health.value ?? 0);
      system.netHP.max = Number(system.health.max ?? 0) * Number(system.hits.max ?? 0);
    //notes
      //check if actor has notes
      system.notes ??= "";
    //bleeding
      //init vars
      let bleedingValue = 0;
      //count values
      for (const condition of this.items.filter(i => i.type === "condition")) {
        if (condition.name === 'Bleeding') {
          bleedingValue += Number(condition.system.severity ?? 0);
        }
      }
      //set values
      system.bleeding.value = Number(bleedingValue ?? 0);
    //keep combat updates for swarm types
    if (system.swarm && system.swarm.enabled){
      system.stats.combat.value = system.swarm.combat.value * ( system.hits.max - system.hits.value ); 
    }
  }

  // Prepare Ship type specific data
  _deriveShip() {
    //nothing needed yet
  }

  async useSlaDrug(itemId) {
    return SLADrugSystem.useDrug({ actor: this, itemId });
  }

  async closeSlaDrug(itemId = "", drug = "") {
    return SLADrugSystem.closeDrug({ actor: this, itemId, drug });
  }

  //central flavor text library for all chat messages
  getFlavorText(type, context, action) {
    
    //replace 'stress' with calm if the setting is active
    if (game.settings.get("sla-mothership", "useCalm") && context === 'stress') {
      context = 'calm';
    }
    let systemclass = "human";
    if (this.type === 'character' && this.system.class && this.system.class.value.toLowerCase() === "android") {
      systemclass = "android";
      //todo: get the class item for the character to check the "is robotic" flag
    }
    let locString = `Mosh.${type}.${context}.${action}.${systemclass}`;
    //check to see if this address exists in the library, return the action parameter if not
    if(game.i18n.has(locString, true)){ // You can pass false as the second argument to ignore english-language fallback.
        //log what was done
        slaDebug(`Retrieved flavor text for ${locString}`);
        //return class appropriate text
        return game.i18n.localize(locString);
    } else {
      //log what was done
      slaDebug(`Using language: ${game.i18n.language}`);
      slaDebug(`Retrieved flavor text for ${locString}, which did not have an entry`);
      slaDebug(`Using language: ${game.i18n.lang}`);
      //return what we were asked
      return action;
    }
  }

  renderSlaWoundEffect(rawEffect = "") {
    return renderSlaWoundEffectMarkup(rawEffect);
  }

  async rollSlaWoundEffect(effectKeyOrLabel, modifier = "standard") {
    const effectInput = modifier && String(effectKeyOrLabel ?? "").trim() && !String(effectKeyOrLabel).includes("[")
      ? `${String(effectKeyOrLabel).trim()}${modifier === "adv" ? " [+]" : modifier === "dis" ? " [-]" : ""}`
      : effectKeyOrLabel;
    const parsed = parseSlaWoundEffect(effectInput);
    if (!parsed || parsed.unknown) {
      ui.notifications.warn(`No valid wound effect could be resolved from "${effectKeyOrLabel}".`);
      return null;
    }

    const tableId = game.settings.get("sla-mothership", parsed.settingKey);
    if (!tableId) {
      ui.notifications.warn(`No wound table is configured for ${parsed.label}.`);
      return null;
    }

    const tableData = await resolveSlaWoundTableBySetting(parsed.settingKey);
    if (!tableData) {
      ui.notifications.warn(`The ${parsed.label} wound table could not be found.`);
      return null;
    }

    const modifierSuffix =
      parsed.modifier === "adv" ? " [+]" :
      parsed.modifier === "dis" ? " [-]" :
      "";
    const rollString = `${getSlaTableRollFormula(tableData)}${modifierSuffix}`;

    return this.rollTable(tableData.uuid ?? tableData.id ?? tableId, rollString, "low", true, false, null, null, {
      suppressActorWound: true
    });
  }

  //central roll parsing function | TAKES '1d10 [+]','low' | RETURNS '{1d10,1d10}kh'
  parseRollString(rollString, aimFor) {
    //init vars
    let rollDice = ``;
    let rollTemplate = ``;
    let rollStringParsed = ``;
    //translate rollString into foundry roll string format
    if (rollString.includes('[')) {
      //extract dice needed
      rollDice = rollString.substr(0, rollString.indexOf('[')).trim().concat(',', rollString.substr(0, rollString.indexOf('[')).trim());
      //set template based on adv or dis
      if (rollString.includes('[-]')) {
        //use appropriate keep setting
        if (aimFor === 'low') {
          rollTemplate = '{[diceSet]}kh';
        } else {
          rollTemplate = '{[diceSet]}kl';
        }
      } else if (rollString.includes('[+]')) {
        //use appropriate keep setting
        if (aimFor === 'low') {
          rollTemplate = '{[diceSet]}kl';
        } else {
          rollTemplate = '{[diceSet]}kh';
        }
      }
      //make foundry roll string
      rollStringParsed = rollTemplate.replace('[diceSet]', rollDice);
    } else {
      rollStringParsed = rollString;
    }
    //log what was done
    slaDebug(`Parsed '${rollString}' aiming '${aimFor}' into '${rollStringParsed}'`);
    //return string in foundry format
    return rollStringParsed;
  }

  clampSlaRollTarget(rollTarget, rollString = "") {
    const numericTarget = Number(rollTarget);
    if (!Number.isFinite(numericTarget)) return rollTarget;
    const usesD100 = String(rollString ?? "").includes("1d100");
    if (!usesD100) return numericTarget;
    return Math.min(98, numericTarget);
  }

  isSlaAutomaticFailure(total, rollString = "") {
    const numericTotal = Number(total);
    if (!Number.isFinite(numericTotal)) return false;
    const usesD100 = String(rollString ?? "").includes("1d100");
    return usesD100 && numericTotal === 99;
  }

  getSlaChatVariant(context = {}) {
    const actorClass = String(this.system?.class?.value ?? "").trim();
    const employer = String(this.system?.sla?.employer?.value ?? "").trim();
    const sector = String(this.system?.sla?.sector?.value ?? "").trim();
    const skill = String(context?.skill ?? "").trim();
    const skillCategory = String(context?.skillCategory ?? "").trim();
    const tableName = String(context?.tableName ?? "").trim();
    const header = String(context?.msgHeader ?? "").trim();
    const weaponName = String(context?.weapon?.name ?? "").trim();
    const itemName = String(context?.item?.name ?? "").trim();
    const extra = String(context?.extra ?? "").trim();

    const haystack = [
      actorClass,
      employer,
      sector,
      skill,
      skillCategory,
      tableName,
      header,
      weaponName,
      itemName,
      extra
    ].join(" ").toLowerCase();

    if (context?.isSlaEbbSkill || /\bebb\b|ebon|brain\swaste|flux|telekinesis|blast|awareness/.test(haystack)) {
      return { key: "ebb", label: "Ebb", emblem: "EBB" };
    }
    if (/\bdark\s?night\b/.test(haystack)) {
      return { key: "darknight", label: "DarkNight", emblem: "DN" };
    }
    if (/\bshiver\b/.test(haystack)) {
      return { key: "shiver", label: "Shiver", emblem: "SV" };
    }
    if (/\bmort\b|mortuary|undertaker|corpse|cadaver/.test(haystack)) {
      return { key: "mort", label: "Mort", emblem: "MT" };
    }
    if (/\btek\b|technical|engineer|engineering|medic|medical|science|research/.test(haystack)) {
      return { key: "tek", label: "Tek", emblem: "TK" };
    }
    if (/\bops\b|operations|opscon|ops\scon|operative|squad/.test(haystack)) {
      return { key: "ops", label: "Ops", emblem: "OP" };
    }
    return { key: "sla", label: "SLA", emblem: "SLA" };
  }

  getSlaSeverityMeta({ severity = null, tableName = "", specialRoll = "", tableResultNumber = null } = {}) {
    const rawSeverity = Number(severity);
    if (Number.isFinite(rawSeverity)) {
      if (rawSeverity >= 5) return { key: "critical", label: "Critical", cssClass: "sla-severity-critical" };
      if (rawSeverity >= 3) return { key: "severe", label: "Severe", cssClass: "sla-severity-severe" };
      return { key: "minor", label: "Minor", cssClass: "sla-severity-minor" };
    }

    const name = String(tableName ?? "").toLowerCase();
    const special = String(specialRoll ?? "").toLowerCase();
    const numericResult = Number(tableResultNumber);

    if (!Number.isFinite(numericResult)) {
      return { key: "minor", label: "Minor", cssClass: "sla-severity-minor" };
    }

    const isPanic = special === "paniccheck" || name.includes("panic");
    const isWound = name.includes("wound");

    if (isPanic) {
      if (numericResult >= 16) return { key: "critical", label: "Catastrophic", cssClass: "sla-severity-critical" };
      if (numericResult >= 9) return { key: "severe", label: "Severe", cssClass: "sla-severity-severe" };
      return { key: "minor", label: "Minor", cssClass: "sla-severity-minor" };
    }

    if (isWound) {
      if (numericResult >= 8) return { key: "critical", label: "Critical", cssClass: "sla-severity-critical" };
      if (numericResult >= 4) return { key: "severe", label: "Severe", cssClass: "sla-severity-severe" };
      return { key: "minor", label: "Minor", cssClass: "sla-severity-minor" };
    }

    return { key: "minor", label: "Minor", cssClass: "sla-severity-minor" };
  }

  async addSlaActivityLog(entry, { maxEntries = 40 } = {}) {
    const text = String(entry ?? "").trim();
    if (!text || this.type !== "character") return null;

    const timestamp = new Date().toLocaleString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    const currentLog = String(this.system?.sla?.activityLog?.value ?? "").trim();
    const existingLines = currentLog ? currentLog.split("\n").filter(Boolean) : [];
    const nextLines = [`[${timestamp}] ${text}`, ...existingLines].slice(0, Math.max(1, maxEntries));
    await this.update({ "system.sla.activityLog.value": nextLines.join("\n") });
    return nextLines[0];
  }

  //central roll parsing function | TAKES '1d100',[Foundry roll object],true,true,41,'<' | RETURNS enriched Foundry roll object
  parseRollResult(rollString, rollResult, zeroBased, checkCrit, rollTarget, comparison, specialRoll) {
    //init vars
    rollTarget = this.clampSlaRollTarget(rollTarget, rollString);
    let doubles = new Set([0, 11, 22, 33, 44, 55, 66, 77, 88, 99]);
    let enrichedRollResult = rollResult;
    let rollFormula = enrichedRollResult.formula;
    let rollAim = rollFormula.substr(rollFormula.indexOf("}") + 1, 2);
    let useCalm = game.settings.get('sla-mothership', 'useCalm');
    let die0value = 999;
    let die1value = 999;
    let die0success = false;
    let die1success = false;
    let die0crit = false;
    let die1crit = false;
    let newTotal = 999;
    let diceFormula = ``;
    let compareIcon = ``;
    let outcome = ``;
    let outcomeHtml = ``;
    let diceIcon = ``;
    let diceBlock = ``;
    let critHighlight = ``;
    let rollHtml = ``;
    //init new fields in enriched roll result
    enrichedRollResult.critical = false;
    enrichedRollResult.success = false;
    enrichedRollResult.isCritSuccess = false;
    enrichedRollResult.isCritFailure = false;
    enrichedRollResult.critClass = "";
    enrichedRollResult.outcomeHtml = ``;
    enrichedRollResult.rollHtml = ``;
    //alter roll result object
      //change data point: change each 100 or 10 result to zero
      if (zeroBased) {
        //1d10 changes
      if (rollString.substr(0, rollString.indexOf("[")).trim() === '1d10' || rollString === '1d10' || rollString.substr(0, rollString.indexOf("[")).trim() === '-1d10' || rollString === '-1d10') {
          //loop through dice
        enrichedRollResult.dice.forEach(function (roll) {
            //loop through each result
          roll.results.forEach(function (die) {
              //change any 10s to 0s
            if (die.result === 10 || die.result === -10) {
              die.result = 0;
            }
            });
          });
        //1d100 changes
      } else if (rollString.substr(0, rollString.indexOf("[")).trim() === '1d100' || rollString === '1d100' || rollString.substr(0, rollString.indexOf("[")).trim() === '-1d100' || rollString === '-1d100') {
          //loop through dice
        enrichedRollResult.dice.forEach(function (roll) {
            //loop through each result
          roll.results.forEach(function (die) {
              //change any 100s to 0s
            if (die.result === 100 || die.result === -100) {
              die.result = 0;
            }
            });
          });
        }
      }
      //set roll A and B
    if (enrichedRollResult.dice[0]) {
      die0value = enrichedRollResult.dice[0].results[0].result;
    }
    if (enrichedRollResult.dice[1]) {
      die1value = enrichedRollResult.dice[1].results[0].result;
    }
      //do we need to pick a winner?
      if (rollString.includes("[")) {
        //set whether each die succeeded
          //die 0
      if (comparison === '<' && die0value < rollTarget && !this.isSlaAutomaticFailure(die0value, rollString)) {
        die0success = true;
      }
      if (comparison === '<=' && die0value <= rollTarget && !this.isSlaAutomaticFailure(die0value, rollString)) {
        die0success = true;
      }
      if (comparison === '>' && die0value > rollTarget && !this.isSlaAutomaticFailure(die0value, rollString)) {
        die0success = true;
      }
      if (comparison === '>=' && die0value >= rollTarget && !this.isSlaAutomaticFailure(die0value, rollString)) {
        die0success = true;
      }
          //die 1
      if (comparison === '<' && die1value < rollTarget && !this.isSlaAutomaticFailure(die1value, rollString)) {
        die1success = true;
      }
      if (comparison === '<=' && die1value <= rollTarget && !this.isSlaAutomaticFailure(die1value, rollString)) {
        die1success = true;
      }
      if (comparison === '>' && die1value > rollTarget && !this.isSlaAutomaticFailure(die1value, rollString)) {
        die1success = true;
      }
      if (comparison === '>=' && die1value >= rollTarget && !this.isSlaAutomaticFailure(die1value, rollString)) {
        die1success = true;
      }
        //set whether each die are a crit
          //die 0
      if (checkCrit && doubles.has(die0value)) {
        die0crit = true;
      }
          //die 1
      if (checkCrit && doubles.has(die1value)) {
        die1crit = true;
      }
        //if [-] pick a new worst number
        if (rollString.includes("[-]")) {
          //if we are trying to keep the highest
        if (rollAim === 'kh') {
            //set default result value to the highest value
          newTotal = Math.max(die0value, die1value);
            //if both are a success and only dice 0 is a crit: don't pick the crit
          if (die0success && die1success && die0crit && !die1crit) {
            newTotal = die1value;
          }
            //if both are a success and only dice 1 is a crit: don't pick the crit
          if (die0success && die1success && !die0crit && die1crit) {
            newTotal = die0value;
          }
            //if both are a failure and only dice 0 is a crit: pick the crit
          if (!die0success && !die1success && die0crit && !die1crit) {
            newTotal = die0value;
          }
            //if both are a failure and only dice 1 is a crit: pick the crit
          if (!die0success && !die1success && !die0crit && die1crit) {
            newTotal = die1value;
          }
            //if this is a panic check and both are a failure: pick the worst
          if (specialRoll === 'panicCheck' && !useCalm && !die0success && !die1success) {
            newTotal = Math.max(die0value, die1value);
          }
          }
          //if we are trying to keep the lowest
        if (rollAim === 'kl') {
            //set default result value to the lowest value
          newTotal = Math.min(die0value, die1value);
            //if both are a success and only dice 0 is a crit: don't pick the crit
          if (die0success && die1success && die0crit && !die1crit) {
            newTotal = die1value;
          }
            //if both are a success and only dice 1 is a crit: don't pick the crit
          if (die0success && die1success && !die0crit && die1crit) {
            newTotal = die0value;
          }
            //if both are a failure and only dice 0 is a crit: pick the crit
          if (!die0success && !die1success && die0crit && !die1crit) {
            newTotal = die0value;
          }
            //if both are a failure and only dice 1 is a crit: pick the crit
          if (!die0success && !die1success && !die0crit && die1crit) {
            newTotal = die1value;
          }
            //if this is a panic check and both are a failure: pick the worst
          if (specialRoll === 'panicCheck' && !useCalm && !die0success && !die1success) {
            newTotal = Math.max(die0value, die1value);
          }
          }
        }
        //if [+] pick a new best number
        if (rollString.includes("[+]")) {
          //if we are trying to keep the highest
        if (rollAim === 'kh') {
            //set default result value to the highest value
          newTotal = Math.max(die0value, die1value);
            //if both are a success and only dice 0 is a crit: pick the crit
          if (die0success && die1success && die0crit && !die1crit) {
            newTotal = die0value;
          }
            //if both are a success and only dice 1 is a crit: pick the crit
          if (die0success && die1success && !die0crit && die1crit) {
            newTotal = die1value;
          }
            //if both are a failure and only dice 0 is a crit: don't pick the crit
          if (!die0success && !die1success && die0crit && !die1crit) {
            newTotal = die1value;
          }
            //if both are a failure and only dice 1 is a crit: don't pick the crit
          if (!die0success && !die1success && !die0crit && die1crit) {
            newTotal = die0value;
          }
            //if this is a panic check and both are a failure: pick the best
          if (specialRoll === 'panicCheck' && !useCalm && !die0success && !die1success) {
            newTotal = Math.min(die0value, die1value);
          }
          }
          //if we are trying to keep the lowest
        if (rollAim === 'kl') {
            //set default result value to the lowest value
          newTotal = Math.min(die0value, die1value);
            //if both are a success and only dice 0 is a crit: pick the crit
          if (die0success && die1success && die0crit && !die1crit) {
            newTotal = die0value;
          }
            //if both are a success and only dice 1 is a crit: pick the crit
          if (die0success && die1success && !die0crit && die1crit) {
            newTotal = die1value;
          }
            //if both are a failure and only dice 0 is a crit: don't pick the crit
          if (!die0success && !die1success && die0crit && !die1crit) {
            newTotal = die1value;
          }
            //if both are a failure and only dice 1 is a crit: don't pick the crit
          if (!die0success && !die1success && !die0crit && die1crit) {
            newTotal = die0value;
          }
            //if this is a panic check and both are a failure: pick the best
          if (specialRoll === 'panicCheck' && !useCalm && !die0success && !die1success) {
            newTotal = Math.min(die0value, die1value);
          }
          }
        }
      //we don't need to pick a winner
      } else {
        //set result value to the only die
        newTotal = die0value;
      }
      //set final total value - apply negative for negative rolls
    if (rollString.substr(0, 1) === '-') {
        enrichedRollResult._total = newTotal * -1;
      } else {
        enrichedRollResult._total = newTotal;
      }
    //enrich roll result object
      //add data point: detect critical 
      if (checkCrit) {
        //check for crit
        if (doubles.has(enrichedRollResult.total)) {
          enrichedRollResult.critical = true;
        } else {
          enrichedRollResult.critical = false;
        }
      }
      //add data point: detect success/failure
      if (rollTarget || rollTarget === 0) {
        //check for auto failure
        if (this.isSlaAutomaticFailure(enrichedRollResult.total, rollString)) {
          // result 99 on d100 is always a failure
          enrichedRollResult.success = false;
        } else {
          //compare values based on compararison setting
          if (comparison === '<') {
            //check against being under the target
            if (enrichedRollResult.total < rollTarget) {
              enrichedRollResult.success = true;
            } else {
              enrichedRollResult.success = false;
            }
          } else if (comparison === '<=') {
            //check against being under or equal to the target
            if (enrichedRollResult.total <= rollTarget) {
              enrichedRollResult.success = true;
            } else {
              enrichedRollResult.success = false;
            }
          } else if (comparison === '>') {
            //check against being over the target
            if (enrichedRollResult.total > rollTarget) {
              enrichedRollResult.success = true;
            } else {
              enrichedRollResult.success = false;
            }
          } else if (comparison === '>=') {
            //check against being over or equal to the target
            if (enrichedRollResult.total >= rollTarget) {
              enrichedRollResult.success = true;
            } else {
              enrichedRollResult.success = false;
            }
          }
      }
      enrichedRollResult.isCritSuccess = Boolean(enrichedRollResult.critical && enrichedRollResult.success);
      enrichedRollResult.isCritFailure = Boolean(enrichedRollResult.critical && !enrichedRollResult.success);
      enrichedRollResult.critClass = enrichedRollResult.isCritSuccess
        ? "sla-crit-success"
        : enrichedRollResult.isCritFailure
          ? "sla-crit-failure"
          : "";
      //add data point: outcome HTML
          //prepare outcome
            //success
            if (enrichedRollResult.success) {
              outcome = `SUCCESS!`;
            } else {
              outcome = `FAILURE!`;
            }
            //crit
            if (enrichedRollResult.critical) {
              outcome = `CRITICAL ` + outcome;
            }
          //make HTML
          outcomeHtml = `
            <div class="sla-roll-outcome ${enrichedRollResult.critClass}" style="font-size: 1.1rem; margin-top : -10px; margin-bottom : 5px;">
              <strong>${outcome}</strong>
            </div>
          `;
          //update final roll html string
          enrichedRollResult.outcomeHtml = outcomeHtml;
      }
      //add data point: interactive roll HTML
        //prepare variables
          //make comparison icon
          if (comparison === '<') {
            compareIcon = '<i class="fas fa-less-than"></i>';
          } else if (comparison === '<=') {
            compareIcon = '<i class="fas fa-less-than-equal"></i>';
          } else if (comparison === '>') {
            compareIcon = '<i class="fas fa-greater-than"></i>';
          } else if (comparison === '>=') {
            compareIcon = '<i class="fas fa-greater-than-equal"></i>';
          }
          //prepare formula
          if (rollTarget || rollTarget === 0) {
            //show dice against target
            diceFormula = rollString + ' ' + compareIcon + ' ' + rollTarget;
          } else {
            //just show the dice
            diceFormula = rollString;
          }
          //prepare dice block
            //loop through rolls
            enrichedRollResult.dice.forEach(function (roll) {
              //add header for this roll
              diceBlock = diceBlock + `
                <section class="tooltip-part">
                  <div class="dice">
              `;
              //add formula and result for this roll
              diceBlock = diceBlock + `
                <header class="part-header flexrow">
                  <span class="part-formula">${roll.formula}</span>
                  <span class="part-total">${roll.total.toString()}</span>
                </header>
                <ol class="dice-rolls">
              `;
              //loop through dice
      roll.results.forEach(function (die) {
                //set highlight if crit is asked for
                if (checkCrit) {
                  //check for crit
                  if (doubles.has(die.result)) {
                    //check for success
                    if (rollTarget) {
                      //check for auto failure
                      if (die.result >= 90) {
                        //result >= 90 is a failure, no highlight needed
                        critHighlight = ' min';
                      } else {
                        //check against beating the target
                if (comparison === '<' && die.result < rollTarget) {
                  critHighlight = ' max';
                } else if (comparison === '<=' && die.result <= rollTarget) {
                  critHighlight = ' max';
                } else if (comparison === '>' && die.result > rollTarget) {
                  critHighlight = ' max';
                } else if (comparison === '>=' && die.result >= rollTarget) {
                  critHighlight = ' max';
                } else {
                  critHighlight = ' min';
                }
                      }
                    }
                  } else {
                    //no highlight needed
                    critHighlight = '';
                  }
                } else {
                  //no highlight needed
                  critHighlight = '';
                }
                //prepare dice icon
                if (roll.faces === 100 || roll.faces === 5) {
                  diceIcon = `10`;
                } else {
                  diceIcon = roll.faces.toString();
                }
                //add formula and result for this die
                diceBlock = diceBlock + `
                      <li class="roll die d${diceIcon}${critHighlight}">${die.result.toString()}</li>
                `;
              });
              //add footer for this roll
              diceBlock = diceBlock + `
                    </ol>
                  </div>
                </section>
              `;
            });
        //set final roll variables in to template
        rollHtml = `
          <div class="dice-roll sla-roll-result ${enrichedRollResult.critClass}" style="margin-bottom: 10px;" data-action="expandRoll">
            <div class="dice-result">
              <div class="dice-formula">${diceFormula}</div>
              <div class="dice-tooltip" hidden>
                <div class="wrapper">
                  ${diceBlock}
                </div>
              </div>
              <h4 class="dice-total ${enrichedRollResult.critClass}">${enrichedRollResult.total}</h4>
            </div>
          </div>
        `;
        //update final roll html string
        enrichedRollResult.rollHtml = rollHtml;
    //log what was done
    slaDebug(`Enriched roll result. rollString: ${rollString}, rollResult: ${rollResult}, zeroBased: ${zeroBased}, checkCrit: ${checkCrit}, rollTarget: ${rollTarget}, comparison: ${comparison}, specialRoll: ${specialRoll}`);
    slaDebug(enrichedRollResult);
    //return the enriched roll result object
    return enrichedRollResult;
  }

  //A script to return the data from a table.
  async getRollTableData(tableId){

    let tableData = await fromIdUuid(tableId,{type:"RollTable"});
    //get table name
    let tableName = tableData.name;
    //get table name
    let tableImg = tableData.img;
    //get table result
    let tableDie = tableData.formula.replace('-1', '');

    return tableData;
  }

  //central table rolling function | TAKES 'W36WFIpCfMknKgHy','1d10','low',true,true,41,'<' | RETURNS chat message showing roll table result
  async rollTable(tableId, rollString, aimFor, zeroBased, checkCrit, rollAgainst, comparison, options = {}) {
    //init vars
    let currentLocation = '';
    let tableLocation = '';
    let messageTemplate = ``;
    let messageContent = ``;
    let msgDesc = ``;
    let flavorText = ``;
    let woundText = ``;
    let tableResultType = ``;
    let tableResultEdited = ``;
    let tableResultFooter = ``;
    let chatId = foundry.utils.randomID();
    let rollTarget = null;
    let valueAddress = [];
    let specialRoll = null;
    let firstEdition = game.settings.get('sla-mothership', 'firstEdition');
    let useCalm = game.settings.get('sla-mothership', 'useCalm');
    let androidPanic = game.settings.get('sla-mothership', 'androidPanic');
    let tableResultNumber = null;
    let secondRoll = false;
    let rollResult2 = null;
    let parsedRollResult2 = null;
    const suppressActorWound = Boolean(options?.suppressActorWound);
    //customize this roll if its a unique use-case
      //panic check
      if (tableId === 'panicCheck') {
        //set special roll value for use later
        specialRoll = tableId;
        //assign variables depending on settings
        if (firstEdition) { 
          if (androidPanic && this.system.class.value.toLowerCase() === 'android') { 
            if (useCalm) {
            tableId = game.settings.get('sla-mothership', 'table1ePanicCalmAndroid');
              aimFor = 'low';
              zeroBased = true;
              checkCrit = true;
              rollAgainst = 'system.other.stress.value';
              comparison = '<';
            } else {
            tableId = game.settings.get('sla-mothership', 'table1ePanicStressAndroid');
              aimFor = 'high';
              zeroBased = false;
              checkCrit = false;
              rollAgainst = 'system.other.stress.value';
              comparison = '>';
            }
          } else {
            if (useCalm) { 
            tableId = game.settings.get('sla-mothership', 'table1ePanicCalmNormal');
              aimFor = 'low';
              zeroBased = true;
              checkCrit = true;
              rollAgainst = 'system.other.stress.value';
              comparison = '<';
            } else {
            tableId = game.settings.get('sla-mothership', 'table1ePanicStressNormal');
              aimFor = 'high';
              zeroBased = false;
              checkCrit = false;
              rollAgainst = 'system.other.stress.value';
              comparison = '>';
            }
          }
        } else {
          if (androidPanic && this.system.class.value.toLowerCase() === 'android') { 
            if (useCalm) { 
            tableId = game.settings.get('sla-mothership', 'table0ePanicCalmAndroid');
              aimFor = 'low';
              zeroBased = true;
              checkCrit = true;
              rollAgainst = 'system.other.stress.value';
              comparison = '<';
            } else {
            tableId = game.settings.get('sla-mothership', 'table0ePanicStressAndroid');
              aimFor = 'high';
              zeroBased = false;
              checkCrit = false;
              rollAgainst = 'system.other.stress.value';
              comparison = '>';
            }
          } else {
            if (useCalm) { 
            tableId = game.settings.get('sla-mothership', 'table0ePanicCalmNormal');
              aimFor = 'low';
              zeroBased = true;
              checkCrit = true;
              rollAgainst = 'system.other.stress.value';
              comparison = '<';
            } else {
            tableId = game.settings.get('sla-mothership', 'table0ePanicStressNormal');
              aimFor = 'high';
              zeroBased = false;
              checkCrit = false;
              rollAgainst = 'system.other.stress.value';
              comparison = '>';
            }
          }
        }
        //assign rollString if its a partial
        if (rollString === '[-]' || rollString === '' || rollString === '[+]') {
          //if 1e and no calm, then 1d20
        if (firstEdition && !useCalm) {
          rollString = '1d20' + rollString;
        }
          //if 0e and no calm, then 2d10
        if (!firstEdition && !useCalm) {
          rollString = '2d10' + rollString;
        }
          //if calm, then 1d100
        if (useCalm) {
          rollString = '1d100' + rollString;
        }
        }
      }
      //maintenance check
      if (tableId === 'maintenanceCheck') {
        //set special roll value for use later
        specialRoll = tableId;
        //assign variables
      tableId = game.settings.get('sla-mothership', 'table1eMaintenance');
        zeroBased = true;
        checkCrit = true;
        rollAgainst = 'system.stats.systems.value';
        comparison = '<';
      }
    //bounce this request away if certain parameters are NULL
      //if rollString is STILL blank, redirect player to choose the roll
      if (!rollString) {
        //init vars
        let rollDie = '';
        //set rollDie
          //if 1e and no calm, then 1d20
      if (firstEdition) {
        rollDie = '1d20';
      }
          //if 0e and no calm, then 2d10
      if (!firstEdition) {
        rollDie = '2d10';
      }
          //if calm, then 1d100
      if (useCalm) {
        rollDie = '1d100';
      }
        //run the choose attribute function
      let chosenRollType = await this.chooseAdvantage( game.i18n.localize("Mosh.PanicCheck"), rollDie);
        //set variables
        rollString = chosenRollType[0];
      }

      let tableData = await resolveRollTableReference(tableId);
      if (!tableData) {
        ui.notifications.error("The selected wound or panic table could not be found. Please check the table settings.");
          slaWarn("rollTable could not resolve table reference", tableId);
        return null;
      }
      //get current compendium
      //get table name
      let tableName = tableData.name ?? "Roll Table";
      //get table name
      let tableImg = tableData.img ?? "";
      //get table result
    let tableDie = String(tableData.formula ?? "1d100").replace('-1', '');
    //if rollString is STILL blank, redirect player to choose the roll
    if (!rollString) {
      //run the choose attribute function
      let chosenRollType = await this.chooseAdvantage(tableName, tableDie);
      //set variables
      rollString = chosenRollType[0];
    }
    //table specific customizations
      //if a table has details in parenthesis, lets remove them
      if (tableName.includes(' (')) {
        //extract dice needed
      tableName = tableName.substr(0, tableName.indexOf(' ('));
      }
      //if a wound table, add a wound to the player and prepare text for the final message
      if (tableName.slice(-5) === 'Wound' && !suppressActorWound) {
      let addWound = await this.modifyActor('system.hits.value', 1, null, false);
        woundText = addWound[1];
      }
    //pull stat to roll against, if needed
    if (rollAgainst || rollAgainst === 0) {
      //turn string address into array
      valueAddress = rollAgainst.split('.');
      //set rollTarget
      rollTarget = valueAddress.reduce((a, v) => a[v], this);
    }
    //roll the dice
      //parse the roll string
    let parsedRollString = this.parseRollString(rollString, aimFor);
    if (game.settings.get('sla-mothership', 'panicDieTheme') != "") { //We're going to check if the theme field is blank. Otherwise, don't use this.
        //set panic die color
      let dsnTheme = game.settings.get('sla-mothership', 'panicDieTheme');
        //apply theme if this is a panic check
        if (tableName === 'Panic Check') {
          parsedRollString = parsedRollString + '[' + dsnTheme + ']';
        }
     }
      //roll the dice
      let rollResult = await new Roll(parsedRollString).evaluate();
      //interpret the results
    let parsedRollResult = this.parseRollResult(rollString, rollResult, zeroBased, checkCrit, rollTarget, comparison, specialRoll);
    //if this is a panic check, we may need to roll again OR add modifiers to our result total
      //roll a second die if needed
      if (!parsedRollResult.success && specialRoll === 'maintenanceCheck' && !firstEdition && !useCalm) {
        //determine the rollString
        let rollString2 = '2d10';
        //add modifiers if needed
          //0e modifier: + Stress - Resolve
          if (specialRoll === 'maintenanceCheck' && !firstEdition && !useCalm) {
            rollString2 = rollString2 + ' + ' + this.system.other.stress.value + ' - ' + this.system.other.resolve.value
          }
          //Calm modifier: + Stress - Resolve
          if (specialRoll === 'panicCheck' && useCalm) {
            rollString2 = rollString2 + ' + ' + this.system.other.resolve.value
          }
        //roll second dice
        rollResult2 = await new Roll(rollString2).evaluate();
        //roll second set of dice
      parsedRollResult2 = this.parseRollResult(rollString2, rollResult2, false, false, null, null, specialRoll);
        //set marker for HTML
        secondRoll = true;
        //set table result number
        tableResultNumber = parsedRollResult2.total
      }
    //if this is a maintenance check, we need to roll again if a failure
      //roll a second die if needed
      if (!parsedRollResult.success && specialRoll === 'maintenanceCheck' && firstEdition) {
        //determine the rollString
        let rollString2 = '1d100';
        //roll second dice
        rollResult2 = await new Roll(rollString2).evaluate();
        //roll second set of dice
      parsedRollResult2 = this.parseRollResult(rollString2, rollResult2, true, false, null, null, specialRoll);
        //set marker for HTML
        secondRoll = true;
        //set table result number
        tableResultNumber = parsedRollResult2.total;
        //log second die
        console.log(`Rolled second die`);
      }
    //set table result number if null
    if (!tableResultNumber) {
      tableResultNumber = parsedRollResult.total;
    }
    //fetch the table result
    let tableResult = tableData.getResultsForRoll(tableResultNumber).map((result) => ({
      ...result,
      description: result.description ?? result.text ?? ""
    }));
    if (!tableResult.length) {
      ui.notifications.warn(`No result was found on ${tableName} for roll ${tableResultNumber}.`);
      return null;
    }
    //make any custom changes to chat message
      //panic check #19 customiziation
      if (tableName === 'Panic Check' && tableResultNumber === 19) {
        if (this.system.class.value.toLowerCase() === 'android') {
        tableResultEdited = tableResult[0].description.replace(game.i18n.localize("Mosh.HEARTATTACKSHORTCIRCUITANDROIDS"), game.i18n.localize("Mosh.SHORTCIRCUIT"));
        } else {
        tableResultEdited = tableResult[0].description.replace(game.i18n.localize("Mosh.HEARTATTACKSHORTCIRCUITANDROIDS"), game.i18n.localize("Mosh.HEARTATTACK"));
        }
      }
    //assign message description text
    msgDesc = this.getFlavorText('table', tableName.replaceAll('& ', '').replaceAll(' ', '_').toLowerCase(), 'roll');
    //assign flavor text
      //get main flavor text
    flavorText = this.getFlavorText('table', tableName.replaceAll('& ', '').replaceAll(' ', '_').toLowerCase(), 'success');
      //append 0e crit success effect
      if (!firstEdition && !useCalm && parsedRollResult.success && parsedRollResult.critical) {
      flavorText = flavorText + game.i18n.localize("Mosh.Relieve1Stressqbq694JMbXeZrHj");
      }
      //append Calm effects for Critical Panic Success
      if (useCalm && parsedRollResult.success && parsedRollResult.critical) {
      flavorText = flavorText + game.i18n.localize("Mosh.Gain1d10Calmk2TtLFOG9mGaWVx31d10Calm");
      }
      //append Calm effects for Critical Panic Failure
      if (useCalm && !parsedRollResult.success && parsedRollResult.critical) {
        tableResultFooter = `<br><br>You lose 1d10 Calm because you critically failed.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.jHyqXb2yDFTNWxpy]{-1d10 Calm}`;
      }
      //append effects for Stress + Maintenance Check Failure
      if (specialRoll === 'maintenanceCheck' && !useCalm && !parsedRollResult.success && !parsedRollResult.critical) {
        tableResultFooter = `<br><br>Everyone on board the ship takes 1 Stress.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.dvJR9DYXI2kV0BbR]{+1 Stress}`;
      }
      //append effects for Stress + Critical Maintenance Check Failure
      if (specialRoll === 'maintenanceCheck' && !useCalm && !parsedRollResult.success && parsedRollResult.critical) {
        tableResultFooter = `<br><br>Everyone on board the ship takes 1 Stress. You must roll for another maintenance issue because you critically failed.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.dvJR9DYXI2kV0BbR]{+1 Stress}<br><br>@UUID[Compendium.mosh.macros_triggered_1e.hRapiXGVW8WZQH12]{Roll for Maintenance Issue}`;
      }
      //append effects for Calm + Maintenance Check Failure
      if (specialRoll === 'maintenanceCheck' && useCalm && !parsedRollResult.success && !parsedRollResult.critical) {
        tableResultFooter = `<br><br>Everyone on board the ship loses 1d10 Calm.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.jHyqXb2yDFTNWxpy]{-1d10 Calm}`;
      }
      //append effects for Calm + Critical Maintenance Check Failure
      if (specialRoll === 'maintenanceCheck' && useCalm && !parsedRollResult.success && parsedRollResult.critical) {
        tableResultFooter = `<br><br>Everyone on board the ship loses 1d10 Calm. You must roll for another maintenance issue because you critically failed.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.jHyqXb2yDFTNWxpy]{-1d10 Calm}<br><br>@UUID[Compendium.mosh.macros_triggered_1e.hRapiXGVW8WZQH12]{Roll for Maintenance Issue}`;
      }
      //append effects for Calm + Critical Maintenance Check Success
      if (specialRoll === 'maintenanceCheck' && useCalm && parsedRollResult.success && parsedRollResult.critical) {
        flavorText = flavorText + ` Gain 1d10 Calm.<br><br>@UUID[Compendium.mosh.macros_triggered_1e.k2TtLFOG9mGaWVx3]{+1d10 Calm}`;
      }
    //set table result type (using first value)
    if (tableResult[0].type === 0 || tableResult[0].type === 'text') {
      tableResultType = `text`;
    } else if (tableResult[0].type === 1 || tableResult[0].type === 'document') {
      tableResultType = `document`;
    } else {
      tableResultType = `unknown`;
    }
	  //generate chat message
      //prepare data
      const severityMeta = this.getSlaSeverityMeta({
        tableName,
        specialRoll,
        tableResultNumber
      });

      let messageData = {
        actor: this,
        tableResult: tableResult,
        tableResultType: tableResultType,
        tableResultEdited: tableResultEdited,
        tableResultFooter: tableResultFooter,
        parsedRollResult: parsedRollResult,
        tableName: tableName,
        tableImg: tableImg,
        msgDesc: msgDesc,
        flavorText: flavorText,
        woundText: woundText,
        secondRoll: secondRoll,
        parsedRollResult2: parsedRollResult2,
        specialRoll: specialRoll,
        severityMeta: severityMeta,
        chatStyle: this.getSlaChatVariant({
          tableName,
          msgHeader: tableName,
          isSlaEbbSkill: false,
          extra: specialRoll
        })
      };
      //prepare template
      messageTemplate = 'systems/sla-mothership/templates/chat/rollTable.html';
      //render template
      messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
      //make message
      let macroMsg = await rollResult.toMessage({
        id: chatId,
        user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
        content: messageContent
    }, {
      keepId: true
    });
    await this.addSlaActivityLog?.(`${tableName}: ${parsedRollResult.success ? "success" : "failure"} on ${rollString}${tableResultNumber !== null ? ` -> ${tableResultNumber}` : ""}.`);
    if (game.modules.get("dice-so-nice") && game.modules.get("dice-so-nice").active) {
        //log what was done
        slaDebug(`Rolled on table ID: ${tableId}, with: rollString:${rollString}, aimFor:${aimFor}, zeroBased:${zeroBased}, checkCrit:${checkCrit}, rollAgainst:${rollAgainst}, comparison:${comparison}`);
        //return messageData
        return [messageData];
        //wait for dice
        await game.dice3d.waitFor3DAnimationByMessageID(chatId);
      }
    //will come back later to do optional chat message  
      ////log what was done
      //console.log(`Rolled on table ID: ${tableId}, with: rollString:${rollString}, aimFor:${aimFor}, zeroBased:${zeroBased}, checkCrit:${checkCrit}, rollAgainst:${rollAgainst}, comparison:${comparison}`);
      ////return messageData
      //return [messageData];
  }

  //central adding addribute function | TAKES '1d10','low' | RETURNS player selected attribute. If parameters are null, it asks the player.
  async chooseAttribute(rollString, aimFor) {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //init vars
      let playerItems = this.items;
      let attribute = ``;
      let skill = ``;
      let skillValue = 0;
      let buttonDesc = ``;
      //create HTML for this window
        //header
      let dialogDesc = await foundry.applications.handlebars.renderTemplate('systems/sla-mothership/templates/dialogs/skill-check-stat-selection-dialog.html');
        //create button header if needed
        if (!rollString) {
        buttonDesc = `<div class="macro_prompt">` + game.i18n.localize("Mosh.SelectYourRollType") + `</div>`;
        } else {
          buttonDesc = ``;
        }
      //create final dialog data
      const dialogData = {
        window: {title: game.i18n.localize("Mosh.ChooseAStat")},
        classes: ["macro-popup-dialog"],
        position: {width: 600},
        content: dialogDesc + buttonDesc,
        buttons: []
      };
      //add adv/normal/dis buttons if we need a rollString
      if (!rollString) {
        //we need to generate a roll string
        dialogData.buttons = [
          {
            label: game.i18n.localize("Mosh.Advantage"),
            action: `action_advantage`,
            callback: (event, button, dialog) => {
              rollString = `1d100 [+]`;
              aimFor = `low`;
              attribute = button.form.querySelector("input[name='stat']:checked")?.getAttribute("value");
              resolve([rollString, aimFor, attribute]);
              console.log(`User left the chooseAttribute dialog with: rollString:${rollString}, aimFor:${aimFor}, attribute:${attribute}`);
            },
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: (event, button, dialog) => {
              rollString = `1d100`;
              aimFor = `low`;
              attribute = button.form.querySelector("input[name='stat']:checked")?.getAttribute("value");
              resolve([rollString, aimFor, attribute]);
              console.log(`User left the chooseAttribute dialog with: rollString:${rollString}, aimFor:${aimFor}, attribute:${attribute}`);
            },
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: (event, button, dialog) => {
              rollString = `1d100 [-]`;
              aimFor = `low`;
              attribute = button.form.querySelector("input[name='stat']:checked")?.getAttribute("value");
              resolve([rollString, aimFor, attribute]);
              console.log(`User left the chooseAttribute dialog with: rollString:${rollString}, aimFor:${aimFor}, attribute:${attribute}`);
            },
            icon: `fas fa-angle-double-down`
          }
        ]
      //add a next button if we dont need a rollString
      } else {
        dialogData.buttons = [
          {
            label: game.i18n.localize("Mosh.Next"),
			      action: `action_next`,
            callback: (event, button, dialog) => {
              aimFor = `low`;
              attribute = button.form.querySelector("input[name='stat']:checked")?.getAttribute("value");
              resolve([rollString, aimFor, attribute]);
              console.log(`User left the chooseAttribute dialog with: rollString:${rollString}, aimFor:${aimFor}, attribute:${attribute}`);
            },
            icon: `fas fa-chevron-circle-right`
          }
        ]
      }
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    });
  }

  normalizeSkillReference(value = "") {
    return normalizeSlaSkillKey(value);
  }

  expandSkillReferenceAliases(value = "") {
    const normalized = this.normalizeSkillReference(value);
    if (!normalized) return [];
    return SLA_SKILL_REFERENCE_ALIASES[normalized] ?? [normalized];
  }

  getRelevantSkillCategories(attribute = "") {
    const map = {
      strength: ["combat", "physical"],
      speed: ["physical", "perception", "technical"],
      intellect: ["technical", "mental", "perception", "knowledge"],
      combat: ["combat", "physical"],
      sanity: ["mental", "communication"],
      fear: ["mental", "communication", "perception"],
      body: ["physical", "medical", "technical"]
    };
    return map[String(attribute ?? "").toLowerCase()] ?? [];
  }

  requiresCombatSkillContext(context = {}) {
    if (context.weapon) return true;
    if (context.attackContext?.combatOnly) return true;
    return String(context.attribute ?? "").trim().toLowerCase() === "combat";
  }

  isSkillRelevantForContext(skill, context = {}) {
    const inferredMetadata = getSlaSkillMetadataForName(
      skill?.name ?? "",
      skill?.system?.sla?.category ?? this.getSkillBreakdown(skill).category ?? ""
    ) ?? {};
    const category = String(skill?.system?.sla?.category ?? inferredMetadata.category ?? this.getSkillBreakdown(skill).category ?? "").trim().toLowerCase();
    const skillName = this.normalizeSkillReference(skill?.name ?? "");
    const isCombatSkill = Boolean(skill?.system?.sla?.combat ?? inferredMetadata.combat);
    const attributeTags = Array.isArray(skill?.system?.sla?.attributes) && skill.system.sla.attributes.length
      ? skill.system.sla.attributes.map((entry) => String(entry ?? "").trim().toLowerCase())
      : Array.isArray(inferredMetadata.attributes)
        ? inferredMetadata.attributes.map((entry) => String(entry ?? "").trim().toLowerCase())
        : [];
    const requiresCombatSkills = this.requiresCombatSkillContext(context);

    if (context.weapon) {
      const refs = [
        context.weapon?.system?.sla?.skillRef,
        context.weapon?.system?.sla?.skillRefAlt
      ]
        .flatMap((entry) => this.expandSkillReferenceAliases(entry))
        .filter(Boolean);
      if (refs.length) {
        return refs.includes(skillName);
      }
      return isCombatSkill;
    }

    if (requiresCombatSkills) {
      return isCombatSkill;
    }

    const requestedAttribute = String(context.attribute ?? "").trim().toLowerCase();
    if (requestedAttribute && attributeTags.length) {
      return attributeTags.includes(requestedAttribute);
    }

    const relevantCategories = this.getRelevantSkillCategories(context.attribute);
    if (!relevantCategories.length) return true;
    return relevantCategories.includes(category);
  }

  //central adding skill function | TAKES '1d10','low' | RETURNS player selected skill + value. If parameters are null, it asks the player.
  async chooseSkill(dlgTitle, rollString, context = {}) {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //init vars
      let playerItems = this.items;
      let skill = ``;
      let skillValue = 0;
      let buttonDesc = ``;
      //create HTML for this window
        //header
        const attackSummary = [];
        const statKey = String(context.attribute ?? "").trim();
        const statLabel = statKey ? (this.system?.stats?.[statKey]?.label ?? statKey) : "";
        const statValue = statKey ? Number(this.system?.stats?.[statKey]?.value ?? 0) + Number(this.system?.stats?.[statKey]?.mod ?? 0) : null;
        const requiresCombatSkills = this.requiresCombatSkillContext(context);
        if (context.weapon?.system?.useAmmo) {
          const ammoContext = this.getWeaponAmmoContext(context.weapon, context.attackContext?.ammoTag);
          const fireMode = context.attackContext?.fireMode ?? this.getActiveWeaponFireMode(context.weapon)?.label ?? "Single";
          const shotsPerFire = Math.max(1, Number(context.attackContext?.shotsPerFire ?? this.getActiveWeaponFireMode(context.weapon)?.shots ?? 1) || 1);
          attackSummary.push(`Weapon: ${context.weapon.name} | Fire mode: ${fireMode} | Rounds: ${shotsPerFire}`);
          attackSummary.push(`Ammo: ${ammoContext.label} | Cost: ${ammoContext.costPerRound} cR/round | ${ammoContext.summary}`);
        }
        if (requiresCombatSkills) {
          attackSummary.push(`Combat filter active: combat-tagged skills only.`);
        }
        let skillHeader = await foundry.applications.handlebars.renderTemplate(
          'systems/sla-mothership/templates/dialogs/choose-skill-dialog-header.html',
          {
            statSummary: statLabel ? `Stat: ${statLabel}${Number.isFinite(statValue) ? ` ${statValue}` : ""}` : "",
            attackSummary
          }
        );
        //skill template
        let skillRow = `
        <label for="[RADIO_ID]">
        <div class ="macro_window" style="vertical-align: middle; padding-left: 3px;">
          <div class="grid grid-4col" style="align-items: center; grid-template-columns: 20px 60px 60px auto">
            <input type="radio" id="[RADIO_ID]" name="skill" value="[RADIO_VALUE]">
            <div class="macro_img" style="padding-top: 5px; padding-left: 0px; padding-right: 0px; padding-bottom: 5px;"><img src="[RADIO_IMG]" style="border:none"/></div>
            <div class="macro_desc" style="display: table;">
              <span style="display: table-cell; vertical-align: middle; color: #888; font-weight:500; font-size: 14pt">
                +[RADIO_BONUS]
              </span>
            </div> 
            <div class="macro_desc" style="display: table;">
              <span style="display: table-cell; vertical-align: middle;">
                <p><strong>[RADIO_NAME]</strong> [RADIO_FLAGS][RADIO_DESC]
              </span>
            </div>    
          </div>
        </div>
        </label>`;
        //make list of skill using template
          //create skillList string
          let skillList = ``;
          //create skill counter
          let skillCount = 0;
          //create dialog pixel counter
          let dialogHeight = 232;
          //loop through and create skill rows
          const filteredSkills = playerItems.filter((item) => item.type === "skill" && this.isSkillRelevantForContext(item, context));
          const skillSource = filteredSkills.length
            ? filteredSkills
            : (requiresCombatSkills ? [] : playerItems.filter((item) => item.type === "skill"));
          for (let item of skillSource) {
            //check if this is a skill
            const breakdown = this.getSkillBreakdown(item);
            //set temprow as template
            let tempRow = skillRow;
            //replace ID
            tempRow = tempRow.replaceAll("[RADIO_ID]", item.name);
            //replace value
            tempRow = tempRow.replace("[RADIO_VALUE]", item.system.bonus);
            //replace img
            tempRow = tempRow.replace("[RADIO_IMG]", item.img);
            //replace name
            tempRow = tempRow.replace("[RADIO_BONUS]", breakdown.total);
            //replace name
            tempRow = tempRow.replace("[RADIO_NAME]", item.name);
            tempRow = tempRow.replace("[RADIO_FLAGS]", item.system?.sla?.combat ? `<span style="display:inline-flex; align-items:center; margin-left:6px; padding:2px 6px; border-radius:999px; background:rgba(141,31,24,0.1); color:#8d1f18; font-size:0.7rem; text-transform:uppercase;">Combat</span>` : ``);
            //replace desc
            tempRow = tempRow.replace("[RADIO_DESC]", `<strong>:</strong> ${breakdown.summary}`);
            //add to skillList
            skillList = skillList + tempRow;
            //increment skill count
            skillCount++;
            //increment pixel counter
            dialogHeight = dialogHeight + 77;
          }
          //check if there are no skills, and adjust prompt height accordingly
          if (skillCount === 0) {
            //set window height
            dialogHeight = 170;
            skillList = `<div class="macro_window"><div class="macro_desc" style="padding: 12px 14px;">${requiresCombatSkills ? "No combat-tagged skills are available for this action." : "No matching skills are available for this action."}</div></div>`;
          }
        //create button header if needed
        if (!rollString) {
          buttonDesc = `<div class="macro_prompt">` + game.i18n.localize("Mosh.SelectYourRollType") + `:</div>`;
        } else {
          buttonDesc = ``;
        }
      //create final dialog data
      const dialogData = {
        window: {title: dlgTitle},
        classes: ["macro-popup-dialog"],
        position: {width: 600},
        content: skillHeader + skillList + buttonDesc,
        buttons: []
      };
      //add adv/normal/dis buttons if we need a rollString
      if (!rollString) {
        //we need to generate a roll string
        dialogData.buttons = [
          {
            label: game.i18n.localize("Mosh.Advantage"),
            action: `action_advantage`,
            callback: (event, button, dialog) => {
              rollString = `1d100 [+]`;
              skill = button.form.querySelector("input[name='skill']:checked")?.getAttribute("id");
              skillValue = button.form.querySelector("input[name='skill']:checked")?.getAttribute("value");
              resolve([rollString, skill, skillValue]);
              slaDebug(`User left the chooseSkill dialog with: rollString:${rollString}, skill:${skill}, skillValue:${skillValue}`);
            },
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
            action: `action_normal`,
            callback: (event, button, dialog) => {
              rollString = `1d100`;
              skill = button.form.querySelector("input[name='skill']:checked")?.getAttribute("id");
              skillValue = button.form.querySelector("input[name='skill']:checked")?.getAttribute("value");
              resolve([rollString, skill, skillValue]);
              slaDebug(`User left the chooseSkill dialog with: rollString:${rollString}, skill:${skill}, skillValue:${skillValue}`);
            },
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
            action: `action_disadvantage`,
            callback: (event, button, dialog) => {
              rollString = `1d100 [-]`;
              skill = button.form.querySelector("input[name='skill']:checked")?.getAttribute("id");
              skillValue = button.form.querySelector("input[name='skill']:checked")?.getAttribute("value");
              resolve([rollString, skill, skillValue]);
              slaDebug(`User left the chooseSkill dialog with: rollString:${rollString}, skill:${skill}, skillValue:${skillValue}`);
            },
            icon: `fas fa-angle-double-down`
          }
        ]
      //add a next button if we dont need a rollString
      } else {
        dialogData.buttons = [
          {
            label: game.i18n.localize("Mosh.Next"),
			      action: `action_next`,
            callback: (event, button, dialog) => {
              skill = button.form.querySelector("input[name='skill']:checked")?.getAttribute("id");
              skillValue = button.form.querySelector("input[name='skill']:checked")?.getAttribute("value");
              resolve([rollString, skill, skillValue]);
              slaDebug(`User left the chooseSkill dialog with: rollString:${rollString}, skill:${skill}, skillValue:${skillValue}`);
            },
            icon: `fas fa-chevron-circle-right`
          }
        ]
      }
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    });
  }

  //central adding skill function | TAKES 'Body Save','1d10' | RETURNS player selected rollString.
  async chooseAdvantage(dlgTitle, die) {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //init vars
        let rollString = ``;
        //make diceRoll variants
        let dieAdv = die + ` [+]`;
        let dieDis = die + ` [-]`;
      //create final dialog data
      const dialogData = {
        window: {title: dlgTitle},
        classes: ["macro-popup-dialog"],
        position: {width: 600},
        content: `<div class="macro_prompt">` + game.i18n.localize("Mosh.SelectYourRollType") + `:</div>`,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Advantage"),
			      action: `action_advantage`,
            callback: (event, button, dialog) => {
              rollString = dieAdv;
              resolve([rollString]);
              slaDebug(`User left the chooseAdvantage dialog with: rollString:${rollString}`);
            },
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: (event, button, dialog) => {
              rollString = die;
              resolve([rollString]);
              slaDebug(`User left the chooseAdvantage dialog with: rollString:${rollString}`);
            },
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: (event, button, dialog) => { 
              rollString = dieDis;
              resolve([rollString]);
              slaDebug(`User left the chooseAdvantage dialog with: rollString:${rollString}`);
            },
            icon: `fas fa-angle-double-down`
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    });
  }

  getSlaCriticalFailureCategory({ weapon = null, attribute = "" } = {}) {
    if (weapon) {
      const weaponType = String(weapon?.system?.sla?.weaponType ?? "").trim().toLowerCase();
      if (weapon?.system?.useAmmo || ["firearm", "ranged", "explosive"].includes(weaponType)) {
        return "firearm";
      }
      return "melee";
    }

    const key = String(attribute ?? "").trim().toLowerCase();
    if (["strength", "speed", "intellect"].includes(key)) {
      return key;
    }
    return null;
  }

  async rollSlaCriticalFailureTable(category) {
    const table = SLA_CRITICAL_FAILURE_TABLES[category];
    if (!table?.entries?.length) return null;

    const roll = await new Roll("1d10").evaluate();
    const total = Math.max(1, Math.min(10, Number(roll.total ?? 1) || 1));
    const entry = table.entries[total - 1] ?? table.entries[0];

    return {
      category,
      label: table.label,
      roll: total,
      entry
    };
  }

  getSlaCriticalSuccessOptions({ weapon = null, attribute = "" } = {}) {
    const category = this.getSlaCriticalFailureCategory({ weapon, attribute });
    return SLA_CRITICAL_SUCCESS_OPTIONS[category] ?? [];
  }

  async applySlaAmmoSpend(weapon, ammoUsage) {
    const spent = Math.max(0, Number(ammoUsage?.totalCost ?? 0) || 0);
    if (!spent) return null;

    const currentCredits = Number(this.system?.credits?.value ?? 0) || 0;
    const newCredits = Math.round((currentCredits - spent) * 100) / 100;
    const currentTotal = Math.max(0, Number(this.system?.sla?.ammoSpendTotal?.value ?? 0) || 0);
    const spendTotal = Math.round((currentTotal + spent) * 100) / 100;
    const stamp = new Intl.DateTimeFormat(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date());
    const shotLabel = Number(ammoUsage?.shots ?? 0) === 1 ? "round" : "rounds";
    const ledgerEntry = `[${stamp}] ${weapon?.name ?? "Weapon"} | ${ammoUsage?.ammoLabel ?? "Ammo"} ${ammoUsage?.ammoTag ?? "STD"} | ${ammoUsage?.shots ?? 0} ${shotLabel} | ${ammoUsage?.label ?? "Single"} | -${spent} cR | balance ${newCredits} cR`;
    const currentLedger = String(this.system?.sla?.ammoLedger?.value ?? "").trim();
    const ledgerLines = [ledgerEntry, ...currentLedger.split("\n").filter(Boolean)].slice(0, 60);

    await this.update({
      "system.credits.value": newCredits,
      "system.sla.ammoSpendTotal.value": spendTotal,
      "system.sla.ammoLedger.value": ledgerLines.join("\n")
    });

    return {
      spent,
      newCredits,
      spendTotal,
      ledgerEntry
    };
  }

  getSlaPrimaryTargetContext() {
    const targets = [...(game.user?.targets ?? [])].filter((token) => token?.actor);
    if (!targets.length) return null;

    return {
      token: targets[0],
      actor: targets[0].actor,
      additionalTargets: Math.max(0, targets.length - 1)
    };
  }

  getSlaTargetArmourContext(targetActor, weapon = null, ammoContext = null) {
    const baseDR = Math.max(0, Number(targetActor?.system?.stats?.armor?.damageReduction ?? 0) || 0);
    const ammoTag = this.normalizeAmmoTag(ammoContext?.ammoTag ?? weapon?.system?.ammoLoadedType ?? weapon?.system?.ammoTag ?? "STD");
    const armourPiercing = Boolean(weapon?.system?.antiArmor || ["AP", "HEAP"].includes(ammoTag));
    const effectiveDR = armourPiercing ? Math.floor(baseDR / 2) : baseDR;

    return {
      baseDR,
      effectiveDR,
      armourPiercing,
      note: armourPiercing ? `Armour reduced from ${baseDR} to ${effectiveDR}.` : `Armour reduced ${baseDR} damage.`
    };
  }

  buildSlaDamageFormula(parsedDamageString, weapon, { isCritical = false } = {}) {
    let rawFormula = String(parsedDamageString ?? "").trim();
    if (rawFormula === "Str/10") {
      rawFormula = `floor((${this.system.stats.strength.value} + ${(Number(this.system.stats.strength.mod) || 0)}) / 10)`;
    }
    const critDamageMode = game.settings.get('sla-mothership', 'critDamage');

    if (isCritical) {
      if (critDamageMode === 'advantage') {
        rawFormula = `{${parsedDamageString},${parsedDamageString}}kh`;
      } else if (critDamageMode === 'doubleDamage') {
        rawFormula = `(${parsedDamageString}) * 2`;
      } else if (critDamageMode === 'doubleDice') {
        rawFormula = `${parsedDamageString} + ${parsedDamageString}`;
      } else if (critDamageMode === 'maxDamage') {
        rawFormula = parsedDamageString.replaceAll('d', ' * ');
      } else if (critDamageMode === 'weaponValue') {
        rawFormula = `${parsedDamageString} + ${weapon?.system?.critDmg || 0}`;
      }
    }

    return rawFormula;
  }

  async applySlaTargetedDamage({ weapon, parsedDamageString, targetContext, ammoContext = null, isCritical = false } = {}) {
    if (!weapon || !parsedDamageString || !targetContext?.actor) return null;

    const damageFormula = this.buildSlaDamageFormula(parsedDamageString, weapon, { isCritical });
    const damageRoll = await new Roll(damageFormula).evaluate();
    const rawDamage = Math.max(0, Number(damageRoll.total ?? 0) || 0);
    const armour = this.getSlaTargetArmourContext(targetContext.actor, weapon, ammoContext);
    const finalDamage = Math.max(0, rawDamage - armour.effectiveDR);

    let updateText = "";
    let warning = "";
    if (finalDamage > 0) {
      try {
        const targetUpdate = await targetContext.actor.modifyActor('system.health.value', -finalDamage, null, false);
        updateText = targetUpdate?.[1] ?? "";
      } catch (err) {
        console.warn("sla-mothership | Failed to apply targeted damage", err);
        warning = `Could not automatically apply damage to ${targetContext.actor.name}. Check permissions and apply ${finalDamage} manually.`;
      }
    }

    return {
      targetName: targetContext.actor.name,
      additionalTargets: targetContext.additionalTargets ?? 0,
      damageFormula,
      rawDamage,
      armourReduced: armour.effectiveDR,
      baseArmour: armour.baseDR,
      armourPiercing: armour.armourPiercing,
      armourNote: armour.note,
      finalDamage,
      updateText,
      warning
    };
  }

  async applySlaAbilityTargetedDamage({ ability, targetContext, isCriticalSuccess = false } = {}) {
    if (!ability?.system?.roll) return null;

    const damageFormula = String(ability.system.roll).trim();
    const damageRoll = await new Roll(damageFormula).evaluate();
    const rollHtml = await this.renderSlaAbilityRollHtml(damageRoll);
    await this.postSlaAbilityRollMessage({ ability, roll: damageRoll, effectType: "damage" });
    const rolledDamage = Math.max(0, Number(damageRoll.total ?? 0) || 0);
    const rawDamage = isCriticalSuccess ? rolledDamage * 2 : rolledDamage;
    const baseDR = Math.max(0, Number(targetContext?.actor?.system?.stats?.armor?.damageReduction ?? 0) || 0);
    const ignoreArmour = Math.max(0, Number(ability.system?.sla?.ignoreArmour ?? 0) || 0);
    const effectiveDR = Math.max(0, baseDR - ignoreArmour);
    const finalDamage = Math.max(0, rawDamage - effectiveDR);

    let updateText = "";
    let warning = "";
    if (targetContext?.actor && finalDamage > 0) {
      try {
        const targetUpdate = await targetContext.actor.modifyActor("system.health.value", -finalDamage, null, false);
        updateText = targetUpdate?.[1] ?? "";
      } catch (err) {
        console.warn("sla-mothership | Failed to apply targeted Ebb damage", err);
        warning = `Could not automatically apply damage to ${targetContext.actor.name}. Check permissions and apply ${finalDamage} manually.`;
      }
    } else if (!targetContext?.actor) {
      warning = "No target selected. Damage was rolled but not applied automatically.";
    }

    return {
      targetName: targetContext?.actor?.name ?? "No target",
      formula: damageFormula,
      rollHtml,
      rollTotal: rolledDamage,
      criticalBoosted: isCriticalSuccess,
      rawDamage,
      baseDR,
      ignoreArmour,
      effectiveDR,
      finalDamage,
      updateText,
      warning
    };
  }

  async applySlaAbilityTargetedHealing({ ability, targetContext, isCriticalSuccess = false } = {}) {
    if (!ability?.system?.roll) return null;

    const healingFormula = String(ability.system.roll).trim();
    const healingRoll = await new Roll(healingFormula).evaluate();
    const rollHtml = await this.renderSlaAbilityRollHtml(healingRoll);
    await this.postSlaAbilityRollMessage({ ability, roll: healingRoll, effectType: "healing" });
    const rolledHealing = Math.max(0, Number(healingRoll.total ?? 0) || 0);
    const totalHealing = isCriticalSuccess ? rolledHealing * 2 : rolledHealing;
    const targetActor = targetContext?.actor ?? null;

    let updateText = "";
    let warning = "";
    if (targetActor && totalHealing > 0) {
      try {
        const targetUpdate = await targetActor.modifyActor("system.health.value", totalHealing, null, false);
        updateText = targetUpdate?.[1] ?? "";
      } catch (err) {
        console.warn("sla-mothership | Failed to apply targeted Ebb healing", err);
        warning = `Could not automatically heal ${targetActor.name}. Check permissions and apply ${totalHealing} manually.`;
      }
    } else if (!targetActor) {
      warning = "No target selected. Healing was rolled but not applied automatically.";
    }

    return {
      targetName: targetActor?.name ?? "No target",
      formula: healingFormula,
      rollHtml,
      rollTotal: rolledHealing,
      criticalBoosted: isCriticalSuccess,
      totalHealing,
      updateText,
      warning
    };
  }

  async createSlaAbilityEffectChat({
    ability,
    title,
    summary,
    details = [],
    tone = "neutral",
    rollHtml = ""
  } = {}) {
    const detailHtml = details.filter(Boolean).map((line) => `<div class="body">${line}</div>`).join("");
    const fluxCost = Math.max(0, Number(ability?.system?.sla?.fluxCost ?? 0) || 0);
    const tierLabel = String(ability?.system?.sla?.tier ?? "").trim();
    const content = `
      <div class="mosh sla-ebb-chat">
        <div class="rollcontainer">
          <div class="flexrow" style="margin-bottom: 5px;">
            <div class="rollweaponh1">${title}</div>
            <div style="text-align: right"><img class="roll-image" src="${ability?.img ?? ""}" /></div>
          </div>
          <div class="sla-chat-section sla-chat-section-ebb-meta">
            <div class="sla-chat-section-title">Ebb Spend</div>
            ${tierLabel ? `<div class="body"><strong>Tier:</strong> ${tierLabel}</div>` : ""}
            <div class="body"><strong>Flux Used:</strong> ${fluxCost}</div>
          </div>
          <div class="sla-chat-section sla-chat-section-${tone}">
            <div class="body">${summary}</div>
            ${rollHtml}
            ${detailHtml}
          </div>
        </div>
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      speaker: { actor: this.id, token: this.token, alias: this.name },
      content
    });
  }

  getSlaAbilityFumbleProfile(ability) {
    const notes = Array.isArray(ability?.system?.sla?.notes)
      ? ability.system.sla.notes
      : Array.isArray(ability?.system?.notes)
        ? ability.system.notes
        : [];
    const joined = notes.join(" ").trim();
    if (!joined) return null;

    const targetMatch = joined.match(/target takes\s+(\d+d\d+)\s+damage/i);
    if (targetMatch) {
      return {
        formula: targetMatch[1].toUpperCase(),
        target: "target",
        summary: joined
      };
    }

    const selfMatch = joined.match(/take\s+(\d+d\d+)\s+.*damage/i);
    if (selfMatch) {
      return {
        formula: selfMatch[1].toUpperCase(),
        target: "self",
        summary: joined
      };
    }

    return null;
  }

  async resolveSlaAbilityFumble(ability) {
    const profile = this.getSlaAbilityFumbleProfile(ability);
    if (!profile?.formula) return null;

    const targetContext = this.getSlaPrimaryTargetContext();
    const targetActor = profile.target === "target" ? targetContext?.actor ?? null : this;
    const targetName = targetActor?.name ?? (profile.target === "target" ? "No target" : this.name);

    const traumaRoll = await new Roll(profile.formula).evaluate();
    const rollHtml = await this.renderSlaAbilityRollHtml(traumaRoll);
    const traumaTotal = Math.max(0, Number(traumaRoll.total ?? 0) || 0);

    let updateText = "";
    let warning = "";
    if (targetActor && traumaTotal > 0) {
      try {
        const updateResult = await targetActor.modifyActor("system.health.value", -traumaTotal, null, false);
        updateText = updateResult?.[1] ?? "";
      } catch (err) {
        console.warn("sla-mothership | Failed to apply Ebb fumble trauma", err);
        warning = `Could not automatically apply ${traumaTotal} trauma damage to ${targetName}.`;
      }
    } else if (profile.target === "target" && !targetActor) {
      warning = `No target selected. ${profile.formula} Ebb trauma was rolled but not applied.`;
    }

    const summary = profile.target === "target"
      ? `<strong>${targetName}</strong> takes <strong class="sla-effect-number sla-effect-damage">${traumaTotal}</strong> Ebb trauma damage.`
      : `You take <strong class="sla-effect-number sla-effect-damage">${traumaTotal}</strong> Ebb trauma damage.`;

    await this.createSlaAbilityEffectChat({
      ability,
      title: `${ability.name} Fumble`,
      summary,
      rollHtml,
      details: [
        `Rolled: <strong>${profile.formula}</strong> = <strong class="sla-effect-number sla-effect-damage">${traumaTotal}</strong>`,
        profile.summary,
        updateText,
        warning
      ],
      tone: "damage"
    });

    return { targetName, traumaTotal, warning, updateText };
  }

  async renderSlaAbilityRollHtml(roll) {
    if (!roll) return "";
    try {
      if (typeof roll.render === "function") {
        return await roll.render();
      }
    } catch (err) {
      console.warn("sla-mothership | Failed to render Ebb effect roll HTML", err);
    }
    return "";
  }

  async postSlaAbilityRollMessage({ ability, roll, effectType = "effect" } = {}) {
    if (!roll) return null;

    const tierLabel = String(ability?.system?.sla?.tier ?? "").trim();
    const fluxCost = Math.max(0, Number(ability?.system?.sla?.fluxCost ?? 0) || 0);
    const effectLabel = effectType === "healing" ? "Healing Roll" : effectType === "damage" ? "Damage Roll" : "Effect Roll";
    const toneClass = effectType === "healing" ? "sla-effect-heal" : effectType === "damage" ? "sla-effect-damage" : "";
    const flavor = `
      <div class="mosh sla-chat-card">
        <div class="sla-chat-title">${ability?.name ?? "Ebb"} ${effectLabel}</div>
        <div class="sla-chat-copy">
          ${tierLabel ? `<strong>Tier:</strong> ${tierLabel} | ` : ""}<strong>Flux Used:</strong> ${fluxCost}
        </div>
        <div class="sla-chat-copy">
          <strong>Formula:</strong> ${roll.formula} |
          <strong>Total:</strong> <span class="${toneClass}">${roll.total ?? 0}</span>
        </div>
      </div>
    `;

    return roll.toMessage({
      user: game.user.id,
      speaker: { actor: this.id, token: this.token, alias: this.name },
      flavor
    });
  }

  async resolveSlaAbilityEffect(ability, { isCriticalSuccess = false } = {}) {
    const impact = String(ability?.system?.sla?.impact ?? "").trim().toLowerCase();
    const targetContext = this.getSlaPrimaryTargetContext();

    if (impact === "heal" && ability?.system?.roll) {
      const healingResult = await this.applySlaAbilityTargetedHealing({ ability, targetContext, isCriticalSuccess });
      if (healingResult) {
        const targetSummary = targetContext?.actor
          ? `You restore <strong class="sla-effect-number sla-effect-heal">${healingResult.totalHealing}</strong> Health to <strong>${healingResult.targetName}</strong>.`
          : `You channel <strong class="sla-effect-number sla-effect-heal">${healingResult.totalHealing}</strong> points of healing.`;
        await this.createSlaAbilityEffectChat({
          ability,
          title: `${ability.name} Healing`,
          summary: targetSummary,
          rollHtml: healingResult.rollHtml,
          details: [
            `Rolled: <strong>${healingResult.formula}</strong> = <strong class="sla-effect-number sla-effect-heal">${healingResult.rollTotal}</strong>${healingResult.criticalBoosted ? `, doubled to <strong class="sla-effect-number sla-effect-heal">${healingResult.totalHealing}</strong> on critical success` : ""}`,
            healingResult.updateText,
            healingResult.warning
          ],
          tone: "heal"
        });
      }
      return healingResult;
    }

    if ((impact === "harm" || ability?.system?.sla?.attack) && ability?.system?.roll) {
      const damageResult = await this.applySlaAbilityTargetedDamage({ ability, targetContext, isCriticalSuccess });
      if (damageResult) {
        const targetSummary = targetContext?.actor
          ? `You inflict <strong class="sla-effect-number sla-effect-damage">${damageResult.finalDamage}</strong> damage on <strong>${damageResult.targetName}</strong>.`
          : `You channel <strong class="sla-effect-number sla-effect-damage">${damageResult.rawDamage}</strong> points of damage.`;
        await this.createSlaAbilityEffectChat({
          ability,
          title: `${ability.name} Effect`,
          summary: targetSummary,
          rollHtml: damageResult.rollHtml,
          details: [
            `Rolled: <strong>${damageResult.formula}</strong> = <strong class="sla-effect-number sla-effect-damage">${damageResult.rollTotal}</strong>${damageResult.criticalBoosted ? `, doubled to <strong class="sla-effect-number sla-effect-damage">${damageResult.rawDamage}</strong> on critical success` : ""}`,
            targetContext?.actor ? `Armour ${damageResult.baseDR}, Ignore ${damageResult.ignoreArmour}, Final ${damageResult.finalDamage}.` : "",
            damageResult.updateText,
            damageResult.warning
          ],
          tone: "damage"
        });
      }
      return damageResult;
    }

    if (isCriticalSuccess) {
      await this.createSlaAbilityEffectChat({
        ability,
        title: `${ability.name} Critical Success`,
        summary: `${ability.name} critically succeeds. If this effect does not produce a numeric damage or healing value, the GM should enhance the outcome.`,
        details: [
          "Critical Ebb successes double numeric damage or healing.",
          "For non-numeric effects, treat the result as enhanced at the GM's discretion."
        ],
        tone: "neutral"
      });
    }

    await this.chatDesc(ability);
    return null;
  }

  //central check rolling function | TAKES '1d10','low','combat','Geology',10,[weapon item] | RETURNS chat message showing check result
  async rollCheck(rollString, aimFor, attribute, skill, skillValue, weapon,overrideDamagaRollString=null, attackContext={}) {
    //init vars
    let specialRoll = ``;
    let checkCrit = true;
    let zeroBased = true;
    let rollTarget = null;
    let rollTargetOverride = null;
    let messageTemplate = ``;
    let messageContent = ``;
    let attributeLabel = ``;
    let parsedDamageString = rollTarget;
    let comparison = ``;
    let damageResult = null;
    let parsedDamageResult = null;
    let critFail = false;
    let ebbCriticalFearSave = false;
    let critMod = ``;
    let outcomeVerb = ``;
    let flavorText = ``;
    let comparisonText = ``;
    let needsDesc = false;
    let woundEffect = ``;
    let msgHeader = ``;
    let msgImgPath = ``;
    let chatId = foundry.utils.randomID();
    let firstEdition = game.settings.get('sla-mothership', 'firstEdition');
    let useCalm = game.settings.get('sla-mothership', 'useCalm');
    let ammoUsage = null;
    let ammoAccounting = null;
    let ammoContext = weapon ? this.getWeaponAmmoContext(weapon, attackContext?.ammoTag) : null;
    let targetingResult = null;
    let criticalFailureTable = null;
    let criticalSuccessOptions = [];
    const isSlaEbbSkill = Boolean(attackContext?.slaEbbSkill);
    //customize this roll if its a unique use-case
      //damage roll
      if (attribute === 'damage') {  
        //set special roll value for use later
        specialRoll = attribute;
        //disable criticals for this roll
        checkCrit = false;
        //set attribute
        attribute = 'combat';
        //set skill + value
        skill = 'none';
        skillValue = 0;
        //set rollstring
        if(overrideDamagaRollString){
          rollString=overrideDamagaRollString;
        }else{
          rollString = weapon.system.damage;
        }
      }
      //rest save
      if (attribute === 'restSave') {
        //1e rest save
        if (firstEdition) {
          //set special roll value for use later
          specialRoll = attribute;
          //disable criticals for this roll
          checkCrit = false;
          //lets figure out the actors worst save and update this roll accordingly
            //get current save values
            let sanitySave = Number(this.system.stats.sanity.value) + Number(this.system.stats.sanity.mod || 0);
            let fearSave = Number(this.system.stats.fear.value) + Number(this.system.stats.fear.mod || 0);
            let bodySave = Number(this.system.stats.body.value) + Number(this.system.stats.body.mod || 0);
            //get the lowest value
        let minSave = Math.min(sanitySave, fearSave, bodySave);
            //set attribute to the first one matching the lowest (since actor may have 2 with the lowest)
            if (sanitySave === minSave) {
              //set attribute
              attribute = 'sanity';
            } else if (fearSave === minSave) {
              //set attribute
              attribute = 'fear';
            } else {
              //set attribute
              attribute = 'body';
            }
        //0e Rest save
        } else {
          //set special roll value for use later
          specialRoll = attribute;
          //disable criticals for this roll
          checkCrit = false;
          //set attribute
          attribute = 'fear';
        }
      }
      //bankruptcy save
      if (attribute === 'bankruptcySave') {  
        //set special roll value for use later
        specialRoll = attribute;
        //set attribute value
        attribute = 'bankruptcy';
      }
      //morale check
      if (attribute === 'moraleCheck') {  
        //set special roll value for use later
        specialRoll = attribute;
        //disable criticals for this roll
        checkCrit = false;
        //set attribute value
        attribute = 'megadamage';
        //lets get the max megadamage value
        rollTargetOverride = Math.max.apply(null, this.system.megadamage.hits);
      }
    //bounce this request away if certain parameters are NULL
      //if attribute is blank, redirect player to choose an attribute
      if (!attribute && !specialRoll) {
        //run the choose attribute function
      let chosenAttributes = await this.chooseAttribute(rollString, aimFor);
        //set variables
        rollString = chosenAttributes[0];
        aimFor = chosenAttributes[1];
        attribute = chosenAttributes[2];
        //if null, zero them out
      }
      //if skill is blank and actor is a character, redirect player to choose a skill
      if (!skill && this.type === 'character') {
      //run the choose attribute function
      let chosenSkills = await this.chooseSkill(this.system.stats[attribute].rollLabel, rollString, { attribute, weapon, attackContext });
        //set variables
        rollString = chosenSkills[0];
        skill = chosenSkills[1];
        skillValue = chosenSkills[2];
      }
      //if rollString is STILL blank, redirect player to choose the roll
      if (!rollString) {
        //run the choose attribute function
      let chosenRollType = await this.chooseAdvantage(this.system.stats[attribute].rollLabel, '1d100');
        //set variables
        rollString = chosenRollType[0];
      }
    //if this is a weapon roll
    if (weapon) {
      //check to see if this weapon uses ammo
      if (weapon.system.useAmmo === true && specialRoll !== 'damage') {
        const activeFireMode = attackContext?.fireMode
          ? { label: attackContext.fireMode, shots: Math.max(1, Number(attackContext.shotsPerFire ?? 1) || 1) }
          : this.getActiveWeaponFireMode(weapon);
        const ammoCost = Math.max(1, Number(activeFireMode?.shots ?? weapon.system.shotsPerFire ?? 1) || 1);
        const previousLoadedTag = this.normalizeAmmoTag(weapon.system.ammoLoadedType ?? weapon.system.ammoTag ?? "STD");
        const selectedAmmoTag = this.normalizeAmmoTag(attackContext?.ammoTag ?? weapon.system.ammoLoadedType ?? weapon.system.ammoTag ?? "STD");
        weapon.system.sla ??= {};
        weapon.system.sla.currentFireMode = activeFireMode.label;
        weapon.system.shotsPerFire = ammoCost;
        weapon.system.ammoLoadedType = selectedAmmoTag;
        weapon.system.ammoTag = selectedAmmoTag;
        const selectedAmmoContext = this.getWeaponAmmoContext(weapon, selectedAmmoTag);
        if (weapon.system.curShots < ammoCost || previousLoadedTag !== selectedAmmoTag) {
          const reloadOutcome = await this.reloadWeaponData(weapon, selectedAmmoTag);
          if (!reloadOutcome) {
            let t = await this.outOfAmmo();
            return;
          }
        }
        //if the weapon has enough shots remaining to shoot
        if (weapon.system.curShots >= ammoCost) {
          //reduce shots by shotsPerFire
          weapon.system.curShots -= ammoCost;
          weapon.system.ammo = this.getWeaponReserveTotal(weapon);
          weapon.system.ammoReserve = weapon.system.ammo;
          //update players weapon
          await this.updateEmbeddedDocuments('Item', [weapon]);
          ammoUsage = {
            label: activeFireMode.label,
            shots: ammoCost,
            ammoTag: selectedAmmoTag,
            ammoLabel: selectedAmmoContext.label,
            roundCost: selectedAmmoContext.costPerRound,
            totalCost: selectedAmmoContext.costPerRound * ammoCost,
            ammoRule: selectedAmmoContext.summary,
            loaded: Number(weapon.system.curShots ?? 0),
            reserve: Number(weapon.system.ammo ?? 0)
          };
          ammoContext = selectedAmmoContext;
          ammoAccounting = await this.applySlaAmmoSpend(weapon, ammoUsage);
          if (ammoAccounting) {
            ammoUsage.remainingCredits = ammoAccounting.newCredits;
            ammoUsage.spendTotal = ammoAccounting.spendTotal;
          }
        //if the weapon doesn't have enough shots remaining to shoot
        } else {
          let t = await this.outOfAmmo();
          return;
        }
      }
    }
    //if this is a damage roll
    if (specialRoll === 'damage') {  
      //parse the roll string
      let damageRollString = weapon.system.damage
      if(overrideDamagaRollString){
        damageRollString = overrideDamagaRollString;
      }
      if (weapon && weapon.system.useAmmo) {
        damageRollString = this.applyWeaponAmmoDamageModifier(damageRollString, ammoContext);
      }
      parsedDamageString = this.parseRollString(damageRollString, 'high');
      //override message header
      msgHeader = weapon.name;
      //override  header image
      msgImgPath = weapon.img;
      let dsnTheme = 0;
      if (game.settings.get('sla-mothership', 'damageDiceTheme') != "") { //We're going to check if the theme field is blank. Otherwise, don't use this.
        //set damage dice color
        dsnTheme = game.settings.get('sla-mothership', 'damageDiceTheme');
      }
      //prepare flavortext
      if (weapon.system.damage === "Str/10" && this.type === 'character') {
        //determine the damage string
        flavorText = 'You strike your target for <strong>[[floor((' + this.system.stats.strength.value + ' + ' + (Number(this.system.stats.strength.mod) || 0) + ')/10)]] damage</strong>.';
      } else {
        flavorText = 'You inflict [[' + parsedDamageString + '[' + dsnTheme + ']' + critMod + ']] points of damage.';
      }
      const targetContext = this.getSlaPrimaryTargetContext();
      if (targetContext) {
        targetingResult = await this.applySlaTargetedDamage({
          weapon,
          parsedDamageString,
          targetContext,
          ammoContext,
          isCritical: false
        });
        if (targetingResult) {
          flavorText = `You hit <strong>${targetingResult.targetName}</strong> for <strong>${targetingResult.finalDamage}</strong> damage after armour.`;
        }
      }
      //determine if this roll needs a description area
      if (weapon.system.description || weapon.system.woundEffect) {
        needsDesc = true;
      }
      //create wound effect string
      if (weapon.system.woundEffect) {
        woundEffect = this.renderSlaWoundEffect(weapon.system.woundEffect);
      }
      //generate chat message
        //prepare data
        let messageData = {
          actor: this,
          weapon: weapon,
          msgHeader: msgHeader,
          msgImgPath: msgImgPath,
          flavorText: flavorText,
          targetingResult: targetingResult,
          needsDesc: needsDesc,
          woundEffect: woundEffect,
          specialRoll: specialRoll,
          chatStyle: this.getSlaChatVariant({
            weapon,
            msgHeader,
            isSlaEbbSkill: false,
            extra: ammoContext?.label ?? ""
          })
        };
        let chatData = {
          user: game.user.id,
          speaker: {
            actor: this.id,
            token: this.token,
            alias: this.name
          }
        };
        //create message
        const template = 'systems/sla-mothership/templates/chat/rollCheck.html';
        const content = await foundry.applications.handlebars.renderTemplate(template, messageData);
        chatData.content = content;
        await ChatMessage.create(chatData);
        await this.addSlaActivityLog?.(`${weapon.name}: damage roll resolved.${targetingResult ? ` ${targetingResult.targetName} took ${targetingResult.finalDamage} damage.` : ""}`);
      //log what was done
      console.log(`Rolled damage on:${weapon.name}`);
      //return messageData
      return [messageData];
    }
    let effectiveRollBreakdown = attackContext?.rollBreakdown ?? null;
    //make the rollTarget value
    if (!rollTargetOverride) {
      effectiveRollBreakdown = effectiveRollBreakdown ?? this.buildSlaRollBreakdown({
        attribute,
        skillName: skill,
        skillValue
      });
      rollTarget = Number(effectiveRollBreakdown?.total ?? 0) || 0;
    } else {
      rollTarget = rollTargetOverride;
    }
    rollTarget = this.clampSlaRollTarget(rollTarget, rollString);
    if (effectiveRollBreakdown && (String(rollString ?? "").includes("1d100"))) {
      effectiveRollBreakdown = {
        ...effectiveRollBreakdown,
        total: rollTarget
      };
    }
    //roll the dice
      //parse the roll string
    let parsedRollString = this.parseRollString(rollString, aimFor);
      //roll the dice
      let rollResult = await new Roll(parsedRollString).evaluate();
      //set comparison based on aimFor
      if (aimFor === 'low') {
        comparison = '<';
        comparisonText = 'less than';
      } else if (aimFor === 'low-equal') {
        comparison = '<=';
        comparisonText = 'less than or equal to';
      } else if (aimFor === 'high') {
        comparison = '>';
        comparisonText = 'greater than';
      } else if (aimFor === 'high-equal') {
        comparison = '>=';
        comparisonText = 'greater than or equal to';
      }
      //interpret the results
    let parsedRollResult = this.parseRollResult(rollString, rollResult, zeroBased, checkCrit, rollTarget, comparison, specialRoll);
    if (parsedRollResult.isCritFailure) {
      const failureCategory = this.getSlaCriticalFailureCategory({ weapon, attribute });
      if (failureCategory) {
        criticalFailureTable = await this.rollSlaCriticalFailureTable(failureCategory);
      }
    }
    if (parsedRollResult.isCritSuccess) {
      criticalSuccessOptions = this.getSlaCriticalSuccessOptions({ weapon, attribute });
    }
    //prep damage dice in case its needed
      if (weapon && parsedRollResult.success) {
      //parse the roll string
      let damageRollString = weapon.system.damage
      if(overrideDamagaRollString){
        damageRollString = overrideDamagaRollString;
      }
      if (weapon.system.useAmmo) {
        damageRollString = this.applyWeaponAmmoDamageModifier(damageRollString, ammoContext);
      }
      parsedDamageString = this.parseRollString(damageRollString, 'high');
    }
    //set chat message text
      //set roll result as greater than or less than
      if (parsedRollResult.success) {
        outcomeVerb = `rolled`;
      } else {
        outcomeVerb = `did not roll`;
      }
      //prepare flavor text for attacks
      if (weapon) {
        //override message header
        msgHeader = weapon.name;
        //override  header image
        msgImgPath = weapon.img;
        let dsnTheme = 0;
        if (game.settings.get('sla-mothership', 'damageDiceTheme') != "") { //We're going to check if the theme field is blank. Otherwise, don't use this.
          //set damage dice color
          dsnTheme = game.settings.get('sla-mothership', 'damageDiceTheme');
        }
        //prepare attribute label
        attributeLabel = this.system.stats[attribute].label;
        //set crit damage effect
        if (parsedRollResult.success === true && parsedRollResult.critical === true) {
        if (game.settings.get('sla-mothership', 'critDamage') === 'advantage') {
            parsedDamageString = '{' + parsedDamageString + ',' + parsedDamageString + '}kh';
        } else if (game.settings.get('sla-mothership', 'critDamage') === 'doubleDamage') {
            critMod = ' * 2';
        } else if (game.settings.get('sla-mothership', 'critDamage') === 'doubleDice') {
            critMod = ' + ' + parsedDamageString + '[' + dsnTheme + ']';
        } else if (game.settings.get('sla-mothership', 'critDamage') === 'maxDamage') {
          parsedDamageString = parsedDamageString.replaceAll('d', ' * ');
        } else if (game.settings.get('sla-mothership', 'critDamage') === 'weaponValue') {
            critMod = ' + ' + weapon.system.critDmg + '[' + dsnTheme + ']';
        } else if (game.settings.get('sla-mothership', 'critDamage') === 'none') {
            //do nothing
          }
        }
        //flavor text = the attack roll result
        if (parsedRollResult.success === true) {
          //if success
          const targetContext = this.getSlaPrimaryTargetContext();
          if (targetContext) {
            targetingResult = await this.applySlaTargetedDamage({
              weapon,
              parsedDamageString,
              targetContext,
              ammoContext,
              isCritical: Boolean(parsedRollResult.critical)
            });
          }
          if (weapon.system.damage === "Str/10" && this.type === 'character') {
            //determine the damage string
            flavorText = 'You strike your target for <strong>[[floor((' + this.system.stats.strength.value + ' + ' + (Number(this.system.stats.strength.mod) || 0) + ')/10)]] damage</strong>.';
          } else if (targetingResult) {
            flavorText = `You hit <strong>${targetingResult.targetName}</strong> for <strong>${targetingResult.finalDamage}</strong> damage after armour.`;
          } else {
            flavorText = 'You inflict [[' + parsedDamageString + '[' + dsnTheme + ']' + critMod + ']] points of damage.';
          }
        } else if (parsedRollResult.success === false && this.type === 'character') {
          //if first edition
          if (firstEdition) {
            //if calm not enabled
            if (!useCalm) {
              if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                //increase stress by 1 and retrieve the flavor text from the result
                let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                flavorText = addStress[1];
              }
                //if critical failure, make sure to ask for panic check
                if (parsedRollResult.critical === true) {
                //set crit fail
                critFail = true;
              }
            } else {
              if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                //increase stress by 1 and retrieve the flavor text from the result
                let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                flavorText = removeCalm[1];
              }
                //if critical failure, make sure to ask for panic check
                if (parsedRollResult.critical === true) {
                //set crit fail
                critFail = true;
              }
            }
          //if 0e
          } else {
            //if calm not enabled
            if (!useCalm) {
              //on Save failure
              if (attribute === 'sanity' || attribute === 'fear' || attribute === 'body' || attribute === 'armor') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //gain 1 stress
                  let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                  flavorText = addStress[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              }
            } else {
              //on Save failure
              if (attribute === 'sanity' || attribute === 'fear' || attribute === 'body' || attribute === 'armor') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //gain 1 stress
                  let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                  flavorText = removeCalm[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              }
            }
          }
        }
        if (ammoUsage) {
          const roundLabel = ammoUsage.shots === 1 ? 'round' : 'rounds';
          const ammoPrefix = `<strong>${ammoUsage.label}</strong> fire with <strong>${ammoUsage.ammoLabel}</strong> spent <strong>${ammoUsage.shots}</strong> ${roundLabel}. Magazine <strong>${ammoUsage.loaded}/${weapon.system.shots}</strong>. Reserve <strong>${ammoUsage.reserve}</strong>. Firing spend <strong>${ammoUsage.totalCost}</strong> cR. ${ammoUsage.ammoRule}`;
          const accountingText = ammoAccounting
            ? ` Credits now <strong>${ammoAccounting.newCredits}</strong> cR. Running firing spend <strong>${ammoAccounting.spendTotal}</strong> cR.`
            : "";
          flavorText = flavorText ? `${ammoPrefix}${accountingText}<br>${flavorText}` : `${ammoPrefix}${accountingText}`;
        }
        //determine if this roll needs a description area
        if (weapon.system.description || weapon.system.woundEffect) {
          needsDesc = true;
        }
        //create wound effect string
        if (ammoContext?.woundEffect || weapon.system.woundEffect) {
          woundEffect = this.renderSlaWoundEffect(ammoContext?.woundEffect || weapon.system.woundEffect);
        }
      //prepare flavor text for special rolls
      } else if (specialRoll) {
        //rest save
        if (specialRoll === 'restSave') {
          //override message header
          msgHeader = game.i18n.localize("Mosh.RestSave");
          //override  header image
          msgImgPath = `systems/sla-mothership/images/icons/ui/macros/rest_save.png`;
          //prepare attribute label
          attributeLabel = this.system.stats[attribute].label;
          //1e rest save
          if (firstEdition) {
            //calm outcome
            if (useCalm) {
              //prep text based on success or failure
              if (parsedRollResult.success === false && this.type === 'character') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //increase stress by 1 and retrieve the flavor text from the result
                  let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                  flavorText = removeCalm[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              } else if (parsedRollResult.success === true && this.type === 'character') {
                //calculate stress reduction
              let onesValue = Number(String(parsedRollResult.total).charAt(String(parsedRollResult.total).length - 1));
                //decrease stress by ones place of roll value and retrieve the flavor text from the result
              let removeStress = await this.modifyActor('system.other.stress.value', onesValue, null, false);
                flavorText = removeStress[1];
              }
            //no calm outcome
            } else {
              //prep text based on success or failure
              if (parsedRollResult.success === false && this.type === 'character') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //increase stress by 1 and retrieve the flavor text from the result
                  let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                  flavorText = addStress[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              } else if (parsedRollResult.success === true && this.type === 'character') {
                //calculate stress reduction
              let onesValue = -1 * Number(String(parsedRollResult.total).charAt(String(parsedRollResult.total).length - 1));
                //decrease stress by ones place of roll value and retrieve the flavor text from the result
              let removeStress = await this.modifyActor('system.other.stress.value', onesValue, null, false);
                flavorText = removeStress[1];
              }
            }
          //0e rest save
          } else {
            //calm outcome
            if (useCalm) {
              //prep text based on success or failure
              if (parsedRollResult.success === false && this.type === 'character') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //increase stress by 1 and retrieve the flavor text from the result
                  let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                  flavorText = removeCalm[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              } else if (parsedRollResult.success === true && this.type === 'character') {
                //calculate stress reduction
              let succeedBy = Math.floor((rollTarget - parsedRollResult.total) / 10);
                //double it if critical
              if (parsedRollResult.critical) {
                succeedBy = succeedBy * 2;
              }
                //decrease stress by ones place of roll value and retrieve the flavor text from the result
              let removeStress = await this.modifyActor('system.other.stress.value', succeedBy, null, false);
                flavorText = removeStress[1];
              }
            //no calm outcome
            } else {
              //prep text based on success or failure
              if (parsedRollResult.success === false && this.type === 'character') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //increase stress by 1 and retrieve the flavor text from the result
                  let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                  flavorText = addStress[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              } else if (parsedRollResult.success === true && this.type === 'character') {
                //calculate stress reduction
              let succeedBy = -1 * Math.floor((rollTarget - parsedRollResult.total) / 10);
                //double it if critical
              if (parsedRollResult.critical) {
                succeedBy = succeedBy * 2;
              }
                //decrease stress by ones place of roll value and retrieve the flavor text from the result
              let removeStress = await this.modifyActor('system.other.stress.value', succeedBy, null, false);
                flavorText = removeStress[1];
              }
            }
          }
        }
        //bankruptcy save
        if (specialRoll === 'bankruptcySave') {
          //message header
          msgHeader = game.i18n.localize("Mosh.BankrupcySave");
          //set header image
          msgImgPath = 'systems/sla-mothership/images/icons/ui/rolltables/bankruptcy_save.png';
          //prepare attribute label
          attributeLabel = game.i18n.localize("Mosh.Bankrupcy");
          //get the bankruptcy table
          let tableId = game.settings.get('sla-mothership','table1eBankruptcy');
          //get Table Data
          let tableData = await fromIdUuid(tableId,{type:"RollTable"});
          //prep text for success
          if (parsedRollResult.success && parsedRollResult.critical) {
            //flavor text
            flavorText = tableData.getResultsForRoll(0)[0].description;
          //prep text for critical success
          } else if (parsedRollResult.success && !parsedRollResult.critical) {
            //flavor text
            flavorText = tableData.getResultsForRoll(1)[0].description;
          //prep text for failure
          } else if (!parsedRollResult.success && !parsedRollResult.critical) {
            //flavor text
            flavorText = tableData.getResultsForRoll(2)[0].description;
          //prep text for critical failure
          } else if (!parsedRollResult.success && parsedRollResult.critical) {
            //flavor text
            flavorText = tableData.getResultsForRoll(3)[0].description;
          }
        }
        //morale check
        if (specialRoll === 'moraleCheck') {
          //message header
          msgHeader = game.i18n.localize("Mosh.MoraleCheck") 
          //set header image
          msgImgPath = 'systems/sla-mothership/images/icons/ui/macros/morale_check.png';
          //prepare attribute label
          attributeLabel = 'Megadamage';
          //prep text based on success or failure
          if (!parsedRollResult.success) {
            //flavor text
            flavorText = `The crew, once focused on their tasks, now exchange anxious glances as the reality of the situation set in. Struggling to maintain composure in the chaos, the crew decides to send a hail and hope for mercy.`;
          } else {
          //flavor texattributes/
            flavorText = `As the ship shudders under the impact of enemy fire, a sense of urgency fills the control room. Alarms blare, emergency lights bath the crew in a stark glow, but there is no panic. The crew, seasoned and unyielding, maintain their focus on the task at hand.`;
          }
        }
      //prepare flavor text for regular checks
      } else {
        //prepare attribute label
        attributeLabel = this.system.stats[attribute].label;
        //message header
        msgHeader = isSlaEbbSkill
          ? `${String(attackContext?.ebbSkillName ?? skill ?? this.system.stats[attribute].label).trim()} Ebb Check`
          : this.system.stats[attribute].rollLabel;
        //set header image
        msgImgPath = attackContext?.skillImg || ('systems/sla-mothership/images/icons/ui/attributes/' + attribute + '.png');
        //prep text based on success or failure
        if (parsedRollResult.success === false && this.type === 'character') {
          if (isSlaEbbSkill) {
            if (parsedRollResult.critical === true) {
              ebbCriticalFearSave = true;
              flavorText = `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb discipline").trim()} catastrophically backlashes. Make a Fear control save to keep the channel from breaking into panic.`;
            } else {
              const ebbStress = await this.modifyActor('system.other.stress.value', 1, null, false);
              flavorText = ebbStress?.[1] ?? `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb discipline").trim()} fails and the backlash adds 1 Stress.`;
            }
          }
          else
          //if first edition
          if (firstEdition) {
            //if calm not enabled
            if (!useCalm) {
              if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                //increase stress by 1 and retrieve the flavor text from the result
                let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                flavorText = addStress[1];
              }
                //if critical failure, make sure to ask for panic check
                if (parsedRollResult.critical === true) {
                //set crit fail
                critFail = true;
              }
            } else {
              if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                //increase stress by 1 and retrieve the flavor text from the result
                let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                flavorText = removeCalm[1];
              }
                //if critical failure, make sure to ask for panic check
                if (parsedRollResult.critical === true) {
                //set crit fail
                critFail = true;
              }
            }
          //if 0e
          } else {
            //if calm not enabled
            if (!useCalm) {
              //on Save failure
              if (attribute === 'sanity' || attribute === 'fear' || attribute === 'body' || attribute === 'armor') {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //gain 1 stress
                  let addStress = await this.modifyActor('system.other.stress.value', 1, null, false);
                  flavorText = addStress[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
              }
            } else {
                if (game.settings.get('sla-mothership', 'autoStress')) { //If the automatic stress option is enabled
                  //gain 1 stress
                  let removeCalm = await this.modifyActor('system.other.stress.value', null, '-1d10', false);
                  flavorText = removeCalm[1];
                }
                  //if critical failure, make sure to ask for panic check
                  if (parsedRollResult.critical === true) {
                  //set crit fail
                  critFail = true;
                }
            }
          }
          if (!flavorText && isSlaEbbSkill) {
            flavorText = `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb discipline").trim()} slips out of alignment and the channel fails to resolve cleanly.`;
          }
        } else if (parsedRollResult.success === true && this.type === 'character') {
          //flavor text = generic roll success
          if (isSlaEbbSkill && parsedRollResult.critical === true) {
            flavorText = `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb discipline").trim()} critically succeeds. Numeric damage or healing from this Ebb use is doubled. If the result is non-numeric, the GM should enhance the effect.`;
          } else {
            flavorText = isSlaEbbSkill
              ? `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb discipline").trim()} resolves cleanly through the Ebb.`
              : this.getFlavorText('attribute', attribute, 'check');
          }
        }
      }
	  //generate chat message
      //prepare data
      let messageData = {
        actor: this,
        parsedRollResult: parsedRollResult,
        skill: skill,
        skillValue: skillValue,
        weapon: weapon,
        msgHeader: msgHeader,
        msgImgPath: msgImgPath,
        outcomeVerb: outcomeVerb,
        attribute: attributeLabel,
        flavorText: flavorText,
        comparisonText: comparisonText,
        needsDesc: needsDesc,
        woundEffect: woundEffect,
        critFail: critFail,
      criticalFailureTable: criticalFailureTable,
      criticalSuccessOptions: criticalSuccessOptions,
      ammoUsage: ammoUsage,
      ammoAccounting: ammoAccounting,
      isSlaEbbSkill: isSlaEbbSkill,
      skillCategory: String(attackContext?.skillCategory ?? "").trim(),
      ebbTier: String(attackContext?.ebbTier ?? "").trim(),
      fluxCost: Math.max(0, Number(attackContext?.fluxCost ?? 0) || 0),
      rollBreakdown: effectiveRollBreakdown,
      targetingResult: targetingResult,
      firstEdition: game.settings.get('sla-mothership', 'firstEdition'),
      useCalm: game.settings.get('sla-mothership', 'useCalm'),
      androidPanic: game.settings.get('sla-mothership', 'androidPanic'),
      chatStyle: this.getSlaChatVariant({
        weapon,
        skill,
        skillCategory: String(attackContext?.skillCategory ?? "").trim(),
        msgHeader,
        isSlaEbbSkill
      })
      };
      //prepare template
      messageTemplate = 'systems/sla-mothership/templates/chat/rollCheck.html';
      //render template
      messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
      //make message
      let macroMsg = await rollResult.toMessage({
        id: chatId,
        user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
        content: messageContent
    }, {
      keepId: true
    });
      const skillLabel = String(skill ?? "").trim();
      const actionLabel = weapon
        ? weapon.name
        : (skillLabel ? `${attributeLabel} / ${skillLabel}` : attributeLabel);
      await this.addSlaActivityLog?.(`${actionLabel}: ${parsedRollResult.success ? "success" : "failure"} (${parsedRollResult.total} vs ${rollTarget}).`);
      //is DSN active?
    if (game.modules.get("dice-so-nice") && game.modules.get("dice-so-nice").active) {
        //log what was done
        console.log(`Rolled a check on: ${attribute}, with: rollString:${rollString}, aimFor:${aimFor}, skill:${skill}, skillValue:${skillValue}.`);
        try {
          await Promise.race([
            game.dice3d.waitFor3DAnimationByMessageID(chatId),
            new Promise((resolve) => setTimeout(resolve, 2000))
          ]);
        } catch (err) {
          console.warn("sla-mothership | Dice So Nice animation wait failed or timed out", err);
        }
      }
    if (ebbCriticalFearSave) {
      const fearSaveResult = await this.rollSlaSaveWithResult("fear", {
        label: `${String(attackContext?.ebbSkillName ?? skill ?? "Ebb").trim()}: Critical Failure Fear Save`,
        description: `This Ebb roll critically failed. Make a Fear control save to resist panic backlash.`
      });
      if (fearSaveResult && fearSaveResult.success === false) {
        await this.rollTable("panicCheck", null, null, null, null, null, null);
      }
    }
    return [messageData];
  }

  //central function to modify actors | TAKES 'system.other.stress.value',-1,'-1d5',true | RETURNS change details, and optional chat message
  async modifyActor(fieldAddress, modValue, modRollString, outputChatMsg) {
    //init vars
    let messageTemplate = ``;
    let messageContent = ``;
    let fieldPrefix = ``;
    let getWound = false;
    let msgHeader = ``;
    let msgImgPath = ``;
    let modifyMinimum = null;
    let modifyMaximum = null;
    let modifyCurrent = null;
    let modifyChange = 0;
    let modifyNew = null;
    let modifyDifference = null;
    let modifySurplus = null;
    let msgAction = ``;
    let msgFlavor = ``;
    let msgOutcome = ``;
    let msgChange = ``;
    let chatId = foundry.utils.randomID();
    let halfDamage = false;
    let firstEdition = game.settings.get('sla-mothership', 'firstEdition');
    let useCalm = game.settings.get('sla-mothership', 'useCalm');
    let androidPanic = game.settings.get('sla-mothership', 'androidPanic');
    const applyIncomingDamageMultiplier = () => {
      if (fieldAddress !== "system.health.value" || modifyChange >= 0) return;
      const multiplier = SLADrugSystem.getDamageTakenMultiplier(this);
      if (multiplier >= 1) return;
      modifyChange = -Math.ceil(Math.abs(modifyChange) * multiplier);
    };
    //get information about this field from the actor
      //set path for important fields
        //field value
        let fieldValue = fieldAddress.split('.');
        //fieldMin
        let fieldMin = fieldAddress.split('.');
        fieldMin.pop();
        fieldMin.push("min");
        //fieldMax
        let fieldMax = fieldAddress.split('.');
        fieldMax.pop();
        fieldMax.push("max");
        //fieldLabel
        let fieldLabel = fieldAddress.split('.');
        fieldLabel.pop();
        fieldLabel.push("label");
        //fieldId
    let fieldId = fieldValue[fieldValue.length - 2];
      //get min value for this field, if it exists
      modifyMinimum = fieldMin.reduce((a, v) => a[v], this);
      //get max value for this field, if it exists
      modifyMaximum = fieldMax.reduce((a, v) => a[v], this);
      //get current value for this field
      modifyCurrent = fieldValue.reduce((a, v) => a[v], this);
    //check to see if this is a min/max part of a main field
    if (fieldAddress.slice(-3) === `min`) {
      fieldPrefix = `Minimum `;
    } else if (fieldAddress.slice(-3) === `max`) {
      fieldPrefix = `Maximum `;
    }
    //calculate the change, whether from a value, roll (can only be one, it will check modValue first)
      //apply the modValue directly with no roll
      if (modValue) {
        //update modChange
        modifyChange = modValue;
        applyIncomingDamageMultiplier();
        //calculate impact to the actor
          //set the new value
          modifyNew = modifyCurrent + modifyChange;
          //restrict new value based on min/max
            //cap min
      if (modifyMinimum || modifyMinimum === 0) {
        if (modifyNew < modifyMinimum) {
                modifyNew = modifyMinimum;
              }
            }
            //cap max
      if (modifyMaximum || modifyMaximum === 0) {
        if (modifyNew > modifyMaximum) {
                modifyNew = modifyMaximum;
              }
            }
            //measure difference between old and new value
            modifyDifference = modifyNew - modifyCurrent;
            //measure any surplus if we exceeded min/max
            modifySurplus = modifyChange - modifyDifference;
          //if health hits zero, reset to next hp bar
          if (firstEdition && fieldId === 'health' && modifyNew === 0 && this.system.hits.value < this.system.hits.max) {
            //set marker for later
            getWound = true;
            //reset hp
        if (this.system.hits.value + 1 < this.system.hits.max) {
          modifyNew = modifyMaximum + modifySurplus;
        }
          }
        //update actor
            //prepare update JSON
            let updateData = JSON.parse(`{"` + fieldAddress + `": ` + modifyNew + `}`);
            //update field
            this.update(updateData);
        //create modification text (for chat message or return values)
          //get flavor text
          if (modifyChange > 0) {
        msgFlavor = this.getFlavorText('attribute', fieldId, 'increase');
            msgChange = 'increased';
        msgHeader = fieldPrefix + this.getFlavorText('attribute', fieldId, 'increaseHeader');
        msgImgPath = this.getFlavorText('attribute', fieldId, 'increaseImg');
          } else if (modifyChange < 0) {
        msgFlavor = this.getFlavorText('attribute', fieldId, 'decrease');
            msgChange = 'decreased';
        msgHeader = fieldPrefix + this.getFlavorText('attribute', fieldId, 'decreaseHeader');
        msgImgPath = this.getFlavorText('attribute', fieldId, 'decreaseImg');
          }
          //detect if half damage has been taken
      if (!firstEdition && (-1 * modifyChange) > (modifyMaximum / 2)) {
            halfDamage = true;
          }
          //get modification description
            //calculate change type
            if (modifySurplus < 0 && modifyDifference === 0) {
              msgAction = 'pastFloor';
            } else if (modifySurplus > 0 && modifyDifference === 0) {
              msgAction = 'pastCeiling';
            } else if (modifySurplus === 0 && modifyNew === modifyMinimum && modifyChange != 0) {
              msgAction = 'hitFloor';
            } else if (modifySurplus === 0 && modifyNew === modifyMaximum && modifyChange != 0) {
              msgAction = 'hitCeiling';
            } else if (modifyChange > 0) {
              msgAction = 'increase';
            } else if (modifyChange < 0) {
              msgAction = 'decrease';
            }
        //prepare flavor text
          //set message outcome for health reaches zero or goes past it, and you have wounds remaining
          if (getWound) {
            //can this player take a wound and not die?
            if (this.system.hits.value === this.system.hits.max) {
              //you are dead!
          msgOutcome = this.getFlavorText('attribute', 'hits', 'hitCeiling');
            } else if (this.system.hits.value + 1 === this.system.hits.max) {
              //you are wounded!
          msgOutcome = game.i18n.localize("Mosh.HealthZeroMessage") + `<br><br>` + this.getFlavorText('attribute', 'hits', 'increase');
            } else {
              //you are wounded!
          msgOutcome = game.i18n.localize("Mosh.HealthZeroMessage") + ` <strong>${modifyNew}</strong>.<br><br>` + this.getFlavorText('attribute', 'hits', 'increase');
            }
          //set message outcome for past ceiling or floor
          } else if (msgAction === 'pastFloor' || msgAction === 'pastCeiling') {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction);
          //set message outcome for stress going from < 20 to > 20
          } else if (fieldId === 'stress' && modifyCurrent < modifyMaximum && modifySurplus > 0) {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` ` + fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>. <strong>Reduce the most relevant Stat or Save by ${modifySurplus}</strong>.`;
          //set message outcome for stress going from 20 to > 20
          } else if (fieldId === 'stress' && modifyCurrent === modifyMaximum && modifySurplus > 0) {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` <strong>Reduce the most relevant Stat or Save by ${modifySurplus}</strong>.`;
          //set default message outcome
          } else if (msgAction === 'increase' || msgAction === 'decrease') {
            msgOutcome = fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>.`;
          } else {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` ` + fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>.`;
          }
        //push message if asked
        if (outputChatMsg) {
          //generate chat message
            //prepare data
            let messageData = {
              actor: this,
              msgHeader: msgHeader,
              msgImgPath: msgImgPath,
              msgFlavor: msgFlavor,
              msgOutcome: msgOutcome,
              halfDamage: halfDamage
            };
            //prepare template
            messageTemplate = 'systems/sla-mothership/templates/chat/modifyActor.html';
            //render template
            messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
            //push message
            ChatMessage.create({
              id: chatId,
              user: game.user.id,
          speaker: {
            actor: this.id,
            token: this.token,
            alias: this.name
          },
              content: messageContent
        }, {
          keepId: true
        });
        }
        //log what was done
        console.log(`Modified actor: ${this.name}, with: fieldAddress:${fieldAddress}, modValue:${modValue}, modRollString:${modRollString}, outputChatMsg:${outputChatMsg}`);      
        //return modification values
      return [msgFlavor, msgOutcome, msgChange];
      //calculate change from the modRollString
      } else {
        //roll the dice
          //parse the roll string
      let parsedRollString = this.parseRollString(modRollString, 'low');
          //roll the dice
          let rollResult = await new Roll(parsedRollString).evaluate();
          //interpret the results
      let parsedRollResult = this.parseRollResult(modRollString, rollResult, false, false, null, null, null);
        //update modChange
        modifyChange = modifyChange + parsedRollResult.total;
        applyIncomingDamageMultiplier();
        //calculate impact to the actor
          //set the new value
          modifyNew = modifyCurrent + modifyChange;
          //restrict new value based on min/max
            //cap min
      if (modifyMinimum || modifyMinimum === 0) {
        if (modifyNew < modifyMinimum) {
                modifyNew = modifyMinimum;
              }
            }
            //cap max
      if (modifyMaximum || modifyMaximum === 0) {
        if (modifyNew > modifyMaximum) {
                modifyNew = modifyMaximum;
              }
            }
            //measure difference between old and new value
            modifyDifference = modifyNew - modifyCurrent;
            //measure any surplus if we exceeded min/max
            modifySurplus = modifyChange - modifyDifference;
            //if health hits zero, reset to next hp bar
            if (firstEdition && fieldId === 'health' && modifyNew === 0 && this.system.hits.value < this.system.hits.max) {
              //set marker for later
              getWound = true;
              //reset hp
        if (this.system.hits.value + 1 < this.system.hits.max) {
          modifyNew = modifyMaximum + modifySurplus;
        }
            }
            //update actor
              //prepare update JSON
              let updateData = JSON.parse(`{"` + fieldAddress + `": ` + modifyNew + `}`);
              //update field
              this.update(updateData);
            //create modification text (for chat message or return values)
              //get flavor text
              if (modifyChange > 0) {
        msgFlavor = this.getFlavorText('attribute', fieldId, 'increase');
                msgChange = 'increased';
        msgHeader = fieldPrefix + this.getFlavorText('attribute', fieldId, 'increaseHeader');
        msgImgPath = this.getFlavorText('attribute', fieldId, 'increaseImg');
              } else if (modifyChange < 0) {
        msgFlavor = this.getFlavorText('attribute', fieldId, 'decrease');
                msgChange = 'decreased';
        msgHeader = fieldPrefix + this.getFlavorText('attribute', fieldId, 'decreaseHeader');
        msgImgPath = this.getFlavorText('attribute', fieldId, 'decreaseImg');
              }
              //detect if half damage has been taken
      if (!firstEdition && (-1 * modifyChange) > (modifyMaximum / 2)) {
                halfDamage = true;
              }
              //get modification description
                //calculate change type
                if (modifySurplus < 0 && modifyDifference === 0) {
                  msgAction = 'pastFloor';
                } else if (modifySurplus > 0 && modifyDifference === 0) {
                  msgAction = 'pastCeiling';
                } else if (modifySurplus === 0 && modifyNew === modifyMinimum && modifyChange != 0) {
                  msgAction = 'hitFloor';
                } else if (modifySurplus === 0 && modifyNew === modifyMaximum && modifyChange != 0) {
                  msgAction = 'hitCeiling';
                } else if (modifyChange > 0) {
                  msgAction = 'increase';
                } else if (modifyChange < 0) {
                  msgAction = 'decrease';
                }
                //set message outcome for health reaches zero or goes past it, and you have wounds remaining
                if (getWound) {
                  //can this player take a wound and not die?
                  if (this.system.hits.value === this.system.hits.max) {
                    //you are dead!
          msgOutcome = this.getFlavorText('attribute', 'hits', 'hitCeiling');
                  } else if (this.system.hits.value + 1 === this.system.hits.max) {
                    //you are wounded!
          msgOutcome = game.i18n.localize("Mosh.HealthZeroMessage") + `<br><br>` + this.getFlavorText('attribute', 'hits', 'increase');
                  } else {
                    //you are wounded!
          msgOutcome = game.i18n.localize("Mosh.HealthZeroMessage2") +` <strong>${modifyNew}</strong>.<br><br>` + this.getFlavorText('attribute', 'hits', 'increase');
                  }
                //set message outcome for past ceiling or floor
                } else if (msgAction === 'pastFloor' || msgAction === 'pastCeiling') {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction);
                //set message outcome for stress going from < 20 to > 20
                } else if (fieldId === 'stress' && modifyCurrent < modifyMaximum && modifySurplus > 0) {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` ` + fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>. <strong>Reduce the most relevant Stat or Save by ${modifySurplus}</strong>.`;
                //set message outcome for stress going from 20 to > 20
                } else if (fieldId === 'stress' && modifyCurrent === modifyMaximum && modifySurplus > 0) {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` <strong>Reduce the most relevant Stat or Save by ${modifySurplus}</strong>.`;
                //set default message outcome
                } else if (msgAction === 'increase' || msgAction === 'decrease') {
                  msgOutcome = fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>.`;
                } else {
        msgOutcome = this.getFlavorText('attribute', fieldId, msgAction) + ` ` + fieldPrefix + fieldLabel.reduce((a, v) => a[v], this) + ` ` + msgChange + ` from <strong>${modifyCurrent}</strong> to <strong>${modifyNew}</strong>.`;
                }
            //push message if asked
            if (outputChatMsg) {
              //generate chat message
                //prepare data
                let messageData = {
                  actor: this,
                  parsedRollResult: parsedRollResult,
                  msgHeader: msgHeader,
                  msgImgPath: msgImgPath,
                  msgFlavor: msgFlavor,
                  modRollString: modRollString,
                  msgOutcome: msgOutcome,
                  halfDamage: halfDamage
                };
                //prepare template
                messageTemplate = 'systems/sla-mothership/templates/chat/modifyActor.html';
                //render template
                messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
                //make message
                let macroMsg = await rollResult.toMessage({
                  id: chatId,
                  user: game.user.id,
          speaker: {
            actor: this.id,
            token: this.token,
            alias: this.name
          },
                  content: messageContent
        }, {
          keepId: true
        });
        if (game.modules.get("dice-so-nice") && game.modules.get("dice-so-nice").active) {
                  //log what was done
                  console.log(`Modified actor: ${this.name}, with: fieldAddress:${fieldAddress}, modValue:${modValue}, modRollString:${modRollString}, outputChatMsg:${outputChatMsg}`);     
                  //return modification values
          return [msgFlavor, msgOutcome, msgChange];
                  //wait for dice
                  await game.dice3d.waitFor3DAnimationByMessageID(chatId);
                }
            }
            //log what was done
            console.log(`Modified actor: ${this.name}, with: fieldAddress:${fieldAddress}, modValue:${modValue}, modRollString:${modRollString}, outputChatMsg:${outputChatMsg}`);     
            //return modification values
      return [msgFlavor, msgOutcome, msgChange];
      }
  }

  //central function to modify an actors items | TAKES 'olC4JytslvUrQN8g',1 | RETURNS change details, and optional chat message
  async modifyItem(itemId, addAmount) {
    //init vars
    let currentLocation = '';
    let itemLocation = '';
    let messageTemplate = ``;
    let messageContent = ``;
    let oldValue = 0;
    let newValue = 0;
    let flavorText = ``;
    let chatId = foundry.utils.randomID();
    //get item data
    let itemData = await fromIdUuid(itemId,{type:"Item"});
    //add or increase the count of the item, depending on type, if the actor has it
    if (this.items.getName(itemData.name)) {
      //if this is an item, increase the count
      if (itemData.type === 'item') {
        //get current quantity
        oldValue = this.items.getName(itemData.name).system.quantity;
        newValue = oldValue + addAmount;
        //increase severity of the condition
        this.items.getName(itemData.name).update({
          'system.quantity': newValue
        });
        //create message text
        flavorText = `Quantity has increased from <strong>` + oldValue + `</strong> to <strong>` + newValue + `</strong>.`;
      //if this is a condition, increase the severity
      } else if (itemData.type === 'condition') {
        //get current severity
        oldValue = this.items.getName(itemData.name).system.severity;
        newValue = oldValue + addAmount;
        //increase severity of the condition
        this.items.getName(itemData.name).update({
          'system.severity': newValue
        });
        //create message text
        flavorText = this.getFlavorText('item', 'condition', 'increase') + `Severity has increased from <strong>` + oldValue + `</strong> to <strong>` + newValue + `</strong>.`;
      //if this is a weapon or armor, add another one
      } else if (itemData.type === 'weapon' || itemData.type === 'armor') {
        //add item to the players inventory
        await this.createEmbeddedDocuments('Item', [itemData]);
        //create message text
        flavorText = game.i18n.localize("Mosh.YouAddAnotherOfThisToYourInventory");
      }
    } else {
      //if this is an item, add it
      if (itemData.type === 'item') {
        //give the character the item
        await this.createEmbeddedDocuments('Item', [itemData]);
        //increase severity of the condition
        this.items.getName(itemData.name).update({
          'system.quantity': addAmount
        });
        //create message text
        flavorText = `You add <strong>` + addAmount + `</strong> of these to your inventory.`;
      //if this is a condition, add it
      } else if (itemData.type === 'condition') {
        //give the character the item
        await this.createEmbeddedDocuments('Item', [itemData]);
        //increase severity of the condition
        this.items.getName(itemData.name).update({
          'system.severity': addAmount
        });
        //create message text
        flavorText = this.getFlavorText('item', 'condition', 'add') + `, with a severity of <strong>` + addAmount + `</strong>.`;
      //if this is a weapon or armor, add it
      } else if (itemData.type === 'weapon' || itemData.type === 'armor') {
        //add item to the players inventory
        await this.createEmbeddedDocuments('Item', [itemData]);
        //create message text
        flavorText = game.i18n.localize("Mosh.YouAddThisToYourInventory");
      } else if (itemData.type === 'skill' ) {
        //add item to the players inventory
        await this.createEmbeddedDocuments('Item', [itemData]);
        //create message text
        flavorText = game.i18n.localize("Mosh.YouLearnThisSkill");
      }
    }
    //generate chat message
      //get item name
      let msgHeader = itemData.name;
      //get item image
      let msgImgPath = itemData.img;
      //prepare data
      let messageData = {
        actor: this,
        item: itemData,
        msgHeader: msgHeader,
        msgImgPath: msgImgPath,
        flavorText: flavorText
      };
      //prepare template
      messageTemplate = 'systems/sla-mothership/templates/chat/modifyItem.html';
      //render template
      messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
      //make message
      ChatMessage.create({
        id: chatId,
        user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
        content: messageContent
    }, {
      keepId: true
    });
    //log what was done
    console.log(`Modified item: ${itemData.name} belonging to actor: ${this.name}, by: addAmount:${addAmount}`);
  }

  getWeaponFireModes(weapon) {
    const system = weapon?.system ?? {};
    const raw = String(system?.sla?.fireModes ?? "").trim();
    const rofText = String(system?.sla?.rofText ?? system?.rofText ?? "").toLowerCase();
    const shotsPerFire = Math.max(1, Number(system?.shotsPerFire ?? 1) || 1);
    const special = String(system?.sla?.special ?? "").toLowerCase();
    const name = String(weapon?.name ?? "");
    const modes = [];

    for (const chunk of raw.split(/[\n,]+/)) {
      const entry = chunk.trim();
      if (!entry) continue;
      const match = entry.match(/^(.+?)(?:\s*[:=|-]\s*|\s*\(\s*)(\d+)\)?$/);
      if (!match) {
        const inferredShots = this.inferWeaponModeShots(entry, shotsPerFire, rofText);
        if (!inferredShots) continue;
        modes.push({
          label: entry.replace(/\s+/g, " ").trim().replace(/\bfull auto\b/i, "Auto"),
          shots: inferredShots
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
      && (special.includes("auto") || special.includes("burst") || rofText.includes("burst") || rofText.includes("auto") || this.inferAutomaticWeaponShots(name) > 1);

    const parsedModes = modes.length && !staleSingleMode
      ? modes
      : this.deriveWeaponModeDefaults(
          Math.max(shotsPerFire, this.inferAutomaticWeaponShots(name)),
          special,
          rofText,
          name
        );

    return parsedModes.filter((mode, index, list) =>
      list.findIndex((entry) => entry.label === mode.label && entry.shots === mode.shots) === index
    );
  }

  inferAutomaticWeaponShots(name = "") {
    const text = String(name ?? "").toLowerCase();
    if (/lmg|machine gun|minigun/.test(text)) return 6;
    if (/assault rifle|fen\s*ar|smg|machine pistol|auto-shotgun|reaper/.test(text)) return 3;
    return 1;
  }

  inferWeaponModeShots(label = "", shotsPerFire = 1, rofText = "") {
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

  deriveWeaponModeDefaults(shotsPerFire = 1, special = "", rofText = "", name = "") {
    const modes = [{ label: "Single", shots: 1 }];
    const text = `${special} ${rofText}`.toLowerCase();
    const inferredShots = this.inferAutomaticWeaponShots(name);
    const effectiveShots = Math.max(shotsPerFire, inferredShots);

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

  getActiveWeaponFireMode(weapon) {
    const modes = this.getWeaponFireModes(weapon);
    const currentMode = String(weapon?.system?.sla?.currentFireMode ?? "").trim().toLowerCase();
    return modes.find((mode) => mode.label.toLowerCase() === currentMode) ?? modes[0];
  }

  normalizeAmmoTag(tag = "STD") {
    const normalized = String(tag ?? "").trim().toUpperCase();
    return SLA_AMMO_TYPES[normalized] ? normalized : "STD";
  }

  getWeaponReserveKey(tag = "STD") {
    return SLA_AMMO_RESERVE_KEYS[this.normalizeAmmoTag(tag)] ?? SLA_AMMO_RESERVE_KEYS.STD;
  }

  getWeaponAmmoCalibre(weapon) {
    return String(weapon?.system?.ammoCalibre ?? weapon?.system?.ammoType ?? "").trim();
  }

  getActorAmmoItemsForWeapon(weapon, { ammoTag = null } = {}) {
    const calibre = this.getWeaponAmmoCalibre(weapon);
    const desiredTag = ammoTag ? this.normalizeAmmoTag(ammoTag) : null;
    const allowedTags = new Set(this.getWeaponAllowedAmmoTags(weapon));
    return Array.from(this.items ?? []).filter((item) => {
      if (item.type !== "item") return false;
      if (String(item.system?.sla?.category ?? "").trim().toLowerCase() !== "ammunition") return false;
      const itemCalibre = String(item.system?.sla?.calibre ?? "").trim();
      if (calibre && itemCalibre && itemCalibre !== calibre) return false;
      const tag = this.normalizeAmmoTag(item.system?.sla?.ammoTag ?? "STD");
      if (!allowedTags.has(tag)) return false;
      if (desiredTag && tag !== desiredTag) return false;
      return true;
    });
  }

  hasInventoryAmmoForWeapon(weapon) {
    return this.getActorAmmoItemsForWeapon(weapon).length > 0;
  }

  getAmmoItemQuantity(item) {
    return Math.max(0, Number(item?.system?.quantity ?? 0) || 0);
  }

  getWeaponReserveForTag(weapon, tag = "STD") {
    if (this.hasInventoryAmmoForWeapon(weapon)) {
      return this.getActorAmmoItemsForWeapon(weapon, { ammoTag: tag })
        .reduce((total, item) => total + this.getAmmoItemQuantity(item), 0);
    }
    const key = this.getWeaponReserveKey(tag);
    const fallback = this.normalizeAmmoTag(tag) === "STD" ? weapon?.system?.ammo : 0;
    return Math.max(0, Number(weapon?.system?.[key] ?? fallback ?? 0) || 0);
  }

  setWeaponReserveForTag(weapon, tag = "STD", value = 0) {
    weapon.system[this.getWeaponReserveKey(tag)] = Math.max(0, Number(value ?? 0) || 0);
    weapon.system.ammoReserve = this.getWeaponReserveTotal(weapon);
    weapon.system.ammo = weapon.system.ammoReserve;
  }

  getWeaponReserveTotal(weapon) {
    if (this.hasInventoryAmmoForWeapon(weapon)) {
      return this.getWeaponAllowedAmmoTags(weapon)
        .reduce((total, tag) => total + this.getWeaponReserveForTag(weapon, tag), 0);
    }
    return ["STD", "AP", "HE", "HEAP"].reduce((total, tag) => total + this.getWeaponReserveForTag(weapon, tag), 0);
  }

  getWeaponAllowedAmmoTags(weapon) {
    const allowed = [];
    if (weapon?.system?.ammoAllowStd !== false) allowed.push("STD");
    if (weapon?.system?.ammoAllowAp !== false) allowed.push("AP");
    if (weapon?.system?.ammoAllowHe !== false) allowed.push("HE");
    if (weapon?.system?.ammoAllowHeap !== false) allowed.push("HEAP");
    return allowed.length ? allowed : ["STD"];
  }

  getWeaponAmmoContext(weapon, ammoTag = null) {
    const tag = this.normalizeAmmoTag(ammoTag ?? weapon?.system?.ammoLoadedType ?? weapon?.system?.ammoTag ?? "STD");
    const profile = SLA_AMMO_TYPES[tag] ?? SLA_AMMO_TYPES.STD;
    const baseCost = Math.max(0, Number(weapon?.system?.ammoBaseCost ?? 0) || 0);
    return {
      tag,
      label: profile.label,
      summary: profile.summary,
      damageBonus: profile.damageBonus,
      woundEffect: profile.woundEffect,
      costPerRound: baseCost ? Math.round(baseCost * Number(profile.multiplier ?? 1)) : 0
    };
  }

  applyWeaponAmmoDamageModifier(formula, ammoContext = null) {
    const cleanFormula = String(formula ?? "").trim();
    const bonus = String(ammoContext?.damageBonus ?? "").trim();
    if (!bonus) return cleanFormula;
    if (!cleanFormula) return bonus;
    if (bonus.startsWith("-")) return `(${cleanFormula})${bonus}`;
    return `(${cleanFormula})+${bonus}`;
  }

  async reloadWeaponData(item, ammoTag = null) {
    if (!item?.system?.useAmmo) return null;
    const selectedTag = this.normalizeAmmoTag(ammoTag ?? item.system.ammoLoadedType ?? item.system.ammoTag ?? "STD");
    const currentLoadedTag = this.normalizeAmmoTag(item.system.ammoLoadedType ?? item.system.ammoTag ?? "STD");
    const magazineSize = Math.max(0, Number(item.system.shots ?? 0) || 0);
    let currentShots = Math.max(0, Number(item.system.curShots ?? 0) || 0);
    let returnedRounds = 0;
    const availableRounds = this.getWeaponReserveForTag(item, selectedTag);

    if (selectedTag !== currentLoadedTag && currentShots > 0 && availableRounds <= 0) {
      return null;
    }

    if (selectedTag !== currentLoadedTag && currentShots > 0) {
      returnedRounds = currentShots;
      await this.addAmmoToInventory(item, currentLoadedTag, currentShots);
      currentShots = 0;
    }

    const capacityRemaining = Math.max(0, magazineSize - currentShots);
    const reloadAmount = Math.min(availableRounds, capacityRemaining);
    if (reloadAmount <= 0 && currentShots <= 0) {
      item.system.curShots = 0;
      item.system.ammoLoadedType = selectedTag;
      item.system.ammoTag = selectedTag;
      item.system.ammo = this.getWeaponReserveTotal(item);
      item.system.ammoReserve = item.system.ammo;
      return null;
    }

    if (reloadAmount > 0) {
      await this.consumeAmmoFromInventory(item, selectedTag, reloadAmount);
    }

    item.system.curShots = currentShots + reloadAmount;
    item.system.ammoLoadedType = selectedTag;
    item.system.ammoTag = selectedTag;
    item.system.ammo = this.getWeaponReserveTotal(item);
    item.system.ammoReserve = item.system.ammo;
    return {
      reloadAmount,
      ammoTag: selectedTag,
      totalLoaded: item.system.curShots,
      returnedRounds,
      swapped: returnedRounds > 0 && selectedTag !== currentLoadedTag,
      reserveAfter: this.getWeaponReserveForTag(item, selectedTag)
    };
  }

  getWeaponAmmoChoices(weapon) {
    const activeTag = this.normalizeAmmoTag(weapon?.system?.ammoLoadedType ?? weapon?.system?.ammoTag ?? "STD");
    return this.getWeaponAllowedAmmoTags(weapon).map((tag) => {
      const context = this.getWeaponAmmoContext(weapon, tag);
      const reserve = this.getWeaponReserveForTag(weapon, tag);
      const calibre = this.getWeaponAmmoCalibre(weapon) || weapon?.system?.ammoType || "Unknown calibre";
      return {
        tag,
        label: `${calibre} ${context.label} | carried ${reserve} | ${context.costPerRound} cR/round`,
        reserve,
        selected: tag === activeTag,
        summary: context.summary
      };
    }).filter((choice) => choice.reserve > 0 || choice.selected);
  }

  async addAmmoToInventory(weapon, ammoTag = "STD", quantity = 0) {
    const amount = Math.max(0, Number(quantity ?? 0) || 0);
    if (!amount) return null;
    const tag = this.normalizeAmmoTag(ammoTag);
    const existing = this.getActorAmmoItemsForWeapon(weapon, { ammoTag: tag })[0];
    if (existing) {
      await this.updateEmbeddedDocuments("Item", [{
        _id: existing.id,
        "system.quantity": this.getAmmoItemQuantity(existing) + amount
      }]);
      return existing.id;
    }

    const ammoContext = this.getWeaponAmmoContext(weapon, tag);
    const calibre = this.getWeaponAmmoCalibre(weapon) || weapon?.system?.ammoType || "Unknown";
    const created = await this.createEmbeddedDocuments("Item", [{
      name: `Ammo: ${calibre} [${ammoContext.label}]`,
      type: "item",
      img: weapon?.img || "icons/commodities/metal/bullets-cartridge-shell-gray.webp",
      system: {
        quantity: amount,
        weight: 0,
        cost: ammoContext.costPerRound,
        description: `<p><strong>Calibre:</strong> ${calibre}</p><p><strong>Ammo type:</strong> ${ammoContext.label}</p><p><strong>Recovered from weapon reload.</strong></p>`,
        sla: {
          category: "Ammunition",
          calibre,
          ammoTag: tag,
          source: "Reload return"
        }
      }
    }]);
    return created?.[0]?.id ?? null;
  }

  async consumeAmmoFromInventory(weapon, ammoTag = "STD", quantity = 0) {
    let remaining = Math.max(0, Number(quantity ?? 0) || 0);
    if (!remaining) return 0;
    const updates = [];
    for (const item of this.getActorAmmoItemsForWeapon(weapon, { ammoTag })) {
      if (remaining <= 0) break;
      const available = this.getAmmoItemQuantity(item);
      if (!available) continue;
      const spent = Math.min(available, remaining);
      remaining -= spent;
      updates.push({
        _id: item.id,
        "system.quantity": available - spent
      });
    }
    if (updates.length) {
      await this.updateEmbeddedDocuments("Item", updates);
    }
    return Math.max(0, Number(quantity ?? 0) || 0) - remaining;
  }

  getSkillBreakdown(skill) {
    const total = Number(skill?.system?.bonus ?? 0) || 0;
    const description = String(skill?.system?.description ?? "");
    const categoryMatch = description.match(/Category:\s*([^<\n]+)/i);
    const baseMatch = description.match(/base:\s*(\d+)%/i);
    const baseBonus = Number(skill?.system?.sla?.baseBonus ?? baseMatch?.[1] ?? 0) || 0;
    const speciesBonus = Number(skill?.system?.sla?.speciesBonus ?? 0) || 0;
    const packageBonus = Number(skill?.system?.sla?.packageBonus ?? Math.max(0, total - baseBonus - speciesBonus)) || 0;
    const miscBonus = Math.max(0, total - baseBonus - packageBonus - speciesBonus);
    const category = String(skill?.system?.sla?.category ?? categoryMatch?.[1] ?? "").trim();
    const parts = [
      category ? `Category: ${category}` : null,
      `Base ${baseBonus}%`,
      packageBonus ? `Package +${packageBonus}` : null,
      speciesBonus ? `Species +${speciesBonus}` : null,
      miscBonus ? `Other +${miscBonus}` : null
    ].filter(Boolean);

    return {
      total,
      baseBonus,
      packageBonus,
      speciesBonus,
      miscBonus,
      category,
      summary: parts.join(" | ")
    };
  }

  getSlaConditionEffectiveSeverity(condition) {
    const severity = Math.max(0, Number(condition?.system?.severity ?? 0) || 0);
    const treatment = Math.max(0, Number(condition?.system?.treatment?.value ?? 0) || 0);
    return Math.max(0, severity - treatment);
  }

  getSlaConditionRollModifier({ attribute = "", skillName = "" } = {}) {
    const attributeKey = String(attribute ?? "").trim().toLowerCase();
    const skillKey = normalizeSlaConditionLabel(skillName);
    const parts = [];
    let total = 0;

    for (const condition of this.items.filter((item) => item.type === "condition")) {
      const effectiveSeverity = this.getSlaConditionEffectiveSeverity(condition);
      if (effectiveSeverity <= 0) continue;

      const sla = condition.system?.sla ?? {};
      const scaleWithSeverity = sla.scaleWithSeverity !== false;
      const multiplier = scaleWithSeverity ? effectiveSeverity : 1;
      let applied = 0;
      const detail = [];

      const statMods = sla.statMods ?? {};
      if (attributeKey && Number(statMods?.[attributeKey] ?? 0)) {
        const value = (Number(statMods[attributeKey]) || 0) * multiplier;
        if (value) {
          applied += value;
          detail.push(`${attributeKey} ${value >= 0 ? "+" : ""}${value}`);
        }
      }

      const skillMods = Array.isArray(sla.skillMods) ? sla.skillMods : [];
      for (const entry of skillMods) {
        const entrySkill = normalizeSlaConditionLabel(entry?.skill ?? "");
        if (!entrySkill || !skillKey || entrySkill !== skillKey) continue;
        const value = (Number(entry?.value ?? 0) || 0) * multiplier;
        if (!value) continue;
        applied += value;
        detail.push(`${entry.skill} ${value >= 0 ? "+" : ""}${value}`);
      }

      if (!applied) continue;
      total += applied;
      parts.push({
        condition: condition.name,
        severity: effectiveSeverity,
        value: applied,
        detail: detail.join(" | ")
      });
    }

    return { total, parts };
  }

  async chooseWeaponAttackOptions(weapon) {
    const fireModes = this.getWeaponFireModes(weapon);
    const activeFireMode = this.getActiveWeaponFireMode(weapon);
    const ammoChoices = this.getWeaponAmmoChoices(weapon);

    return new Promise((resolve) => {
      const fireOptions = fireModes.map((mode) => `
        <option value="${mode.label}" ${mode.label === activeFireMode.label ? "selected" : ""}>${mode.label} (${mode.shots} rounds)</option>
      `).join("");
      const ammoOptions = ammoChoices.map((choice) => `
        <option value="${choice.tag}" ${choice.selected ? "selected" : ""}>${choice.label}</option>
      `).join("");

      const dialogData = {
        window: {
          title: `${weapon.name} Attack Setup`
        },
        content: `
          <form>
            <div class="resource" style="margin-bottom: 10px;">
              <label class="resource-label">Fire Mode</label>
              <select name="fireMode">${fireOptions}</select>
            </div>
            <div class="resource" style="margin-bottom: 10px;">
              <label class="resource-label">Ammo Type</label>
              <select name="ammoTag">${ammoOptions}</select>
            </div>
          </form>
        `,
        buttons: [
          {
            label: "Fire",
            action: "fire",
            icon: "fas fa-bullseye",
            callback: (_event, button) => {
              const fireLabel = button.form.querySelector("select[name='fireMode']")?.value ?? activeFireMode.label;
              const fireMode = fireModes.find((mode) => mode.label === fireLabel) ?? activeFireMode;
              const ammoTag = button.form.querySelector("select[name='ammoTag']")?.value ?? ammoChoices[0]?.tag ?? "STD";
              resolve({
                fireMode: fireMode.label,
                shotsPerFire: fireMode.shots,
                ammoTag
              });
            }
          },
          {
            label: "Cancel",
            action: "cancel",
            icon: "fas fa-times",
            callback: () => resolve(null)
          }
        ],
        close: () => resolve(null)
      };
      new foundry.applications.api.DialogV2(dialogData).render({ force: true });
    });
  }

  async rollWeaponAttack(weapon) {
    const attackContext = weapon?.system?.useAmmo ? await this.chooseWeaponAttackOptions(weapon) : {};
    if (weapon?.system?.useAmmo && !attackContext) return;
    return this.rollCheck(null, 'low', 'combat', null, null, weapon, null, attackContext ?? {});
  }

  async cycleWeaponFireMode(itemId, direction = 1) {
    const item = foundry.utils.duplicate(this.getEmbeddedDocument('Item', itemId));
    if (!item?.system?.useAmmo) return null;

    item.system.sla ??= {};
    const modes = this.getWeaponFireModes(item);
    if (!modes.length) return null;

    const currentLabel = String(item.system.sla.currentFireMode ?? "").trim().toLowerCase();
    const currentIndex = Math.max(0, modes.findIndex((mode) => mode.label.toLowerCase() === currentLabel));
    const nextIndex = (currentIndex + direction + modes.length) % modes.length;
    const nextMode = modes[nextIndex];

    item.system.sla.fireModes ??= modes.map((mode) => `${mode.label}:${mode.shots}`).join(", ");
    item.system.sla.currentFireMode = nextMode.label;
    item.system.shotsPerFire = nextMode.shots;

    await this.updateEmbeddedDocuments('Item', [item]);
    ui.notifications.info(`${item.name}: ${nextMode.label} (${nextMode.shots} round${nextMode.shots === 1 ? '' : 's'})`);
    return nextMode;
  }

  async chooseWeaponReloadAmmo(weapon) {
    const ammoChoices = this.getWeaponAmmoChoices(weapon);
    if (!ammoChoices.length) return null;
    if (ammoChoices.length === 1) return ammoChoices[0].tag;

    return new Promise((resolve) => {
      const currentTag = this.normalizeAmmoTag(weapon?.system?.ammoLoadedType ?? weapon?.system?.ammoTag ?? "STD");
      const calibre = this.getWeaponAmmoCalibre(weapon) || weapon?.system?.ammoType || "Unknown calibre";
      const ammoOptions = ammoChoices.map((choice) => `
        <option value="${choice.tag}" ${choice.tag === currentTag ? "selected" : ""}>${choice.label}</option>
      `).join("");

      const dialogData = {
        window: {
          title: `${weapon.name} Reload`
        },
        content: `
          <form>
            <div class="resource" style="margin-bottom: 10px;">
              <label class="resource-label">Calibre</label>
              <div>${calibre}</div>
            </div>
            <div class="resource" style="margin-bottom: 10px;">
              <label class="resource-label">Current Magazine</label>
              <div>${Number(weapon?.system?.curShots ?? 0) || 0}/${Number(weapon?.system?.shots ?? 0) || 0} ${currentTag}</div>
            </div>
            <div class="resource" style="margin-bottom: 10px;">
              <label class="resource-label">Load Ammunition</label>
              <select name="ammoTag">${ammoOptions}</select>
            </div>
          </form>
        `,
        buttons: [
          {
            label: "Reload",
            action: "reload",
            icon: "fas fa-sync",
            callback: (_event, button) => {
              const ammoTag = button.form.querySelector("select[name='ammoTag']")?.value ?? currentTag;
              resolve(ammoTag);
            }
          },
          {
            label: "Cancel",
            action: "cancel",
            icon: "fas fa-times",
            callback: () => resolve(null)
          }
        ],
        close: () => resolve(null)
      };
      new foundry.applications.api.DialogV2(dialogData).render({ force: true });
    });
  }

  async promptWeaponReload(itemId) {
    const weapon = foundry.utils.duplicate(this.getEmbeddedDocument("Item", itemId));
    if (!weapon?.system?.useAmmo) return null;
    const selectedAmmoTag = await this.chooseWeaponReloadAmmo(weapon);
    if (!selectedAmmoTag) return null;
    return this.reloadWeapon(itemId, selectedAmmoTag);
  }

  async reloadAllCompatibleWeapons() {
    const weapons = Array.from(this.items ?? []).filter((item) => item.type === "weapon" && item.system?.useAmmo);
    let reloaded = 0;
    let skipped = 0;

    for (const weaponDoc of weapons) {
      const weapon = foundry.utils.duplicate(weaponDoc);
      const currentTag = this.normalizeAmmoTag(weapon?.system?.ammoLoadedType ?? weapon?.system?.ammoTag ?? "STD");
      const hasCurrent = this.getWeaponReserveForTag(weapon, currentTag) > 0;
      const chosenTag = hasCurrent ? currentTag : (this.getWeaponAmmoChoices(weapon)[0]?.tag ?? null);
      if (!chosenTag) {
        skipped += 1;
        continue;
      }

      const beforeShots = Math.max(0, Number(weapon.system?.curShots ?? 0) || 0);
      await this.reloadWeapon(weaponDoc.id, chosenTag);
      const refreshed = this.getEmbeddedDocument("Item", weaponDoc.id);
      const afterShots = Math.max(0, Number(refreshed?.system?.curShots ?? 0) || 0);
      if (afterShots > beforeShots || this.normalizeAmmoTag(refreshed?.system?.ammoLoadedType ?? "STD") !== currentTag) {
        reloaded += 1;
      } else {
        skipped += 1;
      }
    }

    ui.notifications.info(`Reload all complete. ${reloaded} weapon${reloaded === 1 ? "" : "s"} updated, ${skipped} skipped.`);
    return { reloaded, skipped };
  }

  //ask the player if we want to reload
  async askReload(itemId) {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create final dialog data
      const dialogData = {
        window: {
          title: game.i18n.localize("Mosh.WeaponIssue")
        },
        classes: ["macro-popup-dialog"],
        content: `<div class="macro_prompt">` + game.i18n.localize("Mosh.OutOfAmmoNeedReload") + `</div>`,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Reload"),
			      action: `action_reload`,
            callback: () => this.promptWeaponReload(itemId),
            icon: `fas fa-check`
          },
          {
            label: `Cancel`,
			      action: `action_cancel`,
            callback: () => {},
            icon: `fas fa-times`
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    });
    //log what was done
    slaDebug(`Asked for reload.`);
  }

  //tell the player we are out of ammo
  async outOfAmmo() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create final dialog data
      const dialogData = {
        window: {
          title: game.i18n.localize("Mosh.WeaponIssue")
        },
        classes: ["macro-popup-dialog"],
        content: `<div class="macro_prompt">` + game.i18n.localize("Mosh.OutOfAmmo") + `</div>`,
        buttons: [
          {
            label: game.i18n.localize("Mosh.OK"),
			      action: `action_okay`,
            callback: () => {},
            icon: 'fas fa-check'
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    });
    //log what was done
    slaDebug(`Told user they are out of ammo.`);
  }

  //reload the players weapon
  async reloadWeapon(itemId, ammoTag = null) {
    //init vars
    let messageTemplate = ``;
    let messageContent = ``;
    let msgBody = ``;
    let chatId = foundry.utils.randomID();
    //dupe item to work with
    var item;
    item = foundry.utils.duplicate(this.getEmbeddedDocument('Item', itemId));
    //reload
    if (!item.system.useAmmo) {
      //exit function (it should not be possible to get here)
      return;
    } else {
      const currentLoadedTag = this.normalizeAmmoTag(item.system.ammoLoadedType ?? item.system.ammoTag ?? "STD");
      const selectedAmmoTag = this.normalizeAmmoTag(ammoTag ?? currentLoadedTag);
      const changingAmmo = selectedAmmoTag !== currentLoadedTag;
      //are we at full shots already?
      if (item.system.curShots === item.system.shots && !changingAmmo) {
        //log what was done
        slaDebug(`Can't reload, already at full shots.`);
        //exit function (it should not be possible to get here)
        return;
      //are we out of ammo?
      } else if (!this.getWeaponReserveForTag(item, selectedAmmoTag)) {
        //tell player we are out of ammo
        let t = await this.outOfAmmo();
        //log what was done
        slaDebug(`Can't reload, no ammo left.`);
        //exit function
        return;
      } else {
        const reloadOutcome = await this.reloadWeaponData(item, selectedAmmoTag);
        if (!reloadOutcome) {
          let t = await this.outOfAmmo();
          return;
        }
        await this.updateEmbeddedDocuments('Item', [item]);
        const calibre = this.getWeaponAmmoCalibre(item) || item.system.ammoType || "Unknown calibre";
        const swappedText = reloadOutcome.swapped
          ? ` Swapped out ${reloadOutcome.returnedRounds} round${reloadOutcome.returnedRounds === 1 ? "" : "s"} of ${currentLoadedTag}.`
          : "";
        msgBody = `${game.i18n.localize("Mosh.WeaponReloaded")} ${reloadOutcome.reloadAmount} round${reloadOutcome.reloadAmount === 1 ? "" : "s"} of ${calibre} ${selectedAmmoTag}. Magazine ${reloadOutcome.totalLoaded}/${item.system.shots}. Reserve ${reloadOutcome.reserveAfter}.${swappedText}`;
      }
    }
    //generate chat message
      //prepare data
      let messageData = {
        actor: this,
        item: item,
        msgBody: msgBody
      };
      //prepare template
      messageTemplate = 'systems/sla-mothership/templates/chat/reload.html';
      //render template
      messageContent = await foundry.applications.handlebars.renderTemplate(messageTemplate, messageData);
      //push message
      ChatMessage.create({
        id: chatId,
        user: game.user.id,
        speaker: {
          actor: this.id,
          token: this.token,
          alias: this.name
        },
        content: messageContent
    }, {
      keepId: true
    });
    //log what was done
    slaDebug(`Reloaded weapon.`);
  }

  //make the player take bleeding damage
  async takeBleedingDamage() {
    //init vars
    let chatId = foundry.utils.randomID();
    //determine bleeding amount
    let healthLost = this.items.getName("Bleeding").system.severity * -1;
    //run the function for the player's 'Selected Character'
    let modification = await this.modifyActor('system.health.value', healthLost, null, false);
    //get flavor text
    let msgFlavor = this.getFlavorText('item', 'condition', 'bleed');
    let msgOutcome = modification[1];
    let healthLostText = game.i18n.localize("Mosh.attribute.health.decreaseHeader.human")
    //create chat message text
    let messageContent = `
    <div class="mosh">
      <div class="rollcontainer">
          <div class="flexrow" style="margin-bottom: 5px;">
          <div class="rollweaponh1">${healthLostText}</div>
          <div style="text-align: right"><img class="roll-image" src="systems/foundry-mothership/images/icons/ui/attributes/health.png" /></div>
          </div>
          <div class="description"" style="margin-bottom: 20px;">
          <div class="body">
          ${msgFlavor}
          <br><br>
          ${msgOutcome}
          </div>
          </div>
      </div>
    </div>
    `;
    //push message
    ChatMessage.create({
      id: chatId,
      user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
      content: messageContent
    }, {
      keepId: true
    });
    //log what was done
    console.log(`Took bleeding damage.`);
  }

  //make the player take radiation damage
  async takeRadiationDamage() {
    //init vars
    let chatId = foundry.utils.randomID();
    //reduce all stats and saves by 1
    this.modifyActor('system.stats.strength.value', -1, null, false);
    this.modifyActor('system.stats.speed.value', -1, null, false);
    this.modifyActor('system.stats.intellect.value', -1, null, false);
    this.modifyActor('system.stats.combat.value', -1, null, false);
    this.modifyActor('system.stats.sanity.value', -1, null, false);
    this.modifyActor('system.stats.fear.value', -1, null, false);
    this.modifyActor('system.stats.body.value', -1, null, false);
    //get flavor text
    let msgFlavor = this.getFlavorText('item', 'condition', 'radiation');
    let msgOutcome = game.i18n.localize('Mosh.AllStatsAndSavesDecreasedBy');
    msgOutcome += ` <strong>1</strong>.`;
    let radiationDamage = game.i18n.localize('Mosh.RadiationDamage');

    //create chat message text
    let messageContent = `
    <div class="mosh">
      <div class="rollcontainer">
          <div class="flexrow" style="margin-bottom: 5px;">
          <div class="rollweaponh1">${radiationDamage}</div>
          <div style="text-align: right"><img class="roll-image" src="icon_file_attribute_health.png" /></div>
          </div>
          <div class="description"" style="margin-bottom: 20px;">
          <div class="body">
          ${msgFlavor}
          <br><br>
          ${msgOutcome}
          </div>
          </div>
      </div>
    </div>
    `;
    //push message
    ChatMessage.create({
      id: chatId,
      user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
      content: messageContent
    }, {
      keepId: true
    });
    //log what was done
    console.log(`Took radiation damage.`);
  }

  //make the player take radiation damage
  async takeCryoDamage(rollString) {
    //init vars
    let chatId = foundry.utils.randomID();
    //roll the dice
      //parse the roll string
    let parsedRollString = this.parseRollString(rollString, 'low');
      //roll the dice
      let rollResult = await new Roll(parsedRollString).evaluate();
      //interpret the results
    let parsedRollResult = this.parseRollResult(rollString, rollResult, false, false, null, null, null);
    //reduce all stats and saves by roll result
    this.modifyActor('system.stats.strength.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.speed.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.intellect.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.combat.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.sanity.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.fear.value', parsedRollResult.total, null, false);
    this.modifyActor('system.stats.body.value', parsedRollResult.total, null, false);
    //get flavor text
    let msgFlavor = this.getFlavorText('item', 'condition', 'cryo');
    let msgOutcome = game.i18n.localize('Mosh.AllStatsAndSavesDecreasedBy');
    msgOutcome += ` <strong>` + Math.abs(parsedRollResult.total).toString() + `</strong>.`;
    let cryoDamage = game.i18n.localize("Mosh.CryofreezeDamage")
    //create chat message text
    let messageContent = `
    <div class="mosh">
      <div class="rollcontainer">
          <div class="flexrow" style="margin-bottom: 5px;">
          <div class="rollweaponh1">${cryoDamage}</div>
          <div style="text-align: right"><img class="roll-image" src="systems/sla-mothership/images/icons/ui/attributes/health.png" /></div>
          </div>
          <div class="description"" style="margin-bottom: 20px;">
          <div class="body">
          ${msgFlavor}
          <br><br>
          ${msgOutcome}
          </div>
          </div>
      </div>
    </div>
    `;
    //push message
    ChatMessage.create({
      id: chatId,
      user: game.user.id,
      speaker: {
        actor: this.id,
        token: this.token,
        alias: this.name
      },
      content: messageContent
    }, {
      keepId: true
    });
    //log what was done
    console.log(`Took cryofreeze damage.`);
  }

  //ask the player to choose cover
  async chooseCover() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //init vars
      let none_checked = ``;
      let insignificant_checked = ``;
      let light_checked = ``;
      let heavy_checked = ``;
      //fetch character AP/DR/cover
      let curAP = this.system.stats.armor.mod;
      let curDR = this.system.stats.armor.damageReduction;
      let curCover = this.system.stats.armor.cover;
      //set checkbox to current cover + adjust curAP/DR
      if (curCover === 'none') {
        none_checked = `checked`;
      }
      if (curCover === 'insignificant') {
        insignificant_checked = `checked`;
      }
      if (curCover === 'light') {
        light_checked = `checked`;
      }
      if (curCover === 'heavy') {
        heavy_checked = `checked`;
      }  

      //create pop-up HTML
      let msgContent = await foundry.applications.handlebars.renderTemplate('systems/sla-mothership/templates/dialogs/choose-cover-dialog.html', {
          curDR:curDR, 
          curAP:curAP, 
          none_checked: none_checked,
          insignificant_checked:insignificant_checked,
          light_checked:light_checked,
          heavy_checked:heavy_checked,
          curCover:curCover
        });
      
      //create final dialog data
      const dialogData = {
        window: {title: game.i18n.localize("Mosh.Cover")},
        classes: ["macro-popup-dialog"],
        position: {width: 600},
        content: msgContent,
        buttons: [
          {
            label: game.i18n.localize("Mosh.OK"),
			      action: `action_okay`,
            callback: (event, button, dialog) => {
              this.update({
                'system.stats.armor.cover': button.form.querySelector("input[name='cover']:checked")?.getAttribute("value")
              });
              console.log(`User's cover is now:${button.form.querySelector("input[name='cover']:checked")?.getAttribute("value")}`);
            },
            icon: 'fas fa-check'
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    
    });
    
  }

  async chooseSlaWoundTable() {
    return new Promise(async (resolve) => {
      const woundTables = [
        { key: 'table1eWoundBluntForce', label: 'Blunt Force' },
        { key: 'table1eWoundBleeding', label: 'Bleeding' },
        { key: 'table1eWoundGunshot', label: 'Gunshot' },
        { key: 'table1eWoundFireExplosives', label: 'Fire & Explosives' },
        { key: 'table1eWoundGoreMassive', label: 'Gore & Massive' }
      ];

      const dialogData = {
        window: { title: 'Choose Wound Table' },
        classes: ['macro-popup-dialog'],
        position: { width: 660, height: 260 },
        content: `<p>Select the wound table to roll for this operative.</p>`,
        buttons: woundTables.map((entry) => ({
          label: entry.label,
          action: entry.key,
          callback: async () => {
            const tableId = game.settings.get('sla-mothership', entry.key);
            if (!tableId) {
              ui.notifications.warn(`No wound table is configured for ${entry.label}.`);
              return resolve(null);
            }
            const tableData = await resolveSlaWoundTableBySetting(entry.key);
            if (!tableData) {
              ui.notifications.warn(`The ${entry.label} wound table could not be found.`);
              return resolve(null);
            }
            await this.rollTable(tableData.uuid ?? tableData.id ?? tableId, null, null, null, null, null, null);
            resolve(entry.key);
          }
        }))
      };

      dialogData.buttons.push({
        label: 'Cancel',
        action: 'cancel',
        callback: () => resolve(null)
      });

      new foundry.applications.api.DialogV2(dialogData).render({ force: true });
    });
  }

  //activate ship's distress signal
  async distressSignal() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create pop-up HTML
      let msgContent = await foundry.applications.handlebars.renderTemplate('systems/sla-mothership/templates/dialogs/distres-signal-dialog.html');
      
      //create final dialog data
      const dialogData = {
        window: {title: game.i18n.localize("Mosh.DistressSignal")},
        classes: ["macro-popup-dialog"],
        position: {width: 600,height: 265},
        content: msgContent,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Advantage"),
			      action: `action_advantage`,
            callback: () => this.rollTable(game.settings.get('sla-mothership', 'table1eDistressSignal'), `1d10 [+]`, `low`, true, false, null, null),
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: () => this.rollTable(game.settings.get('sla-mothership', 'table1eDistressSignal'), `1d10`, `low`, true, false, null, null),
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: () => this.rollTable(game.settings.get('sla-mothership', 'table1eDistressSignal'), `1d10 [-]`, `low`, true, false, null, null),
            icon: `fas fa-angle-double-down`
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    
    });
    
  }

  //activate ship's distress signal
  async maintenanceCheck() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create pop-up HTML
      let msgContent = `

      `;
      //create final dialog data
      const dialogData = {
        window: {title: game.i18n.localize("Mosh.MaintenanceCheck")},
        classes: ["macro-popup-dialog"],
        position: {width: 600,height: 265},
        content: msgContent,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Advantage"),
			      action: `action_advantage`,
            callback: () => this.rollTable(`maintenanceCheck`, `1d100 [+]`, `low`, null, null, null, null),
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: () => this.rollTable(`maintenanceCheck`, `1d100`, `low`, null, null, null, null),
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: () => this.rollTable(`maintenanceCheck`, `1d100 [-]`, `low`, null, null, null, null),
            icon: `fas fa-angle-double-down`
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    
    });
    
  }

  //activate ship's distress signal
  async bankruptcySave() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create pop-up HTML
      let msgContent = `
      
      `;
      //create final dialog data
      const dialogData = {
        window: {title: game.i18n.localize("Mosh.BankrupcySave")},
        classes: ["macro-popup-dialog"],
        position: {width: 600,height: 265},
        content: msgContent,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Advantage"),
			      action: `action_advantage`,
            callback: () => this.rollCheck(`1d100 [+]`, `low`, `bankruptcySave`, null, null, null),
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: () => this.rollCheck(`1d100`, `low`, `bankruptcySave`, null, null, null),
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: () => this.rollCheck(`1d100 [-]`, `low`, `bankruptcySave`, null, null, null),
            icon: `fas fa-angle-double-down`
          }
        ]
      };
      //render dialog
      new foundry.applications.api.DialogV2(dialogData).render({force: true});

    });
    
  }

  //activate ship's distress signal
  async moraleCheck() {
    //wrap the whole thing in a promise, so that it waits for the form to be interacted with
    return new Promise(async (resolve) => {
      //create pop-up HTML

      let moraleCheck = game.i18n.localize("Mosh.MoraleCheck")
      let moraleCheckDescription = game.i18n.localize("Mosh.MoraleCheckDescription")

      let msgContent = `
      <style>
        .macro_window{
          background: rgb(230,230,230);
          border-radius: 9px;
        }
        .macro_img{
          display: flex;
          justify-content: center;
        }
        .macro_desc{
          font-family: "Roboto", sans-serif;
          font-size: 10.5pt;
          font-weight: 400;
          padding-top: 8px;
          padding-right: 8px;
          padding-bottom: 8px;
        }
        .grid-2col {
          display: grid;
          grid-column: span 2 / span 2;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 2px;
          padding: 0;
        }
      </style>
      <div class ="macro_window" style="margin-bottom : 7px;">
        <div class="grid grid-2col" style="grid-template-columns: 150px auto">
          <div class="macro_img"><img src="icon_file_macro_momnsrale_check.png" style="border:none"/></div>
          <div class="macro_desc"><h3>${moraleCheck}</h3>${moraleCheckDescription}</div>
        </div>
      </div>
      <h4>Select your roll type:</h4>
      `;
      //create final dialog data
      const dialogData = {
        window: {title: `Morale Check`},
        classes: ["macro-popup-dialog"],
        position: {width: 600,height: 265},
        content: msgContent,
        buttons: [
          {
            label: game.i18n.localize("Mosh.Advantage"),
			      action: `action_advantage`,
            callback: () => this.rollCheck(`1d10 [+]`, `high-equal`, `moraleCheck`, null, null, null),
            icon: `fas fa-angle-double-up`
          },
          {
            label: game.i18n.localize("Mosh.Normal"),
			      action: `action_normal`,
            callback: () => this.rollCheck(`1d10`, `high-equal`, `moraleCheck`, null, null, null),
            icon: `fas fa-minus`
          },
          {
            label: game.i18n.localize("Mosh.Disadvantage"),
			      action: `action_disadvantage`,
            callback: () => this.rollCheck(`1d10 [-]`, `high-equal`, `moraleCheck`, null, null, null),
            icon: `fas fa-angle-double-down`
          }
        ]
      };
      //render dialog
      const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});

    });
    
  }

  // print description
  printDescription(itemId, options = {event: null}) {
    var item;
    item = foundry.utils.duplicate(this.getEmbeddedDocument('Item', itemId));
    this.chatDesc(item);
  }

  hasSlaSpeciesRuleEnabled(ruleKey = "") {
    return Boolean(this.system?.sla?.speciesRules?.[ruleKey]?.enabled);
  }

  getSlaTrainingPackageName() {
    return String(this.system?.sla?.trainingPackage?.value ?? this.system?.class?.value ?? "").trim();
  }

  getSlaTraumaResponseText() {
    if (this.type !== "character") return "";
    const species = String(this.system?.sla?.species?.value ?? "").trim();
    const trainingPackage = this.getSlaTrainingPackageName();
    if (!species && !trainingPackage) return "";
    return buildSlaTraumaResponseText(species, trainingPackage);
  }

  async refreshSlaTraumaResponse({ force = false } = {}) {
    if (this.type !== "character") return null;
    const nextText = this.getSlaTraumaResponseText();
    if (!nextText) return null;
    const currentText = String(this.system?.other?.stressdesc?.value ?? "");
    if (!force && currentText.trim() === nextText.trim()) {
      return nextText;
    }
    await this.update({
      "system.other.stressdesc.value": nextText
    });
    return nextText;
  }

  async refreshSlaSkillPresentation() {
    if (this.type !== "character") return 0;
    const updates = [];
    for (const item of this.items ?? []) {
      if (item.type !== "skill") continue;
      const key = String(item.name ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
      const img = SLA_SKILL_IMAGE_OVERRIDES[key];
      const rank = getSlaSkillRankLabel(item.system?.bonus ?? 0);
      const metadata = getSlaSkillMetadataForName(item.name, item.system?.sla?.category ?? "") ?? {};
      const update = { _id: item.id };
      let changed = false;
      if (img && item.img !== img) {
        update.img = img;
        changed = true;
      }
      if (String(item.system?.rank ?? "") !== rank) {
        update["system.rank"] = rank;
        changed = true;
      }
      if (metadata.category && String(item.system?.sla?.category ?? "") !== metadata.category) {
        update["system.sla.category"] = metadata.category;
        update["system.sla.skillFamily"] = metadata.category;
        changed = true;
      }
      if (typeof metadata.combat === "boolean" && Boolean(item.system?.sla?.combat) !== metadata.combat) {
        update["system.sla.combat"] = metadata.combat;
        changed = true;
      }
      if (Array.isArray(metadata.attributes)) {
        const currentAttributes = Array.isArray(item.system?.sla?.attributes) ? item.system.sla.attributes : [];
        const nextAttributes = metadata.attributes;
        if (JSON.stringify(currentAttributes) !== JSON.stringify(nextAttributes)) {
          update["system.sla.attributes"] = nextAttributes;
          changed = true;
        }
      }
      if (changed) {
        updates.push(update);
      }
    }
    if (!updates.length) return 0;
    await this.updateEmbeddedDocuments("Item", updates);
    return updates.length;
  }

  async reconcileSlaSpeciesBalance({ force = false } = {}) {
    if (this.type !== "character") return null;

    const currentSpecies = String(this.system?.sla?.species?.value ?? "").trim();
    const applied = this.flags?.["sla-mothership"]?.speciesBalance ?? {};
    const appliedSpecies = String(applied?.species ?? "").trim();
    const appliedVersion = String(applied?.version ?? "").trim();

    if (!force && appliedSpecies === currentSpecies && appliedVersion === SLA_SPECIES_BALANCE_VERSION) {
      return null;
    }

    const previousAdjustments = appliedVersion ? getSlaSpeciesStatAdjustments(appliedSpecies) : {};
    const nextAdjustments = getSlaSpeciesStatAdjustments(currentSpecies);
    const statKeys = new Set([...Object.keys(previousAdjustments), ...Object.keys(nextAdjustments)]);
    const updateData = {};

    for (const key of statKeys) {
      const currentValue = Number(this.system?.stats?.[key]?.value ?? 0) || 0;
      const restoredValue = currentValue - (Number(previousAdjustments[key] ?? 0) || 0);
      const nextValue = Math.max(0, restoredValue + (Number(nextAdjustments[key] ?? 0) || 0));
      if (nextValue !== currentValue) {
        updateData[`system.stats.${key}.value`] = nextValue;
      }
    }

    updateData["flags.sla-mothership.speciesBalance"] = {
      version: SLA_SPECIES_BALANCE_VERSION,
      species: currentSpecies,
      adjustments: nextAdjustments
    };

    await this.update(updateData, { slaSkipSpeciesBalance: true });
    return nextAdjustments;
  }

  getSlaSpeciesMinimumWounds() {
    const species = String(this.system?.sla?.species?.value ?? "").trim();
    if (["Frother", "Shaktar", "Stormer 313 Malice", "Stormer 711 Xeno"].includes(species)) {
      return 3;
    }
    return 2;
  }

  async enforceSlaSpeciesWounds() {
    if (this.type !== "character") return null;
    const minimumWounds = this.getSlaSpeciesMinimumWounds();
    const currentMax = Math.max(0, Number(this.system?.hits?.max ?? 0) || 0);
    if (currentMax >= minimumWounds) return null;

    await this.update({
      "system.hits.max": minimumWounds
    });
    return minimumWounds;
  }

  getSlaPrometheusStatus(combat = game.combat ?? null) {
    const enabled = this.hasSlaSpeciesRuleEnabled("prometheusRegeneration");
    if (!enabled) {
      return {
        enabled: false,
        inCombat: false,
        currentRound: 0,
        roundsUntilPulse: null,
        pulseThisRound: false
      };
    }

    const combatant = combat?.combatants?.find?.((entry) => (entry.actor ?? entry.token?.actor)?.id === this.id) ?? null;
    const currentRound = Math.max(0, Number(combat?.round ?? 0) || 0);
    const inCombat = Boolean(combat?.started && combatant);
    if (!inCombat) {
      return {
        enabled: true,
        inCombat: false,
        currentRound: 0,
        roundsUntilPulse: 4,
        pulseThisRound: false
      };
    }

    const roundMod = currentRound % 4;
    const pulseThisRound = currentRound > 0 && roundMod === 0;
    const roundsUntilPulse = pulseThisRound ? 0 : (4 - roundMod);

    return {
      enabled: true,
      inCombat,
      currentRound,
      roundsUntilPulse,
      pulseThisRound
    };
  }

  async applySlaPrometheusRegeneration({ combat = game.combat ?? null } = {}) {
    const status = this.getSlaPrometheusStatus(combat);
    if (!status.enabled || !status.inCombat || !status.pulseThisRound) return null;

    const lastCombatId = String(this.getFlag("sla-mothership", "prometheusCombatId") ?? "");
    const lastRound = Number(this.getFlag("sla-mothership", "prometheusRound") ?? 0) || 0;
    if (lastCombatId === String(combat?.id ?? "") && lastRound === status.currentRound) {
      return null;
    }

    const regenRoll = await new Roll("1d5").evaluate();
    const recovered = Math.max(0, Number(regenRoll.total ?? 0) || 0);
    const rollHtml = await this.renderSlaAbilityRollHtml(regenRoll);
    let updateText = "";
    if (recovered > 0) {
      const updateResult = await this.modifyActor("system.health.value", recovered, null, false);
      updateText = updateResult?.[1] ?? "";
    }

    await this.setFlag("sla-mothership", "prometheusCombatId", String(combat?.id ?? ""));
    await this.setFlag("sla-mothership", "prometheusRound", status.currentRound);

    await ChatMessage.create({
      user: game.user.id,
      speaker: { actor: this.id, token: this.token, alias: this.name },
      content: `
        <div class="mosh sla-chat-card">
          <div class="sla-chat-title">Prometheus Regeneration</div>
          <div class="sla-chat-copy">${this.name} triggers Prometheus regeneration on combat round ${status.currentRound}.</div>
          ${rollHtml}
          <div class="sla-chat-copy">Recovered <strong class="sla-effect-number sla-effect-heal">${recovered}</strong> Health.</div>
          ${updateText ? `<div class="sla-chat-copy">${updateText}</div>` : ""}
        </div>
      `
    });

    return { recovered, round: status.currentRound };
  }

  isSlaEbbUser() {
    const species = String(this.system?.sla?.species?.value ?? "").trim();
    return ["Ebon", "Brain Waster"].includes(species);
  }

  getSlaRestrictedEbbItemIds() {
    return this.items
      .filter((item) => {
        const name = String(item.name ?? "").trim();
        const sla = item.system?.sla ?? {};
        // Morph form abilities (Vevaphon etc.) are species abilities, not Ebb abilities — never remove them
        if (sla.morphForm) return false;
        if (item.type === "ability") return true;
        if (item.type !== "skill") return false;
        return name === "Formulate" || name === "Biofeedback" || name === "Ebb (Core)" || name.startsWith("Ebb ");
      })
      .map((item) => item.id);
  }

  async enforceSlaEbbEligibility({ notify = false, refillFlux = false } = {}) {
    if (this.type !== "character") return { removed: 0 };

    if (!this.isSlaEbbUser()) {
      const restrictedIds = this.getSlaRestrictedEbbItemIds();
      const updateData = {
        "system.sla.flux.value": 0,
        "system.sla.flux.max": 0,
        "system.sla.fluxStage.value": "",
        "system.sla.ebbRating.value": 0
      };
      await this.update(updateData);
      const validIds = restrictedIds.filter(id => this.items.get(id) !== undefined);
      let removed = 0;
      if (validIds.length) {
        try {
          await this.deleteEmbeddedDocuments("Item", validIds);
          removed = validIds.length;
        } catch (err) {
          // Concurrent enforcement calls may have already deleted these items — safe to ignore
        }
      }
      if (notify && removed) {
        ui.notifications.warn(`${this.name} is not an Ebb user. Restricted Ebb skills and abilities were removed.`);
      }
      return { removed };
    }

    const currentMax = Math.max(0, Number(this.system?.sla?.flux?.max ?? 0) || 0);
    const currentValue = Math.max(0, Number(this.system?.sla?.flux?.value ?? 0) || 0);
    const intellect = Number(this.system?.stats?.intellect?.value ?? 0) + Number(this.system?.stats?.intellect?.mod ?? 0);
    const targetMax = Math.max(currentMax, Math.max(20, Math.floor(intellect / 4)));
    const shouldRefill = refillFlux || currentMax < 20;
    const updateData = {
      "system.sla.flux.max": targetMax,
      "system.sla.flux.value": shouldRefill ? targetMax : Math.min(Math.max(currentValue, 0), targetMax)
    };
    await this.update(updateData);
    await this.updateSlaFluxState(updateData["system.sla.flux.value"], { save: true });
    return { removed: 0 };
  }

  getSlaAbilityRollAttribute(ability) {
    const sla = ability?.system?.sla ?? {};
    const name = String(ability?.name ?? "").trim().toLowerCase();
    const impact = String(sla.impact ?? "").trim().toLowerCase();
    const category = String(sla.skillCategoryRef ?? "").trim().toLowerCase();

    if (sla.attack || impact === "harm" || category === "combat") return "combat";
    if (name.includes("telekinesis")) return "strength";
    if (name.includes("awareness") || name.includes("senses")) return "speed";
    return "intellect";
  }

  findBestSkillItemByName(skillName = "") {
    const target = String(skillName ?? "").trim().toLowerCase();
    if (!target) return null;
    return this.items
      .filter((item) => item.type === "skill" && String(item.name ?? "").trim().toLowerCase() === target)
      .sort((left, right) => (Number(right.system?.bonus ?? 0) || 0) - (Number(left.system?.bonus ?? 0) || 0))[0] ?? null;
  }

  getSlaSkillBonusByName(skillName = "") {
    const skill = this.findBestSkillItemByName(skillName);
    return skill ? Number(skill.system?.bonus ?? 0) || 0 : null;
  }

  buildSlaRollBreakdown({ attribute, skillName = "", skillValue = null, supportSkills = [] } = {}) {
    const stat = this.system?.stats?.[attribute] ?? {};
    const statLabel = String(stat.label ?? attribute ?? "Attribute").trim();
    const statValue = Number(stat.value ?? 0) || 0;
    const statMod = Number(stat.mod ?? 0) || 0;
    const resolvedSkillValue = Number(skillValue ?? this.getSlaSkillBonusByName(skillName) ?? 0) || 0;
    const parts = [
      { label: statLabel, value: statValue }
    ];

    if (statMod) {
      parts.push({ label: `${statLabel} Mod`, value: statMod });
    }
    if (skillName) {
      parts.push({ label: skillName, value: resolvedSkillValue });
    }

    const conditionImpact = this.getSlaConditionRollModifier({ attribute, skillName });
    for (const impact of conditionImpact.parts) {
      parts.push({
        label: `${impact.condition} (${impact.severity})`,
        value: impact.value,
        note: impact.detail
      });
    }

    const support = supportSkills
      .map((entry) => {
        const label = typeof entry === "string" ? entry : String(entry?.label ?? "").trim();
        if (!label) return null;
        const bonus = this.getSlaSkillBonusByName(label);
        if (bonus == null) return null;
        return {
          label,
          value: bonus,
          note: typeof entry === "string" ? "" : String(entry?.note ?? "").trim()
        };
      })
      .filter(Boolean);

    const total = parts.reduce((sum, part) => sum + (Number(part.value ?? 0) || 0), 0);

    return {
      parts,
      support,
      total,
      conditionImpact,
      formulaText: parts.map((part) => `${part.label} ${part.value >= 0 ? "+" : ""}${part.value}`).join(" + ").replace(/\+\s-/g, "- ")
    };
  }

  getSlaEbbSkillAttribute(skillName = "") {
    const name = String(skillName ?? "").trim().toLowerCase();
    if (!name) return "intellect";
    if (name.includes("blast") || name.includes("thermal")) return "combat";
    if (name.includes("telekinesis")) return "strength";
    if (name.includes("awareness") || name.includes("senses")) return "speed";
    return "intellect";
  }

  async chooseSlaEbbRollAttribute({
    title = "Choose Ebb Roll Attribute",
    defaultAttribute = "intellect",
    description = ""
  } = {}) {
    const options = [
      { key: "intellect", label: this.system?.stats?.intellect?.label ?? "Intellect" },
      { key: "speed", label: this.system?.stats?.speed?.label ?? "Speed" },
      { key: "strength", label: this.system?.stats?.strength?.label ?? "Strength" },
      { key: "combat", label: this.system?.stats?.combat?.label ?? "Combat" }
    ];

    return new Promise((resolve) => {
      const radioRows = options
        .map((option) => {
          const stat = this.system?.stats?.[option.key] ?? {};
          const total = (Number(stat.value ?? 0) || 0) + (Number(stat.mod ?? 0) || 0);
          const checked = option.key === defaultAttribute ? "checked" : "";
          return `<label style="display:block; margin:8px 0;"><input type="radio" name="sla-ebb-attr" value="${option.key}" ${checked}> ${option.label} (${total})</label>`;
        })
        .join("");

      new foundry.applications.api.DialogV2({
        window: { title },
        classes: ["macro-popup-dialog"],
        content: `
          <div class="macro_desc">
            <h4>Choose the attribute for this Ebb roll</h4>
            ${description ? `<p>${description}</p>` : ""}
            ${radioRows}
          </div>
        `,
        buttons: [
          {
            label: "Roll",
            action: "roll",
            icon: "fas fa-bolt",
            callback: (_event, button) => {
              const selected = button.form?.querySelector("input[name='sla-ebb-attr']:checked")?.value ?? defaultAttribute;
              resolve(selected);
            }
          },
          {
            label: "Cancel",
            action: "cancel",
            icon: "fas fa-times",
            callback: () => resolve(null)
          }
        ],
        close: () => resolve(null)
      }).render({ force: true });
    });
  }

  async rollSlaEbbSkill(itemId) {
    const skill = this.getEmbeddedDocument("Item", itemId);
    if (!skill || skill.type !== "skill") return null;
    if (!this.isSlaEbbUser()) {
      ui.notifications.warn(`${this.name} is not configured as an Ebb user.`);
      return null;
    }
    const defaultAttribute = this.getSlaEbbSkillAttribute(skill.name);
    const attribute = await this.chooseSlaEbbRollAttribute({
      title: `${skill.name}: Ebb Attribute`,
      defaultAttribute,
      description: `Default for ${skill.name} is ${this.system?.stats?.[defaultAttribute]?.label ?? defaultAttribute}. Change it here if you want a different Ebb stat basis.`
    });
    if (!attribute) return null;

    return this.rollCheck("1d100", "low", attribute, skill.name, Number(skill.system?.bonus ?? 0) || 0, null, null, {
      slaEbbSkill: true,
      ebbSkillName: skill.name,
      skillImg: skill.img,
      skillCategory: String(skill.system?.sla?.category ?? "").trim(),
      rollBreakdown: this.buildSlaRollBreakdown({
        attribute,
        skillName: skill.name,
        skillValue: Number(skill.system?.bonus ?? 0) || 0
      })
    });
  }

  getSlaFormulateSkillBonus() {
    const formulate = this.findBestSkillItemByName("Formulate");
    return formulate ? Number(formulate.system?.bonus ?? 0) || 0 : null;
  }

  getSlaFluxState(flux = null) {
    const currentFlux = Math.max(0, Number(flux ?? this.system?.sla?.flux?.value ?? 0) || 0);
    const maxFlux = Math.max(0, Number(this.system?.sla?.flux?.max ?? 0));
    const spentFlux = Math.max(0, maxFlux - currentFlux);
    const ratio = maxFlux > 0 ? spentFlux / maxFlux : 0;
    if (maxFlux > 0 && ratio > 1) {
      return {
        index: 4,
        label: "Catastrophic",
        cssClass: "catastrophic",
        thresholds: "25% / 50% / 75% / 100%",
        description: "Flux has gone critical. Fear failures should spill directly into panic.",
        panicOnFailure: true,
        panicEvenOnSuccess: true
      };
    }
    if (maxFlux > 0 && ratio >= 0.75) {
      return {
        index: 3,
        label: "Breach",
        cssClass: "breach",
        thresholds: "25% / 50% / 75% / 100%",
        description: "Discipline is cracking. Offensive Ebb or failed Fear saves are panic-grade events.",
        panicOnFailure: true,
        panicEvenOnSuccess: false
      };
    }
    if (maxFlux > 0 && ratio >= 0.5) {
      return {
        index: 2,
        label: "Frayed",
        cssClass: "frayed",
        thresholds: "25% / 50% / 75% / 100%",
        description: "Flux is unstable. Failed Fear saves on Ebb use should trigger panic.",
        panicOnFailure: true,
        panicEvenOnSuccess: false
      };
    }
    if (maxFlux > 0 && ratio >= 0.25) {
      return {
        index: 1,
        label: "Charged",
        cssClass: "charged",
        thresholds: "25% / 50% / 75% / 100%",
        description: "The charge is building. Keep Fear saves clean or the next spike may cascade.",
        panicOnFailure: false,
        panicEvenOnSuccess: false
      };
    }
    return {
      index: 0,
      label: "Stable",
        cssClass: "stable",
        thresholds: "25% / 50% / 75% / 100%",
        description: "Flux is contained and controlled.",
        panicOnFailure: false,
      panicEvenOnSuccess: false
    };
  }

  getSlaFluxGuidance(flux = null) {
    const currentFlux = Math.max(0, Number(flux ?? this.system?.sla?.flux?.value ?? 0) || 0);
    const maxFlux = Math.max(0, Number(this.system?.sla?.flux?.max ?? 0));
    const state = this.getSlaFluxState(currentFlux);
    const guidance = [
      `Current state: ${state.label}. ${state.description}`,
      "Fear is the control save when channeling Ebb."
    ];

    if (maxFlux > 0) {
      guidance.push(`Flux remaining: ${currentFlux} / ${maxFlux}.`);
      guidance.push(`Reserve spent: ${Math.max(0, maxFlux - currentFlux)} / ${maxFlux}. Risk thresholds track spent Flux.`);
    } else {
      guidance.push("No active Flux reserve is configured on this operative.");
    }

    if (state.index >= 3) {
      guidance.push("Breach or worse means failed channeling should be treated as immediate Panic fallout.");
    } else if (state.index >= 2) {
      guidance.push("Frayed Flux means failed Ebb saves should spill into Panic.");
    } else {
      guidance.push("Below Frayed, Panic is usually only forced by catastrophic spikes or manual checks.");
    }

    return guidance;
  }

  async updateSlaFluxState(flux = null, { save = true } = {}) {
    const currentFlux = Number(flux ?? this.system?.sla?.flux?.value ?? 0);
    const state = this.getSlaFluxState(currentFlux);

    if (save) {
      await this.update({
        "system.sla.fluxStage.value": this.isSlaEbbUser() ? state.label : ""
      });
    }

    return state;
  }

  async rollSlaSaveWithResult(saveKey = "fear", {
    rollString = "1d100",
    aimFor = "low",
    label = "Fear / Flux Control Save",
    description = ""
  } = {}) {
    const validSave = ["sanity", "fear", "body", "armor"].includes(saveKey) ? saveKey : "fear";
    const stat = this.system?.stats?.[validSave];
    if (!stat) return null;

    const rollTarget = Number(stat.value ?? 0) + Number(stat.mod ?? 0);
    const parsedRollString = this.parseRollString(rollString, aimFor);
    const rollResult = await new Roll(parsedRollString).evaluate();
    const comparison = aimFor === "high" ? ">" : aimFor === "high-equal" ? ">=" : aimFor === "low-equal" ? "<=" : "<";
    const parsedRollResult = this.parseRollResult(rollString, rollResult, false, false, rollTarget, comparison, null);
    const outcome = parsedRollResult.success ? "Success" : "Failure";
    const flavor = description || `${this.name} attempts a ${label}.`;

    const chatData = {
      user: game.user.id,
      speaker: { actor: this.id, token: this.token, alias: this.name },
      content: `
        <div class="mosh sla-chat-card">
          <div class="sla-chat-title">${label}</div>
          <div class="sla-chat-copy">${flavor}</div>
          ${parsedRollResult.rollHtml}
          ${parsedRollResult.outcomeHtml}
          <div class="sla-chat-copy"><strong>${outcome}</strong> against ${rollTarget} (${stat.label}).</div>
        </div>
      `
    };

    const rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) {
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    }
    if (rollMode === "blindroll") {
      chatData.blind = true;
    }

    await ChatMessage.create(chatData);
    return parsedRollResult;
  }

  async triggerSlaFluxPanic({
    source = "Flux control check",
    panicOnFailure = true,
    forcePanic = false
  } = {}) {
    if (!this.isSlaEbbUser()) {
      ui.notifications.warn(`${this.name} is not configured as an Ebb user.`);
      return { saveResult: null, state: this.getSlaFluxState(0), panicTriggered: false };
    }
    const saveResult = await this.rollSlaSaveWithResult("fear", {
      label: "Post-Use Fear / Flux Control Save",
      description: source
    });
    const state = this.getSlaFluxState();
    const shouldPanic = Boolean(forcePanic || (panicOnFailure && !saveResult?.success && state.panicOnFailure) || state.panicEvenOnSuccess);
    if (shouldPanic) {
      await this.rollTable("panicCheck", null, null, null, null, null, null);
    }
    return { saveResult, state, panicTriggered: shouldPanic };
  }

  async chooseSlaAbilityTier(ability) {
    const tiers = ability?.system?.sla?.tiers ?? [];
    if (!tiers.length) {
      return null;
    }
    if (tiers.length === 1) {
      return tiers[0];
    }

    return new Promise((resolve) => {
      const buttons = tiers.map((tier) => ({
        action: tier.id ?? tier.label ?? foundry.utils.randomID(),
        label: `${tier.label ?? tier.id ?? "Tier"} (${tier.cost ?? ability.system?.sla?.fluxCost ?? 0} Flux)`,
        icon: "fas fa-bolt",
        callback: () => resolve(tier)
      }));

      new foundry.applications.api.DialogV2({
        window: { title: `${ability.name}: choose Ebb tier` },
        classes: ["macro-popup-dialog"],
        content: `<div class="macro_desc"><h4>Select the Ebb intensity</h4><p>Higher tiers cost more Flux and carry more panic risk.</p></div>`,
        buttons,
        close: () => resolve(tiers[0])
      }).render({ force: true });
    });
  }

  buildSlaAbilityChatCopy(ability, tier) {
    const copy = foundry.utils.duplicate(ability);
    const tierData = tier ?? null;
    if (!tierData) return copy;

    copy.system.roll = tierData.damage ?? tierData.healing ?? copy.system.roll;
    copy.system.sla.fluxCost = Number(tierData.cost ?? copy.system?.sla?.fluxCost ?? 0) || 0;
    copy.system.sla.tier = tierData.label ?? tierData.id ?? copy.system?.sla?.tier ?? "basic";
    copy.system.sla.range = tierData.range ?? copy.system?.sla?.range ?? "";
    copy.system.sla.duration = tierData.duration ?? copy.system?.sla?.duration ?? "";
    copy.system.sla.impact = copy.system?.sla?.impact ?? "";
    copy.system.sla.skillCategoryRef = copy.system?.sla?.skillCategoryRef ?? "";
    copy.system.sla.ignoreArmour = Number(tierData.ignoreArmour ?? copy.system?.sla?.ignoreArmour ?? 0) || 0;
    const tierEffect = tierData.effect ? `<p><strong>Chosen Tier:</strong> ${copy.system.sla.tier}</p><p>${tierData.effect}</p>` : `<p><strong>Chosen Tier:</strong> ${copy.system.sla.tier}</p>`;
    copy.system.description = `${tierEffect}${copy.system.description ?? ""}`;
    return copy;
  }

  async useSlaAbility(itemId) {
    this._slaAbilityUseLocks ??= new Set();
    if (this._slaAbilityUseLocks.has(itemId)) {
      return;
    }

    const item = this.getEmbeddedDocument("Item", itemId);
    if (!item) return;
    this._slaAbilityUseLocks.add(itemId);
    try {
      if (!this.isSlaEbbUser()) {
        ui.notifications.warn(`${this.name} cannot channel Ebb without a Flux track.`);
        return;
      }

      const tier = await this.chooseSlaAbilityTier(item);
      const ability = this.buildSlaAbilityChatCopy(item, tier);
      const sla = ability.system?.sla ?? {};
      const fluxCost = Math.max(0, Number(sla.fluxCost ?? 0) || 0);
      const primarySkillName = String(sla.skillRef ?? "").trim() || "Formulate";
      const primarySkill = this.findBestSkillItemByName(primarySkillName) ?? this.findBestSkillItemByName("Formulate");
      if (!primarySkill) {
        ui.notifications.warn(`${this.name} is missing the required Ebb discipline for ${ability.name}.`);
        return;
      }
      const primarySkillBonus = Number(primarySkill.system?.bonus ?? 0) || 0;
      const formulateBonus = this.getSlaFormulateSkillBonus();
      const saveKey = String(sla.panicSave ?? "").trim().toLowerCase();
      const canRollSave = Boolean(sla.rollOnUse === true) && ["sanity", "fear", "body", "armor"].includes(saveKey);
      const fluxBefore = Math.max(0, Number(this.system?.sla?.flux?.value ?? 0) || 0);
      const fluxMax = Math.max(0, Number(this.system?.sla?.flux?.max ?? 0));
      if (fluxBefore <= 0) {
        ui.notifications.warn(`${this.name} has no Flux remaining and cannot channel Ebb.`);
        return;
      }
      if (fluxCost > fluxBefore) {
        ui.notifications.warn(`${this.name} does not have enough Flux remaining for ${ability.name}.`);
        return;
      }
      const fluxAfter = Math.max(0, fluxBefore - fluxCost);

      if (fluxCost > 0) {
        await this.update({ "system.sla.flux.value": fluxAfter });
      }
      const stateAfter = await this.updateSlaFluxState(fluxAfter);
      const previousState = this.getSlaFluxState(fluxBefore);
      const defaultAttribute = this.getSlaAbilityRollAttribute(ability);
      const rollAttribute = await this.chooseSlaEbbRollAttribute({
        title: `${ability.name}: Ebb Attribute`,
        defaultAttribute,
        description: `Default for ${ability.name} is ${this.system?.stats?.[defaultAttribute]?.label ?? defaultAttribute}. Choose the attribute you want to roll this channel through.`
      });
      if (!rollAttribute) {
        return;
      }
      const supportSkills = [];
      if (formulateBonus != null && String(primarySkill.name ?? "").trim().toLowerCase() !== "formulate") {
        supportSkills.push({ label: "Formulate", note: "support discipline, not added to this target number" });
      }
      const coreSkillName = String(sla.coreSkillRef ?? "").trim();
      if (coreSkillName && coreSkillName.toLowerCase() !== String(primarySkill.name ?? "").trim().toLowerCase()) {
        supportSkills.push({ label: coreSkillName, note: "core discipline, not added to this target number" });
      }
      const rollOutcome = await this.rollCheck("1d100", "low", rollAttribute, primarySkill.name, primarySkillBonus, null, null, {
        slaEbbSkill: true,
        ebbSkillName: ability.name,
        skillImg: ability.img,
        skillCategory: String(sla.skillCategoryRef ?? sla.impact ?? "Ebb").trim(),
        ebbTier: String(sla.tier ?? "").trim(),
        fluxCost,
        rollBreakdown: this.buildSlaRollBreakdown({
          attribute: rollAttribute,
          skillName: primarySkill.name,
          skillValue: primarySkillBonus,
          supportSkills
        })
      });
      const parsedRollResult = rollOutcome?.[0]?.parsedRollResult ?? null;

      if (parsedRollResult?.success) {
        await this.resolveSlaAbilityEffect(ability, { isCriticalSuccess: Boolean(parsedRollResult?.critical) });
      } else if (parsedRollResult?.critical) {
        await this.resolveSlaAbilityFumble(ability);
      }

      let saveResult = null;
      if (canRollSave && parsedRollResult?.success === false && parsedRollResult?.critical === true) {
        saveResult = await this.rollSlaSaveWithResult(saveKey, {
          label: `${ability.name}: Post-Use ${this.system?.stats?.[saveKey]?.label ?? "Save"}`,
          description: `${ability.name} critically failed. This is the post-use ${this.system?.stats?.[saveKey]?.label ?? "control"} save to keep the backlash from becoming panic. Flux remaining: ${fluxAfter}.`
        });
      }

      if (saveResult && saveResult.success === false) {
        await this.rollTable("panicCheck", null, null, null, null, null, null);
      }
    } catch (err) {
      console.error("sla-mothership | Ebb ability use failed", err);
      ui.notifications.error(`Ebb ability failed to resolve: ${item?.name ?? "Unknown ability"}. Check the console for details.`);
    } finally {
      this._slaAbilityUseLocks.delete(itemId);
    }
  }

  // Print the item description into the chat.
  async chatDesc(item) {
    let swapNameDesc = false;
    let swapName = '';
    let itemName = item.name?.charAt(0).toUpperCase() + item.name?.toLowerCase().slice(1);
    if (!item.name && isNaN(itemName)) {
      itemName = item.charAt(0)?.toUpperCase() + item.toLowerCase().slice(1);
    }

    let rollInsert = '';
    if (item.system.roll) {
      const r = new Roll(item.system.roll, {});
      await r.evaluate();
      rollInsert = `
        <div class="rollh2" style="text-transform: lowercase;">${item.system.roll}</div>
        <div class="roll-grid">
          <div class="roll-result">${r.total}</div>
        </div>`;
    }

    // add flag to swap name and description, if desc contains trinket or patch
    if (["<p>Patch</p>", "<p>Trinket</p>", "<p>Maintenance Issue</p>"].includes(item.system.description)) {
      swapNameDesc = true;
      swapName = item.system.description.replaceAll('<p>', '').replaceAll('</p>', '');
    }

    const templateData = {
      actor: this,
      stat: { name: itemName.toUpperCase() },
      item,
      insert: rollInsert,
      onlyDesc: true,
      swapNameDesc,
      swapName,
      severityMeta: this.getSlaSeverityMeta({ severity: item?.system?.severity })
    };

    const chatData = {
      user: game.user.id,
      speaker: { actor: this.id, token: this.token, alias: this.name }
    };

    const rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) {
      chatData.whisper = ChatMessage.getWhisperRecipients("GM");
    }

    const template = 'systems/sla-mothership/templates/chat/itemRoll.html';
    const content = await foundry.applications.handlebars.renderTemplate(template, templateData);
    chatData.content = content;
    await ChatMessage.create(chatData);

    console.log(`Created chat message with details on ${item.name}`);
  }

}
