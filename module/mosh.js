// Import Modules
import { MothershipActor } from "./actor/actor.js";
import { MothershipActorSheet, MothershipActorSheetDossier } from "./actor/actor-sheet.js";
import { MothershipCreatureSheet } from "./actor/creature-sheet.js";
import { MothershipShipSheet } from "./actor/ship-sheet.js";
import { MothershipShipSheetSBT } from "./actor/ship-sheet-sbt.js";

import { MothershipItem } from "./item/item.js";
import { MothershipItemSheet } from "./item/item-sheet.js";
import { MothershipClassSheet } from "./item/class-sheet.js";
import { MothershipSkillSheet } from "./item/skill-sheet.js";
import { SLADrugSystem } from "./sla-drug-system.js";
import { slaDebug } from "./logger.js";
import { SLAMothershipGenerator } from "./windows/sla-character-generator.js";
import { SLAWorldToolsApp, installSlaSidebarButtons } from "./windows/sla-world-tools.js";

import {
  registerSettings
} from "./settings.js";

const SLA_INITIATIVE_BRACKETS = {
  critSuccess: 5,
  success: 4,
  enemy: 3,
  failure: 2,
  critFailure: 1
};

const SLA_WORLD_SKILL_IMAGE_OVERRIDES = {
  Athletics: "systems/sla-mothership/images/sla-assets/Skills/Athletics.png",
  Brawl: "systems/sla-mothership/images/sla-assets/Skills/Brawl.png"
};

Hooks.once('init', async function () {

  game.mosh = {
    MothershipActor,
    MothershipItem,
    rollItemMacro,
    rollStatMacro,
    initRollTable,
    initRollCheck,
    initModifyActor,
    initModifyItem,
    noCharSelected
  };
  game.slaMothership = {
    ...game.mosh,
    useDrug: (actor, itemId) => SLADrugSystem.useDrug({ actor, itemId }),
    closeDrug: (actor, itemId, drug = "") => SLADrugSystem.closeDrug({ actor, itemId, drug }),
    restartDrugReminders: () => SLADrugSystem.startReminderLoop(),
    openGenerator: (actor = null, options = {}) => SLAMothershipGenerator.open(actor, options),
    createRandomOperative: (options = {}) => SLAMothershipGenerator.createRandomOperative(options),
    createStarterSquad: (options = {}) => SLAMothershipGenerator.createStarterSquad(options),
    openTools: () => SLAWorldToolsApp.open(),
    seedWorldContent: (options = {}) => game.slaMothershipCompendium?.seedWorld?.(options),
    rollCombatInitiative: (combat, ids = []) => rollSlaCombatInitiative(combat, ids)
  };

  registerSettings();


  /**
   * Set an initiative formula for the system
   * @type {String}
   */
  CONFIG.Combat.initiative = {
    formula: "1d100",
    decimals: 2
  };

  // Define custom Entity classes
  CONFIG.Actor.documentClass = MothershipActor;
  CONFIG.Item.documentClass = MothershipItem;


  // Register sheet application classes
  foundry.documents.collections.Actors.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  foundry.documents.collections.Actors.registerSheet("sla-mothership", MothershipActorSheet, {types: ['character'], makeDefault: true});
  foundry.documents.collections.Actors.registerSheet("sla-mothership", MothershipActorSheetDossier, {types: ['character'], makeDefault: false, label: "SLA Dossier"});
  foundry.documents.collections.Actors.registerSheet("sla-mothership", MothershipCreatureSheet, {types: ['creature'], makeDefault: false});
  foundry.documents.collections.Actors.registerSheet("sla-mothership", MothershipShipSheetSBT, {types: ['ship'], makeDefault: true});
  foundry.documents.collections.Actors.registerSheet("sla-mothership", MothershipShipSheet, {types: ['ship'], makeDefault: false});
  foundry.documents.collections.Items.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  foundry.documents.collections.Items.registerSheet("sla-mothership", MothershipClassSheet, {types: ['class'], makeDefault: true});
  foundry.documents.collections.Items.registerSheet("sla-mothership", MothershipSkillSheet, {types: ['skill'], makeDefault: true});
  foundry.documents.collections.Items.registerSheet("sla-mothership", MothershipItemSheet, {
    types: [
      "item",
      "drug",
      "weapon",
      "armor",
      "ability",
      "module",
      "condition",
      "crew",
      "repair",
      "persTrait"
    ], 
    makeDefault: true 
  });

  // If you need to add Handlebars helpers, here are a few useful examples:
  Handlebars.registerHelper('concat', function () {
    var outStr = '';
    for (var arg in arguments) {
      if (typeof arguments[arg] != 'object') {
        outStr += arguments[arg];
      }
    }
    return outStr;
  });

  Handlebars.registerHelper('toLowerCase', function (str) {
    return str.toLowerCase();
  });

  Handlebars.registerHelper('compare', function (varType, varOne, comparator, varTwo) {
    if (varType === 'str') {
     if (eval('"' + varOne + '"' + comparator + '"' + varTwo+ '"')) {
       return true
     } else {
       return false
     }
    } else if (varType === 'int') {
     if (eval(varOne + comparator + varTwo)) {
       return true
     } else {
       return false
     }
    }
     });
     //convert uuid list to names for display.
  Handlebars.registerHelper('UUidListToNames',function(UuidList){
      var names = []
      for(let i=0;i<UuidList.length;i++){
        let object = fromUuidSync(UuidList[i]);
        names.push(object.name);
      }
      return names.join(", ");
     });
     
  Hooks.on("deleteActiveEffect", async (effect, options) => {
    await SLADrugSystem.handleEffectDeleted(effect, options);
  });

  Hooks.on("createItem", async (item) => {
    const actor = item.parent;
    if (!actor || actor.type !== "character" || typeof actor.enforceSlaEbbEligibility !== "function") return;
    if (actor.isSlaEbbUser?.()) return;
    await actor.enforceSlaEbbEligibility({ notify: true, refillFlux: false });
  });

  Hooks.on("updateActor", async (actor, changes, options) => {
    if (actor.type !== "character") return;
    if (options?.slaSkipSpeciesBalance) return;
    const speciesChanged = foundry.utils.hasProperty(changes, "system.sla.species.value");
    const packageChanged = foundry.utils.hasProperty(changes, "system.sla.trainingPackage.value") || foundry.utils.hasProperty(changes, "system.class.value");
    if (speciesChanged && typeof actor.enforceSlaSpeciesWounds === "function") {
      await actor.enforceSlaSpeciesWounds();
    }
    if (speciesChanged && typeof actor.enforceSlaEbbEligibility === "function") {
      await actor.enforceSlaEbbEligibility({
        notify: true,
        refillFlux: actor.isSlaEbbUser?.()
      });
    }
    if ((speciesChanged || packageChanged) && typeof actor.refreshSlaTraumaResponse === "function") {
      await actor.refreshSlaTraumaResponse({ force: true });
    }
    if (speciesChanged && typeof actor.reconcileSlaSpeciesBalance === "function") {
      await actor.reconcileSlaSpeciesBalance({ force: true });
    }
  });

  Hooks.on("renderActorDirectory", (app, html) => {
    installSlaSidebarButtons(app, html);
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("actors", html);
  });

  Hooks.on("renderSidebarTab", (app, html) => {
    const isActorsTab = app?.tabName === "actors" || app?.options?.id === "actors";
    if (isActorsTab) installSlaSidebarButtons(app, html);
    if (!game.user?.isGM) {
      hideSlaRestrictedSidebarTabs();
      enforceSlaPlayerSidebarTabRestrictions(app, html);
    }
  });

  Hooks.on("renderSceneDirectory", (_app, html) => {
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("scenes", html);
  });

  Hooks.on("renderJournalDirectory", (_app, html) => {
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("journal", html);
  });

  Hooks.on("renderRollTableDirectory", (_app, html) => {
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("tables", html);
  });

  Hooks.on("renderCompendiumDirectory", (_app, html) => {
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("compendium", html);
  });

  Hooks.on("renderCombatTracker", (app, html) => {
    installSlaCombatTrackerControls(app, html);
    if (!game.user?.isGM) enforceSlaPlayerDirectoryRestrictions("combat", html);
  });

  Hooks.on("updateCombat", async (combat, changed) => {
    if (!foundry.utils.hasProperty(changed, "round")) return;
    if (!combat?.started) return;
    if ((Number(combat.round ?? 0) || 0) <= 0) return;

    const processed = new Set();
    for (const combatant of combat.combatants ?? []) {
      const actor = combatant.actor ?? combatant.token?.actor ?? null;
      if (!actor || processed.has(actor.id)) continue;
      processed.add(actor.id);
      if (typeof actor.applySlaPrometheusRegeneration === "function") {
        await actor.applySlaPrometheusRegeneration({ combat });
      }
    }
  });

});


Hooks.once("ready", async function () {
  SLADrugSystem.startReminderLoop();
  
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type === "Item") {
      createMothershipMacro(data, slot);
      return false;
    }
  });
  
  if (ui.actors) {
    ui.actors.render(true);
  }

  for (const actor of game.actors?.filter((entry) => entry.type === "character") ?? []) {
    if (typeof actor.enforceSlaSpeciesWounds === "function") {
      await actor.enforceSlaSpeciesWounds();
    }
    if (typeof actor.enforceSlaEbbEligibility === "function") {
      await actor.enforceSlaEbbEligibility({ notify: false, refillFlux: false });
    }
    if (typeof actor.reconcileSlaSpeciesBalance === "function") {
      await actor.reconcileSlaSpeciesBalance({ force: false });
    }
    if (typeof actor.refreshSlaTraumaResponse === "function") {
      await actor.refreshSlaTraumaResponse({ force: true });
    }
    if (typeof actor.refreshSlaSkillPresentation === "function") {
      await actor.refreshSlaSkillPresentation();
    }
  }

  const worldSkillUpdates = (game.items ?? [])
    .filter((item) => item.type === "skill" && SLA_WORLD_SKILL_IMAGE_OVERRIDES[item.name] && item.img !== SLA_WORLD_SKILL_IMAGE_OVERRIDES[item.name])
    .map((item) => ({ _id: item.id, img: SLA_WORLD_SKILL_IMAGE_OVERRIDES[item.name] }));
  if (worldSkillUpdates.length) {
    await Item.updateDocuments(worldSkillUpdates);
  }

  patchSlaInitiativeSystem();
  if (!game.user?.isGM) hideSlaRestrictedSidebarTabs();
  
});

Hooks.on("renderChatMessageHTML", (app, html) => {
  const root = html?.[0] ?? html;
  if (!root?.querySelectorAll) return;

  root.querySelectorAll(".sla-wound-effect-link").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const messageRoot = button.closest("[data-actor-id]");
      const actorId = messageRoot?.dataset?.actorId || app?.message?.speaker?.actor;
      const actor = actorId ? game.actors?.get?.(actorId) : null;
      if (!actor || typeof actor.rollSlaWoundEffect !== "function") {
        ui.notifications.warn("The actor for this wound effect could not be found.");
        return;
      }

      const effectKey = button.dataset.woundEffect;
      const modifier = button.dataset.woundModifier || "standard";
      await actor.rollSlaWoundEffect(effectKey, modifier);
    });
  });
});

//add custom damage dice for MOSH
Hooks.once('diceSoNiceReady', (dice3d) => {
  dice3d.addColorset(
    {
      name: 'roll',
      description: 'Roll Dice',
      category: 'Mothership',
      foreground: '#FFFFFF',
      background: '#262626',
      outline: 'none',
      texture: 'none',
      material: 'none',
      font: 'Arial'
    }
  )
})

//add custom damage dice for MOSH
Hooks.once('diceSoNiceReady', (dice3d) => {
  dice3d.addColorset(
    {
      name: 'damage',
      description: 'Damage Dice',
      category: 'Mothership',
      foreground: '#FFFFFF',
      background: '#cc2828',
      outline: 'none',
      texture: 'none',
      material: 'none',
      font: 'Arial'
    }
  )
})

//add custom panic dice for MOSH
Hooks.once('diceSoNiceReady', (dice3d) => {
  dice3d.addColorset(
    {
      name: 'panic',
      description: 'Panic Die',
      category: 'Mothership',
      foreground: '#000000',
      background: '#FFF200',
      outline: 'none',
      texture: 'none',
      material: 'metal',
      font: 'Arial'
    }
  )
})

//set initial things when creating an actor
Hooks.on("preCreateActor", (document, createData, options, userId) => {
  slaDebug("preCreateActor fired for:", createData?.name, createData?.type);

  const disposition =
    createData.type === "creature"
      ? CONST.TOKEN_DISPOSITIONS.HOSTILE
      : CONST.TOKEN_DISPOSITIONS.NEUTRAL;

  // Apply prototype token defaults (v12+)
  document.updateSource({
    "prototypeToken.bar1.attribute": "system.health", // <-- use full system path
    "prototypeToken.bar2.attribute": "system.hits",   // adjust to your schema
    "prototypeToken.displayName": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    "prototypeToken.displayBars": CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER,
    "prototypeToken.disposition": disposition,
    "prototypeToken.name": createData.name
  });

  if (createData.type === "character") {
    document.updateSource({
      "prototypeToken.disposition": CONST.TOKEN_DISPOSITIONS.FRIENDLY,
      "prototypeToken.actorLink": true,
      "prototypeToken.vision": true,
      "system.other.stress.label": "Stress",
      "system.sla.operativeType.value": "",
      "system.sla.species.value": "",
      "system.sla.speciesNotes.value": "",
      "system.sla.trainingPackage.value": "",
      "system.sla.packageSummary.value": "",
      "system.sla.packageSkills.value": "",
      "system.sla.packageWealth.value": "",
      "system.sla.fluxStage.value": "",
      "system.sla.bpn.value": "",
      "system.sla.scl.value": "",
      "system.sla.employer.value": "",
      "system.sla.sector.value": "",
      "system.sla.ebbRating.value": 0,
      "system.sla.fluxNotes.value": "",
      "system.sla.ebbNotes.value": ""
    });

    if (game.settings.get("sla-mothership", "useCalm")) {
      document.updateSource({
        "system.other.stress.min": 0,
        "system.other.stress.value": 85,
        "system.other.stress.max": 85,
        "system.other.stress.label": "Calm"
      });
    }
  }
});


/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createMothershipMacro(data, slot) {

  if (data.type !== "Item") return;

  var itemUUID = data.uuid.split("."); 
  slaDebug(itemUUID);

  var actor = game.actors.get(itemUUID[1]);
  var item;

    item = foundry.utils.duplicate(actor.getEmbeddedDocument('Item',itemUUID[3]));

  slaDebug(item);

  if (!item) return ui.notifications.warn("You can only create macro buttons for owned Items");

  // Create the macro command
  let command = `game.mosh.rollItemMacro("${item.name}");`;
  slaDebug(command);
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: {
        "mosh.itemMacro": true
      }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Roll Macro from a Weapon.
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  //init vars
  let item;
  let itemId;
  //determine who to run the macro for
  if (game.settings.get('sla-mothership','macroTarget') === 'character') {
    //is there a selected character? warn if no
    if (!game.user.character) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for the player's 'Selected Character'
        //get item id
        itemId = game.user.character.items.getName(itemName)._id;
        //get item
        item = foundry.utils.duplicate(game.user.character.getEmbeddedDocument("Item", itemId));
        //warn if no item
        if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);
        //roll action
        if (item.type == "weapon") {
          return game.user.character.rollCheck(null, 'low', 'combat', null, null, item);
        } else if (item.type == "drug") {
          return game.user.character.useSlaDrug(item.id);
        } else if (item.type == "item" || item.type == "armor" || item.type == "ability" || item.type == "condition" || item.type == "repair") {
          return game.user.character.printDescription(item.id);
        } else if (item.type == "skill") {
          return game.user.character.rollCheck(null, null, null, item.name, item.system.bonus, null);
        }
    }
  } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
    //is there a selected character? warn if no
    if (!canvas.tokens.controlled.length) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for all selected tokens
      canvas.tokens.controlled.forEach(function(token){
        //get item id
        itemId = token.actor.items.getName(itemName)._id;
        //get item
        item = foundry.utils.duplicate(token.actor.getEmbeddedDocument("Item", itemId));
        //warn if no item
        if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);
        //roll action
        if (item.type == "weapon") {
          return token.actor.rollCheck(null, 'low', 'combat', null, null, item);
        } else if (item.type == "drug") {
          return token.actor.useSlaDrug(item.id);
        } else if (item.type == "item" || item.type == "armor" || item.type == "ability" || item.type == "condition" || item.type == "repair") {
          return token.actor.printDescription(item.id);
        } else if (item.type == "skill") {
          return token.actor.rollCheck(null, null, null, item.name, item.system.bonus, null);
        }
      });
    }
  }
}


/**
 * Roll Stat.
 * @param {string} statName
 * @return {Promise}
 */
function rollStatMacro() {
  var selected = canvas.tokens.controlled;
  const speaker = ChatMessage.getSpeaker();

  if (selected.length == 0) {
    selected = game.actors.tokens[speaker.token];
  }

  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const stat = actor ? Object.entries(actor.system.stats) : null;


  // if (stat == null) {
  //   ui.notifications.info("Stat not found on token");
  //   return;
  // }

  slaDebug(stat);

  return actor.rollStatSelect(stat);
}

//find and tell the actor to run the tableRoll function
async function initRollTable(tableId,rollString,aimFor,zeroBased,checkCrit,rollAgainst,comparison) {
  //determine who to run the macro for
  if (game.settings.get('sla-mothership','macroTarget') === 'character') {
    //is there a selected character? warn if no
    if (!game.user.character) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for the player's 'Selected Character'
      game.user.character.rollTable(tableId,rollString,aimFor,zeroBased,checkCrit,rollAgainst,comparison);
    }
  } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
    //is there a selected character? warn if no
    if (!canvas.tokens.controlled.length) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for all selected tokens
      canvas.tokens.controlled.forEach(function(token){
        token.actor.rollTable(tableId,rollString,aimFor,zeroBased,checkCrit,rollAgainst,comparison);
      });
    }
  }
  //log what was done
  slaDebug(`Initiated rollTable function with: tableId: ${tableId}, rollString: ${rollString}, aimFor: ${aimFor}, zeroBased: ${zeroBased}, checkCrit: ${checkCrit}, rollAgainst: ${rollAgainst}, comparison: ${comparison}`);
}

//find and tell the actor to run the rollCheck function
async function initRollCheck(rollString,aimFor,attribute,skill,skillValue,weapon) {
  //determine who to run the macro for
  if (game.settings.get('sla-mothership','macroTarget') === 'character') {
    //is there a selected character? warn if no
    if (!game.user.character) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for the player's 'Selected Character'
      game.user.character.rollCheck(rollString,aimFor,attribute,skill,skillValue,weapon);
    }
  } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
    //is there a selected character? warn if no
    if (!canvas.tokens.controlled.length) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for all selected tokens
      canvas.tokens.controlled.forEach(function(token){
        token.actor.rollCheck(rollString,aimFor,attribute,skill,skillValue,weapon);
      });
    }
  }
  //log what was done
  slaDebug(`Initiated rollCheck function with: rollString: ${rollString}, aimFor: ${aimFor}, attribute: ${attribute}, skill: ${skill}, skillValue: ${skillValue}, weapon: ${weapon}`);
}

//find and tell the actor to run the modifyActor function
async function initModifyActor(fieldAddress,modValue,modRollString,outputChatMsg) {
  //determine who to run the macro for
  if (game.settings.get('sla-mothership','macroTarget') === 'character') {
    //is there a selected character? warn if no
    if (!game.user.character) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for the player's 'Selected Character'
      game.user.character.modifyActor(fieldAddress,modValue,modRollString,outputChatMsg);
    }
  } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
    //is there a selected character? warn if no
    if (!canvas.tokens.controlled.length) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for all selected tokens
      canvas.tokens.controlled.forEach(function(token){
        token.actor.modifyActor(fieldAddress,modValue,modRollString,outputChatMsg);
      });
    }
  }
  //log what was done
  slaDebug(`Initiated modifyActor function with: fieldAddress: ${fieldAddress}, modValue: ${modValue}, modRollString: ${modRollString}, outputChatMsg: ${outputChatMsg}`);
}

//tell the actor to run the function
async function initModifyItem(itemId,addAmount) {
  //determine who to run the macro for
  if (game.settings.get('sla-mothership','macroTarget') === 'character') {
    //is there a selected character? warn if no
    if (!game.user.character) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for the player's 'Selected Character'
      game.user.character.modifyItem(itemId,addAmount);
    }
  } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
    //is there a selected character? warn if no
    if (!canvas.tokens.controlled.length) {
      //warn player
      game.mosh.noCharSelected();
    } else {
      //run the function for all selected tokens
      canvas.tokens.controlled.forEach(function(token){
        token.actor.modifyItem(itemId,addAmount);
      });
    }
  }
  //log what was done
  slaDebug(`Initiated modifyItem function with: itemId: ${itemId}, addAmount: ${addAmount}`);
}

function patchSlaInitiativeSystem() {
  if (Combat.prototype._slaInitiativePatched) return;

  const originalRollInitiative = Combat.prototype.rollInitiative;
  const originalRollAll = Combat.prototype.rollAll;
  const originalRollNPC = Combat.prototype.rollNPC;

  Combat.prototype.rollInitiative = async function(ids, options = {}) {
    const idList = Array.isArray(ids) ? ids : [ids];
    if (!idList.length) {
      return originalRollInitiative.call(this, ids, options);
    }
    return rollSlaCombatInitiative(this, idList, { originalRollInitiative, ...options });
  };

  Combat.prototype.rollAll = async function(options = {}) {
    const ids = this.combatants.map((combatant) => combatant.id);
    return this.rollInitiative(ids, options);
  };

  Combat.prototype.rollNPC = async function(options = {}) {
    const ids = this.combatants.filter((combatant) => !isSlaPlayerCombatant(combatant)).map((combatant) => combatant.id);
    return this.rollInitiative(ids, options);
  };

  Combat.prototype._slaInitiativePatched = true;
  Combat.prototype._slaOriginalRollAll = originalRollAll;
  Combat.prototype._slaOriginalRollNPC = originalRollNPC;
}

function installSlaCombatTrackerControls(app, html) {
  const root = html instanceof jQuery ? html[0] : html;
  if (!root) return;

  const viewedCombat = app?.viewed ?? game.combat ?? null;
  if (!viewedCombat) return;

  const bindOnce = (selector, handler) => {
    for (const element of root.querySelectorAll(selector)) {
      if (element.dataset.slaInitBound === "true") continue;
      element.dataset.slaInitBound = "true";
      element.addEventListener("click", handler);
    }
  };

  if (!root.querySelector(".sla-initiative-controls")) {
    const trackerNav = root.querySelector("nav.encounters.tabbed")
      ?? root.querySelector(".combat-tracker-header nav")
      ?? root.querySelector("header");

    if (trackerNav) {
      trackerNav.insertAdjacentHTML("beforeend", `
        <a class="combat-control sla-initiative-controls" title="Roll SLA initiative for this encounter" data-sla-init="all">
          <i class="fas fa-bolt"></i>
          <span style="margin-left:4px;">SLA Init</span>
        </a>
      `);
    }
  }

  bindOnce(".sla-initiative-controls", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const combat = app?.viewed ?? game.combat ?? null;
    if (!combat) return;
    const ids = combat.combatants.map((combatant) => combatant.id);
    await rollSlaCombatInitiative(combat, ids);
  });

  bindOnce("[data-action='rollAll'], [data-control='rollAll']", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const combat = app?.viewed ?? game.combat ?? null;
    if (!combat) return;
    const ids = combat.combatants.map((combatant) => combatant.id);
    await rollSlaCombatInitiative(combat, ids);
  });

  bindOnce("[data-action='rollNPC'], [data-control='rollNPC']", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const combat = app?.viewed ?? game.combat ?? null;
    if (!combat) return;
    const ids = combat.combatants
      .filter((combatant) => !isSlaPlayerCombatant(combatant))
      .map((combatant) => combatant.id);
    await rollSlaCombatInitiative(combat, ids);
  });

  bindOnce("[data-action='rollInitiative'], [data-control='rollInitiative'], .combatant .token-initiative", async (event) => {
    const combatantElement = event.currentTarget.closest("[data-combatant-id], .combatant");
    const combatantId = combatantElement?.dataset?.combatantId ?? combatantElement?.dataset?.documentId ?? "";
    if (!combatantId) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const combat = app?.viewed ?? game.combat ?? null;
    if (!combat) return;
    await rollSlaCombatInitiative(combat, [combatantId]);
  });

  for (const combatantElement of root.querySelectorAll("[data-combatant-id], .combatant")) {
    const combatantId = combatantElement?.dataset?.combatantId ?? combatantElement?.dataset?.documentId ?? "";
    if (!combatantId) continue;
    const combatant = viewedCombat.combatants?.get?.(combatantId) ?? null;
    if (!combatant) continue;

    combatantElement.classList.toggle("sla-npc-enemy", !isSlaPlayerCombatant(combatant));

    combatantElement.querySelectorAll(".sla-initiative-badge").forEach((badge) => badge.remove());

    const initiativeType = String(combatant.getFlag?.("sla-mothership", "initiativeType") ?? "").trim();
    let badgeLabel = "";
    let badgeClass = "";
    if (initiativeType === "player-fast") {
      badgeLabel = "Before Enemies";
      badgeClass = "sla-init-before";
    } else if (initiativeType === "player-slow") {
      badgeLabel = "After Enemies";
      badgeClass = "sla-init-after";
    } else if (initiativeType === "enemy-bracket") {
      badgeLabel = "Enemy";
      badgeClass = "sla-init-enemy";
    }
    if (!badgeLabel) continue;

    const target =
      combatantElement.querySelector(".token-initiative") ||
      combatantElement.querySelector(".combatant-initiative") ||
      combatantElement.querySelector("h4") ||
      combatantElement.querySelector(".combatant-name");
    if (!target) continue;

    const badge = document.createElement("span");
    badge.className = `sla-initiative-badge ${badgeClass}`;
    badge.textContent = badgeLabel;
    target.appendChild(badge);
  }
}

function isSlaPlayerCombatant(combatant) {
  const actor = combatant?.actor ?? combatant?.token?.actor ?? null;
  if (!actor || actor.type !== "character") return false;

  const disposition = combatant?.token?.disposition
    ?? combatant?._token?.disposition
    ?? actor?.prototypeToken?.disposition
    ?? null;

  if (actor.hasPlayerOwner) return true;
  if (disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return true;
  return false;
}

function getSlaInitiativeStatTotal(actor, attribute = "speed") {
  const stat = actor?.system?.stats?.[attribute] ?? {};
  return Math.max(0, (Number(stat.value ?? 0) || 0) + (Number(stat.mod ?? 0) || 0));
}

function getSlaInitiativeDrugState(actor) {
  const effects = SLADrugSystem.getActorDrugEffects(actor);
  const state = {
    mode: "normal",
    autoSuccess: false,
    autoSuccessLabel: "",
    note: "",
    sources: []
  };

  for (const effect of effects) {
    const flag = SLADrugSystem.getDrugEffectFlag(effect);
    const stage = String(flag?.stage ?? "").trim().toLowerCase();
    const drugId = SLADrugSystem.normalize(flag?.drugId ?? effect?.name ?? "");
    if (!drugId || !stage) continue;

    if (stage === "withdrawal") {
      state.mode = "disadvantage";
      state.sources.push(`${effect.name}: Withdrawal`);
      continue;
    }

    if (stage !== "active") continue;

    if (drugId === "blazeuv") {
      state.autoSuccess = true;
      state.autoSuccessLabel = "Blaze UV";
      state.note = "Automatic success. Declare your target before allies declare theirs.";
      state.sources.push(effect.name);
      continue;
    }
    if (drugId === "ultraviolence") {
      if (!state.autoSuccess) {
        state.autoSuccess = true;
        state.autoSuccessLabel = "Ultra Violence";
        state.note = "Automatic success.";
      }
      state.sources.push(effect.name);
      continue;
    }
    if (drugId === "rush" && state.mode !== "disadvantage") {
      state.mode = "advantage";
      state.sources.push(effect.name);
    }
  }

  return state;
}

async function chooseSlaInitiativeAttribute(combatant, drugState) {
  const actor = combatant?.actor;
  if (!actor) return null;

  return new Promise((resolve) => {
    const speed = getSlaInitiativeStatTotal(actor, "speed");
    const intellect = getSlaInitiativeStatTotal(actor, "intellect");
    const modeText = drugState.autoSuccess
      ? `${drugState.autoSuccessLabel}: automatic success.`
      : drugState.mode === "advantage"
        ? `Drug effect: roll with Advantage.`
        : drugState.mode === "disadvantage"
          ? `Drug effect: roll with Disadvantage.`
          : `No active initiative modifier.`;
    const noteText = drugState.note ? `<p>${drugState.note}</p>` : "";
    const sourceText = drugState.sources.length ? `<p><strong>Source:</strong> ${drugState.sources.join(", ")}</p>` : "";

    new foundry.applications.api.DialogV2({
      window: { title: `${combatant.name}: Initiative` },
      classes: ["macro-popup-dialog"],
      content: `
        <div class="macro_desc">
          <h4>Choose Initiative Stat</h4>
          <p>Roll <strong>Speed</strong> or <strong>Intellect</strong>. Success goes before enemies. Failure goes after enemies.</p>
          <p>${modeText}</p>
          ${noteText}
          ${sourceText}
          <label style="display:block; margin:10px 0;"><input type="radio" name="sla-init-attr" value="speed" checked> Speed (${speed})</label>
          <label style="display:block; margin:10px 0;"><input type="radio" name="sla-init-attr" value="intellect"> Intellect (${intellect})</label>
        </div>
      `,
      buttons: [
        {
          label: "Roll Initiative",
          action: "roll",
          icon: "fas fa-bolt",
          callback: (_event, button) => {
            const attribute = button.form.querySelector("input[name='sla-init-attr']:checked")?.value ?? "speed";
            resolve(attribute);
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

function buildSlaInitiativeScore({ success = false, critical = false, statTotal = 0, rollTotal = null, enemy = false } = {}) {
  if (enemy) return SLA_INITIATIVE_BRACKETS.enemy;

  const base = critical
    ? (success ? SLA_INITIATIVE_BRACKETS.critSuccess : SLA_INITIATIVE_BRACKETS.critFailure)
    : (success ? SLA_INITIATIVE_BRACKETS.success : SLA_INITIATIVE_BRACKETS.failure);
  const statTie = Math.max(0, Number(statTotal ?? 0) || 0) / 100;
  const rollTie = Number.isFinite(rollTotal) ? Math.max(0, 100 - Number(rollTotal)) / 10000 : 0;
  return Number((base + statTie + rollTie).toFixed(4));
}

async function postSlaInitiativeChat(combatant, result) {
  const actor = combatant?.actor;
  if (!actor) return;

  const autoText = result.autoSuccess ? `<div class="sla-chat-section sla-chat-section-success"><div class="body"><strong>${result.autoSuccessLabel}</strong>: automatic initiative success.</div>${result.note ? `<div class="body">${result.note}</div>` : ""}</div>` : "";
  const rollHtml = result.rollHtml ?? "";
  const outcome = result.success ? "Before Enemies" : "After Enemies";
  const critText = result.critical ? (result.success ? "Critical Success" : "Critical Failure") : "Standard Result";

  const content = `
    <div class="mosh sla-ebb-chat">
      <div class="rollcontainer">
        <div class="flexrow" style="margin-bottom: 5px;">
          <div class="rollweaponh1">${result.attributeLabel} Initiative</div>
          <div style="text-align: right"><img class="roll-image" src="systems/sla-mothership/images/icons/ui/attributes/${result.attribute}.png" /></div>
        </div>
        <div class="sla-chat-section sla-chat-section-ebb-meta">
          <div class="sla-chat-section-title">Initiative Bracket</div>
          <div class="body"><strong>${outcome}</strong></div>
          <div class="body"><strong>${critText}</strong></div>
          <div class="body">Stat used: <strong>${result.attributeLabel}</strong> ${result.statTotal}</div>
        </div>
        ${autoText}
        ${rollHtml}
      </div>
    </div>
  `;

  await ChatMessage.create({
    user: game.user.id,
    speaker: { actor: actor.id, token: combatant.token?.id ?? actor.token, alias: actor.name },
    content
  });
}

async function rollSlaCombatInitiative(combat, ids = [], options = {}) {
  if (!combat) return null;

  const updates = [];
  for (const id of ids) {
    const combatant = combat.combatants.get(id);
    if (!combatant) continue;
    const actor = combatant.actor ?? combatant.token?.actor ?? null;

    if (!isSlaPlayerCombatant(combatant)) {
      updates.push({
        _id: combatant.id,
        initiative: buildSlaInitiativeScore({ enemy: true }),
        flags: {
          "sla-mothership": {
            initiativeType: "enemy-bracket",
            initiativeAttribute: "",
            initiativeSuccess: null,
            initiativeCritical: null
          }
        }
      });
      continue;
    }

    const drugState = getSlaInitiativeDrugState(actor);
    const attribute = await chooseSlaInitiativeAttribute(combatant, drugState);
    if (!attribute) continue;

    const attributeLabel = actor.system?.stats?.[attribute]?.label ?? foundry.utils.capitalize(attribute);
    const statTotal = getSlaInitiativeStatTotal(actor, attribute);

    let success = true;
    let critical = false;
    let rollTotal = null;
    let rollHtml = "";

    if (!drugState.autoSuccess) {
      const rollString = drugState.mode === "advantage" ? "1d100 [+]" : drugState.mode === "disadvantage" ? "1d100 [-]" : "1d100";
      const parsedRollString = actor.parseRollString(rollString, "low");
      const roll = await new Roll(parsedRollString).evaluate();
      const parsed = actor.parseRollResult(rollString, roll, true, true, statTotal, "<", null);
      success = Boolean(parsed.success);
      critical = Boolean(parsed.critical);
      rollTotal = Number(parsed.total ?? roll.total ?? 0);
      rollHtml = `${parsed.outcomeHtml}${parsed.rollHtml}`;
    }

    const initiative = buildSlaInitiativeScore({
      success,
      critical,
      statTotal,
      rollTotal
    });

    updates.push({
      _id: combatant.id,
      initiative,
      flags: {
        "sla-mothership": {
          initiativeType: success ? "player-fast" : "player-slow",
          initiativeAttribute: attribute,
          initiativeSuccess: success,
          initiativeCritical: critical
        }
      }
    });

    await postSlaInitiativeChat(combatant, {
      attribute,
      attributeLabel,
      statTotal,
      success,
      critical,
      autoSuccess: drugState.autoSuccess,
      autoSuccessLabel: drugState.autoSuccessLabel,
      note: drugState.note,
      rollHtml
    });
  }

  if (updates.length) {
    await combat.updateEmbeddedDocuments("Combatant", updates);
  }

  return combat;
}

//tell user no character is selected
async function noCharSelected() {
  //wrap the whole thing in a promise, so that it waits for the form to be interacted with
  return new Promise(async (resolve) => {
    //init vars
    let errorMessage = ``;
    //create error text based on current settings
    if (game.settings.get('sla-mothership','macroTarget') === 'character') {
      errorMessage = `<h3>No Character Selected</h3>Macro Target is set to the currently selected character. To select a character, modify your User Configuration in the Players menu located in the lower-left of the interface.<br><br>If you prefer Macros to be run on the currently selected token(s) in the scene, you should change your settings accordingly.<br><br>`;
    } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
      errorMessage = `<h3>No Character Selected</h3>Macro Target is set to the currently selected token(s) in the scene. To select token(s), click or draw a box around token(s) in the current scene.<br><br>If you prefer Macros to be run on the currently selected character for your user, you should change your settings accordingly.<br><br>`;
    }
    //create final dialog data
    const dialogData = {
      window: {title: `Macro Issue`},
      classes: ["macro-popup-dialog"],
      content: errorMessage,
      buttons: [
        {
          label: `Ok`,
          action: 'action_ok',
          callback: () => { },
          icon: 'fas fa-check'
        }
      ]
    };
    //render dialog
    const dialog = new foundry.applications.api.DialogV2(dialogData).render({force: true});
    //log what was done
    slaDebug(`Told the user that no character was selected.`);
  });
}

//tell user no ship is selected
async function noShipSelected() {
  //wrap the whole thing in a promise, so that it waits for the form to be interacted with
  return new Promise(async (resolve) => {
    //init vars
    let errorMessage = ``;
    //create error text based on current settings
    if (game.settings.get('sla-mothership','macroTarget') === 'character') {
      errorMessage = `<h3>No Ship Selected</h3>Macro Target is set to the currently selected character. To select a ship, modify your User Configuration in the Players menu located in the lower-left of the interface.<br><br>If you prefer Macros to be run on the currently selected token(s) in the scene, you should change your settings accordingly.<br><br>`;
    } else if (game.settings.get('sla-mothership','macroTarget') === 'token') {
      errorMessage = `<h3>No Ship Selected</h3>Macro Target is set to the currently selected token(s) in the scene. To select token(s), click or draw a box around token(s) in the current scene.<br><br>If you prefer Macros to be run on the currently selected character for your user, you should change your settings accordingly.<br><br>`;
    }
    //create final dialog data
    const dialogData = {
      window: {title: `Macro Issue`},
      classes: ["macro-popup-dialog"],
      content: errorMessage,
      buttons: [
        {
          label: `Ok`,
          action: 'action_ok',
          callback: () => { },
          icon: 'fas fa-check'
        }
      ]
    };
    //render dialog
    const dialog = foundry.applications.api.DialogV2(dialogData).render({force: true});
    //log what was done
    slaDebug(`Told the user that no character was selected.`);
  });
}


/**
 * get element from world or compendiums by id or UUID, filtering by specific type.
 * @param {string} id_uuid                   The id or the full uuid of the element we want to retieve.
 * @param {object} options                   General search options for this function and for 'fromUuid'
 * @param {string} [options.type]            A string to filter the compendium type to search or the world element type. Valid values =["RollTable","Item","Macro","Actor","Adventure","Cards","JournalEntry","Playlist","Scene"]
 * @returns {Promise<Document|null>}         Returns the Document if it could be found, otherwise null.
 */
export async function fromIdUuid(id_uuid, options={}){
  let type = options.type;
  //first we try to find from UUID, asuming the parameter(id_uuid) is an UUID.
  let item = await fromUuid(id_uuid,options);
  if(item != null){
    //we found the item with the id_uuid, it probably was an uuid.
    return item;
  }

  //we need to manualy find the item
  let currentLocation = '';
  let objectLocation = '';
  //first loop through each compendium
  game.packs.forEach(function(pack){ 
    //is this a pack of rolltables?
    if (pack.metadata.type === type) {
      //log where we are
      currentLocation = pack.metadata.id;
      //loop through each pack to find the right table
      pack.index.forEach(function(pack_item) { 
        //is this our table?
        if (pack_item._id === id_uuid) {
          //grab the table location
          objectLocation = currentLocation;
        }
      });
    }
  });
  if (objectLocation){
    // Item found in a compendium -> get document data
    return await game.packs.get(objectLocation).getDocument(id_uuid);
  }else{
    //if we dont find it in a compendium, its probable a world item:
    //Lets filtery by type to search the relevant elements only.
    switch (type) {
      case "RollTable":
        return getTableFromId(id_uuid);
      case "Item":
        return getItemFromId(id_uuid);
      case "Macro":
        return getMacroFromId(id_uuid);
      case "Actor":
        return getActorFromId(id_uuid);
      case "Adventure":
        //adventures can only be defined in compendiums and not in the world (i think)
        return null;
      case "Cards":
        return getCardFromId(id_uuid);
      case "JournalEntry":
        return getJournalFromId(id_uuid);
      case "Playlist":
        return getPlaylistFromId(id_uuid);
      case "Scene":
        return getSceneFromId(id_uuid);

      default:
        //type is not defined, and we could not find it in a compendium,
        //now we search all world elements for the ID.
        //this could lead to conflicts since ID could not be unique.
        let tableData = getTableFromId(id_uuid);
        if (tableData){
          return tableData;
        }
        let itemData = getItemFromId(id_uuid);
        if (itemData){
          return itemData;
        }
        let macroData = getMacroFromId(id_uuid);
        if (macroData){
          return macroData;
        }
        let actorData = getActorFromId(id_uuid);
        if (actorData){
          return actorData;
        }
        let cardData = getCardFromId(id_uuid);
        if (cardData){
          return cardData;
        }
        let journalData = getJournalFromId(id_uuid);
        if (journalData){
          return journalData;
        }
        let scenneData = getSceneFromId(id_uuid);
        if (scenneData){
          return scenneData;
        }
        let playlistData = getPlaylistFromId(id_uuid);
        if (playlistData){
          return playlistData;
        }
      }
    //if we get here we have not found anything with that id.
    return null;
  }
  /**functions to get world defined elements by type and ID */ 
  function getSceneFromId(sceneId){
    return game.scenes.filter(i=> i.id == sceneId)[0];
  }
  function getPlaylistFromId(playlistId){
    return game.playlists.filter(i=> i.id == playlistId)[0];
  }
  function getJournalFromId(journalId){
    return game.journal.filter(i=> i.id == journalId)[0];
  }
  function getCardFromId(cardId){
    return game.cards.filter(i=> i.id == cardId)[0];
  }
  function getActorFromId(actorId){
    return game.actors.filter(i=> i.id == actorId)[0];
  }
  function getTableFromId(tableId){
    return game.tables.filter(i=> i.id == tableId)[0];
  }
  function getItemFromId(itemId){
    return game.items.filter(i=> i.id == itemId)[0];
  }
  function getMacroFromId(macroId){
    return game.macros.filter(i=> i.id == macroId)[0];
  }

}

/**
 * This function will format a number into a more readable string with appropriate suffixes.
 * For example, 1500 becomes "1.5K", 2000000 becomes "2M", etc.
 * It handles numbers in the trillions (t), billions (b), millions (m), and thousands (k).
 * It also handles negative numbers and zero.
 * At the end it appends 'cr' to denote credits.
 * @namespace formatCreditsNumber
 * @param {int} num Credits number to format.
 * @returns {string}  Credits , formatted string with appropriate suffix.
 */
export function formatCreditsNumber(num) {
  const absNum = Math.abs(num);

  if (absNum >= 1_000_000_000_000) {
    return (num / 1_000_000_000_000).toFixed(1).replace(/\.0$/, '') + 'tcr';
  } else if (absNum >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'bcr';
  } else if (absNum >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'mcr';
  } else if (absNum >= 1_000) {
    return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'kcr';
  } else {
    return num.toString() + 'cr';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA Industries Pause Screen Animation
// ─────────────────────────────────────────────────────────────────────────────

let slaPauseRefreshHandle = null;

function injectSlaPauseAnimation() {
  document.body?.classList.add("sla-pause-active");
  if (document.querySelector('.sla-pause-root')) {
    return;
  }

  const svgHTML = `
  <div class="sla-pause-root" aria-label="SLA Industries – Game Paused">
    <div class="sla-pause-stage">
    <svg class="sla-pause-svg" viewBox="-120 -120 240 260" xmlns="http://www.w3.org/2000/svg" role="img">
      <defs>
        <filter id="sla-glow-red" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <filter id="sla-glow-ring" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <radialGradient id="sla-bg-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1a0000" stop-opacity="0.95"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0.0"/>
        </radialGradient>
        <clipPath id="sla-clip-outer">
          <circle cx="0" cy="0" r="108"/>
        </clipPath>
      </defs>
      <circle cx="0" cy="0" r="108" fill="url(#sla-bg-grad)" class="sla-pause-core-glow"/>
      <g class="sla-ring-outer">
        <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="18s" repeatCount="indefinite"/>
        <circle cx="0" cy="0" r="90"
          fill="none"
          stroke="#8b1a1a"
          stroke-width="0.8"
          stroke-dasharray="6 4"
          opacity="0.7"
          filter="url(#sla-glow-ring)"
        />
        <circle cx="0"  cy="-90" r="5" fill="#cc2222" filter="url(#sla-glow-red)" class="sla-sat"/>
        <circle cx="77.9" cy="45" r="5" fill="#cc2222" filter="url(#sla-glow-red)" class="sla-sat"/>
        <circle cx="-77.9" cy="45" r="5" fill="#cc2222" filter="url(#sla-glow-red)" class="sla-sat"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(0)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(30)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(60)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(90)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(120)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(150)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(180)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(210)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(240)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(270)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(300)"/>
        <line x1="0" y1="-86" x2="0" y2="-94" stroke="#8b1a1a" stroke-width="1" transform="rotate(330)"/>
      </g>
      <g class="sla-ring-inner">
        <animateTransform attributeName="transform" type="rotate" from="360 0 0" to="0 0 0" dur="13s" repeatCount="indefinite"/>
        <circle cx="0" cy="0" r="62"
          fill="none"
          stroke="#6b1010"
          stroke-width="0.6"
          stroke-dasharray="4 6"
          opacity="0.6"
          filter="url(#sla-glow-ring)"
        />
        <circle cx="53.7"  cy="-31" r="3.5" fill="#dd4422" filter="url(#sla-glow-red)" class="sla-sat-inner"/>
        <circle cx="-53.7" cy="-31" r="3.5" fill="#dd4422" filter="url(#sla-glow-red)" class="sla-sat-inner"/>
        <circle cx="0"     cy="62"  r="3.5" fill="#dd4422" filter="url(#sla-glow-red)" class="sla-sat-inner"/>
      </g>
      <g filter="url(#sla-glow-red)" class="sla-pause-logo-core">
        <polygon
          points="0,-38 33,-19 33,19 0,38 -33,19 -33,-19"
          fill="#1a0000"
          stroke="#cc2222"
          stroke-width="1.2"
          opacity="0.9"
        />
        <text
          x="0" y="14"
          text-anchor="middle"
          font-family="'Oswald', 'Impact', 'Arial Narrow', sans-serif"
          font-size="38"
          font-weight="700"
          letter-spacing="3"
          fill="#ff2222"
          class="sla-pause-logo-text"
        >SLA</text>
      </g>
      <line x1="-70" y1="48" x2="70" y2="48" stroke="#8b1a1a" stroke-width="0.5" opacity="0.7"/>
      <text
        x="0" y="68"
        text-anchor="middle"
        font-family="'Oswald', 'Courier New', monospace"
        font-size="11.5"
        font-weight="500"
        letter-spacing="3.2"
        fill="#ff7b7b"
        class="sla-pause-standby"
      >PLEASE STAND BY</text>
      <text
        x="0" y="94"
        text-anchor="middle"
        font-family="'Oswald', 'Arial Narrow', sans-serif"
        font-size="8"
        font-weight="300"
        letter-spacing="3"
        fill="#b13b3b"
        opacity="0.92"
      >SLA INDUSTRIES</text>
      <line
        x1="0" y1="-90" x2="0" y2="0"
        stroke="#ff2222"
        stroke-width="0.8"
        opacity="0.18"
        class="sla-pause-scan"
      />
    </svg>
    </div>
  </div>`;
  document.body?.insertAdjacentHTML('beforeend', svgHTML);
}

function removeSlaPauseAnimation() {
  document.querySelector(".sla-pause-root")?.remove();
  document.body?.classList.remove("sla-pause-active");
}

function queueSlaPauseRefresh(delay = 0) {
  window.clearTimeout(slaPauseRefreshHandle);
  slaPauseRefreshHandle = window.setTimeout(() => {
    if (!game?.paused) return;
    injectSlaPauseAnimation();
  }, delay);
}

Hooks.once('ready', () => {
  if (game.paused) {
    queueSlaPauseRefresh(0);
    queueSlaPauseRefresh(60);
    queueSlaPauseRefresh(180);
  }
});

Hooks.on('pauseGame', (paused) => {
  if (paused) {
    requestAnimationFrame(() => requestAnimationFrame(() => injectSlaPauseAnimation()));
    queueSlaPauseRefresh(0);
    queueSlaPauseRefresh(60);
    queueSlaPauseRefresh(180);
    queueSlaPauseRefresh(360);
  } else {
    removeSlaPauseAnimation();
  }
});

function getSlaHtmlRoot(html) {
  return html instanceof HTMLElement ? html : html?.[0] ?? null;
}

function hideSlaRestrictedSidebarTabs() {
  [
    "#sidebar-tabs [data-tab='tables']",
    "#sidebar-tabs [aria-controls='tables']",
    "#sidebar-tabs [data-tab='compendium']",
    "#sidebar-tabs [aria-controls='compendium']"
  ].forEach((selector) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.closest("li")?.remove();
      if (el instanceof HTMLElement) el.remove();
    });
  });
}

function removeSlaElements(root, selectors = []) {
  selectors.forEach((selector) => {
    root.querySelectorAll(selector).forEach((el) => el.remove());
  });
}

function pruneEmptySlaFolders(root) {
  const folders = Array.from(root.querySelectorAll(".directory-item.folder"));
  folders.reverse().forEach((folder) => {
    const visibleDocuments = Array.from(folder.querySelectorAll(".directory-item.document, li.document")).filter((node) => node.offsetParent !== null);
    const visibleFolders = Array.from(folder.querySelectorAll(":scope > .directory-list > .directory-item.folder, :scope > ol > li.folder")).filter((node) => node.offsetParent !== null);
    if (!visibleDocuments.length && !visibleFolders.length) folder.remove();
  });
}

function shouldShowSlaPlayerJournal(entry) {
  if (!entry) return false;
  const name = String(entry.name ?? "").trim();
  if (/^operative handbook$/i.test(name)) return true;
  if (entry.getFlag?.("sla-mothership", "playerVisible") === true) return true;
  return entry.testUserPermission?.(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) ?? false;
}

function filterSlaJournalDirectory(root) {
  const rows = Array.from(root.querySelectorAll("[data-entry-id], [data-document-id]"));
  rows.forEach((row) => {
    const id = row.dataset.entryId ?? row.dataset.documentId;
    if (!id) return;
    const entry = game.journal?.get?.(id);
    if (!shouldShowSlaPlayerJournal(entry)) row.remove();
  });
  pruneEmptySlaFolders(root);
}

function enforceSlaPlayerDirectoryRestrictions(kind, html) {
  const root = getSlaHtmlRoot(html);
  if (!root || game.user?.isGM) return;

  removeSlaElements(root, [
    ".directory-header .header-actions",
    ".directory-header .action-buttons",
    ".sla-sidebar-actions",
    ".qbm-scene-directory-actions",
    ".qbm-launch",
    ".sla-world-tools-launch",
    ".sla-create-operative",
    ".sla-create-random-operative",
    ".sla-refresh-content",
    ".sla-gear-cache-open",
    ".sla-briefing-desk-open",
    ".sla-bpn-dispatch-open",
    ".sla-npc-director-open",
    ".sla-npc-director-actor-open",
    ".sla-ops-clock-open",
    ".npp-generate-sidebar-btn"
  ]);

  if (kind === "journal") {
    filterSlaJournalDirectory(root);
  }

  if (kind === "tables" || kind === "compendium") {
    root.innerHTML = "";
  }
}

function enforceSlaPlayerSidebarTabRestrictions(app, html) {
  const tabName = app?.tabName ?? app?.options?.id ?? "";
  if (tabName === "actors") return enforceSlaPlayerDirectoryRestrictions("actors", html);
  if (tabName === "scenes") return enforceSlaPlayerDirectoryRestrictions("scenes", html);
  if (tabName === "journal") return enforceSlaPlayerDirectoryRestrictions("journal", html);
  if (tabName === "tables") return enforceSlaPlayerDirectoryRestrictions("tables", html);
  if (tabName === "compendium") return enforceSlaPlayerDirectoryRestrictions("compendium", html);
  if (tabName === "combat") return enforceSlaPlayerDirectoryRestrictions("combat", html);
}

// ─────────────────────────────────────────────────────────────────────────────
// SLA Industries — UI Icon Injection
// Replaces Foundry's Font Awesome icons in the sidebar and scene controls
// by walking the live DOM and applying inline CSS mask-image styles.
// ─────────────────────────────────────────────────────────────────────────────

const SLA_ICON_BASE = "systems/sla-mothership/icons/ui/";

const SLA_SIDEBAR_ICONS = {
  chat:       "chat",
  combat:     "combat",
  scenes:     "scenes",
  actors:     "actors",
  items:      "items",
  journal:    "journal",
  tables:     "tables",
  playlists:  "playlists",
  compendium: "compendium",
  settings:   "settings",
};

const SLA_CONTROL_ICONS = {
  token:    "token",
  measure:  "measure",
  tiles:    "tiles",
  drawings: "drawings",
  walls:    "walls",
  lighting: "lighting",
  sounds:   "sounds",
  notes:    "notes",
};

function _slaApplyIconMask(el, iconFile) {
  const url = `${SLA_ICON_BASE}${iconFile}.svg`;
  // Measure font size BEFORE zeroing it — FA icons scale with font-size
  const fs = parseFloat(getComputedStyle(el).fontSize) || 18;
  const sz = Math.round(fs * 1.15) + "px";

  // font-size:0  → collapses the ::before FA glyph to nothing
  // currentColor → inherits the button's text colour (white/grey/active from Foundry)
  // mask         → cuts that fill into our SVG shape
  el.style.setProperty("font-size",        "0",                                       "important");
  el.style.setProperty("line-height",      "0",                                       "important");
  el.style.setProperty("width",            sz,                                        "important");
  el.style.setProperty("height",           sz,                                        "important");
  el.style.setProperty("display",          "inline-flex",                             "important");
  el.style.setProperty("align-items",      "center",                                  "important");
  el.style.setProperty("justify-content",  "center",                                  "important");
  el.style.setProperty("background-color", "currentColor",                            "important");
  el.style.setProperty("-webkit-mask",     `url('${url}') center/contain no-repeat`,  "important");
  el.style.setProperty("mask",             `url('${url}') center/contain no-repeat`,  "important");
  el.setAttribute("data-sla-icon", iconFile);
}

function injectSlaIcons() {
  let found = 0;

  // ── Sidebar tab icons ─────────────────────────────────────────────────
  // Foundry v13 confirmed structure:
  //   <button class="ui-control plain icon fa-solid fa-comments" data-tab="chat" ...>
  // The BUTTON itself is the icon — no child <i> element.
  document.querySelectorAll(
    "#sidebar-tabs button[data-tab], #sidebar-tabs [data-tab].icon"
  ).forEach(btn => {
    const name = btn.dataset.tab;
    const file = SLA_SIDEBAR_ICONS[name];
    if (!file || btn.hasAttribute("data-sla-icon")) return;
    _slaApplyIconMask(btn, file);
    found++;
  });

  // ── Scene / layer control icons ───────────────────────────────────────
  // Foundry v13 scene controls are also buttons — search the whole doc
  // since we don't yet know the container ID.
  document.querySelectorAll(
    "button[data-control], [data-control].icon, [data-control].ui-control"
  ).forEach(btn => {
    const name = btn.dataset.control;
    const file = SLA_CONTROL_ICONS[name];
    if (!file || btn.hasAttribute("data-sla-icon")) return;
    _slaApplyIconMask(btn, file);
    found++;
  });

  if (found > 0) {
    console.log(`SLA Industries | Applied ${found} custom icons.`);
  } else {
    console.warn("SLA Industries | injectSlaIcons: no icons matched — dumping HTML:");
    console.warn("sidebar:", document.querySelector("#sidebar-tabs")?.outerHTML?.slice(0, 1200));
    const ctrlDump = document.querySelector("#ui-left, #scene-controls, #controls");
    console.warn("controls:", ctrlDump?.outerHTML?.slice(0, 1200) ?? "(not found — try: " + [...document.querySelectorAll("[data-control]")].map(e=>e.tagName+'.'+e.className).join(', ') + ")");
  }
}

// Run once on ready, then re-run whenever Foundry re-renders these components
Hooks.once("ready", () => {
  requestAnimationFrame(() => requestAnimationFrame(() => injectSlaIcons()));
});
Hooks.on("renderSidebar",       () => requestAnimationFrame(() => injectSlaIcons()));
Hooks.on("renderSidebarTab",    () => requestAnimationFrame(() => injectSlaIcons()));
Hooks.on("changeSidebarTab",    () => requestAnimationFrame(() => injectSlaIcons()));
Hooks.on("renderSceneControls", () => requestAnimationFrame(() => injectSlaIcons()));
