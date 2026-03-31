const SLA_TRAIT_DEFINITIONS = {
  "addiction-compulsion": { label: "Addiction / Compulsion", type: "disadvantage", maxRank: 3, summary: "Unmet condition applies -10% per rank to rolls.", aliases: ["addiction/compulsion", "addiction compulsion", "compulsion", "addiction"] },
  "allergy": { label: "Allergy", type: "disadvantage", maxRank: 3, summary: "Exposure applies CON and physical penalties; severe rank tracks hazard pressure.", aliases: ["allergy"] },
  "anger": { label: "Anger", type: "disadvantage", maxRank: 1, summary: "Attacked state enforces behavioural pressure and tactical focus penalty.", aliases: ["anger"] },
  "anxiety": { label: "Anxiety", type: "disadvantage", maxRank: 3, summary: "COOL and fear SAN penalties (-10% per rank).", aliases: ["anxiety"] },
  "arrogant": { label: "Arrogant", type: "disadvantage", maxRank: 1, summary: "Social penalty vs equal or lower SCL contexts.", aliases: ["arrogant"] },
  "chicken": { label: "Chicken", type: "disadvantage", maxRank: 1, summary: "COOL cap reduction and first-combat hesitation pressure.", aliases: ["chicken"] },
  "debt": { label: "Debt", type: "disadvantage", maxRank: 3, summary: "Economic pressure tracked; rank 3 adds Bureaucracy audit strain.", aliases: ["debt"] },
  "depression": { label: "Depression", type: "disadvantage", maxRank: 3, summary: "Communication penalty (-10% per rank) with extra SAN-linked pressure.", aliases: ["depression"] },
  "drug-addict": { label: "Drug Addict", type: "disadvantage", maxRank: 3, summary: "Withdrawal penalties to physical, COOL, and SAN rolls.", aliases: ["drug addict", "drug-addict"] },
  "enemy": { label: "Enemy", type: "disadvantage", maxRank: 4, summary: "Narrative antagonist trigger; no flat roll modifier by default.", aliases: ["enemy"] },
  "illness": { label: "Illness", type: "disadvantage", maxRank: 3, summary: "Scoped penalties when active; severe ranks retain long-term pressure.", aliases: ["illness"] },
  "pacifist": { label: "Pacifist", type: "disadvantage", maxRank: 1, summary: "Combat attacks require nerve; initiative pressure favours going last.", aliases: ["pacifist"] },
  "phobia": { label: "Phobia", type: "disadvantage", maxRank: 3, summary: "Exposure applies COOL penalties; severe rank flags immediate SAN pressure.", aliases: ["phobia"] },
  "poor-hearing": { label: "Poor Hearing", type: "disadvantage", maxRank: 2, summary: "Listen penalty (-10% per rank).", aliases: ["poor hearing", "poor-hearing"] },
  "poor-vision": { label: "Poor Vision", type: "disadvantage", maxRank: 2, summary: "Spot and ranged-vision penalties in scoped cases.", aliases: ["poor vision", "poor-vision"] },
  "psychosis": { label: "Psychosis", type: "disadvantage", maxRank: 3, summary: "Active scoped instability penalties with rank scaling.", aliases: ["psychosis"] },
  "unattractive": { label: "Unattractive", type: "disadvantage", maxRank: 2, summary: "Appearance-social penalty (-10% per rank).", aliases: ["unattractive"] },
  "ambidextrous": { label: "Ambidextrous", type: "advantage", maxRank: 1, summary: "Off-hand combat penalty suppression when relevant.", aliases: ["ambidextrous"] },
  "attractive": { label: "Attractive", type: "advantage", maxRank: 2, summary: "Appearance-social bonus (+10% per rank).", aliases: ["attractive"] },
  "contact": { label: "Contact", type: "advantage", maxRank: 4, summary: "Once-per-session leverage or aid when invoked.", aliases: ["contact"] },
  "exceedingly-cool": { label: "Exceedingly Cool", type: "advantage", maxRank: 1, summary: "COOL cap boost and once-per-session automatic nerve hook.", aliases: ["exceedingly cool", "exceedingly-cool"] },
  "good-hearing": { label: "Good Hearing", type: "advantage", maxRank: 2, summary: "Listen bonus (+10% per rank).", aliases: ["good hearing", "good-hearing"] },
  "good-vision": { label: "Good Vision", type: "advantage", maxRank: 2, summary: "Spot Hidden bonus (+10% per rank).", aliases: ["good vision", "good-vision"] },
  "good-housing": { label: "Good Housing", type: "advantage", maxRank: 2, summary: "Downtime recovery bonus and better living conditions.", aliases: ["good housing", "good-housing"] },
  "natural-aptitude-skill": { label: "Natural Aptitude: Skill", type: "advantage", maxRank: 3, summary: "Once-per-session failed-skill reroll support.", aliases: ["natural aptitude: skill", "natural aptitude skill", "natural-aptitude-skill"] },
  "natural-aptitude-stat": { label: "Natural Aptitude: Stat", type: "advantage", maxRank: 1, summary: "Selected characteristic gets a max+1 equivalent edge.", aliases: ["natural aptitude: stat", "natural aptitude stat", "natural-aptitude-stat"] },
  "savings": { label: "Savings", type: "advantage", maxRank: 3, summary: "Economic reserve trait tracked narratively.", aliases: ["savings"] },
  "poor-housing": { label: "Poor Housing", type: "disadvantage", maxRank: 2, summary: "Downtime recovery penalty and poorer living conditions.", aliases: ["poor housing", "poor-housing"] },
  "sterile": { label: "Sterile", type: "disadvantage", maxRank: 1, summary: "Narrative-only biological consequence.", aliases: ["sterile"] }
};

const MUTUALLY_EXCLUSIVE = [
  ["chicken", "exceedingly-cool"]
];

function normalizeTraitName(value = "") {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildAliasMap() {
  const map = new Map();
  for (const [key, def] of Object.entries(SLA_TRAIT_DEFINITIONS)) {
    map.set(normalizeTraitName(key), key);
    map.set(normalizeTraitName(def.label ?? key), key);
    for (const alias of def.aliases ?? []) {
      map.set(normalizeTraitName(alias), key);
    }
  }
  return map;
}

const TRAIT_ALIAS_MAP = buildAliasMap();

export function getSlaTraitDefinition(name = "") {
  const key = TRAIT_ALIAS_MAP.get(normalizeTraitName(name)) ?? normalizeTraitName(name);
  return { key, definition: SLA_TRAIT_DEFINITIONS[key] ?? null };
}

export function getSlaTraitOptionsByType(type = "") {
  const normalized = String(type ?? "").trim().toLowerCase();
  return Object.entries(SLA_TRAIT_DEFINITIONS)
    .filter(([, definition]) => String(definition?.type ?? "").trim().toLowerCase() === normalized)
    .map(([key, definition]) => ({
      key,
      label: String(definition?.label ?? key),
      maxRank: Math.max(1, Number(definition?.maxRank ?? 1) || 1),
      summary: String(definition?.summary ?? "")
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildSlaTraitRows(items = []) {
  return (items ?? []).map((item) => {
    const { key, definition } = getSlaTraitDefinition(item?.name ?? "");
    const rank = Math.max(1, Number(item?.system?.base ?? item?.system?.rank ?? 1) || 1);
    const maxRank = Math.max(1, Number(definition?.maxRank ?? rank) || rank);
    return {
      ...item,
      slaTrait: {
        key,
        rank,
        maxRank,
        type: String(definition?.type ?? item?.system?.sla?.traitType ?? "unknown"),
        status: definition ? "Mapped" : "Unmapped",
        effectSummary: String(definition?.summary ?? item?.system?.description ?? "No automation summary is available for this trait yet.")
      }
    };
  }).sort((a, b) => String(a?.name ?? "").localeCompare(String(b?.name ?? "")));
}

export function validateSlaTraitRows(traitRows = []) {
  const report = {
    ok: true,
    errors: [],
    warnings: [],
    duplicates: [],
    invalidRanks: [],
    conflicts: [],
    rankBalance: {
      advantageRanks: 0,
      disadvantageRanks: 0,
      neutralRanks: 0,
      net: 0,
      balanced: true
    },
    coverage: {
      mapped: 0,
      unmapped: 0
    }
  };

  const byKey = new Map();

  for (const row of traitRows) {
    const key = String(row?.slaTrait?.key ?? "").trim();
    const rank = Math.max(1, Number(row?.slaTrait?.rank ?? 1) || 1);
    const maxRank = Math.max(1, Number(row?.slaTrait?.maxRank ?? 1) || 1);
    const type = String(row?.slaTrait?.type ?? "unknown").trim().toLowerCase();

    if (key) byKey.set(key, (byKey.get(key) ?? 0) + 1);
    if (rank > maxRank) {
      report.invalidRanks.push(`${row?.name ?? key} (${rank}/${maxRank})`);
    }

    if (type === "advantage") report.rankBalance.advantageRanks += rank;
    else if (type === "disadvantage") report.rankBalance.disadvantageRanks += rank;
    else report.rankBalance.neutralRanks += rank;

    if (row?.slaTrait?.status === "Mapped") report.coverage.mapped += 1;
    else report.coverage.unmapped += 1;
  }

  for (const [key, count] of byKey.entries()) {
    if (count > 1) report.duplicates.push(`${key} x${count}`);
  }

  for (const [left, right] of MUTUALLY_EXCLUSIVE) {
    if (byKey.has(left) && byKey.has(right)) {
      report.conflicts.push(`${left} vs ${right}`);
    }
  }

  report.rankBalance.net = report.rankBalance.advantageRanks - report.rankBalance.disadvantageRanks;
  report.rankBalance.balanced = report.rankBalance.net === 0;

  if (report.invalidRanks.length) report.errors.push(`Invalid ranks: ${report.invalidRanks.join(", ")}`);
  if (report.conflicts.length) report.errors.push(`Mutually exclusive traits detected: ${report.conflicts.join(", ")}`);
  if (report.duplicates.length) report.warnings.push(`Duplicate trait entries detected: ${report.duplicates.join(", ")}`);
  if (!report.rankBalance.balanced) {
    report.errors.push(`Trait rank balance mismatch: advantages ${report.rankBalance.advantageRanks} vs disadvantages ${report.rankBalance.disadvantageRanks} (net ${report.rankBalance.net >= 0 ? "+" : ""}${report.rankBalance.net}).`);
  }
  if (report.coverage.unmapped > 0) {
    report.warnings.push(`${report.coverage.unmapped} trait entries are not mapped to the restored SLA trait catalogue yet.`);
  }

  report.ok = report.errors.length === 0;
  return report;
}
