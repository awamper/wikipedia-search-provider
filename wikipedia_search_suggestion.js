const St = imports.gi.St;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;

const ANIMATION_TIME = 0.5;

const WikipediaSearchSuggestion = new Lang.Class({
    Name: "WikipediaSearchSuggestion",

    _init: function() {
        let style_postfix = Utils.SETTINGS.get_boolean(
            Prefs.WIKI_ENABLE_DARK_THEME
        ) ? '-dark' : '';

        this.actor = new St.BoxLayout({
            visible: false,
            style_class: 'wikipedia-suggestion-box' + style_postfix
        });

        this._label = new St.Label({
            style_class: 'wikipedia-suggestion-label'
        });
        this._suggestion_button = new St.Button({
            style_class: 'wikipedia-suggestion-button'
        });
        this._suggestion_button.connect("clicked", Lang.bind(this, function() {
            this.emit("suggestion-activated")
        }));

        this.actor.add_child(this._label);
        this.actor.add_child(this._suggestion_button);
    },

    show: function() {
        if(this.actor.visible) return;

        this.actor.opacity = 0;
        this.actor.show();

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIME,
            opacity: 255,
            transition: 'easeOutQuad'
        })
    },

    hide: function() {
        if(!this.actor.visible) return;

        Tweener.removeTweens(this.actor);
        Tweener.addTween(this.actor, {
            time: ANIMATION_TIME,
            opacity: 0,
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                this.actor.hide();
            })
        })
    },

    set label(text) {
        this._label.set_text(text);
    },

    get label() {
        return this._label;
    },

    set suggestion(text) {
        this._suggestion_button.set_label(text);
    },

    get suggestion() {
        return this._suggestion_button.get_label();
    },

    get button() {
        return this._suggestion_button;
    },

    get is_empty() {
        return Utils.is_blank(this._suggestion_button.get_label());
    }
});
Signals.addSignalMethods(WikipediaSearchSuggestion.prototype);
