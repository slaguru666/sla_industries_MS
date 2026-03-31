import { rolltableConfig } from "./windows/settings-rolltables.js";
import { SLAWorldToolsApp } from "./windows/sla-world-tools.js";
import { slaDebug, slaInfo } from "./logger.js";

export const registerSettings = function () {
  game.settings.register('sla-mothership', 'debugLogging', {
    name: "Debug Logging",
    hint: "Enable verbose SLA Mothership debug logging in the browser console.",
    default: false,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      slaInfo(`Debug logging ${value ? "enabled" : "disabled"}.`);
    }
  });
  
  game.settings.register('sla-mothership', 'firstEdition', {
    name: "1e Rules",
    hint: "Use the 1st edition rules and character sheet.",
    default: true,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      slaDebug("firstEdition set to", value);
      //get list of actors
      let actorList = game.actors;
      let actorName = '';
      let maxStart = null;
      let maxEnd = null;
      //only make changes if calm is false
      if (game.settings.get('sla-mothership','useCalm') === false) {
        //if setting is now true
        if (value) {
          //loop through all actors and update their maximum stress
            //get list of actors
            let actorList = game.actors;
            //loop through each actor
            actorList.forEach(function(actor){ 
              //loop through each result
              if (actor.type === 'character') {
                //set character name
                actorName = actor.name;
                //set current values
                maxStart = actor.system.other.stress.max;
                //set max stress to 20
                actor.update({'system.other.stress.max': 20});
                //set final values
                actorList = game.actors;
                maxEnd = 20;
                //log change
                slaDebug(`${actorName} stress.max changed from ${maxStart} to ${maxEnd}`);
                //rerender this sheet
                actor.render();
              }
            });
        //if value is now false
        } else {
          //loop through all actors and update their maximum stress
            //get list of actors
            let actorList = game.actors;
            //loop through each actor
            actorList.forEach(function(actor){ 
              //loop through each result
              if (actor.type === 'character') {
                //set character name
                actorName = actor.name;
                //set current values
                maxStart = actor.system.other.stress.max;
                //set max stress to 999
                actor.update({'system.other.stress.max': 999});
                //set final values
                actorList = game.actors;
                maxEnd = 999;
                //log change
                slaDebug(`${actorName} stress.max changed from ${maxStart} to ${maxEnd}`);
                //rerender this sheet
                actor.render();
              }
            });
        }
      } else {
        //get list of actors
        let actorList = game.actors;
        //loop through each actor
        actorList.forEach(function(actor){ 
          //loop through each result
          if (actor.type === 'character') {
            //log change
            slaDebug("First Edition switched to", value);
            //rerender this sheet
            actor.render();
          }
        });
      }
    }
  });

  game.settings.register('sla-mothership', 'macroTarget', {
    name: "Macro Target",
    hint: "Who should be the target for macros?",
    default: "character",
    scope: 'world',
    type: String,
    choices: {
      "character": "Currently selected character for the player",
      "token": "Currently selected token(s) in the scene"
    },
    config: true,
    onChange: value => {
      //log the change
      slaDebug("Macro target set to", value);
    }
  });

  game.settings.register('sla-mothership', 'critDamage', {
    name: "Critical Hit Damage",
    hint: "What should the damage be on a critical hit?",
    default: "advantage",
    scope: 'world',
    type: String,
    choices: {
      "advantage": "Roll with advantage",
      "doubleDamage": "Double the damage result",
      "doubleDice": "Double the damage dice",
      "maxDamage": "Maximum possible damage result",
      "weaponValue": "Defer to each weapon's critical damage",
      "none": "No critical damage"
    },
    config: true,
    onChange: value => {
      //log the change
      slaDebug("Critical hits set to", value);
    }
  });

  game.settings.register('sla-mothership', 'damageDiceTheme', {
    name: "Damage Dice Theme",
    hint: "If DiceSoNice is installed, what theme should be applied to damage dice?",
    default: "damage",
    scope: 'world',
    type: String,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("Damage dice theme set to", value);
    }
  });

  game.settings.register('sla-mothership', 'panicDieTheme', {
    name: "Panic Die Theme",
    hint: "If DiceSoNice is installed, what theme should be applied to the panic die?",
    default: "panic",
    scope: 'world',
    type: String,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("Panic die theme set to", value);
    }
  });

  game.settings.register('sla-mothership', 'hideWeight', {
    name: "Hide 0e Weight",
    hint: "Hide the 0e weight mechanic in the items list for players and ships?",
    default: true,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("hideWeight set to", value);
    }
  });

  game.settings.register('sla-mothership', 'drugReminderMinutes', {
    name: "Drug Reminder Interval",
    hint: "How often should the GM receive a chat reminder about active SLA drugs? Set to 0 to disable reminders.",
    default: 15,
    scope: 'world',
    type: Number,
    config: true,
    onChange: value => {
      slaDebug("drugReminderMinutes set to", value);
      game.slaMothership?.restartDrugReminders?.();
    }
  });
  
  game.settings.register('sla-mothership', 'useCalm', {
    name: "Use Calm?",
    hint: "Uses the traaa.sh Calm system instead of Stress.",
    default: false,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("useCalm set to", value);
      //get list of actors
      let actorList = game.actors;
      let actorName = '';
      let minStart = null;
      let valueStart = null;
      let maxStart = null;
      let labelStart = '';
      let minEnd = null;
      let valueEnd = null;
      let maxEnd = null;
      let labelEnd = '';
      //if setting is now true
      if (value) {
        //loop through all actors and update their stress values
        actorList.forEach(function(actor){ 
          //loop through each result
          if (actor.type === 'character') {
            //set character name
            actorName = actor.name;
            //set current values
            minStart = actor.system.other.stress.min;
            valueStart = actor.system.other.stress.value;
            maxStart = actor.system.other.stress.max;
            labelStart = actor.system.other.stress.label;
            //update max calm
              //set max calm to 85 if min stress is 2
              if (minStart === 2) {
                actor.update({'system.other.stress.max': 85});
                maxEnd = 85;
              //otherwise convert the min stress to max calm
              } else {
                actor.update({'system.other.stress.max': Math.round(85-(actor.system.other.stress.value*3))});
                maxEnd = Math.round(85-(actor.system.other.stress.value*3));
              }
            //set min stress to 0
            actor.update({'system.other.stress.min': 0});
            minEnd = 0;
            //update calm
              //set calm to 85 if stress is 2
              if (valueStart === 2) {
                actor.update({'system.other.stress.value': 85});
                valueEnd = 85;
              //otherwise convert stress to calm
              } else {
                actor.update({'system.other.stress.value': Math.round(85-(actor.system.other.stress.value*3))});
                valueEnd = Math.round(85-(actor.system.other.stress.value*3));
              }
            //set stress label to Calm
            actor.update({'system.other.stress.label': 'Calm'});
            labelEnd = 'Calm';
            //log change
            slaDebug(`${actorName} stress.min changed from ${minStart} to ${minEnd}`);
            slaDebug(`${actorName} stress.value changed from ${valueStart} to ${valueEnd}`);
            slaDebug(`${actorName} stress.max changed from ${maxStart} to ${maxEnd}`);
            slaDebug(`${actorName} stress.label changed from ${labelStart} to ${labelEnd}`);
            //rerender this sheet
            actor.render();
          }
        });
      //if value is now false
      } else {
        //loop through all actors and update their stress values
        actorList.forEach(function(actor){ 
          //loop through each result
          if (actor.type === 'character') {
            //set character name
            actorName = actor.name;
            //set current values
            minStart = actor.system.other.stress.min;
            valueStart = actor.system.other.stress.value;
            maxStart = actor.system.other.stress.max;
            labelStart = actor.system.other.stress.label;
            //convert maximum calm to min stress
              //set min stress to 20 if > 20
              if (Math.round((85-actor.system.other.stress.max)/3) > 20) {
                actor.update({'system.other.stress.min': 20});
                minEnd = 20;
              //set min stress to 2 if < 2
              } else if (Math.round((85-actor.system.other.stress.max)/3) < 2) {
                actor.update({'system.other.stress.min': 2});
                minEnd = 2;
              //regular value
              } else {
                actor.update({'system.other.stress.min': Math.round((85-actor.system.other.stress.max)/3)});
                minEnd = Math.round((85-actor.system.other.stress.max)/3);
              }
            //set max stress based on current system setting
            if (game.settings.get('sla-mothership','firstEdition')) {
              //set max stress to 20
              actor.update({'system.other.stress.max': 20});
              maxEnd = 20;
            } else {
              //set max stress to 999
              actor.update({'system.other.stress.max': 999});
              maxEnd = 999;
            }
            //convert calm to stress
            actor.update({'system.other.stress.value': Math.round((85-actor.system.other.stress.value)/3)});
            valueEnd = Math.round((85-actor.system.other.stress.value)/3);
            //set stress label to Stress
            actor.update({'system.other.stress.label': 'Stress'});
            labelEnd = 'Stress'
            //log change
            slaDebug(`${actorName} stress.min changed from ${minStart} to ${minEnd}`);
            slaDebug(`${actorName} stress.value changed from ${valueStart} to ${valueEnd}`);
            slaDebug(`${actorName} stress.max changed from ${maxStart} to ${maxEnd}`);
            slaDebug(`${actorName} stress.label changed from ${labelStart} to ${labelEnd}`);
            //rerender this sheet
            actor.render();
          }
        });
      }

    }
  });

  game.settings.register('sla-mothership', 'androidPanic', {
    name: "Use Android Panic Tables?",
    hint: "Adds android-specific tables for Panic and Calm checks.",
    default: false,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("androidPanic set to", value);
    }
  });

  game.settings.register('sla-mothership', 'autoStress', {
    name: "Auto Stress Gain on Failures?",
    hint: "Automatically handles stress gain on a failed roll.",
    default: true,
    scope: 'world',
    type: Boolean,
    config: true,
    onChange: value => {
      //log the change
      slaDebug("autoStress set to", value);
    }
  });

  game.settings.registerMenu('sla-mothership', 'rolltableSelector', {
    name: "Rolltable Configuration",
    label: "Choose Tables",
    hint: "Customize which rolltables are used.",
    icon: "fa-solid fa-list",
    type: rolltableConfig
  });

  game.settings.registerMenu('sla-mothership', 'worldTools', {
    name: "SLA World Tools",
    label: "Open Tools",
    hint: "Launch the SLA Mothership generator, world seeding actions, and starter squad tools.",
    icon: "fa-solid fa-toolbox",
    type: SLAWorldToolsApp,
    restricted: true
  });

  game.settings.register('sla-mothership', 'table0ePanicStressNormal', {
    scope: 'world',
    config: false,
    type: String,
    default: "1vCm4ElRPotQXgNB"
  });

  game.settings.register('sla-mothership', 'table0ePanicStressAndroid', {
    scope: 'world',
    config: false,
    type: String,
    default: "egJ11m2mJM3HBd6d"
  });

  game.settings.register('sla-mothership', 'table0ePanicCalmNormal', {
    scope: 'world',
    config: false,
    type: String,
    default: "kqKpQAXyLTEEyz6Z"
  });

  game.settings.register('sla-mothership', 'table0ePanicCalmAndroid', {
    scope: 'world',
    config: false,
    type: String,
    default: "VW6HQ29T7zClNIZ6"
  });

  game.settings.register('sla-mothership', 'table1ePanicStressNormal', {
    scope: 'world',
    config: false,
    type: String,
    default: "ypcoikqHLhnc9tNs"
  });

  game.settings.register('sla-mothership', 'table1ePanicStressAndroid', {
    scope: 'world',
    config: false,
    type: String,
    default: "aBnY19jlhPXzibCt"
  });

  game.settings.register('sla-mothership', 'table1ePanicCalmNormal', {
    scope: 'world',
    config: false,
    type: String,
    default: "MOYI6Ntj5OVFYk06"
  });

  game.settings.register('sla-mothership', 'table1ePanicCalmAndroid', {
    scope: 'world',
    config: false,
    type: String,
    default: "GCtYeCCQVQJ5M6SE"
  });

  game.settings.register('sla-mothership', 'table1eWoundBluntForce', {
    scope: 'world',
    config: false,
    type: String,
    default: "31YibfjueXuZdNLb"
  });

  game.settings.register('sla-mothership', 'table1eWoundBleeding', {
    scope: 'world',
    config: false,
    type: String,
    default: "ata3fRz3uoPfNCLh"
  });

  game.settings.register('sla-mothership', 'table1eWoundGunshot', {
    scope: 'world',
    config: false,
    type: String,
    default: "XjDU2xFOWEasaZK0"
  });

  game.settings.register('sla-mothership', 'table1eWoundFireExplosives', {
    scope: 'world',
    config: false,
    type: String,
    default: "lqiaWwh5cGcJhvnu"
  });

  game.settings.register('sla-mothership', 'table1eWoundGoreMassive', {
    scope: 'world',
    config: false,
    type: String,
    default: "uVfC1CqYdojaJ7yR"
  });

  game.settings.register('sla-mothership', 'table0eDeath', {
    scope: 'world',
    config: false,
    type: String,
    default: "cZOHlhEJcYGZsQBM"
  });

  game.settings.register('sla-mothership', 'table1eDeath', {
    scope: 'world',
    config: false,
    type: String,
    default: "W36WFIpCfMknKgHy"
  });

  game.settings.register('sla-mothership', 'table1eDistressSignal', {
    scope: 'world',
    config: false,
    type: String,
    default: "UxAjAqUTjYTcCbS8"
  });

  game.settings.register('sla-mothership', 'table1eMegadamageEffects', {
    scope: 'world',
    config: false,
    type: String,
    default: "AqGWwoWXzijFs427"
  });

  game.settings.register('sla-mothership', 'table1eMaintenance', {
    scope: 'world',
    config: false,
    type: String,
    default: "kqz8GsFVPfjvqO0N"
  });

  game.settings.register('sla-mothership', 'table1eBankruptcy', {
    scope: 'world',
    config: false,
    type: String,
    default: "BsfdIl7CJNs1PViS"
  });

};
