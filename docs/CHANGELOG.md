# Changelog

All notable changes to this project will be documented in this file.

## [4.3] 2021-09-03
* build and packaging:
    * installation with python2 build environment
    * create symlinks for some fonts
    * more reliable git branch detection
* rencode packet encoder:
    * new, clean javascript implementation
    * remove workarounds for Safari, encryption, compression, etc
    * handle byte arrays natively without copying
* encryption:
    * support more AES modes: CBC, CFB and CTR
    * use secure random numbers
* core:
    * decode screen updates in a dedicated worker thread
      (except on Mobile devices due to strange compatibility issues)
    * switch to pure javascript lz4 implementation
      (fixes compatibility issues with browsers, encryption options, etc)
* geometry fixes:
    * option to adjust viewport to screen width via scaling
    * window visibility adjustements no longer snap to the sides
    * server errors for override-redirect windows offsets
    * try harder to get override-redirect windows to close
* keyboard:
    * don't show the on-screen keyboard on non-mobile devices
    * fix keyboard language to keymap matcher
    * Ukranian keyboard layout should use 'ua'
* re-connect:
    * don't start a new session when re-connecting
    * fix disconnections after re-connecting
    * don't try to reconnect when shutting down the server
* connect dialog:
    * start and start-desktop now work with or without command
    * missing session, category and command icons with latest google chrome
    * pass w3c validation without any warnings
* cosmetic:
    * notifications geometry and styling
    * scale window icons to fit in the title bar
    * use sans-serif font for window title
    * change titlebar focused / unfocused colours
    * make window corners round
    * try to scale application cursors to match window zoom
* misc:
    * fix zero-copy web worker regression from 4.2
    * use zero-copy for transferring audio buffers from the worker
    * audio debugging was wrongly enabled (extra CPU usage and lag)
    * remove http mp3 stream audio support
    * log disconnection messages
    * prevent console errors with Internet Explorer


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
