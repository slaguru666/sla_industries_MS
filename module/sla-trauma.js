const SPECIES_TRAUMA_PROFILES = {
  Human: {
    mode: "Corporate Override",
    trigger: "they take Stress, lose control of a scene, or see the plan slipping",
    positive: "Allies in Close range may either clear 1 Stress or gain +5 on their next coordinated roll.",
    negative: "The operative becomes rigid and command-dependent; independent social or creative action is at -10 until someone reasserts the plan.",
    session: "Invoke sponsor discipline to reroll one failed Command, Bureaucracy, or Fear-related test, but afterwards a superior, sponsor, or handler is owed a concession."
  },
  Frother: {
    mode: "Red Mist Containment",
    trigger: "they are wounded, restrained, denied a charge lane, or chemically overstimulated",
    positive: "One ally can immediately surge with them, gaining +10 on the next melee, Brawl, or forced-entry action.",
    negative: "The nearest ally or bystander takes 1 Stress, loses cover, or has to scramble clear as the Frother's violence spills outward.",
    session: "Ignore wound penalties for one combat round and close distance immediately, then gain 1d5 Stress when the surge burns out."
  },
  Ebon: {
    mode: "Quiet Flux",
    trigger: "they absorb psychic shock, intense grief, or impossible sensory information",
    positive: "A nearby ally gains calm focus: clear 1 Stress, stabilize a Fear response, or take +10 on one careful action.",
    negative: "Reality hushes around the Ebon; nearby allies feel the pressure and take -5 on their next impulsive or noisy action.",
    session: "Open a moment of lucid stillness that lets one ally reroll a failed mental check, but the Ebon immediately gains 1d5 Stress."
  },
  "Brain Waster": {
    mode: "Predatory Backwash",
    trigger: "they smell weakness, take psychic pain, or sense prey escaping the kill",
    positive: "Nearby allies gain ruthless momentum: +5 on their next attack against the same target or an immediate free reposition toward the threat.",
    negative: "The psychic splash is ugly. Allies in Close range take 1 Stress or hesitate before acting aggressively near the Brain Waster.",
    session: "Force the scene into a kill-focus: one target becomes obvious and allies gain +10 to attack it for a round, but everyone nearby knows the Brain Waster is slipping."
  },
  "Wraith Raider": {
    mode: "Predator Snap",
    trigger: "they are cornered, lose sight of prey, or are forced into static formation",
    positive: "One ally may immediately shift position, dive for flank, or gain +10 on the next pursuit, ambush, or precision shot.",
    negative: "The Wraith peels away from the group instinctively; squad cohesion frays and nearby allies lose the benefit of tight formation or overwatch.",
    session: "Exploit a predatory opening to act first against one exposed threat, but the Wraith must commit to that line and cannot hold the broader objective at the same time."
  },
  Shaktar: {
    mode: "Honour Lock",
    trigger: "their code is insulted, an ally falls dishonourably, or a duel-worthy threat emerges",
    positive: "An ally gains steadiness from the Shaktar's presence: +10 on one defensive, leadership, or hold-the-line action.",
    negative: "The Shaktar becomes bound to the obvious challenge and resists compromise, retreat, or deception until the honour issue is addressed.",
    session: "Declare a martial vow against a target or objective; the Shaktar gains +10 while pursuing it, but cannot willingly abandon that vow without taking 1d5 Stress."
  },
  "Stormer 313 Malice": {
    mode: "Breach Engine",
    trigger: "they hit hard resistance, suffer visible injury, or are treated as the blunt solution",
    positive: "Allies nearby may immediately press the breach: gain +10 on one push, suppress, or shock-entry action this round.",
    negative: "Subtlety collapses. Nearby operatives lose finesse; social, stealth, or delicate technical actions are at -10 while the Stormer dominates the scene.",
    session: "Turn the response into overwhelming mass: ignore knockback, restraint, and hesitation for one round, but every nearby ally or witness reads the escalation instantly."
  },
  "Stormer 711 Xeno": {
    mode: "Stalker Reflex",
    trigger: "they are observed too clearly, lose camouflage, or feel prey slipping through a net",
    positive: "One ally can immediately reposition, hide, or line up a crossfire with +10 on the next attack from concealment.",
    negative: "The Xeno's inhuman movement shakes the team; allies in sight take -5 on their next social or comms-dependent action.",
    session: "Explode into hunting movement and gain a free stealth or flank reposition, but all nearby friendlies know exactly how unnatural that burst looked."
  },
  "Advanced Carrien": {
    mode: "Scavenger Adaptation",
    trigger: "they are cornered, cut off from resources, or forced into open contempt from others",
    positive: "One ally may improvise from the Carrien's instinct: reroll a Streetwise, survival, theft, or dirty-fix style action.",
    negative: "Trust drops fast. Nearby allies become suspicious, losing confidence in promises, command, or clean procedure until results appear.",
    session: "Turn desperation into advantage by producing an ugly but effective solution; it works once, but leaves a social stain or material mess behind."
  }
};

const PACKAGE_TRAUMA_PROFILES = {
  "Death Squad": {
    doctrine: "hard elimination doctrine and breach-line pressure",
    positive: "The response naturally supports direct violence, suppression, and target deletion.",
    negative: "Non-combat options shrink fast; restraint, mercy, and evidence care become secondary.",
    session: "Mark one hostile or kill-zone. Allies who commit to it gain +10 for one round, but any collateral or intimidation fallout is amplified."
  },
  "Strike Squad": {
    doctrine: "tight team movement, entry discipline, and controlled force",
    positive: "The response strengthens covering arcs, shield work, and clean squad timing.",
    negative: "Breaking formation feels like failure; the operative resists improvisation that pulls them off the team rhythm.",
    session: "Call a formation snap. Up to two allies may immediately reposition or gain +5 to their next disciplined action, but everyone becomes more predictable for a round."
  },
  "Kick Murder": {
    doctrine: "close violence, intimidation, and spectacle-driven aggression",
    positive: "The response rewards momentum, fear projection, and brutal follow-through in close quarters.",
    negative: "Collateral intimidation rises immediately; delicate witnesses, civilians, or weak-willed allies are rattled.",
    session: "Turn panic into a public display of violence. Gain +10 on one melee or intimidation burst, but someone nearby remembers how ugly it looked."
  },
  Scouting: {
    doctrine: "pursuit, overwatch, live target acquisition, and flank discipline",
    positive: "The response sharpens lines of sight, pursuit instincts, and exploit-the-gap movement.",
    negative: "The operative starts thinking like a lone hunter and can drift away from the wider squad objective.",
    session: "Name an escape route, rooftop, blind corner, or kill lane; one ally can exploit it immediately, but the operative becomes fixated on that line until it resolves."
  },
  Investigation: {
    doctrine: "evidence control, witness handling, and structured pressure",
    positive: "The response helps lock onto motive, contradiction, or one critical clue others are missing.",
    negative: "The operative becomes obsessed with one read, suspect, or theory and can miss broader battlefield cues.",
    session: "Call out the key pattern in the chaos and grant +10 to one search, read, or interrogation move, but if it is wrong the whole scene loses tempo."
  },
  Media: {
    doctrine: "camera awareness, narrative control, and audience-facing posture",
    positive: "The response can seize attention, redirect blame, and create a dramatic moment that helps the team.",
    negative: "Everything starts to feel performative; truth, caution, and privacy suffer when the spotlight instinct takes over.",
    session: "Take control of the scene's narrative for one beat: gain +10 to one social pivot or broadcast action, but someone important sees the mask slip."
  },
  Medical: {
    doctrine: "casualty triage, harm reduction, and keeping people functional",
    positive: "The response immediately prioritizes stabilization, pain control, and keeping others in the fight.",
    negative: "The operative can overcommit to one casualty or moral triage call and neglect the tactical picture.",
    session: "Declare emergency triage authority: one ally may ignore a penalty or clear 1d5 Stress, but someone else is necessarily deprioritized."
  },
  Mechanic: {
    doctrine: "repair under pressure, jury-rig resilience, and practical continuity",
    positive: "The response spots what can still be made to work and buys the team one more functioning moment.",
    negative: "The operative starts treating people like systems; empathy and soft judgment degrade while the fix obsession takes hold.",
    session: "Force one broken plan, device, or route to function one more time, but it becomes unstable, noisy, or impossible to hide."
  },
  "Tech Ops": {
    doctrine: "systems dominance, tactical feed control, and hostile tech exploitation",
    positive: "The response sharpens data interpretation, sensor control, and battlefield command through information.",
    negative: "The operative overrelies on systems, feeds, or assumptions and becomes brittle if the data picture changes.",
    session: "Call a systems spike: one allied action may count as perfectly timed intel support, but afterwards the local network, drone, or feed is compromised."
  },
  Pilot: {
    doctrine: "vehicle survival, route discipline, and momentum through movement",
    positive: "The response favours speed, extraction thinking, and preserving an exit line for the team.",
    negative: "The operative becomes route-fixated and can prioritise escape or movement over mission nuance.",
    session: "Name the extraction vector. One ally may immediately move, mount up, or gain +10 on a vehicle-related action, but abandoning that route becomes psychologically harder."
  },
  "Ebb Operative": {
    doctrine: "psychic composure, hidden pressure, and the disciplined use of the Ebb",
    positive: "The response can calm or focus another operative through eerie certainty, attention, or psychic poise.",
    negative: "Everyone nearby feels that something is not normal; fear, suspicion, or social strain rises even when the effect helps.",
    session: "Declare a single controlled surge of unnatural clarity: reroll one mental or Ebb-linked failure, but mark the scene as visibly touched by the Ebb."
  }
};

function fallbackSpecies(speciesName = "") {
  return SPECIES_TRAUMA_PROFILES[speciesName] ?? SPECIES_TRAUMA_PROFILES.Human;
}

function fallbackPackage(packageName = "") {
  return PACKAGE_TRAUMA_PROFILES[packageName] ?? PACKAGE_TRAUMA_PROFILES["Strike Squad"];
}

export function buildSlaTraumaProfile(speciesName = "", packageName = "") {
  const species = fallbackSpecies(speciesName);
  const trainingPackage = fallbackPackage(packageName);
  const resolvedSpecies = String(speciesName ?? "").trim() || "Human";
  const resolvedPackage = String(packageName ?? "").trim() || "Strike Squad";

  return {
    key: `${resolvedSpecies}::${resolvedPackage}`,
    title: `${resolvedSpecies} / ${resolvedPackage}: ${species.mode}`,
    trigger: `When ${species.trigger} during ${trainingPackage.doctrine}.`,
    positive: `${species.positive} ${trainingPackage.positive}`,
    negative: `${species.negative} ${trainingPackage.negative}`,
    session: `${species.session} ${trainingPackage.session}`,
    summary: `${species.mode} shaped by ${resolvedPackage} doctrine.`
  };
}

export function buildSlaTraumaResponseText(speciesName = "", packageName = "") {
  const profile = buildSlaTraumaProfile(speciesName, packageName);
  const species = fallbackSpecies(speciesName);
  const trainingPackage = fallbackPackage(packageName);
  const firstSentence = (value = "") => {
    const text = String(value ?? "").trim();
    if (!text) return "";
    const match = text.match(/^.*?[.!?](?:\s|$)/);
    return (match?.[0] ?? text).trim();
  };
  const compactClause = (value = "") => firstSentence(value)
    .replace(/, but .*$/i, ".")
    .replace(/; .*$/i, ".")
    .replace(/\s+/g, " ")
    .trim();
  return [
    `${profile.title}`,
    `+ ${compactClause(species.positive)} ${compactClause(trainingPackage.positive)}`.trim(),
    `- ${compactClause(species.negative)} ${compactClause(trainingPackage.negative)}`.trim(),
    `1/Session: ${compactClause(species.session)} ${compactClause(trainingPackage.session)}`.trim()
  ].join("\n");
}

export function buildAllSlaTraumaProfiles(speciesNames = [], packageNames = []) {
  const resolvedSpecies = speciesNames.length ? speciesNames : Object.keys(SPECIES_TRAUMA_PROFILES);
  const resolvedPackages = packageNames.length ? packageNames : Object.keys(PACKAGE_TRAUMA_PROFILES);
  const out = [];
  for (const speciesName of resolvedSpecies) {
    for (const packageName of resolvedPackages) {
      out.push(buildSlaTraumaProfile(speciesName, packageName));
    }
  }
  return out;
}
