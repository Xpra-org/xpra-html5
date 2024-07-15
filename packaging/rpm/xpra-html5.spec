# This file is part of Xpra.
# Copyright (C) 2010-2022 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file COPYING for details.

%define version 5.5
%define release 0%{?dist}
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
* Mon Jul 15 2024 Antoine Martin <antoine@xpra.org> 5.5-1-1
- fail fast if digest is unsafe
- refuse to use xor digest for passwords over insecure connections
- add RHEL10 builds
- prevent simple XSS from server menu data
- preserve disconnection message
- hide file transfers if not supported by the server
- add 'Download' file menu entry
- password attribute is a list
- don't try to convert strings to strings
- ignore whitespace when updating vcs info
- newer python compatibility: prefer setuptools, also add setuptools to the build dependencies
- consistency: always return a string

* Tue Nov 28 2023 Antoine Martin <antoine@xpra.org> 5.4-1
- update jquery and jquery-ui libraries
- don't show the clock menu entry until we have the time
- compatibility with newer servers for ping capability

* Thu Jun 15 2023 Antoine Martin <antoine@xpra.org> 5.3-0-1
- some windows can't be restored
- fix relative path to eye-icon
- handle missing values more gracefully
- Safari can't render using offscreen
- allow spaces in passwords

* Sat May 06 2023 Antoine Martin <antoine@xpra.org> 5.2-0-1
- offscreen decode worker issues: disable scroll encoding and screenshots, fix decode parsing errors
- workarounds for older versions of Safari
- correctly parse audio metadata
- stop collecting vertical refresh data once we have enough
- don't close windows when re-connecting
- connect form can populate username
- add missing alt attributes
- honour vertical scroll reverse option

* Sun Mar 05 2023 Antoine Martin <antoine@xpra.org> 5.1-0-1
- missing wheel events in non-seamless modes
- workaround for older browsers without hasOwn (ie: Safari)
- workaround debilitating Safari clipboard implementation
- broken legacy clipboard
- windows movement compatibility with Xpra 3.1.x
- don't allow modal windows to be minimized
- build fixes for RHEL and clones
- setuptools and Debian repo build script fixes
- only send 'sound-stop' if audio is enabled
- `rencode` draw compatibility fix
- avoid errors when windows don't have a title
- provide a more useful screen name to the server
- truncate large clipboard buffers in debug output
- log the actual packet data with network errors
- decode worker always supports rgb
- fix brotli decompression
- minor codestyle tweaks
- clarify installation instructions

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
