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

        let vbox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL
        });
        this._window.add(vbox);

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

    _on_web_view_progress: function(web_view) {
        // if(web_view.get_progress() === 1) {
        //     this._web_view.show_all();
        // }
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
