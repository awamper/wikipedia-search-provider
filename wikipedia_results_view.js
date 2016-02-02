const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Signals = imports.signals;
const Separator = imports.ui.separator;
const Clutter = imports.gi.Clutter;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaSearchSuggestion = Me.imports.wikipedia_search_suggestion;
const WikipediaResultView = Me.imports.wikipedia_result_view;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const MessagePage = new Lang.Class({
    Name: 'MessagePage',

    _init: function(msg) {
        this.id = -1;
        this.title = 'Wikipedia Search Provider';
        this.extract = msg;
        this.properties = {
            disambiguation: null,
            page_image: null
        };
        this.images = [];
        this.page_image_name = null;
        this.page_image = null;
        this.exists = true;
        this.has_main_image = false;

        this.data_loaded = true;
        this.images_loaded = true;
    },

    connect: function() {
        return 0;
    },

    destroy: function() {
        delete this.id;
        delete this.title;
        delete this.extract;
        delete this.properties;
        delete this.images;
        delete this.page_image_name;
        delete this.page_image;
        delete this.exists;
        delete this.has_main_image;
        delete this.data_loaded;
        delete this.images_loaded;
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


        this._table = new St.Widget({
            layout_manager: new Clutter.TableLayout()
        });
        this._separator = new Separator.HorizontalSeparator({
            style_class: 'search-section-separator'
        });

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
        let language = default_lang;

        if(current_language !== default_lang) {
            language = current_language;
        }

        this._wikipedia_search_provider.run_wiki_search(
            wikipedia_search_suggestion.suggestion,
            language
        );
    },

    set_results: function(results) {
        this.clear();
        Main.overview.viewSelector._searchResults._scrollView.show();

        let row = 1;
        let max_columns = Utils.SETTINGS.get_int(PrefsKeys.MAX_RESULT_COLUMNS);

        for(let i = 0; i < results.length; i++) {
            let result = results[i];
            let column = i % max_columns;
            result.connect("clicked",
                Lang.bind(this, function(actor, button) {
                    this.emit("activate", button, result);
                })
            );
            let layout = this._table.layout_manager;
            layout.pack(result.actor, column, row);

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

    show: function() {
        this.actor.show();
    },

    hide: function() {
        this.actor.hide();
    },

    show_message: function(message) {
        let view = new WikipediaResultView.WikipediaResultView(
            new MessagePage(message)
        );
        this.set_results([view]);
        this.show_suggestion_if_exist();
    },

    destroy: function() {
        this.actor.destroy();
        this._suggestion.destroy();
    },

    get n_results() {
        return this._table.get_n_children();
    }
});
Signals.addSignalMethods(WikipediaResultsView.prototype);
