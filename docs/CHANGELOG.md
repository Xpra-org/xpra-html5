# Changelog

All notable changes to this project will be documented in this file.

## [4.2] 2021-05-18
* select session attributes from list of options exposed by the server
* detect vertical refresh rate
* hide on-screen keyboard by default on non-mobile devices
* tell server to prefer encodings with native decoders
* updated documentation
* build and packaging fixes, add easy 'deb' and 'rpm' build targets
* support older versions of brotli
* fix missing clipboard events
* fix window focus tracking issues
* fix AES encryption (broken by rencoder)

## [4.1.2] 2021-04-01
* more build and packaging fixes

## [4.1.1] 2021-03-29
* minor packaging fixes

## [4.1] 2021-03-28
* open print dialog
* added documentation (installation, connection options, authentication, etc)
* build option for platforms without any minifiers
* add on screen keyboard
* better connection diagnostic messages
* download connection files and generate connection URIs
* support for rgb24 pixel encoding

### Changed 

- now packaged separately from the main xpra packages


---

For earlier versions, before `xpra-html5` was split into a separate project, please refer to the [xpra changelog](https://github.com/Xpra-org/xpra/blob/master/docs/CHANGELOG.md).
