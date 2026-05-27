import { MothershipCreatureSheet } from "./creature-sheet.js";

/**
 * Extend MothershipCreatureSheet for the streamlined NPC (creature) actor sheet.
 * Displays a single-page, tab-free dashboard with core stats and equipment.
 * @extends {MothershipCreatureSheet}
 */
export class MothershipNpcSheet extends MothershipCreatureSheet {

    /** @override */
    static get defaultOptions() {
        const options = {
            classes: ["mosh", "sheet", "actor", "creature", "npc-sheet"],
            template: "systems/sla-mothership/templates/actor/npc-sheet.html",
            width: 720,
            height: 680,
            tabs: [], // Disable tabs
            submitOnChange: true
        };

        return foundry.utils.mergeObject(super.defaultOptions, options);
    }

    /** @override */
    async getData() {
        const data = await super.getData();

        // Limit the displayed skills to a maximum of 5
        if (data.skills) {
            data.skills = data.skills.slice(0, 5);
        }
        
        // Flag to show/hide the "Add Skill" button based on 5-skill constraint
        data.showAddSkill = (!data.skills || data.skills.length < 5);

        return data;
    }

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        if (!this.options.editable) return;

        // Custom Wound Roll Button Click
        html.find('.npc-wound-roll').click(async ev => {
            ev.preventDefault();
            await this.actor.chooseSlaWoundTable();
        });

        // Custom Panic Roll Button Click
        html.find('.npc-panic-roll').click(async ev => {
            ev.preventDefault();
            await this.actor.rollTable("panicCheck", null, null, null, null, null, null);
        });
    }
}
