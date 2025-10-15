# This file is part of Xpra.
# Copyright (C) 2010 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file COPYING for details.

%define version 18
%define release 1.r0%{?dist}
%define minifier uglifyjs
%define python python3

Name:				xpra-html5
Version:			%{version}
Release:			%{release}
Summary:			HTML5 client for Xpra
Group:				Networking
License:			GPL-2.0+ AND BSD-3-Clause AND LGPL-3.0+ AND MIT
URL:				https://xpra.org/
Packager:			Antoine Martin <antoine@xpra.org>
Vendor:				https://xpra.org/
Source:				xpra-html5-%{version}.tar.xz
BuildArch:			noarch
BuildRoot:			%{_tmppath}/%{name}-%{version}-root
BuildRequires:		python3-setuptools
Conflicts:			xpra < 2.1
%if 0%{?el7}
%define minifier ""
%define python python2
BuildRequires:		python2
%else
BuildRequires:		uglify-js
BuildRequires:		python3
%endif
#don't depend on this package,
#so we can also install on a pure RHEL distro:
%if 0%{?el10}%{?el9}%{?el8}%{?el7}
BuildRequires:		system-logos
%if 0%{?el10}%{?el9}%{?el8}
BuildRequires:		system-backgrounds
Recommends:			system-logos
Recommends:			system-backgrounds
%endif
%else
BuildRequires:		desktop-backgrounds-compat
Recommends:		    desktop-backgrounds-compat
BuildRequires:		js-jquery
BuildRequires:		brotli
Requires:			js-jquery
%endif

%description
This is the HTML5 client for Xpra,
which can be made available for browsers by the xpra server
or by any other web server.

%prep
%setup

%install
mkdir -p %{buildroot}%{_datadir}/xpra/www
mkdir -p %{buildroot}%{_sysconfdir}/xpra/html5-client
%{python} ./setup.py install %{buildroot} %{_datadir}/xpra/www/ %{_sysconfdir}/xpra/html5-client %{minifier}
# Ensure there are no executable files:
find %{buildroot}%{_datadir}/xpra/www/ -type f -exec chmod 0644 {} \;
mkdir -p %{buildroot}/usr/share/doc/xpra-html5/
%if 0%{?el8}%{?fedora}
cp LICENSE %{buildroot}/usr/share/doc/xpra-html5/
%endif

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{_sysconfdir}/xpra/html5-client
%{_datadir}/xpra/www
%if 0%{?el8}%{?fedora}
%doc LICENSE
%endif

%changelog
* Wed Oct 15 2025 Antoine Martin <antoine@xpra.org> 18-0-1
- Build and packaging:
  RHEL 10 builds
  DEB `Section` value
- New Features:
  better compatibility with newer xpra versions, newer packet formats
  add path to xpra URLs and connection files
  improve crypto API handling and detection, support software fallback
  control channel handlers
  toggle for top level widgets in floating menu
  cleanup resources on disconnect
  use jpeg for desktop background
- Fixes:
  pointer offset
  window clipping calculations
  decoding error handler fails to request a redraw
  offscreen decode error stalled the decode queue
  remove the paint worker
  fixup invalid refactoring
  worker logging going nowhere
  send keyboard events to the root window if that's all we have
  `visibilitychange` must change the refresh-rate, not send power events
  focus confusion
- Cosmetic:
   cleanups and linter warnings
   stricter comparison operators
   drop legacy fullscreen handlers

* Tue Jan 14 2025 Antoine Martin <antoine@xpra.org> 17-0-1
- Build and packaging:
   nodejs-less formatting script
   remove unused modules
   compatibility with newer build scripts require a repository target
- New Features:
   gaming cursor mode
   use builtin browser crypto functions
   noVNC-style vertical retractable floating menu
- Fixes:
   missing start menu with some servers
   horizontal scrolling was inverted
   keep modal windows on top
   offset in desktop mode
- Network:
   WebSocket connections linger and cause re-connect
   longer WebSocket connection timeout
- Decoding:
   bump max video size when offscreen is actually used
   honour offscreen toggle, override detection
   try to fallback to client decoding when worker fails
   disable decode worker zero-copy on errors
   errors when debug logging is enabled
- Connect dialog:
   update 'offscreen' availability when `ssl` is toggled
   consistent and less ugly font
- Minor:
   fail fast if `rencodeplus` packet encoder is missing
   don't send clipboard packets to servers that don't want them
   restrict allowed characters
   prevent the float menu from overflowing
- Cosmetic:
   float menu keyboard icon not changing colours
   hide start menu when there are no entries
   undo formatting mess
   code move and refactoring
   remove unused icons, update ancient 'Material' icons
   remove redundant check
   remove legacy headers
   workaround ugly Chrome obfuscation
   remove legacy bootstrap
   session info box not big enough

* Mon Sep 09 2024 Antoine Martin <antoine@xpra.org> 16-0-1
- re-connection fixes:
   hangs
   does not timeout
   retry WebSocket connection
- ping packets not sent
- desktop session parsing error
- more readable session description
- regular expression parsing error

* Wed Aug 21 2024 Antoine Martin <antoine@xpra.org> 15.1-0-1
- syntax error

* Wed Jul 31 2024 Antoine Martin <antoine@xpra.org> 15-0-1
- try harder to prevent password input with insecure settings, but also allow password input with 'insecure' option
- honour preferred clipboard format

* Tue Jul 02 2024 Antoine Martin <antoine@xpra.org> 14-1569-1
- security fixes:
    prevent XSS from server menu data - low concern
    always reject insecure xor digest
- major features:
    WebTransport
- bug fixes:
    `text/plain` as default clipboard preferred format
    preserve disconnection message when failing early
    show `insecure` checkbox for all insecure connections, but not for `localhost`
- authentication:
    fail fast if digest is unsafe
    restoring tab does not prompt for authentication
    show keyboard focus on the password prompt dialog
    trigger login with keyboard focus
- modernization:
    remove more IE compatibility workarounds
- cleanups and cosmetic: too many to list them all
    highlight invalid endpoint
    constify

* Thu May 23 2024 Antoine Martin <antoine@xpra.org> 13-6-1
- bug fixes:
   do increase video size with offscreen decoding
   URL parameters ignored
   file downloads corrupted
   URL forwarding not enabled
   handling of connection URIs and session files
- clipboard:
   let users choose the preferred clipboard format
   disable polling with Safari and Firefox
   add manual clipboard synchronization button
   `text/html` not copied
   add test page
- features:
   trigger file download from server via file chooser
   show some server information
- cleanups and cosmetic:
   button shows action currently selected
   simplify
   remove redundant statement
   remove outdated docstring
   installation script supports individual info commands
   ignore whitespace when updating vcs info
   remove pointless line wrapping, bad automated formatting, improve readability

* Fri Mar 29 2024 Antoine Martin <antoine@xpra.org> 12.0-6-1
- keycloak authentication fails
- connect page forgetting all settings
- bug report tool error
- support custom minifier command
- build fix when using github source archives
- send relative pointer coordinates when available
- remove legacy 'wheel' workarounds
- remove unused function


* Wed Jan 31 2024 Antoine Martin <antoine@xpra.org> 11-1498-1
- more consistent positioning of fullscreen windows
- prefix the `sessionStorage` data with pathname
- Safari does not support offscreen decoding, stop saying that it does
- Chrome now requires https to enable offscreen decoding
- missing window icons
- clipboard: `unescape` plain text clipboard data, copy `text/html` to the server and from the server
- improve compatibility with server versions: continue to enable pings, dynamic menus, request start menu data
- don't show the clock menu entry until we have the time
- audio state not updated
- code cleanups: simplify, remove MSIE workarounds
- build with newer python versions via setuptools and update the build dependencies
- minor build file linter warnings
- detect minifier, default to 'copy' if not found
- automatic release number generation string format

* Mon Oct 16 2023 Antoine Martin <antoine@xpra.org> 10-1482-1
- update libraries: jquery v3.7.1, jquery ui v1.13.2
- move some encoding attributes to default settings, support more encoding attributes
- simplify parameter parsing
- structured capabilities and more readable
- cosmetic: debug logging, whitespace

* Sun Aug 27 2023 Antoine Martin <antoine@xpra.org> 9.0-1479-1
- support only xpra v5
- windows that shouldn't be collapsible can be collapsed but not restored back
- Unicode clipboard transfers
- fix keyboard modifiers mapping
- allow spaces in passwords
- safari doesn't draw the window
- enable offscreen rendering with Firefox and Safari
- require less CPU but more bandwidth
- use relative path for icons
- more robust value parsing
- dependencies cleanup

* Sat May 06 2023 Antoine Martin <antoine@xpra.org> 8.0-1425-1
- disable scroll encoding with offscreen decode worker
- screenshots cannot be used with the offscreen api
- don't close windows when re-connecting or when closing the browser window
- closing windows is only a request
- hide options when they are not available: `shutdown` and `file upload`
- remote logging arguments missing
- fix initiate-move-resize
- cursor fixes: cursor updates and geometry
- fix vertical scroll reverse
- minor cleanups:
   unused variables
   unused function
   unused statements
   document empty functions
   linter cleanup
   use a more correct datatype
   improved syntax
   use the preferred keywords for variable declaration


* Sun Mar 12 2023 Antoine Martin <antoine@xpra.org> 7.0-1424-1
- unable to move undecorated / CSD windows
- throttle video decoder to prevent flooding
- disable offscreen decode worker with Firefox to prevent flickering
- workaround for setuptools breakage in version 61 and later
- native video decoding is fast enough not to require much downscaling
- propagate error messages
- truncate large clipboard buffers in log messages
- `scroll` draw packets can hang the connection
- prefer h264 and remove vp9
- spurious audio stop errors
- make stream download URL easier to embed
- missing scroll wheel events
- avoid errors if the window's title is unset
- remove support for software video decoding
- don't enable clipboard with Safari and SSL
- provide more useful screen name to the server
- cursor display and scaling issues
- workaround for older versions of Safari

* Mon Oct 17 2022 Antoine Martin <antoine@xpra.org> 6.0-1378-1
- refactorings, cleanups, github CI, etc - JanCVanB
- split decode from paint, PR202 - TijZwa
- experimental native decoding, PR200 - TijZwa
- require ES6
- move to structured `hello` packet data
- support `hjsmin` minifier - arrowd
- updated installer script: #190
- support for chunked file transfers (large files): #120
- modal windows should not be minimized

* Wed May 11 2022 Antoine Martin <antoine@xpra.org> 5.0-1237-1
- auto-fullscreen, alt-tabbing with window previews
- decode images using an offscreen worker thread
- decode `avif` images, grayscale and palette `png`
- handle `void` paint packets
- increase default non-vsynced target framerate
- tell servers to use 'scroll' encoding less aggressively
- keycloak authentication (requires xpra server version 4.4 or later)
- support pre-mapped windows (requires xpra server version 4.4 or later)
- support clipboard pasting file into the session
- detect inverted vertical scrolling (ie: on MacOS)
- improved dead key mapping for non-us layouts
- 64-bit rencode decoding bug with Safari (and IE)
- notification errors with bencoder
- avoid popping up the on-screen keyboard on mobile touch events
- updated on-screen simple-keyboard UI and file saver library
- shifted characters with simple-keyboard
- prevent stuck keys
- focus and raise windows when their title bar is clicked
- spurious focus events when minimizing windows
- fix AES encryption when used with authentication and rencodeplus
- build script refactoring

* Fri Dec 17 2021 Antoine Martin <antoine@xpra.org> 4.5.2-1106-1
- fix toolbar position
- install default settings in /etc/xpra/html5-client/
- image decoding time accounting
- handle scaled screen updates
- skip re-connecting when the error is likely to be permanent
- more helpful disconnection messages
- ensure we timeout if the websocket connection fails
- provide an easy way to prevent unwanted connections (ie: xpra.org)
- fix decode worker sanity checks, validate jpeg, png and webp
- decode worker errors with legacy packet encoders
- validate all encodings
- window title string decoding errors
- create directories as needed when installing
- css syntax error
- better support for relative URLs (proxied configurations)
- window resize offset bug, minimization bugs
- force xz compression for DEB packages (zstd support missing from repository webhost)
- compress harder with brotli
- remove unnecessary time wrapper
- try harder to detect the correct screen refresh rate

* Thu Sep 23 2021 Antoine Martin <antoine@xpra.org> 4.5.1-1043-1
- workaround Firefox bug in image decoder
- allow AES and SSL to be combined
- support multiple authentication challenges

* Wed Sep 15 2021 Antoine Martin <antoine@xpra.org> 4.5-1031-1
- prompt for passwords
- fix AES errors when connecting via the dialog

* Fri Sep 03 2021 Antoine Martin <antoine@xpra.org> 4.4-1017-1
- encryption:
   support more AES modes: CBC, CFB and CTR
   use secure random numbers
- core:
   decode screen updates in a dedicated worker thread
   (except on Mobile devices due to strange compatibility issues)
   switch to pure javascript lz4 implementation
   (fixes compatibility issues with browsers, encryption options, etc)
- misc:
   notifications geometry and styling
   fix zero-copy web worker regression from 4.3
   use zero-copy for transferring audio buffers from the worker

* Mon Aug 09 2021 Antoine Martin <antoine@xpra.org> 4.3-962-1
- build and packaging:
   installation with python2 build environment
   create symlinks for some fonts
   more reliable git branch detection
- rencode packet encoder:
   new, clean javascript implementation
   remove workarounds for Safari, encryption, compression, etc
   handle byte arrays natively without copying
- geometry fixes:
   option to adjust viewport to screen width via scaling
   window visibility adjustements no longer snap to the sides
   server errors for override-redirect windows offsets
   try harder to get override-redirect windows to close
- keyboard:
   don't show the on-screen keyboard on non-mobile devices
   fix keyboard language to keymap matcher
   Ukranian keyboard layout should use 'ua'
- re-connect:
   don't start a new session when re-connecting
   fix disconnections after re-connecting
   don't try to reconnect when shutting down the server
- connect dialog:
   start and start-desktop now work with or without command
   missing session, category and command icons with latest google chrome
   pass w3c validation without any warnings
- cosmetic:
   scale window icons to fit in the title bar
   use sans-serif font for window title
   change titlebar focused / unfocused colours
   make window corners round
   try to scale application cursors to match window zoom
- misc:
   audio debugging was wrongly enabled (extra CPU usage and lag)
   remove http mp3 stream audio support
   log disconnection messages
   prevent console errors with Internet Explorer

* Tue May 18 2021 Antoine Martin <antoine@xpra.org> 4.2-878-1
- select session attributes from list of options exposed by the server
- detect vertical refresh rate
- hide on-screen keyboard by default on non-mobile devices
- tell server to prefer encodings with native decoders
- updated documentation
- build and packaging fixes, add easy 'deb' and 'rpm' build targets
- support older versions of brotli
- fix missing clipboard events
- fix window focus tracking issues
- fix AES encryption (broken by rencoder)

* Fri Apr 02 2021 Antoine Martin <antoine@xpra.org> 4.1.2-1
- build and packaging fixes

* Mon Mar 29 2021 Antoine Martin <antoine@xpra.org> 4.1.1-1
- packaging fixes

* Sun Mar 28 2021 Antoine Martin <antoine@xpra.org> 4.1-1
- split from main source tree
- open print dialog
- added documentation (installation, connection options, authentication, etc)
- build option for platforms without any minifiers
- add on screen keyboard
- better connection diagnostic messages
- download connection files and generate connection URIs
- support for rgb24 pixel encoding
