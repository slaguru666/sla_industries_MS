import { SLAMothershipGenerator } from "./sla-character-generator.js";

const SYSTEM_ID = "sla-mothership";

export class SLAWorldToolsApp extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sla-mothership-world-tools",
      classes: ["mosh", "sheet", "sla-world-tools"],
      template: "systems/sla-mothership/templates/dialogs/sla-world-tools.html",
      width: 560,
      height: "auto",
      submitOnChange: false,
      closeOnSubmit: false
    });
  }

  get title() {
    return "SLA Mothership Tools";
  }

  async getData() {
    const seededItems = game.items.filter((item) => item.flags?.[SYSTEM_ID]?.slaSeed?.key);
    const actors = game.actors.filter((actor) => actor.type === "character");
    const ebbActors = actors.filter((actor) => ["Ebon", "Brain Waster"].includes(String(actor.system?.sla?.species?.value ?? "").trim()));

    return {
      seededItems: seededItems.length,
      skillCount: seededItems.filter((item) => item.type === "skill").length,
      weaponCount: seededItems.filter((item) => item.type === "weapon").length,
      gearCount: seededItems.filter((item) => item.flags?.[SYSTEM_ID]?.slaSeed?.kind === "gear").length,
      actorCount: actors.length,
      starterCount: actors.filter((actor) => actor.flags?.[SYSTEM_ID]?.slaStarter).length,
      ebbActorCount: ebbActors.length,
      quickBattleMapBuilderReady: Boolean(game.modules?.get("quick-battlemap-builder")?.active && game.quickBattleMapBuilder?.open)
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".seed-world").on("click", async () => {
      await game.slaMothership.seedWorldContent({ overwrite: false, notify: true });
      this.render(false);
    });

    html.find(".refresh-world").on("click", async () => {
      await game.slaMothership.seedWorldContent({ overwrite: true, notify: true });
      this.render(false);
    });

    html.find(".open-generator").on("click", () => {
      game.slaMothership.openGenerator();
    });

    html.find(".generate-random").on("click", async () => {
      await game.slaMothership.createRandomOperative({ openSheet: true });
      this.render(false);
    });

    html.find(".generate-random-ebb").on("click", async () => {
      await SLAMothershipGenerator.createRandomEbbOperative({ openSheet: true });
      this.render(false);
    });

    html.find(".generate-random-standard").on("click", async () => {
      await SLAMothershipGenerator.createRandomNonEbbOperative({ openSheet: true });
      this.render(false);
    });

    html.find(".starter-squad").on("click", async () => {
      await game.slaMothership.createStarterSquad({ overwrite: false, notify: true });
      this.render(false);
    });

    html.find(".open-battlemap-builder").on("click", () => {
      game.quickBattleMapBuilder?.open?.();
    });
  }

  async _updateObject() {}

  static open() {
    return new SLAWorldToolsApp().render({ force: true });
  }
}

export function installSlaSidebarButtons(app, html) {
  const canManage = Boolean(game.user?.isGM);
  if (!canManage) return;

  const root = $(html);
  if (root.find(".sla-create-random-operative").length) return;

  const toolContainer = findToolContainer(root);
  if (!toolContainer?.length) return;

  const toolsButton = $(`
    <button type="button" class="sla-world-tools-launch">
      <i class="fas fa-toolbox"></i> SLA Tools
    </button>
  `);
  toolsButton.on("click", () => SLAWorldToolsApp.open());

  const createButton = $(`
    <button type="button" class="sla-create-operative">
      <i class="fas fa-user-secret"></i> Create SLA Operative
    </button>
  `);
  createButton.on("click", () => SLAMothershipGenerator.open());

  const randomButton = $(`
    <button type="button" class="sla-create-random-operative">
      <i class="fas fa-dice"></i> Random SLA Operative
    </button>
  `);
  randomButton.on("click", async () => {
    await SLAMothershipGenerator.createRandomOperative({ openSheet: true });
  });

  const refreshButton = $(`
    <button type="button" class="sla-refresh-content">
      <i class="fas fa-rotate"></i> Refresh Content
    </button>
  `);
  refreshButton.on("click", async () => {
    await game.slaMothership.seedWorldContent({ overwrite: true, notify: true });
  });

  toolContainer.append(randomButton, createButton, toolsButton, refreshButton);
}

function findToolContainer(root) {
  const header = root.find(".directory-header, header").first();
  if (!header.length) return null;
  const existing = header.find(".sla-sidebar-actions");
  if (existing.length) return existing.first();

  const actionRow = header.find(".header-actions, .action-buttons").first();
  const toolRow = $('<div class="sla-sidebar-actions"></div>');
  if (actionRow.length) {
    actionRow.after(toolRow);
  } else {
    header.prepend(toolRow);
  }
  return toolRow;
}
