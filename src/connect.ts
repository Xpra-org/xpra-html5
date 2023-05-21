/*
 * This file is part of Xpra.
 * Copyright (c) 2023 Andrew G. Knackstedt <andrewk@vivaldi.net>
 * Copyright (c) 2022 Antoine Martin <antoine@xpra.org>
 * Copyright (C) 2021 Tijs van der Zwaan <tijzwa@vpo.nl>
 * Licensed under MPL 2.0, see:
 * http://www.mozilla.org/MPL/2.0/
 *
 */
import { Utilities } from './app/utilities';
import { MediaSourceConstants, MediaSourceUtil } from './app/util/media-source-util';


/*
 * Helper for offscreen decoding and painting.
 */
const XpraOffscreenWorker = {
    isAvailable() {
        // We do not support firefox as it makes canvases flicker
        const isFirefox = navigator.userAgent.toLowerCase().includes("firefox");
        if (typeof OffscreenCanvas !== "undefined" && !isFirefox) {
            //we also need the direct constructor:
            try {
                new OffscreenCanvas(256, 256);
                return true;
            } catch (error) {
                console.warn("unable to instantiate an offscreen canvas:", error);
            }
        }
        console.warn(
            "Offscreen decoding is not available. Please consider using Google Chrome for better performance."
        );
        return false;
    },
};

declare const $;

const VALUE_PROPERTIES = [
    "server",
    "port",
    "path",
    "username",
    "password",
    "key",
    "bandwidth_limit",
    "encoding",
    "keyboard_layout",
    "audio_codec",
    "toolbar_position",
    "display",
    "shadow_display",
    "override_width",
    "encryption",
    "scroll_reverse_y",
    "vrefresh",
];
const BOOLEAN_PROPERTIES = [
    "keyboard",
    "clipboard",
    "printing",
    "file_transfer",
    "sound",
    "ignore_audio_blacklist",
    "offscreen",
    "exit_with_children",
    "exit_with_client",
    "sharing",
    "steal",
    "reconnect",
    "swap_keys",
    "scroll_reverse_x",
    "video",
    "mediasource_video",
    "ssl",
    "insecure",
    "floating_menu",
    "autohide",
    "clock",
    "debug_main",
    "debug_keyboard",
    "debug_geometry",
    "debug_mouse",
    "debug_clipboard",
    "debug_draw",
    "debug_audio",
    "debug_network",
    "debug_file",
];
const FILE_PROPERTIES = [
    "server",
    "port",
    "username",
    "password",
    "exit_with_children",
    "exit_with_client",
    "sharing",
    "swap_keys",
];
const FILE_TRANSLATION = { server: "host" };

function add_prop(prop: string, value: any, first?) {
    if (Utilities.hasSessionStorage()) {
        //we're using sessionStorage, no need for URL
        if (value === null || value === "undefined") {
            sessionStorage.removeItem(prop);
        } else {
            sessionStorage.setItem(prop, value);
        }
        return "";
    }
    if (value === null || value === "undefined") {
        value = "";
    }
    let sep = "&";
    if (first) {
        sep = "?";
    }
    return sep + prop + "=" + encodeURIComponent("" + value); //ie: "&port=10000"
}

function doConnect() {
    let url =
        "./index.html" +
        add_prop("submit", true, true) +
        get_URL_action() +
        get_URL_props();
    window.location = url as any;
}

function doConnectURI() {
    let url = "xpraws://";
    const ssl = (<HTMLInputElement>document.getElementById("ssl")).checked;
    if (ssl) {
        url = "xprawss://";
    }
    const username = (<HTMLInputElement>document.getElementById("username")).value;
    if (username) {
        url += username + "@";
    }
    url += (<HTMLInputElement>document.getElementById("server")).value;
    const port = (<HTMLInputElement>document.getElementById("port")).value;
    if (port) {
        url += ":" + port;
    }
    url += "/";
    url += get_URL_action() + get_URL_props();
    window.location = url as any;
}

function downloadConnectionFile() {
    const filename =
        ((<HTMLInputElement>document.getElementById("server")).value || "session") + ".xpra";
    let data = "autoconnect=true\n";
    //set a mode:
    const ssl = (<HTMLInputElement>document.getElementById("ssl")).checked;
    if (ssl) {
        data += "mode=wss\n";
    } else {
        data += "mode=ws\n";
    }
    for (let i = 0; i < FILE_PROPERTIES.length; i++) {
        const prop = FILE_PROPERTIES[i];
        const prop_name = FILE_TRANSLATION[prop] || prop;
        const value = (<HTMLInputElement>document.getElementById(prop)).value;
        if (value !== "") {
            data += prop_name + "=" + value + "\n";
        }
    }
    //convert debug switches to a list of debug categories:
    let debug = "";
    const DEBUG_CATEGORIES = [
        "main",
        "keyboard",
        "geometry",
        "mouse",
        "clipboard",
        "draw",
        "audio",
        "network",
        "file",
    ];
    for (let i = 0; i < DEBUG_CATEGORIES.length; i++) {
        let category = DEBUG_CATEGORIES[i];
        const el = document.getElementById("debug_" + category) as HTMLInputElement;
        if (el && el.checked) {
            //"main" enables "client" debugging:
            let s = category == "main" ? "client" : category;
            if (debug) {
                debug += "," + category;
            } else {
                debug = category;
            }
        }
    }
    if (debug) {
        data += "debug=" + debug + "\n";
    }
    Utilities.saveFile(filename, data, { type: "text/plain" });
}

function get_visible_value(entry, select) {
    let entry_widget = document.getElementById(entry) as HTMLInputElement;
    if (
        entry_widget.style.visibility !== "hidden" ||
        // @ts-ignore
        entry_widget.style.visibility !== "collapse"
    ) {
        return entry_widget.value;
    }
    let select_widget = document.getElementById(select) as HTMLInputElement;
    if (
        select_widget.style.visibility !== "hidden" ||
        // @ts-ignore
        select_widget.style.visibility !== "collapse"
    ) {
        return select_widget.value;
    }
    return "";
}

function get_URL_action() {
    let url = "";
    let start = "";
    let display = "";
    let action = "";
    if ((<HTMLInputElement>document.getElementById("action_connect")).checked) {
        action = "connect";
        display = get_visible_value("display", "select_display");
    } else if ((<HTMLInputElement>document.getElementById("action_start")).checked) {
        action = "start";
        start = get_visible_value("start_command", "command_entry");
    } else if ((<HTMLInputElement>document.getElementById("action_start_desktop")).checked) {
        action = "start-desktop";
        start = get_visible_value("start_desktop_command", "desktop_entry");
    } else if ((<HTMLInputElement>document.getElementById("action_shadow")).checked) {
        action = "shadow";
        display = get_visible_value(
            "shadow_display",
            "select_shadow_display"
        );
    }
    if (action) {
        url += add_prop("action", action);
    }
    if (start) {
        url += add_prop("start", start);
    }
    if (display) {
        url += add_prop("display", display);
    }
    return url;
}

function get_URL_props() {
    let url = "";
    for (let i = 0; i < VALUE_PROPERTIES.length; i++) {
        const prop = VALUE_PROPERTIES[i];
        const value = (<HTMLInputElement>document.getElementById(prop)).value;
        url += add_prop(prop, value);
    }
    for (let i = 0; i < BOOLEAN_PROPERTIES.length; i++) {
        const prop = BOOLEAN_PROPERTIES[i];
        url += add_prop(prop, (<HTMLInputElement>document.getElementById(prop)).checked);
    }
    return url;
}

function fill_form(default_settings) {
    const getparam = function (prop) {
        let v = Utilities.getparam(prop);
        if (v == null && prop in default_settings) {
            v = default_settings[prop];
        }
        return v;
    };
    const getboolparam = function (prop, default_value?) {
        let v = Utilities.getparam(prop);
        if (v == null && prop in default_settings) {
            v = default_settings[prop];
        }
        if (v === null) {
            return default_value;
        }
        return (
            ["true", "on", "1", "yes", "enabled"].indexOf(
                String(v).toLowerCase()
            ) !== -1
        );
    };

    const disconnect_reason = getparam("disconnect") || null;
    if (disconnect_reason) {
        document.getElementById("alert-disconnect").style.display = "block";
        document.getElementById("disconnect-reason").innerText =
            disconnect_reason;
    }

    //Populate the form:
    const url = window.location.href;
    const link = document.createElement("a");
    link.setAttribute("href", url);
    let pathname = link.pathname;
    if (pathname && pathname.endsWith("connect.html")) {
        pathname = pathname.substring(
            0,
            pathname.length - "connect.html".length
        );
    }
    if (pathname && pathname == "/") {
        pathname = "";
    }
    var path = getparam("path");
    if (path && path.endsWith("/index.html")) {
        path = path.substr(0, path.lastIndexOf("/"));
    }
    const https = document.location.protocol == "https:";
    var protocol_port = 80;
    if (https) {
        protocol_port = 443;
    }
    (<HTMLInputElement>document.getElementById("server")).value =
        getparam("server") || link.hostname;
    (<HTMLInputElement>document.getElementById("port")).value =
        getparam("port") || link.port || protocol_port;
    (<HTMLInputElement>document.getElementById("path")).value = path || pathname;
    (<HTMLInputElement>document.getElementById("username")).value = getparam("username") || "";

    const override_width = getparam("override_width");
    if (override_width) {
        (<HTMLInputElement>document.getElementById("override_width")).value = override_width;
    } else {
        (<HTMLInputElement>document.getElementById("override_width")).placeholder =
            window.innerWidth.toString();
    }

    const ssl = getboolparam("ssl", https);
    const insecure = getboolparam("insecure", false);
    $("input#ssl").prop("checked", ssl);
    $("input#insecure").prop("checked", insecure);
    const ssl_input = document.getElementById("ssl") as HTMLInputElement;
    const insecure_input = document.getElementById("insecure") as HTMLInputElement;
    const aes_input = document.getElementById("aes") as HTMLInputElement;
    const has_session_storage = Utilities.hasSessionStorage();
    $("span#encryption-key-span").hide();
    aes_input.onchange = function () {
        if (aes_input.checked) {
            $("select#encryption").find("option[value='']").remove();
            $("select#encryption").show();
            $("img#toggle-key").show();
            $("span#aes-label").hide();
            $("span#encryption-key-span").show();
            const key_input = document.getElementById("key") as HTMLInputElement;
            if (!key_input.value) {
                key_input.focus();
            }
        } else {
            $("select#encryption").hide();
            $("select#encryption").append(
                '<option value="" selected="selected"></option>'
            );
            $("img#toggle-key").hide();
            $("span#aes-label").show();
            $("span#encryption-key-span").hide();
        }
    };
    const encryption = (getparam("encryption") || "").toUpperCase();
    if (encryption) {
        let enc = encryption.split("-")[0];
        if (enc == "AES") {
            aes_input.checked = true;
            let enc_mode = encryption.split("-")[1] || "CBC";
            (<HTMLInputElement>document.getElementById("encryption")).value = "AES-" + enc_mode;
        }
    }
    aes_input.onchange(null);

    //vrefresh:
    let animation_times = [];
    let vrefresh = -1;
    let fps;
    function animation_cb(now) {
        let l = animation_times.push(now);
        if (l > 100) {
            animation_times.shift();
        }
        let t0 = animation_times[0];
        if (now > t0 && l > 20) {
            fps = Math.floor((1000 * (l - 1)) / (now - t0));
            (<HTMLInputElement>document.getElementById("vrefresh")).value = "" + fps;
            if (l <= 40) {
                Utilities.debug("draw", "animation_cb", now, "fps", fps);
            }
        }
        window.requestAnimationFrame(animation_cb);
    }
    window.requestAnimationFrame(animation_cb);

    //reveal password and aes key:
    function toggle_reveal(el) {
        let x = document.getElementById(el) as HTMLInputElement;
        if (x.type === "password") {
            x.type = "text";
            return "eye.png";
        } else {
            x.type = "password";
            return "eye-slash.png";
        }
    }
    $("#toggle-password").on("click", function () {
        $("#toggle-password").attr(
            "src",
            "../icons/" + toggle_reveal("password")
        );
    });
    $("#toggle-key").on("click", function () {
        $("#toggle-key").attr("src", "../icons/" + toggle_reveal("key"));
    });

    if (!has_session_storage) {
        //passwords would be sent on URL,
        //so show insecure checkbox whenever ssl is off:
        ssl_input.onchange = function () {
            $("input#password").prop(
                "disabled",
                !has_session_storage &&
                !ssl_input.checked &&
                !insecure_input.checked
            );
            if (ssl_input.checked) {
                $("span#insecure-span").hide();
                aes_input.checked = false;
                aes_input.onchange(null);
            } else {
                $("span#insecure-span").show();
            }
        };
    } else {
        //local storage makes this secure
        $("span#insecure-span").hide();
    }
    $("input#password").prop(
        "disabled",
        !has_session_storage && !ssl_input.checked && !insecure_input.checked
    );
    insecure_input.onchange = function () {
        $("input#password").prop(
            "disabled",
            !has_session_storage &&
            !ssl_input.checked &&
            !insecure_input.checked
        );
    };

    const action = getparam("action") || "";
    if (action == "shadow") {
        (<HTMLInputElement>document.getElementById("action_shadow")).checked = true;
    } else if (action == "start-desktop") {
        (<HTMLInputElement>document.getElementById("action_start_desktop")).checked = true;
    } else if (action == "start") {
        (<HTMLInputElement>document.getElementById("action_start")).checked = true;
    } else {
        (<HTMLInputElement>document.getElementById("action_connect")).checked = true;
    }
    const start = getparam("start") || "";

    function get_host_address(skip_credentials?: boolean, error_fn?: Function) {
        let url = "http";
        if ((<HTMLInputElement>document.getElementById("ssl")).checked) {
            url += "s";
        }
        url += "://";
        if (!skip_credentials) {
            const username = (<HTMLInputElement>document.getElementById("username")).value;
            if (username) {
                url += username + "@";
            }
        }
        const server = (<HTMLInputElement>document.getElementById("server")).value;
        if (!server) {
            //nothing we can do
            error_fn("no server address");
            return;
        }
        url += server;
        const port = (<HTMLInputElement>document.getElementById("port")).value;
        const iport = parseInt(port) || 0;
        if (port && !iport) {
            error_fn("invalid port number '" + port + "'");
            return;
        }
        if (iport) {
            url += ":" + port;
        }
        const path = (<HTMLInputElement>document.getElementById("path")).value;
        if (path) {
            if (!path.startsWith("/")) {
                url += "/";
            }
            url += path;
        }
        if (!url.endsWith("/")) {
            url += "/";
        }
        return url;
    }

    function json_action(uri, success_fn, error_fn?) {
        const url = get_host_address(false, error_fn) + uri;
        Utilities.json_action(url, success_fn, error_fn);
    }

    const command_category_icon = document.getElementById(
        "command_category_icon"
    );
    const command_category = document.getElementById("command_category") as HTMLSelectElement;
    const command_entry_icon =
        document.getElementById("command_entry_icon");
    const command_entry = document.getElementById("command_entry") as HTMLSelectElement;
    function load_icon(icon, src) {
        const url = get_host_address(true) + src;
        icon.onload = function () {
            Utilities.log("loaded icon", url);
        };
        icon.onerror = function (e) {
            Utilities.error("error loading icon", url, ":", e);
        };
        icon.onabort = function (e) {
            Utilities.error("aborted loading icon", url, ":", e);
        };
        icon.src = url;
    }
    function command_entry_changed() {
        var cc =
            command_category.options[command_category.selectedIndex].innerHTML;
        var c = command_entry.options[command_entry.selectedIndex].innerHTML;
        Utilities.log("command_category=", cc, ", command_entry=", c);
        load_icon(command_entry_icon, `MenuIcon/${cc}/${c}`);
        $("#command_entry_icon").show();
    }
    command_entry.addEventListener("change", command_entry_changed);
    function command_category_changed() {
        var cc =
            command_category.options[command_category.selectedIndex].innerHTML;
        Utilities.log("command_category=", cc);
        load_icon(command_category_icon, `MenuIcon/${cc}`);
        $("#command_category_icon").show();
    }
    command_category.addEventListener("change", command_category_changed);

    function init_command_menu() {
        $("#command_category_icon").hide();
        $("#command_entry_icon").hide();
        json_action(
            "Menu",
            function (xhr, response) {
                let categories = Object.keys(response);
                //find the category matching "start":
                let default_start = start || "xterm";
                let current_category = "";
                for (let c in categories) {
                    let category = categories[c];
                    let entries = response[category].Entries;
                    for (let e in entries) {
                        let entry = entries[e];
                        let command_exec = entry.TryExec || entry.Exec;
                        if (default_start == command_exec) {
                            current_category = category;
                        }
                    }
                }
                function populate_commands() {
                    let selected_category = command_category.value;
                    let entries = response[selected_category].Entries;
                    command_entry.innerText = null;
                    for (let e in entries) {
                        let entry = entries[e];
                        let command_exec = entry.TryExec || entry.Exec;
                        if (default_start == command_exec) {
                            $("select#command_entry").append(
                                '<option selected="selected" value="' +
                                command_exec +
                                '">' +
                                entry.Name +
                                "</option>"
                            );
                        } else {
                            $("select#command_entry").append(
                                '<option value="' +
                                command_exec +
                                '">' +
                                entry.Name +
                                "</option>"
                            );
                        }
                    }
                    $("select#command_entry").show();
                    $("#start_command").hide();
                    command_entry_changed();
                }
                command_category.addEventListener("change", populate_commands);
                command_category.innerText = null;
                for (let c in categories) {
                    let category = categories[c];
                    if (category == current_category) {
                        $("select#command_category").append(
                            '<option selected="selected">' + category + "</option>"
                        );
                    } else {
                        $("select#command_category").append(
                            "<option>" + category + "</option>"
                        );
                    }
                }
                command_category_changed();
                $("select#command_category").show();
                populate_commands();
                command_entry_changed();
            },
            function (error) {
                $("select#command_category").hide();
                $("select#command_entry").hide();
                $("#start_command").show();
            }
        );
    }

    const desktop_entry_icon =
        document.getElementById("desktop_entry_icon");
    const desktop_entry = document.getElementById("desktop_entry") as HTMLSelectElement;
    function desktop_entry_changed() {
        var de = desktop_entry.options[desktop_entry.selectedIndex].innerHTML;
        Utilities.log("desktop_session=", de);
        load_icon(desktop_entry_icon, `DesktopMenuIcon/${de}`);
    }
    desktop_entry.addEventListener("change", desktop_entry_changed);

    function init_desktop_menu() {
        $("#desktop_entry_icon").hide();
        json_action(
            "DesktopMenu",
            function (xhr, response) {
                var desktop_sessions = Object.keys(response);
                desktop_entry.innerText = null;
                let default_start_desktop = start;
                if (!default_start_desktop) {
                    const PDE = ["xfce", "xfce session", "openbox", "gnome"];
                    for (let p in PDE) {
                        let de = PDE[p];
                        for (let d in desktop_sessions) {
                            let desktop_session = desktop_sessions[d];
                            if (desktop_session.toLowerCase() == de) {
                                let attributes = response[desktop_session];
                                default_start_desktop =
                                    attributes.TryExec || attributes.Exec;
                                break;
                            }
                        }
                        if (default_start_desktop) {
                            break;
                        }
                    }
                }
                for (let d in desktop_sessions) {
                    let desktop_session = desktop_sessions[d];
                    let attributes = response[desktop_session];
                    let command_exec = attributes.TryExec || attributes.Exec;
                    let selected = "";
                    if (
                        default_start_desktop &&
                        default_start_desktop == command_exec
                    ) {
                        selected = ' selected="selected" ';
                        default_start_desktop = null;
                    }
                    $("select#desktop_entry").append(
                        "<option" +
                        selected +
                        ' value="' +
                        command_exec +
                        '">' +
                        desktop_session +
                        "</option>"
                    );
                }
                desktop_entry_changed();
                $("select#desktop_entry").show();
                $("#desktop_entry_icon").show();
                $("#start_desktop_command").hide();
            },
            function (error) {
                $("select#desktop_entry").hide();
                $("#start_desktop_command").show();
            }
        );
    }

    const display = getparam("display") || "";
    function init_shadow_display() {
        json_action(
            "Displays",
            function (xhr, response) {
                var displays = Object.keys(response);
                const select_shadow_display = document.getElementById(
                    "select_shadow_display"
                );
                select_shadow_display.innerText = null;
                for (let d in displays) {
                    let display_option = displays[d];
                    let label = display_option;
                    let selected = "";
                    let attr = response[display_option];
                    if (attr && attr.wmname) {
                        label = attr.wmname + " on " + display_option;
                    }
                    if (display == display_option) {
                        selected = ' selected="selected" ';
                    }
                    $("select#select_shadow_display").append(
                        "<option" + selected + ">" + label + "</option>"
                    );
                }
                if (displays.length == 0) {
                    $("span#select_shadow_display_warning").show();
                    $("span#select_shadow_display_warning").text(
                        "no displays found"
                    );
                } else {
                    $("span#select_shadow_display_warning").hide();
                    $("span#select_shadow_display_warning").text("");
                }
                $("select#select_shadow_display").show();
                $("#shadow_display").hide();
            },
            function (error) {
                $("select#select_shadow_display").hide();
                $("#shadow_display").show();
            }
        );
    }

    function init_connect_display() {
        json_action(
            "Sessions",
            function (xhr, response) {
                var sessions = Object.keys(response);
                const select_display = document.getElementById("select_display") as HTMLInputElement;
                select_display.innerText = null;
                let count = 0;
                for (let s in sessions) {
                    let session = sessions[s];
                    let attributes = response[session];
                    let session_type = attributes["session-type"];
                    if (session_type == "proxy") {
                        //cannot attach to a proxy
                        continue;
                    }
                    let session_string = "";
                    if (attributes["session-name"]) {
                        session_string = attributes["session-name"] + " ";
                    }
                    session_string += session;
                    if (attributes.username) {
                        session_string += " (" + attributes.username + ")";
                    }
                    let selected = "";
                    if (display == session) {
                        selected = ' selected="selected" ';
                    }
                    $("select#select_display").append(
                        "<option" +
                        selected +
                        " value=" +
                        session +
                        ">" +
                        session_string +
                        "</option>"
                    );
                    count += 1;
                }
                if (count == 0) {
                    $("span#select_display_warning").show();
                    $("span#select_display_warning").text("no sessions found");
                } else {
                    $("span#select_display_warning").hide();
                    $("span#select_display_warning").text("");
                }
                $("select#select_display").show();
                $("#display").hide();

                function display_populate_username() {
                    //populate the username if we have it
                    let session = select_display.value;
                    if (session) {
                        let attributes = response[session];
                        if (attributes && attributes.username) {
                            (<HTMLInputElement>document.getElementById("username")).value =
                                attributes.username;
                        }
                    }
                }

                select_display.onchange = display_populate_username;
                display_populate_username();
            },
            function (error) {
                $("select#select_display").hide();
                $("#display").show();
            }
        );
    }

    function show_mode(is_proxy) {
        Utilities.debug("show_mode(", is_proxy, ")");
        if (is_proxy) {
            //show all options:
            $("#action_connect_group").show();
            $("#action_start_group").show();
            $("#action_start_desktop_group").show();
            $("#action_shadow_group").show();
            //(re)populate the drop down menus:
            init_connect_display();
            init_command_menu();
            init_desktop_menu();
            init_shadow_display();
        } else {
            //only attach is possible, select it and hide everything:
            $("#action_connect").prop("checked", true);
            $("#action_connect_group").hide();
            $("#action_start_group").hide();
            $("#action_start_desktop_group").hide();
            $("#action_shadow_group").hide();
            $("#command_category_icon").hide();
            $("#command_entry_icon").hide();
            $("#desktop_entry_icon").hide();
        }
    }
    function init_mode() {
        json_action(
            "Info",
            function (xhr, response) {
                Utilities.log("Info=", response);
                let mode = response.mode || "";
                if (
                    mode.indexOf("seamless") >= 0 ||
                    mode.indexOf("desktop") >= 0 ||
                    mode.indexOf("shadow") >= 0
                ) {
                    show_mode(false);
                } else {
                    show_mode(true);
                }
            },
            function (error) {
                show_mode(true);
            }
        );
    }
    init_mode();

    let target_changed_timer = 0;
    let ajax_delay = 2000;
    let watched_elements = ["server", "port", "ssl", "encryption", "aes"];
    let host_address = "";
    for (var i = 0, l = watched_elements.length; i < l; i++) {
        let watched_element = watched_elements[i];
        let el = $("#" + watched_element);
        const cancel_changed_timer = () => {
            if (target_changed_timer) {
                clearTimeout(target_changed_timer);
                target_changed_timer = 0;
            }
        }
        const host_address_changed = () => {
            cancel_changed_timer();
            const url = get_host_address();
            if (url != host_address) {
                host_address = url;
                Utilities.debug("host address changed to", url);
                init_mode();
            }
        }
        el.on("change", function () {
            Utilities.log(watched_element, "changed");
            host_address_changed();
        });
        el.on("paste", function () {
            Utilities.log(watched_element, "pasted");
            host_address_changed();
        });
        el.on("keyup", function () {
            Utilities.log(watched_element, "key event");
            cancel_changed_timer();
            target_changed_timer = setTimeout(host_address_changed, ajax_delay) as any as number;
        });
        el.on("keydown", function () {
            cancel_changed_timer();
        });
    }

    function set_exit_actions(disabled) {
        const opacity = disabled ? 0.6 : 1;
        $("input#exit_with_children").prop("disabled", disabled);
        $("input#exit_with_client").prop("disabled", disabled);
        $("li.exit_with_children span").css("opacity", opacity);
        $("li.exit_with_client span").css("opacity", opacity);
        if (disabled) {
            $("input#exit_with_children").prop("checked", false);
            $("input#exit_with_client").prop("checked", false);
        }
    }
    $(document).on("click", '[name="action"]', function () {
        const action = $(this).val();
        set_exit_actions(action == "connect");
    });
    $('input:radio[value="' + action + '"]').click();

    const encoding = getparam("encoding") || "auto";
    (<HTMLInputElement>document.getElementById("encoding")).value = encoding;

    const offscreen = getboolparam(
        "offscreen",
        XpraOffscreenWorker.isAvailable()
    );
    (<HTMLInputElement>document.getElementById("offscreen")).checked = offscreen;
    if (!XpraOffscreenWorker.isAvailable()) {
        (<HTMLInputElement>document.getElementById("offscreen")).disabled = true;
        document
            .getElementById("offscreen")
            .setAttribute("title", "not available in your browser");
        document.getElementById("offscreen_label").classList.add("disabled");
        document
            .getElementById("offscreen_label")
            .setAttribute("title", "not available in your browser");
    }

    let bandwidth_limit = getparam("bandwidth_limit");
    if (bandwidth_limit == null) {
        const ci = Utilities.getConnectionInfo();
        if (ci) {
            bandwidth_limit = ci["downlink"];
        }
    }
    (<HTMLInputElement>document.getElementById("bandwidth_limit")).value = bandwidth_limit || 0;

    let keyboard_layout = getparam("keyboard_layout");
    if (keyboard_layout == null) {
        keyboard_layout = Utilities.getKeyboardLayout();
    }
    (<HTMLInputElement>document.getElementById("keyboard_layout")).value = keyboard_layout;
    json_action("favicon.png?echo-headers", function (xhr, response) {
        const headers = Utilities.ParseResponseHeaders(
            xhr.getAllResponseHeaders()
        );
        Utilities.debug("headers:", headers);
        let lang = headers["Echo-Accept-Language"];
        //ie: lang = "en-gb,en-us;q=0.8,en;q=0.6"
        if (lang) {
            //just the first option:
            Utilities.debug("accept-language:", lang);
            lang = lang.split(",")[0]; //ie: lang="en-gb"
            Utilities.debug("first language:", lang);
            let locale = lang.split("-")[1];
            if (locale) {
                locale = locale.toLowerCase();
                Utilities.debug("request locale:", locale);
                if (locale != keyboard_layout) {
                    keyboard_layout = locale;
                    (<HTMLInputElement>document.getElementById("keyboard_layout")).value =
                        keyboard_layout;
                }
            }
        }
    });
    const audio_codec = getparam("audio_codec") || "";
    const audio_codec_select = document.getElementById("audio_codec") as HTMLSelectElement;
    const ignore_audio_blacklist = getboolparam(
        "ignore_audio_blacklist",
        false
    );
    if (ignore_audio_blacklist) {
        $("input#ignore_audio_blacklist").prop("value", true);
    }

    const codecs_supported = MediaSourceUtil.get_supported_codecs(
        getboolparam("mediasource", true),
        getboolparam("aurora", true),
        ignore_audio_blacklist
    );
    let best_codec = audio_codec;
    if (!best_codec) {
        best_codec = MediaSourceUtil.get_best_codec(codecs_supported);
    }
    for (let codec_option in codecs_supported) {
        const option = document.createElement("option");
        option.value = codec_option;
        option.textContent =
            MediaSourceConstants.CODEC_DESCRIPTION[codec_option] ||
            codecs_supported[codec_option];
        option.selected = codec_option == best_codec;
        audio_codec_select.add(option);
    }
    if (!codecs_supported) {
        $("input#sound").prop("disabled", true);
    } else {
        //enable sound checkbox if the codec is changed:
        audio_codec_select.onchange = function () {
            (<HTMLInputElement>document.getElementById("sound")).checked = true;
        };
    }
    const sound = getboolparam("sound");
    $("input#sound").prop(
        "checked",
        sound && Object.keys(codecs_supported).length > 0
    );

    const bool_props = [
        "keyboard",
        "clipboard",
        "printing",
        "file_transfer",
        "exit_with_children",
        "exit_with_client",
        "sharing",
        "steal",
        "reconnect",
        "swap_keys",
        "video",
        "mediasource_video",
        "floating_menu",
        "autohide",
        "clock",
        "scroll_reverse_x",
        "debug_main",
        "debug_keyboard",
        "debug_geometry",
        "debug_mouse",
        "debug_clipboard",
        "debug_draw",
        "debug_audio",
        "debug_network",
    ];
    const default_on = [
        "steal",
        "printing",
        "file_transfer",
        "reconnect",
        "floating_menu",
        "clock",
        "exit_with_children",
        "exit_with_client",
    ];
    if (!(Utilities.isSafari() && ssl)) {
        default_on.push("clipboard");
    }
    //even on 64-bit, video decoding is too slow
    if (Utilities.isMacOS()) {
        default_on.push("swap_keys");
    }
    if (Utilities.isMobile()) {
        //show the on-screen keyboard by default on mobile:
        default_on.push("keyboard");
    }
    for (let i = 0; i < bool_props.length; i++) {
        const prop = bool_props[i];
        const def = default_on.includes(prop);
        (<HTMLInputElement>document.getElementById(prop)).checked = getboolparam(prop, def);
    }
    //scroll_reverse_y has 3 options: Yes, No, Auto
    const scroll_reverse_y = getboolparam("scroll_reverse_y", "auto");
    (<HTMLInputElement>document.getElementById("scroll_reverse_y")).value = scroll_reverse_y;

    function toggle_mediasource_video() {
        $("#mediasource_video").prop("disabled", !video.checked);
    }
    const video = document.getElementById("video") as HTMLInputElement;
    video.onchange = toggle_mediasource_video;
    toggle_mediasource_video();

    const floating_menu_checkbox = $("#floating_menu");
    function set_menu_attributes_visibility() {
        if (floating_menu_checkbox.is(":checked")) {
            $("#clock").removeAttr("disabled");
            $("#autohide").removeAttr("disabled");
        } else {
            $("#clock").attr("disabled", true);
            $("#autohide").attr("disabled", true);
        }
    }
    floating_menu_checkbox.change(set_menu_attributes_visibility);
    set_menu_attributes_visibility();
    let toolbar_position = getparam("toolbar_position") || "top";
    if (toolbar_position) {
        (<HTMLInputElement>document.getElementById("toolbar_position")).value = toolbar_position;
    }

    aes_input.onchange(null);

    //this may override default values (ie: terminate flags are off for connect mode):
    set_exit_actions(action == "connect" || action == "");

    $("#expandopts").click(function () {
        $("#hiddenopts").slideToggle();
    });
    //delete session params:
    try {
        sessionStorage.clear();
    } catch (e) {
        //ignore
    }
    function submit_if_enter(e) {
        if (!e) {
            const e = window.event;
        }
        if (e.keyCode == 13) {
            e.preventDefault();
            doConnect();
        }
    }
    const submit_text_fields = ["server", "port", "username", "password"];
    for (let i = 0; i < submit_text_fields.length; i++) {
        document
            .getElementById(submit_text_fields[i])
            .addEventListener("keydown", submit_if_enter);
    }
}

$(document).ready(function () {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", "./default-settings.txt");
    xhr.onload = function () {
        fill_form(Utilities.parseINIString(xhr.responseText));
    };
    xhr.onerror = function () {
        fill_form({});
    };
    xhr.onabort = function () {
        fill_form({});
    };
    xhr.send();
});