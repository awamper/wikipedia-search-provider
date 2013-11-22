const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Pango = imports.gi.Pango;
const Clutter = imports.gi.Clutter;
const Signals = imports.signals;
const Params = imports.misc.params;
const Tweener = imports.ui.tweener;
const Soup = imports.gi.Soup;
const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const Prefs = Me.imports.prefs;
const WikipediaResultImage = Me.imports.wikipedia_result_image;

const SCALE_ANIMATION_TIME = .5;

const WikipediaResult = new Lang.Class({
    Name: 'WikipediaResult',

    _init: function(result_store) {
        this._store = result_store;
        this._store.connect("thumb-setted",
            Lang.bind(this,this._on_thumb_setted)
        );

        this._init_title();
        this._init_extract();
        this._init_thumb();

        this.actor = new St.BoxLayout({
            style_class: 'wikipedia-result-box',
            height: Utils.SETTINGS.get_int(Prefs.WIKI_RESULT_HEIGHT),
            width: this._calculate_width()
        });

        this._style_postfix = Utils.SETTINGS.get_boolean(
            Prefs.WIKI_ENABLE_DARK_THEME
        ) ? '-dark' : '';
        let style = 'wikipedia-content-box%s'.format(this._style_postfix);

        this._box = new St.BoxLayout({
            style_class: style,
            vertical: true,
            track_hover: true,
            reactive: true
        });
        this._box.connect("button-press-event",
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                o.add_style_pseudo_class("active");
            })
        );
        this._box.connect("button-release-event",
            Lang.bind(this, function(o, e) {
                let button = e.get_button();
                o.remove_style_pseudo_class("active");
                this.emit("clicked", button);
            })
        );
        this._box.add(this.title_label);

        this._details = new St.BoxLayout({
            vertical: false
        });
        this._box.add(this._details, {
            row: 1,
            col: 0,
            x_expand: true,
            x_fill: true,
            y_expand: true,
            y_fill: true
        })

        this._details.add(this.thumb.actor);
        this._details.add(this.extract_box, {
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true
        });

        this.actor.add(this._box, {
            expand: true
        });

        if(this._store.has_image_name && Utils.SETTINGS.get_boolean(Prefs.WIKI_ENABLE_IMAGES)) {
            this.thumb.show();
        }

        this._thumb_enter_timeout_id = 0;
        this._thumb_clone = null;
        this._clone_background = null;
    },

    _get_clone_background: function() {
        let actor = new St.BoxLayout({
            style_class: "wikipedia-clone-background%s".format(
                this._style_postfix
            )
        })
        return actor;
    },

    _on_thumb_setted: function() {
        let ratio = 0;
        let small_size = [0, 0];
        let max_width = Utils.SETTINGS.get_int(Prefs.WIKI_IMAGE_MAX_WIDTH);
        let max_height = Utils.SETTINGS.get_int(Prefs.WIKI_IMAGE_MAX_HEIGHT);

        if(this._store.thumb_info.width > this._store.thumb_info.height) {
            ratio = (
                this._store.thumb_info.width / this._store.thumb_info.height
            ).toFixed(2);
            small_size = [max_width, Math.ceil(max_width / ratio)];
        }
        else {
            ratio = (
                this._store.thumb_info.height / this._store.thumb_info.width
            ).toFixed(2);
            small_size = [Math.ceil(max_height / ratio), max_height];
        }

        this.thumb.image_uri = this._store.thumb_info.url;
        this.thumb.load_image();
        this.thumb._image_actor.set_size(
            small_size[0],
            small_size[1]
        )

        this.thumb.actor.connect("enter-event", Lang.bind(this, function() {
            if(this._thumb_enter_timeout_id > 0) {
                Mainloop.source_remove(this._thumb_enter_timeout_id);
                this._thumb_enter_timeout_id = 0;
            }

            this._thumb_enter_timeout_id = Mainloop.timeout_add(300,
                Lang.bind(this, function() {
                    let overview = Main.overview._overview;
                    let scale_factor = (
                        this._store.thumb_info.width / small_size[0]
                    ).toFixed(2);
                    [x, y] = this.thumb._image_actor.get_transformed_position();
                    let pivot_x = (x / overview.width).toFixed(2);
                    let pivot_y = (y / overview.height).toFixed(2);

                    this._thumb_clone = new Clutter.Clone({
                        source: this.thumb._image_actor,
                        width: this.thumb._image_actor.width,
                        height: this.thumb._image_actor.height,
                    });

                    this._clone_background = this._get_clone_background();
                    this._clone_background.opacity = 0;
                    this._clone_background.x = x;
                    this._clone_background.y = y;
                    this._clone_background.set_pivot_point(pivot_x, pivot_y);
                    this._clone_background.add_child(this._thumb_clone);
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
        this.thumb.actor.connect("leave-event", Lang.bind(this, function() {
            if(this._thumb_enter_timeout_id > 0) {
                Mainloop.source_remove(this._thumb_enter_timeout_id);
                this._thumb_enter_timeout_id = 0;
            }

            if(this._clone_background && this._thumb_clone) {
                Tweener.removeTweens(this._clone_background);
                Tweener.addTween(this._clone_background, {
                    scale_x: 1,
                    scale_y: 1,
                    opacity: 0,
                    time: SCALE_ANIMATION_TIME,
                    transition: 'easeOutQuad',
                    onComplete: Lang.bind(this, function() {
                        this._thumb_clone.destroy();
                        this._clone_background.destroy()
                        this._thumb_clone = null;
                        this._clone_background = null;
                    })
                });
            }
        }));
    },

    _calculate_width: function() {
        let width;
        let user_width = Utils.SETTINGS.get_int(Prefs.WIKI_RESULT_WIDTH);

        if(user_width > 0) {
            width = user_width;
        }
        else {
            let search_results = Main.overview.viewSelector._searchResults;
            width = search_results._contentBin.width / Utils.SETTINGS.get_int(
                Prefs.WIKI_MAX_RESULT_COLUMNS
            );
        }

        return width;
    },

    _init_title: function() {
        let title_size = Utils.SETTINGS.get_int(Prefs.WIKI_TITLE_FONT_SIZE);
        this.title_label = new St.Label({
            text: this._store.title,
            style_class: 'wikipedia-title',
            style: 'font-size: %spx;'.format(title_size)
        });
        this.title_label.clutter_text.set_single_line_mode(true);
        this.title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);
    },

    _init_extract: function() {
        let extract_size = Utils.SETTINGS.get_int(Prefs.WIKI_EXTRACT_FONT_SIZE);
        this.extract_label = new St.Label({
            style: 'font-size: %spx;'.format(extract_size),
            text: this._store.extract
        });
        this.extract_label.clutter_text.set_line_wrap(true);

        this.extract_box = new St.BoxLayout({
            vertical: true,
            style_class: 'wikipedia-extract-box'
        });
        this.extract_box.add(this.extract_label);
    },

    _init_thumb: function() {
        this.thumb = new WikipediaResultImage.WikipediaResultImage();
    },

    get store() {
        return this._store;
    }
});
Signals.addSignalMethods(WikipediaResult.prototype);
