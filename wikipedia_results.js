const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Signals = imports.signals;
const Separator = imports.ui.separator;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;
const WikipediaSearchSuggestion = Me.imports.wikipedia_search_suggestion;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const WikipediaResults = new Lang.Class({
    Name: "WikipediaResults",

    _init: function(extension_object) {
        this._extension_object = extension_object;

        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'wikipedia-results-box'
        })
        this._table = new St.Table({
            homogeneous: false
        });
        let separator = new Separator.HorizontalSeparator({
            style_class: 'search-section-separator'
        });

        this._suggestion =
            new WikipediaSearchSuggestion.WikipediaSearchSuggestion();
        this._suggestion.label = _("Did you mean: ");
        this._suggestion.connect("suggestion-activated",
            Lang.bind(this, function(o) {
                let default_lang = Utils.SETTINGS.get_string(
                    Prefs.WIKI_DEFAULT_LANGUAGE
                );
                let current_language =
                    this._extension_object._wikipedia_language;
                let language = '';

                if(current_language != default_lang) {
                    language = current_language;
                }

                this._extension_object.run_wiki_search(o.suggestion, language);
            })
        );

        this.actor.add(this._suggestion.actor, {
            x_expand: false,
            x_fill: false,
            y_expand: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
        this.actor.add(this._table);
        this.actor.add_child(separator.actor);
    },

    set_results: function(results) {
        let row = 1;
        let max_columns = Utils.SETTINGS.get_int(Prefs.WIKI_MAX_RESULT_COLUMNS);

        for(let i = 0; i < results.length; i++) {
            let result = results[i];
            let column = i % max_columns;
            result.connect("clicked", Lang.bind(this, function() {
                this.emit("activate", result);
            }));
            this._table.add(result.actor, {
                row: row,
                col: column,
                x_expand: true,
                y_expand: true,
                x_fill: true,
                y_fill: false,
                x_align: St.Align.MIDDLE,
                y_align: St.Align.MIDDLE
            });

            if(column === max_columns - 1) row++;
        }
    },

    clear: function() {
        this._suggestion.hide();
        this._table.destroy_all_children();
    },

    show_suggestion_if_exist: function() {
        if(!this._suggestion.is_empty) {
            this._suggestion.show();
        }
        else {
            this._suggestion.hide();
        }
    },

    show_suggestion: function() {
        this._suggestion.show();
    },

    hide_suggestion: function() {
        this._suggestion.hide();
    },

    remove_suggestion: function() {
        this._suggestion.suggestion = '';
    },

    set_suggestion: function(text) {
        this._suggestion.suggestion = text;
    }
});
Signals.addSignalMethods(WikipediaResults.prototype);
