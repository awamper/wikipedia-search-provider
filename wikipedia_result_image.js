const St = imports.gi.St;
const Lang = imports.lang;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;

const IMAGE_ANIMATION_TIME = 1;

const WikipediaResultImage = new Lang.Class({
    Name: "WikipediaResultImage",

    _init: function(params) {
        this._params = Params.parse(params, {
            uri: '',
            width: -1,
            height: -1
        });

        this._table = new St.Table({
            visible: false
        });
        this.actor = new St.BoxLayout({
            reactive: true
        });
        this.actor.connect("destroy", Lang.bind(this, this._on_destroy));
        this.actor.add_child(this._table);

        this._image_dummy = new St.Icon({
            icon_name: "camera-photo-symbolic",
            icon_size: 80
        });
        this._table.add(this._image_dummy, {
            row: 0,
            col: 0,
            x_expand: true,
            y_expand: true,
            y_fill: false,
            x_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });

        this.image_uri = this._params.uri;
        this.set_size(this._params.width, this._params.height);

        this._image_loaded = false;
    },

    _on_destroy: function() {
        if(this._image_dummy) this._image_dummy.destroy();
        if(this._image_actor) this._image_actor.destroy();
    },

    show: function() {
        if(this._table.visible) return;

        this._table.opacity = 0;
        this._table.show();

        Tweener.removeTweens(this._table);
        Tweener.addTween(this._table, {
            opacity: 255,
            transition: 'easeOutQuad',
            time: IMAGE_ANIMATION_TIME
        });
    },

    hide: function() {
        if(!this._table.visible) return;

        Tweener.removeTweens(this._table);
        Tweener.addTween(this._table, {
            opacity: 0,
            transition: 'easeOutQuad',
            time: IMAGE_ANIMATION_TIME,
            onComplete: Lang.bind(this, function() {
                this._table.opacity = 0;
                this._table.hide();
            })
        });
    },

    load_image: function() {
        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let texture_cache = St.TextureCache.get_default();
        this._image_actor = texture_cache.load_uri_async(
            this.image_uri,
            this.image_width,
            this.image_height,
            scale_factor
        );
        this._image_actor.set_reactive(true);
        this._image_actor.connect("size-change",
            Lang.bind(this, function(o, e) {
                this._image_loaded = true;

                Tweener.removeTweens(this._image_actor);
                Tweener.addTween(this._image_actor, {
                    onStart: Lang.bind(this, function() {
                        this._image_actor.set_opacity(0);
                    }),
                    opacity: 255,
                    time: IMAGE_ANIMATION_TIME,
                    transition: 'easeOutQuad'
                });

                Tweener.removeTweens(this._image_dummy);
                Tweener.addTween(this._image_dummy, {
                    opacity: 0,
                    icon_size: 0,
                    time: IMAGE_ANIMATION_TIME,
                    transition: 'easeOutQuad',
                    onComplete: Lang.bind(this, function() {
                        this._table.remove_child(this._image_dummy);
                        // this._table.set_size(this.image_width, this.image_height);
                    })
                });
            })
        );

        this._table.add(this._image_actor, {
            row: 0,
            col: 0,
            x_expand: true,
            y_expand: true,
            y_fill: false,
            x_fill: false,
            x_align: St.Align.MIDDLE,
            y_align: St.Align.MIDDLE
        });    
    },

    set_size: function(width, height) {
        this.image_width = width;
        this.image_height = height;
    },

    set image_uri(uri) {
        this._image_uri = uri;
    },

    get image_uri() {
        return this._image_uri;
    },

    set image_width(width) {
        this._image_width = width;
    },

    get image_width() {
        return this._image_width;
    },

    set image_height(height) {
        this._image_height = height;
    },

    get image_height() {
        return this._image_height;
    },

    get is_loaded() {
        return this._image_loaded;
    } 
});
