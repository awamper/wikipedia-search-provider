#!/usr/bin/gjs
const Lang = imports.lang;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Gdk = imports.gi.Gdk;
const WebKit = imports.gi.WebKit;

const Application = new Lang.Class({
    Name: 'Application',

    _init: function() {
        let app_id =
            'org.gnome.shell.extensions.wikipedia-search-provider-viewer';
        let app_name = 'wikipedia-search-provider-viewer';
        GLib.set_prgname(app_name);
        this.application = new Gtk.Application({
            application_id: app_id,
            flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE
        });

        this.application.connect(
            'activate',
            Lang.bind(this, this._on_activate)
        );
        this.application.connect(
            'startup',
            Lang.bind(this, this._on_startup)
        );
        this.application.connect(
            'command-line',
            Lang.bind(this, this._on_command_line)
        );
    },

    _build_ui: function(app) {
        this._window = new Gtk.ApplicationWindow({
            application: app,
            window_position: Gtk.WindowPosition.CENTER,
            title: 'Viewer',
            decorated: false
        });
        this._window.set_size_request(700, 700);
        this._window.fullscreen();
        let accel_group = new Gtk.AccelGroup();
        let [key, modifier] = Gtk.accelerator_parse('Escape');
        accel_group.connect(
            key,
            modifier,
            Gtk.AccelFlags.VISIBLE,
            Lang.bind(this, this._quit)
        );
        this._window.add_accel_group(accel_group);

        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        this._window.add(vbox);

        let button_box = new Gtk.Box({
            orientation: Gtk.Orientation.HORIZONTAL,
            halign: Gtk.Align.END
        });
        let label = new Gtk.Label({
            label: 'Press <Escape> to '
        });
        let button = new Gtk.Button({
            label: '<u>exit</u>',
            relief: Gtk.ReliefStyle.NONE
        });
        button.get_children()[0].set_use_markup(true);
        button.connect('clicked', Lang.bind(this, this._quit));
        button_box.pack_start(label, true, false, 0);
        button_box.pack_start(button, false, false, 0);
        vbox.pack_start(button_box, false, false, 0);

        this._progress_bar = new Gtk.ProgressBar();
        vbox.pack_start(this._progress_bar, false, false, 0);

        this._web_view = new WebKit.WebView();
        this._web_view.connect(
            'notify::progress',
            Lang.bind(this, this._on_web_view_progress)
        );

        let scrolled = new Gtk.ScrolledWindow();
        scrolled.add(this._web_view);
        vbox.pack_start(scrolled, true, true, 0);

        this._window.show_all();
    },

    _quit: function() {
        this.application.quit();
    },

    _on_web_view_progress: function(web_view) {
        let progress = web_view.get_progress();

        if(progress === 1) {
            this._progress_bar.hide();
        }
        else {
            this._progress_bar.show();
            this._progress_bar.set_fraction(progress);
        }
    },

    _on_activate: function() {
        this._window.present();
    },

    _on_startup: function(app) {
        this._build_ui(app);
    },

    _on_command_line: function(app, command_line) {
        app.activate();
        let args = command_line.get_arguments();

        if(args.length) {
            let url = args[0];
            this._web_view.load_uri(url);
        }

        return 0;
    }
});

let app = new Application();
app.application.run(ARGV);
