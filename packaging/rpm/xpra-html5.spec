# This file is part of Xpra.
# Copyright (C) 2010-2022 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file COPYING for details.

%define version 9.0
%define release 1.r1452%{?dist}
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
%if 0%{?el9}%{?el8}%{?el7}
BuildRequires:		system-logos
%if 0%{?el9}%{?el8}
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
* Sat May 06 2023 Antoine Martin <antoine@xpra.org> 9.0-1452-1
- TODO

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
- native video decoding is fast enough not to require much downscaling](https://github.com/Xpra-org/xpra-html5/commit/ed4b0d72f40864cea4fb4b91b5c400085eb44fa8)
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
