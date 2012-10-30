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
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Prefs = Me.imports.prefs;

const MAX_SEARCH_RESULTS_COLUMNS = 2
const ICON_SIZE = 120;

const WIKIPEDIA_DOMAIN = "wikipedia.org";
const WIKIPEDIA_API_URL = "/w/api.php";

const settings = Convenience.getSettings();
let wikipedia_language = settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE);
let wikipediaProvider = "";

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(
    _httpSession,
    new Soup.ProxyResolverDefault()
);
_httpSession.user_agent = 'Gnome-Shell Wikipedia Search Provider';

function get_wikipedia_url(api_url, api_query_string) {
    let result_url = '';
    let protocol = "http://";

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
            icon_type: St.IconType.FULLCOLOR,
            icon_size: ICON_SIZE,
            icon_name: 'wikipedia',
            style_class: 'wikipedia-icon-'+settings.get_string(Prefs.WIKI_THEME)
        });
    }

    return result;
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

        let content = new St.BoxLayout({
            style_class: 'wikipedia-content-'+settings.get_string(Prefs.WIKI_THEME),
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
            style_class: 'wikipedia-details-title-'+settings.get_string(Prefs.WIKI_THEME)
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
            style_class: 'wikipedia-details-extract-'+settings.get_string(Prefs.WIKI_THEME)
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

        details.add(extract_box, {
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
            let exlimit = settings.get_int(Prefs.WIKI_RESULTS_ROWS) * MAX_SEARCH_RESULTS_COLUMNS;
            let api_query_extracts = "action=query&prop=extracts&format=json&exlimit="+exlimit+"&explaintext&exsectionformat=plain&exchars=300&exintro=&redirects=&titles="+titles_string;
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
        let searching = [{
            "title": "Wikipedia Search Provider",
            "extract": "Searching for '"+term+"'...",
            "show_icon": true
        }]
        this.searchSystem.pushResults(this, searching);

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
                            "title": "Wikipedia Search Provider",
                            "extract": "Your search - "+term+" - did not match any documents.\nLanguage: "+settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE),
                            "show_icon": true
                        }]
                        this.searchSystem.pushResults(this, nothing_found);
                    }
                });
            }
            else {
                let nothing_found = [{
                    "title": "Wikipedia Search Provider",
                    "extract": "Your search - "+term+" - did not match any documents.\nLanguage: "+settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE),
                    "show_icon": true
                }]
                this.searchSystem.pushResults(this, nothing_found);
            }
        });
    },

    getInitialResultSetAsync: function(terms) {
        if(this.delay_query_id) {
            Mainloop.source_remove(this.delay_query_id);
        }

        let terms_string = terms.join(" ");
        let query = this._parse_query(terms_string);

        if(query.wikipedia_query) {
            if(query.term) {
                if(query.lang.length > 0) {
                    wikipedia_language = query.lang;
                }
                else {
                    wikipedia_language = settings.get_string(Prefs.WIKI_DEFAULT_LANGUAGE);
                }

                this.delay_query = query.term;
                this.delay_query_id = Mainloop.timeout_add(
                    settings.get_int(Prefs.WIKI_DELAY_TIME),
                    Lang.bind(this, function() {
                        this._search(this.delay_query);
                    })
                );
            }
            else {
                let wellcome = [{
                    "title": "Wikipedia Search Provider",
                    "extract": "Enter your query.",
                    "show_icon": true
                }]
                this.searchSystem.pushResults(this, wellcome);
            }
        }
        else {
            this.searchSystem.pushResults(this, []);
        }
    },

    getSubsearchResultSetAsync: function(prevResults, terms) {
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

        let actor = new SearchDisplay.GridSearchResults(this, grid);
        return actor;
    },

    activateResult: function(resultId) {
        resultId = parseInt(resultId);
        let url = false;

        if(resultId) {
            url = 'http://'+wikipedia_language+'.'+WIKIPEDIA_DOMAIN+'?curid='+resultId;
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
    wikipediaProvider = new WikipediaProvider('WIKIPEDIA');
}

function enable() {
    Main.overview.addSearchProvider(wikipediaProvider);
}

function disable() {
    Main.overview.removeSearchProvider(wikipediaProvider);
}
