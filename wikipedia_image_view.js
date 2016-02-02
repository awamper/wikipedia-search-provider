const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;
const Signals = imports.signals;
const Gio = imports.gi.Gio;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;

const IMAGE_ANIMATION_TIME = 1;
const SCALE_ANIMATION_TIME = 0.5;

const IMAGE_ENTER_TIMEOUT_TIME = 300;

const CAMERA_ICON_SIZE = 80;
const IMAGE_MENU_ICON_SIZE = 17;

const MENU_MIN_OPACITY = 70;
const MENU_MAX_OPACITY = 255;

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

        this._table = new St.Widget({
          layout_manager: new Clutter.TableLayout()
        });

        this.actor = new St.BoxLayout({
            reactive: true
        });
        this.actor.connect(
            'destroy',
            Lang.bind(this, this._on_destroy)
        );
        this.actor.add_child(this._table);

        this._image_dummy = new St.Icon({
            icon_name: Utils.ICONS.CAMERA,
            icon_size: CAMERA_ICON_SIZE
        });
        this._table.layout_manager.pack(this._image_dummy, 0, 0);


        this._zoom_icon = new St.Icon({
            icon_name: Utils.ICONS.ZOOM_IN,
            icon_size: IMAGE_MENU_ICON_SIZE,
            reactive: true
        });
        this._zoom_icon.connect(
            'enter-event',
            Lang.bind(this, this._on_zoom_enter)
        );
        this._zoom_icon.connect(
            'leave-event',
            Lang.bind(this, this._on_zoom_leave)
        );

        this._image_menu_box = new St.BoxLayout({
            style_class: 'wikipedia-image-view-menu-box'
        });
        this._image_menu_box.add(this._zoom_icon, {
            x_expand: true,
            y_expand: true,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.END,
            y_align: St.Align.MIDDLE
        });

        this._load_image();

        this._image_clone = null;
        this._clone_background = null;
    },

    _get_small_size: function() {
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

        return small_size;
    },

    _on_destroy: function() {
        if(this._image_dummy) this._image_dummy.destroy();
        if(this._image_actor) this._image_actor.destroy();
        if(this._image_clone) this._image_clone.destroy();
        if(this._clone_background) this._clone_background.destroy();
        if(this._image_menu_box) this._image_menu_box.destroy();
    },

    _on_zoom_enter: function() {
        if(TIMEOUT_IDS.THUMB_ENTER > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
            TIMEOUT_IDS.THUMB_ENTER = 0;
        }
        if(!this._image_actor) return;

        TIMEOUT_IDS.THUMB_ENTER = Mainloop.timeout_add(
            IMAGE_ENTER_TIMEOUT_TIME,
            Lang.bind(this, this._show_big_image)
        );
    },

    _on_zoom_leave: function() {
        if(TIMEOUT_IDS.THUMB_ENTER > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
            TIMEOUT_IDS.THUMB_ENTER = 0;
        }

        this._hide_big_image();
    },

    _add_image_menu: function() {
        if(this._table.contains(this._image_menu_box)) return;

        this._table.layout_manager.pack(this._image_menu_box, 0, 0);
        this._image_menu_box.translation_y = -(
            this._image_actor.y - this._image_menu_box.y
        );
        this._image_menu_box.set_opacity(MENU_MIN_OPACITY);
    },

    _show_image_menu: function() {
        Tweener.removeTweens(this._image_menu_box);
        Tweener.addTween(this._image_menu_box, {
            opacity: MENU_MAX_OPACITY,
            time: 0.5,
            transition: 'easeOutQuad'
        });
    },

    _hide_image_menu: function() {
        if(!this._table.contains(this._image_menu_box)) return;

        Tweener.removeTweens(this._image_menu_box);
        Tweener.addTween(this._image_menu_box, {
            opacity: MENU_MIN_OPACITY,
            time: 0.5,
            transition: 'easeOutQuad'
        });
    },

    _show_big_image: function() {
        if(TIMEOUT_IDS.THUMB_ENTER > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
            TIMEOUT_IDS.THUMB_ENTER = 0;
        }

        let overview = Main.overview._overview;
        let small_size = this._get_small_size();
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
            transition: 'easeOutQuad',
            onComplete: Lang.bind(this, function() {
                let [x, y] = this._clone_background.get_transformed_position();
                this._image_title_label = new St.Label({
                    text: this.wikipedia_image.clean_title,
                    style: 'background-color: rgba(0, 0, 0, 0.7); padding-left: 3px;',
                    width: this._clone_background.width * scale_factor,
                    x: x,
                    y: y
                });
                Main.uiGroup.add_child(this._image_title_label);
                this._image_title_label.translation_y =
                    -this._image_title_label.height;
            })
        });
    },

    _hide_big_image: function() {
        if(TIMEOUT_IDS.THUMB_ENTER > 0) {
            Mainloop.source_remove(TIMEOUT_IDS.THUMB_ENTER);
            TIMEOUT_IDS.THUMB_ENTER = 0;
        }

        if(this._image_title_label) this._image_title_label.destroy();
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
    },

    _on_image_loaded: function() {
        let small_size = this._get_small_size();
        this._image_actor.set_size(small_size[0], small_size[1]);
        this._image_actor.connect(
            'enter-event',
            Lang.bind(this, this._show_image_menu)
        );
        this._image_actor.connect(
            'leave-event',
            Lang.bind(this, this._hide_image_menu)
        );
        this.emit('loaded');
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
        let image_file = Gio.file_new_for_uri(this._wikipedia_image.thumb_url)
        this._image_actor = texture_cache.load_file_async(
            image_file,
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
                    transition: 'easeOutQuad',
                    onComplete: Lang.bind(this, this._add_image_menu)
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

        this._table.layout_manager.pack(this._image_actor, 0, 0);
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

    destroy: function() {
        this._on_destroy();
        this.actor.destroy();
    },

    get small_width() {
        return this._get_small_size()[0];
    },

    get small_height() {
        return this._get_small_size()[1];
    },

    get width() {
        return this._wikipedia_image.thumb_width;
    },

    get height() {
        return this._wikipedia_image.thumb_height;
    },

    get wikipedia_image() {
        return this._wikipedia_image;
    }
});
Signals.addSignalMethods(WikipediaImageView.prototype);
