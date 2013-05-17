const St = imports.gi.St;
const Atk = imports.gi.Atk;
const Main = imports.ui.main;
const Search = imports.ui.search;
const SearchDisplay = imports.ui.searchDisplay;
const IconGrid = imports.ui.iconGrid;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const Util = imports.misc.util;
const URLHighlighter = imports.ui.messageTray.URLHighlighter;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Meta = imports.gi.Meta;
const GLib = imports.gi.GLib;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

const MAX_SEARCH_RESULTS_COLUMNS = 2
const ICON_SIZE = 120;

const WIKIPEDIA_DOMAIN = "wikipedia.org";
const WIKIPEDIA_API_URL = "/w/api.php";

const shell_version = imports.misc.config.PACKAGE_VERSION;
const settings = Convenience.getSettings();

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

let wikipedia_language = settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE);

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(
    _httpSession,
    new Soup.ProxyResolverDefault()
);
_httpSession.user_agent = 'Gnome-Shell Wikipedia Search Provider';

function starts_with(str1, str2) {
    return str1.slice(0, str2.length) == str2;
}

function get_wikipedia_url(api_url, api_query_string) {
    let result_url = '';
    let protocol = "https://";

    result_url = protocol+wikipedia_language+'.'+WIKIPEDIA_DOMAIN;

    if(api_url) {
        result_url += api_url;
    }
    if(api_query_string) {
        result_url += '?'+api_query_string;
    }

    return result_url;
}

function is_blank(str) {
    return (!str || /^\s*$/.test(str));
}

function get_icon(url) {
    let result;

    if(url) {
        let textureCache = St.TextureCache.get_default();
        result = textureCache.load_uri_async(url, ICON_SIZE, ICON_SIZE);
    }
    else {
        result = new St.Icon({
            icon_size: ICON_SIZE,
            icon_name: 'wikipedia',
            style_class: 'wikipedia-icon-'+settings.get_string(Prefs.WIKI_THEME)
        });

        if(starts_with(shell_version, '3.4')) {
            result.icon_type = St.IconType.FULLCOLOR
        }
    }

    return result;
}

function get_primary_selection() {
    let result = '';

    try {
        let r = GLib.spawn_command_line_sync('xclip -o');
        let selection = r[1].toString().trim();

        if(r[0] == true && !is_blank(selection)) {
            result = selection;
        }
    }
    catch(e) {
        result = '';
    }

    return result;
}

function search_from_primary_selection() {
    let text = get_primary_selection();

    if(!is_blank(text)) {
        run_wiki_search(text)
    }
    else {
        Main.notify('Primary selection is empty.');
    }
}

function search_from_clipborad() {
    let clipboard = St.Clipboard.get_default();
    clipboard.get_text(Lang.bind(this, function(clipboard, text) {
        if(!is_blank(text)) {
            run_wiki_search(text);
        }
        else {
            Main.notify('Clipboard is empty.');
        }
    }));
}

function run_wiki_search(text) {
    let keyword = settings.get_string(Prefs.WIKI_KEYWORD);
    Main.overview.show();

    let search_text = keyword+' '+text;

    if(starts_with(shell_version, '3.4')) {
        Main.overview._viewSelector._searchTab._entry.set_text(search_text)
    }
    else {
        Main.overview._searchEntry.set_text(search_text);
    }
}

function add_wiki_keybindings() {
    global.display.add_keybinding(
        Prefs.WIKI_SEARCH_FROM_CLIPBOARD,
        settings,
        Meta.KeyBindingFlags.NONE,
        Lang.bind(this, function() {
            search_from_clipborad();
        })
    );
    global.display.add_keybinding(
        Prefs.WIKI_SEARCH_FROM_PRIMARY_SELECTION,
        settings,
        Meta.KeyBindingFlags.NONE,
        Lang.bind(this, function() {
            search_from_primary_selection();
        })
    );
}

function remove_wiki_keybindings() {
    global.display.remove_keybinding(Prefs.WIKI_SEARCH_FROM_CLIPBOARD);
    global.display.remove_keybinding(Prefs.WIKI_SEARCH_FROM_PRIMARY_SELECTION);
}

const WikipediaResultActor = new Lang.Class({
    Name: 'WikipediaResultActor',

    _init: function(resultMeta) {
        this.actor = new St.Bin({
            style_class: 'wikipedia-'+settings.get_string(Prefs.WIKI_THEME),
            reactive: true,
            can_focus: true,
            track_hover: true,
            accessible_role: Atk.Role.PUSH_BUTTON
        });

        let content_width = settings.get_int(Prefs.WIKI_RESULT_WIDTH);
        let content_height = settings.get_int(Prefs.WIKI_RESULT_HEIGHT);
        let style_string = 
            'width: '+content_width+'px;'+
            'height: '+content_height+'px;';

        let content = new St.BoxLayout({
            style_class: 'wikipedia-content-'+settings.get_string(Prefs.WIKI_THEME),
            style: style_string,
            vertical: false
        });
        this.actor.set_child(content);

        if(resultMeta.show_icon) {
            let icon = get_icon();

            content.add(icon, {
                x_fill: true,
                y_fill: false,
                x_align: St.Align.START,
                y_align: St.Align.MIDDLE
            });
        }

        let details = new St.BoxLayout({
            style_class: 'wikipedia-details-'+settings.get_string(Prefs.WIKI_THEME),
            vertical: true
        });

        content.add(details, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        let title = new St.Label({
            text: resultMeta.title,
            style_class: 'wikipedia-details-title-'+settings.get_string(Prefs.WIKI_THEME),
            style: 'font-size: '+settings.get_int(Prefs.WIKI_TITLE_FONT_SIZE)+'px;'
        });

        details.add(title, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.START
        });
        this.actor.label_actor = title;

        let extract_box = new St.BoxLayout({
            vertical: true,
            style_class: 'wikipedia-details-extract-' +
                settings.get_string(Prefs.WIKI_THEME),
            style: 'font-size: '+settings.get_int(Prefs.WIKI_EXTRACT_FONT_SIZE)+'px;'
        });

        let extract = new URLHighlighter(
            resultMeta.extract,
            true,
            false
        );

        extract_box.add(extract.actor, {
            x_fill: true,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.START
        });

        let extract_scroll_view = new St.ScrollView();
        extract_scroll_view.add_actor(extract_box);

        details.add(extract_scroll_view, {
            x_fill: false,
            y_fill: true,
            x_align: St.Align.START,
            y_align: St.Align.END
        });
    }
});

const WikipediaProvider = new Lang.Class({
    Name: 'WikipediaProvider',
    Extends: Search.SearchProvider,

    _init: function(title) {
        this.title = title;
        this.async = true;
        this.delay_query = '';
        this.delay_query_id = 0;
    },

    _parse_query: function(terms_string) {
        let WIKIPEDIA_QUERY_REGEXP = new RegExp(
            "("+settings.get_string(Prefs.WIKI_KEYWORD)+
            "|"+settings.get_string(Prefs.WIKI_KEYWORD)+
            "-(.*?)) (.*)"
        );
        let result = {};
        result.lang = '';
        result.wikipedia_query = false;

        if(WIKIPEDIA_QUERY_REGEXP.test(terms_string)) {
            result.wikipedia_query = true;
            let matches = WIKIPEDIA_QUERY_REGEXP.exec(terms_string);
            let language = matches[2];
            let term = matches[3];

            if(!is_blank(language)) {
                result.lang = language.trim();
            }
            if(!is_blank(term)) {
                result.term = term.trim();
            }
        }

        return result;
    },

    _get_wiki_extracts: function(titles, fun) {
        let titles_string = titles.join("|");

        if(titles_string) {
            titles_string = encodeURIComponent(titles_string);
            let exlimit = 
                settings.get_int(Prefs.WIKI_RESULTS_ROWS) *
                MAX_SEARCH_RESULTS_COLUMNS;
            let max_chars = settings.get_int(Prefs.WIKI_MAX_CHARS);
            let api_query_extracts = 
                "action=query&prop=extracts&format=json&exlimit="+exlimit+
                "&explaintext&exsectionformat=plain&exchars="+max_chars+
                "&exintro=&redirects=&titles="+titles_string;
            let url = get_wikipedia_url(WIKIPEDIA_API_URL, api_query_extracts);
            let here = this;
            let request = Soup.Message.new('GET', url);

            _httpSession.queue_message(request, function(_httpSession, message) {
                if(message.status_code === 200) {
                    let result = JSON.parse(request.response_body.data);
                    result = result['query']['pages'];
                    fun.call(here, result);
                }
                else {
                    fun.call(here, false);
                }
            });
        }
        else {
            global.log('empty titles_string');
            fun.call(this, false);
        }
    },

    _get_wiki_titles: function(term, fun) {
        if(term) {
            term = encodeURIComponent(term);
            let limit = settings.get_int(Prefs.WIKI_RESULTS_ROWS) * MAX_SEARCH_RESULTS_COLUMNS;
            let api_query_titles = "action=opensearch&format=json&limit="+limit+"&search="+term;
            let url = get_wikipedia_url(WIKIPEDIA_API_URL, api_query_titles);
            let here = this;
            let request = Soup.Message.new('GET', url);

            _httpSession.queue_message(request, function(_httpSession, message) {
                if(message.status_code === 200) {
                    let result = JSON.parse(request.response_body.data);

                    if(result[1].length > 0) {
                        fun.call(here, result[1]);
                    }
                    else {
                        fun.call(here, false);
                    }
                }
                else {
                    fun.call(here, false);
                }
            });
        }
        else {
            global.log('empty term');
            fun.call(here, false);
        }
    },

    _search: function(term) {
        this._get_wiki_titles(term, function(titles) {
            if(titles) {
                this._get_wiki_extracts(titles, function(extracts) {
                    let result = [];

                    if(extracts) {
                        for(let id in extracts) {
                            if(extracts[id]['title'] && extracts[id]['extract']) {
                                result.push({
                                    "id": id,
                                    "title": extracts[id]['title'],
                                    "extract": extracts[id]['extract']
                                });
                            }
                        }
                    }

                    if(result.length > 0) {
                        this.searchSystem.pushResults(this, result);
                    }
                    else {
                        let nothing_found = [{
                            "title": _("Wikipedia Search Provider"),
                            "extract": _("Your search - ")+term+_(" - did not match any documents.\nLanguage: ")+wikipedia_language,
                            "show_icon": true
                        }]
                        this.searchSystem.pushResults(this, nothing_found);
                    }
                });
            }
            else {
                let nothing_found = [{
                    "title": _("Wikipedia Search Provider"),
                    "extract": _("Your search - ")+term+_(" - did not match any documents.\nLanguage: ")+wikipedia_language,
                    "show_icon": true
                }]
                this.searchSystem.pushResults(this, nothing_found);
            }
        });
    },

    getInitialResultSetAsync: function(terms) {
        if(this.delay_query_id > 0) {
            Mainloop.source_remove(this.delay_query_id);
            this.delay_query_id = 0;
        }

        let terms_string = terms.join(" ");
        let query = this._parse_query(terms_string);

        if(query.wikipedia_query) {
            let wellcome = [{
                "title": _("Wikipedia Search Provider"),
                "extract": _("Enter your query."),
                "show_icon": true
            }]
            this.searchSystem.pushResults(this, wellcome);

            if(query.term) {
                if(query.lang.length > 0) {
                    wikipedia_language = query.lang;
                }
                else {
                    wikipedia_language =
                        settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE);
                }

                this.delay_query = query.term;
                this.delay_query_id = Mainloop.timeout_add(
                    settings.get_int(Prefs.WIKI_DELAY_TIME),
                    Lang.bind(this, function() {
                        let searching = [{
                            "title": _("Wikipedia Search Provider"),
                            "extract": _("Searching for ")+"'"+query.term+"'...",
                            "show_icon": true
                        }]
                        this.searchSystem.pushResults(this, searching);
                        this._search(this.delay_query);
                    })
                );
            }
            else {
                this.searchSystem.pushResults(this, wellcome);
            }
        }
        else {
            this.searchSystem.pushResults(this, []);
        }
    },

    getInitialResultSet: function (terms) {
        this.getInitialResultSetAsync(terms);
    },

    getSubsearchResultSetAsync: function(prevResults, terms) {
        this.getInitialResultSetAsync(terms);
    },

    getSubsearchResultSet: function(prevResults, terms) {
        this.getInitialResultSetAsync(terms);
    },

    getResultMetasAsync: function(result, callback) {
        let metas = [];

        for(let i = 0; i < result.length; i++) {
            metas.push({
                'id' : result[i].id,
                'extract' : result[i].extract,
                'title' : result[i].title,
                'show_icon': result[i].show_icon
            });
        }

        callback(metas);
    },

    getResultMetas: function(result, callback) {
        this.getResultMetasAsync(result, callback)
    },

    createResultActor: function(resultMeta, terms) {
        let result = new WikipediaResultActor(resultMeta);

        return result.actor;
    },

    createResultContainerActor: function() {
        let grid = new IconGrid.IconGrid({
            rowLimit: settings.get_int(Prefs.WIKI_RESULTS_ROWS),
            //columnLimit: MAX_SEARCH_RESULTS_COLUMNS,
            xAlign: St.Align.START
        });
        grid.actor.style_class = 'wikipedia-grid';

        let width = settings.get_int(Prefs.WIKI_RESULT_WIDTH);
        let height = settings.get_int(Prefs.WIKI_RESULT_HEIGHT); 
        let style_string = 
            '-shell-grid-horizontal-item-size: '+width+'px;'+
            '-shell-grid-vertical-item-size: '+height+'px;'
        grid.actor.style = style_string;

        let actor = new SearchDisplay.GridSearchResults(this, grid);
        return actor;
    },

    activateResult: function(resultId) {
        resultId = parseInt(resultId);
        let url = false;

        if(resultId) {
            url = 'https://'+wikipedia_language+'.'+WIKIPEDIA_DOMAIN+'?curid='+resultId;
        }

        if(url) {
            try {
                Gio.app_info_launch_default_for_uri(
                    url,
                    global.create_app_launch_context()
                );
            }
            catch (e) {
                Util.spawn(['gvfs-open', url])
            }
        }
        else {
            // Main.notify("Bad url.");
        }

        return true;
    }
});

function init() {
    Convenience.initTranslations("wikipedia_search_provider");
}

let settings_connection_id = 0;
let wikipediaProvider = null;

function enable() {
    wikipediaProvider = new WikipediaProvider('WIKIPEDIA');
    Main.overview.addSearchProvider(wikipediaProvider);

    if(settings.get_boolean(Prefs.WIKI_ENABLE_SHORTCUTS)) {
        add_wiki_keybindings();
    }

    settings_connection_id = settings.connect(
        'changed::'+Prefs.WIKI_ENABLE_SHORTCUTS,
        function() {
            let enable = settings.get_boolean(Prefs.WIKI_ENABLE_SHORTCUTS);

            if(enable) add_wiki_keybindings();
            else remove_wiki_keybindings();
        }
    );

    if(starts_with(shell_version, '3.6')) {
        let search_results = Main.overview._viewSelector._searchResults;
        let provider_meta = search_results._metaForProvider(wikipediaProvider);
        provider_meta.resultDisplay._grid.actor.style_class = 'wikipedia-grid';
        provider_meta.resultDisplay._grid._rowLimit =
            settings.get_int(Prefs.WIKI_RESULTS_ROWS);

        let width = settings.get_int(Prefs.WIKI_RESULT_WIDTH);
        let height = settings.get_int(Prefs.WIKI_RESULT_HEIGHT); 
        provider_meta.resultDisplay._grid.actor.style = 
            '-shell-grid-horizontal-item-size: '+width+'px;'+
            '-shell-grid-vertical-item-size: '+height+'px;';
    }
}

function disable() {
    if(wikipediaProvider != null) {
        Main.overview.removeSearchProvider(wikipediaProvider);
        wikipediaProvider = null;
    }

    if(settings_connection_id > 0) {
        settings.disconnect(settings_connection_id);
    }

    if(settings.get_boolean(Prefs.WIKI_ENABLE_SHORTCUTS)) {
        remove_wiki_keybindings();
    }
}
