const Lang = imports.lang;
const Signals = imports.signals;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;

const WikipediaResultStore = new Lang.Class({
    Name: "WikipediaResultStore",

    _init: function(data) {
        this._id = 0;
        this._title = '';
        this._extract = '';
        this._image_name = '';
        this._thumb_info = {};

        this._parse_data(data);
    },

    _parse_data: function(data) {
        if(typeof data.pageid === 'number') {
            this.id = data.pageid;
        }
        else {
            throw new Error('WikipediaResultStore: Bad id');
        }

        if(!Utils.is_blank(data.title)) {
            this.title = data.title;
        }
        else {
            throw new Error('WikipediaResultStore: Bad title');
        }

        if(!Utils.is_blank(data.extract)) {
            this.extract = data.extract;
        }
        else {
            throw new Error('WikipediaResultStore: Bad extract');
        }

        try {
            this.image_name =
                data.pageprops.page_image;
        }
        catch(e) {
            //
        }
    },

    set id(id) {
        this._id = id;
    },

    get id() {
        return this._id;
    },

    set title(title) {
        this._title = title;
    },

    get title() {
        return this._title;
    },

    set extract(extract) {
        this._extract = extract;
    },

    get extract() {
        return this._extract;
    },

    set image_name(name) {
        this._image_name = name;
    },

    get image_name() {
        return this._image_name;
    },

    get has_image_name() {
        return !Utils.is_blank(this.image_name);
    },

    get image_url() {
        return this._image_url;
    },

    set image_url(url) {
        this._image_url = url;
    },

    set thumb_info(info_object) {
        this._thumb_info = info_object;
        this.emit("thumb-setted");
    },

    get thumb_info() {
        return this._thumb_info;
    },

    set thumb_url(url) {
        this._thumb_info.url = url;
    },

    get thumb_url() {
        return this._thumb_info.url;
    },

    set thumb_width(width) {
        this._thumb_info.width = width;
    },

    get thumb_height() {
        this._thumb_info.height = height;
    },

    get has_thumb() {
        return !Utils.is_blank(this._thumb_info.url);
    },

    set language_code(code) {
        this._language_code = code;
    },

    get language_code() {
        return this._language_code;
    } 
});
Signals.addSignalMethods(WikipediaResultStore.prototype);
