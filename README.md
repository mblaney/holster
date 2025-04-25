Holster is a service that allows synchronising data between devices using
either [Node.js](https://nodejs.org) or the browser.

It is a port of [GunDB](https://gun.eco), following
[Porting Gun](https://github.com/gundb/port) and is firstly a Node.js
implementation which then uses [webpack](https://webpack.js.org) to build
browser versions.

Check out the [Github Wiki](https://github.com/mblaney/holster/wiki) for how
to get started using the API, and for more information.

### Quick Start

- Clone this repo and then run the server with `node src/index.js`.
- Open `file:///install-path/examples/index.html` in the browser.
- You will then also have access to the Holster API via the `holster` object in
the console.

### Development

- When modifying src files run: `npx prettier src --write && npm run build`
- When modifying tests run: `npx prettier test --write`
- To run the tests use: `npm run test`
