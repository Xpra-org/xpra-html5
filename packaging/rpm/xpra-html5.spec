# This file is part of Xpra.
# Copyright (C) 2010-2021 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file COPYING for details.

%define version 4.3
%define release 1.r889%{?dist}
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
%if 0%{?el8}%{?fedora}
BuildRequires:		uglify-js
%else
%define minifier ""
%define python python2
%endif
#don't depend on this package,
#so we can also install on a pure RHEL distro:
%if 0%{?el8}%{?el7}
BuildRequires:		centos-logos
%if 0%{?el8}
BuildRequires:		centos-backgrounds
Recommends:			centos-logos
Recommends:			centos-backgrounds
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
mkdir -p %{buildroot}/usr/share/xpra/www
%{python} ./setup.py install %{buildroot}/usr/share/xpra/www/ %{minifier}
# Ensure there are no executeable files:
find %{buildroot}%{_datadir}/xpra/www/ -type f -exec chmod 0644 {} \;
mkdir -p %{buildroot}/usr/share/doc/xpra-html5/
%if 0%{?el8}%{?fedora}
cp LICENSE %{buildroot}/usr/share/doc/xpra-html5/
%endif

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{_datadir}/xpra/www
%if 0%{?el8}%{?fedora}
%doc xpra-html5/LICENSE
%endif

%changelog
* Sun Aug 08 2021 Antoine Martin <antoine@xpra.org> 4.3-956-1
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
- misc fixes:
   audio debugging was wrongly enabled (extra CPU usage and lag)
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
