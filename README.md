Holster is a real-time data synchronisation service that connects devices using
Node.js, Deno, Bun or the browser. Built with ES modules, it features
end-to-end encryption, conflict resolution and cross-platform compatibility.

✨ Real-time sync across all connected devices\
🔐 Built-in encryption and user authentication\
📴 Local-first with offline support

Holster stores data locally by default - IndexedDB in the browser, and the
filesystem in Node.js, Deno or Bun - so reads and writes keep working without
a network connection. Writes made while offline are queued and automatically
sent once a connection to the network is available.

A build version of Holster is also provided in the npm package using
[esbuild](https://esbuild.github.io), to run in production.

Check out the [GitHub Wiki](https://github.com/mblaney/holster/wiki) for how
to get started using the API, or visit
[holster.haza.website](https://holster.haza.website) for examples.

### Quick Start

- Clone this repo

#### Then using Docker

- Run `docker build -t holster .` to build the image
- Run `docker run -p 3000:3000 -p 8765:8765 holster` to start the server

#### Or run locally

- Run `npm install`
- Run the server with `node src/index.js`

#### Once the server is running

- Open `http://localhost:3000/examples/index.html` in the browser.
- You will then also have access to the Holster API via the `holster` object in
  the console

### How to run a Holster relay

To run a Holster relay, create a `relay.js` file with:

```
import Holster from "@mblaney/holster/src/holster.js"
Holster({port: 8765})
```

That's all you need to run a server on port `8765`. You may also want to pass in
memory and storage options with larger values than the defaults, which are
conservative to support browser use. See [Holster options](https://github.com/mblaney/holster/wiki/Holster-API#holster-options) for more details. To run this
with node:

- `npm install @mblaney/holster`
- `node relay.js`

For production you can start with pm2:

- `npm install pm2 -g`
- `export NODE_ENV=production`
- `pm2 startup` (And follow startup instructions.)
- `pm2 start relay.js`
- `pm2 save`

To allow connections via a web server and to enable secure WebSockets see
[examples/apache.md](examples/apache.md).

Clients then connect by passing the relay's address as a peer:

```
import Holster from "@mblaney/holster/src/holster.js"
Holster("wss://your-relay-host")
```

If no peer is given, Holster defaults to `ws://localhost:8765`.

### Related packages

[holster-router](https://github.com/mblaney/holster-router) provides an Express
router for building web applications with Holster, including user account
management and email integration.

### Development

- When modifying files run: `npx prettier . --write`
- To run the JavaScript tests use: `npm run test`
- To run the TypeScript tests use: `npm run test:ts`
