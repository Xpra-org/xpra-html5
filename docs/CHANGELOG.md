# Changelog

All notable changes to this project will be documented in this file.
## [19.0] 2025-10-24
- Build and packaging:
- New Features:
  - [better virtual monitor compatibility with newer servers](https://github.com/Xpra-org/xpra-html5/issues/267)
- Fixes:
  - handle decode worker initialization timeouts
- Cosmetic:

## [18.0] 2025-10-21
- Build and packaging:
  - RHEL 10 builds
  - DEB `Section` value
- New Features:
  - better compatibility with newer xpra versions, newer packet formats
  - add path to xpra URLs and connection files
  - improve crypto API handling and detection, support software fallback
  - control channel handlers
  - [toggle for top level widgets in floating menu](https://github.com/Xpra-org/xpra-html5/issues/389)
  - [cleanup resources on disconnect](https://github.com/Xpra-org/xpra-html5/issues/350)
  - use jpeg for desktop background
- Fixes:
  - [undecorated windows cannot be moved](https://github.com/Xpra-org/xpra-html5/commit/229ae72211bd714e64500aff68fb7967bfe607d8)
  - [video frames have padding](https://github.com/Xpra-org/xpra-html5/commit/ce3e0c5ca7c74f19748ad85b896e44337c542283), [prevent padding with images too](https://github.com/Xpra-org/xpra-html5/commit/2e93ae295167e887b86615db4709c1c288b1bc83)
  - pointer offset
  - [pointer relative coordinates](https://github.com/Xpra-org/xpra-html5/commit/63f7b9a02e3a11b107e29c5937cbc0aae8df1d2e)
  - [clipboard-direction ignored](https://github.com/Xpra-org/xpra-html5/commit/271326b70373182a5292abd0823adfd548ae0ed2)
  - [window title not trimmed](https://github.com/Xpra-org/xpra-html5/commit/0e50602f40e954061cd39acf69fd96094f7eb075)
  - window clipping calculations
  - decoding error handler fails to request a redraw
  - [Firefox offscreen decoding flickers](https://github.com/Xpra-org/xpra-html5/issues/393)
  - offscreen decode error stalled the decode queue
  - [remove the paint worker](https://github.com/Xpra-org/xpra-html5/issues/329)
  - fixup invalid refactoring
  - worker logging going nowhere
  - send keyboard events to the root window if that's all we have
  - `visibilitychange` must change the refresh-rate, not send power events
  - focus confusion
  - [missing window icons](https://github.com/Xpra-org/xpra-html5/commit/8f9a14cd13208e70d3292a77847a87d55fb1a9a9)
  - [windows can have multiple types](https://github.com/Xpra-org/xpra-html5/commit/aadf9b05dbc8a5e87a709c78d36449089de79968)
  - [DPI warning with newer servers](https://github.com/Xpra-org/xpra-html5/commit/19e35170e29bb13307b6c1bd56119b2fb56f9163)
- Cosmetic:
  - cleanups and linter warnings
  - stricter comparison operators
  - drop legacy fullscreen handlers

## [17.0] 2025-01-14
- Build and packaging:
  - [nodejs-less formatting script](https://github.com/Xpra-org/xpra-html5/pull/332)
  - [remove unused modules](https://github.com/Xpra-org/xpra-html5/pull/333)
  - [compatibility with newer build scripts require a repository target](https://github.com/Xpra-org/xpra-html5/commit/67e9bcbe5a6df1d21c2e455ae89711bbc0938b5c)
- New Features:
  - [gaming cursor mode](https://github.com/Xpra-org/xpra-html5/pull/335)
  - [use builtin browser crypto functions](https://github.com/Xpra-org/xpra-html5/issues/314)
  - [noVNC-style vertical retractable floating menu](https://github.com/Xpra-org/xpra-html5/pull/330)
- Fixes:
  - [missing start menu with some servers](https://github.com/Xpra-org/xpra-html5/commit/0aa77036fb9ffadff54aa98cc6d9d235d5531d08)
  - [horizontal scrolling was inverted](https://github.com/Xpra-org/xpra-html5/pull/331)
  - [keep modal windows on top](https://github.com/Xpra-org/xpra-html5/issues/336)
  - [offset in desktop mode](https://github.com/Xpra-org/xpra-html5/commit/f706e8f4f135663e6a8065c3eeabca9812c92661)
- Network:
  - [WebSocket connections linger and cause re-connect](https://github.com/Xpra-org/xpra-html5/issues/345)
  - [longer WebSocket connection timeout](https://github.com/Xpra-org/xpra-html5/commit/af1b036612609e2743b3c824ba3c2ea2211faf5f)
- Decoding:
  - [bump max video size when offscreen is actually used](https://github.com/Xpra-org/xpra-html5/commit/69faf56c5fd11b15087334c1b1f54eefd486e854)
  - [honour offscreen toggle](https://github.com/Xpra-org/xpra-html5/commit/345d3d228d796afabbc19e451fce6158ab0583a70), [override detection](https://github.com/Xpra-org/xpra-html5/commit/e74030354f74f844c07da405bc7acdb04aff2dcb)
  - [try to fallback to client decoding when worker fails](https://github.com/Xpra-org/xpra-html5/commit/345d3d228d796afabbc19e451fce6158ab0583a7)
  - [disable decode worker zero-copy on errors](https://github.com/Xpra-org/xpra-html5/commit/194cbbf7bade77a1730a08521704d28600b0ee03)
  - [errors when debug logging is enabled](https://github.com/Xpra-org/xpra-html5/commit/bbc3fc3a670055bbdc1f61ba89f1e4d262e9fdf4)
- Connect dialog:
  - [update 'offscreen' availability when `ssl`](https://github.com/Xpra-org/xpra-html5/commit/988b1509c14d8f24428ac13d2ad451ca211c8891) [is toggled](https://github.com/Xpra-org/xpra-html5/commit/d75129ac69870a0c068430a0c29c5e5695a6028a)
  - [consistent and less ugly font](https://github.com/Xpra-org/xpra-html5/pull/346)
- Minor:
  - [fail fast if `rencodeplus` packet encoder is missing](https://github.com/Xpra-org/xpra-html5/commit/a0256fc3a43a18ea30a56cbeaac81d3dc7023c16)
  - [don't send clipboard packets to servers that don't want them](https://github.com/Xpra-org/xpra-html5/commit/20094daaf1b98d03619b50670903daffe3919139)
  - [restrict allowed characters](https://github.com/Xpra-org/xpra-html5/commit/a178df013ca5c5d8f60278c4c26f9b82c7f94629)
  - [prevent the float menu from overflowing](https://github.com/Xpra-org/xpra-html5/pull/352)
- Cosmetic:
  - [float menu keyboard icon not changing colours](https://github.com/Xpra-org/xpra-html5/commit/95b3cdbd5515f6b3d4f7c31244c283bc53f35e3f)
  - [hide start menu when there are no entries](https://github.com/Xpra-org/xpra-html5/pull/334)
  - [undo formatting mess](https://github.com/Xpra-org/xpra-html5/commit/9e30e97b4efcdde481166043679d962fa76484ab)
  - [code move](https://github.com/Xpra-org/xpra-html5/commit/b09b8bb1c7f4b689b8413cb1ba9cf382fdabf76c) [and refactoring](https://github.com/Xpra-org/xpra-html5/commit/75b55513a6f4ee32073127e1a1210dc0caef4e3b)
  - [remove unused icons](https://github.com/Xpra-org/xpra-html5/commit/2b2cb3c0c5e2c881aada96c447917d95356a1e8f), [update ancient 'Material' icons](https://github.com/Xpra-org/xpra-html5/commit/f4fa5c9bd815acd0ec0164b40785049e76b04f9a)
  - [remove redundant check](https://github.com/Xpra-org/xpra-html5/pull/348)
  - [remove legacy headers](https://github.com/Xpra-org/xpra-html5/pull/351)
  - [workaround ugly Chrome obfuscation](https://github.com/Xpra-org/xpra-html5/commit/c6a04b7cabd059785439382052b6ad1704579327)
  - [remove legacy bootstrap](https://github.com/Xpra-org/xpra-html5/commit/26b1b8549bcb8bdf08a46a5faafbd8f2c4930567)
  - [session info box not big enough](https://github.com/Xpra-org/xpra-html5/pull/343)

## [16.0] 2024-09-09
- [retry WebSocket connection](https://github.com/Xpra-org/xpra-html5/commit/8614719f724b06ce99a9fb1f3093464274ad5d25)
- [ping packets not sent](https://github.com/Xpra-org/xpra-html5/commit/4f148c36a363b4cb2b0fe3fb2daa59ebe8568b7d)
- [honour preferred clipboard format](https://github.com/Xpra-org/xpra-html5/commit/c90e479d973c665e6cc9900a8caf66f5773f0c58)
- [desktop session parsing error](https://github.com/Xpra-org/xpra-html5/commit/f3858c4725b572877deccf3bf327e593c3f99b00)
- [more readable session description](https://github.com/Xpra-org/xpra-html5/commit/68d31a8c4d4cfa761c911e22444d1af08ca1b724)
- [regular expression parsing error](https://github.com/Xpra-org/xpra-html5/commit/1cabbad0793fa690b0395429fab66fd7cfaad5c2)

## [15.1] 2024-08-21
- [syntax error](https://github.com/Xpra-org/xpra-html5/commit/11909d82d71f4461508527d8ff3a11abbc336cad)

## [15.0] 2024-07-31
- [try harder to prevent password input with insecure settings](https://github.com/Xpra-org/xpra-html5/commit/5425c1a856badf46d9727cba585b8ab9c1a0e735) [but also allow password input with 'insecure' option](https://github.com/Xpra-org/xpra-html5/commit/bebca925ef289342d5af44ef203fb3498b31c9ed)
- [honour preferred clipboard format](https://github.com/Xpra-org/xpra-html5/commit/c5c8cf6de46633cca45a2df8dce8d02f38e0ed16)

## [14.0] 2024-07-02
- security fixes:
  - [prevent XSS from server menu data](https://github.com/Xpra-org/xpra-html5/commit/dab26753459258258e2958d507f072595129838a) - low concern
  - [always reject insecure xor digest](https://github.com/Xpra-org/xpra-html5/commit/ccea3a180cd8111eccf4db31fbd8722c55299b56)
- major features:
  - [WebTransport](https://github.com/Xpra-org/xpra-html5/issues/143)
- bug fixes:
  - [`text/plain` as default clipboard preferred format](https://github.com/Xpra-org/xpra-html5/commit/aad8e6c116089180eee60f200b11e8301a5cd915)
  - [preserve disconnection message when failing early](https://github.com/Xpra-org/xpra-html5/commit/ee17975b7768d815396cd0b8d867e83d7d2a40eb)
  - [show `insecure` checkbox for all insecure connections](https://github.com/Xpra-org/xpra-html5/commit/aaa33be56c64823d245b9ff2ba4f4cd26dfa83ac), [but not for `localhost`](https://github.com/Xpra-org/xpra-html5/commit/149eb5f600796687ec3912b575c549926630c5cf)
- authentication:
  - [fail fast if digest is unsafe](https://github.com/Xpra-org/xpra-html5/commit/14a74259ee1716c53140afaf8c886fa6c87180d1)
  - [restoring tab does not prompt for authentication](https://github.com/Xpra-org/xpra-html5/issues/308) 
  - [show keyboard focus on the password prompt dialog](https://github.com/Xpra-org/xpra-html5/commit/b3d8b5ba89f9fbf1c6f5c0b3855d9de37c2995a4)
  - [trigger login with keyboard focus](https://github.com/Xpra-org/xpra-html5/commit/50297b773c9d740f4e7df0b323ceddd9202c5440)
- modernization:
  - [remove more IE compatibility workarounds](https://github.com/Xpra-org/xpra-html5/commit/f071b44a6111cb60b4a98f94a5844fa1fad3c5e7), [everywhere](https://github.com/Xpra-org/xpra-html5/commit/a3fbe72f202e71ac7b0d769a0db133b6d69c004c)
- cleanups and cosmetic: too many to list them all
  - [highlight invalid endpoint](https://github.com/Xpra-org/xpra-html5/commit/a25c2d69370662961b123a82b93bcaf44c9b0372)
  - [constify](https://github.com/Xpra-org/xpra-html5/commit/bbf2dfbc9c0b31ad7bc1243f207b0e080c5fa8da)

## [13.0] 2024-05-23
- bug fixes:
  - [do increase video size with offscreen decoding](https://github.com/Xpra-org/xpra-html5/commit/69c4e7d36ba1dca420f7b4e07224133b20298489) + [fixup](https://github.com/Xpra-org/xpra-html5/commit/eb9cb20b568a3ef18e7a73c1b0af597ea212a326)
  - [URL parameters ignored](https://github.com/Xpra-org/xpra-html5/commit/864dc00808c6caab238578919cc2442488d4c9cf) + [fixup](https://github.com/Xpra-org/xpra-html5/commit/c07629f9383dafffbcd146747ffc647c50f4c336), and [another](https://github.com/Xpra-org/xpra-html5/commit/7f3aa77e69eb4822d40490dc31f21f2fcbee9816) and [another](https://github.com/Xpra-org/xpra-html5/commit/81692ba11c34da0968e9c8f72119f7831b944b62)
  - [file downloads corrupted](https://github.com/Xpra-org/xpra-html5/commit/0ce0a70bdaf383e539d0e90fb701c241dc91c1dd)
  - [URL forwarding not enabled](https://github.com/Xpra-org/xpra-html5/commit/b68ca432d2743732ae653340a2932dea03740cca)
  - handling of [connection URIs](https://github.com/Xpra-org/xpra-html5/commit/529e2932a2704e921b6b4833451b85af52bba13b) and session files: [syntax mismatch](https://github.com/Xpra-org/xpra-html5/commit/02eace0c88b4a76b8c2d8102fc4d2cf525e26fe9), [include display number](https://github.com/Xpra-org/xpra-html5/commit/877bf364a43f9eb3126fa18e7e5c728b3c5bc09f), [skip default values](https://github.com/Xpra-org/xpra-html5/commit/b2c8207f85a1a9c13a6266527feb599cd196e5f0), [boolean options not saved correctly](https://github.com/Xpra-org/xpra-html5/commit/e8f32e861c0b730c233447a1df806b9b4891583d)
- clipboard:
  - [let users choose the preferred clipboard format](https://github.com/Xpra-org/xpra-html5/commit/124f57eaf4f52603bc4c5e9470e947b1afe87d2f)
  - [disable polling with Safari and Firefox](https://github.com/Xpra-org/xpra-html5/commit/8f8de0dd89017c9b3f377a5117ffc108579f8fb4)
  - [add manual clipboard synchronization button](https://github.com/Xpra-org/xpra-html5/commit/22940880a50764b8e3c3631ebc80c9ad38a70cd2), [make space for it in the top bar](https://github.com/Xpra-org/xpra-html5/commit/0b6a09260adbf4d4d40c83a268c5ef195273b269)
  - [`text/html` not copied](https://github.com/Xpra-org/xpra-html5/commit/085e0df8fde96ca96611932d33ee93577221e6a8)
  - [add test page](https://github.com/Xpra-org/xpra-html5/commit/68f6b36fb76d49825a2771161e2145c63b9e8cee), [add more tools to it](https://github.com/Xpra-org/xpra-html5/commit/f709521eff573b5171fee5dfbd8f3f77ea541c93)
- features:
  - [trigger file download from server via file chooser](https://github.com/Xpra-org/xpra-html5/commit/674a4004e0ce8c0b81f68f599274352f967ab44a)
  - [show some server information](https://github.com/Xpra-org/xpra-html5/commit/c625024513748664144d79c38cb6788e40c6e6d8)
- cleanups and cosmetic:
  - [button shows action currently selected](https://github.com/Xpra-org/xpra-html5/commit/79251852de3b7e09167fa840a095993c5c5635e8)
  - [simplify](https://github.com/Xpra-org/xpra-html5/commit/551452526bf7c8d39382aeb1d321724052c19ed4)
  - [remove redundant statement](https://github.com/Xpra-org/xpra-html5/commit/0a1a10c906563b8573b0f308e8466b015e5ae919)
  - [remove outdated docstring](https://github.com/Xpra-org/xpra-html5/commit/71d8ad39a765d19031705f89af6da5c89f0e060a)
  - [installation script supports individual info commands](https://github.com/Xpra-org/xpra-html5/commit/1cbc65c8f4a3e7a49ff979d9b253539d540cd37a)
  - [ignore whitespace when updating vcs info](https://github.com/Xpra-org/xpra-html5/commit/c22bd46eef159acd8f75681ccfe8d655c2d099e0)
  - [remove pointless line wrapping](https://github.com/Xpra-org/xpra-html5/commit/eb54346a9779a721fd69d96b7bf69f77314edaaf), [bad automated formatting](https://github.com/Xpra-org/xpra-html5/commit/2d2a19a5dba1b67b6635cd168bdacca6f10bbba9), [improve readability](https://github.com/Xpra-org/xpra-html5/commit/cffed14e08fb296cdd071497ffd399ce987e5719)

## [12.0] 2024-03-29
- [keycloak authentication fails](https://github.com/Xpra-org/xpra-html5/commit/d09a0b2170c3f93319a5ce0984f57f12794617ca)
- [connect page forgetting all settings](https://github.com/Xpra-org/xpra-html5/commit/3fccccb2ee4098fef77116c8ddf8cf813dfbc03b)
- [bug report tool error](https://github.com/Xpra-org/xpra-html5/commit/bc83f23390956b2590fb843275ffe6e4c88f7698)
- [support custom minifier command](https://github.com/Xpra-org/xpra-html5/commit/1789bb05cf96ba6f864c9a50f0eb4458ee0c013e)
- [build fix when using github source archives](https://github.com/Xpra-org/xpra-html5/commit/20dddce76047ee95fcdc3d2b57672429951ab38b)
- [send relative pointer coordinates when available](https://github.com/Xpra-org/xpra-html5/commit/c43ef8af5faed1cda99a44fad9e13a9efa9e09ca)
- [remove legacy 'wheel' workarounds](https://github.com/Xpra-org/xpra-html5/commit/047f32f7c097fc143fffde636499639da231d4de)
- [remove unused function](https://github.com/Xpra-org/xpra-html5/commit/a1c1d39fadb6cf7042fa9ffb25049e54976fa386)

## [11.0] 2024-01-31
- [more consistent positioning of fullscreen windows](https://github.com/Xpra-org/xpra-html5/commit/be43532f1637b315466289154b387f48db7a9a0b)
- [prefix the `sessionStorage` data with pathname](https://github.com/Xpra-org/xpra-html5/commit/b944a32f4b3a1394e092095e6ab57d575b764307)
- [Safari does not support offscreen decoding](https://github.com/Xpra-org/xpra-html5/commit/32611a767bc1467b7e64246d25856538a1773fe7), [stop saying that it does](https://github.com/Xpra-org/xpra-html5/commit/0fefac217a6373f39e492b94f82242ed2da10652)
- [Chrome now requires https to enable offscreen decoding](https://github.com/Xpra-org/xpra-html5/commit/52742e3f78fee5c098778f68094f7c58e603f22a)
- [missing window icons](https://github.com/Xpra-org/xpra-html5/commit/931bdbae00d52e94fea444acdd3f120562f47895)
- Clipboard: [`unescape` plain text clipboard data](https://github.com/Xpra-org/xpra-html5/commit/922c36723daea1476a1ec289312773bb24404017), [copy `text/html` to the server](https://github.com/Xpra-org/xpra-html5/commit/75652df303c3f3ebd3b10b3deb3f0972391a6be7) and [from the server](https://github.com/Xpra-org/xpra-html5/commit/75ee107b07c31e0ea95e19ad23d9379069442bef)
- improve compatibility with server versions: [continue to enable pings](https://github.com/Xpra-org/xpra-html5/commit/a2c6626617406845a8ba618c67ce1a469c81fc7e), [dynamic menus](https://github.com/Xpra-org/xpra-html5/commit/f511841404a8acad14e53ebb30e1d5701666bb5b), [request start menu data](https://github.com/Xpra-org/xpra-html5/commit/3e031265a27b0ad0b2e6e727ed899e47f00b68c1)
- [don't show the clock menu entry until we have the time](https://github.com/Xpra-org/xpra-html5/commit/7cde1e1d82ce372d128cc80eb2a21bf48b0894c2)
- [audio state not updated](https://github.com/Xpra-org/xpra-html5/commit/be106513d006c902b6dd40350d510ad063a30e1d)
- code cleanups: [simplify](https://github.com/Xpra-org/xpra-html5/commit/3caaee5581567c75be791f122364b30aa7629af7), [remove MSIE workarounds](https://github.com/Xpra-org/xpra-html5/commit/f4323d6dbead27d1d539309111992845e1cad1ae)
- [build with newer python versions via setuptools](https://github.com/Xpra-org/xpra-html5/commit/f33d7c4c89f663e9d8b08ff95099fdab8085ab38) and [update the build dependencies](https://github.com/Xpra-org/xpra-html5/commit/cf5df50986f12d44f20604cb147f1b2d89edfc71)
- [minor build file linter warnings](https://github.com/Xpra-org/xpra-html5/commit/b6bd816c80d0771d9d7d9b687ae2d5ea03870085) [whilst preserving backwards compatibility](https://github.com/Xpra-org/xpra-html5/commit/e384d3ff64c3362a1ae11c79e90ce0a29c8b157f)
- [detect minifier, default to 'copy' if not found](https://github.com/Xpra-org/xpra-html5/commit/b04f11622218f809f9a4055c93d56ba08257afbe)
- [automatic release number generation string format](https://github.com/Xpra-org/xpra-html5/commit/6eabfae5c75befd385780fe8d9b6fc26b206bee1)

## [10.0] 2023-10-16
- update libraries: [jquery v3.7.1](https://github.com/Xpra-org/xpra-html5/commit/b7ca50be7b90de1657817f6685a0eb956fe99669), [jquery ui v1.13.2](https://github.com/Xpra-org/xpra-html5/commit/b503697e2420c070d2e6441e18e100e2586dade3)
- [move some encoding attributes to default settings](https://github.com/Xpra-org/xpra-html5/commit/431276b92cdef468c28c07c4c645cf79c051fd9c), [support more encoding attributes](https://github.com/Xpra-org/xpra-html5/commit/a64a7da357232c15e06f3c2d3ee5c06de71f5378)
- [simplify parameter parsing](https://github.com/Xpra-org/xpra-html5/commit/b370a42812e48958c26ac31f6cf5b6efb3c85770)
- [structured capabilities](https://github.com/Xpra-org/xpra-html5/commit/a6a8f598bdb357d268800e8ab429d18ccf3c3855) and [more readable](https://github.com/Xpra-org/xpra-html5/commit/fd135129ea5541164b84cbd051a994b331498a18)
- cosmetic: [debug logging](https://github.com/Xpra-org/xpra-html5/commit/4a6e0f1333508425b0acfbff23be608945ef7bb9), [whitespace](https://github.com/Xpra-org/xpra-html5/commit/a70464f3c347840025afb1feefad52965f1abd43)

## [9.0] 2023-08-27
- [support only xpra v5](https://github.com/Xpra-org/xpra-html5/issues/262)
- [windows that shouldn't be collapsible can be collapsed but not restored back](https://github.com/Xpra-org/xpra-html5/issues/240)
- [Unicode clipboard transfers](https://github.com/Xpra-org/xpra-html5/pull/259)
- [fix keyboard modifiers mapping](https://github.com/Xpra-org/xpra-html5/commit/46820f3cfac28fd1adb7e3f94fffb5f4823c3082)
- [allow spaces in passwords](https://github.com/Xpra-org/xpra-html5/commit/cd0de67cbf9dbb13cf7dfbf2a23945c1c4ea6b10)
- [safari doesn't draw the window](https://github.com/Xpra-org/xpra-html5/issues/227)
- [enable offscreen rendering with Firefox and Safari](https://github.com/Xpra-org/xpra-html5/commit/89a60618183ee36b2e79acf3f4eabcf0463bdbd2)
- [require less CPU but more bandwidth](https://github.com/Xpra-org/xpra-html5/commit/f133a43c35f797e7a5601ee3e3c348d6de6ee146)
- [use relative path for icons](https://github.com/Xpra-org/xpra-html5/commit/da3f0d41a35e557ea54436081a95499cc1249996)
- [more robust value parsing](https://github.com/Xpra-org/xpra-html5/commit/a67f9257535d68a1b5ed415b6e1965e04b4fdbcc)
- [dependencies cleanup](https://github.com/Xpra-org/xpra-html5/pull/257)


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
