export const SLA_SPECIES_BALANCE_VERSION = "2026-03-23-species-balance-1";

export const SLA_SPECIES_STAT_ADJUSTMENTS = {
  Human: { sanity: 15, fear: 20 },
  Frother: { fear: 20, body: 5 },
  Ebon: { intellect: 10, sanity: 20 },
  "Brain Waster": { intellect: 10, sanity: 20 },
  "Wraith Raider": { sanity: 15 },
  Shaktar: { body: 10, fear: 20 },
  "Stormer 313 Malice": { fear: 25 },
  "Stormer 711 Xeno": { fear: 25 }
};

export function getSlaSpeciesStatAdjustments(speciesName = "") {
  return SLA_SPECIES_STAT_ADJUSTMENTS[String(speciesName ?? "").trim()] ?? {};
}
