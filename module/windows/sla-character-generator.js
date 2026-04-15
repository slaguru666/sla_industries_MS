import { buildSlaTraumaResponseText } from "../sla-trauma.js";

const SYSTEM_ID = "sla-mothership";
const COMPANION_MODULE_ID = "sla-mothership-compendium";
const ROOT_ACTOR_FOLDER = "SLA Mothership";
const OPERATIVE_FOLDER = "Operatives";

const PACKAGE_STAT_BONUSES = {
  "Death Squad": { combat: 12, body: 8, health: 2, ebbRating: 0 },
  "Strike Squad": { combat: 10, speed: 6, body: 4, health: 1, ebbRating: 0 },
  "Kick Murder": { strength: 10, combat: 8, speed: 4, health: 2, ebbRating: 0 },
  Scouting: { speed: 10, intellect: 4, combat: 6, fear: 2, ebbRating: 0 },
  Investigation: { intellect: 10, fear: 6, sanity: 4, combat: 2, ebbRating: 0 },
  Media: { intellect: 8, fear: 6, sanity: 2, speed: 2, ebbRating: 0 },
  Medical: { intellect: 8, body: 6, sanity: 6, speed: 2, ebbRating: 0 },
  Mechanic: { intellect: 10, body: 2, combat: 2, sanity: 4, ebbRating: 0 },
  "Tech Ops": { intellect: 12, combat: 4, fear: 4, body: 2, ebbRating: 0 },
  Pilot: { speed: 8, intellect: 6, fear: 4, combat: 4, ebbRating: 0 },
  "Ebb Operative": { intellect: 8, fear: 8, sanity: 10, ebbRating: 2 }
};

const PACKAGE_GEAR = {
  "Death Squad": ["BOOPA Medical Kit (Standard)", "Restraint Cuffs (Heavy Duty)"],
  "Strike Squad": ["Flashbang Grenade", "Restraint Cuffs (Heavy Duty)"],
  "Kick Murder": ["BOOPA Medical Kit (Standard)"],
  Scouting: ["Grapple Gun", "Climbing Harness & Gear"],
  Investigation: ["Headset Communicator", "Restraint Cuffs (Heavy Duty)"],
  Media: ["Headset Communicator", "Klippo Multi-Band Communicator"],
  Medical: ["BOOPA Medical Kit (Advanced)", "Headset Communicator"],
  Mechanic: ["Headset Communicator", "Climbing Harness & Gear"],
  "Tech Ops": ["Headset Communicator", "Flashbang Grenade"],
  Pilot: ["Headset Communicator", "Climbing Harness & Gear"],
  "Ebb Operative": ["Headset Communicator", "BOOPA Medical Kit (Standard)"]
};

const SPECIES_DOSSIER = {
  Human: {
    identity: "Adaptable generalists. No racial extremes; their edge is flexibility and social access to SLA's systems.",
    fieldPressure: "Humans are expected to fill doctrine gaps, improvise, and absorb sponsor demands without complaint."
  },
  Frother: {
    identity: "Clan-human berserkers born with a physiological gift for combat drugs, violence, and recovery.",
    fieldPressure: "Keep them pointed at the problem and away from delicate evidence chains or sponsor-facing civilians."
  },
  Ebon: {
    identity: "Mystical, emotionally volatile Ebb users whose greatest strength is disciplined mental focus rather than physical resilience.",
    fieldPressure: "They are trusted when the mission needs calm precision, but every Flux spike is watched and every psychic event hits them harder."
  },
  "Brain Waster": {
    identity: "Violent evolutionary offshoots of the Ebon; hateful, aggressive Ebb users who are more dangerous in a fight than in a briefing room.",
    fieldPressure: "Command expects results fast, but collateral panic and the psychic shockwave around them are never far behind."
  },
  "Wraith Raider": {
    identity: "Feline ice-world hunters with lightning reflexes, superior senses, and the fastest natural movement profile in the World of Progress.",
    fieldPressure: "Use them for pursuit, flank work, and live target acquisition before a scene turns static or heavily scripted."
  },
  Shaktar: {
    identity: "Saurian warriors of honour and martial tradition, combining brutal strength with disciplined battlefield intent.",
    fieldPressure: "Doctrine has to respect their code or the squad risks discipline fractures at the worst possible time."
  },
  "Stormer 313 Malice": {
    identity: "Karma's standard biogenetic combat unit: a massive regenerating killing machine with overwhelming power and minimal subtlety.",
    fieldPressure: "They solve breaches, riots, and hard resistance, but subtlety evaporates when they take the lead."
  },
  "Stormer 711 Xeno": {
    identity: "Karma's fast insectile camouflage unit: a stealth biogen built for pursuit, ambush, and pressure from impossible angles.",
    fieldPressure: "Best used where speed and feral pressure matter more than conversation or sponsor optics."
  },
  "Advanced Carrien": {
    identity: "Cunning, dangerous mutants with strong survival instincts and an uneasy fit inside official structures.",
    fieldPressure: "They thrive in broken districts and dirty jobs, but prejudice follows them into every briefing room."
  },
  "Stormer Vevaphon": {
    identity: "Sleight Industries' cancelled polymorphic Stormer line: a shape-shifting bioweapon that can be anything the mission needs — and that is precisely the problem.",
    fieldPressure: "They are terrifying in infiltration, ambush, and close quarters, but every form change costs them a piece of who they are. Long ops risk unravelling them entirely."
  }
};

const SPECIES_MIN_WOUNDS = {
  Frother: 3,
  Shaktar: 3,
  "Stormer 313 Malice": 3,
  "Stormer 711 Xeno": 3,
  "Stormer Vevaphon": 3
};

const SKILL_IMAGE_OVERRIDES = {
  athletics: "systems/sla-mothership/images/sla-assets/Skills/Athletics.png",
  brawl: "systems/sla-mothership/images/sla-assets/Skills/Brawl.png"
};

const SPECIES_MOTHERSHIP_PROFILES = {
  Human: {
    rolls: {
      strength: "2d10+25",
      speed: "2d10+25",
      intellect: "2d10+27",
      combat: "2d10+25",
      sanity: "2d10+15",
      fear: "2d10+13",
      body: "2d10+10",
      health: "1d10+10"
    },
    description: "Baseline human template with a slight Intellect and Sanity edge reflecting bureaucracy, social resilience, and operational flexibility."
  },
  Frother: {
    rolls: {
      strength: "2d10+33",
      speed: "2d10+28",
      intellect: "2d10+20",
      combat: "2d10+35",
      sanity: "2d10+2",
      fear: "2d10+15",
      body: "2d10+20",
      health: "1d10+12"
    },
    description: "Extreme Strength, Combat, and Body with a weak Intellect line and dangerously fragile Sanity. Frothers are terror weapons, not balanced operatives."
  },
  Ebon: {
    rolls: {
      strength: "2d10+20",
      speed: "2d10+25",
      intellect: "2d10+37",
      combat: "2d10+22",
      sanity: "2d10+5",
      fear: "2d10+14",
      body: "2d10+5",
      health: "1d10+9"
    },
    description: "Exceptional Intellect backed by weak Strength and Body. Ebons solve impossible problems through Ebb discipline, not brute force."
  },
  "Brain Waster": {
    rolls: {
      strength: "2d10+28",
      speed: "2d10+25",
      intellect: "2d10+33",
      combat: "2d10+32",
      sanity: "2d10+13",
      fear: "2d10+10",
      body: "2d10+13",
      health: "1d10+10"
    },
    description: "A harsher Ebb profile than Ebon: stronger, more aggressive, and more immediately dangerous, but socially and psychically corrosive."
  },
  "Wraith Raider": {
    rolls: {
      strength: "2d10+25",
      speed: "2d10+40",
      intellect: "2d10+28",
      combat: "2d10+33",
      sanity: "2d10+7",
      fear: "2d10+18",
      body: "2d10+12",
      health: "1d10+10"
    },
    description: "The speed apex among natural species. Wraith Raiders react, pursue, and strike before most opponents have processed the danger."
  },
  Shaktar: {
    rolls: {
      strength: "2d10+37",
      speed: "2d10+30",
      intellect: "2d10+20",
      combat: "2d10+37",
      sanity: "2d10+18",
      fear: "2d10+20",
      body: "2d10+22",
      health: "1d10+12"
    },
    description: "A front-line martial species with exceptional Strength, Combat, and Body backed by formidable Sanity and Fear saves."
  },
  "Stormer 313 Malice": {
    rolls: {
      strength: "2d10+43",
      speed: "2d10+30",
      intellect: "2d10+17",
      combat: "2d10+40",
      sanity: "2d10+20",
      fear: "2d10+22",
      body: "2d10+25",
      health: "1d10+14"
    },
    description: "Near-ceiling assault biology: immense Strength, Combat, and Body with deliberately shallow abstract reasoning and social finesse."
  },
  "Stormer 711 Xeno": {
    rolls: {
      strength: "2d10+30",
      speed: "2d10+40",
      intellect: "2d10+23",
      combat: "2d10+35",
      sanity: "2d10+15",
      fear: "2d10+17",
      body: "2d10+18",
      health: "1d10+12"
    },
    description: "Matches Wraith Raider speed with biogen resilience, regeneration, and camouflage systems in place of natural grace."
  },
  "Advanced Carrien": {
    rolls: {
      strength: "2d10+30",
      speed: "2d10+26",
      intellect: "2d10+30",
      combat: "2d10+26",
      sanity: "2d10+14",
      fear: "2d10+14",
      body: "2d10+18",
      health: "1d10+11"
    },
    description: "Clever survivor profile. Strong Intellect and workable Strength make Carrien dangerous problem-solvers with uneven social acceptance."
  },
  "Stormer Vevaphon": {
    rolls: {
      strength:  "2d10+35",
      speed:     "2d10+28",
      intellect: "2d10+20",
      combat:    "2d10+35",
      sanity:    "2d10+12",
      fear:      "2d10+23",
      body:      "2d10+22",
      health:    "1d10+12"
    },
    description: "Polymorphic bioweapon with excellent combat and physical resilience, above-average speed, and severely degraded Sanity reflecting continuous identity diffusion from shapeshifting."
  }
};

const PACKAGE_DOCTRINE = {
  "Death Squad": {
    role: "overwhelming force",
    tone: "Direct-action eliminators for hard resistance, riot escalations, and kill-zone control.",
    fieldPressure: "Speed, violence, and intimidation matter more than subtle handling."
  },
  "Strike Squad": {
    role: "urban assault",
    tone: "Balanced entry teams built for Mort City raids, corridor pushes, and disciplined weapons work.",
    fieldPressure: "They are expected to hold angles, control civilians, and secure scenes fast."
  },
  "Kick Murder": {
    role: "melee suppression",
    tone: "Close-quarters shock operatives intended to break morale, not preserve comfort.",
    fieldPressure: "Best unleashed where crowd fear and brutal momentum are useful."
  },
  Scouting: {
    role: "recon and pursuit",
    tone: "Forward observers, trackers, and range specialists who keep squads from walking into bad ground.",
    fieldPressure: "Information advantage is the job; if they lose eyes on the field, everyone pays."
  },
  Investigation: {
    role: "evidence and interviews",
    tone: "Case-building operatives for forensic scenes, witness handling, and corporate narrative control.",
    fieldPressure: "Their work must survive review by sponsors, supervisors, and media parasites."
  },
  Media: {
    role: "image management",
    tone: "Public-facing operators who shape reputation, frame incidents, and turn action into sponsor capital.",
    fieldPressure: "They are judged as much by optics and access as by operational grit."
  },
  Medical: {
    role: "trauma sustainment",
    tone: "Combat medics and scene stabilisers who keep operatives alive long enough for extraction or continuation.",
    fieldPressure: "They are always one mistake away from becoming the last barrier before body bags."
  },
  Mechanic: {
    role: "repair and support",
    tone: "Field engineers who keep weapons, armour, doors, vehicles, and infrastructure functioning under pressure.",
    fieldPressure: "Every mission assumes their kit will fix the thing nobody else prepared for."
  },
  "Tech Ops": {
    role: "systems intrusion",
    tone: "Electronic warfare and specialist breach staff for locks, surveillance, and machine-facing problems.",
    fieldPressure: "They are expected to make sealed systems open and hostile tech obedient."
  },
  Pilot: {
    role: "navigation and mobility",
    tone: "Vehicle and route specialists who keep squads moving, extracting, and arriving faster than the opposition.",
    fieldPressure: "When transit fails, the mission usually fails with it."
  },
  "Ebb Operative": {
    role: "occult intervention",
    tone: "Specialist Ebb handlers brought in for psychic pressure, unseen threats, and impossible angles.",
    fieldPressure: "They carry the quiet burden of solving problems normal operatives cannot even describe."
  }
};

const BASE_ISSUE_GEAR = [
  "Oyster Card (ITB Card)",
  "Klippo Multi-Band Communicator",
  "UV / Multi-Spectrum Torch"
];

const PACKAGE_FIELD_KITS = {
  "Death Squad": ["Flashbang Grenade", "Webbing / Tactical Vest", "Cable Ties (Pack of 50)"],
  "Strike Squad": ["Flashbang Grenade", "Smoke Grenade", "Webbing / Tactical Vest"],
  "Kick Murder": ["Flashbang Grenade", "Entrenching Tool", "Duct Tape (Roll)"],
  Scouting: ["Binoculars (Tactical)", "Grapple Gun", "Climbing Harness & Gear", "Rope (50m, High-Tensile)"],
  Investigation: ["Forensic Kit", "Audio Recorder", "Evidence Bags (Pack of 20)", "Electronic Lockpick / Bypass Kit"],
  Media: ["Camera (Still/Video)", "Third Eye Viewer (Portable)", "Audio Recorder", "Vid-Phone (Portable)"],
  Medical: ["BOOPA Medical Kit (Advanced)", "Trauma Stabiliser", "Drug Hypo-Spray (Empty)"],
  Mechanic: ["Tool Kit (General)", "Tool Kit (Electronics)", "Equipment Case (Ruggedised)"],
  "Tech Ops": ["Electronic Lockpick / Bypass Kit", "Environment Scanner (Standard)", "Power Cell (Extended)"],
  Pilot: ["Compass (Magnetic)", "Binoculars (Standard)", "Operative Organiser"],
  "Ebb Operative": ["BOOPA (Audio)", "Operative Organiser", "Environment Scanner (Standard)"]
};

const EBB_STARTERS = {
  Ebon: ["Awareness", "Heal", "Protect"],
  "Brain Waster": ["Blast", "Telekinesis", "Awareness"]
};

const EBB_CORE_SKILLS = ["Biofeedback", "Formulate", "Ebb (Core)"];

const SPECIES_WEAPONS = {
  "Wraith Raider": ["Wraith Raider Claws"],
  Shaktar: ["Shaktar Claws"],
  "Stormer 313 Malice": ["Stormer Claws"],
  "Stormer 711 Xeno": ["Stormer Claws"],
  "Stormer Vevaphon": ["Morphic Strike"]
};

// Vevaphon morph form abilities — one is chosen at character creation as starting form.
// Each form grants stat bonuses and a special ability but costs 1 Instability when activated.
const VEVAPHON_MORPH_STARTERS = [
  {
    name: "Brute Form",
    summary: "A hulking, armoured chassis. STR+10, BODY+10. Immune to Knockdown. Cannot be concealed.",
    statMods: { strength: 10, body: 10 },
    special: "Knockdown Immunity",
    instabilityCost: 1,
    description: "The Vevaphon expands its frame into a dense combat shell. Slabs of biogenetic armour plate reinforce the torso and limbs. Effective in close-quarters breach work. Every activation costs 1 Instability."
  },
  {
    name: "Stalker Form",
    summary: "A lean, predatory chassis built for silence. SPD+10, Stealth+20. Cannot wear armour.",
    statMods: { speed: 10 },
    skillMods: { Stealth: 20 },
    special: "Armour Incompatible",
    instabilityCost: 1,
    description: "The Vevaphon elongates and flattens, redistributing mass for near-silent movement. Standard armour cannot bond to the shifting surface. Ideal for covert approach and ambush. Every activation costs 1 Instability."
  },
  {
    name: "Raptor Form",
    summary: "A fast striking chassis built around offensive output. COM+10, SPD+5. Attacks score one extra wound on a critical.",
    statMods: { combat: 10, speed: 5 },
    special: "Critical Wound Bonus",
    instabilityCost: 1,
    description: "The Vevaphon reshapes its strike limbs into natural weapons optimised for penetrating force. Designed for rapid target elimination at close range. Every activation costs 1 Instability."
  }
];

// Instability minor effects (triggered at 6+ Instability, rolled each scene)
const VEVAPHON_INSTABILITY_MINOR = [
  "Involuntary surface texturing — skin shifts pattern mid-conversation. Social rolls at -10.",
  "Limb proportions drift. Fine motor tasks at -10 until end of scene.",
  "Voice shifts register unexpectedly. Communications may be misidentified.",
  "Brief facial blurring. Anyone attempting to describe the Vevaphon gives contradictory reports.",
  "Pain from realignment. Take 1 point of Stress.",
  "Form flickers. One randomly selected stat drops by 5 until the Vevaphon rests."
];

// Instability Morph Panic table (triggered at 10+ Instability on a failed SANITY save)
const VEVAPHON_INSTABILITY_TABLE = [
  { roll: 1,  result: "Cascade Shift", effect: "Vevaphon immediately shifts to a random morph form, even mid-combat. Costs 1 additional Instability." },
  { roll: 2,  result: "Identity Bleed", effect: "Forgets assigned name and call sign until end of scene. Acts on instinct — GM adjudicates behaviour." },
  { roll: 3,  result: "Partial Lock", effect: "One limb freezes in incorrect form. -10 to all physical rolls using that limb." },
  { roll: 4,  result: "Tissue Rejection", effect: "Takes 1d5 damage as the body fights itself. Armour does not apply." },
  { roll: 5,  result: "Threat Imprint", effect: "Becomes locked on nearest visible target. Must make a Sanity save to perform any action not directed at that target." },
  { roll: 6,  result: "Full Reversion", effect: "Collapses to base form, losing all morph bonuses. Spends next action recovering. Lose 1 Instability." }
];

const NAME_PARTS = {
  first: [
    "Ari", "Bex", "Cade", "Dax", "Eris", "Finn", "Galen", "Hex", "Iris", "Jax",
    "Kara", "Lex", "Mara", "Nero", "Orla", "Pax", "Quill", "Riven", "Sable", "Tarn",
    "Vale", "Wren", "Xanthe", "Yorik", "Zane"
  ],
  last: [
    "Ash", "Black", "Cairn", "Drake", "Evans", "Flint", "Graves", "Holt", "Ives", "Kane",
    "Morrow", "Nox", "Pyke", "Quade", "Rook", "Shard", "Thorne", "Vale", "Voss", "Wren"
  ],
  callsign: [
    "Afterglow", "Ashfall", "Blackout", "Coldwire", "Deadfall", "Echo", "Fuse", "Ghost",
    "Grim", "Hush", "Ion", "Lancer", "Nightglass", "Quake", "Razor", "Static", "Torch", "Vanta"
  ],
  bpn: ["Blue", "White", "Grey", "Amber", "Red", "Black"]
};

let cachedSeedData = null;

export class SLAMothershipGenerator extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sla-mothership-generator",
      classes: ["mosh", "sheet", "actor", "character", "sla-generator"],
      template: "systems/sla-mothership/templates/dialogs/sla-character-generator.html",
      width: 640,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: true
    });
  }

  constructor(actor = null, options = {}) {
    super(actor ?? {}, options);
    this.actor = actor instanceof Actor ? actor : null;
  }

  get title() {
    return this.actor ? `SLA Generator: ${this.actor.name}` : "Create SLA Operative";
  }

  async getData() {
    const data = await SLAMothershipGenerator.loadSeedData();
    const speciesOptions = data.species.species.map((entry) => entry.name);
    const packageOptions = data.packages.packages.map((entry) => entry.name);
    const actorSystem = this.actor?.system ?? {};
    const actorSla = actorSystem.sla ?? {};

    const selectedSpecies = String(actorSla.species?.value ?? "").trim() || speciesOptions[0] || "Human";
    const speciesEntry = data.species.species.find((entry) => entry.name === selectedSpecies) ?? data.species.species[0] ?? null;
    const selectedPackage = String(actorSla.trainingPackage?.value ?? "").trim()
      || speciesEntry?.starterPackage
      || packageOptions[0]
      || "";
    const briefing = SLAMothershipGenerator.buildGeneratorBriefing(data, selectedSpecies, selectedPackage);

    return {
      actorName: this.actor?.name ?? "",
      name: this.actor?.name ?? SLAMothershipGenerator.randomName(),
      editingExisting: Boolean(this.actor),
      replaceExisting: true,
      selectedSpecies,
      selectedPackage,
      speciesOptions,
      packageOptions,
      employer: String(actorSla.employer?.value ?? "").trim() || "SLA Industries",
      sector: String(actorSla.sector?.value ?? "").trim() || "Mort City",
      operativeType: String(actorSla.operativeType?.value ?? "").trim() || "Contract Operative",
      assignLoadout: true,
      assignGear: true,
      assignEbb: briefing.isEbbSpecies,
      openSheet: true,
      briefing
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    const updateBriefing = async () => {
      const data = await SLAMothershipGenerator.loadSeedData();
      const speciesName = String(html.find("[name='species']").val() ?? "").trim();
      const packageName = String(html.find("[name='packageName']").val() ?? "").trim();
      const briefing = SLAMothershipGenerator.buildGeneratorBriefing(data, speciesName, packageName);
      const isEbbSpecies = briefing.isEbbSpecies;
      html.find("[data-briefing='species-title']").text(briefing.speciesTitle);
      html.find("[data-briefing='species-copy']").text(briefing.speciesCopy);
      html.find("[data-briefing='package-title']").text(briefing.packageTitle);
      html.find("[data-briefing='package-copy']").text(briefing.packageCopy);
      html.find("[data-briefing='flux-copy']").text(briefing.fluxCopy);
      html.find("[data-ebb-toggle]").toggle(isEbbSpecies);
      html.find("[data-ebb-panel]").toggle(isEbbSpecies);
      html.find("[name='assignEbb']").prop("disabled", !isEbbSpecies);
      if (!isEbbSpecies) {
        html.find("[name='assignEbb']").prop("checked", false);
      } else if (!html.find("[name='assignEbb']").is(":checked")) {
        html.find("[name='assignEbb']").prop("checked", true);
      }

      const speciesNotes = html.find("[data-briefing='species-notes']");
      speciesNotes.empty();
      for (const note of briefing.speciesNotes) {
        speciesNotes.append($(`<div class="sla-note-pill">${note}</div>`));
      }

      const packageSkills = html.find("[data-briefing='package-skills']");
      packageSkills.empty();
      for (const skill of briefing.packageSkills) {
        packageSkills.append($(`<div class="sla-note-pill">${skill}</div>`));
      }
    };

    html.find(".random-name").on("click", () => {
      html.find("[name='name']").val(SLAMothershipGenerator.randomName());
    });

    html.find("[name='species']").on("change", async (event) => {
      const data = await SLAMothershipGenerator.loadSeedData();
      const speciesName = String(event.currentTarget.value ?? "");
      const species = data.species.species.find((entry) => entry.name === speciesName);
      if (!species) return;

      const packageInput = html.find("[name='packageName']");
      packageInput.val(species.starterPackage ?? String(packageInput.val() ?? "").trim());
      html.find("[name='operativeType']").val(species.starterPackage || String(html.find("[name='operativeType']").val() ?? "").trim() || "Contract Operative");
      await updateBriefing();
    });

    html.find("[name='packageName']").on("change", async () => {
      const packageName = String(html.find("[name='packageName']").val() ?? "").trim();
      html.find("[name='operativeType']").val(packageName || String(html.find("[name='operativeType']").val() ?? "").trim() || "Contract Operative");
      await updateBriefing();
    });

    updateBriefing();
  }

  async _updateObject(_event, formData) {
    const data = foundry.utils.expandObject(formData);
    return SLAMothershipGenerator.generate({
      actor: this.actor,
      name: String(data.name ?? "").trim() || SLAMothershipGenerator.randomName(),
      speciesName: String(data.species ?? "").trim() || "Human",
      packageName: String(data.packageName ?? "").trim(),
      employer: String(data.employer ?? "").trim() || "SLA Industries",
      sector: String(data.sector ?? "").trim() || "Mort City",
      operativeType: String(data.operativeType ?? "").trim() || "Contract Operative",
      bpn: SLAMothershipGenerator.randomBpn(),
      replaceExisting: Boolean(data.replaceExisting),
      assignLoadout: Boolean(data.assignLoadout),
      assignGear: Boolean(data.assignGear),
      assignEbb: Boolean(data.assignEbb),
      openSheet: Boolean(data.openSheet)
    });
  }

  static open(actor = null, options = {}) {
    return new SLAMothershipGenerator(actor, options).render({ force: true });
  }

  static async createRandomOperative(options = {}) {
    const data = await this.loadSeedData();
    const requestedSpecies = new Set((options.speciesPool ?? []).map((entry) => String(entry ?? "").trim()).filter(Boolean));
    const filteredSpecies = requestedSpecies.size
      ? data.species.species.filter((entry) => requestedSpecies.has(entry.name))
      : data.species.species;
    const species = randomFrom(filteredSpecies.length ? filteredSpecies : data.species.species) ?? { name: "Human", starterPackage: "Strike Squad" };
    const packageName = species.starterPackage || randomFrom(data.packages.packages)?.name || "Strike Squad";
    return this.generate({
      name: this.randomName(),
      speciesName: species.name,
      packageName,
      employer: "SLA Industries",
      sector: "Mort City",
      operativeType: packageName,
      bpn: this.randomBpn(),
      replaceExisting: true,
      assignLoadout: true,
      assignGear: true,
      assignEbb: true,
      openSheet: options.openSheet ?? true
    });
  }

  static async createRandomEbbOperative(options = {}) {
    return this.createRandomOperative({
      ...options,
      speciesPool: ["Ebon", "Brain Waster"]
    });
  }

  static async createRandomNonEbbOperative(options = {}) {
    const data = await this.loadSeedData();
    const nonEbbSpecies = data.species.species
      .map((entry) => entry.name)
      .filter((name) => !this.isEbbSpecies(name));
    return this.createRandomOperative({
      ...options,
      speciesPool: nonEbbSpecies
    });
  }

  static async createStarterSquad({ overwrite = false, notify = true } = {}) {
    const folder = await ensureActorFolder();
    const presets = [
      { name: "Sable Morrow \"Static\"", speciesName: "Human", packageName: "Strike Squad", operativeType: "Strike Squad", bpn: "Blue" },
      { name: "Riven Holt \"Quiet\"", speciesName: "Human", packageName: "Investigation", operativeType: "Investigation", bpn: "White" },
      { name: "Tarn Voss \"Reef\"", speciesName: "Shaktar", packageName: "Death Squad", operativeType: "Death Squad", bpn: "Grey" },
      { name: "Iris Kane \"Halo\"", speciesName: "Ebon", packageName: "Ebb Operative", operativeType: "Ebb Operative", bpn: "Amber" }
    ];

    let created = 0;
    let updated = 0;

    for (const preset of presets) {
      const existing = game.actors.find((actor) => actor.flags?.[SYSTEM_ID]?.slaStarter === preset.name);
      if (existing && !overwrite) continue;

      const actor = existing ?? await Actor.create({
        name: preset.name,
        type: "character",
        folder: folder.id,
        flags: {
          [SYSTEM_ID]: {
            slaStarter: preset.name
          }
        }
      });

      await this.generate({
        actor,
        name: preset.name,
        speciesName: preset.speciesName,
        packageName: preset.packageName,
        operativeType: preset.operativeType,
        employer: "SLA Industries",
        sector: "Mort City",
        bpn: preset.bpn,
        replaceExisting: true,
        assignLoadout: true,
        assignGear: true,
        assignEbb: true,
        openSheet: false
      });

      if (!existing) created += 1;
      else updated += 1;
    }

    if (notify) {
      ui.notifications.info(`SLA starter squad ready: ${created} created, ${updated} updated.`);
    }
    return { created, updated };
  }

  static async generate({
    actor = null,
    name = "New Operative",
    speciesName = "Human",
    packageName = "",
    employer = "SLA Industries",
    sector = "Mort City",
    operativeType = "Contract Operative",
    bpn = "",
    replaceExisting = true,
    assignLoadout = true,
    assignGear = true,
    assignEbb = true,
    openSheet = true
  } = {}) {
    await this.ensureSeedData();

    const data = await this.loadSeedData();
    const species = data.species.species.find((entry) => entry.name === speciesName) ?? data.species.species[0];
    if (!species) throw new Error("No SLA species data available.");

    const resolvedPackageName = packageName || species.starterPackage || data.packages.packages[0]?.name || "";
    const trainingPackage = data.packages.packages.find((entry) => entry.name === resolvedPackageName) ?? data.packages.packages[0] ?? null;

    const actorDoc = actor instanceof Actor
      ? actor
      : await Actor.create({
          name,
          type: "character",
          folder: (await ensureActorFolder()).id
        });

    if (replaceExisting && actorDoc.items.size) {
      await actorDoc.deleteEmbeddedDocuments("Item", actorDoc.items.map((item) => item.id));
    }

    const rolls = await rollMothershipProfile(species);
    const derived = deriveProfile(rolls, trainingPackage?.name ?? "", species.name);
    const itemPayloads = [];

    if (trainingPackage) {
      itemPayloads.push(...this.buildSkillItems(trainingPackage.skills ?? [], species, data.skills.skills));
    }

    itemPayloads.push(...this.buildSpeciesItems(species.name));

    if (assignLoadout && trainingPackage) {
      itemPayloads.push(...this.buildLoadoutItems(trainingPackage.name, data.equipment.packageLoadouts ?? {}));
    }

    if (assignGear && trainingPackage) {
      itemPayloads.push(...this.buildGearItems(trainingPackage.name));
    }

    if (assignEbb && this.isEbbSpecies(species.name)) {
      itemPayloads.push(...this.buildEbbSkillItems(species.name));
      itemPayloads.push(...this.buildEbbItems(species.name));
    }

    if (species.name === "Stormer Vevaphon") {
      itemPayloads.push(...this.buildVevaphonItems(derived.startingMorphForm));
    }

    const uniquePayloads = uniqueEmbeddedItems(itemPayloads);
    const packageLoadout = getPackageLoadout(trainingPackage?.name ?? "", data.equipment.packageLoadouts ?? {});
    const packageIssueKit = getPackageIssueKit(trainingPackage?.name ?? "");

    const description = buildBiography({
      species,
      trainingPackage,
      rolls,
      derived,
      loadout: packageLoadout,
      issueKit: packageIssueKit
    });

    const updates = {
      name,
      img: actorDoc.img || this.resolveSpeciesImage(species.name),
      folder: actorDoc.folder?.id ?? (await ensureActorFolder()).id,
      "system.class.value": trainingPackage?.name ?? operativeType,
      "system.rank.value": species.name,
      "system.credits.value": Number(data.packages.startingCredits ?? 1500),
      "system.health.max": derived.health,
      "system.health.value": derived.health,
      "system.hits.max": SPECIES_MIN_WOUNDS[species.name] ?? 2,
      "system.hits.value": 0,
      "system.stats.strength.value": derived.strength,
      "system.stats.speed.value": derived.speed,
      "system.stats.intellect.value": derived.intellect,
      "system.stats.combat.value": derived.combat,
      "system.stats.sanity.value": derived.sanity,
      "system.stats.fear.value": derived.fear,
      "system.stats.body.value": derived.body,
      "system.other.stress.min": 2,
      "system.other.stress.value": 2,
      "system.other.stress.max": 20,
      "system.other.stress.label": "Stress",
      "system.sla.species.value": species.name,
      "system.sla.speciesNotes.value": buildSpeciesNotes(species).join("\n"),
      "system.sla.trainingPackage.value": trainingPackage?.name ?? "",
      "system.sla.packageSummary.value": buildPackageSummary(trainingPackage, packageLoadout, packageIssueKit),
      "system.sla.packageSkills.value": (trainingPackage?.skills ?? []).join(", "),
      "system.sla.packageWealth.value": String(trainingPackage?.wealth ?? ""),
      "system.sla.flux.value": this.isEbbSpecies(species.name) ? derived.fluxMax : 0,
      "system.sla.flux.min": 0,
      "system.sla.flux.max": this.isEbbSpecies(species.name) ? derived.fluxMax : 0,
      "system.sla.flux.label": "Flux",
      "system.sla.fluxStage.value": getFluxStage(this.isEbbSpecies(species.name) ? derived.fluxMax : 0, this.isEbbSpecies(species.name) ? derived.fluxMax : 0).label,
      "system.sla.operativeType.value": operativeType || trainingPackage?.name || "Contract Operative",
      "system.sla.bpn.value": bpn || this.randomBpn(),
      "system.sla.scl.value": Number(species.startingScl ?? 10),
      "system.sla.employer.value": employer,
      "system.sla.sector.value": sector,
      "system.sla.ebbRating.value": derived.ebbRating,
      "system.other.stressdesc.value": buildTraumaResponseText(species, trainingPackage),
      "system.sla.fluxNotes.value": this.isEbbSpecies(species.name)
        ? `Starting Flux reserve: ${derived.fluxMax} (rolled 20 + 1d10). Flux is randomised at creation (range 21–31). Spend from this reserve when channeling; Fear is the control save.`
        : "",
      "system.sla.ebbNotes.value": this.isEbbSpecies(species.name)
        ? `Starter discipline package: ${(EBB_STARTERS[species.name] ?? []).join(", ")}`
        : "",
      ...(species.name === "Stormer Vevaphon" ? {
        "system.sla.morphForm.value": derived.startingMorphForm ?? "Brute Form",
        "system.sla.vevaphonInstability.value": 0,
        "system.sla.vevaphonInstability.max": 12,
        "system.sla.vevaphonInstability.label": "Instability",
        "system.sla.morphNotes.value": buildVevaphonMorphNotes(derived.startingMorphForm)
      } : {}),
      "system.biography": description,
      "system.notes": buildNotes(species, trainingPackage, packageLoadout, packageIssueKit)
    };

    await actorDoc.update(updates);

    if (uniquePayloads.length) {
      await actorDoc.createEmbeddedDocuments("Item", uniquePayloads);
    }

    if (openSheet) {
      actorDoc.sheet?.render(true);
    }

    ui.notifications.info(
      `SLA operative ready: ${actorDoc.name} (${species.name}${trainingPackage ? ` / ${trainingPackage.name}` : ""})`
    );

    return {
      actor: actorDoc,
      species: species.name,
      trainingPackage: trainingPackage?.name ?? "",
      rolls,
      derived
    };
  }

  static buildSkillItems(packageSkills, species, allSkillData) {
    const skillDocs = packageSkills
      .map((name, index) => {
        const worldItem = findWorldItem(name, "skill");
        if (!worldItem) return null;

        const embedded = toEmbeddedData(worldItem);
        const base = Number(worldItem.system?.bonus ?? 0) || 0;
        const packageBonus = index < 3 ? 15 : 10;
        embedded.system.bonus = Math.max(base, packageBonus);
        embedded.system.rank = rankFromBonus(embedded.system.bonus);
        embedded.system.sla ??= {};
        embedded.system.sla.baseBonus = base;
        embedded.system.sla.packageBonus = Math.max(0, Number(embedded.system.bonus ?? 0) - base);
        const skillImg = getSkillImageOverride(embedded.name);
        if (skillImg) embedded.img = skillImg;
        return embedded;
      })
      .filter(Boolean);

    const byName = new Map(skillDocs.map((item) => [normalizeText(item.name), item]));
    const speciesBonuses = [...(species.skillBonuses ?? [])];

    if (species.name === "Human" && !speciesBonuses.length) {
      const humanChoices = chooseHumanBonuses(packageSkills, allSkillData);
      for (const skillRef of humanChoices) {
        speciesBonuses.push({ skillRef, bonus: 10 });
      }
    }

    for (const bonus of speciesBonuses) {
      const key = normalizeText(bonus.skillRef);
      let embedded = byName.get(key);
      if (!embedded) {
        const worldItem = findWorldItem(bonus.skillRef, "skill");
        if (!worldItem) continue;
        embedded = toEmbeddedData(worldItem);
        embedded.system.bonus = Math.max(0, Number(worldItem.system?.bonus ?? 0) || 0);
        embedded.system.rank = rankFromBonus(embedded.system.bonus);
        embedded.system.sla ??= {};
        embedded.system.sla.baseBonus = Number(worldItem.system?.bonus ?? 0) || 0;
        embedded.system.sla.packageBonus = Math.max(0, Number(embedded.system.bonus ?? 0) - Number(embedded.system.sla.baseBonus ?? 0));
        const skillImg = getSkillImageOverride(embedded.name);
        if (skillImg) embedded.img = skillImg;
        skillDocs.push(embedded);
        byName.set(key, embedded);
      }
      embedded.system.bonus = Math.max(0, Number(embedded.system.bonus ?? 0) + Number(bonus.bonus ?? 0));
      embedded.system.rank = rankFromBonus(embedded.system.bonus);
      embedded.system.sla ??= {};
      embedded.system.sla.speciesBonus = Number(embedded.system.sla.speciesBonus ?? 0) + Number(bonus.bonus ?? 0);
    }

    return skillDocs;
  }

  static buildLoadoutItems(packageName, packageLoadouts) {
    const loadout = packageLoadouts?.[packageName];
    if (!loadout) return [];

    const items = [];
    for (const name of loadout.weapons ?? []) {
      const doc = findWorldItem(name, "weapon");
      if (doc) items.push(toEmbeddedData(doc));
    }
    for (const name of loadout.armour ?? []) {
      const doc = findWorldItem(name, "armor");
      if (doc) items.push(toEmbeddedData(doc));
    }
    return items;
  }

  static buildGearItems(packageName) {
    const names = [
      ...BASE_ISSUE_GEAR,
      ...(PACKAGE_GEAR[packageName] ?? []),
      ...(PACKAGE_FIELD_KITS[packageName] ?? [])
    ];
    return uniqueBy(names, (entry) => normalizeText(entry))
      .map((name) => findWorldItem(name, "item"))
      .filter(Boolean)
      .map((item) => toEmbeddedData(item));
  }

  static buildEbbItems(speciesName) {
    const abilityNames = EBB_STARTERS[speciesName] ?? [];
    return abilityNames
      .map((name) => findWorldItem(name, "ability"))
      .filter(Boolean)
      .map((item) => toEmbeddedData(item));
  }

  static buildEbbSkillItems(speciesName) {
    const skillNames = [...EBB_CORE_SKILLS];
    const starterAbilities = EBB_STARTERS[speciesName] ?? [];
    for (const abilityName of starterAbilities) {
      skillNames.push(`Ebb ${abilityName}`);
    }

    return uniqueBy(skillNames, (entry) => normalizeText(entry))
      .map((name) => findWorldItem(name, "skill"))
      .filter(Boolean)
      .map((item) => {
        const embedded = toEmbeddedData(item);
        embedded.system.bonus = Math.max(Number(embedded.system?.bonus ?? 0), 10);
        embedded.system.rank = rankFromBonus(embedded.system.bonus);
        const skillImg = getSkillImageOverride(embedded.name);
        if (skillImg) embedded.img = skillImg;
        return embedded;
      });
  }

  static buildSpeciesItems(speciesName) {
    return (SPECIES_WEAPONS[speciesName] ?? [])
      .map((name) => findWorldItem(name, "weapon"))
      .filter(Boolean)
      .map((item) => toEmbeddedData(item));
  }

  static buildVevaphonItems(startingMorphForm) {
    const items = [];
    // Try to add all three morph form abilities from the world item compendium.
    // They may or may not exist as world items — we fall back to building minimal
    // ability documents directly if not found.
    for (const morph of VEVAPHON_MORPH_STARTERS) {
      const worldItem = findWorldItem(morph.name, "ability");
      if (worldItem) {
        const embedded = toEmbeddedData(worldItem);
        // Always ensure morphForm flag is set — prevents Ebb enforcement from deleting these
        embedded.system ??= {};
        embedded.system.sla ??= {};
        embedded.system.sla.morphForm = true;
        embedded.system.sla.isStartingForm = morph.name === startingMorphForm;
        items.push(embedded);
      } else {
        // Build a minimal ability document so the character isn't empty-handed.
        items.push({
          name: morph.name,
          type: "ability",
          img: "icons/svg/upgrade.svg",
          system: {
            description: morph.description,
            summary: morph.summary,
            special: morph.special,
            sla: {
              morphForm: true,
              instabilityCost: morph.instabilityCost,
              statMods: morph.statMods ?? {},
              skillMods: morph.skillMods ?? {},
              isStartingForm: morph.name === startingMorphForm
            }
          }
        });
      }
    }
    return items;
  }

  static isEbbSpecies(speciesName) {
    return ["Ebon", "Brain Waster"].includes(String(speciesName ?? ""));
  }

  static buildGeneratorBriefing(data, speciesName, packageName) {
    const species = data.species.species.find((entry) => entry.name === speciesName) ?? data.species.species[0] ?? { name: "Human", notes: [] };
    const trainingPackage = data.packages.packages.find((entry) => entry.name === packageName)
      ?? data.packages.packages.find((entry) => entry.name === species.starterPackage)
      ?? data.packages.packages[0]
      ?? null;
    const starterAbilities = EBB_STARTERS[species.name] ?? [];
    const issueKit = getPackageIssueKit(trainingPackage?.name ?? "");
    const loadout = getPackageLoadout(trainingPackage?.name ?? "", data.equipment.packageLoadouts ?? {});
    const speciesNotes = buildSpeciesNotes(species);
    const dossier = getSpeciesDossier(species);

    return {
      speciesTitle: species.name,
      speciesCopy: species.starterPackage
        ? `${dossier.identity} Starter package: ${species.starterPackage}.`
        : "No default starter package is assigned.",
      speciesNotes,
      packageTitle: trainingPackage?.name ?? "No Package",
      packageCopy: trainingPackage
        ? `${buildPackageSummary(trainingPackage, loadout, issueKit)}`
        : "Choose a package to see loadout and focus notes.",
      packageSkills: trainingPackage?.skills?.length ? trainingPackage.skills.slice(0, 8) : ["No package skills listed yet."],
      isEbbSpecies: this.isEbbSpecies(species.name),
      fluxCopy: this.isEbbSpecies(species.name)
        ? `This operative will receive a Flux track, Fear-based control saves, and starter Ebb abilities: ${starterAbilities.join(", ")}.`
        : "This operative uses standard Stress rules only. Flux and the Ebb tab stay hidden unless the species is Ebon or Brain Waster."
    };
  }

  static resolveSpeciesImage(speciesName) {
    return findWorldItem(speciesName, "item")?.img ?? "icons/svg/mystery-man.svg";
  }

  static randomName() {
    const first = randomFrom(NAME_PARTS.first) ?? "Sable";
    const last = randomFrom(NAME_PARTS.last) ?? "Morrow";
    const callsign = randomFrom(NAME_PARTS.callsign) ?? "Static";
    return `${first} ${last} "${callsign}"`;
  }

  static randomBpn() {
    return `${randomFrom(NAME_PARTS.bpn) ?? "Blue"} BPN`;
  }

  static async ensureSeedData() {
    const hasSkills = game.items.some((item) => item.flags?.[SYSTEM_ID]?.slaSeed?.kind === "skill");
    if (hasSkills) return;
    if (!game.slaMothershipCompendium?.seedWorld) {
      throw new Error("SLA Mothership Companion is required to seed world content.");
    }
    await game.slaMothershipCompendium.seedWorld({ overwrite: false, notify: true });
  }

  static async loadSeedData() {
    if (cachedSeedData) return cachedSeedData;

    const readJson = async (name) => {
      const response = await fetch(`modules/${COMPANION_MODULE_ID}/sla-data/${name}`);
      if (!response.ok) throw new Error(`Failed loading ${name}`);
      return response.json();
    };

    cachedSeedData = {
      species: await readJson("species.json"),
      packages: await readJson("training-packages.json"),
      equipment: await readJson("equipment.json"),
      skills: await readJson("skills.json")
    };

    return cachedSeedData;
  }
}

async function ensureActorFolder() {
  let root = game.folders.find((folder) => folder.type === "Actor" && folder.name === ROOT_ACTOR_FOLDER && !folder.folder);
  if (!root) {
    root = await Folder.create({ name: ROOT_ACTOR_FOLDER, type: "Actor", color: "#163447" });
  }

  let folder = game.folders.find((entry) => entry.type === "Actor" && entry.name === OPERATIVE_FOLDER && entry.folder?.id === root.id);
  if (!folder) {
    folder = await Folder.create({ name: OPERATIVE_FOLDER, type: "Actor", folder: root.id, color: "#49708a" });
  }
  return folder;
}

async function rollMothershipProfile(species) {
  const out = {};
  const profile = getSpeciesMothershipProfile(species);
  const formulas = {
    ...(profile.rolls ?? {}),
    ...(species?.mothershipStats ?? {})
  };
  for (const [key, formula] of Object.entries(formulas ?? {})) {
    out[key] = await rollFormula(String(formula ?? "").trim());
  }
  return out;
}

async function rollFormula(formula) {
  if (!formula) return 0;
  const normalized = formula.toLowerCase().replace(/\s+/g, "");
  const roll = await new Roll(normalized).evaluate();
  return Number(roll.total ?? 0) || 0;
}

function deriveProfile(rolls, packageName, speciesName) {
  const mods = PACKAGE_STAT_BONUSES[packageName] ?? {};
  const strength = Number(rolls.strength ?? 35);
  const speed = Number(rolls.speed ?? 35);
  const intellect = Number(rolls.intellect ?? 35);
  const combat = Number(rolls.combat ?? 35);
  const sanity = Number(rolls.sanity ?? 20);
  const fear = Number(rolls.fear ?? 20);
  const body = Number(rolls.body ?? 20);
  const health = Number(rolls.health ?? 10);

  const profile = {
    strength: clamp(Math.round(strength + Number(mods.strength ?? 0)), 15, 85),
    speed: clamp(Math.round(speed + Number(mods.speed ?? 0)), 15, 85),
    intellect: clamp(Math.round(intellect + Number(mods.intellect ?? 0)), 15, 90),
    combat: clamp(Math.round(combat + Number(mods.combat ?? 0)), 15, 90),
    sanity: clamp(Math.round(sanity + Number(mods.sanity ?? 0)), 10, 90),
    fear: clamp(Math.round(fear + Number(mods.fear ?? 0)), 10, 90),
    body: clamp(Math.round(body + Number(mods.body ?? 0)), 10, 90),
    health: clamp(Math.round(health + Number(mods.health ?? 0)), 5, 30),
    ebbRating: 0,
    fluxMax: 0
  };

  if (["Ebon", "Brain Waster"].includes(speciesName)) {
    profile.ebbRating = clamp(Math.ceil(profile.intellect / 20) + Number(mods.ebbRating ?? 0), 1, 8);
    // Starting flux: 20 + 1d10 (range 21–31), randomised at character creation
    const fluxRoll = Math.floor(Math.random() * 11) + 1; // 1–11 → simulates d10 with extended top end
    profile.fluxMax = 20 + fluxRoll; // 21–31
  }

  if (speciesName === "Stormer Vevaphon") {
    // Instability starts at 0. Pick a random starting morph form.
    profile.morphInstability = 0;
    const morphIndex = Math.floor(Math.random() * VEVAPHON_MORPH_STARTERS.length);
    profile.startingMorphForm = VEVAPHON_MORPH_STARTERS[morphIndex].name;
  }

  return profile;
}

function chooseHumanBonuses(packageSkills, allSkillData) {
  const pool = packageSkills.length
    ? [...packageSkills]
    : (allSkillData ?? []).map((entry) => entry.name);
  return shuffle(pool).slice(0, 3);
}

function buildBiography({ species, trainingPackage, rolls, derived, loadout = null, issueKit = [] }) {
  const profileRows = [
    ["STR", rolls.strength],
    ["SPD", rolls.speed],
    ["INT", rolls.intellect],
    ["COM", rolls.combat],
    ["SAN", rolls.sanity],
    ["FEAR", rolls.fear],
    ["BODY", rolls.body],
    ["HEALTH", rolls.health]
  ]
    .map(([key, value]) => `${key} ${value}`)
    .join(", ");
  const notes = buildSpeciesNotes(species).map((entry) => `<li>${entry}</li>`).join("");
  const doctrine = getPackageDoctrine(trainingPackage?.name ?? "");
  const loadoutLines = describeLoadout(loadout);
  const issueKitLine = issueKit.length ? `<p><strong>Issue Kit:</strong> ${issueKit.join(", ")}</p>` : "";
  const doctrineLine = doctrine.tone ? `<p><strong>Package Doctrine:</strong> ${doctrine.tone}</p>` : "";

  return `
    <p><strong>Species:</strong> ${species.name}</p>
    <p><strong>Training Package:</strong> ${trainingPackage?.name ?? "Unassigned"}</p>
    ${doctrineLine}
    ${loadoutLines ? `<p><strong>Loadout:</strong> ${loadoutLines}</p>` : ""}
    ${issueKitLine}
    <p><strong>Mothership Profile Rolls:</strong> ${profileRows}</p>
    <p><strong>Final Profile:</strong> STR ${derived.strength}, SPD ${derived.speed}, INT ${derived.intellect}, COM ${derived.combat}, SAN ${derived.sanity}, FEAR ${derived.fear}, BODY ${derived.body}, HEALTH ${derived.health}</p>
    ${notes ? `<p><strong>Species Notes</strong></p><ul>${notes}</ul>` : ""}
  `;
}

function buildNotes(species, trainingPackage, loadout = null, issueKit = []) {
  const dossier = getSpeciesDossier(species);
  const doctrine = getPackageDoctrine(trainingPackage?.name ?? "");
  const lines = [
    `Species starter package: ${species.starterPackage ?? "n/a"}`,
    `Assigned package: ${trainingPackage?.name ?? "n/a"}`,
    dossier.identity ? `Species profile: ${dossier.identity}` : null,
    dossier.fieldPressure ? `Species pressure: ${dossier.fieldPressure}` : null,
    doctrine.tone ? `Package doctrine: ${doctrine.tone}` : null,
    doctrine.fieldPressure ? `Package pressure: ${doctrine.fieldPressure}` : null,
    describeLoadout(loadout) ? `Loadout: ${describeLoadout(loadout)}` : null,
    issueKit.length ? `Issue kit: ${issueKit.join(", ")}` : null
  ];
  return lines.filter(Boolean).join("\n");
}

function buildPackageSummary(trainingPackage, loadout = null, issueKit = []) {
  if (!trainingPackage) return "";
  const doctrine = getPackageDoctrine(trainingPackage.name);
  const focus = (trainingPackage.skills ?? []).slice(0, 4).join(", ");
  const loadoutText = describeLoadout(loadout);
  const issueText = issueKit.length ? `Issue kit: ${issueKit.slice(0, 3).join(", ")}.` : "";
  return `${trainingPackage.wealth ?? "Standard"} access. ${doctrine.role ? `${doctrine.role}. ` : ""}${doctrine.tone ? `${doctrine.tone} ` : ""}Focus: ${focus}.${loadoutText ? ` Loadout: ${loadoutText}.` : ""} ${issueText}`.trim();
}

function getFluxStage(flux, maxFlux = 0) {
  const value = Math.max(0, Number(flux ?? 0) || 0);
  const max = Math.max(0, Number(maxFlux ?? 0));
  const ratio = max > 0 ? Math.max(0, max - value) / max : 0;
  if (max > 0 && ratio > 1) return { label: "Catastrophic", text: "Flux has overrun the user. Panic fallout is imminent." };
  if (max > 0 && ratio >= 0.75) return { label: "Breach", text: "Most of the Flux reserve has been burned. Offensive Ebb is likely to trigger panic fallout." };
  if (max > 0 && ratio >= 0.5) return { label: "Frayed", text: "The reserve is running down. Failed Fear saves on Ebb use should be treated as panic events." };
  if (max > 0 && ratio >= 0.25) return { label: "Charged", text: "A meaningful chunk of Flux has been spent. Stay cautious and keep the Fear save clean." };
  return { label: "Stable", text: "Flux reserves are healthy. Ebb use remains disciplined and contained." };
}

function buildVevaphonMorphNotes(startingMorphForm) {
  const form = VEVAPHON_MORPH_STARTERS.find((entry) => entry.name === startingMorphForm) ?? VEVAPHON_MORPH_STARTERS[0];
  const allForms = VEVAPHON_MORPH_STARTERS.map((entry) => `${entry.name}: ${entry.summary}`).join("\n");
  return [
    `Starting Morph Form: ${form.name}`,
    `${form.description}`,
    ``,
    `Available Forms:`,
    allForms,
    ``,
    `Instability (0–12): Each morph activation costs 1 Instability. At 6+, minor effects trigger each scene. At 10+, failed Sanity saves trigger Morph Panic. At 12, the Vevaphon is lost — immediate retirement or death.`,
    ``,
    `Minor Effects (6+ Instability):`,
    VEVAPHON_INSTABILITY_MINOR.join("\n"),
    ``,
    `Morph Panic Table (10+ Instability, failed Sanity):`,
    VEVAPHON_INSTABILITY_TABLE.map((entry) => `${entry.roll}. ${entry.result}: ${entry.effect}`).join("\n")
  ].join("\n");
}

function buildTraumaResponseText(species, trainingPackage) {
  return buildSlaTraumaResponseText(species?.name ?? "", trainingPackage?.name ?? "");
}

function getSpeciesDossier(species) {
  if (species && typeof species === "object") {
    const fallback = SPECIES_DOSSIER[species.name] ?? { identity: "", fieldPressure: "" };
    return {
      identity: species.identity ?? fallback.identity ?? "",
      fieldPressure: species.fieldPressure ?? fallback.fieldPressure ?? ""
    };
  }
  return SPECIES_DOSSIER[species] ?? { identity: "", fieldPressure: "" };
}

function getSpeciesMothershipProfile(species) {
  if (species && typeof species === "object") {
    const fallback = SPECIES_MOTHERSHIP_PROFILES[species.name] ?? SPECIES_MOTHERSHIP_PROFILES.Human;
    return {
      rolls: {
        ...(fallback.rolls ?? {}),
        ...(species.mothershipStats ?? {})
      },
      description: species.mothershipDescription ?? fallback.description ?? ""
    };
  }
  return SPECIES_MOTHERSHIP_PROFILES[species] ?? SPECIES_MOTHERSHIP_PROFILES.Human;
}

function buildSpeciesNotes(species) {
  const dossier = getSpeciesDossier(species);
  const profile = getSpeciesMothershipProfile(species);
  return uniqueBy(
    [
      dossier.identity,
      dossier.fieldPressure,
      profile.description,
      ...((species?.specialRules ?? []).map((rule) => `Special Rule - ${rule.label}: ${rule.summary}`)),
      ...(species?.notes ?? [])
    ].filter(Boolean),
    (entry) => normalizeText(entry)
  );
}

function getPackageDoctrine(packageName) {
  return PACKAGE_DOCTRINE[packageName] ?? { role: "", tone: "", fieldPressure: "" };
}

function getPackageIssueKit(packageName) {
  return PACKAGE_FIELD_KITS[packageName] ?? [];
}

function getPackageLoadout(packageName, packageLoadouts = {}) {
  if (!packageName) return null;
  const direct = packageLoadouts?.[packageName];
  if (direct) return direct;

  const key = normalizeText(packageName);
  const matchedKey = Object.keys(packageLoadouts ?? {}).find((entry) => normalizeText(entry).includes(key) || key.includes(normalizeText(entry)));
  return matchedKey ? packageLoadouts[matchedKey] : null;
}

function describeLoadout(loadout) {
  if (!loadout) return "";
  const parts = [];
  if ((loadout.weapons ?? []).length) {
    parts.push(`Weapons: ${(loadout.weapons ?? []).join(", ")}`);
  }
  if ((loadout.armour ?? []).length) {
    parts.push(`Armour: ${(loadout.armour ?? []).join(", ")}`);
  }
  return parts.join(" | ");
}

function toEmbeddedData(document) {
  const data = document.toObject();
  delete data._id;
  delete data.folder;
  delete data.sort;
  delete data.pack;
  delete data.ownership;
  return data;
}

function getSkillImageOverride(name = "") {
  return SKILL_IMAGE_OVERRIDES[normalizeText(name).replace(/\s+/g, "")] ?? null;
}

function findWorldItem(name, type = null) {
  const key = normalizeText(name);
  return game.items.find((item) => normalizeText(item.name) === key && (!type || item.type === type)) ?? null;
}

function rankFromBonus(bonus) {
  if (bonus >= 20) return "Master";
  if (bonus >= 15) return "Expert";
  if (bonus >= 10) return "Trained";
  if (bonus > 0) return "Basic";
  return "Untrained";
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value ?? 0)));
}

function randomFrom(values) {
  if (!values?.length) return null;
  return values[Math.floor(Math.random() * values.length)];
}

function shuffle(values) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [out[index], out[swap]] = [out[swap], out[index]];
  }
  return out;
}

function uniqueBy(values, keyFn) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    const key = keyFn(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function uniqueEmbeddedItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.type}:${normalizeText(item.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
