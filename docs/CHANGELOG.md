# Changelog

All notable changes to this project will be documented in this file.

## [8.0] 2023-05-06
- [disable scroll encoding with offscreen decode worker](https://github.com/Xpra-org/xpra-html5/commit/e73861dc4750162c1905ae6bf773c74b9c63646d)
- [screenshots cannot be used with the offscreen api](https://github.com/Xpra-org/xpra-html5/commit/231589217059dcdc7c06010d1c058305a8c7c2c2)
- don't close windows [when re-connecting](https://github.com/Xpra-org/xpra-html5/commit/79ceb55b317a1c52973d83f31a3148a348e6f877) or [when closing the browser window](https://github.com/Xpra-org/xpra-html5/commit/640ee6d81ea4f0a1d49689e6974f16c2ace0f5c6)
- [closing windows is only a request](https://github.com/Xpra-org/xpra-html5/commit/8d67e87adf64f5ecd4cbfc9580c402f583f10960), [even from the menu](https://github.com/Xpra-org/xpra-html5/commit/d08f98ce20778a1dcedf26d8c003967c631b5269)
- hide options when they are not available: [`shutdown`](https://github.com/Xpra-org/xpra-html5/commit/b30082d2dee31ba4ae21e14762ff72cb9c565b96) and [`file upload`](https://github.com/Xpra-org/xpra-html5/commit/8c36971731e82050b49f11e41329c7a7552615e0)
- [remote logging arguments missing](https://github.com/Xpra-org/xpra-html5/commit/53234fbd8476600df7f4606e061d956697d6b610)
- [fix initiate-move-resize](https://github.com/Xpra-org/xpra-html5/commit/e7d1a6efbdc0b7e37d8c0eb3452d6ac662fd604e)
- cursor fixes: [cursor updates](https://github.com/Xpra-org/xpra-html5/commit/7ac5d41dd1b5b5987134a93eb35b93b78714dea5), [geometry](https://github.com/Xpra-org/xpra-html5/commit/29685b3e21b27476f56caf4539509bc0a48f795e)
- [fix vertical scroll reverse](https://github.com/Xpra-org/xpra-html5/commit/caa851d4d8540cd20e7cdf800bbc131b60f723f6)
- minor cleanups: [unused variables](https://github.com/Xpra-org/xpra-html5/commit/b6fb4b44e47930f9ced2384eec17994aec79e484), [unused function](https://github.com/Xpra-org/xpra-html5/commit/f143cf43234b22c5826f8d90e70343ae8461ac5f), [unused statements](https://github.com/Xpra-org/xpra-html5/commit/bb24f0b413aaf4083cd6536eee31efc7b8a20d16), [document empty functions](https://github.com/Xpra-org/xpra-html5/commit/f4e07565c6829e37b7fcdde1a5dc6b9d523e1886), [linter cleanup](https://github.com/Xpra-org/xpra-html5/commit/1fe68b2d04f5cafe324ee6b6163e8c1271807741), [use a more correct datatype](https://github.com/Xpra-org/xpra-html5/commit/176cf754e3e260438162d48bcb19619d24d8cbde), [improved syntax](https://github.com/Xpra-org/xpra-html5/commit/6b5dfbdf409d47ac16854a1883b2bafcab062ac6), [use the preferred keywords for variable declaration](https://github.com/Xpra-org/xpra-html5/commit/9a7687f36eb7d203d0bec21d35d4e8b907e6732d)

## [7.0] 2023-03-12

- [unable to move undecorated / CSD windows](https://github.com/Xpra-org/xpra-html5/issues/210)
- [throttle video decoder to prevent flooding](https://github.com/Xpra-org/xpra-html5/commit/8ed5af60d4a0919422bf1006abc3b557f9c0d650)
- [disable offscreen decode worker with Firefox to prevent flickering](https://github.com/Xpra-org/xpra-html5/commit/07ac69ea34751d52a6e9520d29fd9bc66ccb5e44)
- [workaround for setuptools breakage in version 61 and later](https://github.com/Xpra-org/xpra-html5/commit/017148e0cefa020b9b0a7590b0bb5637c68b4888)
- [native video decoding is fast enough not to require much downscaling](https://github.com/Xpra-org/xpra-html5/commit/ed4b0d72f40864cea4fb4b91b5c400085eb44fa8)
- [propagate error messages](https://github.com/Xpra-org/xpra-html5/commit/8a11f5230a2657bb40d91f31ce515d1be325386b)
- [truncate large clipboard buffers in log messages](https://github.com/Xpra-org/xpra-html5/commit/2038a3d6d5b24498db5496def57b7eca315b0000)
- [`scroll` draw packets can hang the connection](https://github.com/Xpra-org/xpra-html5/issues/217)
- [disable VP9, prefer h264](https://github.com/Xpra-org/xpra-html5/commit/4d06ef7c96f68bee3bde39e4815c0c8825fdc936) / [remove vp9](https://github.com/Xpra-org/xpra-html5/commit/017ffd205fe98f013998632b1e294e751a91ab9d)
- [spurious audio stop errors](https://github.com/Xpra-org/xpra-html5/commit/fc35147cb1e6107436d57f223cd56395f69e5cc6)
- [make stream download URL easier to embed](https://github.com/Xpra-org/xpra-html5/commit/953523e66c1a2e16d9ae1d4c67e070f0e95f9ad6)
- [missing scroll wheel events](https://github.com/Xpra-org/xpra-html5/commit/ff246e3bd05a6fb51f3099f578452d2fa90e1c72)
- [avoid errors if the window's title is unset](https://github.com/Xpra-org/xpra-html5/commit/3cda0e8864d1cf341b8e5f7bf36b3bb7d97d5667)
- [remove support for software video decoding](https://github.com/Xpra-org/xpra-html5/commit/dfc60dbec94a39e28ec9e14acd476631fa2ccd13)
- [don't enable clipboard with Safari and SSL](https://github.com/Xpra-org/xpra-html5/issues/226)
- [provide more useful screen name to the server](https://github.com/Xpra-org/xpra-html5/commit/1661e424fb510390938c058bd5856c215a938d6a)
- [cursor display and scaling issues](https://github.com/Xpra-org/xpra-html5/commit/96132fa6791e1890b344ad910a190ad9cfd421b4)
- [workaround for older versions of Safari](https://github.com/Xpra-org/xpra-html5/commit/8b8cdd32d939c8bdaf6b54b7578ff9c5f88ee3d7)
- [audio metadata corruption](https://github.com/Xpra-org/xpra-html5/commit/01714767bec0aac5ed17ee00c2ab6b4de254d2c1)

## [6.0] 2022-10-15

- refactorings, cleanups, github CI, etc - JanCVanB
- [split decode from paint](https://github.com/Xpra-org/xpra-html5/pull/202) - TijZwa
- [experimental native decoding](https://github.com/Xpra-org/xpra-html5/pull/200) - TijZwa
- [require ES6](https://github.com/Xpra-org/xpra-html5/issues/175)
- [support `hjsmin` minifier](https://github.com/Xpra-org/xpra-html5/pull/174) - arrowd
- [updated installer script](https://github.com/Xpra-org/xpra-html5/issues/190)
- [support for chunked file transfers of large files](https://github.com/Xpra-org/xpra-html5/issues/120)
- [modal windows should not be minimized](https://github.com/Xpra-org/xpra-html5/issues/204)
- move to structured `hello` packet data

## [5.0] 2022-05-11

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

## [4.5.2] 2021-12-17

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

## [4.5.1] 2021-09-23

- workaround Firefox bug in image decoder
- allow AES and SSL to be combined
- support multiple authentication challenges

## [4.5] 2021-09-15

- prompt for passwords
- fix AES errors when connecting via the dialog

## [4.4] 2021-09-03

- encryption:
  - support more AES modes: CBC, CFB and CTR
  - use secure random numbers
- core:
  - decode screen updates in a dedicated worker thread
    (except on Mobile devices due to strange compatibility issues)
  - switch to pure javascript lz4 implementation
    (fixes compatibility issues with browsers, encryption options, etc)
- misc:
  - notifications geometry and styling
  - fix zero-copy web worker regression from 4.3
  - use zero-copy for transferring audio buffers from the worker

## [4.3] 2021-08-10

- build and packaging:
  - installation with python2 build environment
  - create symlinks for some fonts
  - more reliable git branch detection
- rencode packet encoder:
  - new, clean javascript implementation
  - remove workarounds for Safari, encryption, compression, etc
  - handle byte arrays natively without copying
- geometry fixes:
  - option to adjust viewport to screen width via scaling
  - window visibility adjustements no longer snap to the sides
  - server errors for override-redirect windows offsets
  - try harder to get override-redirect windows to close
- keyboard:
  - don't show the on-screen keyboard on non-mobile devices
  - fix keyboard language to keymap matcher
  - Ukranian keyboard layout should use 'ua'
- re-connect:
  - don't start a new session when re-connecting
  - fix disconnections after re-connecting
  - don't try to reconnect when shutting down the server
- connect dialog:
  - start and start-desktop now work with or without command
  - missing session, category and command icons with latest google chrome
  - pass w3c validation without any warnings
- cosmetic:
  - scale window icons to fit in the title bar
  - use sans-serif font for window title
  - change titlebar focused / unfocused colours
  - make window corners round
  - try to scale application cursors to match window zoom
- misc:
  - audio debugging was wrongly enabled (extra CPU usage and lag)
  - remove http mp3 stream audio support
  - log disconnection messages
  - prevent console errors with Internet Explorer

## [4.2] 2021-05-18

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

## [4.1.2] 2021-04-01

- more build and packaging fixes

## [4.1.1] 2021-03-29

- minor packaging fixes

## [4.1] 2021-03-28

- open print dialog
- added documentation (installation, connection options, authentication, etc)
- build option for platforms without any minifiers
- add on screen keyboard
- better connection diagnostic messages
- download connection files and generate connection URIs
- support for rgb24 pixel encoding

### Changed

- now packaged separately from the main xpra packages

---

For earlier versions, before `xpra-html5` was split into a separate project, please refer to the [xpra changelog](https://github.com/Xpra-org/xpra/blob/master/docs/CHANGELOG.md).
