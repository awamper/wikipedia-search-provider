const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const IMAGE_ANIMATION_TIME = 1;
const SCALE_ANIMATION_TIME = 0.5;

const IMAGE_ENTER_TIMEOUT_TIME = 300;

const TIMEOUT_IDS = {
    THUMB_ENTER: 0
};

const WikipediaImageView = new Lang.Class({
    Name: "WikipediaImageView",

    _init: function(wikipedia_image) {
        this._wikipedia_image = wikipedia_image;
        this._wikipedia_image.connect('loaded',
            Lang.bind(this, this._load_image)
        );

        this._table = new St.Table();

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

        this._load_image();

        this._image_clone = null;
        this._clone_background = null;
    },

    _on_destroy: function() {
        if(this._image_dummy) this._image_dummy.destroy();
        if(this._image_actor) this._image_actor.destroy();
        if(this._image_clone) this._image_clone.destroy();
        if(this._clone_background) this._clone_background.destroy();
    },

    _on_image_loaded: function() {
        let ratio = 0;
        let small_size = [0, 0];

        if(this._wikipedia_image.thumb_width > this._wikipedia_image.thumb_height) {
            ratio = (
                this._wikipedia_image.thumb_width / this._wikipedia_image.thumb_height
            ).toFixed(2);
            small_size = [
                Utils.SETTINGS.get_int(PrefsKeys.IMAGE_MAX_WIDTH),
                Math.ceil(Utils.SETTINGS.get_int(PrefsKeys.IMAGE_MAX_WIDTH) / ratio)
            ];
        }
        else {
            ratio = (
                this._wikipedia_image.thumb_height / this._wikipedia_image.thumb_width
            ).toFixed(2);
            small_size = [
                Math.ceil(Utils.SETTINGS.get_int(PrefsKeys.IMAGE_MAX_HEIGHT) / ratio),
                Utils.SETTINGS.get_int(PrefsKeys.IMAGE_MAX_HEIGHT)
            ];
        }

        this._image_actor.set_size(small_size[0], small_size[1]);
        this.actor.connect("enter-event", Lang.bind(this, function() {
            if(TIMEOUT_IDS.THUMB_ENTER > 0) {
                Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
                TIMEOUT_IDS.THUMB_ENTER = 0;
            }

            TIMEOUT_IDS.THUMB_ENTER = Mainloop.timeout_add(
                IMAGE_ENTER_TIMEOUT_TIME,
                Lang.bind(this, function() {
                    let overview = Main.overview._overview;
                    let scale_factor = (
                        this._wikipedia_image.thumb_width / small_size[0]
                    ).toFixed(2);
                    [x, y] = this._image_actor.get_transformed_position();
                    let pivot_x = (x / overview.width).toFixed(2);
                    let pivot_y = (y / overview.height).toFixed(2);

                    this._image_clone = new Clutter.Clone({
                        source: this._image_actor,
                        width: this._image_actor.width,
                        height: this._image_actor.height,
                    });

                    this._clone_background = this._get_clone_background();
                    this._clone_background.opacity = 0;
                    this._clone_background.x = x;
                    this._clone_background.y = y;
                    this._clone_background.set_pivot_point(pivot_x, pivot_y);
                    this._clone_background.add_child(this._image_clone);
                    Main.uiGroup.add_child(this._clone_background);

                    Tweener.removeTweens(this._clone_background);
                    Tweener.addTween(this._clone_background, {
                        scale_x: scale_factor,
                        scale_y: scale_factor,
                        opacity: 255,
                        time: SCALE_ANIMATION_TIME,
                        transition: 'easeOutQuad'
                    });
                })
            );
        }));
        this.actor.connect("leave-event", Lang.bind(this, function() {
            if(TIMEOUT_IDS.THUMB_ENTER > 0) {
                Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
                TIMEOUT_IDS.THUMB_ENTER = 0;
            }

            if(this._clone_background && this._image_clone) {
                Tweener.removeTweens(this._clone_background);
                Tweener.addTween(this._clone_background, {
                    scale_x: 1,
                    scale_y: 1,
                    opacity: 0,
                    time: SCALE_ANIMATION_TIME,
                    transition: 'easeOutQuad',
                    onComplete: Lang.bind(this, function() {
                        this._image_clone.destroy();
                        this._clone_background.destroy()
                        this._image_clone = null;
                        this._clone_background = null;
                    })
                });
            }
        }));
    },

    _get_clone_background: function() {
        let actor = new St.BoxLayout({
            style_class: 'wikipedia-clone-background' + Utils.get_style_postfix()
        });

        return actor;
    },

    _load_image: function() {
        if(!this._wikipedia_image.exists) return;

        let scale_factor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        let texture_cache = St.TextureCache.get_default();
        this._image_actor = texture_cache.load_uri_async(
            this._wikipedia_image.thumb_url,
            this._wikipedia_image.thumb_width,
            this._wikipedia_image.thumb_height,
            scale_factor
        );
        this._image_actor.set_reactive(true);
        this._image_actor.connect("size-change",
            Lang.bind(this, function(o, e) {
                this._on_image_loaded();

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
                        this._table.set_size(
                            this._image_actor.width,
                            this._image_actor.height
                        );
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
    }
});
