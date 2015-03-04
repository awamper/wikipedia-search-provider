const St = imports.gi.St;
const Lang = imports.lang;
const Main = imports.ui.main;
const Pango = imports.gi.Pango;
const Signals = imports.signals;
const Clutter = imports.gi.Clutter;
const Tweener = imports.ui.tweener;

const Gettext = imports.gettext.domain('wikipedia_search_provider');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Utils = Me.imports.utils;
const PrefsKeys = Me.imports.prefs_keys;
const WikipediaImageView = Me.imports.wikipedia_image_view;
const WikipediaImageResultsView = Me.imports.wikipedia_image_results_view;
const PopupDialog = Me.imports.popup_dialog;

const CopiedUrlLabel = new Lang.Class({
    Name: 'CopiedUrlLabel',
    Extends: PopupDialog.PopupDialog,

    _init: function(text, x, y) {
        this.parent({
            style_class: 'wikipedia-copy-url-label',
            modal: false
        });

        let label = new St.Label({
            text: text
        });
        this.actor.add_child(label);

        this._x = x;
        this._y = y;
    },

    show: function() {
        this._reposition(this._x, this._y);

        this.actor.set_pivot_point(0.5, 0.5);
        this.actor.set_scale(0.7, 0.7);
        this.actor.set_opacity(0);
        this.actor.show();

        Tweener.addTween(this.actor, {
            time: 0.4,
            scale_x: 1,
            scale_y: 1,
            opacity: 255,
            transition: 'easeInExpo',
            onComplete: Lang.bind(this, function() {
                Tweener.addTween(this.actor, {
                    delay: 0.9,
                    time: 0.4,
                    scale_x: 1.7,
                    scale_y: 1.7,
                    opacity: 0,
                    transition: 'easeInExpo',
                    onComplete: Lang.bind(this, function() {
                        this.destroy();
                    })
                });
            })
        });
    }
});

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
        this.actor.connect('destroy', Lang.bind(this, this.destroy));

        this._title_box = new St.BoxLayout({
            vertical: false
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
        this._title_box.add(this._title_label, {
            expand: true,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

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

        this._more_images_button = new St.Button({
            label: '...',
            style_class: 'wikipedia-result-buttons'
        });
        this._more_images_button.hide();
        this._more_images_button.connect(
            'clicked',
            Lang.bind(this, this.show_more_images)
        );

        this._copy_url_button = new St.Icon({
            icon_name: 'insert-link-symbolic',
            style_class: 'wikipedia-copy-url-button',
            reactive: true,
            track_hover: true
        });
        this._copy_url_button.translation_y = -8;
        this._copy_url_button.translation_x = 6;
        this._title_box.add_child(this._copy_url_button);
        if(Utils.is_blank(this._wikipedia_page.url)) this._copy_url_button.hide();

        this._box = new St.BoxLayout({
            style_class: 'wikipedia-content-box' + Utils.get_style_postfix(),
            vertical: true,
            track_hover: true,
            reactive: true
        });
        this._box.connect(
            'button-press-event',
            Lang.bind(this, this._on_button_press)
        );
        this._box.connect(
            'button-release-event',
            Lang.bind(this, this._on_button_release)
        );
        this._box.add(this._title_box);
        this._box.add(this._details, {
            x_expand: true,
            x_fill: true,
            y_expand: true,
            y_fill: true
        })
        this._box.add(this._more_images_button, {
            x_expand: false,
            y_expand: false,
            x_fill: false,
            y_fill: false,
            x_align: St.Align.START,
            y_align: St.Align.MIDDLE
        });

        this.actor.add(this._box, {
            expand: true
        });

        this._wikipedia_image_resuls = null;
    },

    _on_button_press: function(actor, event) {
        if(Utils.is_pointer_inside_actor(this._copy_url_button)) {
            this._copy_url_button.add_style_pseudo_class('active');
        }
        else {
            actor.add_style_pseudo_class('active');
        }
    },

    _on_button_release: function(actor, event) {
        if(Utils.is_pointer_inside_actor(this._copy_url_button)) {
            this._copy_url_button.remove_style_pseudo_class('active');
            this._copy_url_to_clipboard();
        }
        else {
            let button = event.get_button();
            actor.remove_style_pseudo_class('active');
            this.emit('clicked', button);
        }
    },

    _on_images_loaded: function() {
        let show_image =
            this._wikipedia_page.has_main_image
            && Utils.SETTINGS.get_boolean(PrefsKeys.ENABLE_IMAGES);
        if(!show_image) return;

        if(this._wikipedia_page.images.length > 1) {
            this._more_images_button.label = _('more images')+' (%s)'.format(
                this._wikipedia_page.images.length - 1
            );
            this._more_images_button.show();
        }

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
            width = Math.floor(
                search_results._contentBin.width / Utils.SETTINGS.get_int(
                    PrefsKeys.MAX_RESULT_COLUMNS
                )
            );
        }

        return width;
    },

    _copy_url_to_clipboard: function() {
        let clipboard = St.Clipboard.get_default();
        clipboard.set_text(St.ClipboardType.CLIPBOARD, this._wikipedia_page.url);

        let [x, y] = this._copy_url_button.get_transformed_position();
        let animated_label = new CopiedUrlLabel(this._wikipedia_page.url, x, y);
        animated_label.show();
    },

    show_more_images: function() {
        if(this._wikipedia_image_resuls) {
            this._wikipedia_image_resuls.show();
            return;
        }

        let image_views = [];

        for each(let wikipedia_image in this._wikipedia_page.images) {
            if(wikipedia_image.is_page_image) continue;
            let image_view = new WikipediaImageView.WikipediaImageView(
                wikipedia_image
            );
            image_views.push(image_view);
        }

        this._more_images_button.add_style_pseudo_class('inactive');
        this._more_images_button.label = _('loading...');
        this._more_images_button.reactive = false;
        this._more_images_button.track_hover = false;
        this._wikipedia_image_resuls =
            new WikipediaImageResultsView.WikipediaImageResultsView(
                this._more_images_button
            );
        this._wikipedia_image_resuls.set_images(image_views);
        this._wikipedia_image_resuls.connect('loaded',
            Lang.bind(this, function() {
                this._more_images_button.label = _('more images')+' (%s)'.format(
                    this._wikipedia_page.images.length - 1
                );
                this._more_images_button.remove_style_pseudo_class('inactive');
                this._more_images_button.reactive = true;
                this._more_images_button.track_hover = true;
                this._wikipedia_image_resuls.show();
            })
        );
    },

    destroy: function() {
        if(this.actor) this.actor.destroy();
        if(this._wikipedia_image_resuls) this._wikipedia_image_resuls.destroy();
        if(this._wikipedia_page) this._wikipedia_page.destroy();
    },

    get wikipedia_page() {
        return this._wikipedia_page;
    }
});
Signals.addSignalMethods(WikipediaResultView.prototype);
