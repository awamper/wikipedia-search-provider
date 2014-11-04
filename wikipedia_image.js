const Lang = imports.lang;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const REPOSITORIES = {
    LOCAL: 0,
    SHARED: 1
};

const MAX_WIDTH = 500;
const MAX_HEIGHT = 500;

const WikipediaImage = new Lang.Class({
    Name: 'WikipediaImage',

    _init: function(image_title) {
        this._title = null;
        this._repository = null;
        this._url = null;
        this._thumb_url = null;
        this._thumb_width = 0,
        this._thumb_height = 0;
        this._exists = null;
        this._is_page_image = null;

        if(image_title) this.title = image_title;
    },

    _on_data_loaded: function(error, result, image_data) {
        if(image_data === undefined) {
            if(error) throw new Error(error);

            if(result_ids.query.pages['-1'].imageinfo === undefined) {
                this.exists = false;
                return;
            }

            image_data = result.query.pages['-1'];
            // if(result.normalized !== undefined) {
            //     image_data.title = result.normalized[0].to;
            // }
        }

        if(!image_data.imageinfo || Utils.ends_with(image_data.title, '.svg')) {
            this.exists = false;
            this.emit('loaded');
            return;
        }

        this.title = image_data.title;
        this.repository = image_data.imagerepository;
        this.url = image_data.imageinfo[0].url;
        this.thumb_url = image_data.imageinfo[0].thumburl;
        this.thumb_width = image_data.imageinfo[0].thumbwidth;
        this.thumb_height = image_data.imageinfo[0].thumbheight;
        this.exists = true;

        this.emit('loaded');
    },

    _get_data: function(callback) {
        let client = new WikipediaClient.WikipediaClient();
        let actions = {
            action: 'query',
            prop: 'imageinfo',
            iiprop: 'url',
            iwurl: '',
            convertitles: '',
            redirects: '',
            titles: this.title,
            iiurlwidth: MAX_WIDTH,
            iiurlheight: MAX_HEIGHT
        };

        client.get(actions, Lang.bind(this, this._on_data_loaded));
    },

    load_data: function(image_data) {
        if(image_data !== undefined) this._on_data_loaded(null, null, image_data);
        else this._get_data();
    },

    destroy: function() {
        delete this._title;
        delete this._repository;
        delete this._url;
        delete this._thumb_url;
        delete this._thumb_width;
        delete this._thumb_height;
        delete this._exists;
    },

    get title() {
        return this._title;
    },

    set title(title) {
        this._title = title;
    },

    get clean_title() {
        return this._title.slice(5, this._title.lastIndexOf('.'));
    },

    get repository() {
        return this._repository;
    },

    set repository(repository) {
        if(repository === 'shared') this._repository = REPOSITORIES.SHARED;
        else this._repository = REPOSITORIES.LOCAL;
    },

    get url() {
        return this._url;
    },

    set url(url) {
        this._url = url;
    },

    get thumb_url() {
        return this._thumb_url;
    },

    set thumb_url(url) {
        this._thumb_url = url;
    },

    get thumb_width() {
        return this._thumb_width;
    },

    set thumb_width(width) {
        this._thumb_width = width;
    },

    get thumb_height() {
        return this._thumb_height;
    },

    set thumb_height(height) {
        this._thumb_height = height;
    },

    get exists() {
        return this._exists;
    },

    set exists(exists) {
        this._exists = exists;
    },

    get is_page_image() {
        return this._is_page_image;
    },

    set is_page_image(is_page_image) {
        this._is_page_image = is_page_image;
    }
});
Signals.addSignalMethods(WikipediaImage.prototype);
