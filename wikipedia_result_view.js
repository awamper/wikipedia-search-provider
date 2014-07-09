const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Pango = imports.gi.Pango;
const Signals = imports.signals;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaImage = Me.imports.wikipedia_image;
const WikipediaImageView = Me.imports.wikipedia_image_view;

const WikipediaResultView = new Lang.Class({
    Name: 'WikipediaResultView',

    _init: function(wikipedia_page) {
        this._wikipedia_page = wikipedia_page;
        this._wikipedia_page.connect("images-loaded",
            Lang.bind(this,this._on_images_loaded)
        );

        this.actor = new St.BoxLayout({
            style_class: 'wikipedia-result-box',
            height: Utils.SETTINGS.get_int(PrefsKeys.RESULT_HEIGHT),
            width: this._calculate_width()
        });

        this._title_label = new St.Label({
            text: this._wikipedia_page.title,
            style_class: 'wikipedia-title',
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.TITLE_FONT_SIZE)
            )
        });
        this._title_label.clutter_text.set_single_line_mode(true);
        this._title_label.clutter_text.set_ellipsize(Pango.EllipsizeMode.END);

        this._extract_label = new St.Label({
            style: 'font-size: %spx;'.format(
                Utils.SETTINGS.get_int(PrefsKeys.EXTRACT_FONT_SIZE)
            ),
            text: this._wikipedia_page.extract
        });
        this._extract_label.clutter_text.set_line_wrap(true);
        this._extract_box = new St.BoxLayout({
            vertical: true,
            style_class: 'wikipedia-extract-box'
        });
        this._extract_box.add(this._extract_label);

        this._details = new St.BoxLayout({
            vertical: false
        });
        this._details.add(this._extract_box, {
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true
        });

        this._box = new St.BoxLayout({
            style_class: 'wikipedia-content-box' + Utils.get_style_postfix(),
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
        this._box.add(this._title_label);
        this._box.add(this._details, {
            row: 1,
            col: 0,
            x_expand: true,
            x_fill: true,
            y_expand: true,
            y_fill: true
        })

        this.actor.add(this._box, {
            expand: true
        });
    },

    _on_images_loaded: function() {
        let show_image =
            this._wikipedia_page.has_main_image
            && Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_IMAGES);
        if(!show_image) return;

        this._main_image = new WikipediaImageView.WikipediaImageView(
            this._wikipedia_page.page_image
        );

        this._details.remove_all_children();
        this._details.add(this._main_image.actor);
        this._details.add(this._extract_box, {
            x_expand: true,
            y_expand: true,
            x_fill: true,
            y_fill: true
        });
    },

    _calculate_width: function() {
        let width = Utils.SETTINGS.get_int(PrefsKeys.RESULT_WIDTH);

        if(width <= 0) {
            let search_results = Main.overview.viewSelector._searchResults;
            width = search_results._contentBin.width / Utils.SETTINGS.get_int(
                PrefsKeys.MAX_RESULT_COLUMNS
            );
        }

        return width;
    },

    destroy: function() {
        this.actor.destroy();
    },

    get wikipedia_page() {
        return this._wikipedia_page;
    }
});
Signals.addSignalMethods(WikipediaResultView.prototype);
