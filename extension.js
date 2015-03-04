const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaPage = Me.imports.wikipedia_page;
const WikipediaClient = Me.imports.wikipedia_client;
const WikipediaResultView = Me.imports.wikipedia_result_view;
const WikipediaResultsView = Me.imports.wikipedia_results_view;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const CONNECTION_IDS = {
    SHORTCUTS: 0,
    SHOW_FIRST: 0,
    KEY_RELEASE: 0,
    TEXT_CHANGED: 0,
    SCROLLVIEW_VISIBLE: 0
};
const TIMEOUT_IDS = {
    SEARCH: 0
}

const WikipediaSearchProvider = new Lang.Class({
    Name: "WikipediaSearchProvider",

    _init: function() {
        this._overview_search_results = Main.overview.viewSelector._searchResults;

        this._wikipedia_display =
            new WikipediaResultsView.WikipediaResultsView(this);
        this._wikipedia_display.connect(
            "activate",
            Lang.bind(this, this._on_activate)
        );
        this._wikipedia_language = Utils.SETTINGS.get_string(
            PrefsKeys.DEFAULT_LANGUAGE
        );
        this._wikipedia_client = new WikipediaClient.WikipediaClient();
        this._block_search_trigger = false;
        this._last_search = null;

        CONNECTION_IDS.KEY_RELEASE =
            Main.overview._searchEntry.clutter_text.connect(
                "key-release-event",
                Lang.bind(this, this._on_key_release)
            );
        CONNECTION_IDS.TEXT_CHANGED =
            Main.overview._searchEntry.clutter_text.connect(
                "text-changed",
                Lang.bind(this, this._on_text_changed)
            );
        CONNECTION_IDS.SCROLLVIEW_VISIBLE =
            Main.overview.viewSelector._searchResults._scrollView.connect(
                'notify::visible',
                Lang.bind(this, function() {
                    let visible = Main.overview.viewSelector._searchResults._scrollView.visible;
                    if(visible || !Main.overview._shown) return;

                    if(this._wikipedia_display.n_results > 0) {
                        Main.overview.viewSelector._searchResults._scrollView.show();
                    }
                })
            );
    },

    _on_key_release: function(object, event) {
        let symbol = event.get_key_symbol();
        let entry = Main.overview._searchEntry;
        let query = this._parse_query(entry.text);
        let ch = Utils.get_unichar(symbol);

        if(symbol === Clutter.BackSpace && query.wikipedia_query) {
            this._block_search_trigger = true;
            this._wikipedia_display.remove_suggestion();
            this.show_message(_("Enter your query"));
        }
        else if(ch) {
            if(query.lang) {
                this._wikipedia_language = query.lang;
            }
            else {
                this._wikipedia_language = Utils.SETTINGS.get_string(
                    PrefsKeys.DEFAULT_LANGUAGE
                );
            }

            this._start_search(query.term, this._wikipedia_language);
        }
    },

    _on_text_changed: function() {
        if(Utils.is_empty_entry(Main.overview._searchEntry)) {
            this._remove_timeout();
            this._wikipedia_display.hide();
            this._remove_wikipedia_display();
        }
    },

    _remove_timeout: function() {
        if(TIMEOUT_IDS.SEARCH > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.SEARCH);
            TIMEOUT_IDS.SEARCH = 0;
        }
    },

    _parse_query: function(terms_string) {
        let keyword = Utils.SETTINGS.get_string(PrefsKeys.KEYWORD);
        let regexp_string = "(%s|%s-(.*?)) (.*)".format(keyword, keyword);
        let wikipedia_query_regexp = new RegExp(regexp_string);
        let result = {
            lang: '',
            wikipedia_query: false,
            term: ''
        };
        if(!wikipedia_query_regexp.test(terms_string)) return result;

        result.wikipedia_query = true;
        let matches = wikipedia_query_regexp.exec(terms_string);
        let language = matches[2];
        let term = matches[3];
        if(!Utils.is_blank(language)) result.lang = language.trim();
        if(!Utils.is_blank(term)) result.term = term.trim();

        return result;
    },

    _search: function(term) {
        function on_search_result(error, result) {
            if(error || !result.query) {
                if(error) log(error);
                this.show_message(nothing_found_msg);
                return;
            }

            if(result.query.searchinfo !== undefined) {
                if(!Utils.is_blank(result.query.searchinfo.suggestion)) {
                    this._wikipedia_display.set_suggestion(
                        result.query.searchinfo.suggestion
                    );
                }
                else {
                    this._wikipedia_display.remove_suggestion();
                }
            }
            else {
                this._wikipedia_display.remove_suggestion();
            }

            if(!result.query.pages) {
                this.show_message(nothing_found_msg);
                return;
            }

            let n_results = Object.keys(result.query.pages).length;
            let n_pages_ready = 0;
            let results = [];

            for each(let page_data in result.query.pages) {
                let wikipedia_page = new WikipediaPage.WikipediaPage();
                wikipedia_page.lang = this._wikipedia_language;
                wikipedia_page.load_images = Utils.SETTINGS.get_boolean(
                    PrefsKeys.ENABLE_IMAGES
                );
                wikipedia_page.connect('data-loaded',
                    Lang.bind(this, function() {
                        n_pages_ready++;
                        let exclude_page =
                            Utils.SETTINGS.get_boolean(
                                PrefsKeys.EXCLUDE_DISAMBIGUATION_PAGES
                            )
                            && wikipedia_page.properties.disambiguation;

                        if(!exclude_page && wikipedia_page.exists) {
                            results.push(wikipedia_page);
                        }

                        if(n_pages_ready >= n_results) {
                            let entry_term = this._parse_query(
                                Main.overview._searchEntry.text
                            ).term;
                            if(entry_term !== term) return;
                            if(results.length > 0) this._show_results(results);
                            else this.show_message(nothing_found_msg);
                        }
                    })
                );
                wikipedia_page.load_data(page_data);
            }
        }

        let nothing_found_msg =
            _("Your search - ") + term +
            _(" - did not match any documents.\nLanguage: ") +
            this._wikipedia_language;
        let max_chars = Utils.SETTINGS.get_int(PrefsKeys.MAX_CHARS);
        let limit = Utils.SETTINGS.get_int(PrefsKeys.MAX_RESULTS);
        let actions = {
            action: 'query',
            prop: 'info|extracts|pageprops|images',
            inprop: 'url',
            exlimit: limit,
            explaintext: '',
            exsectionformat: 'plain',
            exchars: max_chars,
            exintro: '',
            redirects: '',
            imlimit: 500,
            generator: 'search',
            gsrsearch: term,
            gsrnamespace: 0,
            gsrprop: 'score',
            gsrinfo: 'suggestion',
            gsrlimit: limit
        };
        this._wikipedia_client.get(actions, Lang.bind(this, on_search_result));
    },

    _start_search: function(term, lang) {
        this._remove_timeout();
        if(Utils.is_blank(term)) return;

        this._last_search = null;
        this._results = [];
        this._wikipedia_display.clear();
        this._wikipedia_display.remove_suggestion();
        this.show_message(_("Search for '%s'").format(term));

        TIMEOUT_IDS.SEARCH = Mainloop.timeout_add(
            Utils.SETTINGS.get_int(PrefsKeys.DELAY_TIME),
            Lang.bind(this, function() {
                this._remove_timeout();
                this._insert_wikipedia_display();
                let message = _("Searching for '%s'...").format(term)
                this.show_message(message);

                this._wikipedia_client.lang = lang;
                this._search(term);
            })
        );
    },

    _show_results: function(results) {
        if(!results.length) {
            this._wikipedia_display.hide();
            return;
        }

        this._overview_search_results._statusBin.hide();
        this._wikipedia_display.show();
        let result_displays = [];

        for(let i = 0; i < results.length; i++) {
            let display = new WikipediaResultView.WikipediaResultView(results[i]);
            result_displays.push(display);
        }

        this._wikipedia_display.set_results(result_displays);
        this._wikipedia_display.show_suggestion_if_exist();
    },

    _show_viewer: function(url) {
        if(this._viewer_shown) return;

        this._viewer_shown = true;
        Utils.launch_viewer(url, Lang.bind(this, this._hide_viewer));
        Main.overview.hide();
    },

    _hide_viewer: function() {
        if(!this._viewer_shown) return;

        this._viewer_shown = false;
        Main.overview.show();

        if(this._last_search) {
            Main.overview._searchEntry.set_text(this._last_search);
            this._insert_wikipedia_display();
            this._wikipedia_display.show();
        }
    },

    _on_activate: function(object, button, wikipedia_result_view) {
        let url = wikipedia_result_view.wikipedia_page.url;
        if(Utils.is_blank(url)) return;

        if(button === Clutter.BUTTON_PRIMARY) {
            Gio.app_info_launch_default_for_uri(
                url,
                global.create_app_launch_context(0, -1)
            );
            this._animate_activation(wikipedia_result_view);
        }
        else {
            this._last_search = Main.overview._searchEntry.get_text();
            this._show_viewer(wikipedia_result_view.wikipedia_page.mobile_url);
        }
    },

    _animate_activation: function(wikipedia_result_view) {
        Main.overview.toggle();
        [x, y] = wikipedia_result_view.actor.get_transformed_position();
        let clone = new Clutter.Clone({
            source: wikipedia_result_view.actor,
            width: wikipedia_result_view.actor.width,
            height: wikipedia_result_view.actor.height,
            x: x,
            y: y
        });
        clone.set_pivot_point(0.5, 0.5);
        Main.uiGroup.add_child(clone);

        Tweener.addTween(clone, {
            opacity: 0,
            scale_x: 1.5,
            scale_y: 1.5,
            time: 0.5,
            transition: 'easeInExpo',
            onComplete: Lang.bind(this, function() {
                clone.destroy();
            })
        });
    },

    _insert_wikipedia_display: function() {
        let contains = this._overview_search_results._content.contains(
            this._wikipedia_display.actor
        );
        if(contains) this._remove_wikipedia_display();

        if(Utils.SETTINGS.get_boolean(PrefsKeys.SHOW_FIRST_IN_OVERVIEW)) {
            this._overview_search_results._content.insert_child_at_index(
                this._wikipedia_display.actor,
                0
            );
        }
        else {
            this._overview_search_results._content.add_child(
                this._wikipedia_display.actor
            );
        }
    },

    _remove_wikipedia_display: function() {
        let contains = this._overview_search_results._content.contains(
            this._wikipedia_display.actor
        );
        if(contains) {
            this._overview_search_results._content.remove_child(
                this._wikipedia_display.actor
            );
        }
    },

    show_message: function(message) {
        this._overview_search_results._statusBin.hide();
        this._wikipedia_display.show();
        this._wikipedia_display.show_message(message);
    },

    add_keybindings: function() {
        Main.wm.addKeybinding(
            PrefsKeys.SEARCH_FROM_CLIPBOARD,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.MESSAGE_TRAY |
            Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                this.search_from_clipborad(St.ClipboardType.CLIPBOARD);
            })
        );
        Main.wm.addKeybinding(
            PrefsKeys.SEARCH_FROM_PRIMARY_SELECTION,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL |
            Shell.ActionMode.MESSAGE_TRAY |
            Shell.ActionMode.OVERVIEW,
            Lang.bind(this, function() {
                this.search_from_clipborad(St.ClipboardType.PRIMARY);
            })
        );
    },

    remove_keybindings: function() {
        Main.wm.removeKeybinding(PrefsKeys.SEARCH_FROM_CLIPBOARD);
        Main.wm.removeKeybinding(PrefsKeys.SEARCH_FROM_PRIMARY_SELECTION);
    },

    search_from_clipborad: function(clipboard_type) {
        let clipboard = St.Clipboard.get_default();
        clipboard.get_text(clipboard_type,
            Lang.bind(this, function(clipboard, text) {
                if(!Utils.is_blank(text)) {
                    this.run_wiki_search(text, this._wikipedia_language);
                }
                else {
                    Main.notify('Clipboard is empty.');
                }
            })
        );
    },

    run_wiki_search: function(text, language) {
        this._wikipedia_display.clear();
        let keyword = Utils.SETTINGS.get_string(PrefsKeys.KEYWORD);
        let search_text = keyword;
        if(!Utils.is_blank(language)) search_text += '-' + language;
        search_text += ' ' + text;

        Main.overview.show();
        Main.overview._searchEntry.set_text(search_text);
        this._start_search(text, language);
    },

    enable: function() {
        if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_SHORTCUTS)) {
            this.add_keybindings();
        }

        CONNECTION_IDS.SHORTCUTS = Utils.SETTINGS.connect(
            'changed::' + PrefsKeys.ENABLE_SHORTCUTS,
            Lang.bind(this, function() {
                let enable = Utils.SETTINGS.get_boolean(
                    PrefsKeys.ENABLE_SHORTCUTS
                );

                if(enable) this.add_keybindings();
                else this.remove_keybindings();
            })
        );
    },

    disable: function() {
        this._remove_timeout();

        if(CONNECTION_IDS.SHORTCUTS > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.SHORTCUTS);
            CONNECTION_IDS.SHORTCUTS = 0;
        }
        if(CONNECTION_IDS.KEY_RELEASE > 0) {
            Main.overview._searchEntry.clutter_text.disconnect(
                CONNECTION_IDS.KEY_RELEASE
            );
            CONNECTION_IDS.KEY_RELEASE = 0;
        }
        if(CONNECTION_IDS.TEXT_CHANGED > 0) {
            Main.overview._searchEntry.clutter_text.disconnect(
                CONNECTION_IDS.TEXT_CHANGED
            );
            CONNECTION_IDS.TEXT_CHANGED = 0;
        }
        if(CONNECTION_IDS.SCROLLVIEW_VISIBLE > 0) {
            Main.overview.viewSelector._searchResults._scrollView.disconnect(
                CONNECTION_IDS.SCROLLVIEW_VISIBLE
            );
            CONNECTION_IDS.SCROLLVIEW_VISIBLE = 0;
        }

        this._wikipedia_display.destroy();
        this._wikipedia_client.destroy();
        delete this._overview_search_results;

        if(Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_SHORTCUTS)) {
            this.remove_keybindings();
        }
    }
});

let wikipedia_search_provider = null;

function init() {
    Utils.initTranslations("wikipedia_search_provider");
}

function enable() {
    wikipedia_search_provider = new WikipediaSearchProvider();
    wikipedia_search_provider.enable();
}

function disable() {
    if(wikipedia_search_provider !== null) {
        wikipedia_search_provider.disable();
        wikipedia_search_provider = null;
    }
}
