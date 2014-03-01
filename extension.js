const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const Gio = imports.gi.Gio;
const Mainloop = imports.mainloop;
const Soup = imports.gi.Soup;
const Tweener = imports.ui.tweener;
const Clutter = imports.gi.Clutter;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;
const WikipediaResult = Me.imports.wikipedia_result;
const WikipediaResults = Me.imports.wikipedia_results;
const WikipediaResultStore = Me.imports.wikipedia_result_store;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const CONNECTION_IDS = {};

const WikipediaSearchProvider = new Lang.Class({
    Name: "WikipediaSearchProvider",

    _init: function() {
        this.id = "Wikipedia";
        this.appInfo = Gio.app_info_get_default_for_uri_scheme("http");
        this._delay_query = '';
        this._timeout_id = 0;
        this.display = null;
        this._wikipedia_display = new WikipediaResults.WikipediaResults(this);
        this._wikipedia_display.connect(
            "activate",
            Lang.bind(this, this._on_activate)
        );
        this._wikipedia_language = Utils.SETTINGS.get_string(
            Prefs.WIKI_DEFAULT_LANGUAGE
        );

        this._block_search_trigger = false;

        Main.overview._searchEntry.clutter_text.connect(
            "key-release-event",
            Lang.bind(this, function(o, e) {
                let symbol = e.get_key_symbol();
                let query = this._parse_query(Main.overview._searchEntry.text);

                if(symbol === Clutter.BackSpace && query.wikipedia_query) {
                    this._block_search_trigger = true;

                    let wellcome = {
                        "pageid": 0,
                        "title": _("Wikipedia Search Provider"),
                        "extract": _("Enter your query")
                    };
                    this._wikipedia_display.remove_suggestion();
                    this._show_results([
                        new WikipediaResultStore.WikipediaResultStore(wellcome)
                    ]);
                }
            })
        );
    },

    _parse_query: function(terms_string) {
        let keyword = Utils.SETTINGS.get_string(Prefs.WIKI_KEYWORD);
        let regexp_string = "(%s|%s-(.*?)) (.*)".format(keyword, keyword);
        let wikipedia_query_regexp = new RegExp(regexp_string);
        let result = {};
        result.lang = '';
        result.wikipedia_query = false;

        if(wikipedia_query_regexp.test(terms_string)) {
            result.wikipedia_query = true;
            let matches = wikipedia_query_regexp.exec(terms_string);
            let language = matches[2];
            let term = matches[3];

            if(!Utils.is_blank(language)) {
                result.lang = language.trim();
            }
            if(!Utils.is_blank(term)) {
                result.term = term.trim();
            }
        }

        return result;
    },

    _get_wiki_thumbs: function(results) {
        let results_by_image_name = {};

        for(let i = 0; i < results.length; i++) {
            if(results[i].has_image_name) {
                let image_name = "File:" + results[i].image_name;
                results_by_image_name[image_name] = results[i];
            }
        }

        if(Object.keys(results_by_image_name).length < 1) return;

        let api_query =
            "action=query&prop=imageinfo&format=json&iiprop=url" +
            "&iilimit=1&iiurlwidth=%s&iiurlheight=%s&iwurl=&redirects=".format(
                // Utils.SETTINGS.get_int(Prefs.WIKI_IMAGE_MAX_WIDTH),
                // Utils.SETTINGS.get_int(Prefs.WIKI_IMAGE_MAX_HEIGHT)
                500,
                500
            ) +
            "&titles=%s".format(
                encodeURIComponent(Object.keys(results_by_image_name).join("|"))
            );

        let url = Utils.get_wikipedia_url(
            this._wikipedia_language,
            Utils.WIKIPEDIA_API_URL,
            api_query
        );
        let request = Soup.Message.new('GET', url);

        Utils._httpSession.queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code === 200) {
                    let result = JSON.parse(request.response_body.data);
                    let pages = result.query.pages;
                    let normalized = result.query.normalized;

                    if(normalized !== undefined) {
                        for(let i = 0; i < normalized.length; i++) {
                            results_by_image_name[normalized[i].to] =
                                results_by_image_name[normalized[i].from];
                            delete results_by_image_name[normalized[i].from];
                        }
                    }

                    for(let key in pages) {
                        let image_name = pages[key].title;
                        let image_info = pages[key].imageinfo[0];
                        let thumb_info = {
                            url: image_info.thumburl,
                            width: image_info.thumbwidth,
                            height: image_info.thumbheight
                        };
                        let image_url = image_info.url;
                        results_by_image_name[image_name].image_url = image_url;
                        results_by_image_name[image_name].thumb_info = thumb_info;
                    }
                }
            })
        );
    },

    _get_wiki_extracts: function(term, callback) {
        if(Utils.is_blank(term)) {
            callback(false);
            return;
        }

        term = encodeURIComponent(term);
        let exlimit = Utils.SETTINGS.get_int(Prefs.WIKI_MAX_RESULTS);
        let max_chars = Utils.SETTINGS.get_int(Prefs.WIKI_MAX_CHARS);
        let limit = Utils.SETTINGS.get_int(Prefs.WIKI_MAX_RESULTS);
        let api_query =
            "action=query&prop=extracts|pageprops&format=json&exlimit=%s" +
            "&explaintext=&exsectionformat=plain&exchars=%s&exintro=" +
            "&redirects=&generator=search&gsrsearch=%s&gsrnamespace=0" +
            "&gsrprop=size&gsrinfo=suggestion&gsrlimit=%s";
        api_query = api_query.format(exlimit, max_chars, term, limit);
        let url = Utils.get_wikipedia_url(
            this._wikipedia_language,
            Utils.WIKIPEDIA_API_URL,
            api_query
        );
        let request = Soup.Message.new('GET', url);

        Utils._httpSession.queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code === 200) {
                    let result = JSON.parse(request.response_body.data);

                    if(!result.query) {
                        callback(false);
                        return;
                    }

                    let pages = result.query.pages;
                    let searchinfo = result.query.searchinfo;

                    if(searchinfo !== undefined) {
                        if(!Utils.is_blank(searchinfo.suggestion)) {
                            this._wikipedia_display.set_suggestion(
                                searchinfo.suggestion
                            );
                        }
                        else {
                            this._wikipedia_display.remove_suggestion();
                        }
                    }
                    else {
                        this._wikipedia_display.remove_suggestion();
                    }

                    callback(pages);
                }
                else {
                    log("_get_wiki_extracts: Error code: %s".format(
                        message.status_code
                    ));
                    callback(false);
                }
            })
        );
    },

    _search: function(term) {
        let nothing_found = {
            "pageid": 0,
            "title": _("Wikipedia Search Provider"),
            "extract":
                _("Your search - ") + term +
                _(" - did not match any documents.\nLanguage: ") +
                this._wikipedia_language
        };

        this._get_wiki_extracts(term, Lang.bind(this, function(extracts) {
            if(!extracts) {
                this._show_results([
                    new WikipediaResultStore.WikipediaResultStore(nothing_found)
                ]);
                return;
            }

            let results = [];

            for(let id in extracts) {
                let result;
                let pageprops = extracts[id].pageprops;
                
                if(pageprops) {
                    let exclude_disambig_page =
                        Utils.SETTINGS.get_boolean(
                            Prefs.WIKI_EXCLUDE_DISAMBIGUATION_PAGES
                        )
                        && pageprops.disambiguation !== undefined;

                    if(exclude_disambig_page) continue;
                }

                try {
                    result = new WikipediaResultStore.WikipediaResultStore(
                        extracts[id]
                    );
                    result.language_code = this._wikipedia_language;
                    results.push(result);
                }
                catch(e) {
                    log(e);
                    continue;
                }
            }

            if(results.length > 0) {
                if(Utils.SETTINGS.get_boolean(Prefs.WIKI_ENABLE_IMAGES)) {
                    this._get_wiki_thumbs(results);
                }

                this._show_results(results);
            }
            else {
                this._show_results([
                    new WikipediaResultStore.WikipediaResultStore(nothing_found)
                ]);
            }
        }));
    },

    _show_results: function(results) {
        this.display.actor.remove_all_children();

        if(results.length > 0) {
            let search_results = Main.overview.viewSelector._searchResults;
            search_results._statusBin.hide();
            this.display.actor.show();
        }
        else {
            this.display.actor.hide();
            return;
        }

        let result_displays = [];

        for(let i = 0; i < results.length; i++) {
            let display = new WikipediaResult.WikipediaResult(results[i]);
            result_displays.push(display);
        }

        this._wikipedia_display.clear();
        this._wikipedia_display.set_results(result_displays);
        this._wikipedia_display.show_suggestion_if_exist();

        this.display.actor.add(this._wikipedia_display.actor);
    },

    _on_activate: function(object, result) {
        let id = parseInt(result.store.id);

        if(id > 0) {
            let url = 'https://%s.%s?curid=%s'.format(
                this._wikipedia_language,
                Utils.WIKIPEDIA_DOMAIN,
                id
            )

            try {
                Gio.app_info_launch_default_for_uri(
                    url,
                    global.create_app_launch_context()
                );
            }
            catch (e) {
                Util.spawn(['gvfs-open', url])
            }

            Main.overview.toggle();
            [x, y] = result.actor.get_transformed_position();
            let clone = new Clutter.Clone({
                source: result.actor,
                width: result.actor.width,
                height: result.actor.height,
                x: x,
                y: y
            });
            Main.uiGroup.add_child(clone);
            Tweener.addTween(clone, {
                opacity: 0,
                time: 1,
                transition: 'easeOutQuad',
                onComplete: Lang.bind(this, function() {
                    clone.destroy();
                })
            });
        }
    },

    getInitialResultSet: function(terms) {
        if(this._timeout_id > 0) {
            Mainloop.source_remove(this._timeout_id);
            this._timeout_id = 0;
        }

        if(this._block_search_trigger) {
            this._block_search_trigger = false;
            return;
        }

        this._results = [];
        let terms_string = terms.join(" ");
        let query = this._parse_query(terms_string);

        if(query.wikipedia_query) {
            if(!Utils.is_blank(query.term)) {
                if(query.lang.length > 0) {
                    this._wikipedia_language = query.lang;
                }
                else {
                    this._wikipedia_language =
                        Utils.SETTINGS.get_string(Prefs.WIKI_DEFAULT_LANGUAGE);
                }

                let status = {
                    "pageid": 0,
                    "title": _("Wikipedia Search Provider"),
                    "extract": _("Search for '%s'").format(query.term)
                };
                this._wikipedia_display.remove_suggestion();
                this._show_results([
                    new WikipediaResultStore.WikipediaResultStore(status)
                ]);

                this._delay_query = query.term;
                this._timeout_id = Mainloop.timeout_add(
                    Utils.SETTINGS.get_int(Prefs.WIKI_DELAY_TIME),
                    Lang.bind(this, function() {
                        let description =
                            _("Searching for ") + "'" + query.term + "'...";
                        status = {
                            "pageid": 0,
                            "title": _("Wikipedia Search Provider"),
                            "extract": description
                        };
                        this._wikipedia_display.remove_suggestion();
                        this._show_results([
                            new WikipediaResultStore.WikipediaResultStore(status)
                        ]);
                        this._search(this._delay_query);
                    })
                );
            }
        }
    },

    getSubsearchResultSet: function(prevResults, terms) {
        return this.getInitialResultSet(terms);
    },

    getResultMetas: function(result, callback) {
        let metas = [];

        for(let i = 0; i < result.length; i++) {
            metas.push({
                'id' : result[i].id,
                'description' : '',
                'name' : '',
                'createIcon': Lang.bind(this, function() {
                    return false
                })
            });
        }

        callback(metas);
    },

    filterResults: function(results, max) {
        return results;
    },

    activateResult: function(result_id) {
        // nothing
    },

    launchSearch: function(terms) {
        // nothing
    },

    add_keybindings: function() {
        Main.wm.addKeybinding(
            Prefs.WIKI_SEARCH_FROM_CLIPBOARD,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, function() {
                this.search_from_clipborad(St.ClipboardType.CLIPBOARD);
            })
        );
        Main.wm.addKeybinding(
            Prefs.WIKI_SEARCH_FROM_PRIMARY_SELECTION,
            Utils.SETTINGS,
            Meta.KeyBindingFlags.NONE,
            Shell.KeyBindingMode.NORMAL |
            Shell.KeyBindingMode.MESSAGE_TRAY |
            Shell.KeyBindingMode.OVERVIEW,
            Lang.bind(this, function() {
                this.search_from_clipborad(St.ClipboardType.PRIMARY);
            })
        );
    },

    remove_keybindings: function() {
        Main.wm.removeKeybinding(Prefs.WIKI_SEARCH_FROM_CLIPBOARD);
        Main.wm.removeKeybinding(Prefs.WIKI_SEARCH_FROM_PRIMARY_SELECTION);
    },

    search_from_clipborad: function(clipboard_type) {
        let clipboard = St.Clipboard.get_default();
        clipboard.get_text(clipboard_type,
            Lang.bind(this, function(clipboard, text) {
                if(!Utils.is_blank(text)) {
                    this.run_wiki_search(text);
                }
                else {
                    Main.notify('Clipboard is empty.');
                }
            })
        );
    },

    run_wiki_search: function(text, language) {
        let keyword = Utils.SETTINGS.get_string(Prefs.WIKI_KEYWORD);
        let search_text = keyword;

        if(!Utils.is_blank(language)) search_text += '-' + language;
        
        search_text += ' ' + text;

        Main.overview.show();
        Main.overview._searchEntry.set_text(search_text);
    },

    enable: function() {
        let search_results = Main.overview.viewSelector._searchResults;
        search_results._searchSystem.addProvider(this);

        if(Utils.SETTINGS.get_boolean(Prefs.WIKI_SHOW_FIRST_IN_OVERVIEW)) {
            search_results._content.set_child_at_index(this.display.actor, 0);
        }

        if(Utils.SETTINGS.get_boolean(Prefs.WIKI_ENABLE_SHORTCUTS)) {
            this.add_keybindings();
        }

        CONNECTION_IDS.shortcuts = Utils.SETTINGS.connect(
            'changed::'+Prefs.WIKI_ENABLE_SHORTCUTS,
            Lang.bind(this, function() {
                let enable = Utils.SETTINGS.get_boolean(
                    Prefs.WIKI_ENABLE_SHORTCUTS
                );

                if(Utils.SETTINGS.get_boolean(Prefs.WIKI_ENABLE_SHORTCUTS)) {
                    this.add_keybindings();
                }
                else {
                    this.remove_keybindings();
                }
            })
        );
        CONNECTION_IDS.show_first = Utils.SETTINGS.connect(
            'changed::'+Prefs.WIKI_SHOW_FIRST_IN_OVERVIEW,
            Lang.bind(this, function() {
                let enable = Utils.SETTINGS.get_boolean(
                    Prefs.WIKI_SHOW_FIRST_IN_OVERVIEW
                );
                let search_results = Main.overview.viewSelector._searchResults;

                if(enable) {
                    search_results._content.set_child_at_index(
                        this.display.actor,
                        0
                    );
                }
                else {
                    search_results._content.set_child_at_index(
                        this.display.actor,
                        search_results._content.get_n_children()
                    );
                }
            })
        );
    },

    disable: function() {
        if(this._timeout_id > 0) {
            Mainloop.source_remove(this._timeout_id);
            this._timeout_id = 0;
        }
        if(CONNECTION_IDS.shortcuts > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.shortcuts);
            CONNECTION_IDS.shortcuts = 0;
        }
        if(CONNECTION_IDS.show_first > 0) {
            Utils.SETTINGS.disconnect(CONNECTION_IDS.show_first);
            CONNECTION_IDS.show_first = 0;
        }

        this.remove_keybindings();

        let provider_display =
            Main.overview.viewSelector._searchResults._providerDisplays[this.id];
        Main.overview.removeSearchProvider(this);
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
