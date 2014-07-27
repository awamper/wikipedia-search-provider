const Lang = imports.lang;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const WikipediaClient = Me.imports.wikipedia_client;
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaImage = Me.imports.wikipedia_image;

const WikipediaPage = new Lang.Class({
    Name: 'WikipediaPage',

    _init: function(page_id, title) {
        this._id = null;
        this._title = null;
        this._url = null;
        this._extract = null;
        this._length = 0;
        this._properties = {
            disambiguation: null,
            page_image: null
        };
        this._images = [];
        this._page_image_name = null;
        this._page_image = null;
        this._lang = null;
        this._exists = null;
        this.has_main_image = false;
        this.load_images = true;

        this._data_loaded = false;
        this._images_loaded = false;
        this._ready_signal_sent = false;

        if(typeof page_id === 'number') this.id = page_id;
        if(!Utils.is_blank(title)) this.title = title;
    },

    _check_ready: function() {
        if(this._data_loaded && this._images_loaded && !this._ready_signal_sent) {
            this.emit('ready');
            this._ready_signal_sent = true;
        }
    },

    _on_images_loaded: function(error, result) {
        if(error) throw new Error(error);

        let n_images_loaded = 0;
        let n_results = Object.keys(result.query.pages).length;

        for each(let image_data in result.query.pages) {
            let wikipedia_image = new WikipediaImage.WikipediaImage(null);
            wikipedia_image.connect('loaded',
                Lang.bind(this, function() {
                    n_images_loaded++;

                    if(wikipedia_image.exists) {
                        this.images.push(wikipedia_image);

                        if(wikipedia_image.title === this.page_image_name) {
                            this.page_image = wikipedia_image;
                            wikipedia_image.is_page_image = true;
                        }
                        else {
                            wikipedia_image.is_page_image = false;
                        }
                    }

                    if(n_images_loaded >= n_results) {
                        this.emit('images-loaded');
                        this._check_ready();
                    }
                })
            );
            wikipedia_image.load_data(image_data);
        }
    },

    _load_images: function(images_info) {
        if(!images_info) return;

        let titles = [];

        for each(let image_info in images_info) {
            if(Utils.is_blank(image_info.title)) continue;
            titles.push(image_info.title);
        }

        let client = new WikipediaClient.WikipediaClient();
        let actions = {
            action: 'query',
            prop: 'imageinfo',
            iiprop: 'url',
            iwurl: '',
            redirects: '',
            iiurlwidth: WikipediaImage.MAX_WIDTH,
            iiurlheight: WikipediaImage.MAX_HEIGHT,
            titles: titles.join('|')
        };
        client.get(actions, Lang.bind(this, this._on_images_loaded));
    },

    _on_data_loaded: function(error, result, page_data) {
        if(page_data === undefined) {
            if(error) throw new Error(error);

            let result_ids = Object.keys(result.query.pages);

            if(result_ids[0] === '-1') {
                this.exists = false;
                return;
            }

            page_data = result.query.pages[result_ids[0]];
        }

        this.id = page_data.pageid;
        this.title = page_data.title;
        this.url = page_data.fullurl;
        this.extract = page_data.extract;
        this.length = page_data.length;
        this.properties = page_data.pageprops;
        this.exists = true;

        if(this.load_images) this._load_images(page_data.images);

        this._data_loaded = true;
        this.emit('data-loaded');
        this._check_ready();
    },

    _get_data: function(callback) {
        let client = new WikipediaClient.WikipediaClient();
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
            imdir: 'ascending',
            iwurl: '',
            converttitles: '',
        };

        if(!Utils.is_blank(this.title)) actions.titles = this.title;
        else actions.pageids = this.id;

        client.get(actions, Lang.bind(this, this._on_data_loaded));
    },

    load_data: function(page_data) {
        if(page_data !== undefined) this._on_data_loaded(null, null, page_data);
        else this._get_data();
    },

    destroy: function() {
        for each(let image in this._images) image.destroy();

        delete this._id;
        delete this._title;
        delete this._url;
        delete this._extract;
        delete this._length;
        delete this._properties;
        delete this._images;
        delete this._page_image_name;
        delete this._page_image;
        delete this._data_loaded;
        delete this._images_loaded;
        delete this._exists;
    },

    get id() {
        return this._id;
    },

    set id(id) {
        this._id = id;
    },

    get title() {
        return this._title;
    },

    set title(title) {
        this._title = title;
    },

    get url() {
        return this._url;
    },

    set url(url) {
        this._url = url;
    },

    get mobile_url() {
        return '%s?%s'.format(this._url, 'useformat=mobile');
    },

    get extract() {
        return this._extract;
    },

    set extract(extract) {
        this._extract = extract;
    },

    get length() {
        return this._length;
    },

    set length(length) {
        this._length = length;
    },

    get properties() {
        return this._properties;
    },

    set properties(pageprops) {
        if(pageprops.disambiguation !== undefined) {
            this.properties.disambiguation = true;
        }
        if(!Utils.is_blank(pageprops.page_image)) {
            this.properties.page_image = pageprops.page_image;
        }
    },

    get images() {
        return this._images;
    },

    set images(wikipedia_images) {
        this._images = wikipedia_images || [];
    },

    get page_image() {
        return this._page_image;
    },

    set page_image(wikipedia_image) {
        this.has_main_image = true;
        this._page_image = wikipedia_image;
    },

    get lang() {
        return this._lang;
    },

    set lang(lang) {
        this._lang = lang;
    },

    get exists() {
        return this._exists;
    },

    set exists(exists) {
        this._exists = exists;
    },

    get page_image_name() {
        if(this._properties.page_image) {
            return 'File:' + Utils.wikipedia_normalize_title(
                this._properties.page_image
            )
        }

        return null;
    }
});
Signals.addSignalMethods(WikipediaPage.prototype);
