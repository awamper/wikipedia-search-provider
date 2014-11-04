const Lang = imports.lang;
const Soup = imports.gi.Soup;
const Params = imports.misc.params;

const PROTOCOL = 'https';
const BASE_URL = 'wikipedia.org';
const DEFAULT_LANG = 'en';
const API_PATH = 'w/api.php';
const HTTP_TIMEOUT = 10;
const USER_AGENT = 'GNOME Shell - WikipediaSearchProvider - extension';

const WikipediaClient = new Lang.Class({
    Name: 'WikipediaClient',

    _init: function(params) {
        this._params = Params.parse(params, {
            protocol: PROTOCOL,
            base_url: BASE_URL,
            lang: DEFAULT_LANG,
            api_path: API_PATH
        });
    },

    _build_api_url: function() {
        let url = '%s://%s.%s/%s?format=json'.format(
            this.protocol,
            this.lang,
            this.base_url,
            this.api_path
        );

        return url;
    },

    _build_query_url: function(actions_object) {
        let query_string = '';
        let url = this._build_api_url();

        for(let action in actions_object) {
            if(actions_object.hasOwnProperty(action)) {
                query_string += '&%s=%s'.format(
                    action,
                    encodeURIComponent(actions_object[action])
                )
            }
        }

        url += query_string;
        return url;
    },

    get: function(actions_object, callback) {
        let query_url = this._build_query_url(actions_object);
        let request = Soup.Message.new('GET', query_url);

        _get_soup_session().queue_message(request,
            Lang.bind(this, function(http_session, message) {
                if(message.status_code !== Soup.KnownStatusCode.OK) {
                    let error_message =
                        "WikipediaClient.Client:get(): Error code: %s".format(
                            message.status_code
                        );
                    callback(error_message, null);
                    return;
                }

                let result;

                try {
                    result = JSON.parse(request.response_body.data);
                }
                catch(e) {
                    let message = "WikipediaClient.Client:get(): %s".format(e);
                    callback(message, null);
                    return;
                }

                callback(null, result);
            })
        );
    },

    destroy: function() {
        _get_soup_session().run_dispose();
        _SESSION = null;
    },

    get_url_for_page_id: function(page_id) {
        let url = '%s://%s.%s/?curid=%s'.format(
            PROTOCOL,
            this.lang,
            BASE_URL,
            page_id
        );

        return url;
    },

    get protocol() {
        return this._params.protocol;
    },

    set protocol(protocol) {
        this._params.protocol = protocol;
    },

    get base_url() {
        return this._params.base_url;
    },

    set base_url(url) {
        this._params.base_url = url;
    },

    get api_path() {
        return this._params.api_path;
    },

    set api_path(path) {
        this._params.api_path = path;
    },

    get lang() {
        return this._params.lang;
    },

    set lang(lang) {
        this._params.lang = lang;
    }
});

let _SESSION = null;

function _get_soup_session() {
    if(_SESSION === null) {
        _SESSION = new Soup.SessionAsync();
        Soup.Session.prototype.add_feature.call(
            _SESSION,
            new Soup.ProxyResolverDefault()
        );
        _SESSION.user_agent = USER_AGENT;
        _SESSION.timeout = HTTP_TIMEOUT;
    }

    return _SESSION;
}
