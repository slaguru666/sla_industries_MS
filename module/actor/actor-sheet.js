import { SLAMothershipGenerator } from "../windows/sla-character-generator.js";
import { SLADrugSystem } from "../sla-drug-system.js";
import { buildSlaTraitRows, getSlaTraitOptionsByType, validateSlaTraitRows } from "../traits/sla-traits.js";

function isEbbSkillName(name = "") {
  const clean = String(name ?? "").trim();
  return clean.startsWith("Ebb ") || ["Biofeedback", "Formulate", "Ebb (Core)"].includes(clean);
}

function sortSkillCollection(skills = []) {
  return [...skills].sort((left, right) => {
    const leftCategory = String(left?.system?.sla?.category ?? "").trim().toLowerCase();
    const rightCategory = String(right?.system?.sla?.category ?? "").trim().toLowerCase();
    if (leftCategory !== rightCategory) return leftCategory.localeCompare(rightCategory);
    return String(left?.name ?? "").localeCompare(String(right?.name ?? ""));
  });
}

function dedupeSkillCollection(skills = []) {
  const byName = new Map();
  for (const skill of skills) {
    const key = String(skill?.name ?? "").trim().toLowerCase();
    if (!key) continue;
    const current = byName.get(key);
    const currentBonus = Number(current?.system?.bonus ?? 0) || 0;
    const nextBonus = Number(skill?.system?.bonus ?? 0) || 0;
    if (!current || nextBonus > currentBonus) {
      byName.set(key, skill);
    }
  }
  return Array.from(byName.values());
}

function normalizeTraitSkillKey(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function roundCarryWeight(value) {
  return Math.round((Number(value ?? 0) || 0) * 10) / 10;
}

function encToKg(enc) {
  return roundCarryWeight((Number(enc ?? 0) || 0) * 1.5);
}

function resolveItemWeight(itemDoc) {
  const system = itemDoc?.system ?? {};
  const explicitWeight = Number(system.weight ?? 0);
  const encValue = Number(system?.sla?.enc ?? 0);
  if ((itemDoc?.type === "weapon" || itemDoc?.type === "armor") && encValue > 0) {
    if (explicitWeight <= 0 || Math.abs(explicitWeight - encValue) < 0.001) {
      return encToKg(encValue);
    }
  }
  return roundCarryWeight(explicitWeight);
}

function getCarryState(itemDoc) {
  const system = itemDoc?.system ?? {};
  if (system.carryState) return String(system.carryState);
  if (itemDoc?.type === "armor" && system.equipped) return "equipped";
  return "carried";
}

function buildCarryStateMeta(itemDoc) {
  const state = getCarryState(itemDoc);
  return {
    state,
    label: state === "equipped" ? "Equipped" : state === "stowed" ? "Stowed" : "Carried",
    cssClass: state === "equipped" ? "equipped" : state === "stowed" ? "stowed" : "carried",
    countsWeight: state !== "stowed"
  };
}

function calculateCarryCapacity(actorSystem = {}) {
  const strength = Math.max(0, Number(actorSystem?.stats?.strength?.value ?? 0) || 0);
  const body = Math.max(0, Number(actorSystem?.stats?.body?.value ?? 0) || 0);
  return roundCarryWeight(Math.max(10, (strength * 0.6) + (body * 0.4)));
}

function buildTraitSkillPreview(traitRows = [], skillName = "") {
  const key = normalizeTraitSkillKey(skillName);
  const communicationSkills = new Set(["command", "fasttalk", "intimidate", "persuade", "streetwise"]);
  const effects = [];
  let flatMod = 0;

  const add = (amount, label) => {
    const value = Number(amount ?? 0) || 0;
    if (!value) return;
    flatMod += value;
    effects.push(`${label}: ${value >= 0 ? "+" : ""}${value}%`);
  };

  for (const row of traitRows) {
    const rank = Math.max(1, Number(row?.slaTrait?.rank ?? 1) || 1);
    switch (String(row?.slaTrait?.key ?? "")) {
      case "good-hearing":
        if (key === "listen") add(10 * rank, row.name);
        break;
      case "poor-hearing":
        if (key === "listen") add(-10 * rank, row.name);
        break;
      case "good-vision":
        if (key === "spothidden") add(10 * rank, row.name);
        break;
      case "poor-vision":
        if (key === "spothidden") add(-10 * rank, row.name);
        break;
      case "attractive":
        if (communicationSkills.has(key)) add(10 * rank, row.name);
        break;
      case "unattractive":
        if (communicationSkills.has(key)) add(-10 * rank, row.name);
        break;
      case "depression":
        if (communicationSkills.has(key)) add(-10 * rank, row.name);
        break;
      default:
        break;
    }
  }

  return {
    flatMod,
    effects,
    summary: effects.join(" | "),
    modLabel: flatMod ? `${flatMod > 0 ? "+" : ""}${flatMod}` : ""
  };
}

function decorateSkillWithTraitPreview(skill, traitRows = []) {
  skill.system ??= {};
  const baseBonus = Number(skill.system.bonus ?? 0) || 0;
  const preview = buildTraitSkillPreview(traitRows, skill.name);
  skill.system.displayBonus = baseBonus + preview.flatMod;
  skill.system.traitMod = preview.flatMod;
  skill.system.traitEffects = preview.effects;
  skill.slaTraitPreview = preview;
  return skill;
}

const SLA_SPECIES_RULES = {
  Human: [
    { key: "adaptable", label: "Adaptable", summary: "Once per session, reroll one Stat check and take the better result.", optional: false, default: true }
  ],
  Frother: [
    { key: "berserkState", label: "Berserk State", summary: "On a failed Sanity Save, the Frother may enter Berserk instead of gaining Stress: +10 to Combat and Strength checks, but risks attacking the nearest target.", optional: true, default: true },
    { key: "drugMetabolism", label: "Drug Metabolism", summary: "No addiction roll for standard combat drugs, and one combat drug per scene can be taken without a Body Save penalty.", optional: true, default: true }
  ],
  Ebon: [
    { key: "ebbSensitivity", label: "Ebb Sensitivity", summary: "Automatically senses nearby Ebb use and rolls Sanity Saves at Disadvantage against reality-warping events.", optional: false, default: true },
    { key: "fluxPool", label: "Flux Pool", summary: "Flux begins at Intellect / 4 with a minimum reserve of 20, and recovers at 1 point per hour of rest.", optional: false, default: true }
  ],
  "Brain Waster": [
    { key: "ebbAggression", label: "Ebb Aggression", summary: "Damaging Ebb abilities add +1d5 damage.", optional: false, default: true },
    { key: "unnervingPresence", label: "Unnerving Presence", summary: "Nearby allies roll Fear Saves at Disadvantage when the Brain Waster channels Ebb.", optional: true, default: true }
  ],
  "Wraith Raider": [
    { key: "predatorSenses", label: "Predator Senses", summary: "Advantage on Speed-based perception, ambush detection, and initiative checks. Never surprised in natural or urban environments unless by supernatural means.", optional: false, default: true },
    { key: "naturalWeapons", label: "Natural Weapons", summary: "Claws deal Strength / 10 + 1d5 damage at Adjacent range and count as primary species weapons.", optional: false, default: true }
  ],
  Shaktar: [
    { key: "honourBound", label: "Honour Bound", summary: "Breaking a code of honour forces a Sanity Save or the Shaktar gains 1d3 Stress.", optional: true, default: true },
    { key: "naturalWeapons", label: "Natural Weapons", summary: "Claws deal Strength / 10 damage and grappling or restraining Strength checks gain Advantage.", optional: false, default: true }
  ],
  "Stormer 313 Malice": [
    { key: "prometheusRegeneration", label: "Prometheus Regeneration", summary: "At the end of every fourth combat round, recover 1d5 Health. Once wounds are healed, continue recovering 1 Health per round.", optional: true, default: true },
    { key: "biogeneticAggression", label: "Biogenetic Aggression", summary: "Disadvantage on Intellect checks involving diplomacy, deception detection, or abstract reasoning.", optional: false, default: true },
    { key: "financeChipMandatory", label: "Finance Chip Mandatory", summary: "The Karma finance chip is built in and cannot be removed.", optional: false, default: true }
  ],
  "Stormer 711 Xeno": [
    { key: "chameleonChitin", label: "Chameleon Chitin", summary: "Spend 1 action to become near-invisible while stationary. Detection is at Disadvantage until the Xeno moves.", optional: true, default: true },
    { key: "prometheusRegeneration", label: "Prometheus Regeneration", summary: "At the end of every fourth combat round, recover 1d5 Health.", optional: true, default: true },
    { key: "inhumanAppearance", label: "Inhuman Appearance", summary: "Social Intellect checks against other species are at Disadvantage because the Xeno is deeply unnerving.", optional: true, default: true }
  ],
  "Advanced Carrien": [
    { key: "socialPrejudice", label: "Social Prejudice", summary: "Track district or sponsor prejudice penalties until a source-grounded Carrien conversion replaces this draft entry.", optional: true, default: true }
  ]
};

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class MothershipActorSheet extends foundry.appv1.sheets.ActorSheet {

  constructor(...args) {
    super(...args);
    this._slaTraitPickerSelection ??= {
      advantage: "",
      disadvantage: ""
    };
  }

  /** @override */
  static get defaultOptions() {
    var options = {
      classes: ["mosh", "sheet", "actor", "character"],
      template: "systems/sla-mothership/templates/actor/actor-sheet.html",
      width: 820,
      height: 820,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "skills" }],
      submitOnChange: true
    }
    return foundry.utils.mergeObject(super.defaultOptions, options);
  }

  /* -------------------------------------------- */

  /** @override */
  async getData() {
    const data = await super.getData();

    data.dtypes = ["String", "Number", "Boolean"];

    const superData = data.data.system;

    for (let attr of Object.values(data.data.system.attributes)) {
      attr.isCheckbox = attr.dtype === "Boolean";
    }

    // Prepare items.
    if (this.actor.type == 'character') {
      this._prepareCharacterItems(data);
    }


    if (data.data.system.settings == null) {
      data.data.system.settings = {};
    }
    data.data.system.settings.useCalm = game.settings.get("sla-mothership", "useCalm");
    data.data.system.settings.hideWeight = game.settings.get("sla-mothership", "hideWeight");
    data.data.system.settings.firstEdition = game.settings.get("sla-mothership", "firstEdition");
    data.data.system.settings.androidPanic = game.settings.get("sla-mothership", "androidPanic");

    superData.sla ??= {};
    superData.sla.operativeType ??= { value: "" };
    superData.sla.species ??= { value: "" };
    superData.sla.speciesNotes ??= { value: "" };
    superData.sla.trainingPackage ??= { value: "" };
    superData.sla.packageSummary ??= { value: "" };
    superData.sla.packageSkills ??= { value: "" };
    superData.sla.packageWealth ??= { value: "" };
    superData.sla.flux ??= { value: 0, min: 0, max: 0, label: "Flux" };
    superData.sla.fluxStage ??= { value: "" };
    superData.sla.bpn ??= { value: "" };
    superData.sla.scl ??= { value: "" };
    superData.sla.employer ??= { value: "" };
    superData.sla.sector ??= { value: "" };
    superData.sla.height ??= { value: "" };
    superData.sla.weightText ??= { value: "" };
    superData.sla.lad ??= false;
    superData.sla.ebbRating ??= { value: 0 };
    superData.sla.ammoSpendTotal ??= { value: 0 };
    superData.sla.ammoLedger ??= { value: "" };
    superData.sla.fluxNotes ??= { value: "" };
    superData.sla.ebbNotes ??= { value: "" };
    superData.sla.speciesRules ??= {};
    superData.sla.sessionAbilityUsed ??= false;
    superData.sla.contacts ??= [];
    superData.sla.activityLog ??= { value: "" };
    const activeTheme = this.actor.getFlag("sla-mothership", "sheetTheme") || "modern";
    data.slaSheetTheme = activeTheme;
    data.data.slaSheetTheme = activeTheme;

    data.data.enriched = [];
    data.data.enriched.notes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(superData.notes, {async: true});
    data.data.enriched.biography = await foundry.applications.ux.TextEditor.implementation.enrichHTML(superData.biography, {async: true});
    data.data.isEbbUser = this.actor.isSlaEbbUser?.() ?? false;
    data.data.slaFlux = this.actor.getSlaFluxState?.() ?? { label: "Stable", description: "", cssClass: "stable", thresholds: "25% / 50% / 75% / 100%" };
    data.data.slaFluxGuidance = this.actor.getSlaFluxGuidance?.() ?? [];
    const fluxValue = Number(superData.sla.flux?.value ?? 0);
    const fluxMax = Math.max(0, Number(superData.sla.flux?.max ?? 0));
    data.data.slaFluxPercent = fluxMax > 0 ? Math.min(100, Math.max(0, Math.round((fluxValue / fluxMax) * 100))) : 0;
    // Vevaphon morph data
    data.data.isVevaphon = this.actor.isSlaVevaphon?.() ?? false;
    if (data.data.isVevaphon) {
      const instab = Math.max(0, Math.min(12, Number(superData.sla.vevaphonInstability?.value ?? 0) || 0));
      data.data.vevaphonInstabilityPercent = Math.round((instab / 12) * 100);
      data.data.vevaphonInstabilityElevated = instab >= 6;
      data.data.vevaphonInstabilityCritical = instab >= 10;
      data.data.vevaphonInstabilityClass = instab >= 10 ? "instability-critical" : instab >= 6 ? "instability-elevated" : "instability-nominal";
    }
    data.data.slaSpeciesTraitList = String(superData.sla.speciesNotes?.value ?? "").split(/\n+/).map((entry) => entry.trim()).filter(Boolean);
    data.data.slaPackageSkillList = String(superData.sla.packageSkills?.value ?? "").split(/\s*,\s*/).map((entry) => entry.trim()).filter(Boolean);
    data.data.slaSpeciesRules = getSpeciesRules(String(superData.sla.species?.value ?? "").trim(), superData.sla.speciesRules);
    data.data.slaEnabledSpeciesRules = data.data.slaSpeciesRules.filter((rule) => rule.enabled);
    data.data.slaEnabledSpeciesRuleCount = data.data.slaEnabledSpeciesRules.length;
    data.data.slaPositiveTraitOptions = getSlaTraitOptionsByType("advantage");
    data.data.slaNegativeTraitOptions = getSlaTraitOptionsByType("disadvantage");
    data.data.slaTraitPickerSelection = {
      advantage: String(this._slaTraitPickerSelection?.advantage ?? "").trim(),
      disadvantage: String(this._slaTraitPickerSelection?.disadvantage ?? "").trim()
    };
    data.data.slaPrometheusStatus = this.actor.getSlaPrometheusStatus?.() ?? { enabled: false, inCombat: false, currentRound: 0, roundsUntilPulse: null, pulseThisRound: false };

    // Contacts
    const rawContacts = Array.isArray(superData.sla.contacts) ? superData.sla.contacts : [];
    data.data.slaContacts = rawContacts.map((c) => ({
      id: String(c.id ?? foundry.utils.randomID()),
      name: String(c.name ?? "Unknown"),
      role: String(c.role ?? ""),
      notes: String(c.notes ?? ""),
      disposition: ["ally", "neutral", "hostile", "unknown"].includes(c.disposition) ? c.disposition : "neutral"
    }));
    data.data.slaContactCount = data.data.slaContacts.length;
    const traitRows = buildSlaTraitRows(data.data.persTraits ?? []);
    data.data.persTraitsEnhanced = traitRows;
    data.data.traitCount = traitRows.length;
    data.data.traitValidation = validateSlaTraitRows(traitRows);
    data.data.skills = sortSkillCollection(dedupeSkillCollection((data.data.skills ?? []).map((skill) => {
      const breakdown = this.actor.getSkillBreakdown?.(skill) ?? {};
      skill.system ??= {};
      skill.system.sla ??= {};
      skill.system.sla.category ||= breakdown.category ?? "";
      skill.slaBreakdown = breakdown;
      skill.isEbbSkill = isEbbSkillName(skill.name);
      skill.isCombatSkill = Boolean(skill.system.sla.combat);
      return decorateSkillWithTraitPreview(skill, traitRows);
    })));
    data.data.ebbSkills = sortSkillCollection(dedupeSkillCollection((data.data.ebbSkills ?? []).map((skill) => {
      const breakdown = this.actor.getSkillBreakdown?.(skill) ?? {};
      skill.system ??= {};
      skill.system.sla ??= {};
      skill.system.sla.category ||= breakdown.category ?? "";
      skill.slaBreakdown = breakdown;
      skill.isEbbSkill = true;
      skill.isCombatSkill = Boolean(skill.system.sla.combat);
      return decorateSkillWithTraitPreview(skill, traitRows);
    })));
    const drugOverview = await SLADrugSystem.getActorOverview(this.actor);
    data.data.drugAlerts = drugOverview.alerts;
    data.data.drugRows = (drugOverview.rows ?? []).map((row) => {
      const sourceItem = this.actor.items.get(row.itemId);
      const carryMeta = sourceItem ? buildCarryStateMeta(sourceItem) : { state: "carried", label: "Carried", cssClass: "carried", countsWeight: true };
      const totalWeight = sourceItem
        ? roundCarryWeight(resolveItemWeight(sourceItem) * Math.max(1, Number(sourceItem.system?.quantity ?? row.quantity ?? 1) || 1))
        : 0;
      return {
        ...row,
        slaCarry: {
          ...carryMeta,
          totalWeight
        }
      };
    });
    data.data.slaStatModifierTitles = SLADrugSystem.getStatModifierTitles(this.actor);
    const ammoItems = Array.from(this.actor.items ?? []).filter((item) =>
      item.type === "item" && String(item.system?.sla?.category ?? "").trim().toLowerCase() === "ammunition"
    );
    data.data.slaAmmoInventory = {
      stackCount: ammoItems.length,
      roundCount: ammoItems.reduce((total, item) => total + (Number(item.system?.quantity ?? 0) || 0), 0)
    };
    data.data.slaCarry = {
      capacity: roundCarryWeight(Number(superData.weight?.capacity ?? 0) || 0),
      current: roundCarryWeight(Number(superData.weight?.current ?? 0) || 0),
      equipped: roundCarryWeight(Number(superData.weight?.equipped ?? 0) || 0),
      carried: roundCarryWeight(Number(superData.weight?.carried ?? 0) || 0),
      stowed: roundCarryWeight(Number(superData.weight?.stowed ?? 0) || 0),
      available: roundCarryWeight(Number(superData.weight?.available ?? 0) || 0),
      over: Boolean(superData.weight?.over),
      state: String(superData.weight?.state ?? "Nominal")
    };


    //SKILL XP BUTTONS
    superData.xp.html = '';
    if (superData.xp.html == '') {
      for (let i = 1; i <= 15; i++) {
        if (i > superData.xp.value) {
          if (i % 5) {
            superData.xp.html += '<div class="circle"></div>';
          }
          else { //If a special one
            let trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -54px;">Trained</div>';
            if (i == 10) trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -50px;">Expert</div>';
            else if (i == 15) trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -52px;">Master</div>';
            superData.xp.html += '<div class="circle" style="background:rgb(200,200,200);">' + trainLevel + '</div>';
          }
        }
        else {
          if (i % 5) {
            superData.xp.html += '<div class="circle-f"></div>';
          }
          else { //If a special one
            let trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -54px; color:black;">Trained</div>';
            if (i == 10) trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -50px; color:black;">Expert</div>';
            else if (i == 15) trainLevel = '<div class="skill_training_text" style="position: relative; top: 17px; text-align: center; left: -52px; color:black;">Master</div>';
            superData.xp.html += '<div class="circle-f" style="background:black;">' + trainLevel + '</div>';
          }

        }
      }
    }
    //END SKILL XP

    return data.data;
  }

  /**
   * Organize and classify Items for Character sheets.
   *
   * @param {Object} actorData The actor to prepare.
   *
   * @return {undefined}
   */
  _prepareCharacterItems(sheetData) {
    const actorData = sheetData.data;
    //console.log(sheetData);
    ///console.log("sheetdata Above");
    // Initialize containers.
    const gear = [];
    const drugs = [];
    const skills = [];
    const ebbSkills = [];
    const weapons = [];
    const armors = [];
    const conditions = [];
    const abilities = [];
    const persTraits = [];

    let curWeight = 0;
    let equippedWeight = 0;
    let carriedWeight = 0;
    let stowedWeight = 0;
    // Iterate through items, allocating to containers
    // let totalWeight = 0;
    for (let i of sheetData.items) {
      let item = i.system;
      i.img = i.img || DEFAULT_TOKEN;
      const resolvedWeight = resolveItemWeight(i);
      const carryMeta = buildCarryStateMeta(i);
      const quantity = Math.max(1, Number(item.quantity ?? 1) || 1);
      item.weightResolved = resolvedWeight;
      item.carryState ??= carryMeta.state;
      i.slaCarry = {
        ...carryMeta,
        weight: resolvedWeight,
        totalWeight: roundCarryWeight(resolvedWeight * quantity)
      };
      if (carryMeta.state === "equipped") equippedWeight += i.slaCarry.totalWeight;
      else if (carryMeta.state === "stowed") stowedWeight += i.slaCarry.totalWeight;
      else carriedWeight += i.slaCarry.totalWeight;

      if (i.type === 'item') {
        gear.push(i);
        if (carryMeta.countsWeight) curWeight += i.slaCarry.totalWeight;
      } else if (i.type === 'drug') {
        drugs.push(i);
        if (carryMeta.countsWeight) curWeight += i.slaCarry.totalWeight;
      } else if (i.type === 'skill') {
        if (isEbbSkillName(i.name)) {
          ebbSkills.push(i);
        } else {
          skills.push(i);
        }
      } else if (i.type === 'armor') {
        armors.push(i);
        if (carryMeta.countsWeight) curWeight += i.slaCarry.totalWeight;
      } else if (i.type === 'weapon') {
        //We need to update this from the old system.    
        item.ranges ??= { short: 0, medium: 0, long: 0, value: "" };
        if (item.ranges.value == "" && item.ranges.medium > 0) {
          item.ranges.value = item.ranges.short + "/" + item.ranges.medium + "/" + item.ranges.long;
          item.ranges.medium = 0;
        }
        item.sla ??= {};
        if (item.useAmmo) {
          item.ammoTag ??= "STD";
          item.ammoLoadedType ??= item.ammoTag ?? "STD";
          item.ammoCalibre ??= item.ammoType ?? "";
          item.ammoReserveStd ??= Math.max(0, Number(item.ammo ?? 0) || 0);
          item.ammoReserveAp ??= 0;
          item.ammoReserveHe ??= 0;
          item.ammoReserveHeap ??= 0;
          item.ammoReserve = getAmmoReserveTotal(item);
          item.sla.fireModes ??= deriveWeaponFireModes(item);
          item.sla.currentFireMode ??= parseWeaponFireModes(item.sla.fireModes)[0]?.label ?? "Single";
          item.shotsPerFire = getActiveFireMode(item)?.shots ?? Math.max(Number(item.shotsPerFire ?? 1) || 1, 1);
          const ammoInventory = summarizeWeaponAmmoInventory(this.actor, item);
          item.sla.ammoChoices = ammoInventory.choices;
          item.sla.ammoReserve = ammoInventory.total;
          item.sla.loadedAmmoLabel = item.ammoLoadedType ?? "STD";
          item.sla.loadedAmmoReserve = ammoInventory.byTag[item.ammoLoadedType ?? "STD"] ?? ammoInventory.total;
          item.sla.loadedAmmoSummary = `${item.sla.loadedAmmoLabel} | ${item.sla.loadedAmmoReserve} carried`;
          item.sla.calibreLabel = item.ammoCalibre || item.ammoType || "Unknown calibre";
          const currentShots = Math.max(0, Number(item.curShots ?? 0) || 0);
          const maxShots = Math.max(0, Number(item.shots ?? 0) || 0);
          if (currentShots <= 0) {
            item.sla.ammoState = "Empty";
            item.sla.ammoStateClass = "empty";
          } else if (maxShots && currentShots <= Math.ceil(maxShots / 3)) {
            item.sla.ammoState = "Low";
            item.sla.ammoStateClass = "low";
          } else {
            item.sla.ammoState = "Ready";
            item.sla.ammoStateClass = "ready";
          }
          item.sla.reserveSummary = `${currentShots}/${maxShots} loaded | ${item.sla.loadedAmmoReserve} spare`;
        }

        weapons.push(i);
        if (carryMeta.countsWeight) curWeight += i.slaCarry.totalWeight;
      } else if (i.type === 'condition') {
        // We'll handle the pip html here.
        if (item.treatment == null) {
          item.treatment = {
            "value": 0,
            "html": ""
          };
        }
        let pipHtml = "";
        for (let i = 0; i < 3; i++) {
          if (i < item.treatment.value) {
            pipHtml += '<i class="fas fa-circle"></i>';
          }
          else {
            pipHtml += '<i class="far fa-circle"></i>';
          }
        }

        item.treatment.html = pipHtml;

        conditions.push(i);
      } else if (i.type === 'ability') {
        abilities.push(i);
      } else if (i.type === 'persTrait') {
        persTraits.push(i);
      }
    }

    if (actorData.system.weight == undefined) {
      actorData.system.weight = {
        "current": 0,
        "capacity": 0
      };
    }
    if (actorData.system.credits == undefined) {
      actorData.system.credits = {
        "value": 0,
      };
    }

    actorData.system.weight.capacity = calculateCarryCapacity(actorData.system);
    actorData.system.weight.current = roundCarryWeight(curWeight);
    actorData.system.weight.equipped = roundCarryWeight(equippedWeight);
    actorData.system.weight.carried = roundCarryWeight(carriedWeight);
    actorData.system.weight.stowed = roundCarryWeight(stowedWeight);
    actorData.system.weight.available = roundCarryWeight(actorData.system.weight.capacity - actorData.system.weight.current);
    actorData.system.weight.over = actorData.system.weight.current > actorData.system.weight.capacity;
    actorData.system.weight.state = actorData.system.weight.over ? "Overloaded" : actorData.system.weight.current > actorData.system.weight.capacity * 0.8 ? "Near Limit" : "Nominal";
    //console.log("Current Weight: " + curWeight + " Capacity: " + actorData.data.weight.capacity);

    // Assign and return
    actorData.gear = gear;
    actorData.drugs = drugs;
    actorData.skills = skills;
    actorData.ebbSkills = ebbSkills;
    actorData.armors = armors;
    actorData.weapons = weapons;
    actorData.conditions = conditions;
    actorData.abilities = abilities;
    actorData.persTraits = persTraits.sort((left, right) => String(left?.name ?? "").localeCompare(String(right?.name ?? "")));

  }

  /** @override */
  activateListeners(html) {
    super.activateListeners(html);
    this._applyThemeClasses(html);

    // Everything below here is only needed if the sheet is editable
    if (!this.options.editable) return;

    html.on('mousedown', '.char-pip-button', ev => {
		
      const div = $(ev.currentTarget);
      const targetName = div.data("key");
		
	  let amount = this.actor.system.xp.value;
	  let newAmount = amount;
      let max = div.data("max");
      let min = div.data("min");

      if (event.button == 0) {
        if (amount < max) {
          newAmount = Number(amount) + 1;
        }
      } else if (event.button == 2) {
        if (amount > min) {
          newAmount = Number(amount) - 1;
        }
      }
	  
	  this.actor.update({'system.xp.value': newAmount});

    });

    html.on('mousedown', '.treatment-button', ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      

      let amount = item.system.treatment.value;

      if (event.button == 0) {
        if (amount < 3) {
          item.system.treatment.value = Number(amount) + 1;
        }
      } else if (event.button == 2) {
        if (amount > 0) {
          item.system.treatment.value = Number(amount) - 1;
        }
      }

      this.actor.updateEmbeddedDocuments('Item', [item]);
    });


    // Update Inventory Item
    html.find('.item-equip').click(ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));

      item.system.equipped = !item.system.equipped;
      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    html.find('.sla-carry-toggle').click(async (ev) => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const targetState = String(ev.currentTarget.dataset.state ?? "carried");
      const item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      const currentState = getCarryState(item);
      const nextState = currentState === targetState ? "carried" : targetState;
      item.system ??= {};
      item.system.carryState = nextState;
      if (item.type === "armor") item.system.equipped = nextState === "equipped";
      await this.actor.updateEmbeddedDocuments('Item', [item]);
      this.render(false);
    });

    // Add Inventory Item
    html.find('.item-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.item-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const item = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
      item.sheet.render({force: true});
    });

    html.find('.drug-use').click(ev => {
      const li = ev.currentTarget.closest(".item");
      this.actor.useSlaDrug(li.dataset.itemId);
    });

    html.find('.drug-close').click(ev => {
      const itemButton = ev.currentTarget;
      const li = itemButton.closest(".item");
      const itemId = String(itemButton?.dataset?.itemId ?? li?.dataset?.itemId ?? "").trim();
      const drugId = String(itemButton?.dataset?.drugId ?? li?.dataset?.drugId ?? "").trim();
      if (!itemId && !drugId) {
        ui.notifications.warn("No active drug could be identified to close.");
        return;
      }
      this.actor.closeSlaDrug(itemId, drugId);
    });

    //Quantity adjuster
    html.on('mousedown', '.item-quantity', ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      
      let amount = item.system.quantity;

      if (event.button == 0) {
        item.system.quantity = Number(amount) + 1;
      } else if (event.button == 2) {
        item.system.quantity = Number(amount) - 1;
      }

      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    //Severity adjuster
    html.on('mousedown', '.severity', ev => {
      const li = ev.currentTarget.closest(".item");
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      

      let amount = item.system.severity;

      if (event.button == 0) {
        item.system.severity = Number(amount) + 1;
      } else if (event.button == 2 && amount > 0) {
        item.system.severity = Number(amount) - 1;
      }

      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    // Delete Inventory Item
    html.find('.item-delete').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      this.actor.deleteEmbeddedDocuments("Item", [li.data("itemId")]);
      li.slideUp(200, () => this.render(false));
    });

    //SKILLS
    // Add Inventory Item
    html.find('.skill-create').click(this._onSkillCreate.bind(this));

    // Update Inventory Item
    html.find('.skill-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const skill = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
      skill.sheet.render({force: true});
    });

    html.find('.ability-create').click(this._onItemCreate.bind(this));

    html.find('.ability-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const ability = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
      ability.sheet.render({force: true});
    });

    html.find('.ability-use').click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      this.actor.useSlaAbility(li.dataset.itemId);
    });

    html.find('.ability-use-trigger').click(ev => {
      ev.preventDefault();
      ev.stopPropagation();
      const li = ev.currentTarget.closest(".item");
      this.actor.useSlaAbility(li.dataset.itemId);
    });

    //Weapons
    // Add Inventory Item
    html.find('.weapon-create').click(this._onItemCreate.bind(this));

    // Update Inventory Item
    html.find('.weapon-edit').click(ev => {
      const li = $(ev.currentTarget).parents(".item");
      const weapon = this.actor.getEmbeddedDocument("Item", li.data("itemId"));
      weapon.sheet.render({force: true});
    });

    // Rollable Attribute
    html.find('.stat-roll').click(ev => {
      const div = $(ev.currentTarget);
      const statName = div.data("key");
      this.actor.rollCheck(null, 'low', statName, null, null, null);
    });

    // Rollable Skill
    html.find('.skill-roll').click(ev => {
      const li = ev.currentTarget.closest(".item");
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      
      this.actor.rollCheck(null, null, null, item.name, item.system.bonus, null);
    });

    html.find('.sla-ebb-skill-roll').click(ev => {
      const itemId = ev.currentTarget.dataset.itemId;
      if (!itemId) return;
      this.actor.rollSlaEbbSkill(itemId);
    });

    html.find('.sla-rule-toggle input[type="checkbox"]').on('change', async ev => {
      ev.stopPropagation();
      const checkbox = ev.currentTarget;
      await this.actor.update({ [checkbox.name]: checkbox.checked });
      this.render(false);
    });

    html.find('.sla-rule-toggle').on('click', async ev => {
      const checkbox = ev.currentTarget.querySelector('input[type="checkbox"]');
      if (!checkbox || ev.target === checkbox) return;
      ev.preventDefault();
      const nextValue = !checkbox.checked;
      checkbox.checked = nextValue;
      await this.actor.update({ [checkbox.name]: nextValue });
      this.render(false);
    });

    // Rollable Weapon
    html.find('.weapon-roll').click(ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      this.actor.rollWeaponAttack(item);
    });

    // Rollable Damage
    html.find('.dmg-roll').click(ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      this.actor.rollCheck(null, null, 'damage', null, null, item);
    });

    // Rollable Item/Anything with a description that we want to click on.
    html.find('.description-roll').click(ev => {
      const li = ev.currentTarget.closest(".item");
      this.actor.printDescription(li.dataset.itemId, {
        event: ev
      });
    });

    html.on('mousedown', '.weapon-ammo', ev => {
      ev.preventDefault();
      if (ev.button !== 0) return;
      const li = ev.currentTarget.closest(".item");
      this.actor.promptWeaponReload(li.dataset.itemId);
    });

    html.on('mousedown', '.weapon-shots', ev => {
      ev.preventDefault();
      if (ev.button !== 0) return;
      const li = ev.currentTarget.closest(".item");
      this.actor.promptWeaponReload(li.dataset.itemId);
    });

    //Reload Shots
    html.on('mousedown', '.weapon-reload', ev => {
      ev.preventDefault();
      if (ev.button !== 0) return;
      const li = ev.currentTarget.closest(".item");
      this.actor.promptWeaponReload(li.dataset.itemId);
    });

    html.on('mousedown', '.weapon-fire-mode', ev => {
      ev.preventDefault();
      const li = ev.currentTarget.closest(".item");
      const direction = ev.button === 2 ? -1 : 1;
      this.actor.cycleWeaponFireMode(li.dataset.itemId, direction);
    });
    html.on('contextmenu', '.weapon-fire-mode', ev => {
      ev.preventDefault();
    });

    //increase AP
    html.on('mousedown', '.armor-ap', ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      let amount = item.system.armorPoints;
      if (event.button == 0) {
          item.system.armorPoints = Number(amount) + 1;
      } else if (event.button == 2) {
        if (amount > 0) {
          item.system.armorPoints = Number(amount) - 1;
        }
      }
      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    //increase DR
    html.on('mousedown', '.armor-dr', ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      let amount = item.system.damageReduction;
      if (event.button == 0) {
          item.system.damageReduction = Number(amount) + 1;
      } else if (event.button == 2) {
        if (amount > 0) {
          item.system.damageReduction = Number(amount) - 1;
        }
      }
      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    //increase oxygen
    html.on('mousedown', '.armor-oxy', ev => {
      const li = ev.currentTarget.closest(".item");
      //const item = duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId))
      var item;
      item = foundry.utils.duplicate(this.actor.getEmbeddedDocument("Item", li.dataset.itemId));
      let amount = item.system.oxygenCurrent;
      if (event.button == 0) {
        if (amount < item.system.oxygenMax) {
          item.system.oxygenCurrent = Number(amount) + 1;
        }
      } else if (event.button == 2) {
        if (amount > 0) {
          item.system.oxygenCurrent = Number(amount) - 1;
        }
      }
      this.actor.updateEmbeddedDocuments('Item', [item]);
    });

    // Calm - Panic Check
    html.find('.calm-roll').click(ev => {
      this.actor.rollCheck(null, 'low', 'fear', null, null, null);
    });

    // Stress - Panic Check
    html.find('.stress-roll').click(ev => {
      this.actor.rollCheck(null, 'low', 'fear', null, null, null);
    });

    html.find('.sla-flux-save').click(ev => {
      this.actor.triggerSlaFluxPanic({ source: 'Flux control check', panicOnFailure: false });
    });

    html.find('.sla-flux-panic').click(ev => {
      this.actor.triggerSlaFluxPanic({ source: 'Manual Flux panic check', panicOnFailure: true, forcePanic: true });
    });

    // Vevaphon morph form shift
    html.find('.sla-morph-shift').click(async (ev) => {
      const formName = ev.currentTarget.dataset.form;
      if (!formName) return;
      await this.actor.setSlaVevaphonMorphForm?.(formName);
      this.render(false);
    });

    // Vevaphon instability +/-
    html.find('.sla-instability-increase').click(async () => {
      await this.actor.adjustSlaVevaphonInstability?.(1);
      this.render(false);
    });
    html.find('.sla-instability-decrease').click(async () => {
      await this.actor.adjustSlaVevaphonInstability?.(-1);
      this.render(false);
    });

    // SCL fractional adjustment buttons
    html.find('.sla-scl-adjust').click(async (ev) => {
      ev.preventDefault();
      const delta = parseFloat(ev.currentTarget.dataset.delta ?? 0);
      if (!delta) return;
      const current = parseFloat(String(this.actor.system?.sla?.scl?.value ?? "0").replace(",", ".")) || 0;
      const next = Math.max(0, Math.round((current + delta) * 10) / 10);
      const formatted = Number.isInteger(next) ? String(next) : next.toFixed(1);
      await this.actor.update({ "system.sla.scl.value": formatted });
      this.render(false);
    });

    // Session ability tracking — checkbox
    html.find('.sla-session-ability-used').on('change', async (ev) => {
      ev.stopPropagation();
      await this.actor.update({ "system.sla.sessionAbilityUsed": ev.currentTarget.checked });
    });

    // New Session reset button
    html.find('.sla-new-session').click(async (ev) => {
      ev.preventDefault();
      const confirmed = await Dialog.confirm({
        title: "New Session",
        content: "<p>Start a new session? This will reset the trauma response session ability for this operative.</p>",
        defaultYes: true
      });
      if (!confirmed) return;
      await this.actor.update({ "system.sla.sessionAbilityUsed": false });
      ui.notifications.info(`${this.actor.name}: session ability reset for new session.`);
      this.render(false);
    });

    // Rest button — short or long rest dialog
    html.find('.sla-rest-button').click(async (ev) => {
      ev.preventDefault();
      const restType = await new Promise((resolve) => {
        new Dialog({
          title: "Take a Rest",
          content: `
            <p>What kind of rest is <strong>${this.actor.name}</strong> taking?</p>
            <p><strong>Short Rest:</strong> Removes non-permanent conditions. No stat recovery.</p>
            <p><strong>Long Rest:</strong> Removes non-permanent conditions and fully restores Flux (if Ebb user).</p>
          `,
          buttons: {
            short: { icon: '<i class="fas fa-moon"></i>', label: "Short Rest", callback: () => resolve("short") },
            long: { icon: '<i class="fas fa-bed"></i>', label: "Long Rest", callback: () => resolve("long") },
            cancel: { icon: '<i class="fas fa-times"></i>', label: "Cancel", callback: () => resolve(null) }
          },
          default: "short"
        }).render(true);
      });
      if (!restType) return;

      const updates = {};
      // Remove temporary conditions (items of type "condition")
      const conditionIds = this.actor.items
        .filter((item) => item.type === "condition")
        .map((item) => item.id);
      if (conditionIds.length > 0) {
        await this.actor.deleteEmbeddedDocuments("Item", conditionIds);
      }

      if (restType === "long") {
        // Restore Flux to max for Ebb users
        const isEbb = this.actor.isSlaEbbUser?.() ?? false;
        if (isEbb) {
          const fluxMax = Math.max(0, Number(this.actor.system?.sla?.flux?.max ?? 0));
          updates["system.sla.flux.value"] = fluxMax;
          await this.actor.updateSlaFluxState?.(fluxMax, { save: true });
        }
      }

      if (Object.keys(updates).length > 0) {
        await this.actor.update(updates);
      }

      const condMsg = conditionIds.length > 0 ? ` Cleared ${conditionIds.length} condition(s).` : "";
      const fluxMsg = restType === "long" && (this.actor.isSlaEbbUser?.() ?? false) ? " Flux restored." : "";
      ui.notifications.info(`${this.actor.name}: ${restType === "long" ? "Long" : "Short"} rest complete.${condMsg}${fluxMsg}`);
      await this.actor.addSlaActivityLog?.(`${restType === "long" ? "Long" : "Short"} rest.${condMsg}${fluxMsg}`);
      this.render(false);
    });

    // Contact add button
    html.find('.sla-contact-add').click(async (ev) => {
      ev.preventDefault();
      await this._slaContactDialog(null);
    });

    // Contact edit button
    html.find('.sla-contact-edit').click(async (ev) => {
      ev.preventDefault();
      const contactId = String(ev.currentTarget.dataset.contactId ?? "").trim();
      if (!contactId) return;
      await this._slaContactDialog(contactId);
    });

    // Contact delete button
    html.find('.sla-contact-delete').click(async (ev) => {
      ev.preventDefault();
      const contactId = String(ev.currentTarget.dataset.contactId ?? "").trim();
      if (!contactId) return;
      const confirmed = await Dialog.confirm({
        title: "Delete Contact",
        content: "<p>Remove this contact from the operative's network?</p>",
        defaultYes: false
      });
      if (!confirmed) return;
      const contacts = Array.isArray(this.actor.system?.sla?.contacts) ? [...this.actor.system.sla.contacts] : [];
      const updated = contacts.filter((c) => c.id !== contactId);
      await this.actor.update({ "system.sla.contacts": updated });
      this.render(false);
    });

    html.find('.sla-panic-button').click(async ev => {
      await this.actor.rollTable("panicCheck", null, null, null, null, null, null);
      await this.actor.addSlaActivityLog?.("Panic check triggered.");
    });

    html.find('.sla-wound-button').click(ev => {
      this.actor.chooseSlaWoundTable?.();
    });

    html.find('.trait-validate').click(() => {
      const traitRows = buildSlaTraitRows(this.actor.items.filter((item) => item.type === "persTrait"));
      const report = validateSlaTraitRows(traitRows);
      const balance = Number(report?.rankBalance?.net ?? 0);
      if (report.ok) {
        ui.notifications.info(`Trait validation OK. Balance ${balance >= 0 ? "+" : ""}${balance}.`);
      } else {
        ui.notifications.warn(`Trait validation issues: ${report.errors.join(" ")}`);
      }
      this.render(false);
    });

    const captureTraitSelection = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const type = String(ev.currentTarget?.dataset?.type ?? "").trim().toLowerCase();
      if (!type) return;
      const value = String(ev.currentTarget?.value ?? "").trim();
      this._slaTraitPickerSelection ??= {};
      this._slaTraitPickerSelection[type] = value;
      const pickerRow = ev.currentTarget.closest('.sla-trait-picker-row');
      if (pickerRow?.dataset) {
        pickerRow.dataset.selectedTrait = value;
      }
      const addButton = pickerRow?.querySelector?.(`.sla-trait-add[data-type="${type}"]`);
      if (addButton?.dataset) {
        addButton.dataset.selectedTrait = value;
      }
    };

    html.find('.sla-trait-select').on('change input', captureTraitSelection);

    html.find('.sla-trait-add').click(async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      const type = String(ev.currentTarget.dataset.type ?? "").trim().toLowerCase();
      const pickerRow = ev.currentTarget.closest('.sla-trait-picker-row');
      const select = pickerRow?.querySelector(`.sla-trait-select[data-type="${type}"]`)
        ?? html.find(`.sla-trait-select[data-type="${type}"]`).get(0);
      const selectedKey = String(
        select?.value
        ?? pickerRow?.dataset?.selectedTrait
        ?? ev.currentTarget?.dataset?.selectedTrait
        ?? this._slaTraitPickerSelection?.[type]
        ?? ""
      ).trim();
      if (!selectedKey) {
        ui.notifications.warn(`Choose a ${type === "advantage" ? "positive" : "negative"} trait first.`);
        return;
      }
      const options = type === "advantage" ? getSlaTraitOptionsByType("advantage") : getSlaTraitOptionsByType("disadvantage");
      const selected = options.find((entry) => entry.key === selectedKey);
      if (!selected) return;
      const existing = this.actor.items.find((item) => item.type === "persTrait" && String(item.name ?? "").trim().toLowerCase() === selected.label.toLowerCase());
      if (existing) {
        ui.notifications.warn(`${selected.label} is already on this operative.`);
        return;
      }
      await this.actor.createEmbeddedDocuments("Item", [{
        name: selected.label,
        type: "persTrait",
        img: type === "advantage"
          ? "systems/sla-mothership/images/icons/ui/conditions/moral_compass.png"
          : "systems/sla-mothership/images/icons/ui/conditions/anxiety.png",
        system: {
          base: 1,
          xp: 0,
          oppName: "",
          basic: false,
          improve: false,
          oppimprove: false,
          description: "",
          gmDescription: "",
          sla: {
            traitType: type,
            source: "SLA Trait Selector"
          }
        }
      }]);
      this._slaTraitPickerSelection ??= {};
      this._slaTraitPickerSelection[type] = "";
      if (pickerRow?.dataset) {
        pickerRow.dataset.selectedTrait = "";
      }
      if (ev.currentTarget?.dataset) {
        ev.currentTarget.dataset.selectedTrait = "";
      }
      if (select) select.value = "";
    });

    html.find('.sla-health-reset').click(async (ev) => {
      ev.preventDefault();
      const maxHealth = Math.max(0, Number(this.actor.system?.health?.max ?? 0) || 0);
      await this.actor.update({ "system.health.value": maxHealth });
      ui.notifications.info(`Health reset to ${maxHealth}.`);
      this.render(false);
    });

    html.find('.weapon-reload-all').click(async (ev) => {
      ev.preventDefault();
      await this.actor.reloadAllCompatibleWeapons?.();
      this.render(false);
    });

    // Clicking on Armor
    html.find('.armor-roll').click(ev => {
      //roll panic check
      this.actor.chooseCover();
    });

    // Drag events for macros.
    if (this.actor.isOwner) {
      let handler = ev => this._onDragStart(ev);

      html.find('li.dropitem').each((i, li) => {
        if (li.classList.contains("inventory-header")) return;
        li.setAttribute("draggable", true);
        li.addEventListener("dragstart", handler, false);
      });
    }

  }

  /* -------------------------------------------- */

  /**
   * Handle creating a new Owned Item for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  _onItemCreate(event) {

    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    var data;
    data = foundry.utils.duplicate(header.dataset);

    // Initialize a default name.
    const name = type === "persTrait" ? "New Trait" : `New ${type.capitalize()}`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      data: data
    };

    // Remove the type from the dataset since it's in the itemData.type prop.
    delete itemData.data["type"];

    // Finally, create the item!
    return this.actor.createEmbeddedDocuments("Item", [itemData]);
  }

  /**
   * Handle creating a new Owned skill for the actor using initial data defined in the HTML dataset
   * @param {Event} event   The originating click event
   * @private
   */
  _onSkillCreate(event) {
    event.preventDefault();
    const header = event.currentTarget;
    // Get the type of item to create.
    const type = header.dataset.type;
    // Grab any data associated with this control.
    var data;
    data = foundry.utils.duplicate(header.dataset);
    //const data = duplicate(header.dataset);
    // Initialize a default name.
    const name = `New Skill`;
    // Prepare the item object.
    const itemData = {
      name: name,
      type: type,
      system: data
    };

    let d = new foundry.applications.api.DialogV2({
		  window: {title: `New Skill`},
      classes: ["macro-popup-dialog"],
      content: `
        <div class="macro_window">
          <div class="macro_desc" style="padding-left: 8px; padding-bottom: 0px;">
            <h4> Name </h4>
          </div>  
          <input type="text" id="name" name="name" value="New Skill">
        </div>
        <div class="macro_window">
          <div class="macro_desc" style="padding-left: 8px; padding-bottom: 0px;">
            <h4> Rank </h4>
          </div>
          <select name="rank" id="rank">
            <option value="Trained">Trained</option>
            <option value="Expert">Expert</option>
            <option value="Master">Master</option>
          </select>
        </div>
      `,
      buttons: [
        {
          icon: 'fas fa-check',
          action: "create",
          label: "Create",
          callback: (event, button, dialog) => {
            var rank = button.form.querySelector('[id=\"rank\"]')?.value;
            if (rank == "Trained")
              itemData.system.bonus = 10;
            if (rank == "Expert")
              itemData.system.bonus = 15;
            if (rank == "Master")
              itemData.system.bonus = 20;

            itemData.system.rank = rank;
            itemData.name = button.form.querySelector('[id=\"name\"]')?.value
            this.actor.createEmbeddedDocuments("Item", [itemData]);
          }
        },
        {
          icon: 'fas fa-times',
          action: "cancel",
          label: "Cancel",
          callback: () => { }
        }
      ],
      default: "roll",
      close: () => { }
    });
    d.render({force: true});

    // Finally, create the item!
    return;
  }


  /**
   * Handle clickable rolls.
   * @param {Event} event   The originating click event
   * @private
   */
  _onRoll(event) {
    event.preventDefault();
    const element = event.currentTarget;
    const dataset = element.dataset;

    if (dataset.roll) {
      let roll = new Roll(dataset.roll, this.actor.system);
      let label = dataset.label ? `Rolling ${dataset.label} to score under ${dataset.target}` : '';
      roll.roll().toMessage({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        flavor: label
      });
    }
  }

  async _updateObject(event, formData) {
    const actor = this.object;

    var updateData;
    updateData = foundry.utils.expandObject(formData);

    await actor.update(updateData, {
      diff: false
    });
  }

  /**
   * Show a dialog for adding or editing a contact
   * @param {string|null} contactId  null = add new, string = edit existing
   */
  async _slaContactDialog(contactId) {
    const contacts = Array.isArray(this.actor.system?.sla?.contacts) ? [...this.actor.system.sla.contacts] : [];
    const existing = contactId ? contacts.find((c) => c.id === contactId) : null;
    const isNew = !existing;

    const name = existing?.name ?? "";
    const role = existing?.role ?? "";
    const notes = existing?.notes ?? "";
    const disposition = existing?.disposition ?? "neutral";

    const content = `
      <div style="display:grid; gap:8px; padding:8px 0;">
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Name</label>
          <input type="text" id="sla-contact-name" value="${name}" placeholder="Contact name" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Role / Occupation</label>
          <input type="text" id="sla-contact-role" value="${role}" placeholder="e.g. Fixer, Fence, Squad medic" style="width:100%;" />
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Disposition</label>
          <select id="sla-contact-disposition" style="width:100%;">
            <option value="ally" ${disposition === "ally" ? "selected" : ""}>Ally</option>
            <option value="neutral" ${disposition === "neutral" ? "selected" : ""}>Neutral</option>
            <option value="hostile" ${disposition === "hostile" ? "selected" : ""}>Hostile</option>
            <option value="unknown" ${disposition === "unknown" ? "selected" : ""}>Unknown</option>
          </select>
        </div>
        <div>
          <label style="font-size:0.8rem; font-weight:600; display:block; margin-bottom:4px;">Notes</label>
          <textarea id="sla-contact-notes" rows="3" placeholder="Sector, history, how they know the operative..." style="width:100%;">${notes}</textarea>
        </div>
      </div>
    `;

    const result = await Dialog.prompt({
      title: isNew ? "Add Contact" : "Edit Contact",
      content,
      label: isNew ? "Add" : "Save",
      callback: (html) => {
        const nameVal = String(html.find("#sla-contact-name").val() ?? "").trim();
        if (!nameVal) return null;
        return {
          id: existing?.id ?? foundry.utils.randomID(),
          name: nameVal,
          role: String(html.find("#sla-contact-role").val() ?? "").trim(),
          disposition: String(html.find("#sla-contact-disposition").val() ?? "neutral"),
          notes: String(html.find("#sla-contact-notes").val() ?? "").trim()
        };
      },
      rejectClose: false
    });

    if (!result) return;

    let updated;
    if (isNew) {
      updated = [...contacts, result];
    } else {
      updated = contacts.map((c) => c.id === contactId ? result : c);
    }
    await this.actor.update({ "system.sla.contacts": updated });
    this.render(false);
  }

  /**
     * Extend and override the sheet header buttons
     * @override
     */
  _getHeaderButtons() {
    let buttons = super._getHeaderButtons();
    const canConfigure = game.user.isGM || this.actor.isOwner;
    if (this.options.editable && canConfigure) {
        buttons = [{
            label: "Theme",
            class: 'sheet-theme-toggle',
            icon: 'fas fa-palette',
            onclick: (ev) => this._onToggleTheme(ev),
        }, {
            label: "Generator",
            class: 'configure-actor',
            icon: 'fas fa-cogs',
            onclick: (ev) => this._onConfigureCreature(ev),
        },].concat(buttons);
    }
    return buttons;
  }
  async _onToggleTheme(event) {
    event.preventDefault();
    const currentTheme = (await this.actor.getFlag("sla-mothership", "sheetTheme")) || "modern";
    const nextTheme = currentTheme === "legacy" ? "modern" : "legacy";
    await this.actor.setFlag("sla-mothership", "sheetTheme", nextTheme);
    this._setThemeClassState(nextTheme);
    ui.notifications.info(`Character sheet theme: ${nextTheme === "legacy" ? "Legacy" : "Modern SLA"}`);
    await this.render(true);
    this._setThemeClassState(nextTheme);
  }
  _setThemeClassState(theme) {
    const root = this.element?.[0] ?? null;
    if (!root) return;
    root.dataset.slaTheme = theme;
    root.classList.remove("sla-sheet-theme-legacy", "sla-sheet-theme-modern");
    root.classList.add(`sla-sheet-theme-${theme}`);
    if (this.element?.removeClass) {
      this.element.removeClass("sla-sheet-theme-legacy sla-sheet-theme-modern");
      this.element.addClass(`sla-sheet-theme-${theme}`);
    }
    const windowApp = root.closest(".window-app");
    const windowContent = root.closest(".window-content");
    const windowHeader = windowApp?.querySelector?.(".window-header") ?? null;
    if (windowApp) {
      windowApp.dataset.slaTheme = theme;
      windowApp.classList.remove("sla-window-theme-legacy", "sla-window-theme-modern");
      windowApp.classList.add(`sla-window-theme-${theme}`);
    }
    if (windowContent) {
      windowContent.dataset.slaTheme = theme;
      windowContent.classList.remove("sla-window-theme-legacy", "sla-window-theme-modern");
      windowContent.classList.add(`sla-window-theme-${theme}`);
    }
    if (windowHeader) {
      windowHeader.dataset.slaTheme = theme;
      windowHeader.classList.remove("sla-window-theme-legacy", "sla-window-theme-modern");
      windowHeader.classList.add(`sla-window-theme-${theme}`);
    }
  }
  _applyThemeClasses(html) {
    const root = html?.get?.(0) ?? html?.[0] ?? null;
    if (!root) return;
    const theme = this.actor.getFlag("sla-mothership", "sheetTheme") || "modern";
    root.classList.remove("sla-sheet-theme-legacy", "sla-sheet-theme-modern");
    root.classList.add(`sla-sheet-theme-${theme}`);
    this._setThemeClassState(theme);
  }
  _onConfigureCreature(event) {
    event.preventDefault();
    new SLAMothershipGenerator(this.actor, {
        top: this.position.top + 40,
        left: this.position.left + (this.position.width - 400) / 2
    }).render({force: true});
  }
}

export class MothershipActorSheetDossier extends MothershipActorSheet {
  static get defaultOptions() {
    const base = super.defaultOptions;
    const classes = Array.from(new Set([...(base.classes ?? []), "sla-dossier-sheet"]));
    return foundry.utils.mergeObject(base, {
      classes,
      width: 980,
      height: 920
    });
  }
}

function parseWeaponFireModes(raw) {
  const modes = [];
  for (const chunk of String(raw ?? "").split(/[\n,]+/)) {
    const entry = chunk.trim();
    if (!entry) continue;
    const match = entry.match(/^(.+?)(?:\s*[:=|-]\s*|\s*\(\s*)(\d+)\)?$/);
    if (!match) continue;
    modes.push({
      label: match[1].trim(),
      shots: Math.max(1, Number(match[2]) || 1)
    });
  }
  return modes;
}

function deriveWeaponFireModes(system) {
  const shotsPerFire = Math.max(1, Number(system?.shotsPerFire ?? 1) || 1);
  const special = String(system?.sla?.special ?? "").toLowerCase();
  const modes = [{ label: "Single", shots: 1 }];

  if (shotsPerFire > 1) {
    if (special.includes("auto") && shotsPerFire > 3) {
      modes.push({ label: "Burst", shots: 3 }, { label: "Auto", shots: shotsPerFire });
    } else if (special.includes("auto")) {
      modes.push({ label: "Auto", shots: shotsPerFire });
    } else if (special.includes("burst")) {
      modes.push({ label: "Burst", shots: shotsPerFire });
    } else if (shotsPerFire === 2) {
      modes.push({ label: "Double", shots: 2 });
    } else {
      modes.push({ label: "Burst", shots: shotsPerFire });
    }
  }

  return modes
    .filter((mode, index, list) => list.findIndex((entry) => entry.label === mode.label && entry.shots === mode.shots) === index)
    .map((mode) => `${mode.label}:${mode.shots}`)
    .join(", ");
}

function getActiveFireMode(system) {
  const modes = parseWeaponFireModes(system?.sla?.fireModes);
  const currentMode = String(system?.sla?.currentFireMode ?? "").trim().toLowerCase();
  return modes.find((mode) => mode.label.toLowerCase() === currentMode) ?? modes[0] ?? { label: "Single", shots: 1 };
}

function getAmmoReserveKey(tag = "STD") {
  const normalized = String(tag ?? "STD").trim().toUpperCase();
  if (normalized === "AP") return "ammoReserveAp";
  if (normalized === "HE") return "ammoReserveHe";
  if (normalized === "HEAP") return "ammoReserveHeap";
  return "ammoReserveStd";
}

function getAmmoReserveTotal(system = {}) {
  return ["ammoReserveStd", "ammoReserveAp", "ammoReserveHe", "ammoReserveHeap"]
    .reduce((total, key) => total + Math.max(0, Number(system?.[key] ?? 0) || 0), 0);
}

function summarizeWeaponAmmoInventory(actor, weapon = {}) {
  const calibre = String(weapon?.ammoCalibre ?? weapon?.ammoType ?? "").trim();
  const allowedTags = new Set(
    [
      weapon?.ammoAllowStd !== false ? "STD" : null,
      weapon?.ammoAllowAp !== false ? "AP" : null,
      weapon?.ammoAllowHe !== false ? "HE" : null,
      weapon?.ammoAllowHeap !== false ? "HEAP" : null
    ].filter(Boolean)
  );

  const matchingItems = Array.from(actor?.items ?? []).filter((item) => {
    if (item.type !== "item") return false;
    if (String(item.system?.sla?.category ?? "").trim().toLowerCase() !== "ammunition") return false;
    const itemCalibre = String(item.system?.sla?.calibre ?? "").trim();
    if (calibre && itemCalibre && itemCalibre !== calibre) return false;
    const tag = String(item.system?.sla?.ammoTag ?? "STD").trim().toUpperCase();
    return allowedTags.has(tag);
  });

  if (!matchingItems.length) {
    return {
      total: getAmmoReserveTotal(weapon),
      byTag: {
        STD: Math.max(0, Number(weapon?.ammoReserveStd ?? weapon?.ammo ?? 0) || 0),
        AP: Math.max(0, Number(weapon?.ammoReserveAp ?? 0) || 0),
        HE: Math.max(0, Number(weapon?.ammoReserveHe ?? 0) || 0),
        HEAP: Math.max(0, Number(weapon?.ammoReserveHeap ?? 0) || 0)
      },
      choices: []
    };
  }

  const byTag = { STD: 0, AP: 0, HE: 0, HEAP: 0 };
  for (const item of matchingItems) {
    const tag = String(item.system?.sla?.ammoTag ?? "STD").trim().toUpperCase();
    byTag[tag] = (byTag[tag] ?? 0) + Math.max(0, Number(item.system?.quantity ?? 0) || 0);
  }

  return {
    total: Object.values(byTag).reduce((sum, value) => sum + value, 0),
    byTag,
    choices: matchingItems
  };
}

function getSpeciesRules(speciesName, store = {}) {
  const rules = SLA_SPECIES_RULES[speciesName] ?? [];
  return rules.map((rule) => {
    store[rule.key] ??= {
      enabled: rule.default,
      label: rule.label,
      summary: rule.summary,
      optional: rule.optional
    };
    return {
      key: rule.key,
      label: rule.label,
      summary: rule.summary,
      optional: rule.optional,
      enabled: Boolean(store[rule.key]?.enabled),
      path: `system.sla.speciesRules.${rule.key}.enabled`
    };
  });
}
