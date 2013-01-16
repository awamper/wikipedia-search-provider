const Lang = imports.lang;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Params = imports.misc.params;
const ModalDialog = imports.ui.modalDialog;

const ICONS = {
    information: 'dialog-information-symbolic',
    error: 'dialog-error-symbolic'
};

const NotifyPopup = new Lang.Class({
    Name: 'NotifyPopup',
    Extends: ModalDialog.ModalDialog,

    _init: function(params) {
        this.parent({
            shellReactive: true
        });
        this._dialogLayout = 
            typeof this.dialogLayout === "undefined"
            ? this._dialogLayout
            : this.dialogLayout

        this._dialogLayout.set_style_class_name('notify-popup-modal');

        this.params = Params.parse(params, {
            text: 'Nothing',
            icon_name: ICONS.information,
            timeout: 600 // ms
        });

        let label = new St.Label({
            text: this.params.text,
            style_class: 'notify-popup-label'
        });
        let icon = new St.Icon({
            icon_name: this.params.icon_name,
            style_class: 'notify-popup-icon'
        });

        let notify_table = new St.Table({
            name: 'notify_popup_table',
            style_class: 'notify-popup-box'
        })
        notify_table.add(icon, {
            row: 0,
            col: 0
        });
        notify_table.add(label, {
            row: 0,
            col: 1
        });

        this._dialogLayout.add(notify_table);
    },

    display: function() {
        if(this._timeout_id != 0) {
            Mainloop.source_remove(this._timeout_id);
            this._timeout_id = 0;
        }

        this._timeout_id = Mainloop.timeout_add(
            this.params.timeout,
            Lang.bind(this, this._on_timeout)
        );
        this.open();
    },

    _on_timeout : function() {
        if(this._timeout_id != 0) {
            Mainloop.source_remove(this._timeout_id);
            this._timeout_id = 0;
        }

        this.close();
        this.destroy();
    },

    destroy: function() {
        if(this._timeout_id != 0) {
            Mainloop.source_remove(this._timeout_id);
            this._timeout_id = 0;
        }

        this.parent();
    }
});

function show_popup(text, icon_name, timeout) {
    if(text.trim().length === 0) {
        return false;
    }
    else {
        let params = {};
        params.text = text;

        if(icon_name.trim().length > 0) {
            params.icon_name = icon_name;
        }
        if((timeout | 0) > 0 && timeout % 1 == 0) {
            params.timeout = timeout;
        }

        let popup = new NotifyPopup(params);
        popup.display();

        return true;
    }
}
