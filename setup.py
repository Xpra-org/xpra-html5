#!/usr/bin/env python3
# This file is part of Xpra.
# Copyright (C) 2017-2022 Antoine Martin <antoine@xpra.org>
# Xpra is released under the terms of the GNU GPL v2, or, at your option, any
# later version. See the file LICENSE for details.

import io
import re
import sys
import time
import shutil
import os.path
from subprocess import Popen, PIPE

VERSION = "9.0"
AUTHOR = "Antoine Martin"
AUTHOR_EMAIL = "antoine@xpra.org"

# Configuration files that must not be minified or compressed.
# They must be moved to /etc/xpra and symlinked to /usr/share/xpra/www if no
# custom installation directory is set
CONFIGURATION_FILES = ["default-settings.txt", ]

def glob_recurse(srcdir):
    m = {}
    for root, _, files in os.walk(srcdir):
        for f in files:
            dirname = root[len(srcdir)+1:]
            filename = os.path.join(root, f)
            m.setdefault(dirname, []).append(filename)
    return m

def get_status_output(*args, **kwargs):
    kwargs["stdout"] = PIPE
    kwargs["stderr"] = PIPE
    try:
        p = Popen(*args, **kwargs)
    except Exception as e:
        print(f"error running {args},{kwargs}: {e}")
        return -1, "", ""
    stdout, stderr = p.communicate()
    return p.returncode, stdout.decode("utf-8"), stderr.decode("utf-8")


def install_symlink(symlink_options, dst):
    for symlink_option in symlink_options:
        if symlink_option.find("*"):
            import glob
            #this is a glob, find at least one match:
            matches = glob.glob(symlink_option)
            if matches:
                symlink_option = matches[0]
            else:
                continue
        if os.path.exists(symlink_option):
            print(f"symlinked {dst} from {symlink_option}")
            if os.path.exists(dst):
                os.unlink(dst)
            else:
                ddir = os.path.dirname(dst)
                if not os.path.exists(ddir):
                    os.makedirs(ddir, mode=0o755)
            os.symlink(symlink_option, dst)
            return True
    return False


def get_vcs_info():
    info = {}
    branch = None
    for cmd in (
        r"git branch --show-current",
        #when in detached state, the one above does not work, but this one does:
        r"git branch --remote --verbose --no-abbrev --contains | sed -rne 's/^[^\/]*\/([^\ ]+).*$/\1/p' | tail -n 1",
        #if all else fails:
        r"git branch | grep '* ' | awk '{print $2}'",
    ):
        proc = Popen(cmd, stdout=PIPE, stderr=PIPE, shell=True)
        out, _ = proc.communicate()
        if proc.returncode==0:
            branch_out = out.decode("utf-8").splitlines()
            if branch_out:
                branch = branch_out[0]
                if branch:
                    break
    if not branch:
        print("Warning: could not get branch information")
    else:
        info["BRANCH"] = branch

    def get_output_line(cmd):
        proc = Popen(cmd, stdout=PIPE, stderr=PIPE, shell=True)
        out, _ = proc.communicate()
        if proc.returncode!=0:
            print(f"Error: {cmd} returned {proc.returncode}")
            return None
        v = out.decode("utf-8").splitlines()[0]
        return v
    parts = get_output_line("git describe --always --tags").split("-")
    #ie: parts = ["v4.0.6", "85", "gf253d3f9d"]
    rev = 0
    if len(parts)==3:
        rev = parts[1]
    if branch=="master":
        rev = get_output_line("git rev-list --count HEAD --first-parent")
    if rev:
        try:
            rev = int(rev)
        except ValueError:
            print(f"invalid revision number {rev}")
        else:
            info["REVISION"] = rev

    proc = Popen("git status", stdout=PIPE, stderr=PIPE, shell=True)
    out, _ = proc.communicate()
    changes = 0
    if proc.returncode==0:
        changes = 0
        lines = out.decode('utf-8').splitlines()
        for line in lines:
            sline = line.strip()
            if sline.startswith("modified: ") or sline.startswith("new file:") or sline.startswith("deleted:"):
                changes += 1
    if changes:
        info["LOCAL_MODIFICATIONS"] = changes
    return info

def record_vcs_info():
    info = get_vcs_info()
    if info:
        with open("./vcs-info", 'w', encoding="latin1") as f:
            for k,v in info.items():
                f.write(f"{k}={v}\n")
        #record revision in packaging:
        rev = info.get("REVISION")
        if rev is not None:
            #add full version string to control:
            fdata = open("./packaging/debian/control", "r", encoding="latin1").read()
            lines = fdata.splitlines()
            for i, line in enumerate(lines):
                if line.startswith("Version: "):
                    lines[i] = line.split("-", 1)[0]+f"-r{rev}-1"
                    break
            lines.append("")
            open("./packaging/debian/control", "w", encoding="latin1").write("\n".join(lines))
            #preserve the changelog version, but update the revision:
            fdata = open("./packaging/debian/changelog", "r", encoding="latin1").read()
            lines = fdata.splitlines()
            changelog_version = re.match(r".*\(([0-9\.]+)\-[r0-9\-]*\).*", lines[0]).group(1)
            assert changelog_version, f"version not found in changelog first line {lines[0]!r}"
            lines[0] = f"xpra-html5 ({changelog_version}-r{rev}-1) UNRELEASED; urgency=low"
            lines.append("")
            open("./packaging/debian/changelog", "w", encoding="latin1").write("\n".join(lines))
            #ie: %define release 1.r1000.fc34
            fdata = open("./packaging/rpm/xpra-html5.spec", "r", encoding="latin1").read()
            lines = fdata.splitlines()
            for i, line in enumerate(lines):
                if line.startswith("%define release "):
                    lines[i] = f"%define release 1.r{rev}%\{{?dist\}}"
                    break
            lines.append("")
            open("./packaging/rpm/xpra-html5.spec", "w", encoding="latin1").write("\n".join(lines))

def load_vcs_info():
    info = {}
    if os.path.exists("./vcs-info"):
        with open("./vcs-info", 'r', encoding="latin1") as f:
            for line in f:
                if line.startswith("#"):
                    continue
                parts = line.strip("\n\r").split("=")
                if len(parts)==2:
                    info[parts[0]] = parts[1]
    return info

def install_html5(root="/", install_dir="/usr/share/xpra/www/", config_dir="/etc/xpra/html5-client",
                  configuration_files=CONFIGURATION_FILES,
                  minifier="uglifyjs",
                  gzip=True, brotli=True):
    print("install_html5%s" % ((root, install_dir, config_dir, configuration_files, minifier, gzip, brotli),))
    if minifier not in ("", None, "copy"):
        print(f"minifying html5 client to {install_dir!r} using {minifier}")
    else:
        print(f"copying html5 client to {install_dir!r}")
    if install_dir==".":
        install_dir = os.getcwd()
    brotli_cmd = None
    brotli_version = None
    if brotli:
        #find brotli on $PATH
        paths = os.environ.get("PATH", "").split(os.pathsep)
        if os.name=="posix":
            #not always present,
            #but brotli is often installed there (install from source):
            paths.append("/usr/local/bin")
        for x in paths:
            br = os.path.join(x, "brotli")
            if sys.platform.startswith("win"):
                br += ".exe"
            if os.path.exists(br):
                proc = Popen([br, "--version"], stdout=PIPE, stderr=PIPE)
                stdout = proc.communicate()[0]
                if proc.wait()==0:
                    brotli_version = stdout.strip(b"\n\r").decode()
                brotli_cmd = br
                break
    print(f"brotli_cmd={brotli_cmd}")
    if brotli_version:
        print(f"  {brotli_version}")
    #those are used to replace the file we ship in source form
    #with one that is maintained by the distribution:
    symlinks = {
        "jquery.js"     : [
            "/usr/share/javascript/jquery/jquery.js",
            "/usr/share/javascript/jquery/latest/jquery.js",
            "/usr/share/javascript/jquery/3/jquery.js",
            ],
        "jquery-ui.js"     : [
            "/usr/share/javascript/jquery-ui/jquery-ui.js",
            "/usr/share/javascript/jquery-ui/latest/jquery-ui.js",
            "/usr/share/javascript/jquery-ui/3/jquery-ui.js",
            ],
        "materialicons-regular.ttf"     : [
            "/usr/share/fonts/truetype/material-design-icons-iconfont/MaterialIcons-Regular.ttf",
            "/usr/share/fonts/material-icons-fonts/MaterialIcons-Regular.ttf",
            ],
        "materialicons-regular.woff"     : [
            "/usr/share/fonts/woff/material-design-icons-iconfont/MaterialIcons-Regular.woff",
            ],
        "materialicons-regular.woff2"     : [
            "/usr/share/fonts/woff/material-design-icons-iconfont/MaterialIcons-Regular.woff2",
            ],
        }
    for k,files in glob_recurse("html5").items():
        if k!="":
            k = os.sep+k
        for fname in files:
            if fname.endswith(".tmp"):
                continue
            src = os.path.join(os.getcwd(), fname)
            parts = fname.split(os.path.sep)
            if parts[0]=="html5":
                fname = os.path.join(*parts[1:])
            dst = os.path.join(root+install_dir, fname)
            if not os.path.exists(root+install_dir):
                os.makedirs(root+install_dir, 0o755)
            elif os.path.exists(dst):
                os.unlink(dst)
            if fname in configuration_files and config_dir and config_dir!=install_dir:
                #install configuration files in `config_dir` in root:
                cdir = root+config_dir
                if not os.path.exists(cdir):
                    os.makedirs(cdir, 0o755)
                config_file = os.path.join(cdir, fname)
                shutil.copyfile(src, config_file)
                os.chmod(config_file, 0o644)
                #and create a symlink from `install_dir`:
                #pointing to the config_file without the root:
                config_file = os.path.join(config_dir, fname)
                os.symlink(config_file, dst)
                print(f"config file symlinked: {dst} -> {config_file}")
                continue
            #try to find an existing installed library and symlink it:
            symlink_options = symlinks.get(os.path.basename(fname), [])
            if install_symlink(symlink_options, dst):
                #we've created a symlink, skip minification and compression
                continue
            ddir = os.path.split(dst)[0]
            if ddir and not os.path.exists(ddir):
                os.makedirs(ddir, 0o755)
            ftype = os.path.splitext(fname)[1].lstrip(".")
            bname = os.path.basename(src)

            fsrc = src
            if ftype=="js" or fname.endswith("index.html"):
                #save to a temporary file after replacing strings:
                with io.open(src, mode='r', encoding='utf8') as f:
                    odata = f.read()
                data = odata
                for regexp, replacewith in {
                    r"^\s*for\s*\(\s*let\s+"     : "for(var ",
                    r"^\s*let\s+"                : "var ",
                    r"^\s*for\s*\(\s*const\s+"   : "for(var ",
                    r"^\s*const\s+"              : "var ",
                    }.items():
                    p = re.compile(regexp)
                    newdata = []
                    for line in data.splitlines():
                        newdata.append(p.sub(replacewith, line))
                    data = "\n".join(newdata)

                if data!=odata:
                    fsrc = src+".tmp"
                    with io.open(fsrc, "w", encoding='utf8') as f:
                        f.write(data)
                    os.chmod(fsrc, 0o644)

            if minifier not in ("", None, "copy") and ftype=="js":
                if minifier=="uglifyjs":
                    minify_cmd = ["uglifyjs",
                                  fsrc,
                                  "-o", dst,
                                  "--compress",
                                  ]
                elif minifier=="hjsmin":
                    minify_cmd = ["hjsmin", "-i", fsrc, "-o", dst]
                else:
                    assert minifier=="yuicompressor"
                    try:
                        import yuicompressor  # @UnresolvedImport
                        jar = yuicompressor.get_jar_filename()
                        java_cmd = os.environ.get("JAVA", "java")
                        minify_cmd = [java_cmd, "-jar", jar]
                    except Exception:
                        minify_cmd = ["yuicompressor"]
                    minify_cmd += [
                                  fsrc,
                                  "--nomunge",
                                  "--line-break", "400",
                                  "--type", ftype,
                                  "-o", dst,
                                  ]
                r = get_status_output(minify_cmd)[0]
                if r!=0:
                    print(f"Error: failed to minify {bname!r}, command {minify_cmd} returned error {r}")
                    shutil.copyfile(fsrc, dst)
                os.chmod(dst, 0o644)
                print(f"minified {fname}")
            else:
                print(f"copied {fname}")
                shutil.copyfile(fsrc, dst)
                os.chmod(dst, 0o644)

            if fsrc!=src:
                os.unlink(fsrc)

            if ftype not in ("png", ) and fname not in configuration_files:
                if gzip:
                    gzip_dst = f"{dst}.gz"
                    if os.path.exists(gzip_dst):
                        os.unlink(gzip_dst)
                    cmd = ["gzip", "-f", "-n", "-9", "-k", dst]
                    get_status_output(cmd)
                    if os.path.exists(gzip_dst):
                        os.chmod(gzip_dst, 0o644)
                if brotli and brotli_cmd:
                    br_dst = f"{dst}.br"
                    if os.path.exists(br_dst):
                        os.unlink(br_dst)
                    if brotli_version and brotli_version>="1":
                        cmd = [brotli_cmd, "-k", dst]
                    else:
                        cmd = [brotli_cmd, "--input", dst, "--output", br_dst, "-q", "11"]
                    code, out, err = get_status_output(cmd)
                    if code!=0:
                        print(f"brotli error code={code} on {cmd}")
                        if out:
                            print(f"stdout={out}")
                        if err:
                            print(f"stderr={err}")
                    elif os.path.exists(br_dst):
                        os.chmod(br_dst, 0o644)
                    else:
                        print(f"Warning: brotli did not create {br_dst!r}")

    if os.name=="posix":
        paths = [
        "/usr/share/backgrounds/images/default.png",
        "/usr/share/backgrounds/images/*default*.png",
        "/usr/share/backgrounds/*default*png",
        "/usr/share/backgrounds/gnome/adwaita*.jpg",    #Debian Stretch
        "/usr/share/backgrounds/images/*jpg",           #CentOS 7
        ]
        if paths:
            extra_symlinks = {"background.png" : paths}
            for f, symlink_options in extra_symlinks.items():
                dst = os.path.join(root+install_dir, f)
                if install_symlink(symlink_options, dst):
                    break

def set_version(NEW_VERSION):
    vcs_info = load_vcs_info() or get_vcs_info()
    REVISION = vcs_info.get("REVISION", 0)
    LOCAL_MODIFICATIONS = vcs_info.get("LOCAL_MODIFICATIONS", 0)
    BRANCH = vcs_info.get("BRANCH", "master")
    NEW_VERSION_STR = NEW_VERSION
    if BRANCH=="master":
        NEW_VERSION_STR += " beta"
    for filename, replace in {
        "./packaging/debian/control" : {
            f"Version: {VERSION}.*" : f"Version: {NEW_VERSION}-r{REVISION}-1",
            },
        "./packaging/rpm/xpra-html5.spec" : {
            f"%define version {VERSION}" : f"%define version {NEW_VERSION}",
            "%define release .*" : f"%define release 1.r{REVISION}%{{?dist}}",
            },
        "./html5/js/Utilities.js" : {
            f'VERSION : "{VERSION}"' : f'VERSION : "{NEW_VERSION}"',
            f"REVISION : [0-9]*" : f"REVISION : {REVISION}",
            'LOCAL_MODIFICATIONS : [0-9]*' : f'LOCAL_MODIFICATIONS : {LOCAL_MODIFICATIONS}',
            'BRANCH : "[a-zA-Z]*"' : f'BRANCH : "{BRANCH}"',
            },
        "./html5/index.html" : {
            "<h3>Version .*</h3>" : f"<h3>Version {NEW_VERSION_STR}</h3>",
            },
        "./html5/connect.html" : {
            "<h5>Version .*</h5>" : f"<h5>Version {NEW_VERSION_STR}</h5>",
            },
        "./setup.py" : {
            f'VERSION = "{VERSION}"' : f'VERSION = "{NEW_VERSION}"',
            },
        }.items():
        file_sub(filename, replace)
    #add changelogs:
    from datetime import datetime
    now = datetime.now()
    deb_date = now.strftime("%a, %d %b %Y %H:%M:%S +0700")
    utc_delta = -time.timezone*100//3600
    deb_date += " %+04d" % utc_delta
    fdata = open("./packaging/debian/changelog", "r", encoding="latin1").read()
    lines = fdata.splitlines()
    lines.insert(0, f"xpra-html5 ({NEW_VERSION}-r{REVISION}-1) UNRELEASED; urgency=low")
    lines.insert(1, "  * TODO")
    lines.insert(2, "")
    # -- Antoine Martin <antoine@xpra.org>  Fri, 30 Apr 2021 12:07:59 +0700
    lines.insert(3, f" -- {AUTHOR} {AUTHOR_EMAIL}  {deb_date}")
    lines.insert(4, "")
    lines.append("")
    open("./packaging/debian/changelog", "w").write("\n".join(lines))
    fdata = open("./packaging/rpm/xpra-html5.spec", "r", encoding="latin1").read()
    lines = fdata.splitlines()
    changelog_lineno = lines.index("%changelog")
    assert changelog_lineno, "'%changelog' not found!"
    rpm_date = now.strftime("%a %b %d %Y")
    #* Tue May 04 2021 Antoine Martin <antoine@xpra.org> 4.2-1
    lines.insert(changelog_lineno+1, "* %s %s <%s> %s-%s-1" % (rpm_date, AUTHOR, AUTHOR_EMAIL, NEW_VERSION, REVISION))
    lines.insert(changelog_lineno+2, "- TODO")
    lines.insert(changelog_lineno+3, "")
    lines.append("")
    open("./packaging/rpm/xpra-html5.spec", "w").write("\n".join(lines))



def file_sub(filename, replace):
    fdata = open(filename, "r").read()
    for old, new in replace.items():
        fdata = re.sub(old, new, fdata)
    open(filename, "w").write(fdata)


def make_deb():
    if os.path.exists("xpra-html5.deb"):
        os.unlink("xpra-html5.deb")
    root = "./xpra-html5"
    if os.path.exists(root):
        shutil.rmtree(root)
    os.mkdir(root)
    shutil.copytree("./packaging/debian", root+"/DEBIAN")
    install_html5(root)
    # Create debian package
    assert Popen(["dpkg-deb", "-Zxz", "--build", "xpra-html5"]).wait()==0
    assert os.path.exists("./xpra-html5.deb")
    shutil.rmtree(root)
    version = ""
    with open("./packaging/debian/changelog", "r", encoding="latin1") as f:
        line = f.readline()
        #ie: 'xpra-html5 (4.2-r872-1) UNRELEASED; urgency=low'
        try:
            version = re.match(r".*\(([0-9\.]+\-[r0-9\-]*)\).*", line).group(1)
            #ie: VERSION=4.1-1
        except Exception:
            pass
    if not os.path.exists("./dist"):
        os.mkdir("./dist")
    os.rename("xpra-html5.deb", f"./dist/xpra-html5-{version}.deb")

def make_rpm():
    tarxz = "xpra-html5-%s.tar.xz" % VERSION
    disttarxz = os.path.join("dist", tarxz)
    if os.path.exists(disttarxz):
        os.unlink(disttarxz)
    try:
        saved = sys.argv
        sys.argv = ["./setup.py", "sdist", "--formats=xztar"]
        sdist()
    finally:
        sys.argv = saved
    RPMBUILD = os.path.expanduser("~/rpmbuild/")
    SOURCES = os.path.join(RPMBUILD, "SOURCES")
    if not os.path.exists(SOURCES):
        os.makedirs(SOURCES, 0o755)
    from shutil import copy2
    copy2(disttarxz, SOURCES)
    SPEC = "./packaging/rpm/xpra-html5.spec"
    proc = Popen(["rpmspec", "-q", "--rpms", SPEC], stdout=PIPE, stderr=PIPE)
    out, err = proc.communicate()
    print(err.decode())
    rpms = []
    for line in out.decode().splitlines():
        rpms.append(line)
    print(f"building: {rpms}")
    assert Popen(["rpmbuild", "-ba", SPEC]).wait()==0
    NOARCH = RPMBUILD+"/RPMS/noarch/"
    for rpm in rpms:
        try:
            os.unlink("./dist/%s.rpm")
        except OSError:
            pass
        rpmfile = f"{rpm}.rpm"
        copy2(os.path.join(NOARCH, rpmfile), "./dist")

def sdist():
    record_vcs_info()
    from distutils.core import setup
    setup(name = "xpra-html5",
          version = VERSION,
          license = "MPL-2",
          author = AUTHOR,
          author_email = AUTHOR_EMAIL,
          url = "https://xpra.org/",
          download_url = "https://xpra.org/src/",
          description = "HTML5 client for xpra",
          py_modules=[],
    )


def main(args):
    def help():
        cmd = args[0]
        print("invalid number of arguments, usage:")
        print(f"{cmd} sdist")
        print(f"{cmd} install")
        print(f"{cmd} install ROOT [INSTALL_DIR] [CONFIG_DIR] [MINIFIER]")
        print(f"{cmd} deb")
        print(f"{cmd} rpm")
        print(f"{cmd} set-version VERSION")
        return 1
    if len(args)<2 or len(args)>=7:
        return help()
    cmd = args[1]
    if cmd=="sdist":
        sdist()
        return 0
    if cmd=="install":
        if not load_vcs_info():
            try:
                record_vcs_info()
            except Exception:
                print("Warning: src_info is missing")
        minifier = "yuicompressor" if sys.platform.startswith("win") else "uglifyjs"
        root_dir = ""
        install_dir = os.path.normpath(os.path.join(sys.prefix, "share/xpra/www"))
        # Platform-dependent configuration file location:
        if sys.platform.startswith('freebsd'):
            # FreeBSD
            config_dir = os.path.normpath(os.path.join(sys.prefix, "etc/xpra/html5-client"))
        elif os.name=="posix":
            # POSIX but not FreeBSD
            config_dir = "/etc/xpra/html5-client"
        else:
            # windows
            config_dir = install_dir
        #these default paths can be overriden on the command line:
        if len(args)>=3:
            root_dir = os.path.normpath(args[2])
            if (sys.platform.startswith("win") or sys.platform.startswith("darwin")) and len(args)==3:
                #backwards compatibility with xpra builds that include the html5 client
                #on MS Windows and MacOS, everything is installed in the root directory:
                install_dir = ""
                config_dir = ""
        if len(args)>=4:
            install_dir = os.path.normpath(args[3])
        if len(args)>=5:
            config_dir = os.path.normpath(args[4])
        if len(args)>=6:
            minifier = args[5]
        # Perform installation
        install_html5(root_dir, install_dir, config_dir, minifier=minifier)
        return 0
    if cmd=="deb":
        make_deb()
        return 0
    if cmd=="rpm":
        make_rpm()
        return 0
    if cmd=="set-version":
        assert len(args)==3, "invalid number of arguments for 'set-version' subcommand"
        NEW_VERSION = args[2]
        set_version(NEW_VERSION)
        #add changelog entries if not present yet?
        return 0
    return help()

if __name__ == "__main__":
    sys.exit(main(sys.argv))
