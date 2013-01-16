/*global log, global */ // <-- for jshint
/** Credit:
 *  based off prefs.js from the gnome shell extensions repository at
 *  git.gnome.org/browse/gnome-shell-extensions
 */

const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Params = imports.misc.params;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
let extensionPath = Me.path;

// Settings
const WIKI_THEME = 'theme';
const WIKI_KEYWORD = 'keyword';
const WIKI_DELAY_TIME = 'delay-time';
const WIKI_RESULTS_ROWS = 'results-rows';
const WIKI_DEFAULT_LANGUAGE = 'default-language';
const WIKI_MAX_CHARS = 'max-chars';
const WIKI_TITLE_FONT_SIZE = 'title-font-size';
const WIKI_EXTRACT_FONT_SIZE = 'extract-font-size';
const WIKI_RESULT_WIDTH = 'result-width';
const WIKI_RESULT_HEIGHT = 'result-height';
const WIKI_SEARCH_FROM_CLIPBOARD = 'search-from-clipboard';
const WIKI_SEARCH_FROM_PRIMARY_SELECTION = 'search-from-primary-selection';
const WIKI_ENABLE_SHORTCUTS = 'enable-shortcuts';

const Themes = {
    LIGHT: 0,
    DARK: 1
};

function init() {
}

const WikipediaSearchProviderPrefsWidget = new GObject.Class({
    Name: 'WikipediaSearchProvider.Prefs.Widget',
    GTypeName: 'WikipediaSearchProviderPrefsWidget',
    Extends: Gtk.Grid,

    _init: function (params) {
        this.parent(params);
        this.margin = this.row_spacing = this.column_spacing = 10;
        this._rownum = 0;
        this._settings = Convenience.getSettings();

        Gtk.Settings.get_default().gtk_button_images = true;

        // keyword
        this._keyword = this.addEntry(
            "Keyword:",
            WIKI_KEYWORD
        );

        // default language
        this._default_language = this.addEntry(
            "Default language:",
            WIKI_DEFAULT_LANGUAGE
        );

        // delay time
        this._delay = this.addSpin('Delay time(ms):', WIKI_DELAY_TIME, {
            lower: 100,
            upper: 5000,
            step_increment: 100
        });

        // max chars
        this._max_chars = this.addSpin('Max chars:', WIKI_MAX_CHARS, {
            lower: 50,
            upper: 2000,
            step_increment: 50
        });

        // title font size
        this._title_font_size = this.addSpin('Title font size(px):', WIKI_TITLE_FONT_SIZE, {
            lower: 1,
            upper: 40,
            step_increment: 1
        });

        // extract font size
        this._extract_font_size = this.addSpin('Extract font size(px):', WIKI_EXTRACT_FONT_SIZE, {
            lower: 1,
            upper: 20,
            step_increment: 1
        });

        // results rows
        this._results_rows = this.addSpin('Max results rows:', WIKI_RESULTS_ROWS, {
            lower: 1,
            upper: 10,
            step_increment: 1
        });

        // theme
        let item = new Gtk.ComboBoxText();

        for(let theme in Themes) {
            if(Themes.hasOwnProperty(theme)) {
                let label = theme[0].toUpperCase() + theme.substring(1).toLowerCase();
                item.insert(-1, Themes[theme].toString(), label);
            }
        }

        // item.set_active_id(this._settings.get_enum(WIKI_THEME)).toString();
        item.set_active_id(this._settings.get_enum(WIKI_THEME) == 0 ? '0' : '1');
        item.connect('changed', Lang.bind(this, function (combo) {
            let value = parseInt(combo.get_active_id(), 10);

            if (value !== undefined &&
                this._settings.get_enum(WIKI_THEME) !== value) {
                this._settings.set_enum(WIKI_THEME, value);
            }
        }));
        this.addRow("Theme:", item);

        //needs restart
        this.addItem(new Gtk.Label({label: 'Needs restart shell'}));
        // result width
        this._result_width = this.addSpin('Width(px):', WIKI_RESULT_WIDTH, {
            lower: 100,
            upper: 1500,
            step_increment: 10
        });

        // result height
        this._result_height = this.addSpin('Height(px):', WIKI_RESULT_HEIGHT, {
            lower: 50,
            upper: 1500,
            step_increment: 10
        });

        // shortcuts
        this.addItem(new Gtk.Label({label: 'Shortcuts'}));

        let enable_shortcuts = this.addBoolean('Shortcuts:', WIKI_ENABLE_SHORTCUTS);
        enable_shortcuts.connect('notify::active',
            Lang.bind(this, function(s) {
                let active = s.get_active();
                clipboard.set_sensitive(active);
                primary_selection.set_sensitive(active);
            })
        );

        let shortcuts_enabled = this._settings.get_boolean(WIKI_ENABLE_SHORTCUTS);

        let clipboard = this.addShortcut(
            'Search from clipboard:',
            WIKI_SEARCH_FROM_CLIPBOARD
        );
        clipboard.set_sensitive(shortcuts_enabled)
        let primary_selection = this.addShortcut(
            'Search from primary selection(requires '+
            '<a href="http://sourceforge.net/projects/xclip/">xclip</a>):',
            WIKI_SEARCH_FROM_PRIMARY_SELECTION
        );
        primary_selection.set_sensitive(shortcuts_enabled);
    },

    addEntry: function (text, key) {
        let item = new Gtk.Entry({ hexpand: true });
        item.text = this._settings.get_string(key);
        this._settings.bind(key, item, 'text', Gio.SettingsBindFlags.DEFAULT);
        return this.addRow(text, item);
    },

    addBoolean: function (text, key) {
        let item = new Gtk.Switch({active: this._settings.get_boolean(key)});
        this._settings.bind(key, item, 'active', Gio.SettingsBindFlags.DEFAULT);
        return this.addRow(text, item);
    },

    addSpin: function (label, key, adjustmentProperties, spinProperties) {
        adjustmentProperties = Params.parse(adjustmentProperties, {
            lower: 0,
            upper: 100,
            step_increment: 100
        });
        let adjustment = new Gtk.Adjustment(adjustmentProperties);
        spinProperties = Params.parse(spinProperties, {
            adjustment: adjustment,
            numeric: true,
            snap_to_ticks: true
        }, true);
        let spinButton = new Gtk.SpinButton(spinProperties);

        spinButton.set_value(this._settings.get_int(key));
        spinButton.connect('value-changed', Lang.bind(this, function (spin) {
            let value = spin.get_value_as_int();
            if(this._settings.get_int(key) !== value) {
                this._settings.set_int(key, value);
            }
        }));
        return this.addRow(label, spinButton, true);
    },

    addShortcut: function(text, settings_key) {
        let item = new Gtk.Entry({
            hexpand: false
        });
        item.set_text(this._settings.get_strv(settings_key)[0]);
        item.connect('changed', Lang.bind(this, function(entry) {
            let [key, mods] = Gtk.accelerator_parse(entry.get_text());

            if(Gtk.accelerator_valid(key, mods)) {
                let shortcut = Gtk.accelerator_name(key, mods);
                this._settings.set_strv(settings_key, [shortcut]);
            }
        }));

        return this.addRow(text, item);
    },

    addRow: function (text, widget, wrap) {
        let label = new Gtk.Label({
            label: text,
            hexpand: true,
            halign: Gtk.Align.START,
            use_markup: true
        });
        label.set_line_wrap(wrap || false);
        this.attach(label, 0, this._rownum, 1, 1); // col, row, colspan, rowspan
        this.attach(widget, 1, this._rownum, 1, 1);
        this._rownum++;
        return widget;
    },

    addItem: function (widget, col, colspan, rowspan) {
        this.attach(widget, col || 0, this._rownum, colspan || 2, rowspan || 1);
        this._rownum++;
        return widget;
    }
});

function buildPrefsWidget() {
    let widget = new WikipediaSearchProviderPrefsWidget();
    widget.show_all();

    return widget;
}
