const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Signals = imports.signals;
const Separator = imports.ui.separator;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaSearchSuggestion = Me.imports.wikipedia_search_suggestion;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const WikipediaResultsStatus = new Lang.Class({
    Name: 'WikipediaResultsStatus',

    _init: function(relative_actor) {
        this.actor = new St.BoxLayout({
            style_class: 'wikipedia-status-box' + Utils.get_style_postfix()
        });

        this._label = new St.Label();
        this.actor.add(this._label, {
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        this._relative_actor = relative_actor;
        this._overview_search_results = Main.overview.viewSelector._searchResults;
    },

    _reposition: function() {
        let [x, y] = this._relative_actor.get_transformed_position();
        this.actor.x = Math.floor(
            x + this._relative_actor.width / 2 - this.actor.width / 2
        );
        this.actor.y = Math.floor(
            y + this._relative_actor.height / 2 - this.actor.height / 2
        );
    },

    show_message: function(text) {
        this._label.set_text(text);
        this.show();
    },

    show: function() {
        this._overview_search_results._statusBin.hide();
        this._reposition();

        if(this._overview_search_results._content.contains(this.actor)) return;
        this._overview_search_results._content.insert_child_at_index(
            this.actor,
            0
        );
    },

    hide: function() {
        if(!this._overview_search_results._content.contains(this.actor)) return;
        this._overview_search_results._content.remove_child(this.actor);
    },

    destroy: function() {
        delete this._relative_actor;
        delete this._overview_search_results;
        this.actor.destroy();
    }
});

const WikipediaResultsView = new Lang.Class({
    Name: "WikipediaResultsView",

    _init: function(wikipedia_search_provider) {
        this._wikipedia_search_provider = wikipedia_search_provider;

        this.actor = new St.BoxLayout({
            vertical: true,
            style_class: 'wikipedia-results-box'
        })

        this._table = new St.Table({
            homogeneous: false
        });
        this._separator = new Separator.HorizontalSeparator({
            style_class: 'search-section-separator'
        });

        this._status = new WikipediaResultsStatus(this.actor);

        this._suggestion =
            new WikipediaSearchSuggestion.WikipediaSearchSuggestion();
        this._suggestion.label = _("Did you mean: ");
        this._suggestion.connect(
            "suggestion-activated",
            Lang.bind(this, this._on_suggestion_activated)
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
        this.actor.add_child(this._separator.actor);
    },

    _on_suggestion_activated: function(wikipedia_search_suggestion) {
        let default_lang = Utils.SETTINGS.get_string(
            PrefsKeys.DEFAULT_LANGUAGE
        );
        let current_language =
            this._wikipedia_search_provider._wikipedia_language;
        let language = '';

        if(current_language !== default_lang) {
            language = current_language;
        }

        this._wikipedia_search_provider.run_wiki_search(
            wikipedia_search_suggestion.suggestion,
            language
        );
    },

    set_results: function(results) {
        this._status.hide();
        this.clear();

        let row = 1;
        let max_columns = Utils.SETTINGS.get_int(PrefsKeys.MAX_RESULT_COLUMNS);

        for(let i = 0; i < results.length; i++) {
            let result = results[i];
            let column = i % max_columns;
            result.connect("clicked",
                Lang.bind(this, function() {
                    this.emit("activate", result);
                })
            );
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
    },

    show_message: function(text) {
        this.clear();
        this._status.show_message(text);
    },

    hide_message: function() {
        this._status.hide();
    },

    show: function() {
        this.actor.show();
    },

    hide: function() {
        this.actor.hide();
    },

    destroy: function() {
        this.actor.destroy();
        this._status.destroy();
        this._separator.destroy();
        this._suggestion.destroy();
    }
});
Signals.addSignalMethods(WikipediaResultsView.prototype);
