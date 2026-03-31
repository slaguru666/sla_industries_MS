export class rolltableConfig extends FormApplication {
    static get defaultOptions() {
        const options = super.defaultOptions;
        console.log(options);
        //options.id = 'sheet-modifiers';
        //options.classes = ["mosh", "sheet", "actor", "ship"];
        options.id = 'rolltable-modifiers';
        options.classes = ["mosh"];
        options.template = 'systems/sla-mothership/templates/dialogs/settings-rolltableconfig-dialog.html';
        options.width = 800;
        options.height = 'auto';
        options.resizeable = false;
        options.submitOnChange = true;
        options.submitOnClose = true;
        options.closeOnSubmit = false;
        return options;
    }

    /**
     * Construct and return the data object used to render the HTML template for this form application.
     * @return {Object}
     */
    getData() {
        const tableSelection = super.getData();
        tableSelection.table0ePanicStressNormal = game.settings.get("sla-mothership", "table0ePanicStressNormal");
        tableSelection.table0ePanicStressAndroid = game.settings.get("sla-mothership", "table0ePanicStressAndroid");
        tableSelection.table0ePanicCalmNormal = game.settings.get("sla-mothership", "table0ePanicCalmNormal");
        tableSelection.table0ePanicCalmAndroid = game.settings.get("sla-mothership", "table0ePanicCalmAndroid");
        tableSelection.table1ePanicStressNormal = game.settings.get("sla-mothership", "table1ePanicStressNormal");
        tableSelection.table1ePanicStressAndroid = game.settings.get("sla-mothership", "table1ePanicStressAndroid");
        tableSelection.table1ePanicCalmNormal = game.settings.get("sla-mothership", "table1ePanicCalmNormal");
        tableSelection.table1ePanicCalmAndroid = game.settings.get("sla-mothership", "table1ePanicCalmAndroid");
        tableSelection.table1eWoundBluntForce = game.settings.get("sla-mothership", "table1eWoundBluntForce");
        tableSelection.table1eWoundBleeding = game.settings.get("sla-mothership", "table1eWoundBleeding");
        tableSelection.table1eWoundGunshot = game.settings.get("sla-mothership", "table1eWoundGunshot");
        tableSelection.table1eWoundFireExplosives = game.settings.get("sla-mothership", "table1eWoundFireExplosives");
        tableSelection.table1eWoundGoreMassive = game.settings.get("sla-mothership", "table1eWoundGoreMassive");
        tableSelection.table0eDeath = game.settings.get("sla-mothership", "table0eDeath");
        tableSelection.table1eDeath = game.settings.get("sla-mothership", "table1eDeath");
        tableSelection.table1eDistressSignal = game.settings.get("sla-mothership", "table1eDistressSignal");
        tableSelection.table1eMegadamageEffects = game.settings.get("sla-mothership", "table1eMegadamageEffects");
        tableSelection.table1eMaintenance = game.settings.get("sla-mothership", "table1eMaintenance");
        tableSelection.table1eBankruptcy = game.settings.get("sla-mothership", "table1eBankruptcy");
        
        return tableSelection;
    }
    /* -------------------------------------------- */

    /** @override */
    activateListeners(html) {
        super.activateListeners(html);

        // Close Button
        html.find('.close-button').click(ev => {
            this.close()
        });
    }

    /**
     * This method is called upon form submission after form data is validated
     * @param event {Event}       The initial triggering submission event
     * @param formData {Object}   The object of validated form data with which to update the object
     * @private
     */
    async _updateObject(event, formData) {
        await Promise.all([
            game.settings.set("sla-mothership", "table0ePanicStressNormal", formData["table0ePanicStressNormal"]),
            game.settings.set("sla-mothership", "table0ePanicStressAndroid", formData["table0ePanicStressAndroid"]),
            game.settings.set("sla-mothership", "table0ePanicCalmNormal", formData["table0ePanicCalmNormal"]),
            game.settings.set("sla-mothership", "table0ePanicCalmAndroid", formData["table0ePanicCalmAndroid"]),
            game.settings.set("sla-mothership", "table1ePanicStressNormal", formData["table1ePanicStressNormal"]),
            game.settings.set("sla-mothership", "table1ePanicStressAndroid", formData["table1ePanicStressAndroid"]),
            game.settings.set("sla-mothership", "table1ePanicCalmNormal", formData["table1ePanicCalmNormal"]),
            game.settings.set("sla-mothership", "table1ePanicCalmAndroid", formData["table1ePanicCalmAndroid"]),
            game.settings.set("sla-mothership", "table1eWoundBluntForce", formData["table1eWoundBluntForce"]),
            game.settings.set("sla-mothership", "table1eWoundBleeding", formData["table1eWoundBleeding"]),
            game.settings.set("sla-mothership", "table1eWoundGunshot", formData["table1eWoundGunshot"]),
            game.settings.set("sla-mothership", "table1eWoundFireExplosives", formData["table1eWoundFireExplosives"]),
            game.settings.set("sla-mothership", "table1eWoundGoreMassive", formData["table1eWoundGoreMassive"]),
            game.settings.set("sla-mothership", "table0eDeath", formData["table0eDeath"]),
            game.settings.set("sla-mothership", "table1eDeath", formData["table1eDeath"]),
            game.settings.set("sla-mothership", "table1eDistressSignal", formData["table1eDistressSignal"]),
            game.settings.set("sla-mothership", "table1eMegadamageEffects", formData["table1eMegadamageEffects"]),
            game.settings.set("sla-mothership", "table1eMaintenance", formData["table1eMaintenance"]),
            game.settings.set("sla-mothership", "table1eBankruptcy", formData["table1eBankruptcy"])
        ]);

    }
}
