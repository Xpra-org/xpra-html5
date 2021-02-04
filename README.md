# HTML5 client for Xpra

Simply point your browser to the contents of the `html5` folder,
and you will get an HTML5 client which you can use to connect to
any [xpra](https://github.com/Xpra-org/xpra) server.

This client is usually packaged as `xpra-html5`
and the xpra server will normally pick it up automatically
so that you can access it using the builtin web server.

# Installation
```
git clone https://github.com/Xpra-org/xpra-html5
python3 ./setup.py install /usr/share/www/xpra
```
To install with Nginx or Apache, you may need to change the installation path to something like `/var/www/html/`.

# Configuration
Most common options can be specified from the connect dialog
form, which is found at `/connect.html`.\
Failures to connect to a server from the default page should redirect there automatically.

These options can also be specified as URL parameters. ie:
```
http://localhost:14500/?username=foo&keyboard_layout=fr
```

# Authentication
Some browsers have security features which may remove the `password`
from the URL parameters.\
This can be worked around by:
* using a secure `https` connection.
* using Javascript to keep the password value client side in
the browser's [`sessionStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage) area,
just like the default connect page does.

If the authentication module used by the xpra server supports it,
authentication is done using [HMAC](https://en.wikipedia.org/wiki/HMAC) with a strong
hash functions (`SHA256` or better), which means that the actual password is never sent
to the xpra server.