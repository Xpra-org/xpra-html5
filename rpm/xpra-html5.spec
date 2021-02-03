# This file is part of Xpra.
# Copyright (C) 2010-2021 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file COPYING for details.

%define version 4.1

Name:				xpra-html5
Version:			%{version}
Release:			0
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
BuildRequires:		uglify-js
BuildRequires:		js-jquery
Requires:			js-jquery
#don't depend on this package,
#so we can also install on a pure RHEL distro:
%if 0%{?el8}
BuildRequires:		centos-logos
BuildRequires:		centos-backgrounds
Recommends:			centos-logos
Recommends:			centos-backgrounds
%else
BuildRequires:		desktop-backgrounds-compat
Recommends:		    desktop-backgrounds-compat
%endif

%description
This is the HTML5 client for Xpra,
which can be made available for browsers by the xpra server
or by any other web server.

%prep
%setup

%build
echo "build skipped"

%install
mkdir -p %{buildroot}/usr/share/xpra/www
./setup.py install %{buildroot}/usr/share/xpra/www/
# Ensure all .js files are not executeable
find %{buildroot}%{_datadir}/xpra/www/js -name '*.js' -exec chmod 0644 {} \;

%clean
rm -rf $RPM_BUILD_ROOT

%files
%defattr(-,root,root)
%{_datadir}/xpra/www


%changelog
* Wed Feb 03 2021 Antoine Martin <antoine@xpra.org> 4.1-1
- split from main source tree
