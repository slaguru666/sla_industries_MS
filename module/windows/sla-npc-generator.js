import { SLAMothershipGenerator } from "./sla-character-generator.js";

const SYSTEM_ID = "sla-mothership";
const ROOT_ACTOR_FOLDER = "SLA Mothership";
const NPC_FOLDER = "NPCs";

const NPC_ARCHETYPES = {
  "Civilian Witness": {
    summary: "Clerks, residents, dock workers, minor officials, and bystanders with enough identity to question or endanger.",
    stats: { combat: 18, instinct: 32, speed: 24, loyalty: 46, sanity: 36, armor: 0, damageReduction: 0, health: 8, hits: 1 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: true, armor: false },
    skills: [
      { name: "Persuade", bonus: 20 },
      { name: "Spot Hidden", bonus: 25 },
      { name: "Drive (Civilian)", bonus: 20 },
      { name: "Bureaucracy", bonus: 15 }
    ],
    loadouts: {
      None: [],
      Civilian: ["Street Clothes / Leather Jacket", "UV / Multi-Spectrum Torch", "Oyster Card (ITB Card)"]
    },
    defaultLoadout: "Civilian",
    defaultRole: "Witness / Local",
    defaultAffiliation: "Mort Civilian",
    defaultDepartment: "Local District"
  },
  "Street Ganger": {
    summary: "Street muscle, lookouts, turf enforcers, and volatile crew members from Mort's lower tiers.",
    stats: { combat: 34, instinct: 34, speed: 30, loyalty: 24, sanity: 24, armor: 0, damageReduction: 0, health: 10, hits: 2 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: false, armor: false },
    skills: [
      { name: "Brawl", bonus: 25 },
      { name: "Streetwise", bonus: 25 },
      { name: "Intimidate", bonus: 20 },
      { name: "Dodge", bonus: 20 },
      { name: "Firearm (Pistol)", bonus: 20 }
    ],
    loadouts: {
      None: [],
      "Street Melee": ["Collapsible Baton", "Standard Combat Knife", "Street Clothes / Leather Jacket"],
      Sidearm: ["FEN 603 Auto-Pistol", "Standard Combat Knife", "Street Clothes / Leather Jacket"]
    },
    defaultLoadout: "Sidearm",
    defaultRole: "Street Gang Enforcer",
    defaultAffiliation: "Local Street Gang",
    defaultDepartment: "Turf Crew"
  },
  "Shiver Patrol": {
    summary: "Street cops, precinct enforcers, and cordon teams good for patrol scenes, arrests, and fast escalation.",
    stats: { combat: 44, instinct: 38, speed: 34, loyalty: 58, sanity: 36, armor: 3, damageReduction: 1, health: 12, hits: 2 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: true, armor: true },
    skills: [
      { name: "Firearm (Pistol)", bonus: 30 },
      { name: "Firearm (SMG)", bonus: 25 },
      { name: "Athletics", bonus: 20 },
      { name: "Command", bonus: 20 },
      { name: "Spot Hidden", bonus: 25 }
    ],
    loadouts: {
      None: [],
      Patrol: ["FEN 401 Shiver Pistol", "Collapsible Baton", "Shiver Flak Vest"],
      "SMG Team": ["FEN 209 Machine Pistol", "Collapsible Baton", "Full Shiver Armour"]
    },
    defaultLoadout: "Patrol",
    defaultRole: "Shiver Patrol Officer",
    defaultAffiliation: "SLA Industries",
    defaultDepartment: "Shiver Precinct"
  },
  "Corp Operative": {
    summary: "Standard corporate assets, contract staff, or in-house operatives for Mort departments and sponsor interests.",
    stats: { combat: 40, instinct: 40, speed: 32, loyalty: 50, sanity: 40, armor: 2, damageReduction: 0, health: 11, hits: 2 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: true, armor: true },
    skills: [
      { name: "Firearm (Pistol)", bonus: 25 },
      { name: "Command", bonus: 20 },
      { name: "Spot Hidden", bonus: 20 },
      { name: "Bureaucracy", bonus: 20 },
      { name: "Persuade", bonus: 15 }
    ],
    loadouts: {
      None: [],
      Sidearm: ["FEN 603 Auto-Pistol", "Street Clothes / Leather Jacket"],
      "Field Agent": ["FEN 209 Machine Pistol", "Shiver Flak Vest", "Klippo Multi-Band Communicator"]
    },
    defaultLoadout: "Field Agent",
    defaultRole: "Corporate Operative",
    defaultAffiliation: "SLA Industries",
    defaultDepartment: "Operations"
  },
  "DarkNight Agent": {
    summary: "Hard, covert, and unpleasant professionals for pressure scenes, black-bag work, and very bad conversations.",
    stats: { combat: 52, instinct: 48, speed: 42, loyalty: 42, sanity: 44, armor: 4, damageReduction: 2, health: 13, hits: 2 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: true, armor: true },
    skills: [
      { name: "Stealth", bonus: 30 },
      { name: "Dodge", bonus: 25 },
      { name: "Spot Hidden", bonus: 30 },
      { name: "Firearm (SMG)", bonus: 30 },
      { name: "Intimidate", bonus: 25 }
    ],
    loadouts: {
      None: [],
      "Strike Agent": ["FEN 209 Machine Pistol", "Standard Combat Knife", "Stealth Suit"],
      Breach: ["FEN AR Assault Rifle", "Fragmentation Grenade", "Crackshot Armour"]
    },
    defaultLoadout: "Strike Agent",
    defaultRole: "DarkNight Agent",
    defaultAffiliation: "DarkNight",
    defaultDepartment: "Black Unit"
  },
  "Tek Specialist": {
    summary: "Engineers, locks-and-systems staff, data handlers, and machine-facing support assets.",
    stats: { combat: 26, instinct: 42, speed: 28, loyalty: 46, sanity: 40, armor: 1, damageReduction: 0, health: 9, hits: 1 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: true, sanity: true, armor: true },
    skills: [
      { name: "Computer Systems", bonus: 30 },
      { name: "Tech (Computers & AI)", bonus: 25 },
      { name: "Tech (Electronics)", bonus: 25 },
      { name: "Spot Hidden", bonus: 20 },
      { name: "Firearm (Pistol)", bonus: 15 }
    ],
    loadouts: {
      None: [],
      Utility: ["FEN 603 Auto-Pistol", "Klippo Multi-Band Communicator", "UV / Multi-Spectrum Torch"],
      "Field Tek": ["FEN 603 Auto-Pistol", "BOOPA Medical Kit (Standard)", "Klippo Multi-Band Communicator"]
    },
    defaultLoadout: "Utility",
    defaultRole: "Tek Specialist",
    defaultAffiliation: "Tek Division",
    defaultDepartment: "Systems"
  },
  "Ebb Operative": {
    summary: "Psychic intervention assets, occult handlers, and dangerous minds kept near the edge of tolerable doctrine.",
    stats: { combat: 30, instinct: 46, speed: 24, loyalty: 30, sanity: 46, armor: 0, damageReduction: 0, health: 9, hits: 2 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: false, sanity: true, armor: false },
    skills: [
      { name: "Biofeedback", bonus: 25 },
      { name: "Formulate", bonus: 25 },
      { name: "Ebb (Core)", bonus: 25 },
      { name: "Spot Hidden", bonus: 20 },
      { name: "Firearm (Pistol)", bonus: 15 }
    ],
    loadouts: {
      None: [],
      Focus: ["FEN 603 Auto-Pistol", "BOOPA Medical Kit (Standard)", "Klippo Multi-Band Communicator"]
    },
    defaultLoadout: "Focus",
    defaultRole: "Ebb Handler",
    defaultAffiliation: "SLA Industries",
    defaultDepartment: "Ebb / Black"
  },
  "Predator / Beast": {
    summary: "Mutants, monsters, feral biogen threats, or engineered horrors that need only enough structure to fight and stalk.",
    stats: { combat: 46, instinct: 56, speed: 40, loyalty: 12, sanity: 10, armor: 2, damageReduction: 1, health: 14, hits: 3 },
    enabled: { combat: true, instinct: true, speed: true, loyalty: false, sanity: false, armor: true },
    skills: [
      { name: "Brawl", bonus: 30 },
      { name: "Athletics", bonus: 25 },
      { name: "Dodge", bonus: 20 },
      { name: "Spot Hidden", bonus: 25 }
    ],
    loadouts: {
      None: []
    },
    defaultLoadout: "None",
    defaultRole: "Hunting Threat",
    defaultAffiliation: "Hostile Specimen",
    defaultDepartment: "Wild / Uncontrolled"
  }
};

const QUALITY_MODS = {
  Rabble: { stat: -8, skill: -10, health: -2, hits: 0 },
  Standard: { stat: 0, skill: 0, health: 0, hits: 0 },
  Veteran: { stat: 6, skill: 5, health: 1, hits: 0 },
  Elite: { stat: 10, skill: 10, health: 2, hits: 1 },
  Boss: { stat: 14, skill: 15, health: 4, hits: 1 }
};

const DISPOSITIONS = ["Neutral", "Professional", "Hostile", "Nervous", "Fanatical", "Cornered", "Corrupt", "Helpful"];
const THREAT_TIERS = ["Low", "Moderate", "High", "Extreme"];
const AFFILIATION_TYPES = ["Department", "Gang", "Corporation", "Cult", "Squad", "Civic", "Independent"];

const ROLE_SNIPPETS = {
  "Civilian Witness": ["Transit clerk", "Dock handler", "Apartment resident", "Witness under pressure", "Small trader"],
  "Street Ganger": ["Lookout", "Enforcer", "Runner", "Debt collector", "Back-alley bruiser"],
  "Shiver Patrol": ["Patrol officer", "Checkpoint lead", "Riot response cop", "Beat sergeant", "Scene controller"],
  "Corp Operative": ["Case handler", "Recovery agent", "Sponsor fixer", "Quiet escort", "Internal security operative"],
  "DarkNight Agent": ["Pressure asset", "Black-bag specialist", "Interdiction hunter", "Silent breach lead", "Cleanup professional"],
  "Tek Specialist": ["Systems breach tech", "Maintenance lead", "Field engineer", "Data recovery tech", "Signals operator"],
  "Ebb Operative": ["Control asset", "Psi observer", "Occult investigator", "Flux-sensitive handler", "Discreet interventionist"],
  "Predator / Beast": ["Tunnel stalker", "Waste-zone hunter", "Escaped specimen", "Territory alpha", "Feral ambusher"]
};

const AFFILIATION_SNIPPETS = {
  Department: ["Mort Department", "Ops Con", "Shiver Precinct", "Tek Division", "Cannibal Sector Authority"],
  Gang: ["Chrome Jacks", "Sump Dogs", "Red Wire Crew", "Murder Mile Kings", "Ash-Sector Runners"],
  Corporation: ["SLA Industries", "FEN", "Wraithen Security", "MediCore", "Tek Division"],
  Cult: ["The True Noise", "Church of White Fire", "The Bent Halo", "The Last Broadcast", "Ash Choir"],
  Squad: ["Blue BPN Hold Team", "Black Transit Unit", "Sweep Detail", "Strike Cell Seven", "Special Recovery Team"],
  Civic: ["Transit Maintenance", "Block Committee", "Waste Processing", "Public Utility", "Relocation Office"],
  Independent: ["Freelance crew", "Mercenary pair", "Broker network", "Private fixer", "Unaffiliated contact"]
};

const DEPARTMENT_SNIPPETS = {
  "Civilian Witness": ["Hab Block", "Transit", "Utility", "Street Market", "Dock Quarter"],
  "Street Ganger": ["East Cut", "Underline", "Recycling Stack", "Canal Row", "Tunnel Nine"],
  "Shiver Patrol": ["Precinct 88", "Riot Control", "Street Division", "Transit Policing", "Evidence Escort"],
  "Corp Operative": ["Internal Security", "Investigations", "Sponsor Liaison", "Logistics Recovery", "Operations"],
  "DarkNight Agent": ["Silent Entry", "Black Archive", "Pressure Cell", "Removal Team", "Interdiction"],
  "Tek Specialist": ["Signals", "Maintenance", "Surveillance", "Field Systems", "Machine Control"],
  "Ebb Operative": ["Occult Oversight", "Black Psi", "Flux Watch", "Intervention Cell", "Containment"],
  "Predator / Beast": ["Den", "Nest", "Territory", "Spore Cluster", "Hunting Ground"]
};

export class SLANpcGeneratorApp extends FormApplication {
  constructor(options = {}) {
    super(options);
    this.formState = null;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sla-npc-generator",
      classes: ["mosh", "sheet", "sla-generator", "sla-npc-generator"],
      template: "systems/sla-mothership/templates/dialogs/sla-npc-generator.html",
      width: 780,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: false
    });
  }

  get title() {
    return "SLA NPC Desk";
  }

  async getData() {
    await SLAMothershipGenerator.ensureSeedData();
    const seed = await SLAMothershipGenerator.loadSeedData();
    const speciesOptions = seed.species.species.map((entry) => entry.name);
    const state = this.formState ?? this.defaultState(speciesOptions);
    this.formState = state;

    const archetype = NPC_ARCHETYPES[state.archetype] ?? NPC_ARCHETYPES["Street Ganger"];
    const loadoutOptions = Object.keys(archetype.loadouts ?? { None: [] });

    return {
      state,
      archetypes: Object.entries(NPC_ARCHETYPES).map(([name, entry]) => ({ name, summary: entry.summary })),
      speciesOptions,
      qualityOptions: Object.keys(QUALITY_MODS),
      dispositionOptions: DISPOSITIONS,
      threatOptions: THREAT_TIERS,
      affiliationTypes: AFFILIATION_TYPES,
      loadoutOptions,
      summary: archetype.summary
    };
  }

  defaultState(speciesOptions = []) {
    const archetype = "Street Ganger";
    const config = NPC_ARCHETYPES[archetype];
    return {
      name: SLAMothershipGenerator.randomName(),
      archetype,
      quality: "Standard",
      species: speciesOptions.includes("Human") ? "Human" : (speciesOptions[0] ?? "Human"),
      affiliationType: "Gang",
      affiliation: config.defaultAffiliation,
      department: config.defaultDepartment,
      role: config.defaultRole,
      sector: "Mort City",
      disposition: "Hostile",
      threat: "Moderate",
      loadout: config.defaultLoadout ?? "None",
      assignPortrait: true,
      openSheet: true,
      notes: ""
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".sla-npc-random-name").on("click", () => {
      html.find("[name='name']").val(SLAMothershipGenerator.randomName());
    });

    html.find(".sla-npc-randomize").on("click", async () => {
      const state = this.collectState(html);
      const randomized = this.randomizeState(state);
      this.formState = randomized;
      await this.render(false);
    });

    html.find("[name='archetype']").on("change", async () => {
      const next = this.collectState(html);
      const config = NPC_ARCHETYPES[next.archetype] ?? NPC_ARCHETYPES["Street Ganger"];
      next.role = next.role || config.defaultRole;
      next.affiliation = next.affiliation || config.defaultAffiliation;
      next.department = next.department || config.defaultDepartment;
      next.loadout = (config.loadouts?.[next.loadout] ? next.loadout : config.defaultLoadout) ?? "None";
      if (next.archetype === "Ebb Operative" && !SLAMothershipGenerator.isEbbSpecies(next.species)) {
        next.species = "Ebon";
      }
      this.formState = next;
      await this.render(false);
    });
  }

  collectState(html) {
    return {
      name: String(html.find("[name='name']").val() ?? "").trim(),
      archetype: String(html.find("[name='archetype']").val() ?? "Street Ganger"),
      quality: String(html.find("[name='quality']").val() ?? "Standard"),
      species: String(html.find("[name='species']").val() ?? "Human"),
      affiliationType: String(html.find("[name='affiliationType']").val() ?? "Department"),
      affiliation: String(html.find("[name='affiliation']").val() ?? "").trim(),
      department: String(html.find("[name='department']").val() ?? "").trim(),
      role: String(html.find("[name='role']").val() ?? "").trim(),
      sector: String(html.find("[name='sector']").val() ?? "").trim(),
      disposition: String(html.find("[name='disposition']").val() ?? "Neutral"),
      threat: String(html.find("[name='threat']").val() ?? "Moderate"),
      loadout: String(html.find("[name='loadout']").val() ?? "None"),
      assignPortrait: Boolean(html.find("[name='assignPortrait']").prop("checked")),
      openSheet: Boolean(html.find("[name='openSheet']").prop("checked")),
      notes: String(html.find("[name='notes']").val() ?? "").trim()
    };
  }

  randomizeState(current) {
    const state = { ...current };
    const archetypeName = state.archetype || randomFrom(Object.keys(NPC_ARCHETYPES)) || "Street Ganger";
    const archetype = NPC_ARCHETYPES[archetypeName] ?? NPC_ARCHETYPES["Street Ganger"];
    state.name = SLAMothershipGenerator.randomName();
    state.role = randomFrom(ROLE_SNIPPETS[archetypeName] ?? [archetype.defaultRole]) ?? archetype.defaultRole;
    state.affiliationType = state.affiliationType || "Department";
    state.affiliation = randomFrom(AFFILIATION_SNIPPETS[state.affiliationType] ?? [archetype.defaultAffiliation]) ?? archetype.defaultAffiliation;
    state.department = randomFrom(DEPARTMENT_SNIPPETS[archetypeName] ?? [archetype.defaultDepartment]) ?? archetype.defaultDepartment;
    state.sector = randomFrom(["Mort City", "Cannibal Sectors", "Downtown Mort", "Transit Underlevels", "Industrial Edge", "Waste District"]) ?? "Mort City";
    state.disposition = randomFrom(DISPOSITIONS) ?? "Neutral";
    state.threat = randomFrom(THREAT_TIERS) ?? "Moderate";
    state.loadout = randomFrom(Object.keys(archetype.loadouts ?? { None: [] })) ?? "None";
    if (archetypeName === "Ebb Operative") {
      state.species = randomFrom(["Ebon", "Brain Waster"]) ?? "Ebon";
    } else if (archetypeName === "Predator / Beast") {
      state.species = randomFrom(["Advanced Carrien", "Stormer 313 Malice", "Stormer 711 Xeno", "Wraith Raider"]) ?? "Advanced Carrien";
    }
    return state;
  }

  async _updateObject(_event, formData) {
    const expanded = foundry.utils.expandObject(formData);
    const state = {
      name: String(expanded.name ?? "").trim(),
      archetype: String(expanded.archetype ?? "Street Ganger"),
      quality: String(expanded.quality ?? "Standard"),
      species: String(expanded.species ?? "Human"),
      affiliationType: String(expanded.affiliationType ?? "Department"),
      affiliation: String(expanded.affiliation ?? "").trim(),
      department: String(expanded.department ?? "").trim(),
      role: String(expanded.role ?? "").trim(),
      sector: String(expanded.sector ?? "").trim(),
      disposition: String(expanded.disposition ?? "Neutral"),
      threat: String(expanded.threat ?? "Moderate"),
      loadout: String(expanded.loadout ?? "None"),
      assignPortrait: Boolean(expanded.assignPortrait),
      openSheet: Boolean(expanded.openSheet),
      notes: String(expanded.notes ?? "").trim()
    };

    this.formState = state;
    const result = await generateSlaNpc(state);
    if (result?.actor && state.openSheet) {
      result.actor.sheet?.render(true);
    }
    ui.notifications.info(`SLA NPC ready: ${result.actor.name}`);
    this.render(false);
  }

  static open(options = {}) {
    return new SLANpcGeneratorApp(options).render({ force: true });
  }
}

export async function generateSlaNpc(state = {}) {
  await SLAMothershipGenerator.ensureSeedData();
  const seed = await SLAMothershipGenerator.loadSeedData();

  const archetype = NPC_ARCHETYPES[state.archetype] ?? NPC_ARCHETYPES["Street Ganger"];
  const quality = QUALITY_MODS[state.quality] ?? QUALITY_MODS.Standard;
  const speciesName = String(state.species ?? "Human").trim() || "Human";
  const resolvedName = String(state.name ?? "").trim() || SLAMothershipGenerator.randomName();
  const folder = await ensureNpcFolder();

  const actor = await Actor.create({
    name: resolvedName,
    type: "creature",
    folder: folder.id
  });

  const stats = applyQualityToStats(archetype.stats, quality);
  const enabled = archetype.enabled ?? {};
  const description = buildNpcDescription({ state, archetype, speciesName });
  const biography = buildNpcBiography({ state, archetype, speciesName });

  await actor.update({
    img: SLAMothershipGenerator.resolveSpeciesImage(speciesName),
    "system.description": description,
    "system.biography": biography,
    "system.notes": String(state.notes ?? "").trim(),
    "system.health.value": stats.health,
    "system.health.max": stats.health,
    "system.hits.value": 0,
    "system.hits.max": stats.hits,
    "system.stats.combat.value": stats.combat,
    "system.stats.instinct.value": stats.instinct,
    "system.stats.speed.value": stats.speed,
    "system.stats.loyalty.value": stats.loyalty,
    "system.stats.sanity.value": stats.sanity,
    "system.stats.armor.mod": stats.armor,
    "system.stats.armor.damageReduction": stats.damageReduction,
    "system.stats.combat.enabled": Boolean(enabled.combat),
    "system.stats.instinct.enabled": Boolean(enabled.instinct),
    "system.stats.speed.enabled": Boolean(enabled.speed),
    "system.stats.loyalty.enabled": Boolean(enabled.loyalty),
    "system.stats.sanity.enabled": Boolean(enabled.sanity),
    "system.stats.armor.enabled": Boolean(enabled.armor),
    "system.slaNpc.archetype.value": state.archetype,
    "system.slaNpc.species.value": speciesName,
    "system.slaNpc.affiliationType.value": state.affiliationType,
    "system.slaNpc.affiliation.value": String(state.affiliation ?? "").trim(),
    "system.slaNpc.department.value": String(state.department ?? "").trim(),
    "system.slaNpc.role.value": String(state.role ?? "").trim(),
    "system.slaNpc.sector.value": String(state.sector ?? "").trim(),
    "system.slaNpc.disposition.value": String(state.disposition ?? "").trim(),
    "system.slaNpc.threat.value": String(state.threat ?? "").trim(),
    "system.slaNpc.summary.value": archetype.summary
  });

  const itemPayloads = [];
  itemPayloads.push(...buildNpcSkillItems(archetype.skills ?? [], quality, seed.skills.skills));
  itemPayloads.push(...buildLoadoutItems(archetype, state.loadout));

  if (state.archetype === "Ebb Operative" && SLAMothershipGenerator.isEbbSpecies(speciesName)) {
    itemPayloads.push(...SLAMothershipGenerator.buildEbbSkillItems(speciesName));
    itemPayloads.push(...SLAMothershipGenerator.buildEbbItems(speciesName));
  }

  if (state.archetype === "Predator / Beast") {
    itemPayloads.push(...SLAMothershipGenerator.buildSpeciesItems(speciesName));
  }

  const uniquePayloads = uniqueEmbeddedItems(itemPayloads);
  if (uniquePayloads.length) {
    await actor.createEmbeddedDocuments("Item", uniquePayloads);
  }

  if (state.assignPortrait && game.npcPortraitPack?.assignPortraitToActor) {
    await game.npcPortraitPack.assignPortraitToActor(actor);
  }

  return { actor };
}

async function ensureNpcFolder() {
  let root = game.folders.find((folder) => folder.type === "Actor" && folder.name === ROOT_ACTOR_FOLDER && !folder.folder);
  if (!root) {
    root = await Folder.create({ name: ROOT_ACTOR_FOLDER, type: "Actor", color: "#163447" });
  }

  let folder = game.folders.find((entry) => entry.type === "Actor" && entry.name === NPC_FOLDER && entry.folder?.id === root.id);
  if (!folder) {
    folder = await Folder.create({ name: NPC_FOLDER, type: "Actor", folder: root.id, color: "#5b3349" });
  }
  return folder;
}

function applyQualityToStats(baseStats, quality) {
  return {
    combat: clamp98((baseStats.combat ?? 10) + (quality.stat ?? 0)),
    instinct: clamp98((baseStats.instinct ?? 10) + (quality.stat ?? 0)),
    speed: clamp98((baseStats.speed ?? 10) + (quality.stat ?? 0)),
    loyalty: clamp98((baseStats.loyalty ?? 10) + (quality.stat ?? 0)),
    sanity: clamp98((baseStats.sanity ?? 10) + (quality.stat ?? 0)),
    armor: Math.max(0, Number(baseStats.armor ?? 0)),
    damageReduction: Math.max(0, Number(baseStats.damageReduction ?? 0)),
    health: Math.max(1, Number(baseStats.health ?? 8) + Number(quality.health ?? 0)),
    hits: Math.max(1, Number(baseStats.hits ?? 1) + Number(quality.hits ?? 0))
  };
}

function buildNpcSkillItems(skillDefs, quality, allSkillData = []) {
  return (skillDefs ?? [])
    .map((entry) => {
      const baseBonus = Number(entry.bonus ?? 10) + Number(quality.skill ?? 0);
      const worldItem = findWorldItem(entry.name, "skill");
      if (worldItem) {
        const embedded = toEmbeddedData(worldItem);
        embedded.system.bonus = clamp98(baseBonus);
        embedded.system.rank = rankFromBonus(embedded.system.bonus);
        embedded.system.sla ??= {};
        embedded.system.sla.baseBonus = Number(worldItem.system?.bonus ?? 0) || 0;
        embedded.system.sla.packageBonus = Math.max(0, embedded.system.bonus - Number(embedded.system.sla.baseBonus ?? 0));
        return embedded;
      }

      const data = allSkillData.find((skill) => normalizeText(skill.name) === normalizeText(entry.name)) ?? {};
      return {
        name: entry.name,
        type: "skill",
        img: "icons/svg/upgrade.svg",
        system: {
          description: "",
          rank: rankFromBonus(baseBonus),
          bonus: clamp98(baseBonus),
          prerequisite_ids: [],
          sla: {
            category: data.categoryRef ?? "",
            skillFamily: data.categoryRef ?? "",
            source: "SLA NPC Desk"
          }
        }
      };
    })
    .filter(Boolean);
}

function buildLoadoutItems(archetype, loadoutName) {
  const loadout = archetype.loadouts?.[loadoutName] ?? [];
  return loadout
    .map((name) => findWorldItem(name))
    .filter(Boolean)
    .map((item) => toEmbeddedData(item));
}

function buildNpcDescription({ state, archetype, speciesName }) {
  return [
    `${state.role || archetype.defaultRole}.`,
    `${state.affiliation || archetype.defaultAffiliation}${state.department ? ` / ${state.department}` : ""}.`,
    `${state.disposition || "Neutral"} presence with ${state.threat || "Moderate"} threat pressure.`,
    `${speciesName} profile.`
  ].join(" ");
}

function buildNpcBiography({ state, archetype, speciesName }) {
  return `
    <p><strong>Role:</strong> ${escapeHtml(state.role || archetype.defaultRole)}</p>
    <p><strong>Affiliation:</strong> ${escapeHtml(state.affiliation || archetype.defaultAffiliation)}</p>
    <p><strong>Department / Cell:</strong> ${escapeHtml(state.department || archetype.defaultDepartment)}</p>
    <p><strong>Species:</strong> ${escapeHtml(speciesName)}</p>
    <p><strong>Disposition:</strong> ${escapeHtml(state.disposition || "Neutral")} | <strong>Threat:</strong> ${escapeHtml(state.threat || "Moderate")}</p>
    <p><strong>Sector:</strong> ${escapeHtml(state.sector || "Mort City")}</p>
    <p>${escapeHtml(archetype.summary)}</p>
  `.trim();
}

function clamp98(value) {
  return Math.max(1, Math.min(98, Number(value ?? 0) || 0));
}

function rankFromBonus(bonus) {
  if (bonus >= 40) return "Master";
  if (bonus >= 25) return "Expert";
  return "Trained";
}

function findWorldItem(name, type = null) {
  return game.items.find((item) => normalizeText(item.name) === normalizeText(name) && (!type || item.type === type)) ?? null;
}

function toEmbeddedData(document) {
  return foundry.utils.duplicate(document.toObject());
}

function uniqueEmbeddedItems(items = []) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.type}::${normalizeText(item.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function randomFrom(list = []) {
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)] ?? null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
