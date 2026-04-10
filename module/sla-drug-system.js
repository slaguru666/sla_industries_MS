const SYSTEM_ID = "sla-mothership";
const COMPANION_MODULE_ID = "sla-mothership-compendium";
const DRUG_FLAG_PATH = `${SYSTEM_ID}.slaDrug`;
const ADDICTION_ICON = "systems/sla-mothership/images/sla-assets/Traits/drug-addict.png";

let cachedDrugData = null;
let drugReminderIntervalId = null;

export class SLADrugSystem {
  static async loadDrugData() {
    if (cachedDrugData) return cachedDrugData;
    const response = await fetch(`modules/${COMPANION_MODULE_ID}/sla-data/drugs.json`);
    if (!response.ok) {
      throw new Error("Failed loading SLA drug data.");
    }
    cachedDrugData = await response.json();
    return cachedDrugData;
  }

  static normalize(value = "") {
    return String(value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  }

  static isFrother(actor) {
    return this.normalize(actor?.system?.sla?.species?.value ?? "") === "frother";
  }

  static isEbbUser(actor) {
    return ["ebon", "brainwaster"].includes(this.normalize(actor?.system?.sla?.species?.value ?? ""));
  }

  static async getDrugDefinition(drugRef) {
    const data = await this.loadDrugData();
    if (drugRef && typeof drugRef === "object" && drugRef.id) {
      return data.drugs.find((entry) => entry.id === drugRef.id) ?? null;
    }
    const normalized = this.normalize(drugRef);
    return data.drugs.find((entry) => entry.id === normalized || this.normalize(entry.name) === normalized) ?? null;
  }

  static async getDrugDefinitionFromItem(item) {
    if (!item) return null;
    const directId = item.flags?.[SYSTEM_ID]?.slaDrug?.id ?? item.system?.sla?.drugId ?? "";
    const fromId = await this.getDrugDefinition(directId);
    if (fromId) return fromId;
    return this.getDrugDefinition(item.name);
  }

  static getDrugEffectFlag(effect) {
    return effect?.flags?.[SYSTEM_ID]?.slaDrug ?? null;
  }

  static async resolveExpiredEffects(actor) {
    if (!actor) return;
    await this.migrateLegacyDrugEffects(actor);
    const now = Date.now();
    for (const effect of actor.effects ?? []) {
      const flag = this.getDrugEffectFlag(effect);
      if (!flag?.expiresAt) continue;
      if (Number(flag.expiresAt) > now) continue;
      await effect.delete();
    }
  }

  static getRemainingLabel(effect) {
    const flag = this.getDrugEffectFlag(effect);
    if (!flag) return "";
    if (!flag.expiresAt) {
      return flag.manualOnly ? "Manual" : "";
    }
    const remainingMs = Math.max(0, Number(flag.expiresAt) - Date.now());
    const totalSeconds = Math.ceil(remainingMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  static getStatModifierTitles(actor) {
    const stats = {
      strength: [],
      speed: [],
      intellect: [],
      combat: [],
      sanity: [],
      fear: [],
      body: []
    };

    for (const effect of actor?.effects ?? []) {
      const flag = this.getDrugEffectFlag(effect);
      const source = flag?.drugId ? `${effect.name}` : `${effect.name ?? "Effect"}`;
      for (const change of effect.changes ?? []) {
        const match = String(change.key ?? "").match(/^system\.stats\.(strength|speed|intellect|combat|sanity|fear|body)\.mod$/);
        if (!match) continue;
        const statKey = match[1];
        const value = Number(change.value ?? 0);
        if (!value) continue;
        stats[statKey].push(`${source}: ${value >= 0 ? `+${value}` : value}`);
      }
    }

    return Object.fromEntries(
      Object.entries(stats).map(([key, entries]) => [
        key,
        entries.length ? entries.join("\n") : "No active modifiers."
      ])
    );
  }

  static clearReminderLoop() {
    if (drugReminderIntervalId) {
      clearInterval(drugReminderIntervalId);
      drugReminderIntervalId = null;
    }
  }

  static startReminderLoop() {
    this.clearReminderLoop();
    if (!game.user?.isGM || game.system?.id !== SYSTEM_ID) return;
    const minutes = Math.max(0, Number(game.settings.get(SYSTEM_ID, "drugReminderMinutes") ?? 0) || 0);
    if (!minutes) return;

    drugReminderIntervalId = window.setInterval(() => {
      this.postActiveDrugReminder().catch((error) => console.error(`${SYSTEM_ID} | Drug reminder failed`, error));
    }, minutes * 60 * 1000);
  }

  static async postActiveDrugReminder() {
    if (!game.user?.isGM || game.system?.id !== SYSTEM_ID) return;

    const rows = [];
    for (const actor of game.actors?.filter((entry) => entry.type === "character") ?? []) {
      await this.resolveExpiredEffects(actor);
      for (const effect of actor.effects ?? []) {
        const flag = this.getDrugEffectFlag(effect);
        if (!flag || !["active", "pending", "withdrawal", "withdrawal-check"].includes(flag.stage)) continue;
        const def = await this.getDrugDefinition(flag.drugId);
        rows.push({
          actor: actor.name,
          drug: def?.name ?? effect.name,
          state: flag.stage,
          duration: this.getRemainingLabel(effect) || "Manual",
          summary: String(flag.summary ?? "")
        });
      }
    }

    if (!rows.length) return;

    const stateLabelMap = {
      active: "Active",
      pending: "Pending",
      withdrawal: "Withdrawal",
      "withdrawal-check": "Withdrawal Check"
    };

    const content = `
      <div class="mosh sla-chat-card" style="padding:10px;border:1px solid #1e2d39;border-radius:8px;background:linear-gradient(180deg, rgba(17, 27, 36, 0.98), rgba(26, 40, 51, 0.98));color:#eff3f7;">
        <div class="sla-chat-title" style="font-family:'Josefin Sans','Roboto',sans-serif;text-transform:uppercase;letter-spacing:0.12em;font-size:0.72rem;font-weight:700;color:#f3efe6;">Active Drug Reminder</div>
        ${rows.map((row) => `
          <div class="sla-chat-copy" style="margin-top:6px;line-height:1.45;color:#f3efe6;font-family:'Josefin Sans','Roboto',sans-serif;">
            <strong>${row.actor}</strong>: ${row.drug} (${stateLabelMap[row.state] ?? row.state}) - ${row.duration}
            ${row.summary ? `<br>${row.summary}` : ""}
          </div>
        `).join("")}
      </div>
    `;

    await ChatMessage.create({
      user: game.user.id,
      whisper: ChatMessage.getWhisperRecipients("GM").map((user) => user.id),
      content
    });
  }

  static async migrateLegacyDrugEffects(actor) {
    const updates = [];
    for (const effect of actor?.effects ?? []) {
      const flag = this.getDrugEffectFlag(effect);
      if (!flag) continue;
      const migratedChanges = (effect.changes ?? []).map((change) => {
        if (typeof change.key === "string" && change.key.startsWith("system.stats.") && change.key.endsWith(".value")) {
          return { ...change, key: change.key.replace(/\.value$/, ".mod"), value: String(change.value ?? 0) };
        }
        if (typeof change.value !== "string") {
          return { ...change, value: String(change.value ?? "") };
        }
        return change;
      });
      const changed = JSON.stringify(migratedChanges) !== JSON.stringify(effect.changes ?? []);
      if (changed) {
        updates.push({ _id: effect.id, changes: migratedChanges });
      }
    }
    if (updates.length) {
      await actor.updateEmbeddedDocuments("ActiveEffect", updates);
    }
  }

  static getActorDrugEffects(actor, drugId = "") {
    const normalized = this.normalize(drugId);
    return (actor?.effects ?? []).filter((effect) => {
      const flag = this.getDrugEffectFlag(effect);
      if (!flag?.drugId) return false;
      if (!normalized) return true;
      return this.normalize(flag.drugId) === normalized;
    });
  }

  static async getActorOverview(actor) {
    await this.resolveExpiredEffects(actor);
    const alerts = [];
    const rows = [];

    for (const item of actor?.items ?? []) {
      if (item.type !== "drug") continue;
      const def = await this.getDrugDefinitionFromItem(item);
      if (!def) continue;
      const effects = this.getActorDrugEffects(actor, def.id);
      const active = effects.find((effect) => this.getDrugEffectFlag(effect)?.stage === "active");
      const pending = effects.find((effect) => this.getDrugEffectFlag(effect)?.stage === "pending");
      const withdrawalCheck = effects.find((effect) => this.getDrugEffectFlag(effect)?.stage === "withdrawal-check");
      const withdrawal = effects.find((effect) => this.getDrugEffectFlag(effect)?.stage === "withdrawal");
      const effect = active ?? pending ?? withdrawalCheck ?? withdrawal ?? null;
      const stage = this.getDrugEffectFlag(effect)?.stage ?? "inactive";
      const statusLabelMap = {
        active: "Active",
        pending: "Pending",
        "withdrawal-check": "Withdrawal Check",
        withdrawal: "Withdrawal",
        inactive: "Ready"
      };
      const summary = stage === "withdrawal"
        ? String(def.withdrawalSummary ?? "")
        : String(def.activeSummary ?? "");
      const row = {
        id: item.id,
        itemId: item.id,
        name: item.name,
        img: item.img,
        quantity: Number(item.system?.quantity ?? 0),
        cost: Number(item.system?.cost ?? def.cost ?? 0),
        drugId: def.id,
        category: def.category,
        rating: def.rating,
        duration: effect ? this.getRemainingLabel(effect) : String(def.durationLabel ?? ""),
        status: stage,
        statusLabel: statusLabelMap[stage] ?? "Ready",
        summary,
        canUse: Number(item.system?.quantity ?? 0) > 0,
        canClose: Boolean(effect)
      };
      rows.push(row);
      if (effect) {
        alerts.push({
          itemId: item.id,
          drugId: def.id,
          name: def.name,
          state: stage,
          stateLabel: row.statusLabel,
          duration: row.duration,
          summary
        });
      }
    }

    alerts.sort((left, right) => {
      const leftScore = left.state === "active" ? 0 : left.state === "pending" ? 1 : 2;
      const rightScore = right.state === "active" ? 0 : right.state === "pending" ? 1 : 2;
      if (leftScore !== rightScore) return leftScore - rightScore;
      return String(left.name).localeCompare(String(right.name));
    });

    return { alerts, rows };
  }

  static createEffectChanges(def, actor, stage = "active") {
    const changes = [];
    const statBonuses = stage === "withdrawal"
      ? (def.withdrawal?.statBonuses ?? {})
      : (def.effects?.statBonuses ?? {});
    const statPaths = {
      strength: "system.stats.strength.mod",
      speed: "system.stats.speed.mod",
      intellect: "system.stats.intellect.mod",
      combat: "system.stats.combat.mod",
      sanity: "system.stats.sanity.mod",
      fear: "system.stats.fear.mod",
      body: "system.stats.body.mod"
    };

    for (const [key, path] of Object.entries(statPaths)) {
      const value = Number(statBonuses?.[key] ?? 0);
      if (!value) continue;
      changes.push({ key: path, mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(value) });
    }

    if (stage === "active" && this.isFrother(actor) && Number(def.effects?.frotherCombatBonus ?? 0)) {
      changes.push({
        key: "system.stats.combat.mod",
        mode: CONST.ACTIVE_EFFECT_MODES.ADD,
        value: String(Number(def.effects.frotherCombatBonus))
      });
    }

    if (stage === "withdrawal") {
      const woundTier = Math.max(1, Number(actor?.system?.hits?.value ?? 0) + 1);
      const healthPenalty = Number(def.withdrawal?.healthMaxPenaltyPerWoundTier ?? 0) * woundTier;
      if (healthPenalty) {
        changes.push({
          key: "system.health.max",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(-healthPenalty)
        });
      }
      const woundMaxPenalty = Number(def.withdrawal?.woundMaxPenalty ?? 0);
      if (woundMaxPenalty) {
        changes.push({
          key: "system.hits.max",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(-woundMaxPenalty)
        });
      }
      const fluxMaxPenalty = Number(def.withdrawal?.fluxMaxPenalty ?? 0);
      if (fluxMaxPenalty) {
        changes.push({
          key: "system.sla.flux.max",
          mode: CONST.ACTIVE_EFFECT_MODES.ADD,
          value: String(-fluxMaxPenalty)
        });
      }
    }

    return changes;
  }

  static buildEffectData(def, actor, item, stage = "active", extra = {}) {
    const now = Date.now();
    const isPending = stage === "pending";
    const durationSeconds = isPending
      ? Math.max(0, Number(def.durationSeconds ?? 0))
      : stage === "withdrawal-check"
        ? Math.max(0, Number(def.addiction?.withdrawalCheckSeconds ?? 86400))
        : stage === "withdrawal"
          ? Math.max(0, Number(def.withdrawal?.durationSeconds ?? 0))
          : Math.max(0, Number(def.durationSeconds ?? 0));
    const expiresAt = durationSeconds > 0 ? now + durationSeconds * 1000 : 0;
    const changes = this.createEffectChanges(def, actor, stage);
    const labels = {
      active: `${def.name} Active`,
      pending: `${def.name} Pending`,
      "withdrawal-check": `${def.name} Withdrawal Check`,
      withdrawal: `${def.name} Withdrawal`
    };
    const summary = stage === "withdrawal"
      ? String(def.withdrawalSummary ?? "")
      : stage === "withdrawal-check"
        ? "Withdrawal check pending after 24 hours without a fresh dose."
        : String(def.activeSummary ?? "");

    return {
      name: labels[stage] ?? def.name,
      icon: item?.img || def.img || "icons/consumables/potions/potion-round-corked-red.webp",
      img: item?.img || def.img || "icons/consumables/potions/potion-round-corked-red.webp",
      changes,
      disabled: false,
      duration: durationSeconds > 0 ? { seconds: durationSeconds } : {},
      flags: {
        [SYSTEM_ID]: {
          slaDrug: {
            drugId: def.id,
            sourceItemId: item?.id ?? "",
            stage,
            startedAt: now,
            expiresAt,
            manualOnly: durationSeconds <= 0,
            summary,
            damageTakenMultiplier: Number(def.effects?.damageTakenMultiplier ?? 1),
            combatAdvantage: Boolean(def.effects?.combatAdvantage),
            rangedCombatAdvantage: Boolean(def.effects?.rangedCombatAdvantage),
            ignoreWoundPenaltyCount: Number(def.effects?.ignoreWoundPenaltyCount ?? 0),
            doubleEbbDuration: Boolean(def.effects?.doubleEbbDuration),
            ebbPowerPenalty: Number(def.withdrawal?.ebbPowerPenalty ?? 0),
            ...extra
          }
        }
      }
    };
  }

  static async adjustPostEffectCaps(actor) {
    const updates = {};
    const healthMax = Math.max(0, Number(actor.system?.health?.max ?? 0));
    const healthValue = Math.max(0, Number(actor.system?.health?.value ?? 0));
    if (healthValue > healthMax) {
      updates["system.health.value"] = healthMax;
    }
    const hitsMax = Math.max(0, Number(actor.system?.hits?.max ?? 0));
    const hitsValue = Math.max(0, Number(actor.system?.hits?.value ?? 0));
    if (hitsValue > hitsMax) {
      updates["system.hits.value"] = hitsMax;
    }
    const fluxMax = Math.max(0, Number(actor.system?.sla?.flux?.max ?? 0));
    const fluxValue = Math.max(0, Number(actor.system?.sla?.flux?.value ?? 0));
    if (fluxValue > fluxMax) {
      updates["system.sla.flux.value"] = fluxMax;
    }
    if (Object.keys(updates).length) {
      await actor.update(updates);
    }
  }

  static async getOrCreateAddictionCondition(actor, def) {
    const name = `Addiction: ${def.name}`;
    let item = actor.items.find((entry) => entry.type === "condition" && this.normalize(entry.name) === this.normalize(name));
    if (item) return item;
    const created = await actor.createEmbeddedDocuments("Item", [{
      name,
      type: "condition",
      img: ADDICTION_ICON,
      system: {
        description: `<p><strong>Addiction Threshold:</strong> ${Number(def.addiction?.threshold ?? 0)} failed Body Saves.</p><p>${def.withdrawalSummary ?? ""}</p>`,
        severity: 0,
        treatment: { value: 0, html: "" }
      },
      flags: {
        [SYSTEM_ID]: {
          slaAddiction: {
            drugId: def.id,
            threshold: Number(def.addiction?.threshold ?? 0)
          }
        }
      }
    }]);
    return created?.[0] ?? null;
  }

  static async processAddictionOnUse(actor, def) {
    const threshold = Number(def.addiction?.threshold ?? 0);
    if (!threshold) return { skipped: true };
    if (Boolean(def.addiction?.frotherExempt) && this.isFrother(actor)) {
      return { skipped: true, exempt: true };
    }

    const rollString = Boolean(def.addiction?.saveDisadvantage) ? "1d100 [-]" : "1d100";
    const result = await actor.rollSlaSaveWithResult("body", {
      rollString,
      label: `${def.name}: Addiction Body Save`,
      description: `${def.name} addiction check${def.addiction?.saveDisadvantage ? " at Disadvantage" : ""}.`
    });

    if (result?.success) return { success: true };

    const condition = await this.getOrCreateAddictionCondition(actor, def);
    if (!condition) return { success: false, condition: null };
    const newSeverity = Math.max(0, Number(condition.system?.severity ?? 0) + 1);
    await condition.update({ "system.severity": newSeverity });

    const addicted = newSeverity >= threshold;
    ui.notifications.warn(`${actor.name}: ${def.name} addiction risk increased to ${newSeverity}/${threshold}${addicted ? " (Addicted)" : ""}.`);
    return { success: false, condition, severity: newSeverity, addicted };
  }

  static async clearDrugEffects(actor, drugId, { skipFollowup = true } = {}) {
    const effects = this.getActorDrugEffects(actor, drugId);
    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map((effect) => effect.id), skipFollowup ? { slaDrugSkipFollowup: true } : {});
  }

  static async useDrug({ actor, itemId, consume = true } = {}) {
    const item = actor?.items?.get(itemId);
    if (!actor || !item) {
      ui.notifications.warn("No drug item was found to use.");
      return { ok: false, reason: "missing-item" };
    }
    const def = await this.getDrugDefinitionFromItem(item);
    if (!def) {
      ui.notifications.warn(`No SLA drug definition found for ${item.name}.`);
      return { ok: false, reason: "missing-definition" };
    }

    await this.resolveExpiredEffects(actor);

    // Drug stacking warning — check if any OTHER drug is already active
    const allActiveDrugEffects = this.getActorDrugEffects(actor);
    const otherActiveDrugs = allActiveDrugEffects.filter((effect) => {
      const flag = this.getDrugEffectFlag(effect);
      return flag?.stage === "active" && flag?.drugId && flag.drugId !== def.id;
    });
    if (otherActiveDrugs.length > 0) {
      const activeNames = [...new Set(otherActiveDrugs.map((e) => this.getDrugEffectFlag(e)?.drugName ?? e.name))].join(", ");
      const proceed = await Dialog.confirm({
        title: "Drug Stacking Warning",
        content: `<p><strong>${actor.name}</strong> already has active drug effects from: <strong>${activeNames}</strong>.</p>
          <p>Combining drugs can cause unpredictable or lethal interactions. Do you want to proceed?</p>`,
        defaultYes: false
      });
      if (!proceed) return { ok: false, reason: "stacking-cancelled" };
    }

    const quantity = Math.max(0, Number(item.system?.quantity ?? 0));
    if (consume && quantity < 1) {
      ui.notifications.warn(`${actor.name} has no ${def.name} doses remaining.`);
      return { ok: false, reason: "out-of-doses" };
    }

    if (!Boolean(def.special?.kickstartDelay)) {
      await this.clearDrugEffects(actor, def.id, { skipFollowup: true });
    }

    if (consume) {
      await item.update({ "system.quantity": quantity - 1 });
    }

    if (Number(def.effects?.stressOnUse ?? 0) > 0) {
      const skipStress = Boolean(def.effects?.stressNonFrotherOnly) && this.isFrother(actor);
      if (!skipStress) {
        await actor.modifyActor("system.other.stress.value", Number(def.effects.stressOnUse), null, false);
      }
    }

    if (def.effects?.restoreFlux === "full" && this.isEbbUser(actor)) {
      const fluxMax = Math.max(0, Number(actor.system?.sla?.flux?.max ?? 0));
      await actor.update({ "system.sla.flux.value": fluxMax });
      await actor.updateSlaFluxState?.(fluxMax, { save: true });
    }

    if (Boolean(def.special?.intellectPermanentAfterFirst)) {
      const path = `flags.${SYSTEM_ID}.slaDrugCounters.${def.id}`;
      const currentUses = Math.max(0, Number(actor.getFlag?.(SYSTEM_ID, `slaDrugCounters.${def.id}`) ?? 0));
      const nextUses = currentUses + 1;
      await actor.update({ [path]: nextUses });
      if (nextUses > 1) {
        await actor.modifyActor("system.stats.intellect.value", Number(def.special.intellectPermanentAfterFirst), null, false);
      }
    }

    const effectData = this.buildEffectData(def, actor, item, Boolean(def.special?.kickstartDelay) ? "pending" : "active");
    await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);

    await this.processAddictionOnUse(actor, def);

    if (Boolean(def.special?.aliceTrip)) {
      const sanityResult = await actor.rollSlaSaveWithResult("sanity", {
        label: `${def.name}: Trip Sanity Save`,
        description: `${def.name} tears perception open.`
      });
      if (!sanityResult?.success) {
        await actor.modifyActor("system.other.stress.value", null, "1d10", false);
        await actor.rollTable("panicCheck", null, null, null, null, null, null);
      }
    }

    await this.postDrugChat(actor, {
      title: `${def.name} Dosed`,
      state: Boolean(def.special?.kickstartDelay) ? "pending" : "active",
      duration: def.durationLabel ?? "",
      summary: def.activeSummary ?? "",
      drug: def
    });

    return { ok: true, drug: def.id };
  }

  static async closeDrug({ actor, itemId = "", drug = "" } = {}) {
    if (!actor) return { ok: false, reason: "missing-actor" };
    const item = itemId ? actor.items.get(itemId) : null;
    const def = await this.getDrugDefinition(item ? (item.flags?.[SYSTEM_ID]?.slaDrug?.id ?? item.system?.sla?.drugId ?? item.name) : drug);
    if (!def) return { ok: false, reason: "missing-definition" };

    await this.resolveExpiredEffects(actor);
    const effects = this.getActorDrugEffects(actor, def.id);
    if (!effects.length) return { ok: true, skipped: true };

    const activeOrPending = effects.find((effect) => {
      const stage = this.getDrugEffectFlag(effect)?.stage;
      return stage === "active" || stage === "pending";
    });

    if (activeOrPending) {
      await activeOrPending.delete({ slaDrugManualClose: true });
      return { ok: true, stage: "closed-active" };
    }

    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map((effect) => effect.id), { slaDrugSkipFollowup: true });
    await this.postDrugChat(actor, {
      title: `${def.name} Cleared`,
      state: "cleared",
      duration: "",
      summary: "No active drug state remains.",
      drug: def
    });
    return { ok: true, stage: "cleared" };
  }

  static async handleEffectDeleted(effect, options = {}) {
    const actor = effect?.parent;
    const flag = this.getDrugEffectFlag(effect);
    if (!actor || !flag) return;
    if (options?.slaDrugSkipFollowup) {
      await this.adjustPostEffectCaps(actor);
      return;
    }

    const def = await this.getDrugDefinition(flag.drugId);
    if (!def) return;

    if (flag.stage === "pending" && Boolean(def.special?.kickstartDelay)) {
      await this.applyKickStart(actor, def);
      await this.postDrugChat(actor, {
        title: `${def.name} Triggered`,
        state: "resolved",
        duration: "",
        summary: "Delayed treatment resolved: health restored and wound recovery attempted.",
        drug: def
      });
      return;
    }

    if (flag.stage === "active") {
      await this.handleActiveDrugEnding(actor, def, Boolean(options?.slaDrugManualClose));
      return;
    }

    if (flag.stage === "withdrawal-check") {
      await this.handleWithdrawalCheck(actor, def);
      return;
    }

    await this.adjustPostEffectCaps(actor);
  }

  static async handleActiveDrugEnding(actor, def, manualClose = false) {
    const effects = def.effects ?? {};
    const expiry = def.expiry ?? {};

    if (Boolean(expiry.sanitySaveOnExpiry)) {
      const result = await actor.rollSlaSaveWithResult("sanity", {
        label: `${def.name}: Expiry Sanity Save`,
        description: `${def.name} burns out and the comedown hits.`
      });
      if (!result?.success && expiry.stressFormulaOnFailure) {
        await actor.modifyActor("system.other.stress.value", null, expiry.stressFormulaOnFailure, false);
      }
    }

    if (Number(expiry.stressRelief ?? 0) > 0) {
      await actor.modifyActor("system.other.stress.value", -Math.abs(Number(expiry.stressRelief)), null, false);
    }

    if (def.withdrawal?.mode === "immediate") {
      const sourceItem = actor.items.get(this.getActorDrugEffects(actor, def.id)[0]?.flags?.[SYSTEM_ID]?.slaDrug?.sourceItemId ?? "") ?? null;
      const withdrawalEffect = this.buildEffectData(def, actor, sourceItem, "withdrawal");
      await actor.createEmbeddedDocuments("ActiveEffect", [withdrawalEffect]);
      await this.postDrugChat(actor, {
        title: `${def.name} Withdrawal`,
        state: "withdrawal",
        duration: def.withdrawal?.durationSeconds ? this.formatSeconds(def.withdrawal.durationSeconds) : "Manual",
        summary: def.withdrawalSummary ?? "",
        drug: def
      });
      await this.adjustPostEffectCaps(actor);
      return;
    }

    if (def.withdrawal?.mode === "addiction-check") {
      const addiction = actor.items.find((entry) => entry.type === "condition" && this.normalize(entry.name) === this.normalize(`Addiction: ${def.name}`));
      const addicted = Number(addiction?.system?.severity ?? 0) >= Math.max(1, Number(def.addiction?.threshold ?? 0));
      if (addicted) {
        const sourceItem = actor.items.find((entry) => this.normalize(entry.name) === this.normalize(def.name)) ?? null;
        const withdrawalCheck = this.buildEffectData(def, actor, sourceItem, "withdrawal-check", { manualClose });
        await actor.createEmbeddedDocuments("ActiveEffect", [withdrawalCheck]);
        await this.postDrugChat(actor, {
          title: `${def.name} Cooling Off`,
          state: "withdrawal-check",
          duration: this.formatSeconds(Number(def.addiction?.withdrawalCheckSeconds ?? 86400)),
          summary: "Addiction is active. If no fresh dose is taken before the check expires, a Body Save will determine withdrawal.",
          drug: def
        });
      } else {
        await this.postDrugChat(actor, {
          title: `${def.name} Ended`,
          state: manualClose ? "closed" : "expired",
          duration: "",
          summary: "The active dose has ended with no addiction withdrawal timer.",
          drug: def
        });
      }
    }

    await this.adjustPostEffectCaps(actor);
  }

  static async handleWithdrawalCheck(actor, def) {
    const result = await actor.rollSlaSaveWithResult("body", {
      label: `${def.name}: Withdrawal Body Save`,
      description: `Twenty-four hours have passed without another ${def.name} dose.`
    });
    if (result?.success) {
      await this.postDrugChat(actor, {
        title: `${def.name} Withdrawal Resisted`,
        state: "recovered",
        duration: "",
        summary: "The operative holds it together for now. Addiction remains tracked on the sheet.",
        drug: def
      });
      return;
    }

    const sourceItem = actor.items.find((entry) => this.normalize(entry.name) === this.normalize(def.name)) ?? null;
    const withdrawalEffect = this.buildEffectData(def, actor, sourceItem, "withdrawal");
    await actor.createEmbeddedDocuments("ActiveEffect", [withdrawalEffect]);
    await this.postDrugChat(actor, {
      title: `${def.name} Withdrawal Triggered`,
      state: "withdrawal",
      duration: def.withdrawal?.durationSeconds ? this.formatSeconds(def.withdrawal.durationSeconds) : "Manual",
      summary: def.withdrawalSummary ?? "",
      drug: def
    });
    await this.adjustPostEffectCaps(actor);
  }

  static async applyKickStart(actor, def) {
    const updates = {
      "system.health.value": Math.max(0, Number(actor.system?.health?.max ?? 0))
    };
    const currentWounds = Math.max(0, Number(actor.system?.hits?.value ?? 0));
    if (currentWounds > 0) {
      updates["system.hits.value"] = Math.max(0, currentWounds - Math.max(1, Number(def.special?.healWounds ?? 1)));
    }
    await actor.update(updates);
  }

  static getDamageTakenMultiplier(actor) {
    const effects = this.getActorDrugEffects(actor);
    let multiplier = 1;
    for (const effect of effects) {
      const flag = this.getDrugEffectFlag(effect);
      if (flag?.stage !== "active") continue;
      const next = Number(flag.damageTakenMultiplier ?? 1);
      if (next > 0 && next < multiplier) {
        multiplier = next;
      }
    }
    return multiplier;
  }

  static getActiveRollModifiers(actor) {
    const modifiers = {
      combatAdvantage: false,
      rangedCombatAdvantage: false,
      ignoreWoundPenaltyCount: 0,
      doubleEbbDuration: false,
      ebbPowerPenalty: 0
    };
    for (const effect of this.getActorDrugEffects(actor)) {
      const flag = this.getDrugEffectFlag(effect);
      if (flag?.stage !== "active" && flag?.stage !== "withdrawal") continue;
      modifiers.combatAdvantage ||= Boolean(flag.combatAdvantage);
      modifiers.rangedCombatAdvantage ||= Boolean(flag.rangedCombatAdvantage);
      modifiers.doubleEbbDuration ||= Boolean(flag.doubleEbbDuration);
      modifiers.ignoreWoundPenaltyCount = Math.max(modifiers.ignoreWoundPenaltyCount, Number(flag.ignoreWoundPenaltyCount ?? 0));
      modifiers.ebbPowerPenalty += Number(flag.stage === "withdrawal" ? flag.ebbPowerPenalty ?? 0 : 0);
    }
    return modifiers;
  }

  static formatSeconds(seconds = 0) {
    const total = Math.max(0, Number(seconds ?? 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${secs}s`;
  }

  static async postDrugChat(actor, { title = "", state = "", duration = "", summary = "", drug = null } = {}) {
    const image = drug?.img || "icons/consumables/potions/potion-round-corked-red.webp";
    const content = `
      <div class="mosh sla-chat-card" style="padding:10px;border:1px solid #1e2d39;border-radius:8px;background:linear-gradient(180deg, rgba(17, 27, 36, 0.98), rgba(26, 40, 51, 0.98));color:#eff3f7;">
        <div class="flexrow" style="margin-bottom: 6px; align-items: center;">
          <div class="sla-chat-title" style="font-family:'Josefin Sans','Roboto',sans-serif;text-transform:uppercase;letter-spacing:0.12em;font-size:0.72rem;font-weight:700;color:#f3efe6;">${title}</div>
          <div style="text-align:right;"><img class="roll-image" src="${image}" /></div>
        </div>
        <div class="sla-chat-copy" style="margin-top:6px;line-height:1.45;color:#f3efe6;font-family:'Josefin Sans','Roboto',sans-serif;"><strong>State:</strong> ${state}</div>
        ${duration ? `<div class="sla-chat-copy" style="margin-top:6px;line-height:1.45;color:#f3efe6;font-family:'Josefin Sans','Roboto',sans-serif;"><strong>Duration:</strong> ${duration}</div>` : ""}
        ${summary ? `<div class="sla-chat-copy" style="margin-top:6px;line-height:1.45;color:#f3efe6;font-family:'Josefin Sans','Roboto',sans-serif;">${summary}</div>` : ""}
      </div>
    `;
    await ChatMessage.create({
      user: game.user.id,
      speaker: { actor: actor.id, token: actor.token, alias: actor.name },
      content
    });
  }
}
